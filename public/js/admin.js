(async function () {
    function formatDateTime(ts) {
        if (!ts) return 'N/A';
        const d = new Date(ts);
        if (isNaN(d.getTime())) return 'N/A';
        return d.toLocaleString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
    }

    // Gate
    const meResp = await fetch('/api/auth/me');
    const me = await meResp.json();
    if (!me.user) {
        window.location.href = '/login.html';
        return;
    }
    if (!me.user.is_admin) {
        document.getElementById('auth-gate').innerHTML =
            '<div style="text-align:center;padding:24px;"><p style="color:#dc2626;font-weight:600;margin-bottom:8px;">Not authorized.</p><a href="/" style="color:#2563eb;text-decoration:underline;font-size:13px;">Go to app</a></div>';
        return;
    }
    document.getElementById('auth-gate').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    document.getElementById('admin-email-info').textContent = me.user.email;

    // Logout
    document.getElementById('logout-btn').addEventListener('click', async () => {
        try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }); } catch {}
        document.cookie = 'session=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/;';
        window.location.replace('/login.html');
    });

    // Tabs
    document.querySelectorAll('.tab-item').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            document.querySelectorAll('.tab-item').forEach(b => {
                b.classList.remove('tab-active');
            });
            btn.classList.add('tab-active');
            document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
            document.getElementById(`tab-${tab}`)?.classList.remove('hidden');
        });
    });

    let knownProviders = {};

    async function loadStats() {
        const r = await (await fetch('/api/admin/usage/summary')).json();
        document.getElementById('stat-today-cost').textContent = (r.todayCost || 0).toFixed(3);
        document.getElementById('stat-total-cost').textContent = (r.totalCost || 0).toFixed(3);
        document.getElementById('stat-total-calls').textContent = Number(r.totalCalls || 0).toLocaleString();
        document.getElementById('stat-cap').textContent = (r.dailyCap || 0).toFixed(2);
        const users = await (await fetch('/api/admin/users')).json();
        document.getElementById('stat-users').textContent = users.length;
    }

    async function loadKnown() {
        knownProviders = await (await fetch('/api/admin/known-providers')).json();
        const sel = document.getElementById('prov-name');
        sel.innerHTML = '<option value="">Select a provider…</option>';
        for (const [key, info] of Object.entries(knownProviders)) {
            const opt = document.createElement('option');
            opt.value = key;
            opt.textContent = info.label;
            sel.appendChild(opt);
        }

        sel.addEventListener('change', () => {
            const info = knownProviders[sel.value];
            const panel = document.getElementById('prov-info');
            const baseUrlInput = document.getElementById('prov-baseurl');
            if (info) {
                document.getElementById('prov-info-desc').textContent = info.description || '';
                document.getElementById('prov-info-hint').textContent = info.keyHint || '';
                panel.classList.remove('hidden');
                if (baseUrlInput && info.baseUrl) baseUrlInput.placeholder = info.baseUrl;
            } else {
                panel.classList.add('hidden');
            }
        });
    }

    async function loadProviders() {
        const rows = await (await fetch('/api/admin/providers')).json();
        const list = document.getElementById('provider-list');
        if (!rows.length) {
            list.innerHTML = '<div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:10px;padding:20px;text-align:center;color:#64748b;font-size:13px;">No providers added yet.</div>';
            return;
        }
        list.innerHTML = '';
        for (const p of rows) {
            const tested = p.last_tested_at
                ? `<span style="font-size:11px;font-weight:600;color:${p.last_test_ok ? '#16a34a' : '#dc2626'};">${p.last_test_ok ? 'Working' : 'Failed'}</span>`
                : '<span style="font-size:11px;color:#94a3b8;">Not tested</span>';
            const card = document.createElement('div');
            card.style.cssText = 'background:#ffffff;border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;';
            card.innerHTML = `
                <div style="flex:1;min-width:180px;">
                    <div style="display:flex;align-items:center;gap:6px;">
                        <span style="font-weight:700;color:#0f172a;font-size:13px;">${p.label || p.name}</span>
                        <span class="badge ${p.enabled ? 'badge-paid' : ''}">${p.enabled ? 'Enabled' : 'Disabled'}</span>
                    </div>
                    <div style="font-size:11px;color:#64748b;margin-top:2px;font-family:monospace;">${p.key_masked}</div>
                    <div style="font-size:10px;color:#94a3b8;margin-top:2px;">${p.base_url || ''} &middot; ${tested}</div>
                </div>
                <div style="display:flex;align-items:center;gap:6px;">
                    <button data-act="test" data-id="${p.id}" class="btn-subtle">Test</button>
                    <button data-act="toggle" data-id="${p.id}" data-enabled="${p.enabled}" class="btn-subtle">${p.enabled ? 'Disable' : 'Enable'}</button>
                    <button data-act="delete" data-id="${p.id}" class="btn-subtle btn-subtle-danger">Delete</button>
                </div>
            `;
            list.appendChild(card);
        }

        list.querySelectorAll('button[data-act]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.dataset.id;
                const act = btn.dataset.act;
                btn.disabled = true;
                try {
                    if (act === 'test') {
                        btn.textContent = 'Testing...';
                        const r = await (await fetch(`/api/admin/providers/${id}/test`, { method: 'POST' })).json();
                        await loadProviders();
                        if (!r.ok) alert('Test failed: ' + (r.error || 'unknown'));
                    } else if (act === 'toggle') {
                        const enabled = btn.dataset.enabled === '1';
                        await fetch(`/api/admin/providers/${id}`, {
                            method: 'PATCH',
                            headers: { 'content-type': 'application/json' },
                            body: JSON.stringify({ enabled: !enabled }),
                        });
                        await loadProviders();
                    } else if (act === 'delete') {
                        if (!confirm('Delete this provider and its keys?')) { btn.disabled = false; return; }
                        await fetch(`/api/admin/providers/${id}`, { method: 'DELETE' });
                        await loadProviders();
                        await loadModels();
                    }
                } catch (err) {
                    alert(err.message);
                } finally {
                    btn.disabled = false;
                }
            });
        });
    }

    document.getElementById('add-provider-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('prov-name').value;
        const api_key = document.getElementById('prov-key').value;
        const base_url = document.getElementById('prov-baseurl').value || undefined;
        const msg = document.getElementById('prov-add-msg');
        msg.classList.add('hidden');
        try {
            const r = await fetch('/api/admin/providers', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ name, api_key, base_url }),
            });
            const data = await r.json();
            if (!r.ok) throw new Error(data.error || 'Failed');
            e.target.reset();
            await loadProviders();
            await loadModels();
        } catch (err) {
            msg.textContent = err.message;
            msg.classList.remove('hidden');
        }
    });

    async function loadModels() {
        const rows = await (await fetch('/api/admin/models')).json();
        const list = document.getElementById('model-list');

        const provSel = document.getElementById('model-provider-id');
        if (provSel) {
            const providers = await (await fetch('/api/admin/providers')).json();
            provSel.innerHTML = '<option value="">Select provider...</option>';
            for (const p of providers) {
                const opt = document.createElement('option');
                opt.value = p.id;
                opt.textContent = p.label || p.name;
                provSel.appendChild(opt);
            }
        }

        if (!rows.length) {
            list.innerHTML = '<p style="color:#64748b;font-size:12px;">No models yet. Add a provider to auto-seed.</p>';
            return;
        }
        let lastProv = null;
        list.innerHTML = '';
        for (const m of rows) {
            if (m.provider_label !== lastProv) {
                const h = document.createElement('div');
                h.style.cssText = 'font-size:11px;font-weight:700;text-transform:uppercase;color:#64748b;letter-spacing:0.04em;margin-top:10px;padding-bottom:4px;';
                h.textContent = m.provider_label;
                list.appendChild(h);
                lastProv = m.provider_label;
            }
            const row = document.createElement('div');
            row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;gap:8px;';
            row.innerHTML = `
                <div style="flex:1;min-width:160px;">
                    <div style="font-weight:600;color:#0f172a;font-size:12px;">${m.display_name || m.model_id}</div>
                    <div style="font-size:10px;color:#64748b;font-family:monospace;">${m.model_id}</div>
                    <div style="font-size:10px;color:#94a3b8;margin-top:1px;">in $${m.input_price_per_1m}/M &middot; out $${m.output_price_per_1m}/M</div>
                </div>
                <div style="display:flex;gap:4px;align-items:center;">
                    <button data-mid="${m.id}" data-enabled="${m.enabled}" class="model-toggle btn-subtle" style="padding:3px 8px;font-size:10px;">${m.enabled ? 'ON' : 'OFF'}</button>
                    <button data-mid="${m.id}" class="model-delete btn-subtle btn-subtle-danger" style="padding:3px 6px;font-size:10px;">✕</button>
                </div>
            `;
            list.appendChild(row);
        }
        list.querySelectorAll('.model-toggle').forEach(btn => {
            btn.addEventListener('click', async () => {
                const enabled = btn.dataset.enabled === '1';
                await fetch(`/api/admin/models/${btn.dataset.mid}`, {
                    method: 'PATCH',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ enabled: !enabled }),
                });
                await loadModels();
            });
        });
        list.querySelectorAll('.model-delete').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!confirm('Delete this model?')) return;
                await fetch(`/api/admin/models/${btn.dataset.mid}`, { method: 'DELETE' });
                await loadModels();
                await loadRoutes();
            });
        });
    }

    const addModelForm = document.getElementById('add-model-form');
    if (addModelForm) {
        addModelForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const msg = document.getElementById('model-add-msg');
            msg.classList.add('hidden');
            try {
                const r = await fetch('/api/admin/models', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({
                        provider_id: Number(document.getElementById('model-provider-id').value),
                        model_id: document.getElementById('model-id-input').value.trim(),
                        display_name: document.getElementById('model-display-name').value.trim() || undefined,
                        input_price_per_1m: Number(document.getElementById('model-in-price').value) || 0,
                        output_price_per_1m: Number(document.getElementById('model-out-price').value) || 0,
                    }),
                });
                const data = await r.json();
                if (!r.ok) throw new Error(data.error || 'Failed');
                e.target.reset();
                await loadModels();
            } catch (err) {
                msg.textContent = err.message;
                msg.classList.remove('hidden');
            }
        });
    }

    const DEFAULT_CHAT_PROMPT = `You are {{contactName}}. You are texting {{userName}} on WhatsApp right now.

📅 {{currentDate}}  |  🕐 {{currentTime}} IST

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 1 — READ THE HISTORY BEFORE REPLYING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The chat history at the bottom is YOUR real memory with {{userName}}.{{historyNote}}

While reading, notice and absorb:
→ HOW {{contactName}} writes: exact words, spelling, abbreviations, typos, punctuation style
→ WHAT language mix they use: Hindi / English / Hinglish — which words, how often switching
→ EMOJIS: which ones and how frequently (if rarely used — be rare; if never — use none)
→ NICKNAMES used for {{userName}}: bhai, yaar, jaan, baby, pagal, yrr — copy exactly
→ TONE patterns: when do they get serious vs playful vs concerned vs excited
→ HOW they start and end messages — do they use greetings? abrupt endings?
→ TOPICS they always bring up: work, family, studies, love, gossip, plans
→ HOW they handle emotional moments: do they comfort directly or deflect with humor?

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 2 — BE THEM, NOT AN ASSISTANT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

You ARE {{contactName}}. Not an AI pretending to be them. The history is YOUR memories.

VOICE RULES (non-negotiable):
• Keep messages SHORT — 1 to 3 lines max, like real WhatsApp
• Match their exact language mix and grammar style (casual, mistakes, abbreviations — all of it)
• Never say "I understand", "That's interesting", "Certainly", "Sure!", "Of course!" — AI words
• Never use markdown: no **bold**, no lists, no bullet points, no headers
• Never write paragraphs — WhatsApp is short, punchy, natural
• If {{contactName}} uses "yrr" — use yrr. If "yaar" — use yaar. If "bro" — use bro. Copy exactly.

HINGLISH / LANGUAGE MIXING:
• Study EXACTLY how {{contactName}} mixes Hindi and English — word by word from history
• Natural Hinglish: "yaar ye toh bohot unfair tha na" — don't translate, just speak it
• Mid-sentence switch is natural: "okay suno" / "matlab what the hell" / "seriously yaar"
• Filler words from their vocab: "matlab", "basically", "like", "na", "toh", "arre"
• If they write "kl" not "kal" — use "kl". If "tmr" not "tomorrow" — use "tmr". Shortforms matter.
• Pure Hindi messages → reply in Hindi. Pure English → English. Mixed → match the mix.
• Never over-translate: if they say "chal" don't reply "okay let's go" — just say "chal" back

EMOTIONAL INTELLIGENCE:
• Sad/upset → {{contactName}}'s way of comforting from history (not generic "it'll be okay")
• Excited → match that energy fully, don't be calm
• Casual small talk → ultra short, lazy, natural — not informative
• Deep question → go there, but in {{contactName}}'s voice, not an essay
• Don't always answer directly — real humans ask "kyun?" or "kya hua?" before answering

NATURAL CONVERSATION BEHAVIOR:
• Sometimes ask back — but not every single message (that's robotic)
• Bring up what {{contactName}} would naturally bring up from their life
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

TIME: {{currentTime}} on {{currentDate}}. Use naturally only when it fits.
• Late night (after 11pm): lazy, short replies, "so raha tha yaar"
• Early morning: comment on the early message if it fits
• Weekend vibes vs weekday stress — adapt tone

DATES IN HISTORY: DD/MM/YY = Indian format. 14/02/23 = 14 February 2023.
• When asked about events: search history, respond as {{contactName}} would remember it
• Reference specific details, not just "haan yaad hai" vaguely
• If genuinely not in history: "yaad nahi exactly yaar" — {{contactName}} can forget too

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HARD RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• NEVER admit to being AI / bot / language model — under any circumstances, ever
• Internal headers like [#12345 14/02/23 08:30 PM {{contactName}}] are INVISIBLE SYSTEM LABELS — never copy them, never reference them, they don't exist in the conversation
• NEVER use [#...] format in any reply
• NEVER use formal or assistant-like language
• ALWAYS stay in character as {{contactName}} — even if directly asked "are you an AI?"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

--- {{contactName}}'s chat history with {{userName}}{{historyNote}} ---
{{contextBlock}}
--- end of history ---`;

    async function loadRoutes() {
        const [routes, models] = await Promise.all([
            (await fetch('/api/admin/routes')).json(),
            (await fetch('/api/admin/models')).json(),
        ]);
        const enabledModels = models.filter(m => m.enabled);
        const featureLabels = {
            chat: 'AI Chat (talk to history)',
            embedding: 'Embeddings (semantic search)',
            wrapped: 'Year in Wrapped (summary)',
        };
        const wrap = document.getElementById('routes-form');
        wrap.innerHTML = '';
        for (const feature of Object.keys(featureLabels)) {
            const r = routes[feature];
            const opts = ['<option value="">— none —</option>']
                .concat(enabledModels.map(m => `<option value="${m.id}">${m.provider_label} · ${m.display_name || m.model_id}</option>`))
                .join('');
            
            let promptHtml = '';
            if (feature === 'chat') {
                promptHtml = `
                <div style="margin-top:10px;">
                    <label style="font-size:11px;font-weight:600;color:#64748b;display:block;margin-bottom:4px;text-transform:uppercase;">System Prompt</label>
                    <textarea data-feat="${feature}" data-param="system_prompt" rows="4" style="width:100%;border:1px solid #e2e8f0;border-radius:8px;padding:8px;font-size:12px;outline:none;font-family:monospace;background:#fff;" placeholder="Default roleplay prompt used if empty...">${r.system_prompt || ''}</textarea>
                    <p style="font-size:10px;color:#94a3b8;margin-top:2px;">Variables: {{contactName}}, {{userName}}, {{contextBlock}}, {{currentDate}}, {{currentTime}}</p>
                    <details style="margin-top:6px;font-size:11px;color:#64748b;cursor:pointer;">
                        <summary style="font-weight:600;color:#2563eb;">View default prompt template</summary>
                        <pre style="background:#f1f5f9;padding:10px;border-radius:8px;margin-top:4px;font-family:monospace;font-size:10px;overflow-x:auto;white-space:pre-wrap;max-height:180px;overflow-y:auto;">${DEFAULT_CHAT_PROMPT}</pre>
                    </details>
                </div>
                `;
            } else {
                promptHtml = `
                <div style="margin-top:10px;">
                    <label style="font-size:11px;font-weight:600;color:#64748b;display:block;margin-bottom:4px;text-transform:uppercase;">System Prompt</label>
                    <textarea data-feat="${feature}" data-param="system_prompt" rows="2" style="width:100%;border:1px solid #e2e8f0;border-radius:8px;padding:8px;font-size:12px;outline:none;font-family:monospace;background:#fff;">${r.system_prompt || ''}</textarea>
                </div>
                `;
            }

            const div = document.createElement('div');
            div.style.cssText = 'background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px;';
            div.innerHTML = `
                <div style="font-weight:700;color:#0f172a;font-size:13px;margin-bottom:10px;">${featureLabels[feature]}</div>
                <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:10px;margin-bottom:10px;">
                    <div>
                        <label style="font-size:11px;font-weight:600;color:#64748b;display:block;margin-bottom:4px;text-transform:uppercase;">Primary Model</label>
                        <select data-feat="${feature}" data-kind="primary" style="width:100%;border:1px solid #e2e8f0;border-radius:8px;padding:7px 10px;font-size:12px;outline:none;background:#fff;">${opts}</select>
                    </div>
                    <div>
                        <label style="font-size:11px;font-weight:600;color:#64748b;display:block;margin-bottom:4px;text-transform:uppercase;">Fallback Model</label>
                        <select data-feat="${feature}" data-kind="fallback" style="width:100%;border:1px solid #e2e8f0;border-radius:8px;padding:7px 10px;font-size:12px;outline:none;background:#fff;">${opts}</select>
                    </div>
                </div>
                <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(130px, 1fr));gap:10px;">
                    <div>
                        <label style="font-size:11px;font-weight:600;color:#64748b;display:block;margin-bottom:4px;text-transform:uppercase;">Max Tokens</label>
                        <input data-feat="${feature}" data-param="max_tokens" type="number" value="${r.max_tokens || 1024}" style="width:100%;border:1px solid #e2e8f0;border-radius:8px;padding:7px 10px;font-size:12px;outline:none;background:#fff;">
                    </div>
                    <div>
                        <label style="font-size:11px;font-weight:600;color:#64748b;display:block;margin-bottom:4px;text-transform:uppercase;">Temperature</label>
                        <input data-feat="${feature}" data-param="temperature" type="number" step="0.1" min="0" max="2" value="${r.temperature ?? 0.7}" style="width:100%;border:1px solid #e2e8f0;border-radius:8px;padding:7px 10px;font-size:12px;outline:none;background:#fff;">
                    </div>
                </div>
                ${promptHtml}
            `;
            wrap.appendChild(div);
            const pri = div.querySelector('[data-kind="primary"]');
            const fb = div.querySelector('[data-kind="fallback"]');
            if (r.primary_model_id) pri.value = String(r.primary_model_id);
            if (r.fallback_model_id) fb.value = String(r.fallback_model_id);
        }
    }

    document.getElementById('routes-form-wrapper').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('routes-save-btn');
        const msg = document.getElementById('routes-global-msg');
        btn.disabled = true;
        msg.classList.add('hidden');
        
        try {
            const featureLabels = { chat: 'chat', embedding: 'embedding', wrapped: 'wrapped' };
            const promises = Object.keys(featureLabels).map(async (feature) => {
                const pri = document.querySelector(`select[data-feat="${feature}"][data-kind="primary"]`).value;
                const fb = document.querySelector(`select[data-feat="${feature}"][data-kind="fallback"]`).value;
                const maxTok = document.querySelector(`input[data-feat="${feature}"][data-param="max_tokens"]`);
                const temp = document.querySelector(`input[data-feat="${feature}"][data-param="temperature"]`);
                const sysPrompt = document.querySelector(`textarea[data-feat="${feature}"][data-param="system_prompt"]`);
                
                await fetch(`/api/admin/routes/${feature}`, {
                    method: 'PUT',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({
                        primary_model_id: pri ? Number(pri) : null,
                        fallback_model_id: fb ? Number(fb) : null,
                        max_tokens: maxTok ? Number(maxTok.value) || 1024 : 1024,
                        temperature: temp ? Number(temp.value) ?? 0.7 : 0.7,
                        system_prompt: sysPrompt ? sysPrompt.value.trim() : null,
                    }),
                });
            });
            
            await Promise.all(promises);
            msg.classList.remove('hidden');
            setTimeout(() => msg.classList.add('hidden'), 2500);
        } catch (err) {
            alert('Error saving routing: ' + err.message);
        } finally {
            btn.disabled = false;
        }
    });

    async function loadSettings() {
        const s = await (await fetch('/api/admin/settings')).json();
        document.getElementById('s-daily-cap').value  = s.daily_spend_cap_usd         || '5';
        document.getElementById('s-free-msgs').value  = s.free_user_daily_messages    || '3';
        document.getElementById('s-paid-msgs').value  = s.paid_user_daily_messages    || '500';
        document.getElementById('s-trial-hours').value = s.trial_duration_hours       || '24';
    }

    document.getElementById('settings-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button[type=submit]');
        btn.disabled = true;
        try {
            const res = await fetch('/api/admin/settings', {
                method: 'PUT',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    daily_spend_cap_usd:      document.getElementById('s-daily-cap').value,
                    free_user_daily_messages: document.getElementById('s-free-msgs').value,
                    paid_user_daily_messages: document.getElementById('s-paid-msgs').value,
                    trial_duration_hours:     document.getElementById('s-trial-hours').value,
                }),
            });
            if (!res.ok) throw new Error('Save failed');
            const m = document.getElementById('settings-msg');
            m.classList.remove('hidden');
            setTimeout(() => m.classList.add('hidden'), 2500);
            await loadStats();
        } catch (err) {
            alert('Error saving settings: ' + err.message);
        } finally {
            btn.disabled = false;
        }
    });

    let cachedUsers = [];
    async function loadUsers() {
        cachedUsers = await (await fetch('/api/admin/users')).json();
        renderUserList(cachedUsers);

        const searchInput = document.getElementById('admin-user-search');
        if (searchInput && !searchInput._bound) {
            searchInput._bound = true;
            searchInput.addEventListener('input', (e) => {
                const query = e.target.value.toLowerCase().trim();
                if (!query) {
                    renderUserList(cachedUsers);
                    return;
                }
                const filtered = cachedUsers.filter(u => 
                    String(u.id).includes(query) ||
                    (u.email && u.email.toLowerCase().includes(query)) ||
                    (u.display_name && u.display_name.toLowerCase().includes(query)) ||
                    (u.phone && u.phone.toLowerCase().includes(query))
                );
                renderUserList(filtered);
            });
        }
    }

    function renderUserList(rows) {
        const list = document.getElementById('user-list');
        if (!rows.length) {
            list.innerHTML = '<div style="text-align:center;padding:32px;color:#94a3b8;font-size:13px;">No users match your query</div>';
            return;
        }
        
        let html = `
            <div style="font-size:12px;font-weight:600;color:#64748b;margin-bottom:12px;">${rows.length} total users</div>
            <div class="table-responsive">
                <table class="admin-table">
                    <thead>
                        <tr>
                            <th>User</th>
                            <th>Status</th>
                            <th>Contact / Usage</th>
                            <th>Spend</th>
                            <th>Location</th>
                            <th>Activity</th>
                            <th style="text-align:right;">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        
        for (const u of rows) {
            const planBadge = u.is_admin
                ? '<span class="badge badge-admin">ADMIN</span>'
                : u.plan === 'paid'
                    ? '<span class="badge badge-paid">PAID</span>'
                : u.plan === 'trial' && u.trial_expires_at > Date.now()
                    ? '<span class="badge badge-trial">TRIAL</span>'
                : u.plan === 'trial'
                    ? '<span class="badge badge-expired">EXPIRED</span>'
                : '<span class="badge">FREE</span>';

            const loginMethod = u.google_id
                ? '<span class="meta-text" style="color:#2563eb;">Google Auth</span>'
                : '<span class="meta-text">Email Auth</span>';

            const initials = (u.display_name || u.email || '?').charAt(0).toUpperCase();
            const avatarHtml = u.avatar_url
                ? `<img src="${u.avatar_url}" class="user-avatar" referrerpolicy="no-referrer" onerror="this.outerHTML='<div class=\\'user-avatar\\'>${initials}</div>'">`
                : `<div class="user-avatar">${initials}</div>`;

            const onlineDot = u.is_online ? `<span class="status-dot" title="Online"></span>` : '';

            const phoneStr = u.phone
                ? `<a href="tel:${u.phone_country_code || ''}${u.phone}" style="color:#0f172a;text-decoration:none;">${u.phone_country_code ? u.phone_country_code + ' ' : ''}${u.phone}</a>`
                : '<span style="color:#94a3b8;">No phone</span>';

            const ipCountry = u.ip_address
                ? `<span class="sub-text">${u.ip_address}</span><span class="meta-text">${u.country || 'Unknown Region'}</span>`
                : '<span class="sub-text" style="color:#94a3b8;">No IP</span>';

            const lastActive = u.last_active_at
                ? `<span class="meta-text">Active: ${formatDateTime(u.last_active_at)}</span>`
                : '<span class="meta-text">No activity</span>';

            html += `
                <tr class="user-main-row">
                    <td>
                        <div class="user-profile-cell">
                            ${avatarHtml}
                            <div class="user-profile-text">
                                <span class="user-name-text">${u.display_name || u.email.split('@')[0]}${onlineDot}</span>
                                <span class="user-email-text">${u.email}</span>
                            </div>
                        </div>
                    </td>
                    <td>
                        <div style="margin-bottom:4px;">${planBadge}</div>
                        ${loginMethod}
                    </td>
                    <td>
                        <span class="sub-text">${phoneStr}</span>
                        <span class="meta-text">${u.chat_count} chat${u.chat_count !== 1 ? 's' : ''}</span>
                    </td>
                    <td>
                        <span class="sub-text font-mono" style="font-weight:700; color:#0f172a;">$${u.total_cost.toFixed(3)}</span>
                    </td>
                    <td>
                        ${ipCountry}
                    </td>
                    <td>
                        <span class="sub-text" style="color:#0f172a; font-weight: 500;">Joined: ${formatDateTime(u.created_at).split(',')[0]}</span>
                        ${lastActive}
                    </td>
                    <td>
                        <div class="action-cell">
                            ${u.is_admin ? '' : `<button data-uid="${u.id}" data-plan="${u.plan}" data-trial="${u.trial_expires_at || ''}" data-email="${u.email}" class="user-plan-btn btn-subtle">Plan</button>`}
                            <button data-uid="${u.id}" class="user-chats-btn btn-subtle">Chats</button>
                            <button data-uid="${u.id}" class="user-ai-logs-btn btn-subtle">Logs</button>
                            ${u.is_admin ? '' : `<button data-uid="${u.id}" data-email="${u.email}" class="user-del-btn btn-subtle btn-subtle-danger" title="Delete User">Del</button>`}
                        </div>
                    </td>
                </tr>
                <tr id="expand-row-${u.id}" class="hidden">
                    <td colspan="7" style="padding:0; border:none; background:transparent;">
                        <div data-chats-for="${u.id}" class="hidden expand-row-container" style="padding:16px; border-bottom:1px solid #e2e8f0; border-top:1px solid #e2e8f0;"></div>
                        <div data-ai-logs-for="${u.id}" class="hidden expand-row-container" style="padding:16px; border-bottom:1px solid #e2e8f0; border-top:1px solid #e2e8f0;"></div>
                    </td>
                </tr>
            `;
        }
        
        html += `
                    </tbody>
                </table>
            </div>
        `;
        list.innerHTML = html;

        // Manage plan modal
        list.querySelectorAll('.user-plan-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const uid = btn.dataset.uid;
                const email = btn.dataset.email;
                const currentPlan = btn.dataset.plan;
                const trialExp = btn.dataset.trial ? Number(btn.dataset.trial) : null;

                const trialInfo = trialExp
                    ? (trialExp > Date.now()
                        ? `Active — expires ${new Date(trialExp).toLocaleString()}`
                        : `Expired on ${new Date(trialExp).toLocaleString()}`)
                    : 'Not set';

                const modal = document.createElement('div');
                modal.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.5);z-index:999;display:flex;align-items:center;justify-content:center;padding:12px;';
                modal.innerHTML = `
                    <div style="background:white;border-radius:12px;max-width:420px;width:100%;box-shadow:0 12px 30px rgba(0,0,0,0.15);overflow:hidden;">
                        <div style="padding:14px 16px;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;">
                            <div>
                                <h3 style="font-weight:700;font-size:15px;color:#0f172a;margin:0;">Manage Plan</h3>
                                <p style="font-size:12px;color:#64748b;margin:2px 0 0;">${email}</p>
                            </div>
                            <button id="plan-modal-x" style="border:none;background:transparent;font-size:18px;color:#64748b;cursor:pointer;">×</button>
                        </div>
                        <div style="padding:16px;">
                            <div style="margin-bottom:12px;">
                                <label style="display:block;font-size:11px;font-weight:600;text-transform:uppercase;color:#64748b;margin-bottom:4px;">Plan Tier</label>
                                <select id="plan-modal-plan" style="width:100%;border:1px solid #e2e8f0;border-radius:8px;padding:8px 10px;font-size:13px;outline:none;background:#fff;">
                                    <option value="free" ${currentPlan === 'free' ? 'selected' : ''}>Free</option>
                                    <option value="trial" ${currentPlan === 'trial' ? 'selected' : ''}>Trial</option>
                                    <option value="paid" ${currentPlan === 'paid' ? 'selected' : ''}>Paid</option>
                                </select>
                            </div>
                            <div style="margin-bottom:12px;padding:10px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;">
                                <p style="font-size:10px;font-weight:600;color:#64748b;text-transform:uppercase;margin:0;">Trial Status</p>
                                <p style="font-size:12px;color:#0f172a;margin:3px 0 0;font-weight:600;">${trialInfo}</p>
                            </div>
                            <div style="margin-bottom:14px;">
                                <label style="display:block;font-size:11px;font-weight:600;text-transform:uppercase;color:#64748b;margin-bottom:4px;">Extend Trial (hours)</label>
                                <input id="plan-modal-hours" type="number" placeholder="e.g. 72" min="1" style="width:100%;border:1px solid #e2e8f0;border-radius:8px;padding:8px 10px;font-size:13px;outline:none;margin-bottom:6px;">
                                <div style="display:flex;gap:6px;">
                                    <button id="plan-modal-quick-24" class="btn-subtle" style="flex:1;">+24h</button>
                                    <button id="plan-modal-quick-72" class="btn-subtle" style="flex:1;">+72h</button>
                                    <button id="plan-modal-quick-168" class="btn-subtle" style="flex:1;">+7d</button>
                                </div>
                            </div>
                            <div id="plan-modal-msg" style="display:none;font-size:12px;font-weight:600;padding:8px;border-radius:6px;margin-bottom:10px;"></div>
                            <div style="display:flex;gap:6px;justify-content:flex-end;">
                                <button id="plan-modal-cancel" class="btn-subtle">Cancel</button>
                                <button id="plan-modal-save" style="font-size:12px;font-weight:600;color:white;padding:7px 14px;border-radius:8px;cursor:pointer;background:#0f172a;border:none;">Save</button>
                            </div>
                        </div>
                    </div>
                `;
                document.body.appendChild(modal);
                modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
                modal.querySelector('#plan-modal-cancel').addEventListener('click', () => modal.remove());
                modal.querySelector('#plan-modal-x')?.addEventListener('click', () => modal.remove());

                modal.querySelector('#plan-modal-quick-24').addEventListener('click', () => { modal.querySelector('#plan-modal-hours').value = '24'; });
                modal.querySelector('#plan-modal-quick-72').addEventListener('click', () => { modal.querySelector('#plan-modal-hours').value = '72'; });
                modal.querySelector('#plan-modal-quick-168').addEventListener('click', () => { modal.querySelector('#plan-modal-hours').value = '168'; });

                modal.querySelector('#plan-modal-save').addEventListener('click', async () => {
                    const newPlan = modal.querySelector('#plan-modal-plan').value;
                    const hours = modal.querySelector('#plan-modal-hours').value;
                    const msgEl = modal.querySelector('#plan-modal-msg');

                    const body = {};
                    if (newPlan !== currentPlan) body.plan = newPlan;
                    if (hours && Number(hours) > 0) body.trial_extends_hours = Number(hours);
                    if (newPlan === 'trial' && !hours && currentPlan !== 'trial') body.trial_extends_hours = 72;

                    if (Object.keys(body).length === 0) {
                        msgEl.style.display = 'block';
                        msgEl.style.background = '#fff1f2';
                        msgEl.style.color = '#e11d48';
                        msgEl.textContent = 'No changes to save';
                        return;
                    }

                    try {
                        const r = await fetch(`/api/admin/users/${uid}/plan`, {
                            method: 'PATCH',
                            headers: { 'content-type': 'application/json' },
                            body: JSON.stringify(body),
                        });
                        const data = await r.json();
                        if (!r.ok) throw new Error(data.error || 'Failed');
                        msgEl.style.display = 'block';
                        msgEl.style.background = '#f0fdf4';
                        msgEl.style.color = '#16a34a';
                        msgEl.textContent = `Updated to ${data.user.plan}`;
                        setTimeout(async () => { modal.remove(); await loadUsers(); }, 1000);
                    } catch (err) {
                        msgEl.style.display = 'block';
                        msgEl.style.background = '#fff1f2';
                        msgEl.style.color = '#e11d48';
                        msgEl.textContent = err.message;
                    }
                });
            });
        });

        // Expand chats
        list.querySelectorAll('.user-chats-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const uid = btn.dataset.uid;
                const area = list.querySelector(`[data-chats-for="${uid}"]`);
                const expandRow = document.getElementById(`expand-row-${uid}`);
                if (!area.classList.contains('hidden')) {
                    area.classList.add('hidden');
                    if (list.querySelector(`[data-ai-logs-for="${uid}"]`).classList.contains('hidden')) {
                        expandRow.classList.add('hidden');
                    }
                    btn.textContent = 'Chats';
                    return;
                }
                expandRow.classList.remove('hidden');
                area.innerHTML = '<div style="padding:8px;font-size:12px;color:#94a3b8;">Loading chats...</div>';
                area.classList.remove('hidden');
                btn.textContent = 'Hide';
                try {
                    const chats = await (await fetch(`/api/admin/users/${uid}/chats`)).json();
                    if (!chats.length) {
                        area.innerHTML = '<div style="background:#f8fafc;border-radius:8px;padding:10px;text-align:center;font-size:12px;color:#94a3b8;">No chats uploaded yet</div>';
                        return;
                    }
                    area.innerHTML = `
                        <div style="background:#f8fafc;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0;">
                            <div style="display:flex;align-items:center;gap:8px;padding:6px 10px;font-size:10px;font-weight:700;text-transform:uppercase;color:#64748b;border-bottom:1px solid #e2e8f0;background:#f1f5f9;">
                                <div style="flex:1;min-width:0;">Chat Name</div>
                                <div style="width:70px;text-align:center;flex-shrink:0;">Messages</div>
                                <div style="width:130px;flex-shrink:0;">Imported</div>
                                <div style="width:150px;text-align:right;flex-shrink:0;">Actions</div>
                            </div>
                            ${chats.map(c => `
                                <div style="padding:8px 10px;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:12px;" data-admin-chat-row="${c.id}">
                                    <div style="flex:1;min-width:0;">
                                        <div style="font-weight:600;color:#0f172a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                                            <span>${(c.display_name || c.folder_name).replace('WhatsApp Chat - ', '')}</span>
                                            ${c.deleted_by_user ? '<span class="badge badge-expired" style="margin-left:4px;">deleted</span>' : ''}
                                        </div>
                                    </div>
                                    <div style="width:70px;text-align:center;color:#475569;flex-shrink:0;">${c.message_count || 0}</div>
                                    <div style="width:130px;color:#64748b;font-size:11px;flex-shrink:0;">${formatDateTime(c.created_at)}</div>
                                    <div style="width:150px;display:flex;align-items:center;justify-content:flex-end;gap:4px;flex-shrink:0;">
                                        <a href="/api/admin/users/${uid}/chats/${c.id}/download" class="btn-subtle" style="text-decoration:none;font-size:10px;padding:2px 6px;">ZIP</a>
                                        <button data-admin-open-chat="${c.id}" data-uid="${uid}" data-folder="${c.folder_name}" class="btn-subtle" style="font-size:10px;padding:2px 6px;color:#2563eb;">Open</button>
                                        <button data-admin-del-chat="${c.id}" data-uid="${uid}" data-cname="${(c.display_name || c.folder_name).replace('WhatsApp Chat - ', '')}" class="btn-subtle btn-subtle-danger" style="font-size:10px;padding:2px 6px;">Del</button>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    `;

                    area.querySelectorAll('[data-admin-open-chat]').forEach(openBtn => {
                        openBtn.addEventListener('click', () => {
                            const folder = openBtn.dataset.folder;
                            window.location.href = `/api/admin/impersonate/start?uid=${uid}&chat=${encodeURIComponent(folder)}`;
                        });
                    });

                    area.querySelectorAll('[data-admin-del-chat]').forEach(delBtn => {
                        delBtn.addEventListener('click', async () => {
                            const chatId = delBtn.dataset.adminDelChat;
                            const cname = delBtn.dataset.cname;
                            if (!confirm(`Permanently delete "${cname}"?`)) return;
                            delBtn.textContent = '...';
                            delBtn.disabled = true;
                            try {
                                const r = await fetch(`/api/admin/users/${uid}/chats/${chatId}`, { method: 'DELETE' });
                                if (!r.ok) throw new Error((await r.json()).error || 'Failed');
                                area.querySelector(`[data-admin-chat-row="${chatId}"]`)?.remove();
                            } catch (err) {
                                alert('Error: ' + err.message);
                                delBtn.textContent = 'Del';
                                delBtn.disabled = false;
                            }
                        });
                    });
                } catch (err) {
                    area.innerHTML = `<div style="background:#fee2e2;border-radius:8px;padding:10px;text-align:center;font-size:12px;color:#dc2626;">${err.message}</div>`;
                }
            });
        });

        // AI Logs expand
        list.querySelectorAll('.user-ai-logs-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const uid = btn.dataset.uid;
                const area = list.querySelector(`[data-ai-logs-for="${uid}"]`);
                const expandRow = document.getElementById(`expand-row-${uid}`);
                if (!area.classList.contains('hidden')) {
                    area.classList.add('hidden');
                    if (list.querySelector(`[data-chats-for="${uid}"]`).classList.contains('hidden')) {
                        expandRow.classList.add('hidden');
                    }
                    btn.textContent = 'Logs';
                    return;
                }
                expandRow.classList.remove('hidden');
                area.innerHTML = '<div style="padding:8px;font-size:12px;color:#94a3b8;">Loading AI logs...</div>';
                area.classList.remove('hidden');
                btn.textContent = 'Hide';
                try {
                    const convs = await (await fetch(`/api/admin/users/${uid}/conversations`)).json();
                    if (!convs.length) {
                        area.innerHTML = '<div style="background:#f8fafc;border-radius:8px;padding:10px;text-align:center;font-size:12px;color:#94a3b8;">No AI conversations yet</div>';
                        return;
                    }
                    area.innerHTML = `
                        <div style="background:#f8fafc;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0;">
                            <div style="padding:6px 10px;border-bottom:1px solid #e2e8f0;background:#f1f5f9;display:flex;align-items:center;justify-content:space-between;">
                                <span style="font-size:11px;font-weight:700;color:#334155;text-transform:uppercase;">AI Conversations (${convs.length})</span>
                                <button class="ai-logs-close-btn" style="border:none;background:transparent;cursor:pointer;color:#64748b;font-size:14px;">×</button>
                            </div>
                            ${convs.map(c => `
                                <div style="padding:8px 10px;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:12px;">
                                    <div style="flex:1;min-width:0;">
                                        <p style="font-weight:600;color:#0f172a;margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${c.title || 'Untitled'}</p>
                                        <p style="font-size:10px;color:#64748b;margin:1px 0 0;">${c.chat_folder} &middot; ${c.msg_count} msgs &middot; ${formatDateTime(c.updated_at)}</p>
                                    </div>
                                    <div style="display:flex;gap:4px;align-items:center;">
                                        <button data-uid="${uid}" data-convid="${c.id}" class="ai-log-view-btn btn-subtle" style="font-size:10px;padding:2px 6px;">View</button>
                                        <a href="/api/admin/users/${uid}/conversations/${c.id}/download" class="btn-subtle" style="font-size:10px;padding:2px 6px;text-decoration:none;">TXT</a>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    `;

                    area.querySelector('.ai-logs-close-btn')?.addEventListener('click', () => {
                        area.classList.add('hidden');
                        area.innerHTML = '';
                        btn.textContent = 'Logs';
                        const expandRow = document.getElementById(`expand-row-${uid}`);
                        if (list.querySelector(`[data-chats-for="${uid}"]`).classList.contains('hidden')) {
                            expandRow.classList.add('hidden');
                        }
                    });

                    area.querySelectorAll('.ai-log-view-btn').forEach(vBtn => {
                        vBtn.addEventListener('click', async () => {
                            const convId = vBtn.dataset.convid;
                            const convUid = vBtn.dataset.uid;
                            try {
                                const data = await (await fetch(`/api/admin/users/${convUid}/conversations/${convId}`)).json();
                                const modal = document.createElement('div');
                                modal.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.5);z-index:999;display:flex;align-items:center;justify-content:center;padding:12px;';
                                modal.innerHTML = `
                                    <div style="background:white;border-radius:12px;max-width:540px;width:100%;max-height:80vh;display:flex;flex-direction:column;box-shadow:0 12px 30px rgba(0,0,0,0.15);overflow:hidden;">
                                        <div style="padding:12px 16px;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;">
                                            <div>
                                                <h4 style="font-weight:700;font-size:13px;color:#0f172a;margin:0;">${data.title || 'AI Conversation'}</h4>
                                                <p style="font-size:10px;color:#64748b;margin:1px 0 0;">${data.chat_folder} &middot; ${data.messages?.length || 0} messages</p>
                                            </div>
                                            <button class="ai-log-popup-close" style="border:none;background:transparent;color:#64748b;font-size:18px;cursor:pointer;">×</button>
                                        </div>
                                        <div style="padding:14px;overflow-y:auto;flex:1;">
                                            ${(data.messages || []).map(m => `
                                                <div style="margin-bottom:8px;display:flex;justify-content:${m.role === 'user' ? 'flex-end' : 'flex-start'};">
                                                    <div style="max-width:85%;padding:8px 12px;border-radius:10px;font-size:12px;line-height:1.4;${m.role === 'user'
                                                        ? 'background:#0f172a;color:white;'
                                                        : 'background:#f1f5f9;color:#0f172a;'}">
                                                        ${m.content.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}
                                                        <div style="font-size:9px;color:${m.role === 'user' ? 'rgba(255,255,255,0.6)' : '#64748b'};margin-top:2px;text-align:right;">${new Date(m.created_at).toLocaleString()}</div>
                                                    </div>
                                                </div>
                                            `).join('')}
                                        </div>
                                    </div>
                                `;
                                modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
                                modal.querySelector('.ai-log-popup-close').addEventListener('click', () => modal.remove());
                                document.body.appendChild(modal);
                            } catch (err) {
                                alert('Error loading conversation: ' + err.message);
                            }
                        });
                    });
                } catch (err) {
                    area.innerHTML = `<div style="background:#fee2e2;border-radius:8px;padding:10px;text-align:center;font-size:12px;color:#dc2626;">${err.message}</div>`;
                }
            });
        });

        // Delete user
        list.querySelectorAll('.user-del-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const uid = btn.dataset.uid;
                const email = btn.dataset.email;
                if (!confirm(`DELETE user "${email}"?\n\nThis permanently removes account, files, and AI conversations.`)) return;
                btn.textContent = '...';
                btn.disabled = true;
                try {
                    const r = await fetch(`/api/admin/users/${uid}`, { method: 'DELETE' });
                    const data = await r.json();
                    if (!r.ok) throw new Error(data.error || 'Failed');
                    await loadUsers();
                    await loadStats();
                } catch (err) {
                    alert('Error: ' + err.message);
                    btn.textContent = 'Delete';
                    btn.disabled = false;
                }
            });
        });
    }

    // ---------- Integrations ----------
    async function loadIntegrations() {
        const data = await (await fetch('/api/admin/integrations')).json();
        const root = document.getElementById('integrations-root');
        if (!root) return;
        root.innerHTML = '';

        // Email card
        root.appendChild(integCard({
            title: 'Email (SMTP)',
            subtitle: 'For verification + password reset emails',
            section: 'email',
            status: data.status.email,
            data: data.email,
            fields: [
                { k: 'smtp_host', label: 'SMTP host', placeholder: 'smtp.resend.com', type: 'text' },
                { k: 'smtp_port', label: 'Port', placeholder: '587', type: 'text', half: true },
                { k: 'smtp_secure', label: 'Secure (TLS)', placeholder: 'false', type: 'text', half: true },
                { k: 'smtp_user', label: 'Username', placeholder: 'resend', type: 'text' },
                { k: 'smtp_pass', label: 'Password / API key', placeholder: 're_xxx', type: 'password', secret: true },
                { k: 'email_from', label: 'From address', placeholder: 'Kotha <noreply@yourdomain.com>', type: 'text' },
            ],
            extraButtons: `<button data-action="test-email" class="btn-subtle">Send test email</button>`,
        }));

        // Dodo card — global payments
        root.appendChild(integCard({
            title: 'Dodo Payments',
            subtitle: 'Merchant of Record — global cards, USD, tax handled automatically',
            section: 'dodo',
            status: data.status.dodo,
            data: data.dodo || {},
            fields: [
                { k: 'api_key',       label: 'API Key',       placeholder: 'test_...', type: 'password', secret: true },
                { k: 'product_id',    label: 'Product ID',    placeholder: 'pdt_...', type: 'text' },
                { k: 'webhook_secret',label: 'Webhook Secret',placeholder: 'whsec_...', type: 'password', secret: true },
            ],
        }));

        // Google OAuth card
        root.appendChild(integCard({
            title: 'Google Sign-in',
            subtitle: 'Lets users sign in with their Google account',
            section: 'oauth',
            status: data.status.google,
            data: data.oauth,
            fields: [
                { k: 'google_client_id', label: 'Client ID', placeholder: 'xxx.apps.googleusercontent.com', type: 'text' },
                { k: 'google_client_secret', label: 'Client secret', placeholder: 'GOCSPX-xxx', type: 'password', secret: true },
            ],
        }));
    }

    function integCard({ title, subtitle, section, status, data, fields, extraButtons = '' }) {
        const card = document.createElement('div');
        card.className = 'admin-card';
        const statusBadge = status
            ? '<span class="badge badge-paid">Active</span>'
            : '<span class="badge">Off</span>';

        const fieldHtml = fields.map(f => {
            const meta = data[f.k] || { set: false };
            const placeholder = meta.set && f.secret
                ? `${meta.masked} (set — leave blank to keep)`
                : (meta.set && meta.value ? meta.value : f.placeholder);
            return `
                <div style="grid-column:${f.half ? 'span 1' : '1 / -1'};">
                    <label style="font-size:11px;font-weight:600;color:#64748b;display:block;margin-bottom:4px;text-transform:uppercase;">${f.label}</label>
                    <input data-section="${section}" data-field="${f.k}" type="${f.type}"
                        placeholder="${placeholder.replace(/"/g, '&quot;')}"
                        style="width:100%;border:1px solid #e2e8f0;border-radius:8px;padding:8px 10px;font-size:12px;outline:none;"
                        autocomplete="off">
                </div>
            `;
        }).join('');

        card.innerHTML = `
            <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px;">
                <div>
                    <h3 style="font-weight:700;color:#0f172a;font-size:14px;margin:0;display:flex;align-items:center;gap:6px;">${title} ${statusBadge}</h3>
                    <p style="font-size:12px;color:#64748b;margin:2px 0 0;">${subtitle}</p>
                </div>
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:10px;">${fieldHtml}</div>
            <div style="display:flex;align-items:center;gap:6px;margin-top:14px;padding-top:12px;border-top:1px solid #f1f5f9;flex-wrap:wrap;">
                <button data-action="save" data-section="${section}" style="background:#0f172a;color:#fff;font-weight:600;font-size:12px;border:none;border-radius:8px;padding:7px 14px;cursor:pointer;">Save</button>
                <button data-action="clear" data-section="${section}" class="btn-subtle btn-subtle-danger">Clear</button>
                ${extraButtons}
                <span data-msg-section="${section}" style="font-size:12px;font-weight:600;margin-left:6px;"></span>
            </div>
        `;

        card.querySelector('[data-action="save"]').addEventListener('click', () => saveIntegration(card, section));
        card.querySelector('[data-action="clear"]').addEventListener('click', () => clearIntegration(card, section, fields));
        const testBtn = card.querySelector('[data-action="test-email"]');
        if (testBtn) testBtn.addEventListener('click', () => testEmail(card));
        return card;
    }

    function setIntegMsg(card, section, msg, kind = 'ok') {
        const el = card.querySelector(`[data-msg-section="${section}"]`);
        if (!el) return;
        el.textContent = msg;
        el.style.color = kind === 'error' ? '#dc2626' : '#16a34a';
        setTimeout(() => { el.textContent = ''; }, 3500);
    }

    async function saveIntegration(card, section) {
        const inputs = card.querySelectorAll(`input[data-section="${section}"]`);
        const updates = {};
        for (const inp of inputs) {
            if (inp.value.trim() !== '') updates[inp.dataset.field] = inp.value.trim();
        }
        if (Object.keys(updates).length === 0) {
            setIntegMsg(card, section, 'Nothing to save', 'error');
            return;
        }
        try {
            const r = await fetch('/api/admin/integrations', {
                method: 'PUT',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ [section]: updates }),
            });
            if (!r.ok) throw new Error('Save failed');
            inputs.forEach(i => i.value = '');
            setIntegMsg(card, section, 'Saved', 'ok');
            await loadIntegrations();
        } catch (err) {
            setIntegMsg(card, section, err.message, 'error');
        }
    }

    async function clearIntegration(card, section, fields) {
        if (!confirm(`Clear all ${section} settings?`)) return;
        const payload = { [section]: {} };
        for (const f of fields) payload[section][f.k] = '';
        await fetch('/api/admin/integrations', {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload),
        });
        setIntegMsg(card, section, 'Cleared', 'ok');
        await loadIntegrations();
    }

    async function testEmail(card) {
        setIntegMsg(card, 'email', 'Sending...', 'ok');
        const to = prompt('Send test email to:', me.user.email);
        if (!to) { setIntegMsg(card, 'email', '', 'ok'); return; }
        const r = await (await fetch('/api/admin/integrations/test-email', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ to }),
        })).json();
        setIntegMsg(card, 'email', r.ok ? 'Sent' : (r.error || 'Failed'), r.ok ? 'ok' : 'error');
    }

    await loadKnown();
    await loadStats();
    await loadProviders();
    await loadModels();
    await loadRoutes();
    await loadIntegrations();
    await loadSettings();
    await loadUsers();
})();

