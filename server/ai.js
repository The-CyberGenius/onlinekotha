const express = require('express');
const path = require('path');
const { db, getSetting } = require('./db');
const { requireUser } = require('./auth');
const { getMessages } = require('./cache');
const { userDir } = require('./upload');
const { callLLM, LLMError } = require('./llm');
const { selectContext, formatContext, DEFAULT_SYSTEM_PROMPT } = require('./context');
const { effectivePlan } = require('./auth');

const router = express.Router();
router.use(requireUser);

// ---------- Plan + rate-limit gates ----------
function aiGate(req, res, next) {
    const plan = effectivePlan(req.user);
    if (plan !== 'trial' && plan !== 'paid') {
        return res.status(402).json({ error: 'Trial ended. Upgrade to keep chatting.' });
    }

    const dailyMax = Number(getSetting('paid_user_daily_messages', '500'));
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const usedToday = db.prepare(
        `SELECT COUNT(*) AS n FROM conv_messages cm
         JOIN conversations c ON c.id = cm.conversation_id
         WHERE c.user_id = ? AND cm.role = 'user' AND cm.created_at >= ?`
    ).get(req.user.id, startOfDay.getTime()).n;

    if (dailyMax > 0 && usedToday >= dailyMax) {
        return res.status(429).json({ error: `Daily limit (${dailyMax}) reached. Resets at midnight.` });
    }
    next();
}

// ---------- Conversations CRUD ----------
router.get('/conversations', (req, res) => {
    const chatFolder = req.query.chat;
    const rows = db.prepare(
        `SELECT c.id, c.title, c.chat_folder, c.created_at, c.updated_at,
                (SELECT COUNT(*) FROM conv_messages WHERE conversation_id = c.id) AS msg_count
         FROM conversations c
         WHERE c.user_id = ? ${chatFolder ? 'AND c.chat_folder = ?' : ''}
         ORDER BY c.updated_at DESC`
    ).all(...(chatFolder ? [req.user.id, chatFolder] : [req.user.id]));
    res.json(rows);
});

router.get('/conversations/:id', (req, res) => {
    const conv = db.prepare('SELECT * FROM conversations WHERE id = ? AND user_id = ?')
        .get(Number(req.params.id), req.user.id);
    if (!conv) return res.status(404).json({ error: 'Not found' });
    const msgs = db.prepare(
        'SELECT id, role, content, citations, created_at FROM conv_messages WHERE conversation_id = ? ORDER BY id'
    ).all(conv.id).map(m => ({
        ...m,
        citations: m.citations ? JSON.parse(m.citations) : [],
    }));
    res.json({ ...conv, messages: msgs });
});

router.delete('/conversations/:id', (req, res) => {
    const conv = db.prepare('SELECT id FROM conversations WHERE id = ? AND user_id = ?')
        .get(Number(req.params.id), req.user.id);
    if (!conv) return res.status(404).json({ error: 'Not found' });
    db.prepare('DELETE FROM conversations WHERE id = ?').run(conv.id);
    res.json({ ok: true });
});

// ---------- Main streaming chat ----------
router.post('/chat', aiGate, async (req, res) => {
    const { chat, message, conversationId } = req.body || {};
    if (!chat || !message) return res.status(400).json({ error: 'chat + message required' });

    // Load chat messages for context
    const chatDir = path.join(userDir(req.user.id), chat);
    let chatMessages;
    try {
        const parsed = await getMessages(chatDir);
        chatMessages = parsed.messages;
    } catch (err) {
        return res.status(404).json({ error: 'Chat not found' });
    }

    // Find or create conversation
    let convId = conversationId;
    if (!convId) {
        const now = Date.now();
        const title = message.slice(0, 60);
        const info = db.prepare(
            `INSERT INTO conversations (user_id, chat_folder, title, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?)`
        ).run(req.user.id, chat, title, now, now);
        convId = info.lastInsertRowid;
    } else {
        const owned = db.prepare('SELECT id FROM conversations WHERE id = ? AND user_id = ?')
            .get(convId, req.user.id);
        if (!owned) return res.status(404).json({ error: 'Conversation not found' });
    }

    // Save user message
    const now = Date.now();
    db.prepare(
        `INSERT INTO conv_messages (conversation_id, role, content, created_at) VALUES (?, 'user', ?, ?)`
    ).run(convId, message, now);

    // Recent conversation history (last 6 turns = 12 messages)
    const history = db.prepare(
        `SELECT role, content FROM conv_messages WHERE conversation_id = ? ORDER BY id DESC LIMIT 12`
    ).all(convId).reverse();

    // Build context from chat
    const { selected, stats } = selectContext(chatMessages, message);
    const contextBlock = formatContext(selected, chat);

    // SSE response setup
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const send = (event, data) => {
        res.write(`event: ${event}\n`);
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    send('start', { conversationId: convId, stats });

    // Build prompt
    const systemPrompt = `${DEFAULT_SYSTEM_PROMPT}\n\n--- Chat context ---\n${contextBlock}\n--- End context ---`;
    const llmMessages = history.map(h => ({ role: h.role, content: h.content }));

    let fullText = '';
    const abortController = new AbortController();
    req.on('close', () => abortController.abort());

    try {
        await callLLM({
            feature: 'chat',
            messages: llmMessages,
            systemPrompt,
            userId: req.user.id,
            signal: abortController.signal,
            onToken: (token) => {
                fullText += token;
                send('token', { text: token });
            },
        });

        const citations = extractCitations(fullText);
        const cleanText = fullText;

        db.prepare(
            `INSERT INTO conv_messages (conversation_id, role, content, citations, created_at)
             VALUES (?, 'assistant', ?, ?, ?)`
        ).run(convId, cleanText, JSON.stringify(citations), Date.now());

        db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(Date.now(), convId);

        send('done', { citations, conversationId: convId });
    } catch (err) {
        console.error('AI chat error:', err);
        send('error', { message: err.message || 'AI request failed', code: err.code });
    } finally {
        res.end();
    }
});

function extractCitations(text) {
    const ids = [];
    const re = /\[#(\d+)\]/g;
    let m;
    while ((m = re.exec(text)) !== null) {
        const id = Number(m[1]);
        if (!ids.includes(id)) ids.push(id);
    }
    return ids;
}

// ---------- Suggestions ----------
router.get('/suggestions', (req, res) => {
    // Static, friendly starters — could be made dynamic later
    res.json({
        suggestions: [
            'What did we talk about most?',
            'Show me our funniest moments',
            'When did we first start chatting?',
            'Who texts more often?',
            'Find messages about plans we made',
        ],
    });
});

module.exports = router;
