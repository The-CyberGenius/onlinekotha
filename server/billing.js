// Billing module — Stripe removed, Razorpay will be added later.
// For now: free tier + trial logic only. No payment processing.

const express = require('express');
const { requireUser } = require('./auth');

const router = express.Router();

router.get('/plans', (req, res) => {
    res.json({
        available: false,
        message: 'Payment gateway coming soon. Enjoy free tier!',
        plans: [],
    });
});

router.post('/checkout', requireUser, (req, res) => {
    res.status(503).json({ error: 'Payment gateway coming soon.' });
});

router.post('/portal', requireUser, (req, res) => {
    res.status(503).json({ error: 'Payment gateway coming soon.' });
});

// No-op webhook handler
function webhookHandler(req, res) {
    res.status(200).json({ received: true });
}

function configured() {
    return false;
}

module.exports = { router, webhookHandler, configured };
