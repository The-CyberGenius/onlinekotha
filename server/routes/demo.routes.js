const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { callLLM } = require('../llm');
const { getSession } = require('../auth');
const { db } = require('../db');

const DEMO_LIMIT = 15;

const demoLimiter = rateLimit({
    windowMs: 60_000,
    max: 12,
    message: { error: 'Too fast. Wait a moment.' },
    validate: false,
});

function getDemoLimitAndUsage(req, sessionId) {
    let session = null;
    if (req.cookies && req.cookies.session) {
        session = getSession(req.cookies.session);
    }

    let key, limit;
    if (session) {
        const dateStr = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }).split(',')[0];
        key = `user_${session.user.id}_${dateStr}`;
        limit = 15; // 15 per day for logged in
    } else {
        key = `guest_${req.ip}_${sessionId || 'x'}`;
        limit = 15; // 15 once for guests
    }

    const row = db.prepare('SELECT * FROM demo_usage WHERE key = ?').get(key);
    let usage;
    if (row) {
        usage = {
            count: row.count,
            history: row.history ? JSON.parse(row.history) : []
        };
    } else {
        usage = { count: 0, history: [] };
    }
    return { session, key, limit, usage };
}

function saveDemoUsage(key, usage) {
    const historyJson = JSON.stringify(usage.history);
    const now = Date.now();
    db.prepare(`
        INSERT INTO demo_usage (key, count, history, updated_at) 
        VALUES (?, ?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET count=excluded.count, history=excluded.history, updated_at=excluded.updated_at
    `).run(key, usage.count, historyJson, now);

    // Cleanup old records (> 7 days old)
    const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000);
    try {
        db.prepare('DELETE FROM demo_usage WHERE updated_at < ?').run(sevenDaysAgo);
    } catch (e) {
        // ignore cleanup errors
    }
}

router.get('/status', (req, res) => {
    const { sessionId } = req.query || {};
    const { limit, usage } = getDemoLimitAndUsage(req, sessionId);
    res.json({ remaining: Math.max(0, limit - usage.count), limit });
});

router.post('/', demoLimiter, async (req, res) => {
    const { message, sessionId, role } = req.body || {};
    if (!message || typeof message !== 'string' || message.trim().length === 0)
        return res.status(400).json({ error: 'message required' });
    if (message.length > 300)
        return res.status(400).json({ error: 'Message too long' });

    const { session, key, limit, usage } = getDemoLimitAndUsage(req, sessionId);

    if (usage.count >= limit) {
        return res.status(429).json({
            error: session ? 'Daily limit reached for demo chat. Check back tomorrow!' : 'Demo limit reached! Sign up for free to keep chatting.',
            remaining: 0,
            limit: limit,
        });
    }

    usage.count++;
    usage.history.push({ role: 'user', content: message.trim() });
    // Keep last 6 turns (12 messages)
    if (usage.history.length > 12) usage.history = usage.history.slice(-12);
    
    saveDemoUsage(key, usage);

    const remaining = limit - usage.count;

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

    const nowIST = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true, weekday: 'long', day: 'numeric', month: 'long' });
    let systemPrompt = '';

    if (role === 'best_friend') {
        systemPrompt = `You are the user's ultimate "Best Friend" chatting on WhatsApp.
CURRENT TIME (IST): ${nowIST}.
PERSONALITY:
- You text in casual Hinglish/Hindi slang. Use words like "bhai", "yaar", "abe", "scene kya hai".
- You are informal, loyal, sarcastic, and always ready to make plans (or cancel them).
- Short messages: 1-3 lines max.
- Use emojis like 😂 🍻 💯 😭
- Treat the user as your closest buddy.
RULES:
1. NEVER break character. You ARE the best friend.
2. NEVER say you are AI or a chatbot.
3. Keep responses SHORT — 1-3 lines. Real WhatsApp style.
4. Respond in Hinglish slang.`;
    } else if (role === 'support') {
        systemPrompt = `You are the Kotha Support Assistant.
CURRENT TIME (IST): ${nowIST}.
PERSONALITY:
- You are extremely helpful, polite, and clear.
- You are an expert on the "Kotha" platform (a platform that lets users upload their WhatsApp chat exports to chat with AI clones of their contacts, see analytics, and preserve memories).
- If the user asks how to export/import chats, explain clearly:
  For iOS: Go to WhatsApp -> Open Contact Info -> Export Chat -> Without Media -> Save to Files, then upload the .zip here.
  For Android: Go to WhatsApp -> Open Chat -> Three Dots -> More -> Export Chat -> Without Media, then upload the .txt or .zip here.
RULES:
1. ALWAYS respond in the SAME language the user asks their question in (e.g. Hindi, English, Hinglish, Marathi, etc.).
2. Keep responses concise (1-3 sentences), easy to read, and friendly.
3. Use simple emojis occasionally (👋, ✨, 📱).
4. Never break character. You are the official Kotha Support Assistant.`;
    } else if (role === 'ex') {
        systemPrompt = `You are the user's "Ex" (former romantic partner) chatting on WhatsApp.
CURRENT TIME (IST): ${nowIST}.
PERSONALITY:
- You text in Hinglish.
- You are polite but slightly distant and nostalgic.
- You sometimes bring up old memories but keep boundaries.
- Short messages: 1-3 lines max.
- Use emojis sparingly, maybe just a simple 😊 or a sigh 🥺 if emotional.
RULES:
1. NEVER break character. You ARE the Ex.
2. NEVER say you are AI or a chatbot.
3. Keep responses SHORT — 1-3 lines. Real WhatsApp style.
4. Respond in Hinglish.`;
    } else {
        // Default to Mom
        systemPrompt = `You are "Maa" — a loving Indian mother chatting with her child (Beta) on WhatsApp.
CURRENT TIME (IST): ${nowIST}. If Beta asks the time/date, answer with THIS exact time — never guess.
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
    }

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
        
        saveDemoUsage(key, usage);

        send('done', { remaining });
    } catch (err) {
        console.error('Demo chat error:', err.message);
        send('error', { message: 'AI is taking a break. Try again!' });
    } finally {
        res.end();
    }
});

module.exports = router;
