(async function () {
    // Gate
    const meResp = await fetch('/api/auth/me');
    const me = await meResp.json();
    if (!me.user) {
        window.location.href = '/login.html';
        return;
    }
    if (!me.user.is_admin) {
        document.getElementById('auth-gate').innerHTML =
            '<div class="text-center"><p class="text-red-600 font-bold">Not authorized.</p><a href="/" class="text-indigo-600 underline">Go to app</a></div>';
        return;
    }
    document.getElementById('auth-gate').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    document.getElementById('admin-email-info').textContent = me.user.email;

    // Logout
    document.getElementById('logout-btn').addEventListener('click', async () => {
        await fetch('/api/auth/logout', { method: 'POST' });
        window.location.href = '/login.html';
    });

    // Tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            document.querySelectorAll('.tab-btn').forEach(b => {
                b.classList.remove('tab-active');
                b.classList.add('text-gray-600');
            });
            btn.classList.add('tab-active');
            btn.classList.remove('text-gray-600');
            document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
            document.getElementById(`tab-${tab}`).classList.remove('hidden');
        });
    });

    let knownProviders = {};

    async function loadStats() {
        const r = await (await fetch('/api/admin/usage/summary')).json();
        document.getElementById('stat-today-cost').textContent = (r.todayCost || 0).toFixed(3);
        document.getElementById('stat-total-cost').textContent = (r.totalCost || 0).toFixed(3);
        document.getElementById('stat-total-calls').textContent = r.totalCalls || 0;
        document.getElementById('stat-cap').textContent = (r.dailyCap || 0).toFixed(2);
        const users = await (await fetch('/api/admin/users')).json();
        document.getElementById('stat-users').textContent = users.length;
    }

    async function loadKnown() {
        knownProviders = await (await fetch('/api/admin/known-providers')).json();
        const sel = document.getElementById('prov-name');
        sel.innerHTML = '<option value="">Select provider...</option>';
        for (const [key, info] of Object.entries(knownProviders)) {
            const opt = document.createElement('option');
            opt.value = key;
            opt.textContent = info.label;
            sel.appendChild(opt);
        }
    }

    async function loadProviders() {
        const rows = await (await fetch('/api/admin/providers')).json();
        const list = document.getElementById('provider-list');
        if (!rows.length) {
            list.innerHTML = '<div class="bg-white rounded-2xl border border-gray-100 p-6 text-center text-gray-500 text-sm">No providers added yet. Add one above to start.</div>';
            return;
        }
        list.innerHTML = '';
        for (const p of rows) {
            const tested = p.last_tested_at
                ? `<span class="text-[10px] ${p.last_test_ok ? 'text-green-600' : 'text-red-600'}">${p.last_test_ok ? '✓ working' : '✗ ' + (p.last_test_error || 'failed').slice(0, 60)}</span>`
                : '<span class="text-[10px] text-gray-400">not tested</span>';
            const card = document.createElement('div');
            card.className = 'bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center justify-between gap-3';
            card.innerHTML = `
                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2">
                        <span class="font-extrabold text-gray-800">${p.label || p.name}</span>
                        <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${p.enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}">${p.enabled ? 'ON' : 'OFF'}</span>
                    </div>
                    <div class="text-xs text-gray-500 mt-0.5 font-mono">${p.key_masked}</div>
                    <div class="text-[10px] text-gray-400 mt-1">${p.base_url || ''} · ${tested}</div>
                </div>
                <div class="flex gap-2 shrink-0">
                    <button data-act="test" data-id="${p.id}" class="text-xs font-bold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg px-3 py-1.5">Test</button>
                    <button data-act="toggle" data-id="${p.id}" data-enabled="${p.enabled}" class="text-xs font-bold bg-gray-50 text-gray-700 hover:bg-gray-100 rounded-lg px-3 py-1.5">${p.enabled ? 'Disable' : 'Enable'}</button>
                    <button data-act="delete" data-id="${p.id}" class="text-xs font-bold bg-red-50 text-red-600 hover:bg-red-100 rounded-lg px-3 py-1.5">Delete</button>
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

        // Populate the provider dropdown in "Add Custom Model" form
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
            list.innerHTML = '<p class="text-gray-500 text-sm">No models yet. Add a provider first — common models auto-seed.</p>';
            return;
        }
        let lastProv = null;
        list.innerHTML = '';
        for (const m of rows) {
            if (m.provider_label !== lastProv) {
                const h = document.createElement('div');
                h.className = 'text-xs font-bold uppercase text-gray-500 tracking-wider mt-4 first:mt-0 flex items-center gap-2';
                h.innerHTML = `<span class="w-2 h-2 rounded-full bg-indigo-400"></span>${m.provider_label}`;
                list.appendChild(h);
                lastProv = m.provider_label;
            }
            const row = document.createElement('div');
            row.className = 'flex items-center justify-between p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition';
            row.innerHTML = `
                <div class="flex-1 min-w-0">
                    <div class="font-bold text-gray-800">${m.display_name || m.model_id}</div>
                    <div class="text-[10px] text-gray-500 font-mono truncate">${m.model_id}</div>
                    <div class="text-[10px] text-gray-400 mt-0.5">in <span class="font-bold text-teal-600">$${m.input_price_per_1m}</span>/M tok · out <span class="font-bold text-purple-600">$${m.output_price_per_1m}</span>/M tok</div>
                </div>
                <div class="flex gap-2 items-center shrink-0 ml-3">
                    <button data-mid="${m.id}" data-enabled="${m.enabled}" class="model-toggle text-xs font-bold rounded-lg px-3 py-1.5 ${m.enabled ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'}">${m.enabled ? 'ON' : 'OFF'}</button>
                    <button data-mid="${m.id}" class="model-delete text-xs font-bold bg-red-50 text-red-500 hover:bg-red-100 rounded-lg px-2 py-1.5">✕</button>
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

    // Add Custom Model form handler
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

    async function loadRoutes() {
        const [routes, models] = await Promise.all([
            (await fetch('/api/admin/routes')).json(),
            (await fetch('/api/admin/models')).json(),
        ]);
        const enabledModels = models.filter(m => m.enabled);
        const featureLabels = {
            chat: 'AI Chat (talk to history)',
            embedding: 'Embeddings (semantic search)',
            wrapped: 'Year in Wrapped (one-shot summary)',
        };
        const wrap = document.getElementById('routes-form');
        wrap.innerHTML = '';
        for (const feature of Object.keys(featureLabels)) {
            const r = routes[feature];
            const opts = ['<option value="">— none —</option>']
                .concat(enabledModels.map(m => `<option value="${m.id}">${m.provider_label} · ${m.display_name || m.model_id}</option>`))
                .join('');
            const div = document.createElement('div');
            div.className = 'bg-gray-50 rounded-xl p-4';
            div.innerHTML = `
                <div class="font-bold text-gray-800 mb-3">${featureLabels[feature]}</div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                    <div>
                        <label class="text-[10px] uppercase font-bold text-gray-500">Primary model</label>
                        <select data-feat="${feature}" data-kind="primary" class="route-sel w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-indigo-400">${opts}</select>
                    </div>
                    <div>
                        <label class="text-[10px] uppercase font-bold text-gray-500">Fallback model</label>
                        <select data-feat="${feature}" data-kind="fallback" class="route-sel w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-indigo-400">${opts}</select>
                    </div>
                </div>
                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <label class="text-[10px] uppercase font-bold text-gray-500">Max tokens</label>
                        <input data-feat="${feature}" data-param="max_tokens" type="number" value="${r.max_tokens || 1024}" class="route-param w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-indigo-400">
                    </div>
                    <div>
                        <label class="text-[10px] uppercase font-bold text-gray-500">Temperature</label>
                        <input data-feat="${feature}" data-param="temperature" type="number" step="0.1" min="0" max="2" value="${r.temperature ?? 0.7}" class="route-param w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-indigo-400">
                    </div>
                </div>
            `;
            wrap.appendChild(div);
            const pri = div.querySelector('[data-kind="primary"]');
            const fb = div.querySelector('[data-kind="fallback"]');
            if (r.primary_model_id) pri.value = String(r.primary_model_id);
            if (r.fallback_model_id) fb.value = String(r.fallback_model_id);
            [pri, fb].forEach(sel => sel.addEventListener('change', () => saveRoute(feature)));
            div.querySelectorAll('.route-param').forEach(inp => {
                inp.addEventListener('change', () => saveRoute(feature));
            });
        }
    }

    async function saveRoute(feature) {
        const pri = document.querySelector(`select[data-feat="${feature}"][data-kind="primary"]`).value;
        const fb = document.querySelector(`select[data-feat="${feature}"][data-kind="fallback"]`).value;
        const maxTok = document.querySelector(`input[data-feat="${feature}"][data-param="max_tokens"]`);
        const temp = document.querySelector(`input[data-feat="${feature}"][data-param="temperature"]`);
        await fetch(`/api/admin/routes/${feature}`, {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                primary_model_id: pri ? Number(pri) : null,
                fallback_model_id: fb ? Number(fb) : null,
                max_tokens: maxTok ? Number(maxTok.value) || 1024 : 1024,
                temperature: temp ? Number(temp.value) ?? 0.7 : 0.7,
            }),
        });
    }

    async function loadSettings() {
        const s = await (await fetch('/api/admin/settings')).json();
        document.getElementById('s-daily-cap').value = s.daily_spend_cap_usd || '5';
        document.getElementById('s-trial-hours').value = s.trial_duration_hours || '24';
        document.getElementById('s-paid-msgs').value = s.paid_user_daily_messages || '500';
    }

    document.getElementById('settings-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        await fetch('/api/admin/settings', {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                daily_spend_cap_usd: document.getElementById('s-daily-cap').value,
                trial_duration_hours: document.getElementById('s-trial-hours').value,
                paid_user_daily_messages: document.getElementById('s-paid-msgs').value,
            }),
        });
        const m = document.getElementById('settings-msg');
        m.classList.remove('hidden');
        setTimeout(() => m.classList.add('hidden'), 2000);
        await loadStats();
    });

    async function loadUsers() {
        const rows = await (await fetch('/api/admin/users')).json();
        const list = document.getElementById('user-list');
        if (!rows.length) {
            list.innerHTML = '<p class="text-gray-500">No users yet.</p>';
            return;
        }
        list.innerHTML = '';
        for (const u of rows) {
            const planBadge = u.is_admin
                ? '<span class="bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full text-[10px] font-bold">admin</span>'
                : u.plan === 'paid' ? '<span class="bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-[10px] font-bold">paid</span>'
                : u.plan === 'trial' && u.trial_expires_at > Date.now() ? '<span class="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full text-[10px] font-bold">trial</span>'
                : '<span class="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-[10px] font-bold">free</span>';

            const card = document.createElement('div');
            card.className = 'bg-gray-50 rounded-xl p-4 mb-3 border border-gray-100';
            card.innerHTML = `
                <div class="flex items-center justify-between gap-2 flex-wrap">
                    <div class="min-w-0 flex-1">
                        <div class="flex items-center gap-2 flex-wrap">
                            <span class="font-bold text-gray-800 text-sm truncate">${u.email}</span>
                            ${planBadge}
                        </div>
                        <div class="flex gap-4 mt-1 text-[11px] text-gray-500">
                            <span>${u.chat_count} chats</span>
                            <span>$${u.total_cost.toFixed(3)} spent</span>
                            <span>Joined ${new Date(u.created_at).toLocaleDateString()}</span>
                        </div>
                    </div>
                    <div class="flex gap-2 shrink-0">
                        <button data-uid="${u.id}" class="user-chats-btn text-xs font-bold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg px-3 py-1.5 transition">📦 Chats</button>
                        ${u.is_admin ? '' : `<button data-uid="${u.id}" data-email="${u.email}" class="user-del-btn text-xs font-bold bg-red-50 text-red-600 hover:bg-red-100 rounded-lg px-3 py-1.5 transition">Delete</button>`}
                    </div>
                </div>
                <div data-chats-for="${u.id}" class="hidden mt-3 pl-2 border-l-2 border-indigo-200 space-y-2"></div>
            `;
            list.appendChild(card);
        }

        // Expand chats
        list.querySelectorAll('.user-chats-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const uid = btn.dataset.uid;
                const area = list.querySelector(`[data-chats-for="${uid}"]`);
                if (!area.classList.contains('hidden')) {
                    area.classList.add('hidden');
                    return;
                }
                area.innerHTML = '<p class="text-xs text-gray-400">Loading...</p>';
                area.classList.remove('hidden');
                try {
                    const chats = await (await fetch(`/api/admin/users/${uid}/chats`)).json();
                    if (!chats.length) {
                        area.innerHTML = '<p class="text-xs text-gray-400">No chats uploaded.</p>';
                        return;
                    }
                    area.innerHTML = chats.map(c => `
                        <div class="flex items-center justify-between bg-white rounded-lg px-3 py-2 shadow-sm text-sm">
                            <div class="min-w-0 flex-1">
                                <span class="font-bold text-gray-700">${c.display_name || c.folder_name}</span>
                                <span class="text-[10px] text-gray-400 ml-2">${c.message_count || 0} msgs</span>
                            </div>
                            <a href="/api/admin/users/${uid}/chats/${c.id}/download" class="text-xs font-bold bg-teal-50 text-teal-700 hover:bg-teal-100 rounded-lg px-3 py-1.5 transition no-underline">⬇ Download</a>
                        </div>
                    `).join('');
                } catch (err) {
                    area.innerHTML = `<p class="text-xs text-red-500">${err.message}</p>`;
                }
            });
        });

        // Delete user
        list.querySelectorAll('.user-del-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const uid = btn.dataset.uid;
                const email = btn.dataset.email;
                if (!confirm(`DELETE user "${email}"?\n\nThis will permanently remove:\n- Account\n- All uploaded chats & files\n- All AI conversations\n\nThis cannot be undone!`)) return;
                btn.textContent = 'Deleting...';
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
            extraButtons: `<button data-action="test-email" class="text-xs font-bold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg px-3 py-1.5">Send test email</button>`,
        }));

        // Stripe card
        root.appendChild(integCard({
            title: 'Stripe (billing)',
            subtitle: 'For Pro + Lifetime upgrades',
            section: 'stripe',
            status: data.status.stripe,
            data: data.stripe,
            fields: [
                { k: 'secret_key', label: 'Secret key', placeholder: 'sk_live_xxx', type: 'password', secret: true },
                { k: 'webhook_secret', label: 'Webhook secret', placeholder: 'whsec_xxx', type: 'password', secret: true },
                { k: 'pro_price_id', label: 'Pro price ID ($5/mo)', placeholder: 'price_xxx', type: 'text' },
                { k: 'lifetime_price_id', label: 'Lifetime price ID ($49)', placeholder: 'price_xxx', type: 'text' },
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
        card.className = 'bg-white rounded-2xl border border-gray-100 shadow-sm p-5';
        const statusBadge = status
            ? '<span class="text-[10px] font-bold uppercase tracking-wider bg-green-100 text-green-700 px-2.5 py-1 rounded-full">Active</span>'
            : '<span class="text-[10px] font-bold uppercase tracking-wider bg-gray-100 text-gray-500 px-2.5 py-1 rounded-full">Off</span>';

        const fieldHtml = fields.map(f => {
            const meta = data[f.k] || { set: false };
            const placeholder = meta.set && f.secret
                ? `${meta.masked} (set — leave blank to keep)`
                : (meta.set && meta.value ? meta.value : f.placeholder);
            const sourceTag = meta.source === 'env'
                ? '<span class="text-[9px] font-bold text-amber-600 ml-1">from .env</span>'
                : meta.source === 'db'
                ? '<span class="text-[9px] font-bold text-green-600 ml-1">saved</span>'
                : '';
            return `
                <div class="${f.half ? 'col-span-1' : 'col-span-2'}">
                    <label class="text-[10px] font-bold uppercase tracking-widest text-gray-500">${f.label}${sourceTag}</label>
                    <input data-section="${section}" data-field="${f.k}" type="${f.type}"
                        placeholder="${placeholder.replace(/"/g, '&quot;')}"
                        class="w-full mt-1 border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400"
                        autocomplete="off">
                </div>
            `;
        }).join('');

        card.innerHTML = `
            <div class="flex items-start justify-between gap-3 mb-4">
                <div>
                    <h3 class="font-extrabold text-gray-900 text-base">${title} ${statusBadge}</h3>
                    <p class="text-xs text-gray-500 mt-0.5">${subtitle}</p>
                </div>
            </div>
            <div class="grid grid-cols-2 gap-3">${fieldHtml}</div>
            <div class="flex items-center gap-2 mt-5">
                <button data-action="save" data-section="${section}" class="bg-gray-900 hover:bg-black text-white font-bold text-sm rounded-xl px-5 py-2 transition">Save</button>
                <button data-action="clear" data-section="${section}" class="text-xs font-bold bg-red-50 text-red-600 hover:bg-red-100 rounded-lg px-3 py-1.5">Clear</button>
                ${extraButtons}
                <span data-msg-section="${section}" class="text-xs font-semibold ml-2"></span>
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
            setIntegMsg(card, section, 'Saved ✓', 'ok');
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
        setIntegMsg(card, 'email', r.ok ? 'Sent ✓' : (r.error || 'Failed'), r.ok ? 'ok' : 'error');
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
