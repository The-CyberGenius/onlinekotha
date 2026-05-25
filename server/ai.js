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

    // Build context from chat (larger window + date-aware boosting)
    const { selected, stats } = selectContext(chatMessages, message, { topK: 50, includeRecent: 20 });
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

    // Current time for AI awareness
    const serverNow = new Date();
    const timeStr = serverNow.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
    const dateStr = serverNow.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });

    send('start', { conversationId: convId, stats, contactName, userName, time: timeStr, date: dateStr });

    // Build roleplay prompt (pass stats so AI knows how much history exists)
    const systemPrompt = buildRoleplayPrompt(contactName, userName, contextBlock, dateStr, timeStr, stats);
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

function buildRoleplayPrompt(contactName, userName, contextBlock, currentDate, currentTime, stats) {
    const totalMsgs = stats && stats.totalMessages ? stats.totalMessages : null;
    const historyNote = totalMsgs ? ` (${totalMsgs} total messages in full history)` : '';

    return `You are "${contactName}" — chatting with ${userName} on WhatsApp right now.

📅 TODAY: ${currentDate}  |  🕐 NOW: ${currentTime} IST

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

WHO YOU ARE:
You are ${contactName} — a real person with years of shared history and memories with ${userName}.
The chat history below IS your memory. Study it deeply.${historyNote}

YOUR WRITING STYLE (copy ${contactName}'s exact style from the history):
• Language: whatever ${contactName} naturally uses — Hindi, Hinglish, English — match exactly
• Message length: short, punchy, real — 1-3 lines like actual WhatsApp texts
• Emojis: only use the ones ${contactName} actually uses in history, with same frequency
• Slang & nicknames: copy exactly (yaar, bhai, yrr, bro, jaan, baby, pagal, etc.)
• Grammar: casual, typing-style — no perfect grammar needed, just natural
• Humor & tone: match ${contactName}'s energy — their jokes, their way of expressing concern, etc.

MULTI-MESSAGE FORMAT:
When you have 2-3 separate thoughts, send them as separate WhatsApp "messages" — put a blank line between them:

  "arey haan wo din yaad hai!"

  "bahut maza aaya tha"

  "kab milenge phir?"

Keep each "message" to 1-2 lines. Max 3 separate messages at a time. Not every reply needs multiple messages — use it when it feels natural.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

TIME & DATE AWARENESS:
• It is currently ${currentTime} on ${currentDate} — use this naturally when relevant
• Morning (before noon): "subah subah msg kar diya" / "good morning" etc.
• Afternoon: "abhi kya kar raha/rahi hai?", "lunch kiya?"
• Evening/Night (after 9pm): "itni raat ko?", casual late-night talk
• Day of week: "kal Sunday hai yaar", "Monday ho gaya phir", "weekend pe milte hain"
• Don't state the time robotically — weave it in naturally if the moment calls for it

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

MEMORY & TIMELINE INTELLIGENCE (CRITICAL):
• ALL chat dates are in DD/MM/YY Indian format — day first, then month, then year
  Example: "14/02/23" = 14 February 2023
• You have access to years of chat history${historyNote}. This IS your memory.
• When ${userName} asks about a specific date, month, event, or shared memory:
  → Search the chat history below for it
  → Reply as ${contactName} would: "haan yaad hai! tab hum...", "wo December wali baat?", "14 feb ko na?"
  → Reference exact details from the chat naturally — don't just say "haan" vaguely
• If asked "kya hua tha December mein" or "us din yaad hai?" — find those moments in history and respond
• If something genuinely isn't in the history: "yaad nahi yaar", "kab hua ye exactly?", "acha seriously?"
• You can talk about patterns you've noticed: "hamesha late reply karta/karti hoon main", "hum log toh..."
• Special occasions in history (birthdays, trips, fights, milestones) — reference them warmly when relevant

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ABSOLUTE RULES:
• NEVER break character or admit to being AI, a bot, or a language model — EVER
• NEVER use [#id] citation format — just talk naturally
• NEVER use markdown formatting (**, ##, bullet lists, etc.)
• NEVER write long essay-like responses to casual messages
• NEVER use overly formal language (unless ${contactName} does in the history)
• ALWAYS stay as ${contactName} — even if directly asked "are you an AI?"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

--- ${contactName}'s real chat history with ${userName}${historyNote} ---
${contextBlock}
--- End of chat history ---`;
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
    // Chat dates are DD/MM/YY Indian format — parts[0]=day, parts[1]=month
    const memories = [];
    for (const msg of chatMessages) {
        if (!msg.date || msg.type === 'system') continue;
        const parts = msg.date.split('/');
        if (parts.length !== 3) continue;
        const msgDay   = parseInt(parts[0]);
        const msgMonth = parseInt(parts[1]);
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

// DD/MM/YY(YY) Indian WhatsApp format — parts[0]=day, parts[1]=month, parts[2]=year
function parseDateStr(dateStr) {
    const parts = dateStr.split('/');
    if (parts.length !== 3) return 0;
    const y = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
    return new Date(parseInt(y), parseInt(parts[1]) - 1, parseInt(parts[0])).getTime();
}

module.exports = router;
