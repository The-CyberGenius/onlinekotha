const express = require('express');
const { db } = require('./db');
const rateLimit = require('express-rate-limit');

const router = express.Router();

const contactLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5, // 5 requests per IP
    message: { error: 'Too many messages sent from this IP, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});

router.post('/', contactLimiter, (req, res) => {
    try {
        const { name, email, topic, message } = req.body;
        if (!name || !email || !message) {
            return res.status(400).json({ error: 'Name, email, and message are required.' });
        }

        db.prepare(`
            INSERT INTO contact_messages (name, email, topic, message, status, created_at)
            VALUES (?, ?, ?, ?, 'pending', ?)
        `).run(
            name.trim(),
            email.trim().toLowerCase(),
            topic ? topic.trim() : 'General',
            message.trim(),
            Date.now()
        );

        res.json({ ok: true });
    } catch (err) {
        console.error('Contact Form Error:', err);
        res.status(500).json({ error: 'Failed to submit message.' });
    }
});

module.exports = router;
