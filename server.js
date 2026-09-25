require('dotenv').config();
const express = require('express');
const compression = require('compression');
const { errorHandler } = require('./server/middleware/errorHandler');
const cookieParser = require('cookie-parser');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const dmUploadDir = path.join(__dirname, 'public', 'uploads', 'dm');
if (!fs.existsSync(dmUploadDir)) fs.mkdirSync(dmUploadDir, { recursive: true });
const dmUpload = multer({
    storage: multer.diskStorage({
        destination: dmUploadDir,
        filename: (req, file, cb) => cb(null, `dm_${Date.now()}_${Math.random().toString(36).slice(2,8)}_${file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_')}`)
    }),
    limits: { fileSize: 50 * 1024 * 1024 }
});

const { db } = require('./server/db');
const {
    authMiddleware,
    requireUser,
    requireUserOrGuest,
    createUser,
    createSession,
    login,
    logout,
    effectivePlan,
    getSession,
} = require('./server/auth');
const { getGuestStatus, getOrCreateGuestId } = require('./server/guest');
const { getMessages } = require('./server/cache');
const { upload, handleUpload, SRC_DIR, userDir } = require('./server/upload');
const { findChatFile } = require('./server/parser');
const { countWords, checkBurstLimit } = require('./server/rateLimit');
const adminRouter = require('./server/admin');
const aiRouter = require('./server/ai');
const globalChatRouter = require('./server/globalChat');
const contactRouter = require('./server/contact');
const emailModule = require('./server/email');
const { sendVerifyEmail, sendPasswordResetEmail, consumeToken } = emailModule;


const { router: oauthRouter } = require('./server/oauth');
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const geoip = require('geoip-lite');

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

const http = require('http');
const { Server: SocketIO } = require('socket.io');

const IS_PROD = process.env.NODE_ENV === 'production';

const app = express();
const httpServer = http.createServer(app);
const io = new SocketIO(httpServer, {
    cors: {
        origin: IS_PROD
            ? ['https://onlinekotha.com', 'https://www.onlinekotha.com']
            : ['http://localhost:3000', 'http://127.0.0.1:3000'],
        methods: ['GET', 'POST'],
        credentials: true
    }
});
app.set('io', io);

// Trust proxy for rate limiter (running behind Nginx)
app.set('trust proxy', 1);

const PORT = process.env.PORT || 3000;

// Shared cookie options — must be identical for set and clear
const COOKIE_OPTS = {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    ...(IS_PROD && { secure: true }),
};

if (!fs.existsSync(SRC_DIR)) fs.mkdirSync(SRC_DIR, { recursive: true });

// ---------- Security & Middlewares ----------
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
}));
app.use(compression({
    filter: (req, res) => {
        if (req.headers['accept'] && req.headers['accept'].includes('text/event-stream')) {
            return false;
        }
        return compression.filter(req, res);
    }
}));
app.use(cookieParser());

// Payment webhooks need the raw body for signature verification — must come BEFORE express.json()
app.use(express.json({
    verify: (req, res, buf) => {
        req.rawBody = buf;
    }
}));
app.use(express.urlencoded({ extended: true }));
app.use(authMiddleware);

const authRouter = require('./server/routes/auth.routes');
app.use('/api/auth', authRouter);

const userRouter = require('./server/routes/user.routes');
app.use('/api/user', userRouter);

// ---------- Admin (must come BEFORE static so /admin routes aren't shadowed) ----------
app.use('/api/admin', adminRouter);

// /admin → redirect to /admin.html (only if admin)
app.get('/admin', (req, res) => {
    if (!req.user || !req.user.is_admin) {
        return res.redirect('/login.html?redirect=/admin.html');
    }
    res.redirect('/admin.html');
});

// /app → main viewer (app.html). Allows both authenticated users & guests!
app.get('/app', (req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.sendFile(path.join(__dirname, 'public', 'app.html'));
});

// Share Target fallback — if the service worker isn't active yet, the shared
// POST hits the server. Just bounce into the app (SW handles it once installed).
app.post('/share-target', (req, res) => res.redirect('/app'));
app.get('/share-target', (req, res) => res.redirect('/app'));

// Health check
app.get('/healthz', (req, res) => res.json({ ok: true, time: Date.now() }));

