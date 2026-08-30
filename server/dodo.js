const express = require('express');
const router = express.Router();
const { DodoPayments } = require('dodopayments');
const { db } = require('./db');
const { requireUser } = require('./auth');
const integrations = require('./integrations');

// ── Dodo Client ────────────────────────────────────────────────
function getDodoClient() {
    const apiKey = integrations.get('integ.dodo.api_key');
    if (!apiKey) return null;
    return new DodoPayments({
        bearerToken: apiKey,
        environment: 'live_mode'
    });
}

function requireDodoConfig(req, res, next) {
    if (!getDodoClient()) {
        return res.status(503).json({ error: 'Dodo Payments not configured' });
    }
    next();
}

// ── Constants ──────────────────────────────────────────────────
const PLAN_PRICE_DISPLAY = '$6/mo';
const PLAN_ID = 'pro_monthly';

// ── Plans endpoint ─────────────────────────────────────────────
router.get('/plans', requireDodoConfig, (req, res) => {
    res.json({
        available: true,
        plans: [{ id: PLAN_ID, display: PLAN_PRICE_DISPLAY }]
    });
});

// ── Create Checkout Session ────────────────────────────────────
// Requires authenticated user. Never trusts price/product from frontend.
router.post('/create-checkout', requireUser, requireDodoConfig, async (req, res) => {
    try {
        const client = getDodoClient();
        const user = db.prepare('SELECT id, email, display_name FROM users WHERE id = ?').get(req.user.id);
        if (!user) return res.status(400).json({ error: 'User not found' });

        const productId = integrations.get('integ.dodo.product_id');
        if (!productId) {
            return res.status(500).json({ error: 'Dodo Product ID not configured' });
        }

        const baseUrl = process.env.PUBLIC_BASE_URL || (req.protocol + '://' + req.get('host'));

        const session = await client.checkoutSessions.create({
            billing: {
                city: '',
                country: '',
                state: '',
                street: '',
                zipcode: ''
            },
            customer: {
                email: user.email,
                name: user.display_name || 'User'
            },
            product_cart: [
                {
                    product_id: productId,
                    quantity: 1
                }
            ],
            metadata: {
                userId: req.user.id.toString(),
                product: 'kotha_pro'
            },
            return_url: `${baseUrl}/app?payment_return=1`
        });

        const checkoutUrl = session.checkout_url || session.url;
        if (!checkoutUrl) {
            console.error('Dodo checkout response missing URL:', JSON.stringify(session));
            return res.status(500).json({ error: 'Checkout creation failed — no redirect URL' });
        }

        res.json({ url: checkoutUrl });
    } catch (err) {
        console.error('Dodo checkout error:', err?.message || err);
        res.status(500).json({ error: 'Checkout creation failed' });
    }
});

// ── Payment/Subscription Status ────────────────────────────────
// Returns the authenticated user's current payment state.
router.get('/status', requireUser, (req, res) => {
    const user = db.prepare(`
        SELECT plan, subscription_status, dodo_subscription_id, dodo_customer_id,
               current_period_start, current_period_end, cancel_at_period_end
        FROM users WHERE id = ?
    `).get(req.user.id);

    if (!user) return res.status(404).json({ error: 'User not found' });

    // Get latest payment record
    const lastPayment = db.prepare(`
        SELECT amount, currency, status, created_at
        FROM payments WHERE user_id = ? AND provider = 'dodo'
        ORDER BY created_at DESC LIMIT 1
    `).get(req.user.id);

    res.json({
        plan: user.plan === 'paid' ? 'kotha_pro' : user.plan,
        status: user.subscription_status || 'none',
        subscription_id: user.dodo_subscription_id || null,
        current_period_end: user.current_period_end || null,
        cancel_at_period_end: !!user.cancel_at_period_end,
        last_payment: lastPayment ? {
            amount: lastPayment.amount,
            currency: lastPayment.currency,
            status: lastPayment.status,
            date: lastPayment.created_at
        } : null
    });
});

// ══════════════════════════════════════════════════════════════
//  WEBHOOK HANDLER
// ══════════════════════════════════════════════════════════════

