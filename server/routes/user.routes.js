const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { requireUser } = require('../auth');

router.post('/profile', requireUser, (req, res) => {
    const { display_name, phone, phone_country_code } = req.body || {};
    const updates = [];
    const params = [];

    if (typeof display_name === 'string') {
        updates.push('display_name = ?');
        params.push(display_name.trim() || null);
    }
    if (typeof phone === 'string') {
        updates.push('phone = ?');
        params.push(phone.trim() || null);
    }
    if (typeof phone_country_code === 'string') {
        updates.push('phone_country_code = ?');
        params.push(phone_country_code.trim() || '+91');
    }
    updates.push('phone_prompted = 1');

    params.push(req.user.id);
    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    const updated = db.prepare('SELECT id, email, display_name, avatar_url, phone, phone_country_code, phone_prompted FROM users WHERE id = ?').get(req.user.id);
    res.json({ ok: true, user: updated });
});

router.post('/profile/skip', requireUser, (req, res) => {
    db.prepare('UPDATE users SET phone_prompted = 1 WHERE id = ?').run(req.user.id);
    res.json({ ok: true });
});

module.exports = router;
