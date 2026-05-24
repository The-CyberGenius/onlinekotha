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
        try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }); } catch {}
        document.cookie = 'session=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/;';
        window.location.replace('/login.html');
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
            list.innerHTML = '<div class="text-center py-8 text-gray-400"><p class="text-4xl mb-2">👥</p><p class="font-bold">No users yet</p></div>';
            return;
        }
        list.innerHTML = `<p class="text-xs text-gray-500 mb-3">${rows.length} total users</p>`;
        for (const u of rows) {
            const planBadge = u.is_admin
                ? '<span class="bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full text-[10px] font-bold">admin</span>'
                : u.plan === 'paid' ? '<span class="bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-[10px] font-bold">paid</span>'
                : u.plan === 'trial' && u.trial_expires_at > Date.now() ? '<span class="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full text-[10px] font-bold">trial</span>'
                : '<span class="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-[10px] font-bold">expired</span>';

            const loginMethod = u.google_id
                ? '<span class="text-[9px] font-bold bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">Google</span>'
                : '<span class="text-[9px] font-bold bg-gray-50 text-gray-500 px-1.5 py-0.5 rounded">Email</span>';

            const initials = (u.display_name || u.email || '?').charAt(0).toUpperCase();
            const avatarHtml = u.avatar_url
                ? `<img src="${u.avatar_url}" class="w-10 h-10 rounded-xl object-cover shadow-sm" referrerpolicy="no-referrer" onerror="this.outerHTML='<div class=\\'w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white font-bold text-sm shadow-sm\\'>${initials}</div>'">`
                : `<div class="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white font-bold text-sm shadow-sm">${initials}</div>`;

            const card = document.createElement('div');
            card.className = 'bg-white rounded-2xl p-4 mb-3 border border-gray-100 shadow-sm hover:shadow-md transition';
            card.innerHTML = `
                <div class="flex items-center gap-3">
                    <div class="shrink-0">${avatarHtml}</div>
                    <div class="min-w-0 flex-1">
                        <div class="flex items-center gap-1.5 flex-wrap">
                            <span class="font-bold text-gray-900 text-sm truncate">${u.display_name || u.email.split('@')[0]}</span>
                            ${planBadge} ${loginMethod}
                        </div>
                        <p class="text-[11px] text-gray-500 truncate mt-0.5">${u.email}</p>
                        <div class="flex gap-3 mt-1.5 text-[10px] text-gray-400 font-medium">
                            <span class="flex items-center gap-1"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> ${u.chat_count} chats</span>
                            <span class="flex items-center gap-1"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg> $${u.total_cost.toFixed(3)}</span>
                            <span>${new Date(u.created_at).toLocaleDateString()}</span>
                        </div>
                    </div>
                    <div class="flex flex-col gap-1.5 shrink-0">
                        ${u.is_admin ? '' : `<button data-uid="${u.id}" data-plan="${u.plan}" data-trial="${u.trial_expires_at || ''}" data-email="${u.email}" class="user-plan-btn text-[11px] font-bold bg-amber-50 text-amber-700 hover:bg-amber-100 rounded-lg px-3 py-1.5 transition flex items-center gap-1">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20V10M18 20V4M6 20v-4"/></svg>
                            Manage
                        </button>`}
                        <button data-uid="${u.id}" class="user-chats-btn text-[11px] font-bold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg px-3 py-1.5 transition flex items-center gap-1">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                            Chats
                        </button>
                        <button data-uid="${u.id}" class="user-ai-logs-btn text-[11px] font-bold bg-purple-50 text-purple-700 hover:bg-purple-100 rounded-lg px-3 py-1.5 transition flex items-center gap-1">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1"/></svg>
                            AI Logs
                        </button>
                        ${u.is_admin ? '' : `<button data-uid="${u.id}" data-email="${u.email}" class="user-del-btn text-[11px] font-bold bg-red-50 text-red-600 hover:bg-red-100 rounded-lg px-3 py-1.5 transition">Delete</button>`}
                    </div>
                </div>
                <div data-chats-for="${u.id}" class="hidden mt-3 space-y-1.5"></div>
                <div data-ai-logs-for="${u.id}" class="hidden mt-3 space-y-1.5"></div>
            `;
            list.appendChild(card);
        }

        // Manage plan
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
                modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);z-index:200;display:flex;align-items:center;justify-content:center;padding:16px;';
                modal.innerHTML = `
                    <div style="background:white;border-radius:20px;max-width:420px;width:100%;box-shadow:0 24px 48px rgba(0,0,0,0.2);overflow:hidden;">
                        <div style="padding:20px 24px;border-bottom:1px solid #f1f5f9;">
                            <h3 style="font-weight:800;font-size:16px;color:#1e293b;">Manage Plan</h3>
                            <p style="font-size:12px;color:#64748b;margin-top:4px;">${email}</p>
                        </div>
                        <div style="padding:20px 24px;">
                            <div style="margin-bottom:16px;">
                                <label style="display:block;font-size:11px;font-weight:700;text-transform:uppercase;color:#64748b;letter-spacing:0.5px;margin-bottom:6px;">Plan</label>
                                <select id="plan-modal-plan" style="width:100%;border:1px solid #e2e8f0;border-radius:12px;padding:10px 14px;font-size:14px;outline:none;">
                                    <option value="free" ${currentPlan === 'free' ? 'selected' : ''}>Free (3 msgs/day)</option>
                                    <option value="trial" ${currentPlan === 'trial' ? 'selected' : ''}>Trial (unlimited)</option>
                                    <option value="paid" ${currentPlan === 'paid' ? 'selected' : ''}>Paid (unlimited)</option>
                                </select>
                            </div>
                            <div style="margin-bottom:16px;padding:12px;background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0;">
                                <p style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Current Trial Status</p>
                                <p style="font-size:13px;color:#1e293b;margin-top:4px;font-weight:600;">${trialInfo}</p>
                            </div>
                            <div style="margin-bottom:16px;">
                                <label style="display:block;font-size:11px;font-weight:700;text-transform:uppercase;color:#64748b;letter-spacing:0.5px;margin-bottom:6px;">Extend Trial (hours from now)</label>
                                <div style="display:flex;gap:8px;">
                                    <input id="plan-modal-hours" type="number" placeholder="e.g. 72" min="1" style="flex:1;border:1px solid #e2e8f0;border-radius:12px;padding:10px 14px;font-size:14px;outline:none;">
                                    <button id="plan-modal-quick-24" style="background:#eef2ff;color:#4f46e5;font-weight:700;font-size:11px;border-radius:10px;padding:8px 12px;cursor:pointer;">+24h</button>
                                    <button id="plan-modal-quick-72" style="background:#eef2ff;color:#4f46e5;font-weight:700;font-size:11px;border-radius:10px;padding:8px 12px;cursor:pointer;">+72h</button>
                                    <button id="plan-modal-quick-168" style="background:#eef2ff;color:#4f46e5;font-weight:700;font-size:11px;border-radius:10px;padding:8px 12px;cursor:pointer;">+7d</button>
                                </div>
                            </div>
                            <div id="plan-modal-msg" style="display:none;font-size:12px;font-weight:600;padding:8px 12px;border-radius:10px;margin-bottom:12px;"></div>
                            <div style="display:flex;gap:10px;justify-content:flex-end;">
                                <button id="plan-modal-cancel" style="font-size:13px;font-weight:700;color:#64748b;padding:10px 18px;border-radius:12px;cursor:pointer;background:#f1f5f9;">Cancel</button>
                                <button id="plan-modal-save" style="font-size:13px;font-weight:700;color:white;padding:10px 18px;border-radius:12px;cursor:pointer;background:#1e293b;">Save Changes</button>
                            </div>
                        </div>
                    </div>
                `;
                document.body.appendChild(modal);
                modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
                modal.querySelector('#plan-modal-cancel').addEventListener('click', () => modal.remove());

                // Quick extend buttons
                modal.querySelector('#plan-modal-quick-24').addEventListener('click', () => { modal.querySelector('#plan-modal-hours').value = '24'; });
                modal.querySelector('#plan-modal-quick-72').addEventListener('click', () => { modal.querySelector('#plan-modal-hours').value = '72'; });
                modal.querySelector('#plan-modal-quick-168').addEventListener('click', () => { modal.querySelector('#plan-modal-hours').value = '168'; });

                // Save
                modal.querySelector('#plan-modal-save').addEventListener('click', async () => {
                    const newPlan = modal.querySelector('#plan-modal-plan').value;
                    const hours = modal.querySelector('#plan-modal-hours').value;
                    const msgEl = modal.querySelector('#plan-modal-msg');

                    const body = {};
                    if (newPlan !== currentPlan) body.plan = newPlan;
                    if (hours && Number(hours) > 0) body.trial_extends_hours = Number(hours);

                    // If switching to trial but no hours, give default 72h
                    if (newPlan === 'trial' && !hours && currentPlan !== 'trial') {
                        body.trial_extends_hours = 72;
                    }

                    if (Object.keys(body).length === 0) {
                        msgEl.style.display = 'block';
                        msgEl.style.background = '#fef2f2';
                        msgEl.style.color = '#dc2626';
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
                        msgEl.textContent = `Updated! Plan: ${data.user.plan}${data.user.trial_expires_at ? ' · Trial until ' + new Date(data.user.trial_expires_at).toLocaleString() : ''}`;
                        setTimeout(async () => { modal.remove(); await loadUsers(); }, 1500);
                    } catch (err) {
                        msgEl.style.display = 'block';
                        msgEl.style.background = '#fef2f2';
                        msgEl.style.color = '#dc2626';
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
                if (!area.classList.contains('hidden')) {
                    area.classList.add('hidden');
                    btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Chats`;
                    return;
                }
                area.innerHTML = '<div class="flex items-center gap-2 p-3 text-xs text-gray-400"><div class="w-4 h-4 border-2 border-indigo-300 border-t-transparent rounded-full animate-spin"></div> Loading...</div>';
                area.classList.remove('hidden');
                btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 15l-6-6-6 6"/></svg> Hide`;
                try {
                    const chats = await (await fetch(`/api/admin/users/${uid}/chats`)).json();
                    if (!chats.length) {
                        area.innerHTML = '<div class="bg-gray-50 rounded-xl p-3 text-center text-xs text-gray-400">No chats uploaded yet</div>';
                        return;
                    }
                    area.innerHTML = `
                        <div class="bg-gray-50 rounded-xl overflow-hidden border border-gray-100">
                            <div class="grid grid-cols-12 gap-2 px-3 py-2 text-[9px] font-bold uppercase text-gray-400 tracking-wider border-b border-gray-100">
                                <div class="col-span-4">Chat Name</div>
                                <div class="col-span-2 text-center">Messages</div>
                                <div class="col-span-2">Imported</div>
                                <div class="col-span-4 text-right">Actions</div>
                            </div>
                            ${chats.map(c => `
                                <div class="grid grid-cols-12 gap-2 px-3 py-2.5 items-center hover:bg-white transition text-sm border-b border-gray-50 last:border-0" data-admin-chat-row="${c.id}">
                                    <div class="col-span-4 font-bold text-gray-800 truncate text-xs">
                                        ${(c.display_name || c.folder_name).replace('WhatsApp Chat - ', '')}
                                        ${c.deleted_by_user ? '<span class="ml-1 text-[9px] font-bold bg-red-100 text-red-500 px-1.5 py-0.5 rounded-full">user deleted</span>' : ''}
                                    </div>
                                    <div class="col-span-2 text-center text-xs text-gray-500">${c.message_count || 0}</div>
                                    <div class="col-span-2 text-[10px] text-gray-400">${new Date(c.created_at).toLocaleDateString()}</div>
                                    <div class="col-span-4 text-right flex items-center justify-end gap-1">
                                        <a href="/api/admin/users/${uid}/chats/${c.id}/download" class="inline-flex items-center gap-1 text-[10px] font-bold bg-teal-500 text-white hover:bg-teal-600 rounded-lg px-2 py-1 transition no-underline shadow-sm">
                                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                                            .zip
                                        </a>
                                        <button data-admin-del-chat="${c.id}" data-uid="${uid}" data-cname="${(c.display_name || c.folder_name).replace('WhatsApp Chat - ', '')}" class="inline-flex items-center gap-1 text-[10px] font-bold bg-red-50 text-red-500 hover:bg-red-100 rounded-lg px-2 py-1 transition">
                                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                                            Del
                                        </button>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    `;
                    // Admin chat delete handlers
                    area.querySelectorAll('[data-admin-del-chat]').forEach(delBtn => {
                        delBtn.addEventListener('click', async () => {
                            const chatId = delBtn.dataset.adminDelChat;
                            const delUid = delBtn.dataset.uid;
                            const cname = delBtn.dataset.cname;
                            if (!confirm(`Permanently delete "${cname}"?\n\nThis removes files + AI logs. Cannot be undone!`)) return;
                            delBtn.textContent = '...';
                            delBtn.disabled = true;
                            try {
                                const r = await fetch(`/api/admin/users/${delUid}/chats/${chatId}`, { method: 'DELETE' });
                                if (!r.ok) throw new Error((await r.json()).error || 'Failed');
                                const row = area.querySelector(`[data-admin-chat-row="${chatId}"]`);
                                if (row) row.remove();
                            } catch (err) {
                                alert('Error: ' + err.message);
                                delBtn.textContent = 'Del';
                                delBtn.disabled = false;
                            }
                        });
                    });
                } catch (err) {
                    area.innerHTML = `<div class="bg-red-50 rounded-xl p-3 text-center text-xs text-red-500 font-bold">${err.message}</div>`;
                }
            });
        });

        // AI Logs expand
        list.querySelectorAll('.user-ai-logs-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const uid = btn.dataset.uid;
                const area = list.querySelector(`[data-ai-logs-for="${uid}"]`);
                if (!area.classList.contains('hidden')) {
                    area.classList.add('hidden');
                    return;
                }
                area.innerHTML = '<div class="flex items-center gap-2 p-3 text-xs text-gray-400"><div class="w-4 h-4 border-2 border-purple-300 border-t-transparent rounded-full animate-spin"></div> Loading AI logs...</div>';
                area.classList.remove('hidden');
                try {
                    const convs = await (await fetch(`/api/admin/users/${uid}/conversations`)).json();
                    if (!convs.length) {
                        area.innerHTML = '<div class="bg-gray-50 rounded-xl p-3 text-center text-xs text-gray-400">No AI conversations yet</div>';
                        return;
                    }
                    area.innerHTML = `
                        <div class="bg-purple-50/50 rounded-xl overflow-hidden border border-purple-100">
                            <div class="px-3 py-2 border-b border-purple-100 flex items-center justify-between">
                                <span class="text-[10px] font-bold uppercase text-purple-500 tracking-wider">AI Conversations (${convs.length})</span>
                                <button class="ai-logs-close-btn w-5 h-5 rounded-md hover:bg-purple-200 flex items-center justify-center text-purple-400 hover:text-purple-700 transition" title="Close">
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                                </button>
                            </div>
                            ${convs.map(c => `
                                <div class="px-3 py-2.5 hover:bg-white transition border-b border-purple-50 last:border-0">
                                    <div class="flex items-center justify-between gap-2">
                                        <div class="min-w-0 flex-1">
                                            <p class="text-xs font-bold text-gray-800 truncate">${c.title || 'Untitled'}</p>
                                            <p class="text-[10px] text-gray-400 mt-0.5">${c.chat_folder} &middot; ${c.msg_count} msgs &middot; ${new Date(c.updated_at).toLocaleDateString()}</p>
                                        </div>
                                        <div class="flex gap-1 shrink-0">
                                            <button data-uid="${uid}" data-convid="${c.id}" class="ai-log-view-btn text-[10px] font-bold bg-purple-100 text-purple-700 hover:bg-purple-200 rounded-lg px-2 py-1 transition">View</button>
                                            <a href="/api/admin/users/${uid}/conversations/${c.id}/download" class="text-[10px] font-bold bg-teal-100 text-teal-700 hover:bg-teal-200 rounded-lg px-2 py-1 transition no-underline inline-flex items-center gap-0.5">
                                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                                                .txt
                                            </a>
                                        </div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    `;
                    // Close logs card
                    area.querySelector('.ai-logs-close-btn')?.addEventListener('click', () => {
                        area.classList.add('hidden');
                        area.innerHTML = '';
                    });

                    // View button handlers
                    area.querySelectorAll('.ai-log-view-btn').forEach(vBtn => {
                        vBtn.addEventListener('click', async () => {
                            const convId = vBtn.dataset.convid;
                            const convUid = vBtn.dataset.uid;
                            try {
                                const data = await (await fetch(`/api/admin/users/${convUid}/conversations/${convId}`)).json();
                                const modal = document.createElement('div');
                                modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);z-index:200;display:flex;align-items:center;justify-content:center;padding:16px;';
                                modal.innerHTML = `
                                    <div style="background:white;border-radius:20px;max-width:600px;width:100%;max-height:80vh;display:flex;flex-direction:column;box-shadow:0 24px 48px rgba(0,0,0,0.2);">
                                        <div style="padding:16px 20px;border-bottom:1px solid #f1f5f9;display:flex;justify-content:space-between;align-items:center;flex-shrink:0;">
                                            <div>
                                                <h4 style="font-weight:700;font-size:14px;color:#1e293b;">${data.title || 'AI Conversation'}</h4>
                                                <p style="font-size:11px;color:#94a3b8;margin-top:2px;">${data.chat_folder} &middot; ${data.messages?.length || 0} messages</p>
                                            </div>
                                            <button onclick="this.closest('[style]').remove()" style="width:28px;height:28px;border-radius:8px;background:#f1f5f9;color:#64748b;font-size:14px;cursor:pointer;">x</button>
                                        </div>
                                        <div style="padding:16px 20px;overflow-y:auto;flex:1;">
                                            ${(data.messages || []).map(m => `
                                                <div style="margin-bottom:12px;display:flex;justify-content:${m.role === 'user' ? 'flex-end' : 'flex-start'};">
                                                    <div style="max-width:80%;padding:10px 14px;border-radius:14px;font-size:13px;line-height:1.5;${m.role === 'user'
                                                        ? 'background:#1e293b;color:white;border-bottom-right-radius:4px;'
                                                        : 'background:#f1f5f9;color:#1e293b;border:1px solid #e2e8f0;border-bottom-left-radius:4px;'}">
                                                        ${m.content.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}
                                                        <div style="font-size:10px;color:${m.role === 'user' ? 'rgba(255,255,255,0.5)' : '#94a3b8'};margin-top:4px;text-align:right;">${new Date(m.created_at).toLocaleString()}</div>
                                                    </div>
                                                </div>
                                            `).join('')}
                                        </div>
                                    </div>
                                `;
                                modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
                                document.body.appendChild(modal);
                            } catch (err) {
                                alert('Error loading conversation: ' + err.message);
                            }
                        });
                    });
                } catch (err) {
                    area.innerHTML = `<div class="bg-red-50 rounded-xl p-3 text-center text-xs text-red-500 font-bold">${err.message}</div>`;
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
