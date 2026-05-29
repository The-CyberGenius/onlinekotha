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
const globalChatRouter = require('./server/globalChat');
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

const http = require('http');
const { Server: SocketIO } = require('socket.io');

const app = express();
const httpServer = http.createServer(app);
const io = new SocketIO(httpServer, { cors: { origin: false } });
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

// app.use(helmet({ contentSecurityPolicy: false }));

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
    message: { error: 'Too many requests, please try again after 15 minutes' },
    validate: false,
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
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
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

    // Set proper Content-Type for video files so browsers can stream/seek them.
    // Especially important: .mov is video/mp4 on the wire (same container, Chrome needs this).
    const ext = path.extname(fullPath).toLowerCase();
    const MIME_MAP = {
        '.mp4': 'video/mp4', '.mov': 'video/mp4', '.m4v': 'video/mp4',
        '.webm': 'video/webm',
        '.3gp': 'video/3gpp',
        '.mkv': 'video/x-matroska',
        '.avi': 'video/x-msvideo',
        '.m4a': 'audio/mp4', '.aac': 'audio/aac',
        '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg',
        '.opus': 'audio/ogg; codecs=opus', '.wav': 'audio/wav',
        '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
        '.png': 'image/png', '.gif': 'image/gif',
        '.webp': 'image/webp', '.heic': 'image/heic',
    };
    if (MIME_MAP[ext]) res.setHeader('Content-Type', MIME_MAP[ext]);
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
app.use('/api/global-chat', globalChatRouter);

// ── Demo chat (landing page — no auth, IP-limited) ──
const { callLLM } = require('./server/llm');
const DEMO_LIMIT = 10;
const demoUsage = new Map(); // IP → { count, history[] }

const demoLimiter = rateLimit({
    windowMs: 60_000,
    max: 12,
    message: { error: 'Too fast. Wait a moment.' },
    validate: false,
});

