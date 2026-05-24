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

function createUser(email, password) {
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
        const err = new Error('Email already registered');
        err.code = 'EMAIL_EXISTS';
        throw err;
    }

    const now = Date.now();
    const trialHours = Number(getSetting('trial_duration_hours', '24'));
    const trialExpiresAt = now + trialHours * 60 * 60 * 1000;

    const adminEmail = (process.env.ADMIN_EMAIL || '').toLowerCase().trim();
    const isAdmin = adminEmail && email.toLowerCase() === adminEmail ? 1 : 0;

    const info = db
        .prepare(
            `INSERT INTO users (email, password_hash, created_at, plan, trial_expires_at, is_admin)
             VALUES (?, ?, ?, 'trial', ?, ?)`
        )
        .run(email.toLowerCase(), hashPassword(password), now, trialExpiresAt, isAdmin);

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
                u.display_name, u.avatar_url
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
            is_admin: !!row.is_admin,
            display_name: row.display_name || null,
            avatar_url: row.avatar_url || null,
        },
    };
}

function logout(token) {
    if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

function effectivePlan(user) {
    if (!user) return 'anonymous';
    if (user.plan === 'paid') return 'paid';
    if (user.plan === 'trial' && user.trial_expires_at && user.trial_expires_at > Date.now()) {
        return 'trial';
    }
    return 'free';
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
    req.user = session ? session.user : null;
    next();
}

function requireUser(req, res, next) {
    if (!req.user) {
        return res.status(401).json({ error: 'Login required' });
    }
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
    requireAdmin,
};
