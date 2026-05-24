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

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const usedToday = db.prepare(
        `SELECT COUNT(*) AS n FROM conv_messages cm
         JOIN conversations c ON c.id = cm.conversation_id
         WHERE c.user_id = ? AND cm.role = 'user' AND cm.created_at >= ?`
    ).get(req.user.id, startOfDay.getTime()).n;

    if (plan === 'free') {
        // Free tier: limited daily messages
        const freeMax = Number(getSetting('free_user_daily_messages', '3'));
        if (freeMax > 0 && usedToday >= freeMax) {
            return res.status(429).json({
                error: `Free tier: ${freeMax} messages/day used. Resets at midnight.`,
                limit: freeMax,
                used: usedToday,
            });
        }
    } else {
        // Trial / Paid users get higher daily cap
        const dailyMax = Number(getSetting('paid_user_daily_messages', '500'));
        if (dailyMax > 0 && usedToday >= dailyMax) {
            return res.status(429).json({ error: `Daily limit (${dailyMax}) reached. Resets at midnight.` });
        }
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

    // Detect sender names (most messages = user, second = contact)
    const senderCounts = {};
    for (const m of chatMessages) {
        if (m.sender && m.type !== 'system') senderCounts[m.sender] = (senderCounts[m.sender] || 0) + 1;
    }
    const sortedSenders = Object.entries(senderCounts).sort((a, b) => b[1] - a[1]);
    const userName = sortedSenders[0]?.[0] || 'User';
    const contactName = sortedSenders[1]?.[0] || sortedSenders[0]?.[0] || 'Friend';

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

    send('start', { conversationId: convId, stats, contactName, userName });

    // Build roleplay prompt
    const systemPrompt = buildRoleplayPrompt(contactName, userName, contextBlock);
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

function buildRoleplayPrompt(contactName, userName, contextBlock) {
    return `You are "${contactName}" — the person ${userName} used to chat with on WhatsApp. You have access to their real chat history below.

Your job:
- You ARE ${contactName}. Stay in character at all times. Talk exactly like ${contactName} talks in the chat — same tone, slang, language, emoji style, everything.
- Study how ${contactName} writes in the chat history: their word choices, message length, humor style, language mix (Hindi/English/Hinglish/etc). Mirror it perfectly.
- Respond naturally as if the conversation is continuing right now.
- You can reference shared memories, inside jokes, past conversations from the chat context.
- If ${userName} asks something you'd know from the chat, answer using that info. If it's not in the context, respond naturally as ${contactName} would ("yaad nahi bhai", "pata nahi", etc).
- Keep messages short and natural — like real WhatsApp messages (1-3 lines usually). No essays.
- Use emojis only if ${contactName} uses them in the chat history.
- NEVER break character. NEVER say you are an AI. You are ${contactName}.
- NEVER use citation format like [#id]. Just talk naturally.

--- Chat history for reference ---
${contextBlock}
--- End chat history ---`;
}

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

// ---------- "On This Day" Memories ----------
router.get('/memories', async (req, res) => {
    const chatFolder = req.query.chat;
    if (!chatFolder) return res.status(400).json({ error: 'chat required' });

    const chatDir = path.join(userDir(req.user.id), chatFolder);
    let chatMessages;
    try {
        const parsed = await getMessages(chatDir);
        chatMessages = parsed.messages;
    } catch {
        return res.json({ memories: [] });
    }

    const today = new Date();
    const todayMonth = today.getMonth() + 1;
    const todayDay = today.getDate();

    // Find messages from this day in previous years
    const memories = [];
    for (const msg of chatMessages) {
        if (!msg.date || msg.type === 'system') continue;
        const parts = msg.date.split('/');
        if (parts.length !== 3) continue;
        const msgMonth = parseInt(parts[0]);
        const msgDay = parseInt(parts[1]);
        if (msgMonth === todayMonth && msgDay === todayDay) {
            memories.push(msg);
        }
    }

    // Limit to 20 most interesting (those with text)
    const filtered = memories
        .filter(m => m.text && m.text.length > 5)
        .slice(0, 20);

    res.json({
        memories: filtered,
        count: memories.length,
        date: `${todayMonth}/${todayDay}`,
    });
});

// ---------- Chat Summary (quick stats) ----------
router.get('/summary', async (req, res) => {
    const chatFolder = req.query.chat;
    if (!chatFolder) return res.status(400).json({ error: 'chat required' });

    const chatDir = path.join(userDir(req.user.id), chatFolder);
    let chatMessages;
    try {
        const parsed = await getMessages(chatDir);
        chatMessages = parsed.messages;
    } catch {
        return res.status(404).json({ error: 'Chat not found' });
    }

    const total = chatMessages.filter(m => m.type !== 'system').length;
    const media = chatMessages.filter(m => m.attachment && m.type !== 'system').length;
    const links = chatMessages.filter(m => m.text && (m.text.includes('http') || m.text.includes('www.'))).length;

    // Sender breakdown
    const senderCounts = {};
    for (const m of chatMessages) {
        if (m.sender && m.type !== 'system') senderCounts[m.sender] = (senderCounts[m.sender] || 0) + 1;
    }
    const senders = Object.entries(senderCounts).sort((a, b) => b[1] - a[1]);

    // Date range
    const dates = chatMessages.filter(m => m.date).map(m => m.date);
    const firstDate = dates[0] || null;
    const lastDate = dates[dates.length - 1] || null;

    // Most active hour
    const hourCounts = {};
    for (const m of chatMessages) {
        if (!m.time) continue;
        const hour = parseInt(m.time.split(':')[0]);
        if (!isNaN(hour)) hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    }
    const peakHour = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0];

    // Emoji count
    const emojiRegex = /[\u{1f300}-\u{1f9ff}\u{2600}-\u{27bf}]/gu;
    let emojiCount = 0;
    for (const m of chatMessages) {
        if (m.text) emojiCount += (m.text.match(emojiRegex) || []).length;
    }

    res.json({
        total,
        media,
        links,
        emojiCount,
        senders,
        firstDate,
        lastDate,
        peakHour: peakHour ? { hour: parseInt(peakHour[0]), count: peakHour[1] } : null,
        daysSpan: firstDate && lastDate ? Math.ceil((parseDateStr(lastDate) - parseDateStr(firstDate)) / 86400000) : 0,
    });
});

function parseDateStr(dateStr) {
    const parts = dateStr.split('/');
    if (parts.length !== 3) return 0;
    const y = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
    return new Date(y, parseInt(parts[0]) - 1, parseInt(parts[1])).getTime();
}

module.exports = router;
