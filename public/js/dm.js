// dm.js — Direct Messages
(function () {
    'use strict';

    // ── Helpers ───────────────────────────────────────────────
    function esc(s) {
        return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }
    function dk() { return document.documentElement.classList.contains('dark'); }
    function timeAgo(ts) {
        if (!ts) return '';
        const d = Date.now() - ts;
        if (d < 60000)    return 'just now';
        if (d < 3600000)  return Math.floor(d/60000) + 'm ago';
        if (d < 86400000) return Math.floor(d/3600000) + 'h ago';
        return new Date(ts).toLocaleDateString('en-IN', {day:'numeric',month:'short'});
    }
    function fmtTime(ts) {
        return new Date(ts).toLocaleTimeString('en-IN', {hour:'2-digit', minute:'2-digit', hour12:true});
    }
    function avatar(user, px) {
        const name = user.display_name || user.email || '?';
        const init = name.charAt(0).toUpperCase();
        const s = `width:${px}px;height:${px}px;border-radius:50%;flex-shrink:0;`;
        if (user.avatar_url) {
            return `<img src="${esc(user.avatar_url)}" style="${s}object-fit:cover" onerror="this.style.display='none';this.nextSibling.style.display='flex'">
                    <div style="${s}background:#6366f1;color:#fff;font-weight:700;font-size:${Math.floor(px*.36)}px;display:none;align-items:center;justify-content:center">${esc(init)}</div>`;
        }
        return `<div style="${s}background:#6366f1;color:#fff;font-weight:700;font-size:${Math.floor(px*.36)}px;display:flex;align-items:center;justify-content:center">${esc(init)}</div>`;
    }

    // ── State ─────────────────────────────────────────────────
    let me = null, socket = null, activeConvId = null;
    let convs = [];
    let contextMenu = null;

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
        tabChatsBtn?.classList.remove('text-gray-500','dark:text-gray-400');
        tabChatsBtn?.classList.add('bg-indigo-600','text-white','shadow-sm');
        tabDmBtn?.classList.remove('bg-indigo-600','text-white','shadow-sm');
        tabDmBtn?.classList.add('text-gray-500','dark:text-gray-400');
        // Hide DM chat overlay so imported chats are visible again
        if (chatArea) chatArea.style.display = 'none';
        activeConvId = null;
        closeCtxMenu();
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
    newMsgBtn?.addEventListener('click', () => {
        const box = searchInput?.closest('.dm-search-box');
        box?.classList.toggle('hidden');
        searchInput?.focus();
    });

    // ── Init ─────────────────────────────────────────────────
    async function init() {
        // Use existing window.__USER__ (set by auth-init.js) — no extra fetch needed
        if (window.__USER__) {
            me = window.__USER__;
            me.id = Number(me.id);
        } else {
            // Fallback: fetch if __USER__ not ready yet
            const r = await fetch('/api/me');
            const d = await r.json();
            if (!d.user) return;
            me = d.user;
            me.id = Number(me.id);
        }
        connectSocket();
        startPolling(); // Fallback if socket doesn't connect
    }

    // ── Socket ────────────────────────────────────────────────
    function connectSocket() {
        if (!window.io) return;
        socket = io({ transports: ['websocket','polling'] });

        socket.on('dm:message', msg => {
            msg.sender_id = Number(msg.sender_id);
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

        socket.on('dm:deleted', ({msg_id, conv_id}) => {
            if (conv_id === activeConvId) {
                const el = document.getElementById(`dm-msg-${msg_id}`);
                if (el) {
                    const bubble = el.querySelector('.dm-bubble');
                    if (bubble) {
                        bubble.style.fontStyle = 'italic';
                        bubble.style.opacity   = '0.6';
                        bubble.textContent     = 'This message was deleted';
                    }
                }
            }
        });

        socket.on('dm:typing', ({conv_id, user_id, typing}) => {
            if (conv_id !== activeConvId || Number(user_id) === me?.id) return;
            if (typingEl) typingEl.style.display = typing ? 'block' : 'none';
        });

        socket.on('user:online',  ({user_id}) => setDot(Number(user_id), true));
        socket.on('user:offline', ({user_id}) => setDot(Number(user_id), false));
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
        const dark = dk();
        if (!convs.length) {
            convList.innerHTML = `
                <div style="text-align:center;padding:48px 16px">
                    <div style="font-size:38px;margin-bottom:14px">💬</div>
                    <div style="font-size:14px;font-weight:700;color:${dark?'#e5e7eb':'#111827'};margin-bottom:6px">No messages yet</div>
                    <div style="font-size:12px;color:${dark?'#6b7280':'#9ca3af'}">Search by email above to start chatting</div>
                </div>`;
            return;
        }
        const bg     = dark ? '#111b21' : '#fff';
        const hover  = dark ? 'rgba(134,150,160,.1)' : 'rgba(99,102,241,.06)';
        const active = dark ? 'rgba(99,102,241,.18)' : 'rgba(99,102,241,.09)';
        convList.innerHTML = convs.map(c => `
            <div class="dm-row" data-id="${c.conv_id}"
                style="display:flex;align-items:center;gap:12px;padding:11px 14px;cursor:pointer;border-radius:14px;margin:2px 8px;transition:background .15s;${c.conv_id===activeConvId?`background:${active}`:''}">
                <div style="position:relative;flex-shrink:0">
                    ${avatar(c.other, 46)}
                    <span class="dm-dot-${c.other.id}" style="position:absolute;bottom:1px;right:1px;width:11px;height:11px;border-radius:50%;background:#d1d5db;border:2px solid ${dark?'#111b21':'#fff'}"></span>
                </div>
                <div style="flex:1;min-width:0">
                    <div style="display:flex;justify-content:space-between;gap:4px;align-items:baseline;margin-bottom:2px">
                        <span style="font-size:13.5px;font-weight:600;color:${dark?'#e9edef':'#111827'};overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(c.other.display_name)}</span>
                        <span style="font-size:10px;color:${dark?'#8696a0':'#aab8c2'};flex-shrink:0">${timeAgo(c.last_at)}</span>
                    </div>
                    <div style="font-size:12px;color:${dark?'#8696a0':'#6b7280'};overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(c.last_msg||'Tap to open')}</div>
                </div>
                ${c.unread?`<span style="background:#6366f1;color:#fff;font-size:9px;font-weight:800;border-radius:99px;min-width:18px;height:18px;display:flex;align-items:center;justify-content:center;padding:0 4px;flex-shrink:0">${c.unread>9?'9+':c.unread}</span>`:''}
            </div>`).join('');

        convList.querySelectorAll('.dm-row').forEach(el => {
            el.addEventListener('mouseenter', () => { if(+el.dataset.id!==activeConvId) el.style.background=hover; });
            el.addEventListener('mouseleave', () => { if(+el.dataset.id!==activeConvId) el.style.background=''; });
            el.addEventListener('click', () => openConv(+el.dataset.id));
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

        // On mobile / compact mode → close sidebar so chat takes full screen
        if (window.innerWidth < 768 || window.kothaCompact) {
            if (window.kothaSidebarClose) window.kothaSidebarClose();
        }

        lastPollAt = Date.now() - 5000; // load last 5s of msgs on open
        if (chatArea)   chatArea.style.display = 'flex';
        if (chatName)   chatName.textContent = c.other.display_name;
        if (chatAvatar) chatAvatar.innerHTML  = avatar(c.other, 38);
        if (chatStatus) chatStatus.textContent = '';
        if (chatMsgs)   chatMsgs.innerHTML = `<div style="text-align:center;color:#8696a0;font-size:12px;padding:24px">Loading…</div>`;
        if (typingEl)   typingEl.style.display = 'none';

        const r    = await fetch(`/api/dm/conversations/${convId}/messages`);
        const data = await r.json();
        const msgs = data.messages || data; // backward compat

        // Server tells us definitively which ID is "mine" — no race condition
        if (data.my_id) me = me || {};
        if (data.my_id) me.id = Number(data.my_id);

        if (chatMsgs) {
            chatMsgs.innerHTML = '';
            if (!msgs.length) {
                chatMsgs.innerHTML = `<div style="text-align:center;padding:40px 16px">
                    <div style="font-size:28px;margin-bottom:8px">👋</div>
                    <div style="font-size:13px;color:#8696a0">Send a message to start the conversation</div>
                </div>`;
            } else {
                let lastDate = '';
                msgs.forEach(m => {
                    m.sender_id = Number(m.sender_id);
                    const d = new Date(m.created_at).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'});
                    if (d !== lastDate) { appendDateDivider(d); lastDate = d; }
                    appendMsg(m);
                });
            }
        }
        scrollBottom();
        chatInput?.focus();
    }

    function closeConv() {
        activeConvId = null;
        if (chatArea) chatArea.style.display = 'none';
        closeCtxMenu();
    }

    // ── Date divider ──────────────────────────────────────────
    function appendDateDivider(label) {
        const dark = dk();
        const el = document.createElement('div');
        el.style.cssText = 'text-align:center;margin:12px 0';
        el.innerHTML = `<span style="display:inline-block;font-size:11px;font-weight:600;padding:4px 14px;border-radius:99px;background:${dark?'rgba(134,150,160,.15)':'rgba(0,0,0,.06)'};color:${dark?'#8696a0':'#667781'}">${esc(label)}</span>`;
        chatMsgs?.appendChild(el);
    }

    // ── Message bubble ────────────────────────────────────────
    function appendMsg(msg) {
        if (!chatMsgs) return;
        const isMe    = Number(msg.sender_id) === Number(me?.id);
        const dark    = dk();
        const deleted = msg.type === 'deleted';

        const bubbleBg  = deleted ? (dark?'#1f2c33':'#f5f6f6') : isMe ? '#6366f1' : (dark?'#2a3942':'#fff');
        const bubbleClr = deleted ? (dark?'#8696a0':'#8696a0') : isMe ? '#fff' : (dark?'#e9edef':'#111827');
        const timeclr   = isMe ? 'rgba(255,255,255,0.7)' : (dark?'#8696a0':'#8696a0');

        const el = document.createElement('div');
        el.id = `dm-msg-${msg.id}`;
        el.dataset.msgId = msg.id;
        el.dataset.isMe  = isMe ? '1' : '0';
        el.style.cssText = `display:flex;justify-content:${isMe?'flex-end':'flex-start'};margin-bottom:2px;padding:0 8px;position:relative`;
        el.innerHTML = `
            <div style="max-width:70%;display:flex;flex-direction:column;align-items:${isMe?'flex-end':'flex-start'}">
                <div class="dm-bubble" style="padding:8px 13px 6px;border-radius:${isMe?'18px 4px 18px 18px':'4px 18px 18px 18px'};
                    font-size:13.5px;line-height:1.5;word-break:break-word;
                    background:${bubbleBg};color:${bubbleClr};
                    border:${isMe?'none':(dark?'none':'1px solid #e9edef')};
                    box-shadow:0 1px 2px rgba(0,0,0,${dark?'.15':'.06'});
                    ${deleted?'font-style:italic;opacity:.7':''}
                    cursor:${isMe&&!deleted?'pointer':'default'}">
                    ${deleted ? '🚫 This message was deleted' : esc(msg.body)}
                </div>
                <span style="font-size:10px;color:${timeclr};margin-top:3px;${isMe?'margin-right:4px':'margin-left:4px'}">${fmtTime(msg.created_at)}</span>
            </div>`;

        // Right-click / long-press to delete (only own, non-deleted messages)
        if (isMe && !deleted) {
            const bubble = el.querySelector('.dm-bubble');
            bubble.addEventListener('contextmenu', e => { e.preventDefault(); showCtxMenu(e, msg.id, isMe); });
            bubble.addEventListener('touchstart', (() => {
                let t;
                return ev => { t = setTimeout(() => showCtxMenu(ev.touches[0], msg.id, isMe), 600); };
            })(), { passive: true });
            bubble.addEventListener('touchend', () => clearTimeout(undefined), { passive: true });
        }

        chatMsgs.appendChild(el);
    }

    // ── Context menu (delete) ─────────────────────────────────
    function showCtxMenu(e, msgId, isMe) {
        closeCtxMenu();
        const dark = dk();
        contextMenu = document.createElement('div');
        contextMenu.id = 'dm-ctx-menu';
        contextMenu.style.cssText = `position:fixed;z-index:9999;background:${dark?'#233138':'#fff'};border-radius:12px;
            box-shadow:0 8px 32px rgba(0,0,0,${dark?'.4':'.15'});padding:6px;min-width:160px;
            border:1px solid ${dark?'#3b4a54':'#e5e7eb'}`;
        contextMenu.style.left = Math.min(e.clientX, window.innerWidth - 180) + 'px';
        contextMenu.style.top  = Math.min(e.clientY, window.innerHeight - 100) + 'px';

        const actions = [
            { icon:'📋', label:'Copy',   fn: () => { const el=document.getElementById(`dm-msg-${msgId}`); navigator.clipboard?.writeText(el?.querySelector('.dm-bubble')?.textContent?.trim()||''); } },
        ];
        if (isMe) actions.push({ icon:'🗑️', label:'Delete', color:'#ef4444', fn: () => deleteMsg(msgId) });

        contextMenu.innerHTML = actions.map(a => `
            <div class="dm-ctx-item" data-fn="${a.label}" style="display:flex;align-items:center;gap:10px;padding:9px 14px;border-radius:8px;cursor:pointer;font-size:13px;font-weight:500;color:${a.color||(dark?'#e9edef':'#111827')}">
                <span>${a.icon}</span><span>${a.label}</span>
            </div>`).join('');

        document.body.appendChild(contextMenu);
        contextMenu.querySelectorAll('.dm-ctx-item').forEach((el,i) => {
            el.addEventListener('mouseenter', () => el.style.background = dark?'rgba(255,255,255,.07)':'rgba(0,0,0,.04)');
            el.addEventListener('mouseleave', () => el.style.background = '');
            el.addEventListener('click', () => { actions[i].fn(); closeCtxMenu(); });
        });
        setTimeout(() => document.addEventListener('click', closeCtxMenu, {once:true}), 10);
    }
    function closeCtxMenu() {
        contextMenu?.remove();
        contextMenu = null;
    }

    async function deleteMsg(msgId) {
        const el = document.getElementById(`dm-msg-${msgId}`);
        const r  = await fetch(`/api/dm/messages/${msgId}`, {method:'DELETE'});
        if (r.ok && el) {
            const bubble = el.querySelector('.dm-bubble');
            if (bubble) {
                bubble.style.fontStyle = 'italic';
                bubble.style.opacity   = '0.6';
                bubble.style.cursor    = 'default';
                bubble.innerHTML       = '🚫 This message was deleted';
            }
        }
    }

    function scrollBottom() { if(chatMsgs) chatMsgs.scrollTop = chatMsgs.scrollHeight; }

    // ── Send ──────────────────────────────────────────────────
    async function send() {
        const body = chatInput?.value.trim();
        if (!body || !activeConvId) return;
        chatInput.value = '';
        chatInput.focus();

        if (socket?.connected) {
            socket.emit('dm:send', {conv_id: activeConvId, body});
        } else {
            try {
                const r = await fetch(`/api/dm/conversations/${activeConvId}/messages`, {
                    method: 'POST',
                    headers: {'Content-Type':'application/json'},
                    body: JSON.stringify({body}),
                });
                if (r.ok) {
                    const msg = await r.json();
                    msg.sender_id = Number(msg.sender_id);
                    appendMsg(msg);
                    scrollBottom();
                    const idx = convs.findIndex(c => c.conv_id === activeConvId);
                    if (idx >= 0) { convs[idx].last_msg = body; convs[idx].last_at = msg.created_at; }
                    renderConvs();
                }
            } catch(e) { console.error('[DM send]', e); }
        }
    }

    chatSend?.addEventListener('click', send);
    chatInput?.addEventListener('keydown', e => { if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send();} });

    let typingTimer;
    chatInput?.addEventListener('input', () => {
        if(!socket?.connected||!activeConvId) return;
        socket.emit('dm:typing',{conv_id:activeConvId,typing:true});
        clearTimeout(typingTimer);
        typingTimer = setTimeout(()=>socket.emit('dm:typing',{conv_id:activeConvId,typing:false}),1500);
    });

    backBtn?.addEventListener('click', () => {
        closeConv();
        // On mobile, reopen sidebar to show conversation list
        if (window.innerWidth < 768 || window.kothaCompact) {
            if (window.kothaSidebarOpen) window.kothaSidebarOpen();
        }
    });

    // ── Email search ──────────────────────────────────────────
    async function doSearch() {
        const email = searchInput?.value.trim();
        if (!email) return;
        if (searchResult) searchResult.innerHTML = '<span style="font-size:11px;color:#8696a0">Searching…</span>';
        const r    = await fetch(`/api/dm/search?email=${encodeURIComponent(email)}`);
        const data = await r.json();

        if (!data.user) {
            if(searchResult) searchResult.innerHTML = `<div style="font-size:12px;color:#ef4444;padding:6px 0">No user found with that email.</div>`;
            return;
        }
        const u    = data.user;
        const dark = dk();
        const div  = document.createElement('div');
        div.style.cssText = `display:flex;align-items:center;gap:10px;background:${dark?'#1f2c33':'#f8fafc'};border:1px solid ${dark?'#3b4a54':'#e5e7eb'};border-radius:12px;padding:10px;margin-top:8px`;
        div.innerHTML = `${avatar(u,38)}<div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:600;color:${dark?'#e9edef':'#111827'}">${esc(u.display_name)}</div><div style="font-size:11px;color:#8696a0">${esc(u.email)}</div></div>
            <button id="dm-start-chat-btn" style="background:#6366f1;color:#fff;font-size:12px;font-weight:700;padding:7px 14px;border-radius:10px;border:none;cursor:pointer;white-space:nowrap;transition:background .15s" onmouseenter="this.style.background='#4f46e5'" onmouseleave="this.style.background='#6366f1'">Start Chat</button>`;
        if(searchResult){searchResult.innerHTML='';searchResult.appendChild(div);}

        div.querySelector('#dm-start-chat-btn')?.addEventListener('click', async () => {
            const res  = await fetch('/api/dm/conversations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({user_id:u.id})});
            const d    = await res.json();
            if(d.conv_id){
                if(!convs.find(c=>c.conv_id===d.conv_id)) convs.unshift({conv_id:d.conv_id,other:d.other,last_msg:'',last_at:0,unread:0});
                if(searchResult) searchResult.innerHTML='';
                if(searchInput)  searchInput.value='';
                renderConvs();
                openConv(d.conv_id);
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
            if(c?.other.id===uid) chatStatus.textContent = online ? '● online' : '';
        }
    }

    // ── Unread badge ──────────────────────────────────────────
    function updateBadge() {
        const n = convs.reduce((s,c)=>s+(c.unread||0),0);
        const b = document.getElementById('dm-unread-badge');
        if(b){ b.textContent=n>9?'9+':n; b.classList.toggle('hidden',n===0); }
    }

    // ── Polling fallback (when socket not connected) ──────────
    let lastPollAt = Date.now();
    let pollTimer  = null;

    function startPolling() {
        if (pollTimer) return;
        pollTimer = setInterval(async () => {
            if (socket?.connected) return; // socket works, no need to poll
            if (!activeConvId) return;     // nothing open

            try {
                const r    = await fetch(`/api/dm/conversations/${activeConvId}/messages?after=${lastPollAt}`);
                if (!r.ok) return;
                const data = await r.json();
                const msgs = (data.messages || data).filter(m => m.created_at > lastPollAt && Number(m.sender_id) !== Number(me?.id));
                if (msgs.length) {
                    msgs.forEach(m => { m.sender_id = Number(m.sender_id); appendMsg(m); });
                    scrollBottom();
                    lastPollAt = msgs[msgs.length-1].created_at;
                    // update conv list preview
                    const idx = convs.findIndex(c => c.conv_id === activeConvId);
                    if (idx >= 0) { convs[idx].last_msg = msgs[msgs.length-1].body; convs[idx].last_at = msgs[msgs.length-1].created_at; }
                    renderConvs();
                }
            } catch {}
        }, 2500); // poll every 2.5s when no socket
    }

    // Reset poll timestamp when conv opens
    const _origOpen = openConv;

    // ── External triggers ─────────────────────────────────────
    document.getElementById('btn-dm')?.addEventListener('click', () => {
        if(window.kothaSidebarOpen) window.kothaSidebarOpen();
        showDmTab();
    });
    document.getElementById('empty-dm-btn')?.addEventListener('click', () => {
        if(window.kothaSidebarOpen) window.kothaSidebarOpen();
        showDmTab();
    });

    // ── Start ─────────────────────────────────────────────────
    init();
    window.dmShowTab   = showDmTab;
    window.dmOpenConv  = openConv;
})();
