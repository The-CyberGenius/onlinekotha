// dm.js — Direct Messages (tab-based, inside sidebar)
(function () {
    'use strict';

    // ── Helpers ───────────────────────────────────────────────
    function esc(s) {
        return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }
    function timeAgo(ts) {
        if (!ts) return '';
        const d = Date.now() - ts;
        if (d < 60000)   return 'now';
        if (d < 3600000) return Math.floor(d/60000) + 'm';
        if (d < 86400000)return Math.floor(d/3600000) + 'h';
        return new Date(ts).toLocaleDateString('en-IN');
    }
    function fmtTime(ts) {
        return new Date(ts).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
    }
    function avatar(user, px) {
        const name = user.display_name || user.email || '?';
        const init = name.charAt(0).toUpperCase();
        const style = `width:${px}px;height:${px}px;border-radius:50%;flex-shrink:0;`;
        if (user.avatar_url) {
            return `<img src="${esc(user.avatar_url)}" style="${style}object-fit:cover" onerror="this.style.display='none';this.nextSibling.style.display='flex'">
                    <div style="${style}background:#6366f1;color:#fff;font-weight:700;font-size:${Math.floor(px*.36)}px;display:none;align-items:center;justify-content:center">${esc(init)}</div>`;
        }
        return `<div style="${style}background:#6366f1;color:#fff;font-weight:700;font-size:${Math.floor(px*.36)}px;display:flex;align-items:center;justify-content:center">${esc(init)}</div>`;
    }

    // ── State ─────────────────────────────────────────────────
    let me = null, socket = null, activeConvId = null;
    let convs = [];

    // ── DOM ───────────────────────────────────────────────────
    const tabChatsBtn  = document.getElementById('tab-chats-btn');
    const tabDmBtn     = document.getElementById('tab-dm-btn');
    const chatsTab     = document.getElementById('sidebar-chats-tab');
    const dmTab        = document.getElementById('sidebar-dm-tab');
    const convList     = document.getElementById('dm-conv-list');
    const searchInput  = document.getElementById('dm-search-email');
    const searchBtn    = document.getElementById('dm-search-btn');
    const searchResult = document.getElementById('dm-search-result');
    const newMsgBtn    = document.getElementById('dm-new-btn');
    const unreadBadge  = document.getElementById('dm-unread-badge');
    const chatArea     = document.getElementById('dm-chat-area');
    const chatMsgs     = document.getElementById('dm-messages');
    const chatInput    = document.getElementById('dm-input');
    const chatSend     = document.getElementById('dm-send-btn');
    const chatName     = document.getElementById('dm-chat-name');
    const chatStatus   = document.getElementById('dm-chat-status');
    const chatAvatar   = document.getElementById('dm-chat-avatar');
    const backBtn      = document.getElementById('dm-back-btn');
    const typingEl     = document.getElementById('dm-typing-indicator');

    if (!tabDmBtn) return;

    // ── Tab switching ─────────────────────────────────────────
    function showChatsTab() {
        chatsTab?.classList.remove('hidden');
        dmTab?.classList.add('hidden');
        tabChatsBtn?.classList.remove('text-gray-500','dark:text-gray-400','hover:bg-gray-100','dark:hover:bg-gray-800');
        tabChatsBtn?.classList.add('bg-indigo-600','text-white','shadow-sm');
        tabDmBtn?.classList.remove('bg-indigo-600','text-white','shadow-sm');
        tabDmBtn?.classList.add('text-gray-500','dark:text-gray-400');
    }
    function showDmTab() {
        chatsTab?.classList.add('hidden');
        dmTab?.classList.remove('hidden');
        tabDmBtn?.classList.remove('text-gray-500','dark:text-gray-400');
        tabDmBtn?.classList.add('bg-indigo-600','text-white','shadow-sm');
        tabChatsBtn?.classList.remove('bg-indigo-600','text-white','shadow-sm');
        tabChatsBtn?.classList.add('text-gray-500','dark:text-gray-400');
        loadConvs();
    }

    tabChatsBtn?.addEventListener('click', showChatsTab);
    tabDmBtn?.addEventListener('click', showDmTab);

    // ── New message: toggle search ────────────────────────────
    newMsgBtn?.addEventListener('click', () => {
        if (searchInput) {
            searchInput.parentElement?.parentElement?.classList.toggle('hidden');
            searchInput.focus();
        }
    });

    // ── Init ─────────────────────────────────────────────────
    async function init() {
        const r = await fetch('/api/me');
        const d = await r.json();
        if (!d.user) return;
        me = d.user;
        connectSocket();
    }

    // ── Socket ────────────────────────────────────────────────
    function connectSocket() {
        if (!window.io) { console.warn('[DM] socket.io not available'); return; }
        socket = io({ transports: ['websocket','polling'] });

        socket.on('dm:message', msg => {
            const idx = convs.findIndex(c => c.conv_id === msg.conv_id);
            if (idx >= 0) {
                convs[idx].last_msg = msg.body;
                convs[idx].last_at  = msg.created_at;
                if (msg.conv_id !== activeConvId && msg.sender_id !== me?.id)
                    convs[idx].unread = (convs[idx].unread||0) + 1;
                convs.unshift(...convs.splice(idx,1));
            } else { loadConvs(); return; }
            renderConvs();
            updateBadge();
            if (msg.conv_id === activeConvId) { appendMsg(msg); scrollBottom(); }
        });

        socket.on('dm:typing', ({conv_id, user_id, typing}) => {
            if (conv_id !== activeConvId || user_id === me?.id) return;
            typingEl?.classList.toggle('hidden', !typing);
        });

        socket.on('user:online',  ({user_id}) => setDot(user_id, true));
        socket.on('user:offline', ({user_id}) => setDot(user_id, false));
    }

    // ── Load conversations ────────────────────────────────────
    async function loadConvs() {
        const r = await fetch('/api/dm/conversations');
        if (!r.ok) return;
        convs = await r.json();
        renderConvs();
        updateBadge();
    }

    function renderConvs() {
        if (!convList) return;
        if (!convs.length) {
            convList.innerHTML = `
                <div style="text-align:center;padding:32px 16px">
                    <div style="font-size:32px;margin-bottom:12px">💬</div>
                    <div style="font-size:13px;font-weight:600;color:#374151;margin-bottom:4px">No messages yet</div>
                    <div style="font-size:11px;color:#9ca3af">Search someone's email above to start chatting</div>
                </div>`;
            return;
        }
        convList.innerHTML = convs.map(c => `
            <div class="dm-row" data-id="${c.conv_id}" style="display:flex;align-items:center;gap:10px;padding:10px 12px;cursor:pointer;border-radius:12px;margin:2px 6px;transition:background .15s;${c.conv_id===activeConvId?'background:rgba(99,102,241,.08)':''}">
                <div style="position:relative;flex-shrink:0">
                    ${avatar(c.other, 44)}
                    <span class="dm-dot-${c.other.id}" style="position:absolute;bottom:0;right:0;width:11px;height:11px;border-radius:50%;background:#d1d5db;border:2px solid #fff"></span>
                </div>
                <div style="flex:1;min-width:0">
                    <div style="display:flex;justify-content:space-between;gap:4px;align-items:baseline">
                        <span style="font-size:13px;font-weight:600;color:#111827;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(c.other.display_name)}</span>
                        <span style="font-size:10px;color:#9ca3af;flex-shrink:0">${timeAgo(c.last_at)}</span>
                    </div>
                    <div style="font-size:12px;color:#6b7280;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(c.last_msg||'Tap to open')}</div>
                </div>
                ${c.unread?`<span style="background:#ef4444;color:#fff;font-size:9px;font-weight:800;border-radius:99px;min-width:18px;height:18px;display:flex;align-items:center;justify-content:center;padding:0 4px;flex-shrink:0">${c.unread>9?'9+':c.unread}</span>`:''}
            </div>`).join('');

        convList.querySelectorAll('.dm-row').forEach(el => {
            el.addEventListener('mouseenter', ()=>{ if(+el.dataset.id!==activeConvId) el.style.background='rgba(99,102,241,.06)'; });
            el.addEventListener('mouseleave', ()=>{ if(+el.dataset.id!==activeConvId) el.style.background=''; });
            el.addEventListener('click', ()=> openConv(+el.dataset.id));
        });
    }

    // ── Open conversation ─────────────────────────────────────
    async function openConv(convId) {
        activeConvId = convId;
        const c = convs.find(x => x.conv_id === convId);
        if (!c) return;
        c.unread = 0;
        updateBadge();
        renderConvs();

        if (chatArea)   chatArea.style.display = 'flex';
        if (chatName)   chatName.textContent = c.other.display_name;
        if (chatAvatar) chatAvatar.innerHTML = avatar(c.other, 38);
        if (chatStatus) chatStatus.textContent = '';
        if (chatMsgs)   chatMsgs.innerHTML = '<div style="text-align:center;color:#9ca3af;font-size:12px;padding:24px">Loading…</div>';

        const r = await fetch(`/api/dm/conversations/${convId}/messages`);
        const msgs = await r.json();
        if (chatMsgs) {
            chatMsgs.innerHTML = '';
            if (!msgs.length) chatMsgs.innerHTML = '<div style="text-align:center;color:#9ca3af;font-size:12px;padding:32px 16px">Send a message to start! 👋</div>';
            else msgs.forEach(appendMsg);
        }
        scrollBottom();
        chatInput?.focus();
    }

    function closeConv() {
        activeConvId = null;
        if (chatArea) chatArea.style.display = 'none';
    }

    // ── Message bubble ────────────────────────────────────────
    function appendMsg(msg) {
        if (!chatMsgs) return;
        const isMe = msg.sender_id === me?.id;
        const el = document.createElement('div');
        el.style.cssText = `display:flex;justify-content:${isMe?'flex-end':'flex-start'};margin-bottom:3px`;
        el.innerHTML = `
            <div style="max-width:74%;display:flex;flex-direction:column;align-items:${isMe?'flex-end':'flex-start'}">
                <div style="padding:9px 13px;border-radius:${isMe?'18px 18px 4px 18px':'18px 18px 18px 4px'};font-size:13px;line-height:1.45;word-break:break-word;
                    ${isMe?'background:#6366f1;color:#fff':'background:#fff;color:#111827;border:1px solid #e5e7eb;box-shadow:0 1px 2px rgba(0,0,0,.05)'}">
                    ${esc(msg.body)}
                </div>
                <span style="font-size:10px;color:#9ca3af;margin-top:2px;${isMe?'margin-right:3px':'margin-left:3px'}">${fmtTime(msg.created_at)}</span>
            </div>`;
        chatMsgs.appendChild(el);
    }

    function scrollBottom() { if(chatMsgs) chatMsgs.scrollTop = chatMsgs.scrollHeight; }

    // ── Send ──────────────────────────────────────────────────
    function send() {
        const body = chatInput?.value.trim();
        if (!body || !activeConvId || !socket) return;
        socket.emit('dm:send', {conv_id:activeConvId, body});
        chatInput.value = '';
        chatInput.focus();
    }

    chatSend?.addEventListener('click', send);
    chatInput?.addEventListener('keydown', e => { if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send();} });

    let typingTimer;
    chatInput?.addEventListener('input', () => {
        if(!socket||!activeConvId) return;
        socket.emit('dm:typing',{conv_id:activeConvId,typing:true});
        clearTimeout(typingTimer);
        typingTimer = setTimeout(()=>socket.emit('dm:typing',{conv_id:activeConvId,typing:false}),1500);
    });

    backBtn?.addEventListener('click', closeConv);

    // ── Email search ──────────────────────────────────────────
    async function doSearch() {
        const email = searchInput?.value.trim();
        if (!email) return;
        if (searchResult) searchResult.innerHTML = '<span style="font-size:11px;color:#9ca3af">Searching…</span>';
        const r = await fetch(`/api/dm/search?email=${encodeURIComponent(email)}`);
        const d = await r.json();
        if (!d.user) {
            if(searchResult) searchResult.innerHTML = '<span style="font-size:11px;color:#9ca3af">No user found.</span>';
            return;
        }
        const u = d.user;
        const div = document.createElement('div');
        div.style.cssText = 'display:flex;align-items:center;gap:10px;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:10px;margin-top:6px';
        div.innerHTML = `${avatar(u,36)}<div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:600;color:#111827">${esc(u.display_name)}</div><div style="font-size:11px;color:#6b7280">${esc(u.email)}</div></div>
            <button id="dm-start" style="background:#6366f1;color:#fff;font-size:11px;font-weight:700;padding:6px 12px;border-radius:8px;border:none;cursor:pointer">Chat</button>`;
        if(searchResult){searchResult.innerHTML='';searchResult.appendChild(div);}
        div.querySelector('#dm-start')?.addEventListener('click', async () => {
            const res = await fetch('/api/dm/conversations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({user_id:u.id})});
            const data = await res.json();
            if(data.conv_id){
                if(!convs.find(c=>c.conv_id===data.conv_id)) convs.unshift({conv_id:data.conv_id,other:data.other,last_msg:'',last_at:0,unread:0});
                if(searchResult) searchResult.innerHTML='';
                if(searchInput) searchInput.value='';
                renderConvs();
                openConv(data.conv_id);
            }
        });
    }

    searchBtn?.addEventListener('click', doSearch);
    searchInput?.addEventListener('keydown', e=>{ if(e.key==='Enter') doSearch(); });

    // ── Presence ──────────────────────────────────────────────
    function setDot(uid, online) {
        document.querySelectorAll(`.dm-dot-${uid}`).forEach(el => {
            el.style.background = online ? '#22c55e' : '#d1d5db';
        });
        if(chatStatus && activeConvId) {
            const c = convs.find(x=>x.conv_id===activeConvId);
            if(c?.other.id===uid) chatStatus.textContent = online ? 'online' : '';
        }
    }

    // ── Unread badge ──────────────────────────────────────────
    function updateBadge() {
        const n = convs.reduce((s,c)=>s+(c.unread||0),0);
        if(unreadBadge){ unreadBadge.textContent=n>9?'9+':n; unreadBadge.classList.toggle('hidden',n===0); }
    }

    // ── DM button in chat header → switch to Messages tab ────
    document.getElementById('btn-dm')?.addEventListener('click', () => {
        // Open sidebar on mobile first
        if (window.kothaSidebarOpen) window.kothaSidebarOpen();
        showDmTab();
    });

    // ── Empty state button ────────────────────────────────────
    document.getElementById('empty-dm-btn')?.addEventListener('click', () => {
        if (window.kothaSidebarOpen) window.kothaSidebarOpen();
        showDmTab();
    });

    init();
    window.dmShowTab = showDmTab;
    window.dmOpenConv = openConv;
})();
