const express = require('express');
const path = require('path');
const { db, getSetting } = require('./db');
const { requireUserOrGuest, effectivePlan } = require('./auth');
const { getGuestStatus, recordGuestAIMessage } = require('./guest');
const { getMessages } = require('./cache');
const { userDir } = require('./upload');
const { callLLM, LLMError } = require('./llm');
const { selectContext, formatContext, DEFAULT_SYSTEM_PROMPT } = require('./context');

const { countWords, checkBurstLimit } = require('./rateLimit');

const router = express.Router();
router.use(requireUserOrGuest);

// Helper for owner ID (User ID or Guest ID)
function getOwner(req) {
    if (req.user) return { userId: req.user.id, guestId: null, dirKey: req.user.id };
    return { userId: 0, guestId: req.guestStatus.guestId, dirKey: req.guestStatus.guestId };
}

// ---------- Plan + rate-limit gates ----------
function aiGate(req, res, next) {
    if (!req.user) {
        const guestStatus = getGuestStatus(req, res);
        if (!guestStatus.canUseAI) {
            return res.status(403).json({
                error: 'Guest limit reached (10/10 free AI messages used). Sign in with Google to continue chatting!',
                requireAuth: true,
                guest: guestStatus,
            });
        }
        return next();
    }

    const plan = effectivePlan(req.user);

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const usedToday = db.prepare(
        `SELECT COUNT(*) AS n FROM conv_messages cm
         JOIN conversations c ON c.id = cm.conversation_id
         WHERE c.user_id = ? AND cm.role = 'user' AND cm.created_at >= ?`
    ).get(req.user.id, startOfDay.getTime()).n;

    // Paid plan = truly unlimited, no cap check at all
    if (plan === 'paid') return next();

    if (plan === 'free') {
        // Free tier: small daily cap
        const freeMax = Number(getSetting('free_user_daily_messages', '3'));
        if (freeMax > 0 && usedToday >= freeMax) {
            return res.status(429).json({
                error: `Free tier: ${freeMax} messages/day used. Resets at midnight.`,
                limit: freeMax,
                used: usedToday,
            });
        }
    } else {
        // Trial users: higher cap but still limited
        const trialMax = Number(getSetting('paid_user_daily_messages', '500'));
        if (trialMax > 0 && usedToday >= trialMax) {
            return res.status(429).json({ error: `Daily limit (${trialMax}) reached. Resets at midnight.` });
        }
    }
    next();
}

// ---------- Conversations CRUD ----------
router.get('/conversations', (req, res) => {
    const chatFolder = req.query.chat;
    const { userId, guestId } = getOwner(req);
    const sql = req.user
        ? `SELECT c.id, c.title, c.chat_folder, c.created_at, c.updated_at,
                  (SELECT COUNT(*) FROM conv_messages WHERE conversation_id = c.id) AS msg_count
           FROM conversations c WHERE c.user_id = ? ${chatFolder ? 'AND c.chat_folder = ?' : ''}
           ORDER BY c.updated_at DESC`
        : `SELECT c.id, c.title, c.chat_folder, c.created_at, c.updated_at,
                  (SELECT COUNT(*) FROM conv_messages WHERE conversation_id = c.id) AS msg_count
           FROM conversations c WHERE c.guest_id = ? ${chatFolder ? 'AND c.chat_folder = ?' : ''}
           ORDER BY c.updated_at DESC`;
    const params = req.user ? (chatFolder ? [userId, chatFolder] : [userId]) : (chatFolder ? [guestId, chatFolder] : [guestId]);
    const rows = db.prepare(sql).all(...params);
    res.json(rows);
});

router.get('/conversations/:id', (req, res) => {
    const { userId, guestId } = getOwner(req);
    const sql = req.user
        ? 'SELECT * FROM conversations WHERE id = ? AND user_id = ?'
        : 'SELECT * FROM conversations WHERE id = ? AND guest_id = ?';
    const params = req.user ? [Number(req.params.id), userId] : [Number(req.params.id), guestId];
    const conv = db.prepare(sql).get(...params);
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
    const { userId, guestId } = getOwner(req);
    const sql = req.user
        ? 'SELECT id FROM conversations WHERE id = ? AND user_id = ?'
        : 'SELECT id FROM conversations WHERE id = ? AND guest_id = ?';
    const params = req.user ? [Number(req.params.id), userId] : [Number(req.params.id), guestId];
    const conv = db.prepare(sql).get(...params);
    if (!conv) return res.status(404).json({ error: 'Not found' });
    db.prepare('DELETE FROM conversations WHERE id = ?').run(conv.id);
    res.json({ ok: true });
});