app.post('/api/demo-chat', demoLimiter, async (req, res) => {
    const { message, sessionId } = req.body || {};
    if (!message || typeof message !== 'string' || message.trim().length === 0)
        return res.status(400).json({ error: 'message required' });
    if (message.length > 300)
        return res.status(400).json({ error: 'Message too long' });

    const key = `${req.ip}_${sessionId || 'x'}`;
    const usage = demoUsage.get(key) || { count: 0, history: [] };

    if (usage.count >= DEMO_LIMIT) {
        return res.status(429).json({
            error: 'Demo limit reached! Sign up for free to keep chatting.',
            remaining: 0,
            limit: DEMO_LIMIT,
        });
    }

    usage.count++;
    usage.history.push({ role: 'user', content: message.trim() });
    // Keep last 6 turns (12 messages)
    if (usage.history.length > 12) usage.history = usage.history.slice(-12);
    demoUsage.set(key, usage);

    // Cleanup old sessions every 1000 requests
    if (demoUsage.size > 5000) {
        const entries = [...demoUsage.entries()];
        entries.slice(0, 2000).forEach(([k]) => demoUsage.delete(k));
    }

    const remaining = DEMO_LIMIT - usage.count;

    // SSE setup
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const send = (event, data) => {
        res.write(`event: ${event}\n`);
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    send('start', { remaining });

    const systemPrompt = `You are "Maa" — a loving Indian mother chatting with her child (Beta) on WhatsApp.

PERSONALITY:
- You are warm, caring, slightly dramatic, always worried about food and health
- You text in Hinglish (mix of Hindi and English) — mostly Hindi
- Short messages: 1-3 lines max, like real WhatsApp
- You use emojis sparingly but lovingly: 🙏 😊 ❤️ 😘 🤗
- You call them "beta", "babu", "baccha"
- You always ask about food: "khana khaya?", "pani piyo", "dal chawal kha lo"
- Typical mom behaviors: asking about health, sleep, weather, studies/job
- Sometimes send blessings: "Bhagwan tumhe khush rakhe" 🙏
- You get dramatic about small things: "tum toh mujhe bhool hi gaye" if they haven't texted
- You type casually — no perfect grammar, sometimes skip words like real texting

RULES:
1. NEVER break character. You ARE Maa.
2. NEVER say you are AI or a chatbot.
3. Keep responses SHORT — 1-3 lines. Real WhatsApp style.
4. Respond in Hinglish (primarily Hindi with some English words).
5. Be natural, warm, and motherly.`;

    const abortController = new AbortController();
    req.on('close', () => abortController.abort());

    let fullText = '';
    try {
        await callLLM({
            feature: 'chat',
            messages: usage.history,
            systemPrompt,
            userId: null,
            signal: abortController.signal,
            onToken: (token) => {
                fullText += token;
                send('token', { text: token });
            },
        });

        usage.history.push({ role: 'assistant', content: fullText });
        if (usage.history.length > 12) usage.history = usage.history.slice(-12);
        demoUsage.set(key, usage);

        send('done', { remaining });
    } catch (err) {
        console.error('Demo chat error:', err.message);
        send('error', { message: 'AI is taking a break. Try again!' });
    } finally {
        res.end();
    }
});

// ─────────────────────────────────────────────
// DM REST API
// ─────────────────────────────────────────────

// Search user by email (exact match, privacy: only returns id + display_name + avatar_url)
app.get('/api/dm/search', requireUser, (req, res) => {
    const email = (req.query.email || '').toLowerCase().trim();
    if (!email) return res.status(400).json({ error: 'email required' });
    if (email === req.user.email) return res.status(400).json({ error: 'That\'s you!' });

    const found = db.prepare(
        'SELECT id, display_name, avatar_url, email FROM users WHERE LOWER(email) = ?'
    ).get(email);
    if (!found) return res.json({ user: null });

    res.json({
        user: {
            id: found.id,
            display_name: found.display_name || found.email.split('@')[0],
            avatar_url: found.avatar_url,
            email: found.email,
        },
    });
});

// Get or create a DM conversation with another user
app.post('/api/dm/conversations', requireUser, (req, res) => {
    const otherId = Number(req.body.user_id);
    if (!otherId || otherId === req.user.id) return res.status(400).json({ error: 'invalid user_id' });

    const other = db.prepare('SELECT id, display_name, avatar_url, email FROM users WHERE id = ?').get(otherId);
    if (!other) return res.status(404).json({ error: 'User not found' });

    // Canonical order: smaller id = user_a
    const [a, b] = req.user.id < otherId ? [req.user.id, otherId] : [otherId, req.user.id];

    db.prepare(
        'INSERT OR IGNORE INTO dm_conversations (user_a, user_b, created_at) VALUES (?, ?, ?)'
    ).run(a, b, Date.now());

    const conv = db.prepare(
        'SELECT id FROM dm_conversations WHERE user_a = ? AND user_b = ?'
    ).get(a, b);

    res.json({
        conv_id: conv.id,
        other: {
            id: other.id,
            display_name: other.display_name || other.email.split('@')[0],
            avatar_url: other.avatar_url,
        },
    });
});

// List all DM conversations for current user
app.get('/api/dm/conversations', requireUser, (req, res) => {
    const rows = db.prepare(`
        SELECT
            dc.id AS conv_id,
            CASE WHEN dc.user_a = ? THEN dc.user_b ELSE dc.user_a END AS other_id,
            (SELECT body FROM dm_messages WHERE conv_id = dc.id ORDER BY id DESC LIMIT 1) AS last_msg,
            (SELECT created_at FROM dm_messages WHERE conv_id = dc.id ORDER BY id DESC LIMIT 1) AS last_at,
            (SELECT COUNT(*) FROM dm_messages WHERE conv_id = dc.id AND sender_id != ? AND read_at IS NULL) AS unread
        FROM dm_conversations dc
        WHERE dc.user_a = ? OR dc.user_b = ?
        ORDER BY last_at DESC NULLS LAST
    `).all(req.user.id, req.user.id, req.user.id, req.user.id);

    const result = rows.map(r => {
        const u = db.prepare('SELECT id, display_name, avatar_url, email FROM users WHERE id = ?').get(r.other_id);
        return {
            conv_id: r.conv_id,
            other: {
                id: u.id,
                display_name: u.display_name || u.email.split('@')[0],
                avatar_url: u.avatar_url,
            },
            last_msg: r.last_msg || '',
            last_at: r.last_at || 0,
            unread: r.unread || 0,
        };
    });

    res.json(result);
});

// Get messages for a conversation (paginated, newest first)
// Clear all messages in a DM conversation (soft-delete for this user only)
app.delete('/api/dm/conversations/:id/messages', requireUser, (req, res) => {
    const convId = Number(req.params.id);
    const conv = db.prepare(
        'SELECT * FROM dm_conversations WHERE id = ? AND (user_a = ? OR user_b = ?)'
    ).get(convId, req.user.id, req.user.id);
    if (!conv) return res.status(403).json({ error: 'Not your conversation' });

    // Hard delete all messages in this conversation
    db.prepare('DELETE FROM dm_messages WHERE conv_id = ?').run(convId);
    res.json({ ok: true });
});

// Delete own DM message
app.delete('/api/dm/messages/:id', requireUser, (req, res) => {
    const msgId = Number(req.params.id);
    const msg = db.prepare('SELECT * FROM dm_messages WHERE id = ?').get(msgId);
    if (!msg) return res.status(404).json({ error: 'Not found' });
    if (msg.sender_id !== req.user.id) return res.status(403).json({ error: 'Not your message' });

    db.prepare('UPDATE dm_messages SET body = ?, type = ? WHERE id = ?')
      .run('This message was deleted', 'deleted', msgId);

    // Notify both users via socket
    const conv = db.prepare('SELECT * FROM dm_conversations WHERE id = ?').get(msg.conv_id);
    if (conv) {
        const otherId = conv.user_a === req.user.id ? conv.user_b : conv.user_a;
        [req.user.id, otherId].forEach(uid => {
            const sockets = onlineUsers.get(uid);
            if (sockets) sockets.forEach(sid => io.to(sid).emit('dm:deleted', { msg_id: msgId, conv_id: msg.conv_id }));
        });
    }
    res.json({ ok: true });
});

// HTTP fallback for sending a message (used when socket.io isn't connected yet)
app.post('/api/dm/conversations/:id/messages', requireUser, (req, res) => {
    const convId = Number(req.params.id);
    const body   = (req.body?.body || '').trim();
    if (!body) return res.status(400).json({ error: 'Empty message' });

    const conv = db.prepare(
        'SELECT * FROM dm_conversations WHERE id = ? AND (user_a = ? OR user_b = ?)'
    ).get(convId, req.user.id, req.user.id);
    if (!conv) return res.status(403).json({ error: 'Not your conversation' });

    const now    = Date.now();
    const result = db.prepare(
        'INSERT INTO dm_messages (conv_id, sender_id, body, type, created_at, read_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(convId, req.user.id, body, 'text', now, now);

    const msg = {
        id: result.lastInsertRowid, conv_id: convId,
        sender_id: req.user.id, body, type: 'text',
        created_at: now, read_at: now,
        display_name: req.user.display_name || req.user.email.split('@')[0],
        avatar_url: req.user.avatar_url,
    };

    // Push via socket.io if the other user is online
    const otherId = conv.user_a === req.user.id ? conv.user_b : conv.user_a;
    [req.user.id, otherId].forEach(uid => {
        const sockets = onlineUsers.get(uid);
        if (sockets) sockets.forEach(sid => io.to(sid).emit('dm:message', msg));
    });

    res.json(msg);
});

app.get('/api/dm/conversations/:id/messages', requireUser, (req, res) => {
    const convId = Number(req.params.id);
    const conv = db.prepare(
        'SELECT * FROM dm_conversations WHERE id = ? AND (user_a = ? OR user_b = ?)'
    ).get(convId, req.user.id, req.user.id);
    if (!conv) return res.status(403).json({ error: 'Not your conversation' });

    const before = Number(req.query.before) || Date.now() + 1000;
    const after  = Number(req.query.after)  || 0;
    const msgs = db.prepare(`
        SELECT dm.*, u.display_name, u.avatar_url, u.email
        FROM dm_messages dm
        JOIN users u ON u.id = dm.sender_id
        WHERE dm.conv_id = ? AND dm.created_at < ? AND dm.created_at > ?
        ORDER BY dm.created_at DESC
        LIMIT 40
    `).all(convId, before, after);

    // Mark messages as read
    db.prepare(
        'UPDATE dm_messages SET read_at = ? WHERE conv_id = ? AND sender_id != ? AND read_at IS NULL'
    ).run(Date.now(), convId, req.user.id);

    // Include my_id so frontend knows which side is "me" — guaranteed correct
    res.json({ messages: msgs.reverse(), my_id: req.user.id });
});

// ─────────────────────────────────────────────
// Socket.IO — real-time DM
// ─────────────────────────────────────────────
const onlineUsers = new Map(); // userId → Set of socketIds

io.use((socket, next) => {
    // Authenticate via session cookie (same cookie as HTTP)
    const req = socket.request;
    cookieParser()(req, {}, () => {});
    authMiddleware(req, {}, () => {});
    if (!req.user) return next(new Error('Unauthorized'));
    socket.user = req.user;
    next();
});

io.on('connection', (socket) => {
    const uid = socket.user.id;
    if (!onlineUsers.has(uid)) onlineUsers.set(uid, new Set());
    onlineUsers.get(uid).add(socket.id);

    // Broadcast presence
    socket.broadcast.emit('user:online', { user_id: uid });

    socket.on('dm:send', (data) => {
        const { conv_id, body } = data;
        if (!conv_id || !body || !body.trim()) return;

        // Verify sender is part of this conversation
        const conv = db.prepare(
            'SELECT * FROM dm_conversations WHERE id = ? AND (user_a = ? OR user_b = ?)'
        ).get(conv_id, uid, uid);
        if (!conv) return;

        const now = Date.now();
        const result = db.prepare(
            'INSERT INTO dm_messages (conv_id, sender_id, body, type, created_at) VALUES (?, ?, ?, ?, ?)'
        ).run(conv_id, uid, body.trim(), 'text', now);

        const msg = {
            id: result.lastInsertRowid,
            conv_id,
            sender_id: uid,
            body: body.trim(),
            type: 'text',
            created_at: now,
            read_at: null,
            display_name: socket.user.display_name || socket.user.email.split('@')[0],
            avatar_url: socket.user.avatar_url,
        };

        // Send to both users (all their open sockets)
        const otherId = conv.user_a === uid ? conv.user_b : conv.user_a;
        [uid, otherId].forEach(targetId => {
            const sockets = onlineUsers.get(targetId);
            if (sockets) sockets.forEach(sid => io.to(sid).emit('dm:message', msg));
        });

        // Mark as read immediately for sender (already seen)
        db.prepare('UPDATE dm_messages SET read_at = ? WHERE id = ?').run(now, result.lastInsertRowid);
    });

    socket.on('dm:typing', ({ conv_id, typing }) => {
        const conv = db.prepare(
            'SELECT * FROM dm_conversations WHERE id = ? AND (user_a = ? OR user_b = ?)'
        ).get(conv_id, uid, uid);
        if (!conv) return;
        const otherId = conv.user_a === uid ? conv.user_b : conv.user_a;
        const sockets = onlineUsers.get(otherId);
        if (sockets) sockets.forEach(sid => io.to(sid).emit('dm:typing', { conv_id, user_id: uid, typing }));
    });

    socket.on('disconnect', () => {
        const set = onlineUsers.get(uid);
        if (set) {
            set.delete(socket.id);
            if (set.size === 0) {
                onlineUsers.delete(uid);
                socket.broadcast.emit('user:offline', { user_id: uid });
            }
        }
    });
});

// 404 fallback (must be last)
app.use((req, res) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'Not found' });
    }
    res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

httpServer.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    if (!process.env.ENCRYPTION_SECRET) {
        console.warn('⚠️  ENCRYPTION_SECRET missing in .env — providers admin pages will fail');
    }
    if (!process.env.ADMIN_EMAIL) {
        console.warn('⚠️  ADMIN_EMAIL not set — signup with that email to become admin');
    }
});
