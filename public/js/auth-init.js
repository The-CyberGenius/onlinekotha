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
        window.__IS_GUEST__ = true;
        window.__GUEST_STATUS__ = me.guest || {};
        window.__USER__ = null;
    } else {
        window.__USER__ = me.user;
        window.__IS_GUEST__ = false;
    }

    // Global Modal Controllers
    window.openAuthModal = function (reason) {
        const modal = document.getElementById('auth-modal');
        if (!modal) return;
        if (reason) {
            const sub = document.getElementById('auth-modal-sub');
            if (sub) sub.textContent = reason;
        }
        modal.classList.remove('hidden');
        requestAnimationFrame(() => {
            modal.classList.remove('opacity-0');
            const card = modal.querySelector('div');
            if (card) {
                card.classList.remove('scale-95');
                card.classList.add('scale-100');
            }
        });
    };

    window.closeAuthModal = function () {
        const modal = document.getElementById('auth-modal');
        if (!modal) return;
        modal.classList.add('opacity-0');
        const card = modal.querySelector('div');
        if (card) {
            card.classList.remove('scale-100');
            card.classList.add('scale-95');
        }
        setTimeout(() => modal.classList.add('hidden'), 300);
    };

    window.switchModalAuthTab = function (tab) {
        const signinBtn = document.getElementById('modal-tab-signin');
        const signupBtn = document.getElementById('modal-tab-signup');
        const signinForm = document.getElementById('modal-signin-form');
        const signupForm = document.getElementById('modal-signup-form');
        const errEl = document.getElementById('modal-auth-error');
        if (errEl) errEl.classList.add('hidden');

        if (tab === 'signin') {
            if (signinBtn) signinBtn.className = 'flex-1 py-1.5 text-xs font-bold rounded-lg transition-all bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-300 shadow-sm cursor-pointer';
            if (signupBtn) signupBtn.className = 'flex-1 py-1.5 text-xs font-bold rounded-lg transition-all modal-sub hover:text-gray-900 dark:hover:text-white cursor-pointer';
            signinForm?.classList.remove('hidden');
            signupForm?.classList.add('hidden');
        } else {
            if (signupBtn) signupBtn.className = 'flex-1 py-1.5 text-xs font-bold rounded-lg transition-all bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-300 shadow-sm cursor-pointer';
            if (signinBtn) signinBtn.className = 'flex-1 py-1.5 text-xs font-bold rounded-lg transition-all modal-sub hover:text-gray-900 dark:hover:text-white cursor-pointer';
            signupForm?.classList.remove('hidden');
            signinForm?.classList.add('hidden');
        }
    };

    window.handleModalEmailLogin = async function (e) {
        e.preventDefault();
        const email = (document.getElementById('modal-signin-email')?.value || '').trim();
        const pin = (document.getElementById('modal-signin-pin')?.value || '').trim();
        const btn = document.getElementById('modal-signin-btn');
        const errEl = document.getElementById('modal-auth-error');
        if (errEl) errEl.classList.add('hidden');

        if (!email || !pin) {
            if (errEl) { errEl.textContent = 'Please enter your email and 6-digit PIN'; errEl.classList.remove('hidden'); }
            return;
        }

        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<span class="inline-block animate-spin mr-1">⏳</span> Signing in...';
        }

        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ email, pin }),
            });
            const data = await res.json();
            if (!res.ok || !data.ok) throw new Error(data.error || 'Invalid email or PIN');

            window.location.reload();
        } catch (err) {
            if (errEl) {
                errEl.textContent = err.message || 'Login failed';
                errEl.classList.remove('hidden');
            }
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Sign In';
            }
        }
    };

    window.handleModalEmailSignup = async function (e) {
        e.preventDefault();
        const name = (document.getElementById('modal-signup-name')?.value || '').trim();
        const email = (document.getElementById('modal-signup-email')?.value || '').trim();
        const pin = (document.getElementById('modal-signup-pin')?.value || '').trim();
        const phone = (document.getElementById('modal-signup-phone')?.value || '').trim();
        const phoneCountryCode = (document.getElementById('modal-signup-phone-code')?.value || '+91').trim();
        const btn = document.getElementById('modal-signup-btn');
        const errEl = document.getElementById('modal-auth-error');
        if (errEl) errEl.classList.add('hidden');

        if (!email || !pin) {
            if (errEl) { errEl.textContent = 'Email and 6-digit PIN are required'; errEl.classList.remove('hidden'); }
            return;
        }
        if (pin.length < 4) {
            if (errEl) { errEl.textContent = 'PIN must be 4 to 6 digits'; errEl.classList.remove('hidden'); }
            return;
        }

        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<span class="inline-block animate-spin mr-1">⏳</span> Creating account...';
        }

        try {
            const res = await fetch('/api/auth/signup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ email, pin, name, phone, phone_country_code: phoneCountryCode }),
            });
            const data = await res.json();
            if (!res.ok || !data.ok) throw new Error(data.error || 'Signup failed');

            window.location.reload();
        } catch (err) {
            if (errEl) {
                errEl.textContent = err.message || 'Signup failed';
                errEl.classList.remove('hidden');
            }
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Create Account & Sign In';
            }
        }
    };

    let currentProfileEditMode = false;

    window.openProfileModal = function (isEditMode = false) {
        const modal = document.getElementById('profile-modal');
        if (!modal) return;
        currentProfileEditMode = isEditMode;

        const titleEl = document.getElementById('profile-modal-title');
        const subEl = document.getElementById('profile-modal-sub');
        const nameInput = document.getElementById('profile-name-input');
        const phoneInput = document.getElementById('profile-phone-input');
        const phoneCode = document.getElementById('profile-phone-code');
        const skipBtn = document.getElementById('profile-skip-btn');
        const saveBtn = document.getElementById('profile-save-btn');
        const errEl = document.getElementById('profile-modal-error');

        if (errEl) errEl.classList.add('hidden');

        if (me && me.user) {
            if (nameInput) nameInput.value = me.user.display_name || '';
            if (phoneInput) phoneInput.value = me.user.phone || '';
            if (phoneCode && me.user.phone_country_code) phoneCode.value = me.user.phone_country_code;
        }

        if (isEditMode) {
            if (titleEl) titleEl.textContent = 'Edit Profile & Mobile';
            if (subEl) subEl.textContent = 'Update your display name and mobile number below.';
            if (skipBtn) skipBtn.textContent = 'Cancel';
            if (saveBtn) saveBtn.textContent = 'Save Changes';
        } else {
            if (titleEl) titleEl.textContent = 'Complete Your Profile';
            if (subEl) subEl.textContent = 'Add your name & phone number to personalize your experience. (Optional)';
            if (skipBtn) skipBtn.textContent = 'Skip for now →';
            if (saveBtn) saveBtn.textContent = 'Save & Continue';
        }

        modal.classList.remove('hidden');
        requestAnimationFrame(() => {
            modal.classList.remove('opacity-0');
            const card = modal.querySelector('div');
            if (card) {
                card.classList.remove('scale-95');
                card.classList.add('scale-100');
            }
        });
    };

    window.closeProfileModal = async function (isSkip = false) {
        const modal = document.getElementById('profile-modal');
        if (!modal) return;
        modal.classList.add('opacity-0');
        const card = modal.querySelector('div');
        if (card) {
            card.classList.remove('scale-100');
            card.classList.add('scale-95');
        }
        setTimeout(() => modal.classList.add('hidden'), 300);

        if (isSkip && !currentProfileEditMode && me && me.user && !me.user.phone_prompted) {
            try {
                await fetch('/api/user/profile/skip', { method: 'POST', credentials: 'same-origin' });
                me.user.phone_prompted = true;
            } catch {}
        }
    };

    window.handleProfileSubmit = async function (e) {
        e.preventDefault();
        const nameInput = document.getElementById('profile-name-input');
        const phoneInput = document.getElementById('profile-phone-input');
        const phoneCode = document.getElementById('profile-phone-code');
        const saveBtn = document.getElementById('profile-save-btn');
        const errEl = document.getElementById('profile-modal-error');

        const displayName = (nameInput?.value || '').trim();
        const phone = (phoneInput?.value || '').trim();
        const countryCode = (phoneCode?.value || '+91').trim();

        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<span class="inline-block animate-spin mr-1">⏳</span> Saving...';
        }

        try {
            const resp = await fetch('/api/user/profile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({
                    display_name: displayName,
                    phone: phone,
                    phone_country_code: countryCode,
                }),
            });
            const data = await resp.json();
            if (!data.ok) throw new Error(data.error || 'Failed to update profile');

            if (me && me.user) {
                me.user.display_name = data.user.display_name;
                me.user.phone = data.user.phone;
                me.user.phone_country_code = data.user.phone_country_code;
                me.user.phone_prompted = true;
            }

            // Update UI
            const sidebarTitle = document.getElementById('sidebar-title');
            if (sidebarTitle && data.user.display_name) {
                sidebarTitle.textContent = data.user.display_name;
            }
            const info = document.getElementById('sidebar-user-info');
            if (info && data.user.display_name) {
                info.textContent = data.user.display_name;
            }
            const avatarInitials = document.getElementById('my-avatar-initials');
            if (avatarInitials && data.user.display_name) {
                avatarInitials.textContent = data.user.display_name.charAt(0).toUpperCase();
            }

            if (window.kothaToast) {
                window.kothaToast('✨ Profile updated successfully!');
            }

            window.closeProfileModal(false);
        } catch (err) {
            if (errEl) {
                errEl.textContent = err.message || 'Error saving profile';
                errEl.classList.remove('hidden');
            }
        } finally {
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.textContent = currentProfileEditMode ? 'Save Changes' : 'Save & Continue';
            }
        }
    };

    const initDOM = () => {
        if (window.__IS_GUEST__) {
            // Setup Guest Banner & Sign In Button
            const banner = document.getElementById('guest-preview-banner');
            if (banner) banner.classList.remove('hidden');

            const guestSigninBtn = document.getElementById('guest-signin-btn');
            if (guestSigninBtn) guestSigninBtn.classList.remove('hidden');

            const guestStatus = window.__GUEST_STATUS__ || {};
            const chatRem = document.getElementById('guest-chat-rem');
            const aiRem = document.getElementById('guest-ai-rem');
            if (chatRem) chatRem.textContent = guestStatus.chatsRemaining ?? 1;
            if (aiRem) aiRem.textContent = guestStatus.aiMsgsRemaining ?? 10;

            // Guest Sidebar Profile
            const info = document.getElementById('sidebar-user-info');
            if (info) info.textContent = 'Guest User';

            const emailDisplay = document.getElementById('my-email-display');
            if (emailDisplay) emailDisplay.textContent = 'Free Preview Mode';

            const avatarInitials = document.getElementById('my-avatar-initials');
            if (avatarInitials) avatarInitials.textContent = 'G';

            const avatarWrap = document.getElementById('my-avatar-wrap');
            if (avatarWrap) {
                avatarWrap.title = 'Click to Sign In with Google';
                avatarWrap.onclick = () => window.openAuthModal();
            }

            const sidebarTitle = document.getElementById('sidebar-title');
            if (sidebarTitle) sidebarTitle.textContent = 'Guest Mode';

            const logoutBtn = document.getElementById('logout-btn');
            if (logoutBtn) {
                logoutBtn.title = 'Sign in to save account';
                logoutBtn.onclick = () => window.openAuthModal();
            }
            return;
        }

        const info = document.getElementById('sidebar-user-info');
        if (info) info.textContent = me.user.display_name || me.user.email;

        // ── My avatar + email in sidebar header ──
        const emailDisplay = document.getElementById('my-email-display');
        if (emailDisplay) emailDisplay.textContent = me.user.email || '';

        const avatarInitials = document.getElementById('my-avatar-initials');
        const avatarImg      = document.getElementById('my-avatar-img');
        const avatarPhoto    = document.getElementById('my-avatar-photo');

        // Always set initials first (fallback if photo missing or fails to load)
        const myName = me.user.display_name || me.user.email || '?';
        if (avatarInitials) avatarInitials.textContent = myName.charAt(0).toUpperCase();

        if (me.user.avatar_url && avatarPhoto) {
            avatarPhoto.src = me.user.avatar_url;
            avatarImg?.classList.remove('hidden');
            avatarInitials?.classList.add('hidden');
        }

        const avatarWrap = document.getElementById('my-avatar-wrap');
        if (avatarWrap) {
            avatarWrap.title = 'Click to edit profile & phone number';
            avatarWrap.onclick = () => window.openProfileModal(true);
        }

        // Show display name below avatar
        const sidebarTitle = document.getElementById('sidebar-title');
        if (sidebarTitle && me.user.display_name) {
            sidebarTitle.textContent = me.user.display_name;
        }

        // Auto-prompt if not prompted yet and no phone
        if (!me.user.phone_prompted && !me.user.phone) {
            setTimeout(() => {
                window.openProfileModal(false);
            }, 700);
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
                document.cookie = 'session=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/;';
                window.location.replace('/login.html');
            });
        }

        renderPlanBadge(me.user);

        // Returning from a Dodo checkout? The webhook grants Pro server-side; poll
        // briefly so the badge flips without a manual refresh, then clean the URL.
        try {
            const _params = new URLSearchParams(window.location.search);
            if (_params.get('upgraded') === 'dodo') {
                if (window.kothaToast) window.kothaToast('🎉 Payment received! Activating Pro…');
                _params.delete('upgraded'); _params.delete('checkout_id');
                const _qs = _params.toString();
                window.history.replaceState({}, '', window.location.pathname + (_qs ? '?' + _qs : ''));
                let _tries = 0;
                const _poll = setInterval(async () => {
                    _tries++;
                    try {
                        const fresh = await (await fetch('/api/auth/me?_t=' + Date.now())).json();
                        if (fresh && fresh.user && fresh.user.effective_plan === 'paid') {
                            window.__USER__ = fresh.user;
                            renderPlanBadge(fresh.user);
                            if (window.kothaToast) window.kothaToast('✓ Pro plan active — unlimited AI unlocked!');
                            clearInterval(_poll);
                        }
                    } catch {}
                    if (_tries >= 6) clearInterval(_poll);
                }, 1500);
            }
        } catch {}

        // Impersonation Banner
        if (me.user.is_impersonating) {
            const banner = document.createElement('div');
            banner.className = 'fixed top-0 left-0 w-full bg-red-600 text-white text-xs font-bold text-center py-1.5 z-[9999] shadow-md flex items-center justify-center gap-4';
            banner.innerHTML = `
                <span>⚠️ Admin Impersonation Mode Active. Viewing as ${me.user.email}</span>
                <a href="/api/admin/impersonate/stop" class="bg-white/20 hover:bg-white/30 px-2 py-0.5 rounded text-white no-underline transition">Exit Mode</a>
            `;
            document.body.appendChild(banner);
            document.body.style.paddingTop = '28px';
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initDOM);
    } else {
        initDOM();
    }

    function renderPlanBadge(user) {
        const banner  = document.getElementById('plan-banner');
        const badge   = document.getElementById('plan-badge');
        const text    = document.getElementById('plan-text');
        const upgradeUsd = document.getElementById('upgrade-usd-btn');
        if (!banner || !badge || !text) return;

        banner.classList.remove('hidden');
        const plan = user.effective_plan;

        if (plan === 'trial') {
            const remainingMs = user.trial_expires_at - Date.now();
            const hours = Math.max(0, Math.floor(remainingMs / 3600000));
            const mins  = Math.max(0, Math.floor((remainingMs % 3600000) / 60000));
            badge.className = 'rounded-xl px-3 py-2 text-xs font-bold flex items-center justify-between gap-2 bg-gradient-to-r from-indigo-100 to-purple-100 text-indigo-800 border border-indigo-200';
            text.innerHTML  = `🎁 Trial: <b>${hours}h ${mins}m</b> · Unlimited AI`;
        } else if (plan === 'paid') {
            badge.className = 'rounded-xl px-3 py-2 text-xs font-bold flex items-center justify-between gap-2 bg-green-100 text-green-800 border border-green-200';
            text.innerHTML  = `✓ Pro plan · Unlimited AI`;
            if (upgradeUsd) upgradeUsd.classList.add('hidden');
        } else {
            badge.className = 'rounded-xl px-3 py-2 text-xs font-bold flex items-center justify-between gap-2 bg-gray-100 text-gray-700 border border-gray-200';
            text.innerHTML  = `Free tier · 3 AI chats/day`;
        }

        // ── Dodo global checkout (redirect-based) ──────────────────
        if (upgradeUsd) {
            // Keep visibility in sync on every render (e.g. after an in-session upgrade)
            if (plan === 'paid') upgradeUsd.classList.add('hidden');

            if (!upgradeUsd._dodoBound) {
                upgradeUsd._dodoBound = true;

                // Reveal the "Upgrade" option only for non-paid users when Dodo is configured
                if (plan !== 'paid') {
                    fetch('/api/dodo/plans')
                        .then(r => r.json())
                        .then(pd => {
                            if (pd && pd.available) {
                                const p = pd.plans && pd.plans[0];
                                upgradeUsd.textContent = p ? `Upgrade ${p.display}` : 'Upgrade';
                                upgradeUsd.classList.remove('hidden');
                            }
                        })
                        .catch(() => {});
                }

                upgradeUsd.addEventListener('click', async () => {
                    if (window.openUpgradeModal) window.openUpgradeModal();
                });
            }
        }
    }

    // Modal Control Logic
    window.openUpgradeModal = function() {
        const modal = document.getElementById('upgrade-modal');
        if (modal) {
            modal.classList.remove('hidden');
            // small delay to allow display:block to apply before animating opacity
            setTimeout(() => {
                modal.classList.remove('opacity-0');
                const card = modal.querySelector('.custom-modal-card');
                if (card) {
                    card.classList.remove('scale-95');
                    card.classList.add('scale-100');
                }
            }, 10);

            // Attach click to the actual pay button inside the modal if not already bound
            const modalPayBtn = document.getElementById('modal-pay-btn');
            if (modalPayBtn && !modalPayBtn._dodoBound) {
                modalPayBtn._dodoBound = true;
                modalPayBtn.addEventListener('click', async () => {
                    modalPayBtn.disabled = true;
                    const originalText = modalPayBtn.innerHTML;
                    modalPayBtn.innerHTML = '<span>Redirecting…</span>';
                    try {
                        const r = await fetch('/api/dodo/create-checkout', {
                            method: 'POST',
                            headers: { 'content-type': 'application/json' },
                            body: JSON.stringify({ plan: 'pro_monthly' }),
                        });
                        const d = await r.json();
                        if (r.ok && d.url) { window.location.href = d.url; return; }
                        if (window.kothaToast) window.kothaToast('Error: ' + (d.error || 'Checkout failed'));
                    } catch (err) {
                        if (window.kothaToast) window.kothaToast('Network error');
                    }
                    modalPayBtn.disabled = false;
                    modalPayBtn.innerHTML = originalText;
                });
            }
        }
    };

    window.closeUpgradeModal = function() {
        const modal = document.getElementById('upgrade-modal');
        if (modal) {
            modal.classList.add('opacity-0');
            const card = modal.querySelector('.custom-modal-card');
            if (card) {
                card.classList.remove('scale-100');
                card.classList.add('scale-95');
            }
            setTimeout(() => modal.classList.add('hidden'), 300);
        }
    };

})();
