const express = require('express');
const router = express.Router();
const { db } = require('./db');
const { requireUser } = require('./auth');

// Map of connectionKey -> { res, user }
const clients = new Map();

function broadcast(event, data) {
    const raw = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const [key, client] of clients.entries()) {
        try {
            client.res.write(raw);
        } catch (err) {
            console.error(`Error sending message to key ${key}:`, err.message);
        }
    }
}

function getOnlineUsers() {
    const unique = new Map();
    for (const [key, client] of clients.entries()) {
        const userId = client.user.id;
        if (!unique.has(userId)) {
            unique.set(userId, {
                id: userId,
                name: client.user.display_name || client.user.email.split('@')[0],
                avatar_url: client.user.avatar_url
            });
        }
    }
    return Array.from(unique.values());
}

// SSE stream endpoint
router.get('/stream', requireUser, (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // Register client connection (using userId + timestamp key to handle multiple tabs/sessions)
    const clientKey = `${req.user.id}_${Date.now()}`;
    clients.set(clientKey, { res, user: req.user });

    // Send recent 50 messages from DB
    const recent = db.prepare(`
        SELECT m.id, m.user_id, m.sender, m.text, m.created_at
        FROM global_messages m
        ORDER BY m.id DESC LIMIT 50
    `).all();
    
    // Sort chronological before sending
    recent.reverse();

    const formattedMessages = recent.map(m => {
        const d = new Date(m.created_at);
        return {
            id: m.id,
            userId: m.user_id,
            sender: m.sender,
            text: m.text,
            time: d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }),
            date: d.toLocaleDateString('en-IN')
        };
    });

    res.write(`event: history\ndata: ${JSON.stringify(formattedMessages)}\n\n`);

    // Broadcast online list update
    broadcast('online-list', getOnlineUsers());

    req.on('close', () => {
        clients.delete(clientKey);
        broadcast('online-list', getOnlineUsers());
    });
});

// Send endpoint
router.post('/send', requireUser, (req, res) => {
    const { text } = req.body || {};
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
        return res.status(400).json({ error: 'Message text required' });
    }
    if (text.length > 1000) {
        return res.status(400).json({ error: 'Message too long (max 1000 chars)' });
    }

    const now = Date.now();
    const sender = req.user.display_name || req.user.email.split('@')[0];

    // Save to DB
    const info = db.prepare(`
        INSERT INTO global_messages (user_id, sender, text, created_at)
        VALUES (?, ?, ?, ?)
    `).run(req.user.id, sender, text.trim(), now);

    const d = new Date(now);
    const msg = {
        id: info.lastInsertRowid,
        userId: req.user.id,
        sender,
        text: text.trim(),
        time: d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }),
        date: d.toLocaleDateString('en-IN')
    };

    // Broadcast message
    broadcast('message', msg);
    res.json({ ok: true });
});

module.exports = router;
