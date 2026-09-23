const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../db');
const { requireUser } = require('../auth');
const integrations = require('../integrations');

const DODO_API_URL = 'https://live.dodopayments.com/payments';

// Helper to get Dodo API Key
function getDodoApiKey() {
    return process.env.DODO_API_KEY || integrations.get('integ.dodo.api_key');
}

// Helper to get Dodo Webhook Secret
function getDodoWebhookSecret() {
    return process.env.DODO_WEBHOOK_SECRET || integrations.get('integ.dodo.webhook_secret');
}

// 1. Create Checkout Session (Payment Link)
router.post('/create-checkout', requireUser, async (req, res) => {
    try {
        const { plan } = req.body;
        const apiKey = getDodoApiKey();

        if (!apiKey) {
            return res.status(500).json({ error: 'Dodo Payments is not configured on this server.' });
        }

        let productId = process.env.DODO_PRODUCT_ID || integrations.get('integ.dodo.product_id');
        let monthlyProductId = process.env.DODO_MONTHLY_PRODUCT_ID || integrations.get('integ.dodo.monthly_product_id');
        
        const targetProductId = plan === 'pro_monthly' ? (monthlyProductId || productId) : productId;

        if (!targetProductId) {
             return res.status(500).json({ error: 'Dodo Product ID is not configured.' });
        }

        // Create checkout session via Dodo REST API
        const response = await fetch(DODO_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                product_id: targetProductId,
                quantity: 1,
                payment_link: true,
                return_url: `${req.protocol}://${req.get('host')}/app.html?payment=success`,
                metadata: {
                    user_id: req.user.id,
                    plan: plan
                },
                customer: {
                    email: req.user.email
                }
            })
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('Dodo API Error:', data);
            return res.status(400).json({ error: data.message || 'Failed to generate payment link' });
        }

        const checkoutUrl = data.payment_link_url || data.url || data.checkout_url;
        
        if (!checkoutUrl) {
            return res.status(500).json({ error: 'No checkout URL returned from payment provider' });
        }

        res.json({ url: checkoutUrl });
    } catch (error) {
        console.error('Checkout error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// 2. Webhook Handler
router.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
    const signature = req.headers['dodo-signature'] || req.headers['webhook-signature'];
    const secret = getDodoWebhookSecret();

    if (!secret || !signature) {
        return res.status(400).send('Webhook secret or signature missing');
    }

    let event;
    try {
        event = JSON.parse(req.body.toString());
    } catch (err) {
        console.error('Webhook payload parse failed.', err);
        return res.status(400).send('Invalid payload');
    }

    try {
        const eventType = event.type || event.event_type;
        const data = event.data || event.payload;

        if (eventType === 'payment.succeeded' || eventType === 'subscription.active' || eventType === 'order.paid') {
            const metadata = data.metadata || {};
            const userId = metadata.user_id;

            if (userId) {
                db.prepare(`
                    INSERT INTO payments (payment_id, user_id, amount, status, provider, created_at)
                    VALUES (?, ?, ?, ?, 'dodo', ?)
                    ON CONFLICT(payment_id) DO NOTHING
                `).run(
                    data.payment_id || data.id,
                    userId,
                    data.amount || data.total_amount || 0,
                    'success',
                    Date.now()
                );

                db.prepare(`UPDATE users SET is_pro = 1 WHERE id = ?`).run(userId);
                console.log(`User ${userId} upgraded to PRO via Dodo webhook.`);
            }
        } else if (eventType === 'subscription.revoked' || eventType === 'order.refunded') {
            const metadata = data.metadata || {};
            const userId = metadata.user_id;
            
            if (userId) {
                db.prepare(`UPDATE users SET is_pro = 0 WHERE id = ?`).run(userId);
                console.log(`User ${userId} PRO revoked via Dodo webhook.`);
            }
        }

        res.status(200).send('Webhook processed');
    } catch (err) {
        console.error('Webhook processing error:', err);
        res.status(500).send('Webhook processing error');
    }
});

module.exports = router;
