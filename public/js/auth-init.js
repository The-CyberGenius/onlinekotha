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
            text.innerHTML = `🎁 Trial: <b>${hours}h ${mins}m</b> · Unlimited AI`;
        } else if (plan === 'paid') {
            badge.className = 'rounded-xl px-3 py-2 text-xs font-bold flex items-center justify-between gap-2 bg-green-100 text-green-800 border border-green-200';
            text.innerHTML = `✓ Pro plan · Unlimited AI`;
        } else {
            badge.className = 'rounded-xl px-3 py-2 text-xs font-bold flex items-center justify-between gap-2 bg-gray-100 text-gray-700 border border-gray-200';
            text.innerHTML = `Free tier · 3 AI chats/day`;
        }

    }
})();
