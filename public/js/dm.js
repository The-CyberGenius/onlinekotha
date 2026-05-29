// dm.js — User-to-User Direct Messages (socket.io powered)
(function () {
    'use strict';

    // ── Helpers ──────────────────────────────────────────────
    function escH(s) {
        return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }
    function timeAgo(ts) {
        if (!ts) return '';
        const diff = Date.now() - ts;
        if (diff < 60000) return 'now';
        if (diff < 3600000) return Math.floor(diff/60000) + 'm ago';
        if (diff < 86400000) return Math.floor(diff/3600000) + 'h ago';
        return new Date(ts).toLocaleDateString();
    }
    function formatTime(ts) {
        return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    function avatarEl(user, sizePx = 40) {
        const name = user.display_name || user.email || '?';
        const initials = name.charAt(0).toUpperCase();
        if (user.avatar_url) {
            return `<img src="${escH(user.avatar_url)}" style="width:${sizePx}px;height:${sizePx}px;border-radius:50%;object-fit:cover;flex-shrink:0" onerror="this.style.display='none';this.nextSibling.style.display='flex'"><div style="width:${sizePx}px;height:${sizePx}px;border-radius:50%;background:#6366f1;color:#fff;font-weight:700;font-size:${Math.floor(sizePx*0.35)}px;display:none;align-items:center;justify-content:center;flex-shrink:0">${escH(initials)}</div>`;
        }
        return `<div style="width:${sizePx}px;height:${sizePx}px;border-radius:50%;background:#6366f1;color:#fff;font-weight:700;font-size:${Math.floor(sizePx*0.35)}px;display:flex;align-items:center;justify-content:center;flex-shrink:0">${escH(initials)}</div>`;
    }

    // ── State ─────────────────────────────────────────────────
    let socket       = null;
    let me           = null;
    let activeConvId = null;
    let conversations = [];

    // ── DOM refs ──────────────────────────────────────────────
    const dmSidebar   = document.getElementById('dm-sidebar-section');
    const convList    = document.getElementById('dm-conv-list');
    const chatArea    = document.getElementById('dm-chat-area');
    const chatMsgs    = document.getElementById('dm-messages');
    const chatInput   = document.getElementById('dm-input');
    const chatSend    = document.getElementById('dm-send-btn');
    const chatName    = document.getElementById('dm-chat-name');
    const chatStatus  = document.getElementById('dm-chat-status');
    const chatAvatar  = document.getElementById('dm-chat-avatar');
    const searchInput = document.getElementById('dm-search-email');
    const searchBtn   = document.getElementById('dm-search-btn');
    const searchResult= document.getElementById('dm-search-result');
    const typingEl    = document.getElementById('dm-typing-indicator');
    const unreadBadge = document.getElementById('dm-unread-badge');
    const dmBackBtn   = document.getElementById('dm-back-btn');
    const dmCloseBtn  = document.getElementById('dm-close-btn');
    const dmNewBtn    = document.getElementById('dm-new-btn');
    const dmNewForm   = document.getElementById('dm-new-form');
    const btnDm       = document.getElementById('btn-dm');

    if (!dmSidebar) return;

    // ── Open / close DM sidebar ───────────────────────────────
    function openDmSidebar() {
        dmSidebar.classList.remove('hidden');
        loadConversations();
    }
    function closeDmSidebar() {
        dmSidebar.classList.add('hidden');
        closeDmChat();
    }

    btnDm?.addEventListener('click', () => {
        if (dmSidebar.classList.contains('hidden')) openDmSidebar();
        else closeDmSidebar();
    });
    dmCloseBtn?.addEventListener('click', closeDmSidebar);

    // + New chat button toggles search form
    dmNewBtn?.addEventListener('click', () => {
        dmNewForm?.classList.toggle('hidden');
        if (!dmNewForm?.classList.contains('hidden')) searchInput?.focus();
    });

    // ── Init ─────────────────────────────────────────────────
    async function init() {
        const res  = await fetch('/api/me');
        const data = await res.json();
        if (!data.user) return;
        me = data.user;
        connectSocket();
    }

    // ── Socket ────────────────────────────────────────────────
    function connectSocket() {
        socket = window.io ? io({ transports: ['websocket', 'polling'] }) : null;
        if (!socket) { console.warn('[DM] socket.io not loaded'); return; }

        socket.on('dm:message', (msg) => {
            // Update conv list preview
            const idx = conversations.findIndex(c => c.conv_id === msg.conv_id);
            if (idx >= 0) {
                conversations[idx].last_msg = msg.body;
                conversations[idx].last_at  = msg.created_at;
                if (msg.conv_id !== activeConvId && msg.sender_id !== me.id) {
                    conversations[idx].unread = (conversations[idx].unread || 0) + 1;
                }
                const [c] = conversations.splice(idx, 1);
                conversations.unshift(c);
            } else {
                loadConversations();
                return;
            }
            renderConvList();
            updateUnreadBadge();

            if (msg.conv_id === activeConvId) {
                appendMessage(msg);
                scrollBottom();
            }
        });

        socket.on('dm:typing', ({ conv_id, user_id, typing }) => {
            if (conv_id !== activeConvId || user_id === me?.id) return;
            if (typingEl) typingEl.classList.toggle('hidden', !typing);
        });

        socket.on('user:online',  ({ user_id }) => setPresence(user_id, true));
        socket.on('user:offline', ({ user_id }) => setPresence(user_id, false));
    }

    // ── Load conversations ────────────────────────────────────
    async function loadConversations() {
        const res = await fetch('/api/dm/conversations');
        if (!res.ok) return;
        conversations = await res.json();
        renderConvList();
        updateUnreadBadge();
    }

    function renderConvList() {
        if (!convList) return;
        if (conversations.length === 0) {
            convList.innerHTML = `<p style="text-align:center;color:#9ca3af;font-size:12px;padding:32px 16px">No messages yet.<br>Tap <b>+</b> to start chatting.</p>`;
            return;
        }
        convList.innerHTML = conversations.map(c => `
            <div class="dm-conv-item" data-conv="${c.conv_id}"
                style="display:flex;align-items:center;gap:12px;padding:10px 12px;cursor:pointer;border-radius:12px;margin:2px 6px;transition:background 0.15s;${c.conv_id === activeConvId ? 'background:#f3f4f6' : ''}">
                <div style="position:relative;flex-shrink:0">
                    ${avatarEl(c.other, 44)}
                    <span class="dm-dot-${c.other.id}" style="position:absolute;bottom:1px;right:1px;width:10px;height:10px;border-radius:50%;background:#d1d5db;border:2px solid #fff"></span>
                </div>
                <div style="flex:1;min-width:0">
                    <div style="display:flex;justify-content:space-between;align-items:baseline">
                        <span style="font-size:13px;font-weight:600;color:#1f2937;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:160px">${escH(c.other.display_name)}</span>
                        <span style="font-size:10px;color:#9ca3af;flex-shrink:0;margin-left:6px">${timeAgo(c.last_at)}</span>
                    </div>
                    <div style="font-size:12px;color:#6b7280;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escH(c.last_msg || 'Tap to open')}</div>
                </div>
                ${c.unread ? `<span style="background:#6366f1;color:#fff;font-size:9px;font-weight:700;border-radius:99px;min-width:18px;height:18px;display:flex;align-items:center;justify-content:center;padding:0 4px;flex-shrink:0">${c.unread > 9 ? '9+' : c.unread}</span>` : ''}
            </div>
        `).join('');

        // hover styles via JS (Tailwind not guaranteed for dynamic)
        convList.querySelectorAll('.dm-conv-item').forEach(el => {
            el.addEventListener('mouseenter', () => { if (Number(el.dataset.conv) !== activeConvId) el.style.background = '#f9fafb'; });
            el.addEventListener('mouseleave', () => { if (Number(el.dataset.conv) !== activeConvId) el.style.background = ''; });
            el.addEventListener('click', () => openConv(Number(el.dataset.conv)));
        });
    }

    // ── Open conversation ─────────────────────────────────────
    async function openConv(convId) {
        activeConvId = convId;
        const conv = conversations.find(c => c.conv_id === convId);
        if (!conv) return;

        conv.unread = 0;
        updateUnreadBadge();
        renderConvList();

        // Show chat area (overlays main panel)
        if (chatArea) chatArea.classList.remove('hidden');
        if (dmNewForm) dmNewForm.classList.add('hidden');
        if (searchResult) searchResult.innerHTML = '';
        if (searchInput) searchInput.value = '';

        // Set header
        if (chatName) chatName.textContent = conv.other.display_name;
        if (chatAvatar) chatAvatar.innerHTML = avatarEl(conv.other, 38);
        if (chatStatus) chatStatus.textContent = '';

        // Load messages
        if (chatMsgs) chatMsgs.innerHTML = '<div style="text-align:center;color:#9ca3af;font-size:12px;padding:20px">Loading…</div>';
        const res  = await fetch(`/api/dm/conversations/${convId}/messages`);
        const msgs = await res.json();

        if (chatMsgs) {
            chatMsgs.innerHTML = '';
            if (msgs.length === 0) {
                chatMsgs.innerHTML = '<div style="text-align:center;color:#9ca3af;font-size:12px;padding:32px 16px">Say hello! 👋</div>';
            } else {
                msgs.forEach(m => appendMessage(m));
            }
        }
        scrollBottom();
        if (chatInput) chatInput.focus();
    }

    function closeDmChat() {
        activeConvId = null;
        if (chatArea) chatArea.classList.add('hidden');
    }

    // ── Append message bubble ─────────────────────────────────
    function appendMessage(msg) {
        if (!chatMsgs) return;
        const isMe = msg.sender_id === me?.id;
        const el   = document.createElement('div');
        el.style.cssText = `display:flex;justify-content:${isMe ? 'flex-end' : 'flex-start'};margin-bottom:2px`;
        el.innerHTML = `
            <div style="max-width:72%;display:flex;flex-direction:column;align-items:${isMe ? 'flex-end' : 'flex-start'}">
                <div style="padding:8px 12px;border-radius:${isMe ? '18px 18px 4px 18px' : '18px 18px 18px 4px'};font-size:13px;line-height:1.4;word-break:break-word;
                    ${isMe ? 'background:#6366f1;color:#fff' : 'background:#fff;color:#1f2937;border:1px solid #e5e7eb;box-shadow:0 1px 2px rgba(0,0,0,0.06)'}">
                    ${escH(msg.body)}
                </div>
                <span style="font-size:10px;color:#9ca3af;margin-top:2px;${isMe ? 'margin-right:4px' : 'margin-left:4px'}">${formatTime(msg.created_at)}</span>
            </div>`;
        chatMsgs.appendChild(el);
    }

    function scrollBottom() {
        if (chatMsgs) chatMsgs.scrollTop = chatMsgs.scrollHeight;
    }

    // ── Send message ──────────────────────────────────────────
    function sendMessage() {
        const body = chatInput?.value.trim();
        if (!body || !activeConvId || !socket) return;
        socket.emit('dm:send', { conv_id: activeConvId, body });
        chatInput.value = '';
        chatInput.focus();
    }

    chatSend?.addEventListener('click', sendMessage);
    chatInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });

    // Typing indicator emit
    let typingDebounce = null;
    chatInput?.addEventListener('input', () => {
        if (!socket || !activeConvId) return;
        socket.emit('dm:typing', { conv_id: activeConvId, typing: true });
        clearTimeout(typingDebounce);
        typingDebounce = setTimeout(() => socket?.emit('dm:typing', { conv_id: activeConvId, typing: false }), 1500);
    });

    // Back button
    dmBackBtn?.addEventListener('click', closeDmChat);

    // ── Email search ──────────────────────────────────────────
    async function doSearch() {
        const email = searchInput?.value.trim();
        if (!email || !searchResult) return;
        searchResult.innerHTML = '<span style="font-size:11px;color:#9ca3af">Searching…</span>';

        const res  = await fetch(`/api/dm/search?email=${encodeURIComponent(email)}`);
        const data = await res.json();

        if (!data.user) {
            searchResult.innerHTML = '<span style="font-size:11px;color:#9ca3af">No user found with that email.</span>';
            return;
        }
        const u = data.user;
        const div = document.createElement('div');
        div.style.cssText = 'display:flex;align-items:center;gap:10px;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:10px;margin-top:6px';
        div.innerHTML = `
            ${avatarEl(u, 36)}
            <div style="flex:1;min-width:0">
                <div style="font-size:13px;font-weight:600;color:#1f2937">${escH(u.display_name)}</div>
                <div style="font-size:11px;color:#6b7280">${escH(u.email)}</div>
            </div>
            <button id="dm-start-btn" style="background:#6366f1;color:#fff;font-size:11px;font-weight:700;padding:6px 12px;border-radius:8px;border:none;cursor:pointer;white-space:nowrap">Start Chat</button>`;
        searchResult.innerHTML = '';
        searchResult.appendChild(div);

        div.querySelector('#dm-start-btn')?.addEventListener('click', async () => {
            const r = await fetch('/api/dm/conversations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: u.id }),
            });
            const d = await r.json();
            if (d.conv_id) {
                if (!conversations.find(c => c.conv_id === d.conv_id)) {
                    conversations.unshift({ conv_id: d.conv_id, other: d.other, last_msg: '', last_at: 0, unread: 0 });
                }
                dmNewForm?.classList.add('hidden');
                searchResult.innerHTML = '';
                searchInput.value = '';
                renderConvList();
                openConv(d.conv_id);
            }
        });
    }

    searchBtn?.addEventListener('click', doSearch);
    searchInput?.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });

    // ── Presence dots ─────────────────────────────────────────
    function setPresence(userId, online) {
        document.querySelectorAll(`.dm-dot-${userId}`).forEach(el => {
            el.style.background = online ? '#22c55e' : '#d1d5db';
        });
        if (activeConvId) {
            const conv = conversations.find(c => c.conv_id === activeConvId);
            if (conv?.other.id === userId && chatStatus) {
                chatStatus.textContent = online ? 'online' : '';
            }
        }
    }

    // ── Unread badge on DM icon ───────────────────────────────
    function updateUnreadBadge() {
        const total = conversations.reduce((s, c) => s + (c.unread || 0), 0);
        if (unreadBadge) {
            unreadBadge.textContent = total > 9 ? '9+' : total;
            unreadBadge.classList.toggle('hidden', total === 0);
        }
    }

    // ── Start ─────────────────────────────────────────────────
    init();

    window.dmOpenConv = openConv;
    window.dmLoadConversations = loadConversations;
})();
