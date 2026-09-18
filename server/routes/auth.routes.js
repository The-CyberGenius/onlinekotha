const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const geoip = require('geoip-lite');
const bcrypt = require('bcryptjs');

const { db } = require('../db');
const {
    createUser,
    createSession,
    login,
    logout,
    effectivePlan,
} = require('../auth');
const { sendVerifyEmail, sendPasswordResetEmail, consumeToken } = require('../email');
const { claimGuestData, getGuestStatus } = require('../guest');
const { router: oauthRouter } = require('../oauth');

// Shared cookie options (make sure it matches server.js)
const IS_PROD = process.env.NODE_ENV === 'production';
const COOKIE_OPTS = {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    ...(IS_PROD && { secure: true }),
};

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 60,
    validate: false,
});

// Self-serve Signup with Name, Email, 6-Digit PIN, and Optional Phone
router.post('/signup', authLimiter, async (req, res) => {
    try {
        const { email, pin, password, name, display_name, phone, phone_country_code } = req.body || {};
        if (!email) return res.status(400).json({ error: 'Email is required' });
        
        const cleanEmail = email.toLowerCase().trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
            return res.status(400).json({ error: 'Please enter a valid email address' });
        }

        const authSecret = (pin || password || '').trim();
        if (!authSecret || !/^\d{4,6}$/.test(authSecret)) {
            return res.status(400).json({ error: 'Please enter a 4 to 6-digit PIN (numbers only)' });
        }

        const ip = req.ip || req.socket.remoteAddress;
        let country = null;
        if (ip) {
            try {
                const geo = geoip.lookup(ip);
                if (geo) country = geo.country;
            } catch {}
        }

        const user = createUser(cleanEmail, authSecret, {
            display_name: name || display_name,
            phone,
            phone_country_code,
            ip,
            country,
        });

        // Claim guest data if guest was active
        const guestId = req.cookies && req.cookies.kotha_guest_id;
        if (guestId) claimGuestData(guestId, user.id);

        const { token, expiresAt } = createSession(user.id);
        res.cookie('session', token, { ...COOKIE_OPTS, expires: new Date(expiresAt) });
        res.json({ ok: true, user });
    } catch (err) {
        res.status(400).json({ error: err.message || 'Signup failed' });
    }
});

router.get('/verify', (req, res) => {
    const token = req.query.token;
    const row = consumeToken(token, 'verify');
    if (!row) return res.redirect('/verify-failed.html');
    db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(row.user_id);
    res.redirect('/verify-success.html');
});

router.post('/forgot', async (req, res) => {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ error: 'email required' });
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
    // Always return ok (don't leak which emails exist)
    if (user) {
        sendPasswordResetEmail(user).catch(err => console.error('reset email failed:', err.message));
    }
    res.json({ ok: true });
});

router.post('/reset', async (req, res) => {
    const { token, password } = req.body || {};
    if (!token || !password) return res.status(400).json({ error: 'token + password required' });
    if (!/^\d{4,6}$/.test(password)) return res.status(400).json({ error: 'Please enter a 4 to 6-digit PIN (numbers only)' });
    const row = consumeToken(token, 'reset');
    if (!row) return res.status(400).json({ error: 'Invalid or expired link' });
    const hash = bcrypt.hashSync(password, 10);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, row.user_id);
    // Invalidate all sessions for security
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(row.user_id);
    res.json({ ok: true });
});

router.post('/resend-verify', (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Login required' });
    const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (u.email_verified) return res.json({ ok: true, already: true });
    sendVerifyEmail(u).catch(err => console.error('verify resend failed:', err.message));
    res.json({ ok: true });
});

router.post('/login', authLimiter, (req, res) => {
    try {
        const { email, pin, password } = req.body || {};
        if (!email) return res.status(400).json({ error: 'Email is required' });
        const pass = (pin || password || '').trim();
        if (!pass) return res.status(400).json({ error: '6-digit PIN or password required' });

        const { token, expiresAt } = login(email.trim(), pass);

        // Claim guest data if guest was active
        const guestId = req.cookies && req.cookies.kotha_guest_id;
        const row = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
        if (guestId && row) claimGuestData(guestId, row.id);

        res.cookie('session', token, { ...COOKIE_OPTS, expires: new Date(expiresAt) });
        res.json({ ok: true });
    } catch (err) {
        res.status(401).json({ error: err.message || 'Invalid email or PIN' });
    }
});

router.post('/logout', (req, res) => {
    const token = req.cookies && req.cookies.session;
    logout(token);
    res.clearCookie('session', COOKIE_OPTS);
    res.json({ ok: true });
});

// Mount OAuth Routes
router.use('/', oauthRouter);

router.get('/me', (req, res) => {
    const guestStatus = getGuestStatus(req, res);
    if (!req.user) {
        return res.json({
            user: null,
            is_guest: true,
            guest: guestStatus,
        });
    }
    res.json({
        user: {
            ...req.user,
            effective_plan: effectivePlan(req.user),
        },
        is_guest: false,
        guest: guestStatus,
    });
});

module.exports = router;
