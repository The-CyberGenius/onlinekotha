const express = require('express');
const passport = require('passport');
const { Strategy: GoogleStrategy } = require('passport-google-oauth20');
const { db, getSetting } = require('./db');
const { createSession, checkIpAccountLimit } = require('./auth');
const integ = require('./integrations');
const geoip = require('geoip-lite');

const router = express.Router();

function getBaseUrl(req) {
    if (req) {
        const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
        const host = req.headers['x-forwarded-host'] || req.get('host');
        if (host) return `${proto}://${host}`;
    }
    return integ.get('integ.app.base_url') || process.env.PUBLIC_BASE_URL || 'http://localhost:3000';
}

// Register Passport strategy lazily on each OAuth start. Idempotent.
let registeredFingerprint = null;

function ensureStrategy(req) {
    const clientId = integ.get('integ.oauth.google_client_id');
    const clientSecret = integ.get('integ.oauth.google_client_secret');
    if (!clientId || !clientSecret) return false;

    const callbackURL = `${getBaseUrl(req)}/api/auth/google/callback`;
    const fingerprint = `${clientId}|${clientSecret}|${callbackURL}`;
    if (fingerprint === registeredFingerprint) return true;

    passport.use(new GoogleStrategy({
        clientID: clientId,
        clientSecret: clientSecret,
        callbackURL,
        scope: ['profile', 'email'],
        passReqToCallback: true,
    }, (req, accessToken, refreshToken, profile, done) => {
        try {
            const email = (profile.emails?.[0]?.value || '').toLowerCase().trim();
            const googleId = profile.id;
            const displayName = profile.displayName || null;
            const avatarUrl = profile.photos?.[0]?.value || null;

            if (!email) return done(new Error('Google account has no email'));

            let user = db.prepare('SELECT * FROM users WHERE google_id = ?').get(googleId);
            if (user) {
                // Refresh avatar/name on every Google login so it stays current
                db.prepare(
                    `UPDATE users SET display_name = COALESCE(?, display_name), avatar_url = COALESCE(?, avatar_url) WHERE id = ?`
                ).run(displayName, avatarUrl, user.id);
                user = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
            }
            if (!user) {
                user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
                if (user) {
                    // Always update avatar/name from Google — keeps them fresh
                    db.prepare(
                        `UPDATE users SET google_id = ?, email_verified = 1,
                         display_name = COALESCE(?, display_name), avatar_url = COALESCE(?, avatar_url)
                         WHERE id = ?`
                    ).run(googleId, displayName, avatarUrl, user.id);
                    user = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
                }
            }

            if (!user) {
                const ip = req.headers['x-forwarded-for'] ? req.headers['x-forwarded-for'].split(',')[0].trim() : req.socket.remoteAddress;
                checkIpAccountLimit(ip, email);

                const now = Date.now();
                const trialHours = Number(getSetting('trial_duration_hours', '24'));
                const trialExpiresAt = now + trialHours * 60 * 60 * 1000;
                const adminEmail = (process.env.ADMIN_EMAIL || '').toLowerCase().trim();
                const isAdmin = adminEmail && email === adminEmail ? 1 : 0;

                let country = null;
                if (ip) {
                    const geo = geoip.lookup(ip);
                    if (geo) country = geo.country;
                }

                const info = db.prepare(
                    `INSERT INTO users
                       (email, password_hash, created_at, plan, trial_expires_at, is_admin,
                        email_verified, google_id, display_name, avatar_url, ip_address, country)
                     VALUES (?, '', ?, 'trial', ?, ?, 1, ?, ?, ?, ?, ?)`
                ).run(email, now, trialExpiresAt, isAdmin, googleId, displayName, avatarUrl, ip, country);
                user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
            }

            done(null, user);
        } catch (err) {
            done(err);
        }
    }));

    registeredFingerprint = fingerprint;
    return true;
}

function resetStrategy() {
    registeredFingerprint = null;
}

function configured() {
    return !!(integ.get('integ.oauth.google_client_id') && integ.get('integ.oauth.google_client_secret'));
}

router.get('/status', (req, res) => {
    res.json({ google: configured() });
});

router.get('/google', (req, res, next) => {
    if (!ensureStrategy(req)) return res.status(503).send('Google OAuth not configured');
    const next_ = typeof req.query.next === 'string' && req.query.next.startsWith('/') ? req.query.next : '/app';
    passport.authenticate('google', {
        scope: ['profile', 'email'],
        state: next_,
        session: false,
    })(req, res, next);
});