// Static frontend (landing /, login, admin, css, js, etc.) with caching
app.get('/admin.html', (req, res) => {
    if (!req.user || !req.user.is_admin) {
        return res.redirect('/login.html?redirect=/admin.html');
    }
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});
app.get('/', (req, res, next) => {
    const ua = req.headers['user-agent'] || '';
    if (ua.includes('OnlineKothaApp')) {
        if (req.user) {
            return res.redirect('/app');
        }
        return res.redirect('/login');
    }
    next();
});

app.use(express.static(path.join(__dirname, 'public'), {
    maxAge: '365d',
    etag: true,
    dotfiles: 'allow',
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache, must-revalidate');
        } else {
            res.setHeader('Vary', 'Accept-Encoding');
        }
    }
}));


// Helper to get storage directory for either User or Guest
function getOwnerId(req, res) {
    if (req.user) return req.user.id;
    return getOrCreateGuestId(req, res);
}

// Media: serve only the requesting user's files
const mediaRouter = require('./server/routes/media.routes');
app.use('/media', mediaRouter);

const chatRouter = require('./server/routes/chat.routes');
app.use('/api', chatRouter);

const uploadRouter = require('./server/routes/upload.routes');
app.use('/api/upload', uploadRouter);

app.use('/api/ai', aiRouter);


app.use('/api/global-chat', globalChatRouter);
app.use('/api/contact', contactRouter);

const demoRouter = require('./server/routes/demo.routes');
app.use('/api/demo-chat', demoRouter);

const dodoRouter = require('./server/routes/dodo.routes');
app.use('/api/dodo', dodoRouter);

const analyticsRouter = require('./server/routes/analytics.routes');
app.use('/api/analytics', analyticsRouter);

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
            // email intentionally NOT returned — privacy: only you know the email you searched
        },
    });
});

// ─────────────────────────────────────────────
// DM Presence & Real-time State Store
// ─────────────────────────────────────────────
const onlineUsers = new Map(); // userId → Set of socketIds
app.locals.onlineUsers = onlineUsers;

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

    const nickRow = db.prepare('SELECT nickname FROM dm_contact_nicknames WHERE user_id = ? AND contact_id = ?').get(req.user.id, otherId);
    const originalName = other.display_name || other.email.split('@')[0];

    res.json({
        conv_id: conv.id,
        other: {
            id: other.id,
            display_name: nickRow ? nickRow.nickname : originalName,
            original_display_name: originalName,
            email: other.email,
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
        const nickRow = db.prepare('SELECT nickname FROM dm_contact_nicknames WHERE user_id = ? AND contact_id = ?').get(req.user.id, r.other_id);
        const originalName = u ? (u.display_name || u.email.split('@')[0]) : 'User';
        return {
            conv_id: r.conv_id,
            other: {
                id: u ? u.id : r.other_id,
                display_name: nickRow ? nickRow.nickname : originalName,
                original_display_name: originalName,
                email: u ? u.email : '',
                avatar_url: u ? u.avatar_url : null,
            },
            last_msg: r.last_msg || '',
            last_at: r.last_at || 0,
            unread: r.unread || 0,
        };
    });

    res.json(result);
});

