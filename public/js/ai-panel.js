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
    //  Dot FX Canvas — individual per-dot color wave
    //  Activates only while AI is replying, then fades back to neutral
    // ─────────────────────────────────────────────
    let _dc = null, _dx = null, _dd = [], _dId = null, _dA = 0, _dOn = false;
    const _DSP = 22; // dot spacing px

    function _dotInit() {
        if (_dc) return;
        _dc = document.createElement('canvas');
        _dc.id = 'dot-fx-canvas';
        // sticky+z-index:-1 keeps canvas fixed at top of viewport, below all chat content
        _dc.style.cssText = 'position:sticky;top:0;left:0;width:100%;pointer-events:none;z-index:-1;display:block;';
        _dx = _dc.getContext('2d');
        scrollArea.insertBefore(_dc, scrollArea.firstChild);
        _dotResize();
        new ResizeObserver(_dotResize).observe(scrollArea);
        // Redraw when dark/light mode toggles
        new MutationObserver(() => { if (_dc) _dotDraw(_dA); })
            .observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    }

    function _dotResize() {
        if (!_dc) return;
        const w = scrollArea.clientWidth, h = scrollArea.clientHeight;
        _dc.width  = Math.ceil(w);
        _dc.height = Math.ceil(h);
        // Negative margin so canvas doesn't push chat content down
        _dc.style.marginBottom = `-${Math.ceil(h)}px`;
        // Rebuild dot grid — diagonal phase offset creates a wave effect
        _dd = [];
        for (let x = _DSP / 2; x < w; x += _DSP) {
            for (let y = _DSP / 2; y < h; y += _DSP) {
                _dd.push({
                    x, y,
                    phase:   (x + y) * 0.013 + Math.random() * 1.4,
                    speed:   0.45 + Math.random() * 0.85,
                    hueBase: Math.random() * 360,   // each dot gets a unique hue
                });
            }
        }
        _dotDraw(_dA);
    }

    function _dotStart() {
        if (!_dc) _dotInit();
        _dOn = true;
        if (!_dId) _dotLoop();
    }

    function _dotStop() {
        _dOn = false; // loop fades out naturally
    }

    function _dotLoop() {
        if (!_dx) { _dId = null; return; }
        _dA += ((_dOn ? 1 : 0) - _dA) * 0.042;    // smooth alpha lerp
        if (_dA < 0.004 && !_dOn) {
            _dotDraw(0);
            _dId = null;
            return;
        }
        _dotDraw(_dA);
        _dId = requestAnimationFrame(_dotLoop);
    }

    function _dotDraw(alpha) {
        if (!_dx || !_dc || _dd.length === 0) return;
        const dk = document.documentElement.classList.contains('dark');
        const w  = _dc.width, h = _dc.height;
        const t  = performance.now() / 1000;
        _dx.clearRect(0, 0, w, h);

        for (const d of _dd) {
            const wave = d.phase + t * d.speed;
            const hue  = (d.hueBase + wave * 48) % 360; // hue drifts continuously

            _dx.beginPath();
            _dx.arc(d.x, d.y, 1, 0, Math.PI * 2);

            if (alpha < 0.02) {
                // Pure neutral (idle state)
                _dx.fillStyle = dk ? 'rgba(255,255,255,0.04)' : 'rgba(209,213,219,0.88)';
            } else {
                // Cross-fade neutral → colored per dot
                const nA = dk ? 0.04 * (1 - alpha) : 0.88 * (1 - alpha * 0.8);
                const cA = dk ? 0.22 * alpha        : 0.76 * alpha;
                // Draw neutral layer
                _dx.fillStyle = dk ? `rgba(255,255,255,${nA})` : `rgba(209,213,219,${nA})`;
                _dx.fill();
                // Draw colored layer on top
                _dx.beginPath();
                _dx.arc(d.x, d.y, 1, 0, Math.PI * 2);
                _dx.fillStyle = `hsla(${hue},72%,${dk ? 64 : 62}%,${cA})`;
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
        document.getElementById('ai-reset-btn').addEventListener('click', async () => {
            try { await fetch(`/api/ai/conversations/${convId}`, { method: 'DELETE' }); } catch {}
            if (activeChat) delete conversationMap[activeChat];
            chatContainer.innerHTML = '';
            toast('AI chat reset — start fresh!');
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
    //  Load AI history when chat switches
    // ─────────────────────────────────────────────
    window.kothaLoadAiHistory = async (chatFolder) => {
        if (!chatFolder) return;
        chatContainer.innerHTML = '';
        activeChat = chatFolder;

        try {
            const resp = await fetch(`/api/ai/conversations?chat=${encodeURIComponent(chatFolder)}`);
            if (!resp.ok) return;
            const convs = await resp.json();

            if (convs && convs.length > 0) {
                const conv = convs[0];
                conversationMap[chatFolder] = conv.id;

                const msgResp = await fetch(`/api/ai/conversations/${conv.id}`);
                if (!msgResp.ok) return;
                const data = await msgResp.json();

                if (data.messages && data.messages.length > 0) {
                    data.messages.forEach(msg => {
                        if (msg.role === 'user') {
                            appendUserBubble(msg.content, msg.created_at);
                        } else if (msg.role === 'assistant') {
                            const headerEl = document.getElementById('chat-header-name');
                            const name = contactNameMap[chatFolder] || (headerEl ? headerEl.innerText : 'AI');
                            const wrap = appendContactBubble(name, msg.created_at);
                            wrap.querySelector('.ai-response-text').textContent = msg.content;
                        }
                    });

                    showAiActionBar(conv.id, data.messages.length);
                    setTimeout(() => { scrollArea.scrollTop = scrollArea.scrollHeight; }, 50);
                }
            }
        } catch (e) {
            console.error('Failed to load AI history', e);
        }
    };

    window.kothaToast = toast;

    // Eagerly init dot canvas so neutral dots show from the start
    _dotInit();
})();
