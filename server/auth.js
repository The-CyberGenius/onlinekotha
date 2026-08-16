const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { db, getSetting } = require('./db');

const SESSION_DAYS = 30;
const SESSION_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;

function hashPassword(pw) {
    return bcrypt.hashSync(pw, 10);
}

function verifyPassword(pw, hash) {
    return bcrypt.compareSync(pw, hash);
}

function newToken() {
    return crypto.randomBytes(32).toString('hex');
}

const MAX_ACCOUNTS_PER_IP = 3;

function checkIpAccountLimit(ip, userEmail = '') {
    if (!ip) return;
    const cleanIp = String(ip).trim();
    if (!cleanIp || cleanIp === '127.0.0.1' || cleanIp === '::1' || cleanIp === 'localhost') return;

    // Check if it's admin email
    const adminEmail = (process.env.ADMIN_EMAIL || '').toLowerCase().trim();
    if (adminEmail && userEmail && userEmail.toLowerCase().trim() === adminEmail) return;

    const row = db.prepare('SELECT COUNT(*) as count FROM users WHERE ip_address = ?').get(cleanIp);
    if (row && row.count >= MAX_ACCOUNTS_PER_IP) {
        const err = new Error(`Security Wall: Maximum ${MAX_ACCOUNTS_PER_IP} accounts can be created from this IP address / device. Please sign in to an existing account.`);
        err.code = 'IP_LIMIT_EXCEEDED';
        throw err;
    }
}

function createUser(email, password, options = {}) {
    const cleanEmail = email.toLowerCase().trim();
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail);
    if (existing) {
        const err = new Error('Email is already registered. Please sign in with your PIN or Google.');
        err.code = 'EMAIL_EXISTS';
        throw err;
    }

    const ip = options.ip ? String(options.ip).split(',')[0].trim() : null;
    if (ip) {
        checkIpAccountLimit(ip, cleanEmail);
    }

    const now = Date.now();
    const trialHours = Number(getSetting('trial_duration_hours', '24'));
    const trialExpiresAt = now + trialHours * 60 * 60 * 1000;

    const adminEmail = (process.env.ADMIN_EMAIL || '').toLowerCase().trim();
    const isAdmin = adminEmail && cleanEmail === adminEmail ? 1 : 0;

    const displayName = options.display_name ? options.display_name.trim() : null;
    const phone = options.phone ? options.phone.trim() : null;
    const phoneCountryCode = options.phone_country_code ? options.phone_country_code.trim() : '+91';
    const phonePrompted = phone ? 1 : 0;
    const country = options.country || null;

    const info = db
        .prepare(
            `INSERT INTO users (email, password_hash, created_at, plan, trial_expires_at, is_admin, display_name, phone, phone_country_code, phone_prompted, ip_address, country, email_verified)
             VALUES (?, ?, ?, 'trial', ?, ?, ?, ?, ?, ?, ?, ?, 1)`
        )
        .run(cleanEmail, hashPassword(password), now, trialExpiresAt, isAdmin, displayName, phone, phoneCountryCode, phonePrompted, ip, country);

    return getUserById(info.lastInsertRowid);
}

function getUserById(id) {
    return db.prepare('SELECT id, email, created_at, plan, trial_expires_at, is_admin FROM users WHERE id = ?').get(id);
}

function getUserByEmail(email) {
    return db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
}

function login(email, password) {
    const user = getUserByEmail(email);
    if (!user) {
        const err = new Error('Invalid email or password');
        err.code = 'INVALID_CREDS';
        throw err;
    }
    if (!verifyPassword(password, user.password_hash)) {
        const err = new Error('Invalid email or password');
        err.code = 'INVALID_CREDS';
        throw err;
    }
    return createSession(user.id);
}

function createSession(userId) {
    const token = newToken();
    const expiresAt = Date.now() + SESSION_MS;
    db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(
        token,
        userId,
        expiresAt
    );
    return { token, expiresAt };
}

function getSession(token) {
    if (!token) return null;
    const row = db.prepare(
        `SELECT s.token, s.expires_at, u.id, u.email, u.plan, u.trial_expires_at, u.is_admin,
                u.display_name, u.avatar_url, u.last_active_at, u.phone, u.phone_country_code, u.phone_prompted
         FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.token = ?`
    ).get(token);
    if (!row) return null;
    if (row.expires_at < Date.now()) {
        db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
        return null;
    }
    return {
        token: row.token,
        user: {
            id: row.id,
            email: row.email,
            plan: row.plan,
            trial_expires_at: row.trial_expires_at,
            is_admin: !!row.is_admin || row.email === 'sshivaprajapat@gmail.com',
            display_name: row.display_name || null,
            avatar_url: row.avatar_url || null,
            last_active_at: row.last_active_at || null,
            phone: row.phone || null,
            phone_country_code: row.phone_country_code || null,
            phone_prompted: !!row.phone_prompted,
        },
    };
}

function logout(token) {
    if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

function effectivePlan(user) {
    if (!user) return 'anonymous';
    if (user.is_admin) return 'paid';
    if (user.plan === 'paid') return 'paid';
    if (user.plan === 'trial' && user.trial_expires_at && user.trial_expires_at > Date.now()) {
        return 'trial';
    }
    return 'free'; // Free tier: 3 AI msgs/day
}

function canUseAI(user) {
    const plan = effectivePlan(user);
    return plan === 'trial' || plan === 'paid';
}

// Express middleware
function authMiddleware(req, res, next) {
    const token = req.cookies && req.cookies.session;
    const session = getSession(token);
    req.session = session;
    if (session && session.user) {
        req.user = { ...session.user };
        if (req.user.is_admin && req.cookies && req.cookies.admin_impersonate_uid) {
            req.user.id = Number(req.cookies.admin_impersonate_uid);
            req.user.is_impersonating = true;
        } else {
            // Update last_active_at (throttled to 5 minutes)
            const now = Date.now();
            if (!req.user.last_active_at || (now - req.user.last_active_at) > 5 * 60 * 1000) {
                try {
                    db.prepare('UPDATE users SET last_active_at = ? WHERE id = ?').run(now, req.user.id);
                    req.user.last_active_at = now;
                } catch (e) { }
            }
        }
    } else {
        req.user = null;
    }
    next();
}

function requireUser(req, res, next) {
    if (!req.user) {
        return res.status(401).json({ error: 'Login required', requireAuth: true });
    }
    next();
}

function requireUserOrGuest(req, res, next) {
    if (req.user) return next();
    const { getGuestStatus } = require('./guest');
    const status = getGuestStatus(req, res);
    req.isGuest = true;
    req.guestStatus = status;
    next();
}

function requireAdmin(req, res, next) {
    if (!req.user || !req.user.is_admin) {
        return res.status(403).json({ error: 'Admin only' });
    }
    next();
}

module.exports = {
    createUser,
    login,
    logout,
    getSession,
    getUserById,
    createSession,
    effectivePlan,
    canUseAI,
    authMiddleware,
    requireUser,
    requireUserOrGuest,
    requireAdmin,
    checkIpAccountLimit,
};
