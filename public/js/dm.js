// dm.js — Direct Messages
(function () {
    'use strict';

    // ── Helpers ───────────────────────────────────────────────
    function esc(s) {
        return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }
    function dk() { return document.documentElement.classList.contains('dark'); }

    function compressImage(file, quality=0.7, maxDim=1200) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = e => {
                const img = new Image();
                img.src = e.target.result;
                img.onload = () => {
                    let w = img.width, h = img.height;
                    if (w > maxDim || h > maxDim) {
                        if (w > h) { h = Math.round((h*maxDim)/w); w = maxDim; }
                        else { w = Math.round((w*maxDim)/h); h = maxDim; }
                    }
                    const canvas = document.createElement('canvas');
                    canvas.width = w; canvas.height = h;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, w, h);
                    canvas.toBlob(blob => {
                        resolve(new File([blob], file.name, {type: 'image/jpeg'}));
                    }, 'image/jpeg', quality);
                };
            };
        });
    }


    function appendMsg(m) {
        if (!chatMsgs) return;
        const msgElId = `dm-msg-${m.id}`;
        if (document.getElementById(msgElId)) return; // dedup
        
        const isMe = m.sender_id === me?.id;
        const deleted = m.type === 'deleted';
        let contentHtml = '';
        let extraClass = '';
        if (deleted) {
            contentHtml = `
                <div class="flex items-center gap-1.5 opacity-70 italic text-[14px]">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="opacity-80"><circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg>
                    This message was deleted
                </div>`;
        } else if (m.type === 'image' && m.media_url) {
            extraClass = '!p-1'; // tighter padding for images
            contentHtml = `<div class="relative w-full max-w-[280px]">
                <img src="${m.media_url}" style="width: 100%; height: auto; border-radius: 12px; background: transparent; cursor: zoom-in;" class="block shadow-sm" onclick="window.kothaOpenLightbox(this.src)" loading="lazy">
                ${m.body && m.body !== 'image.jpg' && m.body !== 'Voice Note' ? `<div class="px-2 pb-1 pt-1.5 text-[14px] leading-snug">${m.body.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>` : ''}
            </div>`;
        } else if (m.type === 'video' && m.media_url) {
            extraClass = '!p-1';
            contentHtml = `<div class="relative w-full max-w-[280px]">
                <video src="${m.media_url}" style="width: 100%; border-radius: 12px; background: #000;" controls preload="metadata" playsinline class="block shadow-sm"></video>
                ${m.body ? `<div class="px-2 pb-1 pt-1.5 text-[14px] leading-snug">${m.body.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>` : ''}
            </div>`;
        } else if (m.type === 'audio' && m.media_url) {
            const avatarUrl = isMe ? (me?.avatar_url || '/images/default-avatar.png') : (document.getElementById('dm-chat-avatar')?.src || '/images/default-avatar.png');
            extraClass = '!pr-2 !pl-1.5 !pt-1.5 !pb-1';
            contentHtml = `
            <div class="kotha-audio-player flex items-center gap-2" style="width: 250px;">
                <div class="relative shrink-0 ml-0.5">
                    <img src="${avatarUrl}" class="w-11 h-11 rounded-full object-cover border-2 ${isMe ? 'border-[#d9fdd3] dark:border-[#005c4b]' : 'border-white dark:border-[#202c33]'} shadow-sm">
                    <div class="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-[#25D366] rounded-full border-2 border-white dark:border-[#005c4b] flex items-center justify-center">
                        <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor" class="text-white"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>
                    </div>
                </div>
                <button onclick="window.kothaToggleAudio(this)" class="w-9 h-9 flex items-center justify-center text-gray-500 hover:text-gray-700 dark:text-gray-300 dark:hover:text-white shrink-0 transition outline-none focus:outline-none">
                    <svg class="play-icon" width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                    <svg class="pause-icon hidden" width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                </button>
                <div class="flex-1 min-w-0 flex flex-col justify-center -mt-0.5 mr-1">
                    <div class="relative flex items-center w-full h-4">
                        <input type="range" min="0" max="100" value="0" class="audio-slider w-full cursor-pointer outline-none focus:outline-none" style="accent-color: #53bdeb; height: 3px;" oninput="window.kothaSeekAudioNative(this)">
                    </div>
                    <div class="flex justify-between items-center text-[10px] text-gray-500 dark:text-gray-400 font-medium tracking-wide" style="margin-top: 1px;">
                        <span class="audio-time"><span class="current-time">0:00</span> <span class="time-separator hidden">/</span> <span class="total-time"></span></span>
                    </div>
                </div>
                <audio src="${m.media_url}" preload="metadata" onloadedmetadata="window.kothaAudioLoaded(this)" ontimeupdate="window.kothaUpdateAudioTime(this)" onended="window.kothaAudioEnded(this)" onerror="window.kothaAudioError(this)" class="hidden"></audio>
            </div>
            `;
        } else if (m.type === 'document' && m.media_url) {
            const isPdf = m.media_url.toLowerCase().split('?')[0].endsWith('.pdf') || (m.body && m.body.toLowerCase().endsWith('.pdf'));
            if (isPdf) {
                contentHtml = `
                <a href="${m.media_url}" target="_blank" class="block w-[240px] bg-white dark:bg-[#202c33] rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden hover:opacity-90 transition shadow-sm">
                    <div class="h-24 bg-red-50 dark:bg-red-950/30 flex flex-col items-center justify-center relative">
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="text-red-500"><path d="M14 2H6a2 2 0 0 0-2 2v16c0 1.1.9 2 2 2h12a2 2 0 0 0 2-2V8l-6-6z"/><path d="M14 3v5h5M16 13H8M16 17H8M10 9H8"/></svg>
                        <span class="absolute bottom-2 right-2 text-[10px] font-bold bg-red-500 text-white px-1.5 py-0.5 rounded shadow-sm tracking-wider">PDF</span>
                    </div>
                    <div class="p-3 bg-gray-50 dark:bg-[#111b21] border-t border-gray-100 dark:border-gray-800">
                        <div class="text-[13px] font-semibold text-gray-800 dark:text-gray-200 truncate" title="${m.body || 'Document.pdf'}">${m.body || 'Document.pdf'}</div>
                        <div class="text-[10px] text-gray-500 mt-0.5 uppercase tracking-wide">Document</div>
                    </div>
                </a>`;
            } else {
                contentHtml = `<a href="${m.media_url}" target="_blank" class="flex items-center gap-2 bg-black/10 dark:bg-white/10 p-2.5 rounded-lg hover:bg-black/20 dark:hover:bg-white/20 transition underline shadow-sm"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="shrink-0"><path d="M14 2H6a2 2 0 0 0-2 2v16c0 1.1.9 2 2 2h12a2 2 0 0 0 2-2V8l-6-6z"/><path d="M14 3v5h5M16 13H8M16 17H8M10 9H8"/></svg><span class="truncate max-w-[180px] text-[13px]">${m.body || 'Document'}</span></a>`;
            }
        } else {
            contentHtml = `<div class="text-[15px] leading-snug">${(m.body || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>`;
        }

        const timeStr = new Date(m.created_at || Date.now()).toLocaleTimeString('en-IN', {hour:'2-digit', minute:'2-digit', hour12:true});
        
        let readHtml = '';
        if (isMe) {
            readHtml = m.read_at ? 
            `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-[#53bdeb] ml-1 shrink-0"><path d="M5 12l5 5L20 7"/><path d="M5 17l5-5-5-5" class="opacity-0"/><path d="M10 17l10-10"/></svg>` 
            : 
            `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-gray-400 ml-1 shrink-0"><path d="M5 12l5 5L20 7"/></svg>`;
        }

        let timeOverlay = '';
        if (m.type === 'image' || m.type === 'video') {
            timeOverlay = `<div class="absolute bottom-2 right-3 flex items-center gap-1 bg-black/40 text-white text-[10px] px-1.5 py-0.5 rounded-full z-10 shadow-sm backdrop-blur-sm" style="font-size: 10px;"><span class="opacity-90">${timeStr}</span>${readHtml ? readHtml.replace('text-gray-400', 'text-white/80') : ''}</div>`;
        } else {
            timeOverlay = `<div class="flex items-center justify-end mt-1 space-x-1" style="min-width: 45px;"><span class="text-[10px] opacity-60" style="font-size: 10px;">${timeStr}</span>${readHtml}</div>`;
        }

        const html = `
            <div id="${msgElId}" class="flex gap-2 text-sm ${isMe ? 'flex-row-reverse' : 'flex-row'} mb-1 relative">
                ${!isMe ? `<img src="${m.avatar_url || ''}" class="w-7 h-7 rounded-full object-cover shadow-sm bg-indigo-100 flex-shrink-0" onerror="this.outerHTML='<div class=\\'w-7 h-7 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 text-white flex items-center justify-center font-bold text-[10px] flex-shrink-0 shadow-sm\\'>${(m.display_name||'?')[0].toUpperCase()}</div>'">` : ''}
                <div class="max-w-[75%] md:max-w-[65%] flex flex-col ${isMe ? 'items-end' : 'items-start'}">
                    <div class="dm-bubble break-words px-3 py-2 rounded-2xl shadow-sm leading-relaxed relative ${isMe ? 'bg-[#d9fdd3] dark:bg-[#005c4b] text-gray-900 dark:text-gray-100 rounded-tr-sm' : 'bg-white dark:bg-[#202c33] border border-gray-100 dark:border-gray-800 text-gray-800 dark:text-gray-100 rounded-tl-sm'} ${extraClass}">
                        ${contentHtml}
                        ${timeOverlay}
                    </div>
                </div>
            </div>`;
        chatMsgs.insertAdjacentHTML('beforeend', html);

        if (isMe && !deleted) {
            const el = document.getElementById(msgElId);
            if (el) {
                const bubble = el.querySelector('.dm-bubble');
                if (bubble) {
                    let pressTimer;
                    bubble.addEventListener('contextmenu', e => { e.preventDefault(); showCtxMenu(e, m.id, isMe); });
                    bubble.addEventListener('touchstart', ev => {
                        pressTimer = setTimeout(() => showCtxMenu(ev.touches[0], m.id, isMe), 600);
                    }, { passive: true });
                    bubble.addEventListener('touchend', () => clearTimeout(pressTimer), { passive: true });
                    bubble.addEventListener('touchmove', () => clearTimeout(pressTimer), { passive: true });
                }
            }
        }
    }
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
    let renderedIds = new Set();   // message IDs already on screen (dedup socket+poll)

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
    const clearBtn     = document.getElementById('dm-clear-btn');
    const typingEl     = document.getElementById('dm-typing-indicator');
    const scrollBottomBtn = document.getElementById('dm-scroll-bottom-btn');
    const scrollUnreadBadge = document.getElementById('dm-scroll-unread-badge');

    const dmMicBtn         = document.getElementById('dm-mic-btn');
    const dmRecOverlay     = document.getElementById('dm-recording-overlay');
    const dmRecTime        = document.getElementById('dm-recording-time');
    const dmRecCancel      = document.getElementById('dm-recording-cancel');
    const dmRecSend        = document.getElementById('dm-recording-send');

    if (!tabDmBtn) return;

    // ── State persistence (survives refresh) ──────────────────
    const LS = {
        view:  'kotha_dm_view',          // 'chats' | 'messages'
        conv:  'kotha_dm_active_conv',    // open conversation id
        draft: (id) => 'kotha_dm_draft_' + id,
    };
    function saveDraft() {
        if (!activeConvId || !chatInput) return;
        const v = chatInput.value;
        if (v) localStorage.setItem(LS.draft(activeConvId), v);
        else   localStorage.removeItem(LS.draft(activeConvId));
    }

    // ── Tab switching ─────────────────────────────────────────
    function showChatsTab() {
        chatsTab?.classList.remove('hidden');
        dmTab?.classList.add('hidden');
        tabChatsBtn?.classList.remove('text-gray-500','dark:text-gray-400','hover:bg-gray-100','dark:hover:bg-gray-800');
        tabChatsBtn?.classList.add('bg-indigo-600','text-white','shadow-sm');
        tabDmBtn?.classList.remove('bg-indigo-600','text-white','shadow-sm');
        tabDmBtn?.classList.add('text-gray-500','dark:text-gray-400','hover:bg-gray-100','dark:hover:bg-gray-800');
        // Hide DM chat overlay so imported chats are visible again
        if (chatArea) chatArea.style.display = 'none';
        document.getElementById('dm-empty-state')?.classList.add('hidden');
        activeConvId = null;
        closeCtxMenu();
        localStorage.setItem(LS.view, 'chats');
        localStorage.removeItem(LS.conv);
    }
    function showDmTab() {
        chatsTab?.classList.add('hidden');
        dmTab?.classList.remove('hidden');
        tabDmBtn?.classList.remove('text-gray-500','dark:text-gray-400','hover:bg-gray-100','dark:hover:bg-gray-800');
        tabDmBtn?.classList.add('bg-indigo-600','text-white','shadow-sm');
        tabChatsBtn?.classList.remove('bg-indigo-600','text-white','shadow-sm');
        tabChatsBtn?.classList.add('text-gray-500','dark:text-gray-400','hover:bg-gray-100','dark:hover:bg-gray-800');
        localStorage.setItem(LS.view, 'messages');
        if (!activeConvId) {
            document.getElementById('dm-empty-state')?.classList.remove('hidden');
        }
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
        // Resolve current user (correct endpoint is /api/auth/me).
        // NOTE: even if this fails, we still start polling — openConv sets me.id
        // from the messages response, so real-time must not depend on this.
        try {
            if (window.__USER__) {
                me = window.__USER__;
            } else {
                const r = await fetch('/api/auth/me');
                const d = await r.json();
                if (d && d.user) me = d.user;
            }
            if (me) me.id = Number(me.id);
        } catch (e) { /* ignore — polling still runs below */ }

        connectSocket();
        startPolling();      // active-conversation real-time (always on)
        startConvPolling();  // conversation-list real-time

        // ── Restore previous view/conversation after refresh ──
        if (localStorage.getItem(LS.view) === 'messages') {
            showDmTab();              // switch to Messages tab (also loads convs)
            await loadConvs();        // ensure list is ready
            const savedConv = Number(localStorage.getItem(LS.conv));
            if (savedConv && convs.find(c => c.conv_id === savedConv)) {
                openConv(savedConv);  // reopen the same conversation + restore draft
            }
        }
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
            if (msg.conv_id === activeConvId) { 
                appendMsg(msg); 
                const distanceToBottom = chatMsgs.scrollHeight - chatMsgs.scrollTop - chatMsgs.clientHeight;
                if (distanceToBottom > 200) {
                    if (scrollUnreadBadge) {
                        scrollUnreadBadge.classList.remove('hidden');
                        const currentBadge = parseInt(scrollUnreadBadge.textContent || '0');
                        scrollUnreadBadge.textContent = currentBadge + 1;
                        scrollBottomBtn.classList.add('animate-bounce');
                        setTimeout(() => scrollBottomBtn.classList.remove('animate-bounce'), 1000);
                    }
                } else {
                    scrollBottom(); 
                }
            }
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
        socket.on('dm:read', ({conv_id}) => {
            if (activeConvId === conv_id) {
                // Update all grey ticks to blue double ticks
                const ticks = document.querySelectorAll('span[id^="dm-tick-"].text-gray-400');
                ticks.forEach(t => {
                    t.classList.remove('text-gray-400', 'dark:text-gray-500');
                    t.classList.add('text-blue-500');
                    t.textContent = '✓✓';
                });
            }
        });
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
        if (window.location.hash !== `#chat-${convId}`) {
            history.pushState(null, '', `#chat-${convId}`);
        }
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

        renderedIds = new Set();        // reset dedup tracker for this conversation
        lastPollAt = 0;
        localStorage.setItem(LS.conv, convId);
        if (chatArea)   chatArea.style.display = 'flex';
        document.getElementById('dm-empty-state')?.classList.add('hidden');
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
                    if (m.created_at > lastPollAt) lastPollAt = m.created_at;
                    const d = new Date(m.created_at).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'});
                    if (d !== lastDate) { appendDateDivider(d); lastDate = d; }
                    appendMsg(m);
                });
            }
        }
        scrollBottom();

        // Persist + restore draft
        localStorage.setItem(LS.conv, String(convId));
        if (chatInput) {
            chatInput.value = localStorage.getItem(LS.draft(convId)) || '';
            chatInput.dispatchEvent(new Event('input')); // Trigger toggle logic
            chatInput.focus();
        }
    }

    function closeConv(fromHash = false) {
        if (!fromHash && window.location.hash.startsWith('#chat-')) {
            window.location.hash = '';
            return;
        }
        activeConvId = null;
        if (chatArea) chatArea.style.display = 'none';
        document.getElementById('dm-empty-state')?.classList.remove('hidden');
        closeCtxMenu();
        localStorage.removeItem(LS.conv);
    }

    // ── Date divider ──────────────────────────────────────────
    function appendDateDivider(label) {
        const dark = dk();
        const el = document.createElement('div');
        el.style.cssText = 'text-align:center;margin:12px 0';
        el.innerHTML = `<span style="display:inline-block;font-size:11px;font-weight:600;padding:4px 14px;border-radius:99px;background:${dark?'rgba(134,150,160,.15)':'rgba(0,0,0,.06)'};color:${dark?'#8696a0':'#667781'}">${esc(label)}</span>`;
        chatMsgs?.appendChild(el);
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
        const isMobile = window.innerWidth <= 768;
        if (isMobile) {
            contextMenu.style.left = '50%';
            contextMenu.style.transform = 'translateX(-50%)';
            contextMenu.style.bottom = '100px';
            contextMenu.style.top = 'auto';
            contextMenu.style.width = '250px';
            contextMenu.style.boxShadow = '0 10px 40px rgba(0,0,0,0.3)';
            contextMenu.style.padding = '10px';
        } else {
            contextMenu.style.left = Math.min(e.clientX, window.innerWidth - 180) + 'px';
            contextMenu.style.top  = Math.min(e.clientY, window.innerHeight - 100) + 'px';
        }
        const actions = [
            { icon:'📋', label:'Copy',   fn: () => { const el=document.getElementById(`dm-msg-${msgId}`); navigator.clipboard?.writeText(el?.querySelector('.dm-bubble')?.textContent?.trim()||''); } },
        ];
        if (isMe) actions.push({ icon:'🗑️', label:'Delete', color:'#ef4444', fn: () => deleteMsg(msgId) });

        contextMenu.innerHTML = actions.map(a => `
            <div class="dm-ctx-item" data-fn="${a.label}" style="display:flex;align-items:center;gap:12px;padding:${isMobile ? '14px' : '9px 14px'};border-radius:8px;cursor:pointer;font-size:${isMobile ? '15px' : '13px'};font-weight:500;color:${a.color||(dark?'#e9edef':'#111827')}">
                <span style="font-size:${isMobile?'18px':'14px'}">${a.icon}</span><span>${a.label}</span>
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

    if (chatMsgs && scrollBottomBtn) {
        chatMsgs.addEventListener('scroll', () => {
            const distanceToBottom = chatMsgs.scrollHeight - chatMsgs.scrollTop - chatMsgs.clientHeight;
            if (distanceToBottom > 150) {
                scrollBottomBtn.classList.remove('opacity-0', 'pointer-events-none', 'translate-y-10');
            } else {
                scrollBottomBtn.classList.add('opacity-0', 'pointer-events-none', 'translate-y-10');
                if (scrollUnreadBadge) {
                    scrollUnreadBadge.classList.add('hidden');
                    scrollUnreadBadge.textContent = '0';
                }
            }
        });
        scrollBottomBtn.addEventListener('click', scrollBottom);
    }

    // ── Send ──────────────────────────────────────────────────
    const attachBtn = document.getElementById('dm-attach-btn');
    const fileInput = document.getElementById('dm-file-input');

    attachBtn?.addEventListener('click', () => fileInput?.click());

    fileInput?.addEventListener('change', async (e) => {
        let file = e.target.files[0];
        if (!file || !activeConvId) return;
        
        let fileType = 'document';
        const nameUpper = file.name.toUpperCase();
        if (file.type.startsWith('image/') || nameUpper.endsWith('.JPG') || nameUpper.endsWith('.PNG') || nameUpper.endsWith('.JPEG') || nameUpper.endsWith('.WEBP')) {
            fileType = 'image';
            // Compress the image before uploading (only if it's actually an image type we can compress)
            if (file.type.startsWith('image/')) {
                file = await compressImage(file, 0.7, 1200);
            }
        }
        else if (file.type.startsWith('audio/') || nameUpper.endsWith('.MP3') || nameUpper.endsWith('.WAV') || nameUpper.endsWith('.OGG') || nameUpper.endsWith('.M4A')) fileType = 'audio';
        else if (file.type.startsWith('video/') || nameUpper.endsWith('.MP4') || nameUpper.endsWith('.MOV') || nameUpper.endsWith('.MKV') || nameUpper.endsWith('.WEBM')) fileType = 'video';

        const fd = new FormData();
        fd.append('file', file);
        
        const originalPlaceholder = chatInput.placeholder;
        chatInput.placeholder = 'Uploading media...';
        chatInput.disabled = true;
        
        try {
            const r = await fetch('/api/dm/upload', { method: 'POST', body: fd });
            const data = await r.json();
            if (data.url) {
                send(null, fileType, data.url, file.name);
            } else {
                alert('Upload failed: ' + (data.error || 'unknown'));
            }
        } catch(err) {
            console.error('Upload error', err);
            alert('Upload error');
        } finally {
            chatInput.placeholder = originalPlaceholder;
            chatInput.disabled = false;
            fileInput.value = '';
            chatInput.focus();
        }
    });

    async function send(ev, forcedType = 'text', forcedMediaUrl = null, fallbackBody = '') {
        let body = '';
        if (forcedType === 'text') {
            body = chatInput?.value.trim();
            if (!body && !forcedMediaUrl) return;
            if (chatInput) {
                chatInput.value = '';
                chatInput.dispatchEvent(new Event('input')); // Trigger toggle logic
            }
            chatInput?.focus();
            localStorage.removeItem(LS.draft(activeConvId));
        } else {
            body = fallbackBody || chatInput?.value.trim() || '';
            if (chatInput) {
                chatInput.value = '';
                chatInput.dispatchEvent(new Event('input')); // Trigger toggle logic
            }
        }

        const convAtSend = activeConvId;

        if (socket?.connected) {
            socket.emit('dm:send', {conv_id: activeConvId, body, type: forcedType, media_url: forcedMediaUrl});
        } else {
            try {
                const r = await fetch(`/api/dm/conversations/${activeConvId}/messages`, {
                    method: 'POST',
                    headers: {'Content-Type':'application/json'},
                    body: JSON.stringify({body, type: forcedType, media_url: forcedMediaUrl}),
                });
                if (r.ok) {
                    const msg = await r.json();
                    msg.sender_id = Number(msg.sender_id);
                    appendMsg(msg);
                    scrollBottom();
                    const idx = convs.findIndex(c => c.conv_id === activeConvId);
                    if (idx >= 0) { convs[idx].last_msg = (forcedType === 'text' ? body : `[${forcedType}]`); convs[idx].last_at = msg.created_at; }
                    renderConvs();
                }
            } catch(e) { console.error('[DM send]', e); }
        }
    }

    chatSend?.addEventListener('click', send);
    chatInput?.addEventListener('keydown', e => { if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send();} });

    let typingTimer;
    chatInput?.addEventListener('input', () => {
        saveDraft(); // persist what's typed (survives refresh)
        
        // Toggle Mic / Send buttons
        if (chatInput.value.trim().length > 0) {
            chatSend?.classList.remove('hidden');
            dmMicBtn?.classList.add('hidden');
        } else {
            chatSend?.classList.add('hidden');
            dmMicBtn?.classList.remove('hidden');
        }

        if(!socket?.connected||!activeConvId) return;
        socket.emit('dm:typing',{conv_id:activeConvId,typing:true});
        clearTimeout(typingTimer);
        typingTimer = setTimeout(()=>socket.emit('dm:typing',{conv_id:activeConvId,typing:false}),1500);
    });

    // ── Voice Recording Logic ─────────────────────────────────
    let mediaRecorder = null;
    let audioChunks = [];
    let recInterval = null;
    let recStartTime = 0;

    async function startRecording() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];

            mediaRecorder.ondataavailable = e => { if (e.data.size > 0) audioChunks.push(e.data); };
            mediaRecorder.onstop = () => {
                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorder.start();
            dmRecOverlay.classList.remove('hidden');
            dmRecOverlay.classList.add('flex');
            
            recStartTime = Date.now();
            dmRecTime.textContent = '00:00';
            recInterval = setInterval(() => {
                const elapsed = Math.floor((Date.now() - recStartTime) / 1000);
                const m = String(Math.floor(elapsed / 60)).padStart(2, '0');
                const s = String(elapsed % 60).padStart(2, '0');
                dmRecTime.textContent = `${m}:${s}`;
            }, 1000);

        } catch (err) {
            console.error('Mic access denied or error:', err);
            alert('Could not access microphone.');
        }
    }

    function stopRecording(cancel = false) {
        if (!mediaRecorder || mediaRecorder.state === 'inactive') return;
        
        clearInterval(recInterval);
        dmRecOverlay.classList.add('hidden');
        dmRecOverlay.classList.remove('flex');

        mediaRecorder.onstop = async () => {
            mediaRecorder.stream.getTracks().forEach(track => track.stop());
            
            if (!cancel && audioChunks.length > 0) {
                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                const file = new File([audioBlob], 'voice-message.webm', { type: 'audio/webm' });
                
                const formData = new FormData();
                formData.append('file', file);
                
                try {
                    const res = await fetch('/api/dm/upload', { method: 'POST', body: formData });
                    const data = await res.json();
                    if (data.url) {
                        send(null, 'audio', data.url, 'Voice Note');
                    } else {
                        alert('Upload failed: ' + (data.error || 'Unknown error'));
                    }
                } catch (e) {
                    console.error('Audio upload error:', e);
                    alert('Audio upload failed.');
                }
            }
            audioChunks = [];
        };

        mediaRecorder.stop();
    }

    dmMicBtn?.addEventListener('click', startRecording);
    dmRecCancel?.addEventListener('click', () => stopRecording(true));
    dmRecSend?.addEventListener('click', () => stopRecording(false));

    backBtn?.addEventListener('click', () => {
        closeConv();
        // On mobile, reopen sidebar to show conversation list
        if (window.innerWidth < 768 || window.kothaCompact) {
            if (window.kothaSidebarOpen) window.kothaSidebarOpen();
        }
    });

    // Clear all messages in conversation
    clearBtn?.addEventListener('click', async () => {
        if (!activeConvId) return;
        const c = convs.find(x => x.conv_id === activeConvId);
        const name = c?.other.display_name || 'this conversation';
        if (!confirm(`Clear all messages with ${name}? This cannot be undone.`)) return;

        const r = await fetch(`/api/dm/conversations/${activeConvId}/messages`, { method: 'DELETE' });
        if (r.ok) {
            if (chatMsgs) chatMsgs.innerHTML = `
                <div style="text-align:center;padding:40px 16px">
                    <div style="font-size:28px;margin-bottom:8px">🗑️</div>
                    <div style="font-size:13px;color:#8696a0">Chat cleared</div>
                </div>`;
            // Update conv list
            const idx = convs.findIndex(x => x.conv_id === activeConvId);
            if (idx >= 0) { convs[idx].last_msg = ''; convs[idx].last_at = 0; }
            renderConvs();
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

    function updateBadge() {
        const n = convs.reduce((s,c)=>s+(c.unread||0),0);
        const badges = document.querySelectorAll('.dm-unread-badge');
        badges.forEach(b => {
            b.textContent = n > 9 ? '9+' : n;
            b.classList.toggle('hidden', n === 0);
        });
    }

    // ── Polling fallback (when socket not connected) ──────────
    let lastPollAt = 0;
    let pollTimer  = null;
    let convPollTimer = null;

    // Poll the OPEN conversation for new messages — always runs (socket is a bonus,
    // not a requirement). appendMsg dedups by id so socket + poll never double up.
    function startPolling() {
        if (pollTimer) return;
        pollTimer = setInterval(async () => {
            if (!activeConvId) return;
            try {
                const r    = await fetch(`/api/dm/conversations/${activeConvId}/messages?after=${lastPollAt}`);
                if (!r.ok) return;
                const data = await r.json();
                const all  = data.messages || data;
                let added = false, last = null;
                all.forEach(m => {
                    m.sender_id = Number(m.sender_id);
                    if (m.created_at > lastPollAt) lastPollAt = m.created_at;
                    if (msgIsNew(m)) { appendMsg(m); added = true; last = m; }
                });
                if (added) {
                    scrollBottom();
                    const idx = convs.findIndex(c => c.conv_id === activeConvId);
                    if (idx >= 0 && last) { convs[idx].last_msg = last.body; convs[idx].last_at = last.created_at; renderConvs(); }
                }
            } catch {}
        }, 2000);
    }

    // Poll the conversation LIST so incoming messages in other chats show up
    // (unread badge, preview, ordering) without a refresh.
    function startConvPolling() {
        if (convPollTimer) return;
        convPollTimer = setInterval(() => {
            if (!dmTab || dmTab.classList.contains('hidden')) return; // only when Messages tab visible
            if (activeConvId) return; // don't disrupt while reading a chat
            loadConvs();
        }, 4000);
    }

    function msgIsNew(m) {
        return m.id == null || !renderedIds.has(m.id);
    }

    // ── External triggers ─────────────────────────────────────
    document.getElementById('btn-dm')?.addEventListener('click', () => {
        if(window.kothaSidebarOpen) window.kothaSidebarOpen();
        showDmTab();
    });
    document.getElementById('empty-dm-btn')?.addEventListener('click', () => {
        if(window.kothaSidebarOpen) window.kothaSidebarOpen();
        showDmTab();
    });

    // ── Snapshot the EXACT on-screen state right before leaving/refresh ──
    // Reads real DOM state so we never reopen a chat when the user was on the list.
    function persistState() {
        const onMessages = dmTab && !dmTab.classList.contains('hidden');
        localStorage.setItem(LS.view, onMessages ? 'messages' : 'chats');

        // On mobile the sidebar (conversation list) slides OVER the chat — if it's
        // visible, the user is looking at the list, not the conversation.
        const sidebar = document.getElementById('sidebar');
        const isMobile = window.innerWidth < 768;
        const sidebarShown = sidebar && !sidebar.classList.contains('-translate-x-full');
        const chatVisible = chatArea && chatArea.style.display === 'flex' && activeConvId;
        const inConversation = chatVisible && !(isMobile && sidebarShown);

        if (inConversation) localStorage.setItem(LS.conv, String(activeConvId));
        else                localStorage.removeItem(LS.conv);
        saveDraft();
    }
    window.addEventListener('pagehide', persistState);
    window.addEventListener('beforeunload', persistState);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') persistState();
    });

    // ── Lightbox (Image Viewer) ───────────────────────────────
    window.kothaOpenLightbox = function(src) {
        if (window.location.hash !== '#lightbox') {
            history.pushState(null, '', '#lightbox');
        }
        let overlay = document.getElementById('kotha-lightbox');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'kotha-lightbox';
            overlay.className = 'fixed inset-0 z-[9999] bg-black/95 flex items-center justify-center opacity-0 transition-opacity duration-200 backdrop-blur-sm cursor-zoom-out';
            overlay.onclick = function(e) {
                if (e.target === overlay || e.target.tagName === 'BUTTON' || e.target.closest('button')) {
                    window.kothaCloseLightbox();
                }
            };
            
            overlay.innerHTML = `
                <div class="absolute top-4 right-4 z-50">
                    <button onclick="window.kothaCloseLightbox()" class="text-white hover:text-gray-300 bg-black/50 hover:bg-black/80 rounded-full p-2 transition">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                    </button>
                </div>
                <img id="kotha-lightbox-img" src="" class="max-w-[95vw] max-h-[90vh] object-contain rounded-md shadow-2xl scale-95 transition-transform duration-200" style="user-select: none; touch-action: none;">
            `;
            document.body.appendChild(overlay);

            // Add Swipe to close
            let startY = 0;
            let currentY = 0;
            let isDragging = false;
            const img = document.getElementById('kotha-lightbox-img');
            
            img.addEventListener('touchstart', (e) => {
                if (e.touches.length > 1) return; // ignore pinch
                startY = e.touches[0].clientY;
                isDragging = true;
                img.style.transition = 'none';
                overlay.style.transition = 'none';
            }, {passive: true});

            img.addEventListener('touchmove', (e) => {
                if (!isDragging) return;
                currentY = e.touches[0].clientY;
                const deltaY = currentY - startY;
                
                // Resistance when dragging
                img.style.transform = `translateY(${deltaY}px) scale(1)`;
                const opacity = Math.max(0.4, 1 - Math.abs(deltaY) / window.innerHeight);
                overlay.style.backgroundColor = `rgba(0,0,0,${opacity * 0.95})`;
            }, {passive: true});

            img.addEventListener('touchend', (e) => {
                if (!isDragging) return;
                isDragging = false;
                const deltaY = currentY - startY;
                
                img.style.transition = 'transform 0.2s ease-out';
                overlay.style.transition = 'background-color 0.2s ease-out, opacity 0.2s ease-out';
                
                if (Math.abs(deltaY) > 100) {
                    // Swipe was long enough, close it
                    img.style.transform = `translateY(${deltaY > 0 ? window.innerHeight : -window.innerHeight}px) scale(0.9)`;
                    overlay.style.opacity = '0';
                    setTimeout(window.kothaCloseLightbox, 200);
                } else {
                    // Snap back
                    img.style.transform = 'translateY(0) scale(1)';
                    overlay.style.backgroundColor = 'rgba(0,0,0,0.95)';
                }
            });
        }
        
        const img = document.getElementById('kotha-lightbox-img');
        img.src = src;
        img.style.transform = '';
        overlay.style.backgroundColor = '';
        
        // Show
        overlay.style.display = 'flex';
        // Trigger reflow for animation
        overlay.offsetHeight; 
        overlay.classList.remove('opacity-0');
        img.classList.remove('scale-95');
        img.classList.add('scale-100');
    };

    window.kothaCloseLightbox = function(fromHash = false) {
        if (!fromHash && window.location.hash === '#lightbox') {
            history.back();
            return;
        }
        const overlay = document.getElementById('kotha-lightbox');
        if (overlay) {
            const img = document.getElementById('kotha-lightbox-img');
            overlay.classList.add('opacity-0');
            if (img) {
                img.classList.remove('scale-100');
                img.classList.add('scale-95');
                setTimeout(() => {
                    img.style.transform = '';
                    overlay.style.backgroundColor = '';
                }, 200);
            }
            setTimeout(() => { overlay.style.display = 'none'; }, 200);
        }
    };

    // ── Start ─────────────────────────────────────────────────
    init();

    window.addEventListener('hashchange', () => {
        const hash = window.location.hash;

        // 1. Always ensure lightbox closes if hash is not #lightbox
        if (hash !== '#lightbox') {
            if (document.getElementById('kotha-lightbox') && document.getElementById('kotha-lightbox').style.display !== 'none') {
                window.kothaCloseLightbox(true);
            }
        }

        // 2. Handle Chat Hash
        if (hash.startsWith('#chat-')) {
            const id = Number(hash.replace('#chat-', ''));
            if (id && id !== activeConvId) openConv(id);
        } else if (hash === '#lightbox') {
            // User is looking at a photo, do not alter chat state
        } else {
            // No hash or unrecognized hash -> close active chat
            if (activeConvId) {
                closeConv(true);
            }
        }
    });

    window.dmShowTab   = showDmTab;
    window.dmOpenConv  = openConv;
})();

// ── Global Audio Player Handlers ─────────────────────────────────────────
window.kothaToggleAudio = function(btn) {
    const wrapper = btn.closest('.kotha-audio-player');
    const audio = wrapper.querySelector('audio');
    const playIcon = wrapper.querySelector('.play-icon');
    const pauseIcon = wrapper.querySelector('.pause-icon');
    
    if (audio.paused) {
        document.querySelectorAll('.kotha-audio-player audio').forEach(a => {
            if (a !== audio && !a.paused) {
                a.pause();
                const w = a.closest('.kotha-audio-player');
                if(w) {
                    w.querySelector('.play-icon')?.classList.remove('hidden');
                    w.querySelector('.pause-icon')?.classList.add('hidden');
                }
            }
        });
        
        audio.play().then(() => {
            playIcon.classList.add('hidden');
            pauseIcon.classList.remove('hidden');
        }).catch(err => {
            console.error('Playback failed:', err);
            // Fallback for iOS/Safari WebM issues: alert user
            if(err.name === 'NotSupportedError') {
                alert('This audio format may not be supported by your current browser (iOS Safari).');
            }
        });
    } else {
        audio.pause();
        playIcon.classList.remove('hidden');
        pauseIcon.classList.add('hidden');
    }
};

window.kothaAudioLoaded = function(audio) {
    const wrapper = audio.closest('.kotha-audio-player');
    if (!wrapper) return;
    const timeEl = wrapper.querySelector('.audio-time');
    
    if (audio.duration && audio.duration !== Infinity && !isNaN(audio.duration)) {
        const d = Math.floor(audio.duration);
        const formattedTotal = `${Math.floor(d/60)}:${String(d%60).padStart(2,'0')}`;
        
        if (timeEl.querySelector('.current-time')) {
            timeEl.querySelector('.current-time').textContent = formattedTotal;
            timeEl.querySelector('.total-time').textContent = '';
            timeEl.querySelector('.time-separator').classList.add('hidden');
            timeEl.dataset.total = formattedTotal;
        } else {
            timeEl.textContent = formattedTotal;
        }
    }
};

window.kothaUpdateAudioTime = function(audio) {
    const wrapper = audio.closest('.kotha-audio-player');
    if (!wrapper) return;
    const timeEl = wrapper.querySelector('.audio-time');
    const slider = wrapper.querySelector('.audio-slider');
    
    let duration = audio.duration;
    if (duration === Infinity || isNaN(duration)) {
        duration = audio.currentTime + 1; // fallback
    }

    if (duration) {
        const pct = (audio.currentTime / duration) * 100 || 0;
        if(slider && document.activeElement !== slider) slider.value = pct;
    }
    
    const elapsed = Math.floor(audio.currentTime);
    const m = Math.floor(elapsed / 60);
    const s = String(elapsed % 60).padStart(2, '0');
    const formattedCurrent = `${m}:${s}`;
    
    if (timeEl) {
        const currEl = timeEl.querySelector('.current-time');
        const sepEl = timeEl.querySelector('.time-separator');
        const totalEl = timeEl.querySelector('.total-time');
        
        if (currEl && sepEl && totalEl && timeEl.dataset.total) {
            currEl.textContent = formattedCurrent;
            sepEl.classList.remove('hidden');
            totalEl.textContent = timeEl.dataset.total;
        } else {
            timeEl.textContent = formattedCurrent;
        }
    }
};

window.kothaSeekAudioNative = function(slider) {
    const wrapper = slider.closest('.kotha-audio-player');
    if (!wrapper) return;
    const audio = wrapper.querySelector('audio');
    
    if (audio.duration && audio.duration !== Infinity) {
        audio.currentTime = (slider.value / 100) * audio.duration;
        window.kothaUpdateAudioTime(audio);
    }
};

window.kothaAudioError = function(audio) {
    console.error('Audio failed to load', audio.src);
};

window.kothaAudioEnded = function(audio) {
    const wrapper = audio.closest('.kotha-audio-player');
    if (!wrapper) return;
    const playIcon = wrapper.querySelector('.play-icon');
    const pauseIcon = wrapper.querySelector('.pause-icon');
    const slider = wrapper.querySelector('.audio-slider');
    const timeEl = wrapper.querySelector('.audio-time');
    
    if(playIcon) playIcon.classList.remove('hidden');
    if(pauseIcon) pauseIcon.classList.add('hidden');
    if(slider) slider.value = 0;
    
    if(timeEl) {
        const currEl = timeEl.querySelector('.current-time');
        const sepEl = timeEl.querySelector('.time-separator');
        const totalEl = timeEl.querySelector('.total-time');
        
        if (audio.duration && audio.duration !== Infinity && timeEl.dataset.total) {
             if (currEl) {
                 currEl.textContent = timeEl.dataset.total;
                 sepEl.classList.add('hidden');
                 totalEl.textContent = '';
             } else {
                 timeEl.textContent = timeEl.dataset.total;
             }
        } else {
             if (currEl) currEl.textContent = '0:00';
             else timeEl.textContent = '0:00';
        }
    }
};// Auto-focus on typing
document.addEventListener('keydown', function(e) {
    const dmChatArea = document.getElementById('dm-chat-area');
    if (dmChatArea && dmChatArea.style.display !== 'none') {
        const input = document.getElementById('dm-input');
        if (input && document.activeElement !== input && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
            if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.length === 1) {
                input.focus();
            }
        }
    }
});