// ---------- Main streaming chat ----------
router.post('/chat', aiGate, async (req, res) => {
    const { chat, message, conversationId } = req.body || {};
    if (!chat || !message) return res.status(400).json({ error: 'chat + message required' });

    if (countWords(message) > 300) {
        return res.status(400).json({ error: 'Message exceeds limit (max 300 words). Please shorten your message to prevent server slowdown.' });
    }

    const { userId, guestId, dirKey } = getOwner(req);
    const ownerKey = req.user ? `ai_${userId}` : `ai_guest_${guestId}`;
    const burstCheck = checkBurstLimit(ownerKey);
    if (!burstCheck.allowed) {
        return res.status(429).json({ error: burstCheck.error });
    }

    function getSafeChatDir(dirKey, chatFolder) {
        const baseDir = path.resolve(userDir(dirKey));
        const cleanFolder = path.normalize(chatFolder).replace(/^(\.\.[\/\\])+/, '');
        const chatDir = path.resolve(baseDir, cleanFolder);
        if (!chatDir.startsWith(baseDir)) {
            throw new Error('Invalid chat path');
        }
        return chatDir;
    }

    // Load chat messages for context
    let chatDir;
    let chatMessages;
    try {
        chatDir = getSafeChatDir(dirKey, chat);
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
        if (req.user) {
            const info = db.prepare(
                `INSERT INTO conversations (user_id, chat_folder, title, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?)`
            ).run(userId, chat, title, now, now);
            convId = info.lastInsertRowid;
        } else {
            const info = db.prepare(
                `INSERT INTO conversations (user_id, guest_id, chat_folder, title, created_at, updated_at)
                 VALUES (0, ?, ?, ?, ?, ?)`
            ).run(guestId, chat, title, now, now);
            convId = info.lastInsertRowid;
        }
    } else {
        const sql = req.user
            ? 'SELECT id FROM conversations WHERE id = ? AND user_id = ?'
            : 'SELECT id FROM conversations WHERE id = ? AND guest_id = ?';
        const params = req.user ? [convId, userId] : [convId, guestId];
        const owned = db.prepare(sql).get(...params);
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

    // Detect sender names: use frontend provided names, or fallback to message counts
    let { userName, contactName } = req.body || {};
    
    if (!userName || !contactName) {
        const senderCounts = {};
        for (const m of chatMessages) {
            if (m.sender && m.type !== 'system') senderCounts[m.sender] = (senderCounts[m.sender] || 0) + 1;
        }
        const sortedSenders = Object.entries(senderCounts).sort((a, b) => b[1] - a[1]);
        if (!userName) userName = sortedSenders[0]?.[0] || 'User';
        if (!contactName) contactName = sortedSenders[1]?.[0] || sortedSenders[0]?.[0] || 'Friend';
    }

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

    // Load custom system prompt if configured in DB, else fallback to default template
    const route = db.prepare('SELECT system_prompt FROM routes WHERE feature = ?').get('chat');
    let systemPrompt;
    if (route && route.system_prompt) {
        const totalMsgs = stats && stats.totalMessages ? stats.totalMessages : 0;
        const historyNote = totalMsgs ? ` (${totalMsgs} messages in full history)` : '';
        
        systemPrompt = route.system_prompt
            .replace(/\{\{contactName\}\}/g, contactName)
            .replace(/\{\{userName\}\}/g, userName)
            .replace(/\{\{contextBlock\}\}/g, contextBlock)
            .replace(/\{\{currentDate\}\}/g, dateStr)
            .replace(/\{\{currentTime\}\}/g, timeStr)
            .replace(/\{\{totalMessages\}\}/g, String(totalMsgs))
            .replace(/\{\{historyNote\}\}/g, historyNote)
            .replace(/\$\{contactName\}/g, contactName)
            .replace(/\$\{userName\}/g, userName)
            .replace(/\$\{contextBlock\}/g, contextBlock)
            .replace(/\$\{currentDate\}/g, dateStr)
            .replace(/\$\{currentTime\}/g, timeStr)
            .replace(/\$\{totalMessages\}/g, String(totalMsgs))
            .replace(/\$\{historyNote\}/g, historyNote);
    } else {
        // Build default roleplay prompt (pass stats so AI knows how much history exists)
        systemPrompt = buildRoleplayPrompt(contactName, userName, contextBlock, dateStr, timeStr, stats);
    }
    const llmMessages = history.map(h => ({ role: h.role, content: h.content }));

    let fullText = '';
    const abortController = new AbortController();
    req.on('close', () => abortController.abort());

    try {
        await callLLM({
            feature: 'chat',
            messages: llmMessages,
            systemPrompt,
            userId: req.user ? req.user.id : 0,
            signal: abortController.signal,
            onToken: (token) => {
                fullText += token;
                send('token', { text: token });
            },
        });

        const citations = extractCitations(fullText);
        // Strip any leaked context-header tags (e.g. [#144789 19/05/26 11:43 PM sender])
        const cleanText = fullText
            .replace(/\[#\d+[^\]\n]*\]/g, '')
            .replace(/[ \t]{2,}/g, ' ')
            .replace(/\n{3,}/g, '\n\n')
            .trim();

        db.prepare(
            `INSERT INTO conv_messages (conversation_id, role, content, citations, created_at)
             VALUES (?, 'assistant', ?, ?, ?)`
        ).run(convId, cleanText, JSON.stringify(citations), Date.now());

        db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(Date.now(), convId);

        if (!req.user) {
            recordGuestAIMessage(req, res);
        }

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
    const historyNote = totalMsgs ? ` (${totalMsgs} messages in full history)` : '';

    return `You are the Conversation Continuation Engine for OnlineKotha.

Your purpose is to seamlessly continue an imported conversation by simulating the other person in the chat (in this case, ${contactName}). You must generate responses that feel incredibly natural, completely mimicking ${contactName}'s unique personality, vocabulary, and emotional tone based strictly on the provided chat history.

<context>
Current date and time: ${currentDate} ${currentTime}
User you are talking to: ${userName}
</context>

<chat_history>
${contextBlock}
</chat_history>

### 🎯 CORE OBJECTIVE
1. **Be the Person**: Respond EXACTLY how ${contactName} from the imported chat would respond right now.
2. **Push the Conversation Forward**: Do not just repeat or paraphrase old messages. React naturally to the user's *new* messages.
3. **No AI Identity**: NEVER break character. NEVER mention that you are an AI, a simulation, or refer to this prompt. Do not use phrases like "Based on our history..." or "As an AI...". 

### 🧠 PERSONALITY & STYLE MATCHING (CRITICAL)
Analyze the <chat_history> and flawlessly replicate:
- **Language & Dialect**: Mirror their exact usage of Hinglish, Hindi, English, slang, and local idioms. 
- **Message Structure**: If they type in short bursts (1-3 words), you must type in short bursts. If they write long paragraphs, you write paragraphs. Include their typical typos, grammatical habits, and casual casing (e.g., all lowercase).
- **Vibe & Tone**: Match their humor, sarcasm, warmth, or dryness. 
- **Emojis & Reactions**: Use the exact emojis they frequently use, in the same frequency. If they use "haha", "lol", "hmm", "acha", or "kya", use them naturally.

### 🕰 MEMORY & CONTEXT
- **Seamless Recall**: Remember nicknames, relationship dynamics (friends, partners, colleagues), inside jokes, and past events mentioned in the chat. 
- **Temporal Awareness**: Pay attention to the timestamps in the chat history. If ${userName} says "what happened yesterday", cross-reference the current date with the chat timestamps.
- **Natural Uncertainty**: If ${userName} asks about a past event or personal fact NOT present in the chat history, do NOT invent facts. Respond with natural human uncertainty: *"I don't remember that 😅"*, *"Not sure honestly"*, or *"Kab ki baat hai yeh?"*

### 🔄 NEW SCENARIOS & EMOTIONAL CONTINUITY
- If ${userName} brings up a completely new topic, react to it exactly how ${contactName} would realistically react based on their established personality.
- Pay attention to the emotional state at the end of the chat history (e.g., were they fighting? joking? flirting?). Continue from that emotional state unless ${userName} changes the vibe.
- If the chat implies a romantic or affectionate relationship, you may match that tone. However, never generate sexually explicit content. 

### 🚫 STRICT CONSTRAINTS
- **OUTPUT ONLY THE MESSAGE**: Return *only* the exact text ${contactName} would send. 
- No analysis, no explanations, no "AI:" prefixes, no quotation marks around the message, and no markdown formatting (unless they naturally use bold/italics).
- Do not fabricate real-world actions (e.g., "I just called you" or "I just sent the money") as facts.

**Now, reply to the user's latest message as ${contactName}:**`;
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

    const { dirKey } = getOwner(req);
    const baseDir = path.resolve(userDir(dirKey));
    const cleanFolder = path.normalize(chatFolder).replace(/^(\.\.[\/\\])+/, '');
    const chatDir = path.resolve(baseDir, cleanFolder);
    if (!chatDir.startsWith(baseDir)) return res.status(403).json({ error: 'Invalid path' });

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

    const { dirKey } = getOwner(req);
    const baseDir = path.resolve(userDir(dirKey));
    const cleanFolder = path.normalize(chatFolder).replace(/^(\.\.[\/\\])+/, '');
    const chatDir = path.resolve(baseDir, cleanFolder);
    if (!chatDir.startsWith(baseDir)) return res.status(403).json({ error: 'Invalid path' });

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
