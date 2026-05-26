(function () {
    const chatContainer = document.getElementById('ai-chat-container');
    const scrollArea    = document.getElementById('chat-scroll-area');
    const bottomInput   = document.getElementById('bottom-ai-input');
    const bottomSend    = document.getElementById('bottom-ai-send');

    if (!bottomInput || !bottomSend || !chatContainer || !scrollArea) return;

    // Per-chat conversation tracking
    let conversationMap  = {};   // { chatFolder: conversationId }
    let contactNameMap   = {};   // { chatFolder: contactName }
    let activeChat       = null;

    // Message queue — lets user send multiple messages while AI is still responding
    let msgQueue   = [];     // { text, chat }[]
    let processing = false;  // true while one AI request is in-flight

    // Typewriter state
    let typeQueue           = '';
    let typeTimer           = null;
    let typeTarget          = null;
    let typeCursor          = null;
    let typeScrollArea      = null;
    let streamFinished      = false;
    let onTypewriterComplete = null;  // fired once typewriter drains after stream ends

    // ─────────────────────────────────────────────
    //  Dot FX Canvas — always-on per-dot pulse + color wave on AI reply
    // ─────────────────────────────────────────────
    let _dc = null, _dx = null, _dd = [], _dId = null, _dA = 0, _dOn = false, _dLastT = 0;
    const _DSP = 22;

    function _dotInit() {
        if (_dc) return;
        _dc = document.createElement('canvas');
        _dc.id = 'dot-fx-canvas';
        _dc.style.cssText = 'position:sticky;top:0;left:0;width:100%;pointer-events:none;z-index:-1;display:block;';
        _dx = _dc.getContext('2d');
        scrollArea.insertBefore(_dc, scrollArea.firstChild);
        _dotResize();
        new ResizeObserver(_dotResize).observe(scrollArea);
        new MutationObserver(() => { if (_dc) _dotDraw(_dA, performance.now() / 1000); })
            .observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    }

    function _dotResize() {
        if (!_dc) return;
        const w = scrollArea.clientWidth, h = scrollArea.clientHeight;
        _dc.width  = Math.ceil(w);
        _dc.height = Math.ceil(h);
        _dc.style.marginBottom = `-${Math.ceil(h)}px`;
        _dd = [];
        for (let x = _DSP / 2; x < w; x += _DSP) {
            for (let y = _DSP / 2; y < h; y += _DSP) {
                _dd.push({
                    x, y,
                    phase:      (x + y) * 0.013 + Math.random() * 1.4,
                    speed:      0.45 + Math.random() * 0.85,
                    hueBase:    Math.random() * 360,
                    pulseSpeed: 0.7 + Math.random() * 1.5,  // individual pulse rhythm
                    sparkle:    0,                            // sparkle decay value
                });
            }
        }
        _dotDraw(_dA, performance.now() / 1000);
        if (!_dId) _dId = requestAnimationFrame(_dotLoop);
    }

    function _dotStart() {
        if (!_dc) _dotInit();
        _dOn = true;
        if (!_dId) _dId = requestAnimationFrame(_dotLoop);
    }

    function _dotStop() { _dOn = false; }

    function _dotLoop(ts) {
        if (!_dx) { _dId = null; return; }
        const t = ts / 1000;

        // Throttle idle to ~25fps to save CPU; full 60fps during AI reply
        const IDLE_MS = 40;
        if (!_dOn && _dA < 0.02 && (ts - _dLastT) < IDLE_MS) {
            _dId = requestAnimationFrame(_dotLoop);
            return;
        }
        _dLastT = ts;

        _dA += ((_dOn ? 1 : 0) - _dA) * 0.045;
        _dotDraw(_dA, t);
        _dId = requestAnimationFrame(_dotLoop);
    }

    function _dotDraw(alpha, t) {
        if (!_dx || !_dc || _dd.length === 0) return;
        const dk = document.documentElement.classList.contains('dark');
        const w  = _dc.width, h = _dc.height;
        _dx.clearRect(0, 0, w, h);

        for (const d of _dd) {
            // Individual pulse: each dot breathes at its own rhythm (always active)
            const pulse = 0.5 + 0.5 * Math.sin(t * d.pulseSpeed + d.phase * 2.1);

            // Random sparkle flash
            if (Math.random() < 0.00025) d.sparkle = 1;
            d.sparkle *= 0.82;
            const sp = d.sparkle;

            // Dot radius grows slightly on AI reply and sparkle
            const r = 0.9 + alpha * 0.5 + sp * 0.7;

            _dx.beginPath();
            _dx.arc(d.x, d.y, r, 0, Math.PI * 2);

            if (alpha < 0.025) {
                // ── IDLE: neutral dots with individual pulse + faint hue drift
                const idleHue = (d.hueBase + t * 5) % 360;   // very slow color drift
                const idleSat = dk ? 12 : 18;                  // nearly desaturated
                const idleLit = dk ? 72 : 62;
                const base    = dk ? 0.03 + 0.035 * pulse : 0.50 + 0.38 * pulse;
                const a       = Math.min(1, base + sp * 0.45);
                _dx.fillStyle = `hsla(${idleHue},${idleSat}%,${idleLit}%,${a})`;
            } else {
                // ── AI ACTIVE: vivid per-dot color wave
                const wave = d.phase + t * d.speed;
                const hue  = (d.hueBase + wave * 52) % 360;
                const sat  = 72 + 12 * pulse;
                const lit  = dk ? 52 + 16 * pulse : 52 + 20 * pulse;

                // Neutral layer fading out
                const nA = dk ? 0.04 * (1 - alpha) : 0.88 * (1 - alpha * 0.88);
                if (nA > 0.008) {
                    _dx.fillStyle = dk ? `rgba(255,255,255,${nA})` : `rgba(209,213,219,${nA})`;
                    _dx.fill();
                    _dx.beginPath();
                    _dx.arc(d.x, d.y, r, 0, Math.PI * 2);
                }

                // Colored layer
                const cA = (dk ? 0.28 : 0.80) * alpha * (0.55 + 0.45 * pulse) + sp * 0.35;
                _dx.fillStyle = `hsla(${hue},${sat}%,${lit}%,${Math.min(1, cA)})`;
            }
            _dx.fill();
        }
    }

    // ─────────────────────────────────────────────
    //  Typewriter engine
    // ─────────────────────────────────────────────
    function startTypewriter(targetEl, scrollEl) {
        typeQueue      = '';
        typeTarget     = targetEl;
        typeScrollArea = scrollEl;
        streamFinished = false;
        typeCursor     = document.createElement('span');
        typeCursor.className   = 'ai-cursor-blink';
        typeCursor.textContent = '▎';
        targetEl.after(typeCursor);
    }

    function feedTypewriter(text) {
        typeQueue += text;
        if (!typeTimer) drainQueue();
    }

    function drainQueue() {
        if (!typeTarget || typeQueue.length === 0) {
            typeTimer = null;
            if (streamFinished) cleanupTypewriter();
            return;
        }
        // 1-3 chars per tick for natural feel
        const chunk = typeQueue.slice(0, Math.random() > 0.7 ? 3 : 1);
        typeQueue = typeQueue.slice(chunk.length);
        typeTarget.textContent += chunk;
        if (typeScrollArea) typeScrollArea.scrollTop = typeScrollArea.scrollHeight;
        typeTimer = setTimeout(drainQueue, 15 + Math.random() * 15);
    }

    function finishStream() {
        streamFinished = true;
        if (!typeTimer && typeQueue.length === 0) cleanupTypewriter();
    }

    function cleanupTypewriter() {
        if (typeCursor)     { typeCursor.remove(); typeCursor = null; }
        if (typeScrollArea) typeScrollArea.scrollTop = typeScrollArea.scrollHeight;
        typeTarget     = null;
        typeScrollArea = null;
        updateSendBtn();

        // Fire completion callback (used for multi-bubble split)
        if (onTypewriterComplete) {
            const cb = onTypewriterComplete;
            onTypewriterComplete = null;
            cb();
        }
    }

    function stopTypewriterInstantly() {
        if (typeTimer) { clearTimeout(typeTimer); typeTimer = null; }
        if (typeTarget && typeQueue.length > 0) {
            typeTarget.textContent += typeQueue;
            typeQueue = '';
        }
        cleanupTypewriter();
    }

    // ─────────────────────────────────────────────
    //  Helpers
    // ─────────────────────────────────────────────
    function getActiveChat()   { return window.currentChat || null; }
    function getCurrentConvId(){ return activeChat ? (conversationMap[activeChat] || null) : null; }
    function getContactName()  { return activeChat ? (contactNameMap[activeChat] || '') : ''; }

    // Send button: only disabled when input is empty
    // (user can send while AI is responding — queue handles ordering)
    function updateSendBtn() {
        const hasText = bottomInput.value.trim().length > 0;
        bottomSend.disabled    = !hasText;
        bottomSend.style.opacity = !hasText ? '0.4' : '1';
    }
    bottomInput.addEventListener('input',   updateSendBtn);
    bottomInput.addEventListener('keyup',   updateSendBtn);
    bottomInput.addEventListener('change',  updateSendBtn);
    bottomInput.addEventListener('focus',   updateSendBtn);
    bottomInput.addEventListener('blur',    updateSendBtn);
    bottomInput.addEventListener('paste',   () => setTimeout(updateSendBtn, 10));
    bottomInput.addEventListener('touchend',() => setTimeout(updateSendBtn, 50));
    setInterval(updateSendBtn, 500);

    bottomInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); handleSend(); }
    });
    bottomSend.addEventListener('click', () => {
        if (bottomInput.value.trim()) handleSend();
    });
    bottomSend.addEventListener('touchend', (e) => {
        e.preventDefault();
        if (bottomInput.value.trim()) handleSend();
    });

    // ─────────────────────────────────────────────
    //  Send handler — adds to queue, never blocks
    // ─────────────────────────────────────────────
    function handleSend() {
        const text = bottomInput.value.trim();
        if (!text) return;
        if (!window.currentChat) { toast('Open a chat first'); return; }

        removeAiActionBar();
        activeChat = getActiveChat();

        // Show user's bubble immediately — no waiting for AI
        appendUserBubble(text);
        bottomInput.value = '';
        updateSendBtn();

        // Brief color pulse on the chat background dots
        const chatBg = document.querySelector('.main-chat-background');
        if (chatBg) {
            chatBg.classList.remove('chat-sending');          // reset if already active
            void chatBg.offsetWidth;                          // force reflow so animation re-triggers
            chatBg.classList.add('chat-sending');
            setTimeout(() => chatBg.classList.remove('chat-sending'), 750);
        }

        // Queue the request
        msgQueue.push({ text, chat: activeChat });

        // Kick off queue processor if idle
        if (!processing) processQueue();
    }

    // ─────────────────────────────────────────────
    //  Queue processor — one AI request at a time
    // ─────────────────────────────────────────────
    async function processQueue() {
        if (processing || msgQueue.length === 0) return;
        processing = true;

        const item = msgQueue.shift();
        activeChat = item.chat;

        try {
            await sendToAI(item.text, item.chat);
        } catch (e) {
            console.error('processQueue error:', e);
        }

        processing = false;

        // Small gap before next message, feels more natural
        if (msgQueue.length > 0) setTimeout(processQueue, 250);
    }

    // ─────────────────────────────────────────────
    //  Core AI request (streaming SSE)
    // ─────────────────────────────────────────────
    async function sendToAI(text, chatFolder) {
        const convId = conversationMap[chatFolder] || null;
        const cName  = contactNameMap[chatFolder]  ||
            (document.getElementById('chat-header-name')?.innerText) || 'AI';

        // Activate dot color wave — lights up individual dots while AI thinks
        _dotStart();

        // Typing indicator
        const typingEl = document.createElement('div');
        typingEl.id        = 'ai-typing-inline';
        typingEl.className = 'flex justify-start mb-3 animate-message';
        typingEl.innerHTML = `
            <div class="glass-chat-them rounded-2xl rounded-bl-md px-4 py-3 max-w-[75%]">
                <div class="flex items-center gap-2 mb-1">
                    <p class="text-[11px] font-bold tracking-wide" style="color: #6366f1">${escapeHTML(cName)}</p>
                    <span class="text-[10px] text-emerald-500 font-semibold">typing...</span>
                </div>
                <div class="ai-typing"><span></span><span></span><span></span></div>
            </div>`;
        chatContainer.appendChild(typingEl);
        scrollArea.scrollTop = scrollArea.scrollHeight;

        let fullText      = '';
        let responseBubble = null;

        return new Promise(async (resolve) => {
            try {
                const resp = await fetch('/api/ai/chat', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ chat: chatFolder, message: text, conversationId: convId }),
                });

                if (!resp.ok) {
                    let errMsg = `Error ${resp.status}`;
                    try { errMsg = (await resp.json()).error || errMsg; } catch {}
                    typingEl.remove();
                    appendErrorBubble(errMsg);
                    return resolve();
                }

                const reader  = resp.body.getReader();
                const decoder = new TextDecoder();
                let buf = '';

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    buf += decoder.decode(value, { stream: true });

                    let idx;
                    while ((idx = buf.indexOf('\n\n')) !== -1) {
                        const block = buf.slice(0, idx);
                        buf = buf.slice(idx + 2);

                        let event = 'message';
                        let dataLines = [];
                        for (const line of block.split('\n')) {
                            if (line.startsWith('event:'))      event = line.slice(6).trim();
                            else if (line.startsWith('data:'))  dataLines.push(line.slice(5).trim());
                        }
                        if (!dataLines.length) continue;
                        let data;
                        try { data = JSON.parse(dataLines.join('\n')); } catch { continue; }

                        if (event === 'start') {
                            if (chatFolder) {
                                conversationMap[chatFolder] = data.conversationId;
                                if (data.contactName) contactNameMap[chatFolder] = data.contactName;
                            }
                        } else if (event === 'token') {
                            if (!responseBubble) {
                                typingEl.remove();
                                responseBubble = appendContactBubble(
                                    (chatFolder && contactNameMap[chatFolder]) || data.contactName || 'AI'
                                );
                                startTypewriter(
                                    responseBubble.querySelector('.ai-response-text'),
                                    scrollArea
                                );
                            }
                            fullText += data.text;
                            feedTypewriter(data.text);

                        } else if (event === 'done') {
                            // Update timestamp on first bubble
                            if (responseBubble) {
                                const timeEl = responseBubble.querySelector('.ai-bubble-time');
                                if (timeEl) timeEl.textContent = formatNow();
                            }
                            // After typewriter drains: clean up any leaked context headers,
                            // then split multi-paragraph into separate bubbles
                            onTypewriterComplete = () => {
                                // Strip [#id date time sender] context metadata that AI should never output
                                const cleanedText = fullText
                                    .replace(/\[#\d+[^\]\n]*\]/g, '')
                                    .replace(/[ \t]{2,}/g, ' ')
                                    .replace(/\n{3,}/g, '\n\n')
                                    .trim();

                                // If text was dirty, update the already-rendered bubble
                                if (cleanedText !== fullText && responseBubble) {
                                    const textEl = responseBubble.querySelector('.ai-response-text');
                                    if (textEl) textEl.textContent = cleanedText;
                                }

                                splitIntoBubbles(
                                    cleanedText, responseBubble,
                                    (chatFolder && contactNameMap[chatFolder]) || cName,
                                    () => { _dotStop(); resolve(); }
                                );
                            };
                            finishStream();

                        } else if (event === 'error') {
                            typingEl.remove();
                            appendErrorBubble(data.message || 'Something went wrong');
                            onTypewriterComplete = null;
                            stopTypewriterInstantly();
                            _dotStop();
                            resolve();
                        }
                    }
                }
            } catch (err) {
                typingEl.remove();
                appendErrorBubble('Network error. Try again?');
                onTypewriterComplete = null;
                stopTypewriterInstantly();
                _dotStop();
                resolve();
            } finally {
                bottomInput.focus();
            }
        });
    }

    // ─────────────────────────────────────────────
    //  Multi-bubble split
    //  AI sends separate "messages" separated by \n\n.
    //  Each one gets its own bubble with realistic typing delay.
    // ─────────────────────────────────────────────
    function splitIntoBubbles(fullText, firstBubble, contactName, onAllDone) {
        const paragraphs = fullText
            .split(/\n\n+/)
            .map(p => p.trim())
            .filter(p => p.length > 0);

        if (paragraphs.length <= 1 || !firstBubble) {
            onAllDone?.();
            return;
        }

        // Update first bubble to only the first paragraph
        const textEl = firstBubble.querySelector('.ai-response-text');
        if (textEl) textEl.textContent = paragraphs[0];

        const maxBubbles = Math.min(paragraphs.length, 4); // max 4 messages at once

        // Schedule each extra bubble with realistic cumulative delay.
        // Delay = reading the previous message (~18ms/char) + typing next message (~32ms/char)
        let cumDelay = 180; // small pause after first bubble finishes
        for (let i = 1; i < maxBubbles; i++) {
            const prevLen = paragraphs[i - 1].length;
            const nextLen = paragraphs[i].length;
            // How long user "reads" previous bubble, then how long to "type" next
            const readPrev  = Math.min(900,  Math.max(250, prevLen * 17));
            const typingMs  = Math.min(2400, Math.max(500, nextLen * 33));
            cumDelay += readPrev;

            const para      = paragraphs[i];
            const startAt   = cumDelay;
            const isLast    = (i === maxBubbles - 1);

            setTimeout(() => {
                // Show mini typing indicator sized to the message length
                const miniTyping = document.createElement('div');
                miniTyping.className = 'flex justify-start mb-1 animate-message';
                miniTyping.innerHTML = `
                    <div class="glass-chat-them rounded-2xl rounded-bl-md px-4 py-2 max-w-[75%]">
                        <div class="ai-typing"><span></span><span></span><span></span></div>
                    </div>`;
                chatContainer.appendChild(miniTyping);
                scrollArea.scrollTop = scrollArea.scrollHeight;

                setTimeout(() => {
                    miniTyping.remove();
                    const extra = appendContactBubble(contactName);
                    extra.querySelector('.ai-response-text').textContent = para;
                    const tEl = extra.querySelector('.ai-bubble-time');
                    if (tEl) tEl.textContent = formatNow();
                    scrollArea.scrollTop = scrollArea.scrollHeight;
                    if (isLast) onAllDone?.();
                }, typingMs);
            }, startAt);

            cumDelay += typingMs;
        }
    }

    // ─────────────────────────────────────────────
    //  Continue / Reset bar
    // ─────────────────────────────────────────────
    function showAiActionBar(convId, msgCount) {
        removeAiActionBar();
        const bar = document.createElement('div');
        bar.id        = 'ai-action-bar';
        bar.className = 'flex items-center justify-center gap-3 py-3 animate-message';
        bar.innerHTML = `
            <div class="flex items-center gap-2 bg-white rounded-full px-2 py-1.5 shadow-sm border border-gray-200">
                <button id="ai-continue-btn" class="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-full transition">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
                    Continue (${msgCount} msgs)
                </button>
                <button id="ai-reset-btn" class="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-full transition">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8M3 3v5h5"/></svg>
                    New chat
                </button>
            </div>`;
        chatContainer.appendChild(bar);

        document.getElementById('ai-continue-btn').addEventListener('click', () => {
            removeAiActionBar();
            bottomInput.focus();
            toast('Continuing previous conversation');
        });
        document.getElementById('ai-reset-btn').addEventListener('click', () => {
            // Start fresh without deleting — old conversation stays accessible in history
            if (activeChat) delete conversationMap[activeChat];
            const msgs = chatContainer.querySelectorAll('.flex.justify-start,.flex.justify-end,.flex.justify-center');
            msgs.forEach(m => m.remove());
            toast('New conversation — previous saved in history');
            bottomInput.focus();
        });

        scrollArea.scrollTop = scrollArea.scrollHeight;
    }

    function removeAiActionBar() {
        const el = document.getElementById('ai-action-bar');
        if (el) el.remove();
    }

    // ─────────────────────────────────────────────
    //  Time helpers
    // ─────────────────────────────────────────────
    function formatTime(ts) {
        if (!ts) return formatNow();
        const d = new Date(typeof ts === 'number' ? ts : parseInt(ts));
        if (isNaN(d.getTime())) return formatNow();
        return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
    }
    function formatNow() {
        return new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
    }

    // ─────────────────────────────────────────────
    //  Bubble helpers
    // ─────────────────────────────────────────────
    function appendUserBubble(text, timestamp) {
        const time = formatTime(timestamp);
        const wrap = document.createElement('div');
        wrap.className = 'flex justify-end mb-3 animate-message';
        wrap.innerHTML = `
            <div class="glass-chat-me rounded-2xl rounded-br-md px-4 py-3 max-w-[75%]">
                <p style="color:var(--msg-text)" class="text-sm leading-relaxed">${escapeHTML(text)}</p>
                <p style="color:var(--msg-time-me)" class="text-[10px] text-right mt-1">${time}</p>
            </div>`;
        chatContainer.appendChild(wrap);
        scrollArea.scrollTop = scrollArea.scrollHeight;
    }

    function appendContactBubble(name, timestamp) {
        const time = formatTime(timestamp);
        const wrap = document.createElement('div');
        wrap.className = 'flex justify-start mb-3 animate-message-ai';
        wrap.innerHTML = `
            <div class="glass-chat-them rounded-2xl rounded-bl-md px-4 py-3 max-w-[75%]">
                <p class="text-[11px] font-bold mb-1 tracking-wide" style="color: #6366f1">${escapeHTML(name || 'AI')}</p>
                <p style="color:var(--msg-text)" class="ai-response-text text-sm leading-relaxed"></p>
                <p style="color:var(--msg-time-them)" class="ai-bubble-time text-[10px] text-right mt-1">${time}</p>
            </div>`;
        chatContainer.appendChild(wrap);
        scrollArea.scrollTop = scrollArea.scrollHeight;
        return wrap;
    }

    function appendErrorBubble(msg) {
        const wrap = document.createElement('div');
        wrap.className = 'flex justify-center mb-3 animate-message';
        wrap.innerHTML = `
            <div class="bg-red-50 border border-red-200 rounded-xl px-4 py-2 text-sm font-medium max-w-[85%] text-center" style="color:var(--msg-text)">
                ${escapeHTML(msg)}
            </div>`;
        chatContainer.appendChild(wrap);
        scrollArea.scrollTop = scrollArea.scrollHeight;
    }

    function escapeHTML(s) {
        return String(s || '').replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
        }[c]));
    }

    function toast(msg) {
        const t = document.createElement('div');
        t.textContent = msg;
        t.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#1f2937;color:white;padding:10px 18px;border-radius:12px;font-size:13px;font-weight:600;z-index:200;box-shadow:0 8px 24px rgba(0,0,0,0.2);opacity:0;transition:opacity 200ms';
        document.body.appendChild(t);
        requestAnimationFrame(() => t.style.opacity = '1');
        setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 250); }, 2400);
    }

    // ─────────────────────────────────────────────
    //  Sparkle button — focus AI input
    // ─────────────────────────────────────────────
    const sparkleBtn = document.getElementById('ask-ai-btn');
    if (sparkleBtn) {
        sparkleBtn.addEventListener('click', () => {
            bottomInput.focus();
            bottomInput.scrollIntoView({ behavior: 'smooth', block: 'end' });
        });
    }

    // ─────────────────────────────────────────────
    //  Conversation Picker + History Loader
    //  Shows last 3 conversations per chat with
    //  Continue / Delete / New options
    // ─────────────────────────────────────────────

    function _fmtConvDate(ts) {
        if (!ts) return '';
        const d = new Date(ts);
        const now = new Date();
        const diff = now - d;
        if (diff < 86400000) return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
        if (diff < 7 * 86400000) return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
        return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' });
    }

    async function _renderConvPicker(convs, chatFolder) {
        const existing = document.getElementById('ai-conv-picker');
        if (existing) existing.remove();

        if (!convs || convs.length === 0) return;

        const top3 = convs.slice(0, 3);
        const picker = document.createElement('div');
        picker.id = 'ai-conv-picker';
        picker.className = 'mb-4';

        const isDark = document.documentElement.classList.contains('dark');

        picker.innerHTML = `
            <div class="flex items-center justify-between mb-2 px-1">
                <span class="text-[10px] font-bold uppercase tracking-widest opacity-40">Saved conversations</span>
                <button id="ai-new-conv-btn" class="text-[11px] font-bold text-indigo-500 hover:text-indigo-700 flex items-center gap-1 transition">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
                    New chat
                </button>
            </div>
            <div id="ai-conv-list" class="flex flex-col gap-1.5"></div>`;

        chatContainer.insertBefore(picker, chatContainer.firstChild);

        const list = picker.querySelector('#ai-conv-list');

        top3.forEach((conv, idx) => {
            const isActive = conversationMap[chatFolder] === conv.id;
            const item = document.createElement('div');
            item.className = `ai-conv-item flex items-center gap-2 rounded-xl px-3 py-2 cursor-pointer transition ${isActive ? 'bg-indigo-50 border border-indigo-200' : 'bg-white/60 border border-gray-100 hover:bg-gray-50'}`;
            item.dataset.convId = conv.id;
            item.innerHTML = `
                <div class="flex-1 min-w-0">
                    <p class="text-[11px] font-bold truncate ${isActive ? 'text-indigo-700' : 'text-gray-700'}">${escapeHTML(conv.title || 'Conversation ' + (idx + 1))}</p>
                    <p class="text-[10px] opacity-50">${_fmtConvDate(conv.updated_at)} · ${conv.msg_count} msgs</p>
                </div>
                ${isActive ? '<span class="text-[9px] font-bold text-indigo-500 bg-indigo-100 px-1.5 py-0.5 rounded-full shrink-0">active</span>' : `<button class="conv-load-btn text-[11px] font-bold text-indigo-600 hover:text-indigo-800 shrink-0 px-2 py-1 rounded-lg hover:bg-indigo-50 transition" data-cid="${conv.id}">Load</button>`}
                <button class="conv-del-btn text-[11px] text-gray-400 hover:text-red-500 shrink-0 px-1 transition" data-cid="${conv.id}" title="Delete">✕</button>`;
            list.appendChild(item);
        });

        // "Load" button — switch to that conversation
        list.querySelectorAll('.conv-load-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const cid = Number(btn.dataset.cid);
                conversationMap[chatFolder] = cid;
                // Clear messages and reload
                const msgs = chatContainer.querySelectorAll('.flex.justify-start,.flex.justify-end,.flex.justify-center');
                msgs.forEach(m => m.remove());
                await _loadConvMessages(cid, chatFolder);
                await window.kothaLoadAiHistory(chatFolder); // re-render picker with new active
            });
        });

        // "Delete" button
        list.querySelectorAll('.conv-del-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const cid = Number(btn.dataset.cid);
                try {
                    await fetch(`/api/ai/conversations/${cid}`, { method: 'DELETE' });
                    if (conversationMap[chatFolder] === cid) {
                        delete conversationMap[chatFolder];
                        const msgs = chatContainer.querySelectorAll('.flex.justify-start,.flex.justify-end,.flex.justify-center');
                        msgs.forEach(m => m.remove());
                    }
                    await window.kothaLoadAiHistory(chatFolder); // refresh
                    toast('Conversation deleted');
                } catch {}
            });
        });

        // "New chat" button — start fresh without deleting anything
        picker.querySelector('#ai-new-conv-btn').addEventListener('click', () => {
            delete conversationMap[chatFolder];
            const msgs = chatContainer.querySelectorAll('.flex.justify-start,.flex.justify-end,.flex.justify-center');
            msgs.forEach(m => m.remove());
            // Re-render picker without an active conversation
            window.kothaLoadAiHistory(chatFolder);
            bottomInput.focus();
            toast('New conversation started');
        });
    }

    async function _loadConvMessages(convId, chatFolder) {
        try {
            const resp = await fetch(`/api/ai/conversations/${convId}`);
            if (!resp.ok) return;
            const data = await resp.json();
            if (!data.messages || data.messages.length === 0) return;

            const headerEl = document.getElementById('chat-header-name');
            const name = contactNameMap[chatFolder] || (headerEl ? headerEl.innerText : 'AI');

            data.messages.forEach(msg => {
                if (msg.role === 'user') {
                    appendUserBubble(msg.content, msg.created_at);
                } else if (msg.role === 'assistant') {
                    const wrap = appendContactBubble(name, msg.created_at);
                    wrap.querySelector('.ai-response-text').textContent = msg.content;
                }
            });
            setTimeout(() => { scrollArea.scrollTop = scrollArea.scrollHeight; }, 50);
        } catch (e) {
            console.error('Load conv messages failed', e);
        }
    }

    window.kothaLoadAiHistory = async (chatFolder) => {
        if (!chatFolder) return;
        activeChat = chatFolder;

        // Full clear: picker + message bubbles
        chatContainer.innerHTML = '';

        try {
            const resp = await fetch(`/api/ai/conversations?chat=${encodeURIComponent(chatFolder)}`);
            if (!resp.ok) return;
            const convs = await resp.json();

            // Render the picker (last 3 conversations)
            await _renderConvPicker(convs, chatFolder);

            if (convs && convs.length > 0) {
                // Auto-load most recent conversation if none active
                if (!conversationMap[chatFolder]) {
                    conversationMap[chatFolder] = convs[0].id;
                    if (convs[0].title) {
                        // Extract contact name from first assistant message if not yet known
                    }
                }
                await _loadConvMessages(conversationMap[chatFolder], chatFolder);
            }
        } catch (e) {
            console.error('Failed to load AI history', e);
        }
    };

    window.kothaToast = toast;

    // Eagerly init dot canvas so neutral dots show from the start
    _dotInit();
})();
