// Billing — Razorpay Standard Checkout
// Endpoints:  POST /api/billing/plans          (public — returns key_id + plan info)
//             POST /api/billing/create-order   (auth — creates Razorpay order)
//             POST /api/billing/verify-payment (auth — verifies HMAC, upgrades user)

const Razorpay = require('razorpay');
const crypto   = require('crypto');
const express  = require('express');
const { requireUser } = require('./auth');
const { db } = require('./db');
const integ = require('./integrations');

const router = express.Router();

// Plan catalogue — amount in paise (₹99 = 9900 paise)
const PLANS = {
    pro_monthly: {
        name:        'Kotha Pro',
        description: 'Unlimited AI chats · All features',
        amount:      9900,    // ₹99/mo
        currency:    'INR',
    },
};

// ─── Razorpay instance (lazy, re-created if keys change) ─────────────────────
let _rzp = null;
let _rzpKeys = '';

function getRazorpay() {
    const keyId     = integ.get('integ.razorpay.key_id');
    const keySecret = integ.get('integ.razorpay.key_secret');
    if (!keyId || !keySecret) return null;

    const sig = `${keyId}:${keySecret}`;
    if (!_rzp || sig !== _rzpKeys) {
        _rzp = new Razorpay({ key_id: keyId, key_secret: keySecret });
        _rzpKeys = sig;
    }
    return _rzp;
}

function configured() {
    return !!(integ.get('integ.razorpay.key_id') && integ.get('integ.razorpay.key_secret'));
}

// Call this after admin saves new Razorpay keys
function reset() { _rzp = null; _rzpKeys = ''; }

// ─── GET /api/billing/plans ─────────────────────────────────────────────────
// Public — frontend reads key_id + plan details before opening modal
router.get('/plans', (req, res) => {
    const keyId = integ.get('integ.razorpay.key_id');
    res.json({
        available: !!keyId,
        key_id:    keyId || null,
        currency:  'INR',
        plans: Object.entries(PLANS).map(([id, p]) => ({
            id,
            name:        p.name,
            description: p.description,
            amount:      p.amount,
            currency:    p.currency,
            display:     `₹${(p.amount / 100).toFixed(0)}/mo`,
        })),
    });
});

// ─── POST /api/billing/create-order ─────────────────────────────────────────
// Creates a Razorpay order and returns order_id to the frontend
router.post('/create-order', requireUser, async (req, res) => {
    const rzp = getRazorpay();
    if (!rzp) return res.status(503).json({ error: 'Payment gateway not configured' });

    const planId = (req.body && req.body.plan) || 'pro_monthly';
    const plan = PLANS[planId];
    if (!plan) return res.status(400).json({ error: 'Invalid plan' });
    if (plan.amount < 100) return res.status(400).json({ error: 'Amount below minimum (100 paise)' });

    try {
        const order = await rzp.orders.create({
            amount:   plan.amount,
            currency: plan.currency,
            receipt:  `rcpt_${req.user.id}_${Date.now()}`,
            notes: {
                user_id: String(req.user.id),
                email:   req.user.email,
                plan:    planId,
            },
        });

        res.json({
            order_id: order.id,
            amount:   order.amount,
            currency: order.currency,
            plan:     planId,
        });
    } catch (err) {
        console.error('Razorpay create-order error:', err);
        res.status(500).json({ error: 'Failed to create payment order' });
    }
});

