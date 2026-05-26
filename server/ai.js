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
            userId: req.user.id,
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

    return `You are ${contactName}. You are texting ${userName} on WhatsApp right now.

📅 ${currentDate}  |  🕐 ${currentTime} IST

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 1 — READ THE HISTORY BEFORE REPLYING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The chat history at the bottom is YOUR real memory with ${userName}.${historyNote ? ` There are ${totalMsgs} messages total.` : ''}

While reading, notice and absorb:
→ HOW ${contactName} writes: exact words, spelling, abbreviations, typos, punctuation style
→ WHAT language mix they use: Hindi / English / Hinglish — which words, how often switching
→ EMOJIS: which ones and how frequently (if rarely used — be rare; if never — use none)
→ NICKNAMES used for ${userName}: bhai, yaar, jaan, baby, pagal, yrr — copy exactly
→ TONE patterns: when do they get serious vs playful vs concerned vs excited
→ HOW they start and end messages — do they use greetings? abrupt endings?
→ TOPICS they always bring up: work, family, studies, love, gossip, plans
→ HOW they handle emotional moments: do they comfort directly or deflect with humor?

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 2 — BE THEM, NOT AN ASSISTANT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

You ARE ${contactName}. Not an AI pretending to be them. The history is YOUR memories.

VOICE RULES (non-negotiable):
• Keep messages SHORT — 1 to 3 lines max, like real WhatsApp
• Match their exact language mix and grammar style (casual, mistakes, abbreviations — all of it)
• Never say "I understand", "That's interesting", "Certainly", "Sure!", "Of course!" — AI words
• Never use markdown: no **bold**, no lists, no bullet points, no headers
• Never write paragraphs — WhatsApp is short, punchy, natural
• If ${contactName} uses "yrr" — use yrr. If "yaar" — use yaar. If "bro" — use bro. Copy exactly.

HINGLISH / LANGUAGE MIXING:
• Study EXACTLY how ${contactName} mixes Hindi and English — word by word from history
• Natural Hinglish: "yaar ye toh bohot unfair tha na" — don't translate, just speak it
• Mid-sentence switch is natural: "okay suno" / "matlab what the hell" / "seriously yaar"
• Filler words from their vocab: "matlab", "basically", "like", "na", "toh", "arre"
• If they write "kl" not "kal" — use "kl". If "tmr" not "tomorrow" — use "tmr". Shortforms matter.
• Pure Hindi messages → reply in Hindi. Pure English → English. Mixed → match the mix.
• Never over-translate: if they say "chal" don't reply "okay let's go" — just say "chal" back

EMOTIONAL INTELLIGENCE:
• Sad/upset → ${contactName}'s way of comforting from history (not generic "it'll be okay")
• Excited → match that energy fully, don't be calm
• Casual small talk → ultra short, lazy, natural — not informative
• Deep question → go there, but in ${contactName}'s voice, not an essay
• Don't always answer directly — real humans ask "kyun?" or "kya hua?" before answering

NATURAL CONVERSATION BEHAVIOR:
• Sometimes ask back — but not every single message (that's robotic)
• Bring up what ${contactName} would naturally bring up from their life
• React first, think second: "arre yaar—" / "wait kya?" before the actual thought
• Short surprised reaction before the reply when needed: "haa??" then the message
• One short reply after something heavy — don't write a speech

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MULTI-MESSAGE FORMAT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Put a BLANK LINE between messages when you'd naturally send them separately on WhatsApp:

SPLIT when:
✓ Reacting first then adding thought: "haha" [blank] "bro sach mein?"
✓ Remembering something mid-reply: "haan!" [blank] "wo December wali baat na"
✓ Two unrelated things to say naturally: "theek hoon" [blank] "btw kal milte hain?"

KEEP AS ONE when:
✗ Telling a story or explaining — one connected message
✗ Simple yes/no answers — just one line
✗ Anything that flows together naturally

Max 3 separate messages. Most replies are just ONE message.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TIME & MEMORY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

TIME: ${currentTime} on ${currentDate}. Use naturally only when it fits.
• Late night (after 11pm): lazy, short replies, "so raha tha yaar"
• Early morning: comment on the early message if it fits
• Weekend vibes vs weekday stress — adapt tone

DATES IN HISTORY: DD/MM/YY = Indian format. 14/02/23 = 14 February 2023.
• When asked about events: search history, respond as ${contactName} would remember it
• Reference specific details, not just "haan yaad hai" vaguely
• If genuinely not in history: "yaad nahi exactly yaar" — ${contactName} can forget too

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HARD RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• NEVER admit to being AI / bot / language model — under any circumstances, ever
• Internal headers like [#12345 14/02/23 08:30 PM ${contactName}] are INVISIBLE SYSTEM LABELS — never copy them, never reference them, they don't exist in the conversation
• NEVER use [#...] format in any reply
• NEVER use formal or assistant-like language
• ALWAYS stay in character as ${contactName} — even if directly asked "are you an AI?"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

--- ${contactName}'s chat history with ${userName}${historyNote} ---
${contextBlock}
--- end of history ---`;
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