async function webhookHandler(req, res) {
    const webhookSecret = integrations.get('integ.dodo.webhook_secret');
    if (!webhookSecret) return res.status(400).send('Webhook secret not configured');

    const client = getDodoClient();
    if (!client) return res.status(400).send('Dodo client not configured');

    // ── Verify signature ──────────────────────────────────────
    let event;
    try {
        event = await client.webhooks.unwrap(req.body, req.headers, webhookSecret);
    } catch (err) {
        console.error(`Webhook signature verification failed: ${err.message}`);
        return res.status(400).send('Webhook signature verification failed');
    }

    // ── Idempotency check ─────────────────────────────────────
    const webhookId = req.headers['webhook-id'] || req.headers['x-webhook-id'] || null;
    if (webhookId) {
        const existing = db.prepare('SELECT event_id FROM webhook_events WHERE event_id = ?').get(webhookId);
        if (existing) {
            // Already processed this exact webhook — return 200 to acknowledge
            return res.json({ received: true, duplicate: true });
        }
    }

    // ── Process event ─────────────────────────────────────────
    try {
        const payload = event.data || event;
        const type = event.type;

        console.log(`[Dodo Webhook] ${type}${webhookId ? ' id=' + webhookId : ''}`);

        // Extract userId from metadata
        let userId = null;
        if (payload.metadata && payload.metadata.userId) {
            userId = parseInt(payload.metadata.userId, 10);
        }

        switch (type) {
            // ── Payment events ────────────────────────────────
            case 'payment.succeeded': {
                if (userId) {
                    grantPro(userId, payload);
                    recordPayment(userId, payload, 'success');
                }
                break;
            }
            case 'payment.failed': {
                if (userId) {
                    recordPayment(userId, payload, 'failed');
                }
                break;
            }
            case 'payment.processing': {
                if (userId) {
                    recordPayment(userId, payload, 'processing');
                }
                break;
            }
            case 'payment.cancelled': {
                if (userId) {
                    recordPayment(userId, payload, 'cancelled');
                }
                break;
            }

            // ── Subscription events ───────────────────────────
            case 'subscription.active': {
                if (userId) {
                    grantPro(userId, payload);
                    updateSubscriptionStatus(userId, 'active', payload);
                }
                break;
            }
            case 'subscription.renewed': {
                if (userId) {
                    grantPro(userId, payload);
                    updateSubscriptionStatus(userId, 'active', payload);
                    recordPayment(userId, payload, 'success');
                }
                break;
            }
            case 'subscription.on_hold': {
                if (userId) {
                    // Don't revoke immediately — keep access, flag status
                    updateSubscriptionStatus(userId, 'on_hold', payload);
                }
                break;
            }
            case 'subscription.failed': {
                if (userId) {
                    updateSubscriptionStatus(userId, 'past_due', payload);
                }
                break;
            }
            case 'subscription.cancelled': {
                if (userId) {
                    // Mark as cancelled but keep access until period end
                    db.prepare(`
                        UPDATE users SET subscription_status = 'cancelled', cancel_at_period_end = 1
                        WHERE id = ?
                    `).run(userId);
                    // If current_period_end has passed, revoke now
                    const u = db.prepare('SELECT current_period_end FROM users WHERE id = ?').get(userId);
                    if (u && u.current_period_end && u.current_period_end < Date.now()) {
                        revokePro(userId);
                    }
                }
                break;
            }
            case 'subscription.expired': {
                if (userId) {
                    revokePro(userId);
                    updateSubscriptionStatus(userId, 'expired', payload);
                }
                break;
            }
            case 'subscription.updated':
            case 'subscription.plan_changed': {
                if (userId) {
                    updateSubscriptionStatus(userId, 'active', payload);
                }
                break;
            }
            default:
                console.log(`[Dodo Webhook] Unhandled event type: ${type}`);
        }

        // ── Mark as processed for idempotency ─────────────────
        if (webhookId) {
            try {
                db.prepare('INSERT OR IGNORE INTO webhook_events (event_id, event_type, processed_at) VALUES (?, ?, ?)')
                    .run(webhookId, type, Date.now());
            } catch (e) {
                // Non-fatal: idempotency insert failed
            }
        }

        res.json({ received: true });
    } catch (err) {
        console.error('Webhook processing error:', err);
        res.status(500).send('Server Error');
    }
}

// ── Helper: Grant Pro to user ──────────────────────────────────
function grantPro(userId, payload) {
    const customerId = payload.customer?.customer_id || payload.customer_id || null;
    const subId = payload.subscription_id || null;
    const productId = integrations.get('integ.dodo.product_id') || null;

    db.prepare(`
        UPDATE users SET
            plan = 'paid',
            subscription_status = 'active',
            dodo_customer_id = COALESCE(?, dodo_customer_id),
            dodo_subscription_id = COALESCE(?, dodo_subscription_id),
            dodo_product_id = COALESCE(?, dodo_product_id),
            cancel_at_period_end = 0
        WHERE id = ?
    `).run(customerId, subId, productId, userId);
}

// ── Helper: Revoke Pro ─────────────────────────────────────────
function revokePro(userId) {
    db.prepare(`
        UPDATE users SET plan = 'free', cancel_at_period_end = 0 WHERE id = ?
    `).run(userId);
}

// ── Helper: Update subscription status ─────────────────────────
function updateSubscriptionStatus(userId, status, payload) {
    const subId = payload.subscription_id || null;
    const periodStart = payload.current_period_start
        ? new Date(payload.current_period_start).getTime()
        : null;
    const periodEnd = payload.current_period_end
        ? new Date(payload.current_period_end).getTime()
        : null;

    db.prepare(`
        UPDATE users SET
            subscription_status = ?,
            dodo_subscription_id = COALESCE(?, dodo_subscription_id),
            current_period_start = COALESCE(?, current_period_start),
            current_period_end = COALESCE(?, current_period_end),
            plan_renews_at = COALESCE(?, plan_renews_at)
        WHERE id = ?
    `).run(status, subId, periodStart, periodEnd, periodEnd, userId);
}

// ── Helper: Record payment ─────────────────────────────────────
function recordPayment(userId, payload, status) {
    const refId = payload.payment_id || payload.subscription_id || payload.id || `evt_${Date.now()}`;
    const amount = payload.total_amount || payload.amount || 0;
    const currency = payload.currency || 'USD';

    db.prepare(`
        INSERT INTO payments (user_id, provider, order_id, payment_id, amount, currency, plan, status, created_at)
        VALUES (?, 'dodo', ?, ?, ?, ?, 'kotha_pro', ?, ?)
        ON CONFLICT(order_id) DO UPDATE SET
            status = excluded.status,
            payment_id = COALESCE(excluded.payment_id, payment_id)
    `).run(userId, refId, refId, amount, currency, status, Date.now());
}

module.exports = {
    router,
    webhookHandler
};
