const express = require('express');
const { db } = require('./db');
const { requireUser } = require('./auth');
const integ = require('./integrations');

const router = express.Router();

function getBaseUrl() {
    return integ.get('integ.app.base_url') || process.env.PUBLIC_BASE_URL || 'http://localhost:3000';
}

let cachedStripe = null;
let cachedSecret = null;

function getStripe() {
    const secret = integ.get('integ.stripe.secret_key');
    if (!secret) {
        cachedStripe = null;
        cachedSecret = null;
        return null;
    }
    if (cachedStripe && cachedSecret === secret) return cachedStripe;
    cachedStripe = require('stripe')(secret);
    cachedSecret = secret;
    return cachedStripe;
}

function resetStripe() {
    cachedStripe = null;
    cachedSecret = null;
}

function getPriceIds() {
    return {
        pro: integ.get('integ.stripe.pro_price_id'),
        lifetime: integ.get('integ.stripe.lifetime_price_id'),
    };
}

function getWebhookSecret() {
    return integ.get('integ.stripe.webhook_secret');
}

router.get('/plans', (req, res) => {
    const stripe = getStripe();
    const prices = getPriceIds();
    res.json({
        available: !!stripe,
        plans: [
            { id: 'pro', name: 'Pro', price: 5, interval: 'month', priceId: prices.pro, available: !!(stripe && prices.pro) },
            { id: 'lifetime', name: 'Lifetime', price: 49, interval: 'one-time', priceId: prices.lifetime, available: !!(stripe && prices.lifetime) },
        ],
    });
});

router.post('/checkout', requireUser, async (req, res) => {
    const stripe = getStripe();
    if (!stripe) return res.status(503).json({ error: 'Billing not configured' });
    const { plan } = req.body || {};
    if (!['pro', 'lifetime'].includes(plan)) return res.status(400).json({ error: 'Invalid plan' });

    const prices = getPriceIds();
    const priceId = plan === 'pro' ? prices.pro : prices.lifetime;
    if (!priceId) return res.status(503).json({ error: 'Plan not configured' });

    let user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    let customerId = user.stripe_customer_id;
    if (!customerId) {
        const customer = await stripe.customers.create({
            email: user.email,
            metadata: { user_id: String(user.id) },
        });
        customerId = customer.id;
        db.prepare('UPDATE users SET stripe_customer_id = ? WHERE id = ?').run(customerId, user.id);
    }

    try {
        const baseUrl = getBaseUrl();
        const session = await stripe.checkout.sessions.create({
            customer: customerId,
            mode: plan === 'pro' ? 'subscription' : 'payment',
            line_items: [{ price: priceId, quantity: 1 }],
            success_url: `${baseUrl}/billing-success.html?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${baseUrl}/app`,
            metadata: { user_id: String(user.id), plan },
            allow_promotion_codes: true,
        });
        res.json({ ok: true, url: session.url });
    } catch (err) {
        console.error('Stripe checkout error:', err);
        res.status(500).json({ error: err.message });
    }
});

router.post('/portal', requireUser, async (req, res) => {
    const stripe = getStripe();
    if (!stripe) return res.status(503).json({ error: 'Billing not configured' });
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!user.stripe_customer_id) return res.status(400).json({ error: 'No subscription found' });
    const session = await stripe.billingPortal.sessions.create({
        customer: user.stripe_customer_id,
        return_url: `${getBaseUrl()}/app`,
    });
    res.json({ ok: true, url: session.url });
});

async function webhookHandler(req, res) {
    const stripe = getStripe();
    if (!stripe) return res.status(503).end();

    const sig = req.headers['stripe-signature'];
    const secret = getWebhookSecret();
    let event;
    try {
        if (secret) {
            event = stripe.webhooks.constructEvent(req.body, sig, secret);
        } else {
            event = JSON.parse(req.body.toString());
            console.warn('⚠️  STRIPE webhook secret not set — signature NOT verified');
        }
    } catch (err) {
        console.error('Webhook signature failed:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
        switch (event.type) {
            case 'checkout.session.completed': {
                const session = event.data.object;
                const userId = Number(session.metadata?.user_id);
                const plan = session.metadata?.plan;
                if (userId && plan) {
                    if (plan === 'lifetime') {
                        db.prepare("UPDATE users SET plan = 'paid', plan_renews_at = NULL WHERE id = ?").run(userId);
                    } else if (plan === 'pro') {
                        db.prepare('UPDATE users SET plan = ?, stripe_subscription_id = ? WHERE id = ?')
                            .run('paid', session.subscription, userId);
                    }
                    console.log(`✅ User ${userId} upgraded to ${plan}`);
                }
                break;
            }
            case 'customer.subscription.updated':
            case 'customer.subscription.deleted': {
                const sub = event.data.object;
                const user = db.prepare('SELECT id FROM users WHERE stripe_subscription_id = ?').get(sub.id);
                if (user) {
                    if (sub.status === 'active' || sub.status === 'trialing') {
                        const renews = sub.current_period_end ? sub.current_period_end * 1000 : null;
                        db.prepare("UPDATE users SET plan = 'paid', plan_renews_at = ? WHERE id = ?")
                            .run(renews, user.id);
                    } else {
                        db.prepare("UPDATE users SET plan = 'free', plan_renews_at = NULL WHERE id = ?").run(user.id);
                    }
                }
                break;
            }
        }
        res.json({ received: true });
    } catch (err) {
        console.error('Webhook handler error:', err);
        res.status(500).json({ error: err.message });
    }
}

function configured() {
    return !!getStripe();
}

module.exports = { router, webhookHandler, resetStripe, configured };
