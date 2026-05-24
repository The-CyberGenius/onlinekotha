require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const fs = require('fs');
const path = require('path');

const { db } = require('./server/db');
const {
    authMiddleware,
    requireUser,
    createUser,
    login,
    logout,
    effectivePlan,
} = require('./server/auth');
const { getMessages } = require('./server/cache');
const { upload, handleUpload, SRC_DIR, userDir } = require('./server/upload');
const adminRouter = require('./server/admin');
const aiRouter = require('./server/ai');
const emailModule = require('./server/email');
const { sendVerifyEmail, sendPasswordResetEmail, consumeToken } = emailModule;
const { router: billingRouter, webhookHandler } = require('./server/billing');
const { router: oauthRouter } = require('./server/oauth');
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

const app = express();
const PORT = process.env.PORT || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

// Trust Nginx reverse proxy (for rate-limit, secure cookies, etc.)
app.set('trust proxy', 1);

// Shared cookie options — must be identical for set and clear
const COOKIE_OPTS = {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    ...(IS_PROD && { secure: true }),
};

if (!fs.existsSync(SRC_DIR)) fs.mkdirSync(SRC_DIR, { recursive: true });

app.use(helmet({ contentSecurityPolicy: false }));

// Stripe webhook needs raw body — must come BEFORE express.json()
app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), webhookHandler);

app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    next();
});

app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());
app.use(authMiddleware);

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // 100 requests per IP
    message: { error: 'Too many requests, please try again after 15 minutes' }
});

// ---------- Auth routes ----------
app.post('/api/auth/signup', authLimiter, async (req, res) => {
    try {
        const { email, password } = req.body || {};
        if (!email || !password) return res.status(400).json({ error: 'email + password required' });
        if (password.length < 6) return res.status(400).json({ error: 'password min 6 chars' });
        const user = createUser(email.trim(), password);
        const { token, expiresAt } = login(email.trim(), password);
        res.cookie('session', token, { ...COOKIE_OPTS, expires: new Date(expiresAt) });
        sendVerifyEmail(user).catch(err => console.error('verify email failed:', err.message));
        res.json({ ok: true, user: { ...user, effective_plan: effectivePlan(user) } });
    } catch (err) {
        if (err.code === 'EMAIL_EXISTS') return res.status(409).json({ error: 'Email already registered' });
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/auth/verify', (req, res) => {
    const token = req.query.token;
    const row = consumeToken(token, 'verify');
    if (!row) return res.redirect('/verify-failed.html');
    db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(row.user_id);
    res.redirect('/verify-success.html');
});

app.post('/api/auth/forgot', async (req, res) => {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ error: 'email required' });
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
    // Always return ok (don't leak which emails exist)
    if (user) {
        sendPasswordResetEmail(user).catch(err => console.error('reset email failed:', err.message));
    }
    res.json({ ok: true });
});

app.post('/api/auth/reset', async (req, res) => {
    const { token, password } = req.body || {};
    if (!token || !password) return res.status(400).json({ error: 'token + password required' });
    if (password.length < 6) return res.status(400).json({ error: 'password min 6 chars' });
    const row = consumeToken(token, 'reset');
    if (!row) return res.status(400).json({ error: 'Invalid or expired link' });
    const hash = bcrypt.hashSync(password, 10);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, row.user_id);
    // Invalidate all sessions for security
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(row.user_id);
    res.json({ ok: true });
});

app.post('/api/auth/resend-verify', (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Login required' });
    const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (u.email_verified) return res.json({ ok: true, already: true });
    sendVerifyEmail(u).catch(err => console.error('verify resend failed:', err.message));
    res.json({ ok: true });
});

app.post('/api/auth/login', authLimiter, (req, res) => {
    try {
        const { email, password } = req.body || {};
        if (!email || !password) return res.status(400).json({ error: 'email + password required' });
        const { token, expiresAt } = login(email.trim(), password);
        res.cookie('session', token, { ...COOKIE_OPTS, expires: new Date(expiresAt) });
        res.json({ ok: true });
    } catch (err) {
        res.status(401).json({ error: err.message });
    }
});

app.post('/api/auth/logout', (req, res) => {
    const token = req.cookies && req.cookies.session;
    logout(token);
    res.clearCookie('session', COOKIE_OPTS);
    res.json({ ok: true });
});

// OAuth routes (Google) — mounted under /api/auth so they sit alongside the rest
app.use('/api/auth', oauthRouter);

