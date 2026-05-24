// Runs before script.js. Gates the app to logged-in users.
(async function () {
    let me;
    try {
        me = await (await fetch('/api/auth/me?_t=' + Date.now())).json();
    } catch {
        window.location.href = '/login.html?next=/app';
        return;
    }

    if (!me.user) {
        window.location.href = '/login.html?next=/app';
        return;
    }

    window.__USER__ = me.user;

    const initDOM = () => {
        const info = document.getElementById('sidebar-user-info');
        if (info) info.textContent = me.user.display_name || me.user.email;

        // Show profile picture if available (Google login)
        const sidebarAvatar = document.getElementById('sidebar-avatar');
        if (sidebarAvatar && me.user.avatar_url) {
            sidebarAvatar.innerHTML = `<img src="${me.user.avatar_url}" alt="" class="w-10 h-10 rounded-xl object-cover">`;
        } else if (sidebarAvatar && me.user.display_name) {
            sidebarAvatar.textContent = me.user.display_name.charAt(0).toUpperCase();
        }

        // Show display name below avatar
        const sidebarTitle = document.getElementById('sidebar-title');
        if (sidebarTitle && me.user.display_name) {
            sidebarTitle.textContent = me.user.display_name;
        }

        if (me.user.is_admin) {
            const link = document.getElementById('admin-link');
            if (link) link.classList.remove('hidden');
        }

        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', async () => {
                try {
                    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
                } catch {}
                // Force clear cookie client-side as backup
                document.cookie = 'session=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/;';
                window.location.replace('/login.html');
            });
        }

        renderPlanBadge(me.user);
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initDOM);
    } else {
        initDOM();
    }

    function renderPlanBadge(user) {
        const banner = document.getElementById('plan-banner');
        const badge = document.getElementById('plan-badge');
        const text = document.getElementById('plan-text');
        const upgrade = document.getElementById('upgrade-btn');
        if (!banner || !badge || !text) return;

        banner.classList.remove('hidden');
        const plan = user.effective_plan;

        if (plan === 'trial') {
            const remainingMs = user.trial_expires_at - Date.now();
            const hours = Math.max(0, Math.floor(remainingMs / 3600000));
            const mins = Math.max(0, Math.floor((remainingMs % 3600000) / 60000));
            badge.className = 'rounded-xl px-3 py-2 text-xs font-bold flex items-center justify-between gap-2 bg-gradient-to-r from-indigo-100 to-purple-100 text-indigo-800 border border-indigo-200';
            text.innerHTML = `🎁 Trial: <b>${hours}h ${mins}m</b> remaining`;
        } else if (plan === 'paid') {
            badge.className = 'rounded-xl px-3 py-2 text-xs font-bold flex items-center justify-between gap-2 bg-green-100 text-green-800 border border-green-200';
            text.innerHTML = `✓ Paid plan · AI unlocked`;
        } else {
            badge.className = 'rounded-xl px-3 py-2 text-xs font-bold flex items-center justify-between gap-2 bg-amber-50 text-amber-800 border border-amber-200';
            text.innerHTML = `Trial ended · AI chat locked`;
            if (upgrade) upgrade.classList.remove('hidden');
        }

        if (upgrade) {
            upgrade.addEventListener('click', () => openUpgradeModal());
        }
    }

    function openUpgradeModal() {
        if (document.getElementById('upgrade-modal-overlay')) return;
        const overlay = document.createElement('div');
        overlay.id = 'upgrade-modal-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);backdrop-filter:blur(6px);z-index:200;display:flex;align-items:center;justify-content:center;padding:24px;';
        overlay.innerHTML = `
            <div style="background:white;border-radius:24px;max-width:440px;width:100%;padding:32px;box-shadow:0 24px 60px -20px rgba(0,0,0,0.3);">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
                    <h3 style="font-weight:800;font-size:20px;color:#0f172a;">Upgrade to Pro</h3>
                    <button id="upg-close" style="width:32px;height:32px;border-radius:50%;background:#f1f5f9;color:#64748b;font-weight:700;">✕</button>
                </div>
                <p style="color:#475569;font-size:14px;margin-bottom:20px;line-height:1.6;">Unlock unlimited AI conversations with your chat history.</p>

                <div style="display:flex;flex-direction:column;gap:12px;">
                    <button data-plan="pro" class="upg-btn" style="text-align:left;border:1px solid #e2e8f0;border-radius:16px;padding:16px;cursor:pointer;transition:all 200ms;background:white;">
                        <div style="display:flex;justify-content:space-between;align-items:start;">
                            <div>
                                <div style="font-weight:700;color:#0f172a;font-size:15px;">Pro</div>
                                <div style="font-size:12px;color:#64748b;margin-top:2px;">Monthly · cancel anytime</div>
                            </div>
                            <div style="font-weight:800;color:#0f172a;font-size:18px;">$5<span style="font-size:12px;color:#94a3b8;font-weight:600;">/mo</span></div>
                        </div>
                    </button>
                    <button data-plan="lifetime" class="upg-btn" style="text-align:left;border:1px solid #e2e8f0;border-radius:16px;padding:16px;cursor:pointer;transition:all 200ms;background:linear-gradient(180deg,#0f172a,#1e293b);color:white;">
                        <div style="display:flex;justify-content:space-between;align-items:start;">
                            <div>
                                <div style="font-weight:700;font-size:15px;">Lifetime</div>
                                <div style="font-size:12px;opacity:0.7;margin-top:2px;">Pay once · forever yours</div>
                            </div>
                            <div style="font-weight:800;font-size:18px;">$49</div>
                        </div>
                    </button>
                </div>
                <p id="upg-err" style="color:#dc2626;font-size:12px;font-weight:600;margin-top:14px;text-align:center;display:none;"></p>
            </div>
        `;
        document.body.appendChild(overlay);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
        document.getElementById('upg-close').onclick = () => overlay.remove();
        overlay.querySelectorAll('.upg-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const plan = btn.dataset.plan;
                btn.disabled = true;
                btn.style.opacity = '0.6';
                try {
                    const r = await fetch('/api/billing/checkout', {
                        method: 'POST',
                        headers: { 'content-type': 'application/json' },
                        body: JSON.stringify({ plan }),
                    });
                    const data = await r.json();
                    if (!r.ok) throw new Error(data.error || 'Failed');
                    window.location.href = data.url;
                } catch (err) {
                    const e = document.getElementById('upg-err');
                    e.textContent = err.message;
                    e.style.display = 'block';
                    btn.disabled = false;
                    btn.style.opacity = '1';
                }
            });
        });
    }
})();
