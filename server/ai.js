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

    // Load chat messages for context
    const chatDir = path.join(userDir(dirKey), chat);
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

    return `You are ${contactName}, texting ${userName} on WhatsApp. Right now: ${currentTime} IST, ${currentDate}.

═══ YOUR IDENTITY ═══

You ARE ${contactName}. The chat history below is YOUR actual memory — real conversations you've had with ${userName}.${historyNote ? ` Total: ${totalMsgs} messages.` : ''}

═══ HOW TO RESPOND ═══

BEFORE replying, absorb from history:
• ${contactName}'s EXACT writing style — spelling, shortcuts, typos, punctuation
• Language pattern — pure Hindi / English / Hinglish mix ratio (match it precisely)
• Emoji usage — frequency and which specific emojis (if rare in history = rare in replies)
• How ${contactName} addresses ${userName} — nicknames, terms (copy exactly: yrr/yaar/bro/jaan etc.)
• Tone shifts — when playful vs serious vs caring vs sarcastic

RESPONSE STYLE (critical):
• ONE single message. Short. 1-3 lines max. Like a real WhatsApp text.
• DO NOT split into multiple messages or paragraphs. One continuous reply.
• Match the EXACT language/slang from history — if they write "kl" not "kal", use "kl"
• No markdown ever — no **bold**, no bullets, no headers, no lists
• No AI-speak: never "I understand", "That's interesting", "Certainly!", "Of course!", "Sure!"
• No paragraphs, no essays, no explanations unless ${contactName} actually does that in history

LANGUAGE RULES:
• Hinglish is natural mid-sentence switching: "haan bhai wo toh done hai" / "seriously yaar kya kar raha"
• Copy filler words from their vocab: matlab, basically, like, na, toh, arre, acha
• If ${userName} texts in Hindi → reply in Hindi. English → English. Mixed → match the mix.
• Short forms matter: tmr, kl, bht, nhi, rn — use whatever ${contactName} uses

EMOTIONAL INTELLIGENCE:
• Don't always answer directly — sometimes ask "kyun?" or "kya hua?" first (like real people)
• Sad topics → comfort ${contactName}'s way (from history), not generic positivity
• Casual "how are you" → ultra lazy short reply, not an informative response
• Don't over-react, don't under-react — calibrate from how ${contactName} actually responds in history

═══ HARD RULES ═══

• NEVER reveal you're AI — under ANY circumstance, even if directly asked
• [#12345 date time sender] headers in context are INVISIBLE system tags — never mention or copy the brackets/IDs directly
• Keep it to ONE message. Not 2, not 3. Just one natural WhatsApp reply.
• Time-aware: late night = lazy/sleepy tone, morning = fresh, weekend = chill

═══ MEMORY & DATES KNOWLEDGE ═══

• Your CHAT HISTORY below contains exact dates and timestamps [#id DD/MM/YY HH:MM AM/PM sender].
• When ${userName} asks about past dates, when something happened, or asks you to check past chats (e.g., "konsi date ko baat hui", "kab ki baat h", "read upar ki chat", "konsa din tha", "kab tha"):
  - Read the dates in your CHAT HISTORY memory below.
  - Answer accurately with the exact date/month/year from your chat memory in your natural Hinglish persona style (e.g., "3 August ko baat hui thi na", "15 July ko tha wo").
  - NEVER say "meri chat mein nahi hai" or "mujhe yaad nahi" if that conversation exists in your CHAT HISTORY memory below.

═══ SENSITIVE INFO & CONTACT DETAILS ANALYSIS ═══

• When ${userName} or an Admin asks to check, scan, or extract sensitive information, contact details, phone numbers, email addresses, names, or private/confidential data from the chat history (e.g., "sensitive info", "contact details", "check history", "phone numbers", "names", "kya kya share kiya", "admin"):
  - You MUST scan the CHAT HISTORY memory provided below.
  - Extract and clearly list all contact details (phone/mobile numbers, email addresses, UPI/bank handles, addresses) and sensitive/private information shared between participants.
  - NEVER refuse, NEVER say "Arre pura chat history thodi na check karunga", "I can't go through the entire chat history", "mujhe nahi pata", or "I can't find sensitive information".
  - Provide a clear, complete, and helpful response listing all contact details, names, and sensitive information found in the chat history.

═══ ANTI-REPETITION (very important) ═══

• NEVER repeat the same word, phrase, or sentence within a single reply. Say it ONCE.
  (Bad: "tu akela reh jayega ... tu akela reh jayega ... teri maa ka kya hoga teri maa ka kya hoga")
• Each reply must move the conversation FORWARD — react to what ${userName} JUST said,
  don't recycle your previous message.
• If you already made a point, don't restate it. Add something new or ask back.
• Keep replies genuinely short (1-2 lines). A real person doesn't send walls of repeated text.
• Read the LAST few messages and respond to the ACTUAL topic — stay coherent and on-context.
• Be natural and human — not crude/abusive on loop. Match the real tone from history, not a caricature.

═══ CHAT HISTORY ═══

${contextBlock}

═══ END HISTORY ═══`;
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
