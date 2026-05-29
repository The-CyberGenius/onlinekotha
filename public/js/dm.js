// dm.js — User-to-User Direct Messages (socket.io powered)
(function () {
    'use strict';

    // ── Helpers ──────────────────────────────────────────────
    function escH(s) {
        return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }
    function timeAgo(ts) {
        const diff = Date.now() - ts;
        if (diff < 60000) return 'now';
        if (diff < 3600000) return Math.floor(diff/60000) + 'm';
        if (diff < 86400000) return Math.floor(diff/3600000) + 'h';
        return new Date(ts).toLocaleDateString();
    }
    function formatTime(ts) {
        return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    function avatarHtml(user, size = 9) {
        const s = `w-${size} h-${size}`;
        if (user.avatar_url) {
            return `<img src="${escH(user.avatar_url)}" class="${s} rounded-full object-cover shrink-0" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
                    <div class="${s} rounded-full bg-indigo-500 text-white text-xs font-bold flex items-center justify-center shrink-0" style="display:none">${escH((user.display_name||'?').charAt(0).toUpperCase())}</div>`;
        }
        return `<div class="${s} rounded-full bg-indigo-500 text-white text-xs font-bold flex items-center justify-center shrink-0">${escH((user.display_name||'?').charAt(0).toUpperCase())}</div>`;
    }

    // ── State ─────────────────────────────────────────────────
    let socket = null;
    let me = null;          // current user from /api/me
    let activeConvId = null;
    let conversations = []; // cached list
    let typingTimers = {};

    // ── DOM refs ──────────────────────────────────────────────
    const panel     = document.getElementById('dm-panel');
    const convList  = document.getElementById('dm-conv-list');
    const chatArea  = document.getElementById('dm-chat-area');
    const chatMsgs  = document.getElementById('dm-messages');
    const chatInput = document.getElementById('dm-input');
    const chatSend  = document.getElementById('dm-send-btn');
    const chatName  = document.getElementById('dm-chat-name');
    const chatAvatar= document.getElementById('dm-chat-avatar');
    const searchInput = document.getElementById('dm-search-email');
    const searchBtn   = document.getElementById('dm-search-btn');
    const searchResult= document.getElementById('dm-search-result');
    const typingEl  = document.getElementById('dm-typing-indicator');
    const unreadBadge = document.getElementById('dm-unread-badge');
    const dmBackBtn = document.getElementById('dm-back-btn');

    if (!panel) return; // DM panel not in DOM

    // ── Init ─────────────────────────────────────────────────
    async function init() {
        const meRes = await fetch('/api/me');
        const meData = await meRes.json();
        if (!meData.user) return; // not logged in
        me = meData.user;

        connectSocket();
        loadConversations();
    }

    // ── Socket ────────────────────────────────────────────────
    function connectSocket() {
        socket = io({ transports: ['websocket', 'polling'] });

        socket.on('connect', () => console.log('[DM] socket connected'));
        socket.on('connect_error', (e) => console.warn('[DM] socket error', e.message));

        socket.on('dm:message', (msg) => {
            // Update conversation list
            const idx = conversations.findIndex(c => c.conv_id === msg.conv_id);
            if (idx >= 0) {
                conversations[idx].last_msg = msg.body;
                conversations[idx].last_at  = msg.created_at;
                if (msg.conv_id !== activeConvId && msg.sender_id !== me.id) {
                    conversations[idx].unread = (conversations[idx].unread || 0) + 1;
                }
                // Move to top
                const [c] = conversations.splice(idx, 1);
                conversations.unshift(c);
            } else {
                loadConversations(); // new conversation
            }
            renderConvList();

            // If this conv is open, append message
            if (msg.conv_id === activeConvId) {
                appendMessage(msg);
                scrollBottom();
            }
        });

        socket.on('dm:typing', ({ conv_id, user_id, typing }) => {
            if (conv_id !== activeConvId || user_id === me.id) return;
            if (typingEl) typingEl.classList.toggle('hidden', !typing);
        });

        socket.on('user:online',  ({ user_id }) => updateOnlineStatus(user_id, true));
        socket.on('user:offline', ({ user_id }) => updateOnlineStatus(user_id, false));
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
            convList.innerHTML = `<div class="text-xs text-gray-400 text-center py-6 px-3">No chats yet.<br>Search someone by email to start!</div>`;
            return;
        }
        convList.innerHTML = conversations.map(c => `
            <div class="dm-conv-item flex items-center gap-3 px-3 py-3 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition rounded-lg mx-1 ${c.conv_id === activeConvId ? 'bg-gray-100 dark:bg-gray-800' : ''}"
                 data-conv="${c.conv_id}">
                <div class="relative shrink-0">
                    ${avatarHtml(c.other, 10)}
                    <span class="dm-presence-${c.other.id} absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-gray-900 bg-gray-300"></span>
                </div>
                <div class="flex-1 min-w-0">
                    <div class="flex justify-between items-baseline">
                        <span class="text-[13px] font-semibold text-gray-800 dark:text-gray-100 truncate">${escH(c.other.display_name)}</span>
                        <span class="text-[10px] text-gray-400 shrink-0 ml-1">${c.last_at ? timeAgo(c.last_at) : ''}</span>
                    </div>
                    <div class="text-[12px] text-gray-500 dark:text-gray-400 truncate">${escH(c.last_msg || 'Tap to open')}</div>
                </div>
                ${c.unread ? `<span class="bg-indigo-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center shrink-0">${c.unread > 9 ? '9+' : c.unread}</span>` : ''}
            </div>
        `).join('');

        convList.querySelectorAll('.dm-conv-item').forEach(el => {
            el.addEventListener('click', () => openConv(Number(el.dataset.conv)));
        });
    }

    // ── Open a conversation ───────────────────────────────────
    async function openConv(convId) {
        activeConvId = convId;
        const conv = conversations.find(c => c.conv_id === convId);
        if (!conv) return;

        // Reset unread
        conv.unread = 0;
        updateUnreadBadge();
        renderConvList();

        // Show chat area, hide search
        if (chatArea) chatArea.classList.remove('hidden');
        if (searchResult) searchResult.innerHTML = '';
        if (searchInput) searchInput.value = '';

        // Set header
        if (chatName) chatName.textContent = conv.other.display_name;
        if (chatAvatar) chatAvatar.innerHTML = avatarHtml(conv.other, 9);

        // Load messages
        if (chatMsgs) chatMsgs.innerHTML = '<div class="text-xs text-center text-gray-400 py-4">Loading…</div>';
        const res = await fetch(`/api/dm/conversations/${convId}/messages`);
        const msgs = await res.json();

        if (chatMsgs) {
            chatMsgs.innerHTML = '';
            if (msgs.length === 0) {
                chatMsgs.innerHTML = '<div class="text-xs text-center text-gray-400 py-6">Say hello! 👋</div>';
            } else {
                msgs.forEach(m => appendMessage(m));
            }
        }
        scrollBottom();
        if (chatInput) chatInput.focus();
    }

    // ── Append one message bubble ────────────────────────────
    function appendMessage(msg) {
        if (!chatMsgs) return;
        const isMe = msg.sender_id === me.id;
        const name = msg.display_name || msg.email?.split('@')[0] || '?';
        const el = document.createElement('div');
        el.className = `flex ${isMe ? 'justify-end' : 'justify-start'} mb-1.5`;
        el.innerHTML = `
            <div class="max-w-[75%] ${isMe ? 'items-end' : 'items-start'} flex flex-col">
                ${!isMe ? `<span class="text-[10px] text-gray-400 mb-0.5 ml-1">${escH(name)}</span>` : ''}
                <div class="px-3 py-2 rounded-2xl text-[13px] leading-snug break-words
                    ${isMe ? 'bg-indigo-500 text-white rounded-br-sm' : 'bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 shadow-sm rounded-bl-sm border border-gray-100 dark:border-gray-600'}">
                    ${escH(msg.body)}
                </div>
                <span class="text-[10px] text-gray-400 mt-0.5 ${isMe ? 'mr-1' : 'ml-1'}">${formatTime(msg.created_at)}</span>
            </div>
        `;
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

    if (chatSend) chatSend.addEventListener('click', sendMessage);
    if (chatInput) {
        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
        });
        // Typing indicator
        let typingDebounce = null;
        chatInput.addEventListener('input', () => {
            if (!socket || !activeConvId) return;
            socket.emit('dm:typing', { conv_id: activeConvId, typing: true });
            clearTimeout(typingDebounce);
            typingDebounce = setTimeout(() => socket.emit('dm:typing', { conv_id: activeConvId, typing: false }), 1500);
        });
    }

    // ── Email search ──────────────────────────────────────────
    async function doSearch() {
        const email = searchInput?.value.trim();
        if (!email || !searchResult) return;
        searchResult.innerHTML = '<span class="text-xs text-gray-400">Searching…</span>';

        const res = await fetch(`/api/dm/search?email=${encodeURIComponent(email)}`);
        const data = await res.json();

        if (!data.user) {
            searchResult.innerHTML = '<span class="text-xs text-gray-400">No user found with that email.</span>';
            return;
        }
        const u = data.user;
        searchResult.innerHTML = `
            <div class="flex items-center gap-3 bg-gray-50 dark:bg-gray-800 rounded-xl p-3 mt-2">
                ${avatarHtml(u, 10)}
                <div class="flex-1 min-w-0">
                    <div class="text-[13px] font-semibold text-gray-800 dark:text-gray-100">${escH(u.display_name)}</div>
                    <div class="text-[11px] text-gray-400">${escH(u.email)}</div>
                </div>
                <button id="dm-start-btn" class="bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition">Chat</button>
            </div>
        `;
        document.getElementById('dm-start-btn')?.addEventListener('click', async () => {
            const r = await fetch('/api/dm/conversations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: u.id }),
            });
            const d = await r.json();
            if (d.conv_id) {
                // Add to list if not already there
                if (!conversations.find(c => c.conv_id === d.conv_id)) {
                    conversations.unshift({
                        conv_id: d.conv_id,
                        other: d.other,
                        last_msg: '',
                        last_at: 0,
                        unread: 0,
                    });
                }
                renderConvList();
                openConv(d.conv_id);
            }
        });
    }

    if (searchBtn) searchBtn.addEventListener('click', doSearch);
    if (searchInput) searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });

    // ── Online presence ───────────────────────────────────────
    function updateOnlineStatus(userId, online) {
        document.querySelectorAll(`.dm-presence-${userId}`).forEach(el => {
            el.classList.toggle('bg-green-400', online);
            el.classList.toggle('bg-gray-300', !online);
        });
    }

    // ── Unread badge (on DM nav button) ──────────────────────
    function updateUnreadBadge() {
        const total = conversations.reduce((s, c) => s + (c.unread || 0), 0);
        if (unreadBadge) {
            unreadBadge.textContent = total > 9 ? '9+' : total;
            unreadBadge.classList.toggle('hidden', total === 0);
        }
    }

    // ── Back button (mobile compact) ─────────────────────────
    if (dmBackBtn) dmBackBtn.addEventListener('click', () => {
        activeConvId = null;
        if (chatArea) chatArea.classList.add('hidden');
    });

    // ── Start ─────────────────────────────────────────────────
    init();

    // Expose for external use
    window.dmLoadConversations = loadConversations;
    window.dmOpenConv = openConv;
})();
