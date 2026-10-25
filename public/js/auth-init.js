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
    window.toggleModalEmailAuth = function (forceState) {
        const accordion = document.getElementById('modal-email-accordion');
        const arrow = document.getElementById('modal-email-arrow');
        if (!accordion) return;
        const isHidden = accordion.classList.contains('hidden');
        const show = typeof forceState === 'boolean' ? forceState : isHidden;
        if (show) {
            accordion.classList.remove('hidden');
            if (arrow) arrow.style.transform = 'rotate(180deg)';
        } else {
            accordion.classList.add('hidden');
            if (arrow) arrow.style.transform = 'rotate(0deg)';
        }
    };

    window.openAuthModal = function (reason) {
        const modal = document.getElementById('auth-modal');
        if (!modal) return;
        if (reason) {
            const sub = document.getElementById('auth-modal-sub');
            if (sub) sub.textContent = reason;
        }
        const googleBtn = document.getElementById('modal-google-btn');
        if (googleBtn) {
            try {
                const nextUrl = new URL(window.location.href);
                nextUrl.searchParams.delete('auth');
                const nextTarget = nextUrl.pathname + (nextUrl.search || '?chat=kotha_assistant');
                googleBtn.href = `/api/auth/google?next=${encodeURIComponent(nextTarget)}`;
            } catch (e) {
                googleBtn.href = '/api/auth/google?next=%2Fapp.html%3Fchat%3Dkotha_assistant';
            }
        }
        // Always reset manual email/PIN section to collapsed cute state
        window.toggleModalEmailAuth(false);

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
        setTimeout(() => {
            modal.classList.add('hidden');
            window.toggleModalEmailAuth(false);
        }, 300);
    };

    document.addEventListener('DOMContentLoaded', () => {
        const authModal = document.getElementById('auth-modal');
        if (authModal) {
            authModal.addEventListener('click', (e) => {
                if (e.target === authModal) window.closeAuthModal();
            });
        }
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const modal = document.getElementById('auth-modal');
                if (modal && !modal.classList.contains('hidden')) {
                    window.closeAuthModal();
                }
            }
        });
    });

    window.switchModalAuthTab = function (tab) {
        const signinBtn = document.getElementById('modal-tab-signin');
        const signupBtn = document.getElementById('modal-tab-signup');
        const signinForm = document.getElementById('modal-signin-form');
        const signupForm = document.getElementById('modal-signup-form');
        const errEl = document.getElementById('modal-auth-error');
        if (errEl) errEl.classList.add('hidden');
        window.toggleModalEmailAuth(true);

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

            if (window.trackKothaEvent) {
                window.trackKothaEvent('login_completed', { user_id: data.user ? data.user.id : undefined });
            }
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

            if (window.trackKothaEvent) {
                window.trackKothaEvent('signup_completed', { user_id: data.user ? data.user.id : undefined });
            }
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
            renderPlanBadge(me.user);
        } else {
            renderPlanBadge({ plan: 'guest' });
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
            const sidebarDisplayName = document.getElementById('sidebar-user-display-name') || document.getElementById('sidebar-title');
            if (sidebarDisplayName && data.user.display_name) {
                sidebarDisplayName.textContent = data.user.display_name;
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
            if (aiRem) aiRem.textContent = guestStatus.aiMsgsRemaining ?? 5;

            // Auto-open Auth Modal ONLY if requested via URL param (e.g. auth=google, auth=true, auth=1)
            const urlParams = new URLSearchParams(window.location.search);
            const authParam = urlParams.get('auth');
            if (authParam === 'google' || authParam === 'true' || authParam === '1' || authParam === 'signin' || authParam === 'login') {
                setTimeout(() => {
                    window.openAuthModal('Sign in with Google to save your chats permanently and unlock AI features!');
                }, 400);
            }

            // Trigger Google One Tap for Guest (except when actively importing a chat)
            (async () => {
            try {
                if (urlParams.get('action') === 'import') return;
                const idRes = await fetch('/api/auth/google/client-id');
                const idData = await idRes.json();
                if (idData && idData.clientId) {
                    window.handleGoogleOneTap = async (response) => {
                        if (!response || !response.credential) return;
                        try {
                            const res = await fetch('/api/auth/google/onetap', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ credential: response.credential })
                            });
                            const data = await res.json();
                            if (data && data.ok) window.location.reload();
                        } catch (e) {
                            console.error('One Tap Error', e);
                        }
                    };
                    const initOneTapGis = () => {
                        if (window.oneTapInitialized) return;
                        if (!window.google || !window.google.accounts || !window.google.accounts.id) return;
                        window.oneTapInitialized = true;
                        try {
                            window.google.accounts.id.initialize({
                                client_id: idData.clientId,
                                callback: window.handleGoogleOneTap,
                                auto_select: false,
                                cancel_on_tap_outside: false,
                                context: 'signin',
                                itp_support: true,
                                use_fedcm_for_prompt: true
                            });
                            window.google.accounts.id.prompt();
                        } catch (err) {}
                    };
                    if (window.google && window.google.accounts && window.google.accounts.id) {
                        initOneTapGis();
                    } else {
                        const script = document.createElement('script');
                        script.src = 'https://accounts.google.com/gsi/client';
                        script.async = true;
                        script.defer = true;
                        script.onload = () => setTimeout(initOneTapGis, 100);
                        document.head.appendChild(script);
                    }
                }
            } catch(e){}
            })();

            // Guest Sidebar Profile
            const info = document.getElementById('sidebar-user-info');
            if (info) info.textContent = 'Guest User';

            const emailDisplay = document.getElementById('my-email-display');
            if (emailDisplay) emailDisplay.textContent = '5 Free AI Replies / Day';

            // Guest Global Chat indicator
            const globalOnlineCount = document.getElementById('global-online-count');
            if (globalOnlineCount) {
                globalOnlineCount.innerHTML = '<span class="text-indigo-500 dark:text-indigo-400 font-semibold flex items-center gap-1">🔒 Sign in to join</span>';
            }

            const avatarInitials = document.getElementById('my-avatar-initials');
            if (avatarInitials) avatarInitials.textContent = 'G';

            const avatarWrap = document.getElementById('my-avatar-wrap');
            if (avatarWrap) {
                avatarWrap.title = 'Click to Sign In with Google';
                avatarWrap.onclick = () => window.openAuthModal();
            }

            const sidebarDisplayName = document.getElementById('sidebar-user-display-name') || document.getElementById('sidebar-title');
            if (sidebarDisplayName) sidebarDisplayName.textContent = 'Guest Preview';

            const logoutBtn = document.getElementById('logout-btn');
            if (logoutBtn) {
                logoutBtn.classList.add('hidden');
                logoutBtn.title = 'Sign in to save account';
                logoutBtn.onclick = () => window.openAuthModal();
            }
            renderPlanBadge({ plan: 'guest' });
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
            avatarWrap.title = me.user.is_impersonating ? 'Impersonating ' + (me.user.display_name || me.user.email) : 'Click to edit profile & phone number';
            if (!me.user.is_impersonating) {
                avatarWrap.onclick = () => window.openProfileModal(true);
            }
        }

        // Show display name below avatar
        const sidebarDisplayName = document.getElementById('sidebar-user-display-name') || document.getElementById('sidebar-title');
        if (sidebarDisplayName) {
            sidebarDisplayName.textContent = me.user.display_name || me.user.email?.split('@')[0] || 'My Account';
        }

        const guestSigninBtn = document.getElementById('guest-signin-btn');
        if (guestSigninBtn) {
            guestSigninBtn.classList.add('hidden');
        }

        // Auto-prompt if not prompted yet and no phone (never for guests or impersonation)
        if (!me.user.is_impersonating && me.user.plan !== 'guest' && !me.user.phone_prompted && !me.user.phone) {
            setTimeout(() => {
                window.openProfileModal(false);
            }, 700);
        }

        if (me.user.is_admin) {
            const link = document.getElementById('admin-link');
            if (link) link.classList.remove('hidden');
        }

        const logoutBtn = document.getElementById('logout-btn');
        const logoutBtnMob = document.getElementById('logout-btn-mobile');
        const doLogout = async () => {
            try {
                await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
            } catch {}
            document.cookie = 'session=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/;';
            document.cookie = 'admin_impersonate_uid=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/;';
            window.location.replace('/');
        };
        if (logoutBtn) logoutBtn.addEventListener('click', doLogout);
        if (logoutBtnMob) logoutBtnMob.addEventListener('click', doLogout);

        renderPlanBadge(me.user);


        // Impersonation Indicator
        if (me.user.is_impersonating) {
            // Show exit button in header, and hide logout to prevent overflow
            const exitBtn = document.getElementById('exit-impersonation-btn');
            if (exitBtn) exitBtn.classList.remove('hidden');
            const logoutBtn = document.getElementById('logout-btn');
            if (logoutBtn) logoutBtn.classList.add('hidden'); logoutBtn.style.setProperty('display', 'none', 'important');

            // Add thin red line at the top of the body and CSS hook for mobile dock
            document.body.classList.add('border-t-4', 'border-red-500', 'impersonating-mobile-dock');

            // Titlebar admin controls (desktop titlebar)
            const titlebarControls = document.getElementById('mac-titlebar-admin-controls');
            if (titlebarControls && !document.getElementById('tb-admin-ai-controls')) {
                titlebarControls.classList.remove('hidden');
                titlebarControls.classList.add('flex');
                titlebarControls.innerHTML = `
                    <div id="tb-admin-ai-controls" class="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-black/5 dark:bg-white/5 text-[10px] font-bold">
                        <div id="tb-ai-status-dot" class="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]"></div>
                        <span id="tb-ai-status-text" class="text-slate-700 dark:text-slate-200 uppercase tracking-wide">AI ACTIVE</span>
                        <button id="tb-admin-pause-ai-btn" class="ml-1 px-1.5 py-0.5 rounded bg-red-500/10 text-red-500 dark:text-red-400 hover:bg-red-500/20 text-[9px] font-bold transition">PAUSE AI</button>
                    </div>
                    <div class="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-black/5 dark:bg-white/5 text-[10px] font-bold text-red-500 dark:text-red-400 cursor-pointer" id="tb-send-as-ai-container" style="display: none;">
                        <input type="checkbox" id="tb-admin-send-as-ai" class="w-3.5 h-3.5 accent-red-500 cursor-pointer">
                        <label for="tb-admin-send-as-ai" class="cursor-pointer text-[9px] select-none">SEND AS AI</label>
                    </div>
                    <a href="/api/admin/impersonate/stop" class="px-2 py-0.5 rounded bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 text-[10px] font-bold transition whitespace-nowrap" title="Exit Impersonation">EXIT</a>
                `;

                const tbPauseBtn = document.getElementById('tb-admin-pause-ai-btn');
                if (tbPauseBtn) {
                    tbPauseBtn.addEventListener('click', () => {
                        const pb = document.getElementById('admin-pause-ai-btn');
                        if (pb) pb.click();
                    });
                }

                const tbSendAsAi = document.getElementById('tb-admin-send-as-ai');
                if (tbSendAsAi) {
                    tbSendAsAi.addEventListener('change', (e) => {
                        const dockCb = document.getElementById('admin-send-as-ai');
                        if (dockCb) dockCb.checked = e.target.checked;
                    });
                }
            }

            // Inject "Send as AI" and "Pause AI" controls into Mac Dock
            const dockGlassBar = document.getElementById('dock-glass-bar');
            const macDock = document.getElementById('mac-dock');
            
            if (dockGlassBar && !document.getElementById('admin-ai-controls')) {
                // Ensure dock is visible for admins even on mobile
                if (macDock) {
                    macDock.classList.remove('hidden', 'md:flex');
                    macDock.classList.add('flex');
                }

                // Add separator line in dock
                const separator = document.createElement('div');
                separator.className = 'w-px h-10 bg-black/10 dark:bg-white/10 mx-1';
                dockGlassBar.appendChild(separator);

                const controlsContainer = document.createElement('div');
                controlsContainer.id = 'admin-ai-controls';
                controlsContainer.className = 'flex items-center gap-2 pl-1';
                controlsContainer.innerHTML = `
                    <div class="flex items-center gap-1.5 px-2 py-1.5 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 transition cursor-default">
                        <div id="ai-status-dot" class="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]"></div>
                        <span id="ai-status-text" class="text-[10px] font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wide hidden sm:block">AI ACTIVE</span>
                        <button id="admin-pause-ai-btn" class="ml-1 px-2 py-1 rounded-lg bg-red-500/10 text-red-500 dark:text-red-400 hover:bg-red-500/20 text-[10px] font-bold transition">PAUSE AI</button>
                    </div>
                    <div class="flex items-center gap-1.5 px-2 py-1.5 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 transition cursor-pointer" id="send-as-ai-container" style="display: none;">
                        <input type="checkbox" id="admin-send-as-ai" class="w-3.5 h-3.5 accent-red-500 cursor-pointer">
                        <label for="admin-send-as-ai" class="text-[10px] font-bold text-red-500 dark:text-red-400 cursor-pointer select-none hidden sm:block">SEND AS AI</label>
                    </div>
                `;
                dockGlassBar.appendChild(controlsContainer);

                // Add event listener
                let isPaused = false;
                const pauseBtn = document.getElementById('admin-pause-ai-btn');
                const statusDot = document.getElementById('ai-status-dot');
                const statusText = document.getElementById('ai-status-text');
                const sendAsAiCont = document.getElementById('send-as-ai-container');
                const chatInput = document.getElementById('bottom-ai-input');
                const sendAsAiInput = document.getElementById('admin-send-as-ai');

                if (sendAsAiInput) {
                    sendAsAiInput.addEventListener('change', (e) => {
                        const tbCb = document.getElementById('tb-admin-send-as-ai');
                        if (tbCb) tbCb.checked = e.target.checked;
                    });
                }

                pauseBtn.addEventListener('click', async () => {
                    const convId = typeof window.kothaGetActiveConvId === 'function' ? window.kothaGetActiveConvId() : null;
                    if (!convId) {
                        if (window.kothaToast) window.kothaToast('Please send or load a message first to establish conversation.');
                        return;
                    }

                    isPaused = !isPaused;
                    
                    try {
                        await fetch('/api/admin/impersonate/toggle-ai', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ conversationId: convId, paused: isPaused })
                        });
                    } catch (e) {
                        console.error('Failed to toggle AI pause', e);
                    }

                    const tbDot = document.getElementById('tb-ai-status-dot');
                    const tbText = document.getElementById('tb-ai-status-text');
                    const tbPause = document.getElementById('tb-admin-pause-ai-btn');
                    const tbSendAsAi = document.getElementById('tb-send-as-ai-container');

                    if (isPaused) {
                        if (statusDot) {
                            statusDot.classList.replace('bg-emerald-500', 'bg-orange-500');
                            statusDot.classList.replace('shadow-[0_0_8px_rgba(16,185,129,0.8)]', 'shadow-[0_0_8px_rgba(249,115,22,0.8)]');
                        }
                        if (statusText) statusText.innerText = 'AI PAUSED';
                        if (pauseBtn) {
                            pauseBtn.innerText = 'RESUME AI';
                            pauseBtn.classList.replace('bg-red-500/20', 'bg-emerald-500/20');
                            pauseBtn.classList.replace('text-red-400', 'text-emerald-400');
                            pauseBtn.classList.replace('hover:bg-red-500/40', 'hover:bg-emerald-500/40');
                        }
                        if (sendAsAiCont) sendAsAiCont.style.display = 'flex';

                        if (tbDot) {
                            tbDot.classList.replace('bg-emerald-500', 'bg-orange-500');
                            tbDot.classList.replace('shadow-[0_0_8px_rgba(16,185,129,0.8)]', 'shadow-[0_0_8px_rgba(249,115,22,0.8)]');
                        }
                        if (tbText) tbText.innerText = 'AI PAUSED';
                        if (tbPause) {
                            tbPause.innerText = 'RESUME AI';
                            tbPause.classList.replace('bg-red-500/10', 'bg-emerald-500/20');
                            tbPause.classList.replace('text-red-500', 'text-emerald-400');
                            tbPause.classList.replace('hover:bg-red-500/20', 'hover:bg-emerald-500/40');
                        }
                        if (tbSendAsAi) tbSendAsAi.style.display = 'flex';

                        if (chatInput) chatInput.placeholder = 'Send manually...';
                    } else {
                        if (statusDot) {
                            statusDot.classList.replace('bg-orange-500', 'bg-emerald-500');
                            statusDot.classList.replace('shadow-[0_0_8px_rgba(249,115,22,0.8)]', 'shadow-[0_0_8px_rgba(16,185,129,0.8)]');
                        }
                        if (statusText) statusText.innerText = 'AI ACTIVE';
                        if (pauseBtn) {
                            pauseBtn.innerText = 'PAUSE AI';
                            pauseBtn.classList.replace('bg-emerald-500/20', 'bg-red-500/20');
                            pauseBtn.classList.replace('text-emerald-400', 'text-red-400');
                            pauseBtn.classList.replace('hover:bg-emerald-500/40', 'hover:bg-red-500/40');
                        }
                        if (sendAsAiCont) sendAsAiCont.style.display = 'none';

                        if (tbDot) {
                            tbDot.classList.replace('bg-orange-500', 'bg-emerald-500');
                            tbDot.classList.replace('shadow-[0_0_8px_rgba(249,115,22,0.8)]', 'shadow-[0_0_8px_rgba(16,185,129,0.8)]');
                        }
                        if (tbText) tbText.innerText = 'AI ACTIVE';
                        if (tbPause) {
                            tbPause.innerText = 'PAUSE AI';
                            tbPause.classList.replace('bg-emerald-500/20', 'bg-red-500/10');
                            tbPause.classList.replace('text-emerald-400', 'text-red-500');
                            tbPause.classList.replace('hover:bg-emerald-500/40', 'hover:bg-red-500/20');
                        }
                        if (tbSendAsAi) tbSendAsAi.style.display = 'none';

                        if (chatInput) chatInput.placeholder = 'Type your message...';
                    }
                });
            }
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initDOM);
    } else {
        initDOM();
    }

    window.openUpgradeModal = window.openUpgradeModal || function() {
        const modal = document.getElementById('upgrade-modal');
        if (modal) {
            modal.classList.remove('hidden');
            setTimeout(() => {
                modal.classList.remove('opacity-0');
                const card = modal.querySelector('.glass-upgrade-card');
                if (card) {
                    card.classList.remove('scale-95');
                    card.classList.add('scale-100');
                }
            }, 10);
        } else {
            window.location.href = '/pricing.html';
        }
    };

    function renderPlanBadge(user) {
        const badge = document.getElementById('compact-plan-badge');
        if (!badge) return;

        badge.classList.remove('hidden');
        const plan = (user && (user.effective_plan || user.plan)) || 'free';
        const isPro = (plan === 'paid' || plan === 'pro');

        const profilePlanName = document.getElementById('profile-plan-name');
        const profileUpgradeBtn = document.getElementById('profile-upgrade-btn');

        if (isPro) {
            badge.className = 'px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider uppercase border-none shadow-sm shrink-0 bg-gradient-to-r from-emerald-400 to-teal-500 text-white shadow-emerald-500/20';
            badge.innerHTML = `PRO ✦`;
            badge.title = 'Kotha Pro Active';
            badge.onclick = (e) => { if (e) e.stopPropagation(); };

            if (profilePlanName) profilePlanName.textContent = 'Kotha Pro ✦ Active';
            if (profileUpgradeBtn) profileUpgradeBtn.classList.add('hidden');
        } else if (plan === 'trial') {
            const remainingMs = (user.trial_expires_at || 0) - Date.now();
            const days = Math.max(0, Math.ceil(remainingMs / (1000 * 60 * 60 * 24)));
            badge.className = 'px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider uppercase border-none shadow-sm shrink-0 cursor-pointer transition hover:scale-105 active:scale-95 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white';
            badge.innerHTML = days > 0 ? `TRIAL · ${days}d left` : `TRIAL`;
            badge.title = 'Click badge to upgrade to Kotha Pro';
            badge.onclick = (e) => {
                if (e) e.stopPropagation();
                window.openUpgradeModal();
            };

            if (profilePlanName) profilePlanName.textContent = days > 0 ? `Free Trial (${days}d remaining)` : `Free Trial (Ending soon)`;
            if (profileUpgradeBtn) profileUpgradeBtn.classList.remove('hidden');
        } else if (plan === 'guest') {
            badge.className = 'px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider uppercase border-none shadow-sm shrink-0 cursor-pointer transition hover:scale-105 active:scale-95 bg-amber-500 hover:bg-amber-600 text-white';
            badge.innerHTML = `GUEST`;
            badge.title = 'Click badge to sign in and upgrade to Pro';
            badge.onclick = (e) => {
                if (e) e.stopPropagation();
                if (window.openAuthModal) window.openAuthModal('Sign in to save your chats and unlock Kotha Pro!');
                else window.openUpgradeModal();
            };

            if (profilePlanName) profilePlanName.textContent = 'Guest Preview Mode';
            if (profileUpgradeBtn) profileUpgradeBtn.classList.remove('hidden');
        } else {
            const isExpired = user && user.plan === 'trial';
            badge.className = isExpired
                ? 'px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider uppercase border-none shadow-sm shrink-0 cursor-pointer transition hover:scale-105 active:scale-95 bg-rose-500 hover:bg-rose-600 text-white'
                : 'px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider uppercase border-none shadow-sm shrink-0 cursor-pointer transition hover:scale-105 active:scale-95 bg-gray-800 hover:bg-gray-700 text-white dark:bg-gray-200 dark:text-gray-900 dark:hover:bg-gray-100';
            badge.innerHTML = isExpired ? `EXPIRED` : `FREE`;
            badge.title = isExpired ? 'Trial expired — Click badge to upgrade to Kotha Pro' : 'Free Plan — Click badge to upgrade to Kotha Pro';
            badge.onclick = (e) => {
                if (e) e.stopPropagation();
                window.openUpgradeModal();
            };

            if (profilePlanName) profilePlanName.textContent = isExpired ? 'Trial Expired' : 'Free Plan';
            if (profileUpgradeBtn) profileUpgradeBtn.classList.remove('hidden');
        }
    }
})();
