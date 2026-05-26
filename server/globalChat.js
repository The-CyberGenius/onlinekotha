const express = require('express');
const router = express.Router();
const { db } = require('./db');
const { requireUser } = require('./auth');

// Adjectives and Animals for anonymous names
const ADJECTIVES = [
    'Silly', 'Brave', 'Clever', 'Happy', 'Sleepy', 'Shiny', 'Friendly', 'Quiet', 'Active', 'Gentle',
    'Wild', 'Chill', 'Jolly', 'Smart', 'Witty', 'Lazy', 'Bouncy', 'Sneaky', 'Calm', 'Cool',
    'Radiant', 'Mystic', 'Sparky', 'Spunky', 'Dandy', 'Zesty', 'Merry', 'Lucky', 'Cranky', 'Plucky'
];

const ANIMALS = [
    'Panda', 'Lion', 'Falcon', 'Koala', 'Tiger', 'Dolphin', 'Fox', 'Rabbit', 'Eagle', 'Otter',
    'Cheetah', 'Owl', 'Bear', 'Penguin', 'Wolf', 'Squirrel', 'Deer', 'Beaver', 'Jaguar', 'Elephant',
    'Monkey', 'Giraffe', 'Koala', 'Kangaroo', 'Zebra', 'Lemur', 'Sloth', 'Hedgehog', 'Beaver', 'Panda'
];

// Helper to generate a consistent anonymous name based on user ID
function getAnonymousName(userId) {
    const userIdStr = String(userId);
    let hash = 0;
    for (let i = 0; i < userIdStr.length; i++) {
        hash = (hash << 5) - hash + userIdStr.charCodeAt(i);
        hash |= 0; // Convert to 32bit integer
    }
    const positiveHash = Math.abs(hash);
    const adj = ADJECTIVES[positiveHash % ADJECTIVES.length];
    const anim = ANIMALS[(Math.floor(positiveHash / ADJECTIVES.length)) % ANIMALS.length];
    return `${adj} ${anim}`;
}

// Map of connectionKey -> { res, user }
const clients = new Map();

// In-memory cache for recent messages and their reactions (to keep chat completely isolated but reactive)
const activeMessages = [];
const userReactions = new Map(); // messageId -> Map of userId -> emoji
const typingUsers = new Map(); // userId -> { name, timeout }

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
                name: getAnonymousName(userId)
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

    const myAnonName = getAnonymousName(req.user.id);

    // Register client connection (using userId + timestamp key to handle multiple tabs/sessions)
    const clientKey = `${req.user.id}_${Date.now()}`;
    clients.set(clientKey, { res, user: req.user });

    // Send connection initialization event with their anonymous name
    res.write(`event: init\ndata: ${JSON.stringify({ name: myAnonName })}\n\n`);

    // We do NOT send DB message history to keep the room completely session-isolated.
    // However, we send an empty history event so the client knows history loading is complete.
    res.write(`event: history\ndata: ${JSON.stringify([])}\n\n`);

    // Broadcast system join notification
    broadcast('system', { text: `${myAnonName} joined the room` });

    // Broadcast online list update
    broadcast('online-list', getOnlineUsers());

    req.on('close', () => {
        clients.delete(clientKey);
        
        // Clean up typing status if applicable
        if (typingUsers.has(req.user.id)) {
            clearTimeout(typingUsers.get(req.user.id).timeout);
            typingUsers.delete(req.user.id);
            broadcast('typing-list', Array.from(typingUsers.values()).map(u => u.name));
        }

        // Broadcast system leave notification
        broadcast('system', { text: `${myAnonName} left the room` });
        
        // Broadcast online list update
        broadcast('online-list', getOnlineUsers());
    });
});

// Send endpoint
router.post('/send', requireUser, (req, res) => {
    const { text, replyTo } = req.body || {};
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
        return res.status(400).json({ error: 'Message text required' });
    }
    if (text.length > 1000) {
        return res.status(400).json({ error: 'Message too long (max 1000 chars)' });
    }

    const now = Date.now();
    const sender = getAnonymousName(req.user.id);

    // Save to DB (for administrative moderation / audit logs)
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
        date: d.toLocaleDateString('en-IN'),
        replyTo: replyTo || null,
        reactions: {}
    };

    // Store in memory cache
    activeMessages.push(msg);
    if (activeMessages.length > 100) {
        const removed = activeMessages.shift();
        userReactions.delete(removed.id);
    }

    // Broadcast message
    broadcast('message', msg);
    res.json({ ok: true });
});

// Typing state endpoint
router.post('/typing', requireUser, (req, res) => {
    const { isTyping } = req.body || {};
    const userId = req.user.id;
    const name = getAnonymousName(userId);

    if (isTyping) {
        if (typingUsers.has(userId)) {
            clearTimeout(typingUsers.get(userId).timeout);
        }
        const timeout = setTimeout(() => {
            typingUsers.delete(userId);
            broadcast('typing-list', Array.from(typingUsers.values()).map(u => u.name));
        }, 3000); // 3-second typing timeout
        typingUsers.set(userId, { name, timeout });
    } else {
        if (typingUsers.has(userId)) {
            clearTimeout(typingUsers.get(userId).timeout);
            typingUsers.delete(userId);
        }
    }

    broadcast('typing-list', Array.from(typingUsers.values()).map(u => u.name));
    res.json({ ok: true });
});

// Reaction state endpoint
router.post('/react', requireUser, (req, res) => {
    const { messageId, emoji } = req.body || {};
    if (!messageId || !emoji) {
        return res.status(400).json({ error: 'messageId and emoji are required' });
    }

    const userId = req.user.id;

    // Find message in cache
    const msg = activeMessages.find(m => String(m.id) === String(messageId));
    if (!msg) {
        return res.status(404).json({ error: 'Message not found or too old' });
    }

    if (!userReactions.has(messageId)) {
        userReactions.set(messageId, new Map());
    }

    const msgReactions = userReactions.get(messageId);
    const existingEmoji = msgReactions.get(userId);

    if (existingEmoji === emoji) {
        // Toggle off
        msgReactions.delete(userId);
    } else {
        // Change or add reaction
        msgReactions.set(userId, emoji);
    }

    // Recalculate reaction counts
    const counts = {};
    for (const em of msgReactions.values()) {
        counts[em] = (counts[em] || 0) + 1;
    }
    msg.reactions = counts;

    broadcast('reaction', { messageId, reactions: counts });
    res.json({ ok: true });
});

// Clear endpoint (Admin only)
router.delete('/clear', requireUser, (req, res) => {
    if (!req.user.is_admin) {
        return res.status(403).json({ error: 'Admin only feature' });
    }
    db.prepare('DELETE FROM global_messages').run();
    activeMessages.length = 0;
    userReactions.clear();
    broadcast('clear', {});
    res.json({ ok: true });
});

module.exports = router;
