// Billing — Polar.sh (Merchant of Record · international · USD)
//
// Runs ALONGSIDE Razorpay (server/billing.js), it does NOT replace it:
//   • Razorpay  → INR / India (UPI, cards) — server/billing.js
//   • Polar     → international cards, USD, tax/VAT handled by Polar (MoR) — this file
//
// The `payments.provider` column already distinguishes the two ('razorpay' | 'polar').
//
// Endpoints:  GET  /api/polar/plans            (public — availability + plan display info)
//             POST /api/polar/create-checkout  (auth  — creates a hosted Checkout, returns its url)
//             POST /api/polar/webhook          (Polar → us; raw body; mounted in server.js)
//
// No SDK dependency: checkout uses Polar's REST API via native fetch, and webhook
// signatures are verified with the Standard Webhooks scheme using native crypto.

const crypto  = require('crypto');
const express = require('express');
const { requireUser } = require('./auth');
const { db } = require('./db');
const integ = require('./integrations');

const router = express.Router();

// Plan catalogue. NOTE: the real price is defined on the Polar Product you configure
// (integ.polar.product_id). The `amount` here is display-only for the upgrade button.
const PLANS = {
    pro_monthly: {
        name:        'Kotha Pro',
        description: 'Unlimited AI chats · All features',
        amount:      500,     // $5.00 — display only (cents)
        currency:    'USD',
    },
};

// ─── Config helpers ──────────────────────────────────────────────────────────
function polarEnv() {
    const s = (integ.get('integ.polar.server') || 'production').toLowerCase();
    return s === 'sandbox' ? 'sandbox' : 'production';
}
function apiBase() {
    return polarEnv() === 'sandbox' ? 'https://sandbox-api.polar.sh' : 'https://api.polar.sh';
}
function baseUrl() {
    return integ.get('integ.app.base_url') || process.env.PUBLIC_BASE_URL || 'http://localhost:3000';
}
function configured() {
    return !!(integ.get('integ.polar.access_token') && integ.get('integ.polar.product_id'));
}
// Nothing is cached (token read fresh per request), but keep parity with billing.reset()
function reset() {}

// ─── GET /api/polar/plans ─────────────────────────────────────────────────────
router.get('/plans', (req, res) => {
    res.json({
        available: configured(),
        currency:  'USD',
        server:    polarEnv(),
        plans: Object.entries(PLANS).map(([id, p]) => ({
            id,
            name:        p.name,
            description: p.description,
            amount:      p.amount,
            currency:    p.currency,
            display:     `$${(p.amount / 100).toFixed(0)}/mo`,
        })),
    });
});

// ─── POST /api/polar/create-checkout ────────────────────────────────────────
// Creates a hosted Polar Checkout session bound to the authenticated user and
// returns { url } for the frontend to redirect to. The upgrade itself is applied
// server-side by the webhook (source of truth), so this route never grants Pro.
router.post('/create-checkout', requireUser, async (req, res) => {
    const accessToken = integ.get('integ.polar.access_token');
    const productId   = integ.get('integ.polar.product_id');
    if (!accessToken || !productId) {
        return res.status(503).json({ error: 'International payments not configured' });
    }

    const planId = (req.body && req.body.plan) || 'pro_monthly';
    if (!PLANS[planId]) return res.status(400).json({ error: 'Invalid plan' });

    try {
        const resp = await fetch(`${apiBase()}/v1/checkouts/`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type':  'application/json',
            },
            body: JSON.stringify({
                products:             [productId],
                success_url:          `${baseUrl()}/app.html?upgraded=polar&checkout_id={CHECKOUT_ID}`,
                customer_email:       req.user.email,
                external_customer_id: String(req.user.id),
                metadata: {
                    user_id: String(req.user.id),
                    plan:    planId,
                },
            }),
        });

        if (!resp.ok) {
            const detail = await resp.text().catch(() => '');
            console.error('Polar create-checkout failed:', resp.status, detail.slice(0, 500));
            return res.status(502).json({ error: 'Failed to create checkout session' });
        }

        const checkout = await resp.json();
        if (!checkout || !checkout.url) {
            console.error('Polar create-checkout: response missing url', checkout && checkout.id);
            return res.status(502).json({ error: 'Checkout created but no redirect URL returned' });
        }

        res.json({ url: checkout.url, id: checkout.id });
    } catch (err) {
        console.error('Polar create-checkout error:', err);
        res.status(500).json({ error: 'Failed to create checkout session' });
    }
});

