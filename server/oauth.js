const express = require('express');
const passport = require('passport');
const { Strategy: GoogleStrategy } = require('passport-google-oauth20');
const { db, getSetting } = require('./db');
const { createSession } = require('./auth');
const integ = require('./integrations');

const router = express.Router();

function getBaseUrl() {
    return integ.get('integ.app.base_url') || process.env.PUBLIC_BASE_URL || 'http://localhost:3000';
}

// Register Passport strategy lazily on each OAuth start. Idempotent.
let registeredFingerprint = null;

function ensureStrategy() {
    const clientId = integ.get('integ.oauth.google_client_id');
    const clientSecret = integ.get('integ.oauth.google_client_secret');
    if (!clientId || !clientSecret) return false;

    const callbackURL = `${getBaseUrl()}/api/auth/google/callback`;
    const fingerprint = `${clientId}|${clientSecret}|${callbackURL}`;
    if (fingerprint === registeredFingerprint) return true;

    passport.use(new GoogleStrategy({
        clientID: clientId,
        clientSecret: clientSecret,
        callbackURL,
        scope: ['profile', 'email'],
    }, (accessToken, refreshToken, profile, done) => {
        try {
            const email = (profile.emails?.[0]?.value || '').toLowerCase().trim();
            const googleId = profile.id;
            const displayName = profile.displayName || null;
            const avatarUrl = profile.photos?.[0]?.value || null;

            if (!email) return done(new Error('Google account has no email'));

            let user = db.prepare('SELECT * FROM users WHERE google_id = ?').get(googleId);
            if (!user) {
                user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
                if (user) {
                    db.prepare(
                        `UPDATE users SET google_id = ?, email_verified = 1,
                         display_name = COALESCE(display_name, ?), avatar_url = COALESCE(avatar_url, ?)
                         WHERE id = ?`
                    ).run(googleId, displayName, avatarUrl, user.id);
                    user = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
                }
            }

            if (!user) {
                const now = Date.now();
                const trialHours = Number(getSetting('trial_duration_hours', '24'));
                const trialExpiresAt = now + trialHours * 60 * 60 * 1000;
                const adminEmail = (process.env.ADMIN_EMAIL || '').toLowerCase().trim();
                const isAdmin = adminEmail && email === adminEmail ? 1 : 0;

                const info = db.prepare(
                    `INSERT INTO users
                       (email, password_hash, created_at, plan, trial_expires_at, is_admin,
                        email_verified, google_id, display_name, avatar_url)
                     VALUES (?, '', ?, 'trial', ?, ?, 1, ?, ?, ?)`
                ).run(email, now, trialExpiresAt, isAdmin, googleId, displayName, avatarUrl);
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
    if (!ensureStrategy()) return res.status(503).send('Google OAuth not configured');
    const next_ = typeof req.query.next === 'string' && req.query.next.startsWith('/') ? req.query.next : '/app';
    const state = Buffer.from(JSON.stringify({ next: next_ })).toString('base64url');
    passport.authenticate('google', { session: false, state })(req, res, next);
});

router.get('/google/callback', (req, res, next) => {
    if (!ensureStrategy()) return res.redirect('/login.html?error=oauth_disabled');
    passport.authenticate('google', { session: false, failureRedirect: '/login.html?error=oauth_failed' },
        (err, user) => {
            if (err || !user) {
                console.error('OAuth callback error:', err);
                return res.redirect('/login.html?error=oauth_failed');
            }
            const { token, expiresAt } = createSession(user.id);
            const IS_PROD = process.env.NODE_ENV === 'production';
            res.cookie('session', token, {
                httpOnly: true,
                sameSite: 'lax',
                path: '/',
                ...(IS_PROD && { secure: true }),
                expires: new Date(expiresAt),
            });
            let next_ = '/app';
            try {
                if (req.query.state) {
                    const decoded = JSON.parse(Buffer.from(req.query.state, 'base64url').toString());
                    if (typeof decoded.next === 'string' && decoded.next.startsWith('/')) next_ = decoded.next;
                }
            } catch {}
            if (user.is_admin) next_ = '/admin.html';
            res.redirect(next_);
        }
    )(req, res, next);
});

module.exports = { router, configured, resetStrategy };
