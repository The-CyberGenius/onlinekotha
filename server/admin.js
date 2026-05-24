const express = require('express');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const { db, getSetting, setSetting } = require('./db');
const { encrypt, decrypt, maskKey } = require('./crypto');
const { requireAdmin } = require('./auth');
const { userDir, SRC_DIR } = require('./upload');
const integ = require('./integrations');
const email = require('./email');
const billing = require('./billing');
const oauth = require('./oauth');

const router = express.Router();
router.use(requireAdmin);

// Known providers with default models suggestion
const KNOWN_PROVIDERS = {
    anthropic: {
        label: 'Anthropic',
        baseUrl: 'https://api.anthropic.com/v1',
        models: [
            { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5', in: 3, out: 15 },
            { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5', in: 1, out: 5 },
            { id: 'claude-opus-4-5', name: 'Claude Opus 4.5', in: 15, out: 75 },
        ],
    },
    openai: {
        label: 'OpenAI',
        baseUrl: 'https://api.openai.com/v1',
        models: [
            { id: 'gpt-4o', name: 'GPT-4o', in: 2.5, out: 10 },
            { id: 'gpt-4o-mini', name: 'GPT-4o mini', in: 0.15, out: 0.6 },
        ],
    },
    google: {
        label: 'Google Gemini',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
        models: [
            { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', in: 0.1, out: 0.4 },
            { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', in: 1.25, out: 5 },
        ],
    },
    groq: {
        label: 'Groq',
        baseUrl: 'https://api.groq.com/openai/v1',
        models: [
            { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B', in: 0.59, out: 0.79 },
            { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B', in: 0.05, out: 0.08 },
        ],
    },
    openrouter: {
        label: 'OpenRouter',
        baseUrl: 'https://openrouter.ai/api/v1',
        models: [],
    },
    ollama: {
        label: 'Ollama (local)',
        baseUrl: 'http://localhost:11434/v1',
        models: [
            { id: 'llama3.1', name: 'Llama 3.1 8B (local)', in: 0, out: 0 },
        ],
    },
};

router.get('/known-providers', (req, res) => {
    res.json(KNOWN_PROVIDERS);
});

// ---------- Providers ----------
router.get('/providers', (req, res) => {
    const rows = db
        .prepare('SELECT id, name, label, base_url, enabled, created_at, last_tested_at, last_test_ok, last_test_error FROM providers ORDER BY id')
        .all();
    const withKey = rows.map(r => {
        let masked = '';
        try {
            const enc = db.prepare('SELECT api_key_encrypted FROM providers WHERE id = ?').get(r.id);
            masked = maskKey(decrypt(enc.api_key_encrypted));
        } catch {
            masked = '••••';
        }
        return { ...r, key_masked: masked };
    });
    res.json(withKey);
});

router.post('/providers', (req, res) => {
    const { name, label, api_key, base_url } = req.body || {};
    if (!name || !api_key) return res.status(400).json({ error: 'name + api_key required' });
    try {
        const known = KNOWN_PROVIDERS[name];
        const finalBaseUrl = base_url || (known ? known.baseUrl : null);
        const finalLabel = label || (known ? known.label : name);
        const enc = encrypt(api_key);
        const info = db
            .prepare(
                `INSERT INTO providers (name, label, api_key_encrypted, base_url, enabled, created_at)
                 VALUES (?, ?, ?, ?, 1, ?)`
            )
            .run(name, finalLabel, enc, finalBaseUrl, Date.now());

        // Auto-seed known models
        if (known && known.models.length) {
            const stmt = db.prepare(
                `INSERT OR IGNORE INTO models (provider_id, model_id, display_name, input_price_per_1m, output_price_per_1m, enabled)
                 VALUES (?, ?, ?, ?, ?, 1)`
            );
            for (const m of known.models) {
                stmt.run(info.lastInsertRowid, m.id, m.name, m.in, m.out);
            }
        }
        res.json({ ok: true, id: info.lastInsertRowid });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.patch('/providers/:id', (req, res) => {
    const id = Number(req.params.id);
    const { api_key, base_url, label, enabled } = req.body || {};
    const fields = [];
    const values = [];
    if (api_key) { fields.push('api_key_encrypted = ?'); values.push(encrypt(api_key)); }
    if (base_url !== undefined) { fields.push('base_url = ?'); values.push(base_url); }
    if (label !== undefined) { fields.push('label = ?'); values.push(label); }
    if (enabled !== undefined) { fields.push('enabled = ?'); values.push(enabled ? 1 : 0); }
    if (!fields.length) return res.status(400).json({ error: 'no fields' });
    values.push(id);
    db.prepare(`UPDATE providers SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    res.json({ ok: true });
});

router.delete('/providers/:id', (req, res) => {
    db.prepare('DELETE FROM providers WHERE id = ?').run(Number(req.params.id));
    res.json({ ok: true });
});

router.post('/providers/:id/test', async (req, res) => {
    const id = Number(req.params.id);
    const row = db.prepare('SELECT * FROM providers WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ error: 'not found' });

    let ok = false;
    let error = null;
    try {
        const apiKey = decrypt(row.api_key_encrypted);
        const result = await testProvider(row.name, apiKey, row.base_url);
        ok = result.ok;
        error = result.error || null;
    } catch (err) {
        error = err.message;
    }

    db.prepare(
        'UPDATE providers SET last_tested_at = ?, last_test_ok = ?, last_test_error = ? WHERE id = ?'
    ).run(Date.now(), ok ? 1 : 0, error, id);

    res.json({ ok, error });
});

async function testProvider(name, apiKey, baseUrl) {
    try {
        if (name === 'anthropic') {
            const r = await fetch(`${baseUrl}/messages`, {
                method: 'POST',
                headers: {
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01',
                    'content-type': 'application/json',
                },
                body: JSON.stringify({
                    model: 'claude-haiku-4-5',
                    max_tokens: 5,
                    messages: [{ role: 'user', content: 'hi' }],
                }),
            });
            if (r.ok) return { ok: true };
            const text = await r.text();
            return { ok: false, error: `${r.status}: ${text.slice(0, 200)}` };
        }
        if (name === 'openai' || name === 'groq' || name === 'openrouter' || name === 'ollama') {
            const r = await fetch(`${baseUrl}/models`, {
                headers: { Authorization: `Bearer ${apiKey}` },
            });
            if (r.ok) return { ok: true };
            return { ok: false, error: `${r.status}` };
        }
        if (name === 'google') {
            const r = await fetch(`${baseUrl}/models?key=${apiKey}`);
            if (r.ok) return { ok: true };
            return { ok: false, error: `${r.status}` };
        }
        return { ok: true, error: 'No test implemented; key saved' };
    } catch (err) {
        return { ok: false, error: err.message };
    }
}

// ---------- Models ----------
router.get('/models', (req, res) => {
    const rows = db
        .prepare(
            `SELECT m.*, p.name AS provider_name, p.label AS provider_label
             FROM models m JOIN providers p ON p.id = m.provider_id
             ORDER BY p.id, m.id`
        )
        .all();
    res.json(rows);
});

router.post('/models', (req, res) => {
    const { provider_id, model_id, display_name, input_price_per_1m, output_price_per_1m, context_window } = req.body || {};
    if (!provider_id || !model_id) return res.status(400).json({ error: 'provider_id + model_id required' });
    const info = db
        .prepare(
            `INSERT OR IGNORE INTO models (provider_id, model_id, display_name, input_price_per_1m, output_price_per_1m, context_window, enabled)
             VALUES (?, ?, ?, ?, ?, ?, 1)`
        )
        .run(provider_id, model_id, display_name || model_id, input_price_per_1m || 0, output_price_per_1m || 0, context_window || null);
    res.json({ ok: true, id: info.lastInsertRowid });
});

router.patch('/models/:id', (req, res) => {
    const id = Number(req.params.id);
    const allowed = ['display_name', 'input_price_per_1m', 'output_price_per_1m', 'context_window', 'enabled'];
    const fields = [];
    const values = [];
    for (const k of allowed) {
        if (req.body[k] !== undefined) {
            fields.push(`${k} = ?`);
            values.push(k === 'enabled' ? (req.body[k] ? 1 : 0) : req.body[k]);
        }
    }
    if (!fields.length) return res.status(400).json({ error: 'no fields' });
    values.push(id);
    db.prepare(`UPDATE models SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    res.json({ ok: true });
});

router.delete('/models/:id', (req, res) => {
    db.prepare('DELETE FROM models WHERE id = ?').run(Number(req.params.id));
    res.json({ ok: true });
});

// ---------- Routes (feature → model) ----------
const FEATURES = ['chat', 'embedding', 'wrapped'];

router.get('/routes', (req, res) => {
    const rows = db.prepare('SELECT * FROM routes').all();
    const map = {};
    for (const f of FEATURES) {
        map[f] = rows.find(r => r.feature === f) || {
            feature: f,
            primary_model_id: null,
            fallback_model_id: null,
            max_tokens: 1024,
            temperature: 0.7,
        };
    }
    res.json(map);
});

router.put('/routes/:feature', (req, res) => {
    const feature = req.params.feature;
    if (!FEATURES.includes(feature)) return res.status(400).json({ error: 'bad feature' });
    const { primary_model_id, fallback_model_id, system_prompt, max_tokens, temperature } = req.body || {};
    db.prepare(
        `INSERT INTO routes (feature, primary_model_id, fallback_model_id, system_prompt, max_tokens, temperature)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(feature) DO UPDATE SET
           primary_model_id=excluded.primary_model_id,
           fallback_model_id=excluded.fallback_model_id,
           system_prompt=excluded.system_prompt,
           max_tokens=excluded.max_tokens,
           temperature=excluded.temperature`
    ).run(feature, primary_model_id || null, fallback_model_id || null, system_prompt || null, max_tokens || 1024, temperature ?? 0.7);
    res.json({ ok: true });
});

// ---------- Settings ----------
router.get('/settings', (req, res) => {
    const rows = db.prepare('SELECT key, value FROM settings').all();
    const obj = {};
    for (const r of rows) obj[r.key] = r.value;
    res.json(obj);
});

router.put('/settings', (req, res) => {
    const updates = req.body || {};
    for (const [k, v] of Object.entries(updates)) setSetting(k, v);
    res.json({ ok: true });
});

// ---------- Users + Usage ----------
router.get('/users', (req, res) => {
    const rows = db
        .prepare(
            `SELECT u.id, u.email, u.plan, u.trial_expires_at, u.created_at, u.is_admin,
                    u.google_id, u.display_name, u.avatar_url,
                    (SELECT COUNT(*) FROM chats WHERE user_id = u.id) AS chat_count,
                    (SELECT COALESCE(SUM(cost_usd), 0) FROM usage_log WHERE user_id = u.id) AS total_cost
             FROM users u ORDER BY u.id DESC`
        )
        .all();
    res.json(rows);
});

// Get user's chats list
router.get('/users/:id/chats', (req, res) => {
    const userId = Number(req.params.id);
    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const chats = db.prepare(
        'SELECT id, folder_name, display_name, message_count, created_at FROM chats WHERE user_id = ? ORDER BY created_at DESC'
    ).all(userId);
    res.json(chats);
});

// Download a user's chat folder as zip
router.get('/users/:id/chats/:chatId/download', (req, res) => {
    const userId = Number(req.params.id);
    const chatId = Number(req.params.chatId);
    const chat = db.prepare('SELECT * FROM chats WHERE id = ? AND user_id = ?').get(chatId, userId);
    if (!chat) return res.status(404).json({ error: 'Chat not found' });

    const chatDir = path.join(SRC_DIR, `u_${userId}`, chat.folder_name);
    if (!fs.existsSync(chatDir)) return res.status(404).json({ error: 'Chat folder not found on disk' });

    const safeName = (chat.display_name || chat.folder_name).replace(/[^a-zA-Z0-9_\-]/g, '_');
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.zip"`);

    const archive = archiver('zip', { zlib: { level: 5 } });
    archive.on('error', (err) => { res.status(500).end(); });
    archive.pipe(res);
    archive.directory(chatDir, safeName);
    archive.finalize();
});

// ---------- Manage user plan / trial ----------
router.patch('/users/:id/plan', (req, res) => {
    const userId = Number(req.params.id);
    const user = db.prepare('SELECT id, plan, trial_expires_at FROM users WHERE id = ?').get(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { plan, trial_extends_hours, trial_expires_at } = req.body || {};
    const fields = [];
    const values = [];

    if (plan && ['free', 'trial', 'paid'].includes(plan)) {
        fields.push('plan = ?');
        values.push(plan);
    }

    if (trial_expires_at !== undefined) {
        // Direct timestamp set
        fields.push('trial_expires_at = ?');
        values.push(trial_expires_at ? Number(trial_expires_at) : null);
    } else if (trial_extends_hours) {
        // Extend from now (or from current expiry if still active)
        const base = (user.trial_expires_at && user.trial_expires_at > Date.now())
            ? user.trial_expires_at
            : Date.now();
        fields.push('trial_expires_at = ?');
        values.push(base + Number(trial_extends_hours) * 3600000);
    }

    if (!fields.length) return res.status(400).json({ error: 'Provide plan or trial_extends_hours' });

    values.push(userId);
    db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...values);

    const updated = db.prepare('SELECT id, email, plan, trial_expires_at FROM users WHERE id = ?').get(userId);
    res.json({ ok: true, user: updated });
});

// Delete user account + all data
router.delete('/users/:id', (req, res) => {
    const userId = Number(req.params.id);
    const user = db.prepare('SELECT id, email, is_admin FROM users WHERE id = ?').get(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    // Don't let admin delete themselves
    if (user.id === req.user.id) return res.status(400).json({ error: 'Cannot delete yourself' });

    // Delete user files from disk
    const uDir = path.join(SRC_DIR, `u_${userId}`);
    if (fs.existsSync(uDir)) {
        fs.rmSync(uDir, { recursive: true, force: true });
    }

    // DB cascade handles sessions, chats, conversations, conv_messages
    db.prepare('DELETE FROM usage_log WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM conv_messages WHERE conversation_id IN (SELECT id FROM conversations WHERE user_id = ?)').run(userId);
    db.prepare('DELETE FROM conversations WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM chats WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);

    res.json({ ok: true });
});

// ---------- AI Conversation Logs (Admin) ----------
router.get('/users/:id/conversations', (req, res) => {
    const userId = Number(req.params.id);
    const rows = db.prepare(
        `SELECT c.id, c.chat_folder, c.title, c.created_at, c.updated_at,
                (SELECT COUNT(*) FROM conv_messages WHERE conversation_id = c.id) AS msg_count
         FROM conversations c WHERE c.user_id = ? ORDER BY c.updated_at DESC`
    ).all(userId);
    res.json(rows);
});

router.get('/users/:id/conversations/:convId', (req, res) => {
    const userId = Number(req.params.id);
    const convId = Number(req.params.convId);
    const conv = db.prepare('SELECT * FROM conversations WHERE id = ? AND user_id = ?').get(convId, userId);
    if (!conv) return res.status(404).json({ error: 'Conversation not found' });
    const msgs = db.prepare(
        'SELECT id, role, content, citations, created_at FROM conv_messages WHERE conversation_id = ? ORDER BY id'
    ).all(convId);
    res.json({ ...conv, messages: msgs });
});

router.get('/users/:id/conversations/:convId/download', (req, res) => {
    const userId = Number(req.params.id);
    const convId = Number(req.params.convId);
    const conv = db.prepare('SELECT * FROM conversations WHERE id = ? AND user_id = ?').get(convId, userId);
    if (!conv) return res.status(404).json({ error: 'Conversation not found' });

    const msgs = db.prepare(
        'SELECT role, content, created_at FROM conv_messages WHERE conversation_id = ? ORDER BY id'
    ).all(convId);

    // Build readable text log
    let log = `AI Conversation Log\n`;
    log += `User ID: ${userId}\n`;
    log += `Chat: ${conv.chat_folder}\n`;
    log += `Title: ${conv.title}\n`;
    log += `Created: ${new Date(conv.created_at).toISOString()}\n`;
    log += `${'='.repeat(50)}\n\n`;

    for (const m of msgs) {
        const time = new Date(m.created_at).toLocaleString();
        const label = m.role === 'user' ? 'USER' : 'AI';
        log += `[${time}] ${label}:\n${m.content}\n\n`;
    }

    const safeName = `ai_log_user${userId}_conv${convId}`;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.txt"`);
    res.send(log);
});

router.get('/usage/summary', (req, res) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayMs = today.getTime();

    const todayCost = db.prepare('SELECT COALESCE(SUM(cost_usd), 0) AS c FROM usage_log WHERE created_at >= ?').get(todayMs).c;
    const totalCost = db.prepare('SELECT COALESCE(SUM(cost_usd), 0) AS c FROM usage_log').get().c;
    const totalCalls = db.prepare('SELECT COUNT(*) AS n FROM usage_log').get().n;
    const dailyCap = Number(getSetting('daily_spend_cap_usd', '5'));

    res.json({ todayCost, totalCost, totalCalls, dailyCap });
});

// ---------- Integrations (email / stripe / oauth) ----------
router.get('/integrations', (req, res) => {
    const snap = integ.snapshot();
    res.json({
        ...snap,
        status: {
            email: email.configured(),
            stripe: billing.configured(),
            google: oauth.configured(),
        },
    });
});

router.put('/integrations', (req, res) => {
    const body = req.body || {};
    const updates = {};
    const nulls = [];

    // Email section
    if (body.email) {
        for (const [field, val] of Object.entries(body.email)) {
            const key = `integ.email.${field}`;
            if (val === null || val === '') nulls.push(key);
            else updates[key] = val;
        }
    }
    // Stripe section
    if (body.stripe) {
        for (const [field, val] of Object.entries(body.stripe)) {
            const key = `integ.stripe.${field}`;
            if (val === null || val === '') nulls.push(key);
            else updates[key] = val;
        }
    }
    // OAuth section
    if (body.oauth) {
        for (const [field, val] of Object.entries(body.oauth)) {
            const key = `integ.oauth.${field}`;
            if (val === null || val === '') nulls.push(key);
            else updates[key] = val;
        }
    }

    integ.bulkUpdate(updates, nulls);
    // Invalidate caches so next request picks up new config
    email.resetTransporter();
    billing.resetStripe();
    oauth.resetStrategy();

    res.json({ ok: true });
});

router.post('/integrations/test-email', async (req, res) => {
    const to = (req.body && req.body.to) || req.user.email;
    const result = await email.testEmail(to);
    res.json(result);
});

module.exports = router;
