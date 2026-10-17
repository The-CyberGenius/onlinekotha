const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { callLLM } = require('../llm');
const { getSession, effectivePlan } = require('../auth');
const { db, getSetting } = require('../db');
const { KOTHA_ASSISTANT_SYSTEM_PROMPT } = require('../assistant_prompt');

const DEMO_LIMIT = 15;

const demoLimiter = rateLimit({
    windowMs: 60_000,
    max: 12,
    message: { error: 'Too fast. Wait a moment.' },
    validate: false,
});

function getAssistantOwner(req) {
    if (req.user) {
        return { userId: req.user.id, guestId: null };
    }
    const guestId = req.cookies && req.cookies.kotha_guest_id;
    return { userId: null, guestId: guestId || null };
}

function getDemoLimitAndUsage(req, sessionId) {
    const user = req.user;
    let key, limit;
    if (user) {
        const dateStr = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }).split(',')[0];
        key = `user_${user.id}_${dateStr}`;
        limit = (user.is_admin || user.is_pro || user.plan === 'paid') ? 9999 : 15;
    } else {
        const guestId = req.cookies && req.cookies.kotha_guest_id;
        key = `guest_${guestId || req.ip}_${sessionId || 'x'}`;
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
    return { session: user ? { user } : null, key, limit, usage };
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

function getLiveUserContext(session, req) {
    if (session && session.user) {
        const u = session.user;
        const plan = effectivePlan(u);
        const isPro = plan === 'paid';

        let usedToday = 0;
        let freeDailyMax = 5;
        let remainingToday = null;

        try {
            const startOfDay = new Date();
            startOfDay.setHours(0, 0, 0, 0);
            const row = db.prepare(
                `SELECT COUNT(*) AS n FROM conv_messages cm
                 JOIN conversations c ON c.id = cm.conversation_id
                 WHERE c.user_id = ? AND cm.role = 'user' AND cm.created_at >= ?`
            ).get(u.id, startOfDay.getTime());
            usedToday = row ? row.n : 0;
            freeDailyMax = Number(getSetting('free_user_daily_messages', '5'));
            remainingToday = isPro ? null : Math.max(0, freeDailyMax - usedToday);
        } catch (e) {}

        let chatImportsUsed = 0;
        try {
            const countRow = db.prepare('SELECT COUNT(*) as n FROM saved_chats WHERE user_id = ?').get(u.id);
            chatImportsUsed = countRow ? countRow.n : 0;
        } catch (e) {}

        return {
            user: {
                plan: isPro ? 'pro' : 'free',
                is_logged_in: true,
                email: u.email,
                ai_messages_used_today: usedToday,
                ai_messages_limit_today: isPro ? 'unlimited' : freeDailyMax,
                ai_messages_remaining_today: remainingToday,
                unlimited_ai: isPro,
                chat_imports_used: chatImportsUsed,
                chat_import_limit: isPro ? 'unlimited' : 5,
            },
            app: {
                name: 'OnlineKotha',
                ai_name: 'Kotha',
                website: 'https://www.onlinekotha.com/',
                pricing: {
                    free: { price: '$0', imports: 5, ai_per_day: 5 },
                    pro: { price: '$6/month', imports: 'unlimited', ai_per_day: 'unlimited' },
                    lifetime: { price: '$49 one-time', imports: 'unlimited', ai_per_day: 'unlimited', priority_support: true },
                },
            },
        };
    } else {
        // Guest user
        return {
            user: {
                plan: 'guest',
                is_logged_in: false,
                ai_messages_used_today: 0,
                ai_messages_limit_today: 5,
                ai_messages_remaining_today: 5,
                unlimited_ai: false,
                chat_imports_used: 0,
                chat_import_limit: 1,
            },
            app: {
                name: 'OnlineKotha',
                ai_name: 'Kotha',
                website: 'https://www.onlinekotha.com/',
                pricing: {
                    free: { price: '$0', imports: 5, ai_per_day: 5 },
                    pro: { price: '$6/month', imports: 'unlimited', ai_per_day: 'unlimited' },
                    lifetime: { price: '$49 one-time', imports: 'unlimited', ai_per_day: 'unlimited', priority_support: true },
                },
            },
        };
    }
}

router.get('/status', (req, res) => {
    const { sessionId } = req.query || {};
    const { limit, usage } = getDemoLimitAndUsage(req, sessionId);
    res.json({ remaining: Math.max(0, limit - usage.count), limit });
});

// Fetch persistent Kotha Assistant conversation history for user or guest
router.get('/history', (req, res) => {
    const { userId, guestId } = getAssistantOwner(req);
    if (!userId && !guestId) return res.json({ ok: true, messages: [] });

    try {
        const sql = userId
            ? 'SELECT id, sender, role, text, time, date, created_at FROM kotha_assistant_messages WHERE user_id = ? ORDER BY id ASC'
            : 'SELECT id, sender, role, text, time, date, created_at FROM kotha_assistant_messages WHERE guest_id = ? ORDER BY id ASC';
        const params = [userId || guestId];
        const messages = db.prepare(sql).all(...params);
        res.json({ ok: true, messages });
    } catch (err) {
        console.error('Error fetching assistant history:', err);
        res.status(500).json({ error: 'Failed to fetch assistant history' });
    }
});

// Sync local storage messages to server once if server is empty
router.post('/history/sync', (req, res) => {
    // If admin is impersonating, never sync the admin's local storage to the user
    if (req.user && req.user.is_impersonating) {
        return res.json({ ok: false, message: 'Skipped during impersonation' });
    }
    const { messages } = req.body || {};
    if (!Array.isArray(messages) || messages.length === 0) {
        return res.json({ ok: true, count: 0 });
    }
    const { userId, guestId } = getAssistantOwner(req);
    if (!userId && !guestId) return res.json({ ok: false });

    try {
        const existingCount = userId
            ? db.prepare('SELECT COUNT(*) as c FROM kotha_assistant_messages WHERE user_id = ?').get(userId).c
            : db.prepare('SELECT COUNT(*) as c FROM kotha_assistant_messages WHERE guest_id = ?').get(guestId).c;

        if (existingCount === 0) {
            const insertStmt = db.prepare(`
                INSERT INTO kotha_assistant_messages (user_id, guest_id, sender, role, text, time, date, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `);
            const insertMany = db.transaction((list) => {
                for (const m of list) {
                    if (!m.text || m.text.includes("Hi there! 👋 I'm Kotha Assistant")) continue;
                    const sender = m.sender || (m.role === 'user' ? 'You' : 'Kotha Assistant');
                    const role = m.role || (sender === 'You' ? 'user' : 'assistant');
                    const time = m.time || '';
                    const date = m.date || new Date().toLocaleDateString('en-CA');
                    const createdAt = m.created_at || Date.now();
                    insertStmt.run(userId, guestId, sender, role, m.text, time, date, createdAt);
                }
            });
            insertMany(messages);
        }
        res.json({ ok: true });
    } catch (err) {
        console.error('Error syncing assistant history:', err);
        res.status(500).json({ error: 'Sync failed' });
    }
});

router.post('/', demoLimiter, async (req, res) => {
    const { message, sessionId, role, sendAsAI } = req.body || {};
    if (!message || typeof message !== 'string' || message.trim().length === 0)
        return res.status(400).json({ error: 'message required' });
    if (message.length > 500)
        return res.status(400).json({ error: 'Message too long' });

    const { userId, guestId } = getAssistantOwner(req);
    const isAssistant = role === 'support' || role === 'assistant' || !role;
    const now = Date.now();
    const todayIso = new Date().toLocaleDateString('en-CA');
    const timeNow = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // Handle manual admin reply as AI
    if (sendAsAI && req.user && req.user.is_admin && req.user.is_impersonating) {
        if (isAssistant && userId) {
            db.prepare(`
                INSERT INTO kotha_assistant_messages (user_id, guest_id, sender, role, text, time, date, created_at)
                VALUES (?, ?, 'Kotha Assistant', 'assistant', ?, ?, ?, ?)
            `).run(userId, null, message.trim(), timeNow, todayIso, now);

            // Broadcast to the user via Socket.IO
            const io = req.app.get('io');
            const onlineUsers = req.app.locals?.onlineUsers;
            if (io && onlineUsers) {
                const sockets = onlineUsers.get(userId);
                if (sockets) {
                    sockets.forEach(sid => io.to(sid).emit('assistant:message', {
                        sender: 'Kotha Assistant',
                        text: message.trim(),
                        time: timeNow,
                        date: todayIso
                    }));
                }
            }
        }
        return res.json({ ok: true, manual: true });
    }

    const { session, key, limit, usage } = getDemoLimitAndUsage(req, sessionId);

    if (usage.count >= limit) {
        return res.status(429).json({
            error: session ? 'Daily limit reached for demo chat. Check back tomorrow!' : 'Demo limit reached! Sign up for free to keep chatting.',
            remaining: 0,
            limit: limit,
        });
    }

    // Save user message to persistent history if Kotha Assistant
    if (isAssistant && (userId || guestId)) {
        try {
            db.prepare(`
                INSERT INTO kotha_assistant_messages (user_id, guest_id, sender, role, text, time, date, created_at)
                VALUES (?, ?, 'You', 'user', ?, ?, ?, ?)
            `).run(userId, guestId, message.trim(), timeNow, todayIso, now);
        } catch (e) {
            console.error('Failed to save user assistant message:', e);
        }
    }

    usage.count++;
    usage.history.push({ role: 'user', content: message.trim() });
    
    // For Assistant chat, load recent turns from database for richer conversational context
    if (isAssistant && (userId || guestId)) {
        try {
            const recentRows = db.prepare(`
                SELECT role, text as content FROM kotha_assistant_messages
                WHERE ${userId ? 'user_id = ?' : 'guest_id = ?'}
                ORDER BY id DESC LIMIT 12
            `).all(userId || guestId).reverse();
            if (recentRows.length > 0) {
                usage.history = recentRows;
            }
        } catch (e) {}
    }

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
    } else if (isAssistant) {
        let basePrompt = KOTHA_ASSISTANT_SYSTEM_PROMPT;
        try {
            const assistantRoute = db.prepare('SELECT * FROM routes WHERE feature = ?').get('assistant');
            if (assistantRoute && assistantRoute.system_prompt) {
                basePrompt = assistantRoute.system_prompt;
            }
        } catch (e) {}

        const liveContext = getLiveUserContext(session ? session.user : null, req);
        systemPrompt = `${basePrompt}

====================================================
LIVE USER CONTEXT & BACKEND STATE (SOURCE OF TRUTH)
====================================================
Current Time (IST): ${nowIST}
Live Application & User State:
${JSON.stringify(liveContext, null, 2)}
`;
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
        const targetFeature = isAssistant ? 'assistant' : 'chat';
        await callLLM({
            feature: targetFeature,
            messages: usage.history,
            systemPrompt,
            userId: session?.user?.id || null,
            signal: abortController.signal,
            onToken: (token) => {
                fullText += token;
                send('token', { text: token });
            },
        });

        // Save AI response to persistent history
        if (isAssistant && (userId || guestId)) {
            try {
                db.prepare(`
                    INSERT INTO kotha_assistant_messages (user_id, guest_id, sender, role, text, time, date, created_at)
                    VALUES (?, ?, 'Kotha Assistant', 'assistant', ?, ?, ?, ?)
                `).run(userId, guestId, fullText.trim(), timeNow, todayIso, Date.now());
            } catch (e) {
                console.error('Failed to save assistant response:', e);
            }
        }

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