// ─── POST /api/billing/verify-payment ────────────────────────────────────────
// Verifies HMAC-SHA256 signature, records payment, upgrades user to paid
router.post('/verify-payment', requireUser, async (req, res) => {
    const {
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
        plan = 'pro_monthly',
    } = req.body || {};

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
        return res.status(400).json({ error: 'Missing required payment fields' });
    }

    const keySecret = integ.get('integ.razorpay.key_secret');
    if (!keySecret) return res.status(503).json({ error: 'Payment gateway not configured' });

    // ── HMAC-SHA256 signature verification ──────────────────────────────────
    const expectedSig = crypto
        .createHmac('sha256', keySecret)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest('hex');

    if (expectedSig !== razorpay_signature) {
        console.warn(`Payment signature mismatch for user ${req.user.id}, order ${razorpay_order_id}`);
        return res.status(400).json({ error: 'Payment verification failed — signature mismatch' });
    }

    // ── Record payment + upgrade user (in a transaction) ────────────────────
    const planInfo = PLANS[plan] || PLANS.pro_monthly;
    const now = Date.now();

    try {
        db.transaction(() => {
            // Insert payment record (UNIQUE on order_id prevents double-processing)
            db.prepare(`
                INSERT OR IGNORE INTO payments
                  (user_id, provider, order_id, payment_id, amount, currency, plan, status, created_at)
                VALUES (?, 'razorpay', ?, ?, ?, ?, ?, 'captured', ?)
            `).run(
                req.user.id,
                razorpay_order_id,
                razorpay_payment_id,
                planInfo.amount,
                planInfo.currency,
                plan,
                now,
            );

            // Upgrade user plan
            db.prepare(`UPDATE users SET plan = 'paid' WHERE id = ?`).run(req.user.id);
        })();

        console.log(`✓ Payment captured: user=${req.user.id} order=${razorpay_order_id} payment=${razorpay_payment_id}`);
        res.json({ ok: true, plan: 'paid' });
    } catch (err) {
        console.error('Payment DB write error:', err);
        res.status(500).json({ error: 'Payment recorded but DB update failed — contact support' });
    }
});

// ─── POST /api/billing/webhook ───────────────────────────────────────────────
// Called directly by Razorpay — raw body required (mounted in server.js)
// Handles: payment.captured → idempotent upgrade even if frontend closed
function webhookHandler(req, res) {
    const webhookSecret = integ.get('integ.razorpay.webhook_secret');

    // ── 1. Signature verification (skip only if no secret configured yet) ───
    if (webhookSecret) {
        const receivedSig = req.headers['x-razorpay-signature'];
        if (!receivedSig) {
            console.warn('Razorpay webhook: missing signature header');
            return res.status(400).json({ error: 'Missing signature' });
        }
        const expectedSig = crypto
            .createHmac('sha256', webhookSecret)
            .update(req.body)           // req.body is raw Buffer here
            .digest('hex');
        if (!crypto.timingSafeEqual(Buffer.from(receivedSig), Buffer.from(expectedSig))) {
            console.warn('Razorpay webhook: signature mismatch');
            return res.status(400).json({ error: 'Invalid signature' });
        }
    }

    // ── 2. Parse event ───────────────────────────────────────────────────────
    let event;
    try {
        event = JSON.parse(req.body.toString());
    } catch {
        return res.status(400).json({ error: 'Invalid JSON' });
    }

    // ── 3. Handle payment.captured ───────────────────────────────────────────
    if (event.event === 'payment.captured') {
        const payment = event.payload?.payment?.entity;
        if (!payment) return res.status(200).json({ ok: true });

        const orderId   = payment.order_id;
        const paymentId = payment.id;
        const amount    = payment.amount;
        const currency  = payment.currency || 'INR';
        const notes     = payment.notes || {};
        const userId    = notes.user_id ? parseInt(notes.user_id) : null;
        const plan      = notes.plan || 'pro_monthly';

        if (!userId || !orderId) {
            console.warn('Razorpay webhook: missing user_id or order_id in notes', notes);
            return res.status(200).json({ ok: true }); // 200 so Razorpay doesn't retry
        }

        try {
            db.transaction(() => {
                // INSERT OR IGNORE = idempotent, safe against duplicate webhooks
                db.prepare(`
                    INSERT OR IGNORE INTO payments
                      (user_id, provider, order_id, payment_id, amount, currency, plan, status, created_at)
                    VALUES (?, 'razorpay', ?, ?, ?, ?, ?, 'captured', ?)
                `).run(userId, orderId, paymentId, amount, currency, plan, Date.now());

                db.prepare(`UPDATE users SET plan = 'paid' WHERE id = ?`).run(userId);
            })();

            console.log(`✓ Webhook: payment captured user=${userId} order=${orderId} payment=${paymentId}`);
        } catch (err) {
            console.error('Webhook DB error:', err);
            // Return 500 so Razorpay retries the webhook
            return res.status(500).json({ error: 'DB error' });
        }
    }

    res.status(200).json({ ok: true });
}

// ─── Legacy stubs (kept for backward compatibility) ─────────────────────────
router.post('/checkout', requireUser, (req, res) => {
    res.status(410).json({ error: 'Use POST /api/billing/create-order instead' });
});
router.post('/portal', requireUser, (req, res) => {
    res.status(410).json({ error: 'Manage payments at razorpay.com dashboard' });
});

module.exports = { router, webhookHandler, configured, reset };