app.get('/api/auth/me', (req, res) => {
    if (!req.user) return res.json({ user: null });
    res.json({
        user: {
            ...req.user,
            effective_plan: effectivePlan(req.user),
        },
    });
});

// ---------- Admin (must come BEFORE static so /admin routes aren't shadowed) ----------
app.use('/api/admin', adminRouter);

// /app → main viewer (app.html), redirect to login if not authed
app.get('/app', (req, res) => {
    if (!req.user) return res.redirect('/login.html');
    res.sendFile(path.join(__dirname, 'public', 'app.html'));
});

// Health check
app.get('/healthz', (req, res) => res.json({ ok: true, time: Date.now() }));

// Static frontend (landing /, login, admin, css, js, etc.)
app.use(express.static(path.join(__dirname, 'public')));

// Media: serve only the requesting user's files
// URL: /media/<chatFolder>/<filename>  → src/u_<userId>/<chatFolder>/<filename>
app.get('/media/*rest', requireUser, (req, res, next) => {
    // Express 5: req.params.rest is an array of decoded path segments
    const rel = Array.isArray(req.params.rest)
        ? req.params.rest.join('/')
        : req.params.rest;
    const userRel = `u_${req.user.id}/${rel}`;
    const fullPath = path.resolve(SRC_DIR, userRel);

    // Prevent path traversal
    const userBase = path.resolve(SRC_DIR, `u_${req.user.id}`);
    if (!fullPath.startsWith(userBase)) return res.status(403).end();

    if (!fs.existsSync(fullPath)) return res.status(404).end();
    res.sendFile(fullPath);
});

// ---------- Chats API (user-scoped) ----------
app.get('/api/chats', requireUser, (req, res) => {
    const myDir = userDir(req.user.id);
    if (!fs.existsSync(myDir)) return res.json([]);
    // Get soft-deleted folder names to exclude
    const deletedRows = db.prepare(
        'SELECT folder_name FROM chats WHERE user_id = ? AND deleted_by_user = 1'
    ).all(req.user.id);
    const deletedSet = new Set(deletedRows.map(r => r.folder_name));

    const folders = fs
        .readdirSync(myDir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name)
        .filter(name => {
            if (deletedSet.has(name)) return false;
            const dir = path.join(myDir, name);
            return fs.readdirSync(dir).some(f => /chat.*\.txt$/i.test(f));
        });
    res.json(folders);
});

app.get('/api/messages', requireUser, async (req, res) => {
    const chatName = req.query.chat;
    if (!chatName) return res.status(400).json({ error: 'No chat specified' });

    const myDir = userDir(req.user.id);
    const chatDir = path.join(myDir, chatName);
    if (!path.normalize(chatDir).startsWith(myDir)) {
        return res.status(403).json({ error: 'Invalid path' });
    }

    try {
        const result = await getMessages(chatDir);
        res.json(result.messages);
    } catch (err) {
        if (err.code === 'NO_CHAT_FILE') return res.status(404).json({ error: 'Chat file not found' });
        console.error('Messages error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/upload', requireUser, (req, res, next) => {
    upload.array('files')(req, res, err => {
        if (err) {
            if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'File too large — max 500 MB' });
            return res.status(400).json({ error: err.message || 'Upload error' });
        }
        next();
    });
}, handleUpload);

app.delete('/api/chats/:name', requireUser, (req, res) => {
    const myDir = userDir(req.user.id);
    const chatDir = path.join(myDir, req.params.name);
    if (!path.normalize(chatDir).startsWith(myDir)) return res.status(403).json({ error: 'Invalid path' });
    if (!fs.existsSync(chatDir)) return res.status(404).json({ error: 'Chat not found' });
    // Soft delete — mark as deleted so admin still has access
    db.prepare('UPDATE chats SET deleted_by_user = 1 WHERE user_id = ? AND folder_name = ?')
        .run(req.user.id, req.params.name);
    res.json({ ok: true });
});

app.use('/api/ai', aiRouter);
app.use('/api/billing', billingRouter);

// 404 fallback (must be last)
app.use((req, res) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'Not found' });
    }
    res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    if (!process.env.ENCRYPTION_SECRET) {
        console.warn('⚠️  ENCRYPTION_SECRET missing in .env — providers admin pages will fail');
    }
    if (!process.env.ADMIN_EMAIL) {
        console.warn('⚠️  ADMIN_EMAIL not set — signup with that email to become admin');
    }
});