// ─── Standard Webhooks signature verification (native crypto) ─────────────────
// Spec: https://www.standardwebhooks.com — signed content = `${id}.${ts}.${body}`,
// secret is `whsec_<base64>`, HMAC-SHA256 → base64, header is space-delimited
// `v1,<sig>` tokens. Constant-time compare + 5-min replay window.
function verifySignature(rawBody, headers, secret) {
    const id  = headers['webhook-id'];
    const ts  = headers['webhook-timestamp'];
    const sig = headers['webhook-signature'];
    if (!id || !ts || !sig) return false;

    // Replay protection — timestamp within ±5 minutes
    const tsNum = parseInt(ts, 10);
    const now   = Math.floor(Date.now() / 1000);
    if (!Number.isFinite(tsNum) || Math.abs(now - tsNum) > 300) return false;

    // Decode the signing key: strip optional "whsec_" prefix, then base64-decode.
    let keyStr = secret;
    if (keyStr.startsWith('whsec_')) keyStr = keyStr.slice(6);
    let key = Buffer.from(keyStr, 'base64');
    if (key.length === 0) key = Buffer.from(secret, 'utf8'); // defensive fallback

    const signedContent = `${id}.${ts}.${rawBody.toString('utf8')}`;
    const expected = crypto.createHmac('sha256', key).update(signedContent).digest('base64');
    const expectedBuf = Buffer.from(expected, 'utf8');

    // Header may carry several tokens (secret rotation) — match any symmetric one.
    for (const token of String(sig).split(' ')) {
        const comma = token.indexOf(',');
        if (comma === -1) continue;
        const value = token.slice(comma + 1);
        const gotBuf = Buffer.from(value, 'utf8');
        if (gotBuf.length === expectedBuf.length &&
            crypto.timingSafeEqual(gotBuf, expectedBuf)) {
            return true;
        }
    }
    return false;
}

// Resolve our internal user id from a Polar event payload. We set metadata.user_id
// and external_customer_id at checkout, so several fallbacks cover order/subscription.
function extractUserId(data) {
    if (!data) return null;
    const m = data.metadata || {};
    const cand =
        m.user_id ?? m.userId ??
        data.external_customer_id ?? data.externalCustomerId ??
        (data.customer && (data.customer.external_id ?? data.customer.externalId));
    const n = cand != null ? parseInt(cand, 10) : NaN;
    return Number.isFinite(n) ? n : null;
}

function recordAndUpgrade({ userId, orderId, paymentId, amount, currency, plan, subId, custId }) {
    db.transaction(() => {
        db.prepare(`
            INSERT OR IGNORE INTO payments
              (user_id, provider, order_id, payment_id, amount, currency, plan, status, created_at)
            VALUES (?, 'polar', ?, ?, ?, ?, ?, 'captured', ?)
        `).run(
            userId,
            String(orderId),
            paymentId ? String(paymentId) : null,
            Number.isFinite(amount) ? amount : 0,
            currency || 'USD',
            plan || 'pro_monthly',
            Date.now(),
        );
        db.prepare(`
            UPDATE users
               SET plan = 'paid',
                   polar_subscription_id = COALESCE(?, polar_subscription_id),
                   polar_customer_id     = COALESCE(?, polar_customer_id)
             WHERE id = ?
        `).run(subId || null, custId || null, userId);
    })();
}

function downgrade(userId) {
    // Access ended (subscription revoked / order refunded). Drop out of the paid
    // bucket; trial_expires_at (already in the past for a former subscriber) then gates access.
    db.prepare(`UPDATE users SET plan = 'trial' WHERE id = ? AND plan = 'paid'`).run(userId);
}

// ─── POST /api/polar/webhook ──────────────────────────────────────────────────
// Raw body required (mounted with express.raw in server.js). Idempotent via the
// UNIQUE payments.order_id constraint, so duplicate deliveries are safe.
function webhookHandler(req, res) {
    const secret = integ.get('integ.polar.webhook_secret');
    if (secret) {
        if (!verifySignature(req.body, req.headers, secret)) {
            console.warn('Polar webhook: signature verification failed');
            return res.status(403).send('');
        }
    }

    let event;
    try { event = JSON.parse(req.body.toString('utf8')); }
    catch { return res.status(400).json({ error: 'Invalid JSON' }); }

    const type = event.type;
    const data = event.data || {};

    try {
        switch (type) {
            // Grant Pro — order.paid covers one-time + first subscription invoice;
            // subscription.active covers activation/reactivation.
            case 'order.paid':
            case 'subscription.active': {
                const userId = extractUserId(data);
                if (!userId) {
                    console.warn(`Polar webhook ${type}: no resolvable user id (event ${data.id})`);
                    break; // 202 below — don't make Polar retry a permanently-unmappable event
                }
                const orderId  = data.id || `${type}_${userId}_${Date.now()}`;
                const amount   = data.total_amount ?? data.amount ?? data.net_amount ?? 0;
                const currency = (data.currency || 'usd').toUpperCase();
                const plan     = (data.metadata && data.metadata.plan) || 'pro_monthly';
                const subId    = data.subscription_id || (type === 'subscription.active' ? data.id : null);
                const custId   = data.customer_id || (data.customer && data.customer.id) || null;

                recordAndUpgrade({ userId, orderId, paymentId: data.checkout_id, amount, currency, plan, subId, custId });
                console.log(`✓ Polar ${type}: user=${userId} order=${orderId}`);
                break;
            }

            // Revoke Pro — subscription ended / payment reversed.
            case 'subscription.revoked':
            case 'order.refunded': {
                const userId = extractUserId(data);
                if (userId) {
                    downgrade(userId);
                    console.log(`↓ Polar ${type}: user=${userId} downgraded`);
                }
                break;
            }

            default:
                // subscription.created/updated/canceled(at period end), checkout.*, etc. — no action needed.
                break;
        }
    } catch (err) {
        console.error('Polar webhook DB error:', err);
        return res.status(500).json({ error: 'DB error' }); // 5xx → Polar retries
    }

    res.status(202).send('');
}

module.exports = { router, webhookHandler, configured, reset };