// Set custom nickname for a contact
app.put('/api/dm/contacts/:contactId/nickname', requireUser, (req, res) => {
    const contactId = Number(req.params.contactId);
    const nickname = (req.body?.nickname || '').trim();
    const userId = req.user.id;

    if (!contactId) return res.status(400).json({ error: 'Invalid contactId' });

    const contact = db.prepare('SELECT display_name, email FROM users WHERE id = ?').get(contactId);
    if (!contact) return res.status(404).json({ error: 'Contact not found' });
    const originalName = contact.display_name || contact.email.split('@')[0];

    if (!nickname) {
        db.prepare('DELETE FROM dm_contact_nicknames WHERE user_id = ? AND contact_id = ?').run(userId, contactId);
        return res.json({ ok: true, nickname: null, display_name: originalName, original_display_name: originalName });
    }

    db.prepare(`
        INSERT INTO dm_contact_nicknames (user_id, contact_id, nickname, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(user_id, contact_id) DO UPDATE SET nickname = excluded.nickname, updated_at = excluded.updated_at
    `).run(userId, contactId, nickname, Date.now());

    res.json({ ok: true, nickname, display_name: nickname, original_display_name: originalName });
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
app.post('/api/dm/upload', requireUser, dmUpload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const url = `/uploads/dm/${req.file.filename}`;
    res.json({ url });
});

app.post('/api/dm/conversations/:id/messages', requireUser, (req, res) => {
    const convId = Number(req.params.id);
    const body   = (req.body?.body || '').trim();
    const type   = req.body?.type || 'text';
    const media_url = req.body?.media_url || null;

    if (!body && !media_url) return res.status(400).json({ error: 'Empty message' });

    if (body && countWords(body) > 300) {
        return res.status(400).json({ error: 'Message exceeds limit (max 300 words). Please shorten your message to prevent server slowdown.' });
    }

    const burstCheck = checkBurstLimit(`dm_${req.user.id}`);
    if (!burstCheck.allowed) {
        return res.status(429).json({ error: burstCheck.error });
    }

    const conv = db.prepare(
        'SELECT * FROM dm_conversations WHERE id = ? AND (user_a = ? OR user_b = ?)'
    ).get(convId, req.user.id, req.user.id);
    if (!conv) return res.status(403).json({ error: 'Not your conversation' });

    const reply_to_id = req.body?.reply_to_id ? Number(req.body.reply_to_id) : null;

    const now    = Date.now();
    const result = db.prepare(
        'INSERT INTO dm_messages (conv_id, sender_id, body, type, media_url, created_at, read_at, reply_to_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(convId, req.user.id, body, type, media_url, now, now, reply_to_id);

    const msg = {
        id: result.lastInsertRowid, conv_id: convId,
        sender_id: req.user.id, body, type, media_url: media_url,
        created_at: now, read_at: now, reply_to_id,
        display_name: req.user.display_name || req.user.email.split('@')[0],
        avatar_url: req.user.avatar_url,
    };

    // Attach replied-to message data
    if (reply_to_id) {
        const replied = db.prepare('SELECT dm.body, dm.type, dm.sender_id, u.display_name as reply_sender_name FROM dm_messages dm JOIN users u ON u.id = dm.sender_id WHERE dm.id = ?').get(reply_to_id);
        if (replied) {
            msg.reply_to_body = replied.body;
            msg.reply_to_type = replied.type;
            msg.reply_to_sender_name = replied.reply_sender_name;
            msg.reply_to_sender_id = replied.sender_id;
        }
    }

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
        SELECT dm.*, u.display_name, u.avatar_url, u.email,
               r.body as reply_to_body, r.type as reply_to_type, r.sender_id as reply_to_sender_id,
               ru.display_name as reply_to_sender_name
        FROM dm_messages dm
        JOIN users u ON u.id = dm.sender_id
        LEFT JOIN dm_messages r ON r.id = dm.reply_to_id
        LEFT JOIN users ru ON ru.id = r.sender_id
        WHERE dm.conv_id = ? AND dm.created_at < ? AND dm.created_at > ?
        ORDER BY dm.created_at DESC
        LIMIT 40
    `).all(convId, before, after);

    // Mark messages as read
    const now = Date.now();
    const updateResult = db.prepare(
        'UPDATE dm_messages SET read_at = ? WHERE conv_id = ? AND sender_id != ? AND read_at IS NULL'
    ).run(now, convId, req.user.id);

    if (updateResult.changes > 0) {
        const otherId = conv.user_a === req.user.id ? conv.user_b : conv.user_a;
        const sockets = onlineUsers.get(otherId);
        if (sockets) {
            sockets.forEach(sid => io.to(sid).emit('dm:read', { conv_id: convId }));
        }
    }

    // Include my_id so frontend knows which side is "me" — guaranteed correct
    res.json({ messages: msgs.reverse(), my_id: req.user.id });
});

// DM Presence API endpoint
app.get('/api/dm/presence', requireUser, (req, res) => {
    const onlineIds = Array.from(onlineUsers.keys()).map(Number);
    res.json({ online_user_ids: onlineIds });
});

// ─────────────────────────────────────────────
// Socket.IO — real-time DM
// ─────────────────────────────────────────────

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
    const uid = Number(socket.user.id);
    const isFirstConnection = !onlineUsers.has(uid) || onlineUsers.get(uid).size === 0;
    if (!onlineUsers.has(uid)) onlineUsers.set(uid, new Set());
    onlineUsers.get(uid).add(socket.id);

    // Send immediate initial presence list to this newly connected user
    const currentOnlineIds = Array.from(onlineUsers.keys()).map(Number);
    socket.emit('presence:init', { online_user_ids: currentOnlineIds });

    // Broadcast user:online to everyone else if this is their first active socket
    if (isFirstConnection) {
        io.emit('user:online', { user_id: uid });
    }

    socket.on('dm:get_presence', () => {
        socket.emit('presence:init', { online_user_ids: Array.from(onlineUsers.keys()).map(Number) });
    });

    socket.on('dm:send', (data) => {
        const { conv_id, body } = data;
        const type = data.type || 'text';
        const media_url = data.media_url || null;
        
        if (!conv_id) return;
        if ((!body || !body.trim()) && !media_url) return;

        if (body && countWords(body) > 300) {
            return socket.emit('dm:error', { error: 'Message exceeds limit (max 300 words). Please shorten your message to prevent server slowdown.' });
        }

        const burstCheck = checkBurstLimit(`dm_${uid}`);
        if (!burstCheck.allowed) {
            return socket.emit('dm:error', { error: burstCheck.error });
        }

        // Verify sender is part of this conversation
        const conv = db.prepare(
            'SELECT * FROM dm_conversations WHERE id = ? AND (user_a = ? OR user_b = ?)'
        ).get(conv_id, uid, uid);
        if (!conv) return;

        const reply_to_id = data.reply_to_id ? Number(data.reply_to_id) : null;

        const now = Date.now();
        const result = db.prepare(
            'INSERT INTO dm_messages (conv_id, sender_id, body, type, media_url, created_at, reply_to_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).run(conv_id, uid, body ? body.trim() : '', type, media_url, now, reply_to_id);

        const msg = {
            id: result.lastInsertRowid,
            conv_id,
            sender_id: uid,
            body: body ? body.trim() : '',
            type,
            media_url,
            created_at: now,
            read_at: null,
            reply_to_id,
            display_name: socket.user.display_name || socket.user.email.split('@')[0],
            avatar_url: socket.user.avatar_url,
        };

        // Attach replied-to message data if replying
        if (reply_to_id) {
            const replied = db.prepare('SELECT dm.body, dm.type, dm.sender_id, u.display_name as reply_sender_name FROM dm_messages dm JOIN users u ON u.id = dm.sender_id WHERE dm.id = ?').get(reply_to_id);
            if (replied) {
                msg.reply_to_body = replied.body;
                msg.reply_to_type = replied.type;
                msg.reply_to_sender_name = replied.reply_sender_name;
                msg.reply_to_sender_id = replied.sender_id;
            }
        }

        // Send to both users (all their open sockets)
        const otherId = conv.user_a === uid ? conv.user_b : conv.user_a;
        [uid, otherId].forEach(targetId => {
            const sockets = onlineUsers.get(targetId);
            if (sockets) sockets.forEach(sid => io.to(sid).emit('dm:message', msg));
        });

    });

    socket.on('dm:mark_read', ({ conv_id }) => {
        const conv = db.prepare(
            'SELECT * FROM dm_conversations WHERE id = ? AND (user_a = ? OR user_b = ?)'
        ).get(conv_id, uid, uid);
        if (!conv) return;

        const now = Date.now();
        const updateResult = db.prepare(
            'UPDATE dm_messages SET read_at = ? WHERE conv_id = ? AND sender_id != ? AND read_at IS NULL'
        ).run(now, conv_id, uid);

        if (updateResult.changes > 0) {
            const otherId = conv.user_a === uid ? conv.user_b : conv.user_a;
            const sockets = onlineUsers.get(otherId);
            if (sockets) {
                sockets.forEach(sid => io.to(sid).emit('dm:read', { conv_id }));
            }
        }
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
                io.emit('user:offline', { user_id: uid });
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

// Global Error Handler
app.use(errorHandler);

httpServer.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    if (!process.env.ENCRYPTION_SECRET) {
        console.warn('⚠️  ENCRYPTION_SECRET missing in .env — providers admin pages will fail');
    }
    if (!process.env.ADMIN_EMAIL) {
        console.warn('⚠️  ADMIN_EMAIL not set — signup with that email to become admin');
    }
});
