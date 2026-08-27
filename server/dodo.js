const express = require('express');
const router = express.Router();
const { DodoPayments } = require('dodopayments');
const { db } = require('./db');
const integrations = require('./integrations');

function getDodoClient() {
    const apiKey = integrations.get('integ.dodo.api_key');
    if (!apiKey) return null;
    return new DodoPayments({
        bearerToken: apiKey,
        environment: process.env.NODE_ENV === 'production' ? 'live_mode' : 'test_mode'
    });
}

// Ensure the user has an explicit API key configured
function requireDodoConfig(req, res, next) {
    if (!getDodoClient()) {
        return res.status(503).json({ error: 'Dodo Payments not configured' });
    }
    next();
}

// Helper to get or create a unified user in the DB
function getUserInfo(userId) {
    const row = db.prepare('SELECT id, email, display_name FROM users WHERE id = ?').get(userId);
    return row;
}

router.get('/plans', requireDodoConfig, (req, res) => {
    // Return expected format for the frontend
    res.json({
        available: true,
        plans: [
            {
                id: 'pro_monthly',
                display: '$5/mo'
            }
        ]
    });
});

router.post('/create-checkout', requireDodoConfig, async (req, res) => {
    try {
        const client = getDodoClient();
        const user = getUserInfo(req.user.id);
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
                userId: req.user.id.toString()
            },
            return_url: `${baseUrl}/?upgraded=dodo`
        });

        res.json({ url: session.url });
    } catch (err) {
        console.error('Dodo checkout error:', err);
        res.status(500).json({ error: 'Checkout creation failed' });
    }
});

async function webhookHandler(req, res) {
    const webhookSecret = integrations.get('integ.dodo.webhook_secret');
    if (!webhookSecret) return res.status(400).send('Webhook secret not configured');

    const client = getDodoClient();
    if (!client) return res.status(400).send('Dodo client not configured');

    let event;
    try {
        // DodoPayments SDK unwrap handles signature verification
        event = await client.webhooks.unwrap(req.body, req.headers, webhookSecret);
    } catch (err) {
        console.error(`Webhook Error: ${err.message}`);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
        const payload = event.data;
        const type = event.type;

        if (type === 'payment.succeeded' || type === 'subscription.active' || type === 'subscription.renewed') {
            let userId = null;
            
            // Webhooks might come from subscription or payment, check metadata
            if (payload.metadata && payload.metadata.userId) {
                userId = parseInt(payload.metadata.userId, 10);
            }
            
            if (userId) {
                // Determine whether it's subscription or payment for the reference
                const refId = payload.subscription_id || payload.payment_id || payload.id;
                const amount = payload.total_amount || 0;
                
                // Grant Pro
                db.prepare('UPDATE users SET is_pro = 1 WHERE id = ?').run(userId);
                
                // Record the payment/subscription
                db.prepare(`
                    INSERT INTO payments (user_id, provider, order_id, payment_id, amount, status, created_at)
                    VALUES (?, 'dodo', ?, ?, ?, 'success', ?)
                    ON CONFLICT(order_id) DO UPDATE SET status = 'success', payment_id = excluded.payment_id
                `).run(userId, refId, refId, amount, Date.now());
            }
        }
        
        if (type === 'subscription.cancelled' || type === 'subscription.expired' || type === 'subscription.revoked') {
            let userId = null;
            if (payload.metadata && payload.metadata.userId) {
                userId = parseInt(payload.metadata.userId, 10);
            }
            
            if (userId) {
                // Revoke Pro
                db.prepare('UPDATE users SET is_pro = 0 WHERE id = ?').run(userId);
            }
        }

        res.json({ received: true });
    } catch (err) {
        console.error('Webhook processing error:', err);
        res.status(500).send('Server Error');
    }
}

module.exports = {
    router,
    webhookHandler
};
