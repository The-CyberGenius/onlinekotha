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
        const banner  = document.getElementById('plan-banner');
        const badge   = document.getElementById('plan-badge');
        const text    = document.getElementById('plan-text');
        const upgrade = document.getElementById('upgrade-btn');
        if (!banner || !badge || !text) return;

        banner.classList.remove('hidden');
        const plan = user.effective_plan;

        if (plan === 'trial') {
            const remainingMs = user.trial_expires_at - Date.now();
            const hours = Math.max(0, Math.floor(remainingMs / 3600000));
            const mins  = Math.max(0, Math.floor((remainingMs % 3600000) / 60000));
            badge.className = 'rounded-xl px-3 py-2 text-xs font-bold flex items-center justify-between gap-2 bg-gradient-to-r from-indigo-100 to-purple-100 text-indigo-800 border border-indigo-200';
            text.innerHTML  = `🎁 Trial: <b>${hours}h ${mins}m</b> · Unlimited AI`;
            if (upgrade) { upgrade.classList.remove('hidden'); upgrade.textContent = 'Upgrade ₹99/mo'; }
        } else if (plan === 'paid') {
            badge.className = 'rounded-xl px-3 py-2 text-xs font-bold flex items-center justify-between gap-2 bg-green-100 text-green-800 border border-green-200';
            text.innerHTML  = `✓ Pro plan · Unlimited AI`;
            if (upgrade) upgrade.classList.add('hidden');
        } else {
            badge.className = 'rounded-xl px-3 py-2 text-xs font-bold flex items-center justify-between gap-2 bg-gray-100 text-gray-700 border border-gray-200';
            text.innerHTML  = `Free tier · 3 AI chats/day`;
            if (upgrade) { upgrade.classList.remove('hidden'); upgrade.textContent = 'Upgrade ₹99/mo'; }
        }

        // ── Razorpay upgrade flow ─────────────────────────────────────────
        if (upgrade && !upgrade._rzpBound) {
            upgrade._rzpBound = true;
            upgrade.addEventListener('click', async () => {
                upgrade.disabled = true;
                upgrade.textContent = 'Loading...';

                try {
                    // 1. Fetch key_id + plan info
                    const plansRes = await fetch('/api/billing/plans');
                    const plansData = await plansRes.json();

                    if (!plansData.available || !plansData.key_id) {
                        alert('Payment gateway not configured yet. Please check back soon!');
                        return;
                    }

                    const selectedPlan = plansData.plans[0]; // pro_monthly

                    // 2. Create Razorpay order on backend
                    const orderRes = await fetch('/api/billing/create-order', {
                        method: 'POST',
                        headers: { 'content-type': 'application/json' },
                        body: JSON.stringify({ plan: selectedPlan.id }),
                    });
                    if (!orderRes.ok) {
                        const err = await orderRes.json();
                        throw new Error(err.error || 'Failed to create order');
                    }
                    const { order_id, amount, currency } = await orderRes.json();

                    // 3. Open Razorpay modal
                    const options = {
                        key:         plansData.key_id,
                        amount,
                        currency,
                        name:        'Kotha',
                        description: selectedPlan.description,
                        order_id,
                        prefill: {
                            email: user.email,
                            name:  user.display_name || user.email,
                        },
                        theme: { color: '#6366f1' },
                        modal: {
                            ondismiss: () => {
                                upgrade.disabled    = false;
                                upgrade.textContent = 'Upgrade ₹99/mo';
                            },
                        },
                        handler: async (response) => {
                            // 4. Verify signature on backend
                            try {
                                const verifyRes = await fetch('/api/billing/verify-payment', {
                                    method: 'POST',
                                    headers: { 'content-type': 'application/json' },
                                    body: JSON.stringify({
                                        razorpay_order_id:   response.razorpay_order_id,
                                        razorpay_payment_id: response.razorpay_payment_id,
                                        razorpay_signature:  response.razorpay_signature,
                                        plan: selectedPlan.id,
                                    }),
                                });
                                const result = await verifyRes.json();
                                if (result.ok) {
                                    // 5. Update UI — no page reload needed
                                    badge.className = 'rounded-xl px-3 py-2 text-xs font-bold flex items-center justify-between gap-2 bg-green-100 text-green-800 border border-green-200';
                                    text.innerHTML  = `✓ Pro plan · Unlimited AI`;
                                    upgrade.classList.add('hidden');
                                    if (window.__USER__) window.__USER__.effective_plan = 'paid';
                                    // Toast if available
                                    if (window.kothaToast) window.kothaToast('🎉 Pro unlocked! Unlimited AI chats activated.');
                                    else alert('🎉 Payment successful! Pro plan activated.');
                                } else {
                                    throw new Error(result.error || 'Verification failed');
                                }
                            } catch (err) {
                                console.error('Payment verify error:', err);
                                alert('Payment received but verification failed. Please contact support with your payment ID: ' + response.razorpay_payment_id);
                                upgrade.disabled    = false;
                                upgrade.textContent = 'Upgrade ₹99/mo';
                            }
                        },
                    };

                    const rzp = new window.Razorpay(options);
                    rzp.on('payment.failed', (response) => {
                        console.error('Payment failed:', response.error);
                        alert(`Payment failed: ${response.error.description}`);
                        upgrade.disabled    = false;
                        upgrade.textContent = 'Upgrade ₹99/mo';
                    });
                    rzp.open();

                } catch (err) {
                    console.error('Checkout error:', err);
                    alert(err.message || 'Something went wrong. Please try again.');
                    upgrade.disabled    = false;
                    upgrade.textContent = 'Upgrade ₹99/mo';
                }
            });
        }
    }
})();