router.get('/google/callback', (req, res, next) => {
    if (!ensureStrategy(req)) return res.status(503).send('Google OAuth not configured');
    passport.authenticate('google', { session: false }, (err, user) => {
        if (err) {
            console.error('OAuth callback error:', err);
            return res.redirect(`/login.html?error=${encodeURIComponent(err.message || 'auth_failed')}`);
        }
        if (!user) return res.redirect('/login.html?error=no_user');

        const { claimGuestData } = require('./guest');
        const guestId = req.cookies && req.cookies.kotha_guest_id;
        if (guestId) claimGuestData(guestId, user.id);

        const { token, expiresAt } = createSession(user.id);
        const IS_PROD = process.env.NODE_ENV === 'production';
        res.cookie('session', token, {
            httpOnly: true,
            sameSite: 'lax',
            path: '/',
            ...(IS_PROD && { secure: true }),
            expires: new Date(expiresAt),
        });

        const state = typeof req.query.state === 'string' && req.query.state.startsWith('/') ? req.query.state : (user.is_admin ? '/admin.html' : '/app');
        res.redirect(state);
    })(req, res, next);
});

router.get('/google/client-id', (req, res) => {
    res.json({ clientId: integ.get('integ.oauth.google_client_id') || '' });
});

// Google One-Tap (credential verification)
router.post('/google/onetap', async (req, res) => {
    try {
        const { credential } = req.body || {};
        if (!credential) return res.status(400).json({ error: 'credential required' });

        const clientId = integ.get('integ.oauth.google_client_id');
        if (!clientId) return res.status(503).json({ error: 'Google One-Tap not configured' });

        const { OAuth2Client } = require('google-auth-library');
        const client = new OAuth2Client(clientId);

        const ticket = await client.verifyIdToken({
            idToken: credential,
            audience: clientId,
        });
        const payload = ticket.getPayload();
        if (!payload) return res.status(400).json({ error: 'Invalid token' });

        const googleId = payload.sub;
        const email = (payload.email || '').toLowerCase().trim();
        const displayName = payload.name || email.split('@')[0];
        const avatarUrl = payload.picture || null;

        let user = db.prepare('SELECT * FROM users WHERE google_id = ?').get(googleId);
        if (!user && email) {
            user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
            if (user) {
                db.prepare(
                    `UPDATE users SET google_id = ?, email_verified = 1,
                     display_name = COALESCE(?, display_name), avatar_url = COALESCE(?, avatar_url)
                     WHERE id = ?`
                ).run(googleId, displayName, avatarUrl, user.id);
                user = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
            }
        }
        if (!user) {
            const ip = req.headers['x-forwarded-for'] ? req.headers['x-forwarded-for'].split(',')[0].trim() : req.socket.remoteAddress;
            checkIpAccountLimit(ip, email);

            const now = Date.now();
            const trialHours = Number(getSetting('trial_duration_hours', '24'));
            const trialExpiresAt = now + trialHours * 60 * 60 * 1000;
            const adminEmail = (process.env.ADMIN_EMAIL || '').toLowerCase().trim();
            const isAdmin = adminEmail && email === adminEmail ? 1 : 0;

            let country = null;
            if (ip) {
                const geo = geoip.lookup(ip);
                if (geo) country = geo.country;
            }

            const info = db.prepare(
                `INSERT INTO users
                   (email, password_hash, created_at, plan, trial_expires_at, is_admin,
                    email_verified, google_id, display_name, avatar_url, ip_address, country)
                 VALUES (?, '', ?, 'trial', ?, ?, 1, ?, ?, ?, ?, ?)`
            ).run(email, now, trialExpiresAt, isAdmin, googleId, displayName, avatarUrl, ip, country);
            user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
        }

        const { claimGuestData } = require('./guest');
        const guestId = req.cookies && req.cookies.kotha_guest_id;
        if (guestId) claimGuestData(guestId, user.id);

        const { token, expiresAt } = createSession(user.id);
        const IS_PROD = process.env.NODE_ENV === 'production';
        res.cookie('session', token, {
            httpOnly: true,
            sameSite: 'lax',
            path: '/',
            ...(IS_PROD && { secure: true }),
            expires: new Date(expiresAt),
        });

        const redirect = user.is_admin ? '/admin.html' : '/app';
        res.json({ ok: true, redirect, user: { id: user.id, email: user.email, display_name: user.display_name, avatar_url: user.avatar_url } });
    } catch (err) {
        console.error('Google One-Tap error:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = { router, configured, resetStrategy };
