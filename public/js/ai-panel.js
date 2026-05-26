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
    let onTypewriterComplete = null;

    // ─────────────────────────────────────────────
    //  Dot FX Canvas — lightweight, stops when idle
    // ─────────────────────────────────────────────
    let _dc = null, _dx = null, _dd = [], _dId = null;
    let _dA = 0, _dOn = false;
    let _dcW = 0, _dcH = 0;
    let _dDPR = 1;
    let _focused = true;

    function _dotInit() {
        if (_dc) return;
        _dc = document.createElement('canvas');
        _dc.id = 'dot-fx-canvas';
        _dc.style.cssText = 'position:sticky;top:0;left:0;width:100%;max-width:100%;pointer-events:none;z-index:-1;display:block;overflow:hidden;';
        _dx = _dc.getContext('2d');
        scrollArea.insertBefore(_dc, scrollArea.firstChild);
        _dotResize();
        new ResizeObserver(_dotResize).observe(scrollArea);
        // Redraw idle dots after dark mode toggle
        const dmBtn = document.getElementById('dark-mode-btn');
        if (dmBtn) dmBtn.addEventListener('click', () => {
            requestAnimationFrame(() => { if (!_dId) _dotDrawOnce(); });
        });

        // Smart visibility change and blur/focus management (Zero idle CPU)
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
                if (_dId) { cancelAnimationFrame(_dId); _dId = null; }
            } else {
                if (_focused && (_dOn || _dA > 0.01)) {
                    if (!_dId) _dId = requestAnimationFrame(_dotLoop);
                }
            }
        });

        window.addEventListener('blur', () => {
            _focused = false;
            if (_dId) { cancelAnimationFrame(_dId); _dId = null; }
        });

        window.addEventListener('focus', () => {
            _focused = true;
            if (document.visibilityState !== 'hidden' && (_dOn || _dA > 0.01)) {
                if (!_dId) _dId = requestAnimationFrame(_dotLoop);
            }
        });
    }

    function _dotResize() {
        if (!_dc) return;
        const isMobile = window.innerWidth < 768;
        _dDPR   = Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 2);

        _dcW = scrollArea.clientWidth  || window.innerWidth;
        _dcH = scrollArea.clientHeight || window.innerHeight;

        _dc.width  = Math.ceil(_dcW * _dDPR);
        _dc.height = Math.ceil(_dcH * _dDPR);
        _dc.style.width  = _dcW + 'px';
        _dc.style.height = _dcH + 'px';
        _dc.style.marginBottom = '-' + _dcH + 'px';
        _dx.setTransform(_dDPR, 0, 0, _dDPR, 0, 0);

        const numParticles = isMobile ? 35 : 65;
        _dd = [];
        for (let i = 0; i < numParticles; i++) {
            _dd.push({
                x: Math.random() * _dcW,
                y: Math.random() * _dcH,
                vx: (Math.random() - 0.5) * 0.45,
                vy: (Math.random() - 0.5) * 0.45,
                radius: 1.1 + Math.random() * 1.5,
                phase: Math.random() * Math.PI * 2,
                pulseSpeed: 1.2 + Math.random() * 1.8,
                hue: Math.random() * 360,
                bx: 0,
                by: 0
            });
        }
        _dotDrawOnce();
        if (!_dId && _focused && (_dOn || _dA > 0.01)) _dId = requestAnimationFrame(_dotLoop);
    }

    function _dotDrawOnce() {
        _dotDraw(_dA, performance.now() / 1000);
    }

    function _dotStart() {
        if (!_dc) _dotInit();
        _dOn = true;
        if (!_dId && _focused && document.visibilityState !== 'hidden') {
            _dId = requestAnimationFrame(_dotLoop);
        }
    }
    function _dotStop() { _dOn = false; }

    function _dotLoop(ts) {
        _dId = null;
        if (!_dx) return;

        const t = ts / 1000;
        const hasBlast = _dd.some(d => (d.bx && Math.abs(d.bx) > 0.05) || (d.by && Math.abs(d.by) > 0.05));

        _dA += ((_dOn ? 1 : 0) - _dA) * 0.045;
        _dotDraw(_dA, t);

        if (_focused && document.visibilityState !== 'hidden' && (_dOn || _dA > 0.01 || hasBlast)) {
            _dId = requestAnimationFrame(_dotLoop);
        }
    }

    function _dotDraw(alpha, t) {
        if (!_dx || !_dc || _dd.length === 0) return;
        const dk = document.documentElement.classList.contains('dark');
        const isMobile = window.innerWidth < 768;
        _dx.clearRect(0, 0, _dcW, _dcH);

        const speedMult = _dOn ? 2.6 : 1.0;

        // 1. Update positions & Wrap bounds
        for (const d of _dd) {
            if (d.bx) {
                d.bx *= 0.92;
                if (Math.abs(d.bx) < 0.05) d.bx = 0;
            }
            if (d.by) {
                d.by *= 0.92;
                if (Math.abs(d.by) < 0.05) d.by = 0;
            }

            // Apply minor organic Brownian drift to velocities
            d.vx += (Math.random() - 0.5) * 0.018;
            d.vy += (Math.random() - 0.5) * 0.018;

            // Clamp velocity to keep drift smooth and readable
            const maxDrift = 0.55;
            const speed = Math.hypot(d.vx, d.vy);
            if (speed > maxDrift) {
                d.vx = (d.vx / speed) * maxDrift;
                d.vy = (d.vy / speed) * maxDrift;
            }

            d.x += d.vx * speedMult + (d.bx || 0);
            d.y += d.vy * speedMult + (d.by || 0);

            if (d.x < -15) d.x = _dcW + 15;
            if (d.x > _dcW + 15) d.x = -15;
            if (d.y < -15) d.y = _dcH + 15;
            if (d.y > _dcH + 15) d.y = -15;
        }

        // 2. Draw Constellation Connecting Lines
        const maxDist = isMobile ? 75 : 95;
        _dx.lineWidth = 0.55;
        for (let i = 0; i < _dd.length; i++) {
            const p1 = _dd[i];
            for (let j = i + 1; j < _dd.length; j++) {
                const p2 = _dd[j];
                const dx = p1.x - p2.x;
                const dy = p1.y - p2.y;
                const dist = Math.hypot(dx, dy);
                if (dist < maxDist) {
                    const lineAlpha = (1 - dist / maxDist) * (dk ? 0.09 : 0.16);
                    if (lineAlpha > 0.01) {
                        _dx.beginPath();
                        _dx.moveTo(p1.x, p1.y);
                        _dx.lineTo(p2.x, p2.y);
                        if (dk) {
                            _dx.strokeStyle = `rgba(129, 140, 248, ${lineAlpha})`;
                        } else {
                            _dx.strokeStyle = `rgba(99, 102, 241, ${lineAlpha})`;
                        }
                        _dx.stroke();
                    }
                }
            }
        }

        // 3. Draw Particles with pulse & glow
        for (const d of _dd) {
            const pulse = 0.5 + 0.5 * Math.sin(t * d.pulseSpeed + d.phase);
            const r = d.radius + pulse * 0.5 + (_dOn ? 0.35 : 0);

            _dx.beginPath();
            _dx.arc(d.x, d.y, r, 0, Math.PI * 2);

            let colorStr;
            if (dk) {
                const hue = (d.hue + t * 12) % 360;
                colorStr = `hsla(${hue}, 85%, 78%, ${0.28 + 0.22 * pulse})`;
                _dx.fillStyle = colorStr;
                _dx.fill();

                if (_dOn) {
                    _dx.beginPath();
                    _dx.arc(d.x, d.y, r * 2.5, 0, Math.PI * 2);
                    _dx.fillStyle = `hsla(${hue}, 85%, 78%, ${(0.07 + 0.04 * pulse)})`;
                    _dx.fill();
                }
            } else {
                const hue = (d.hue + t * 8) % 360;
                colorStr = `hsla(${hue}, 75%, 52%, ${0.52 + 0.22 * pulse})`;
                _dx.fillStyle = colorStr;
                _dx.fill();

                if (_dOn) {
                    _dx.beginPath();
                    _dx.arc(d.x, d.y, r * 2.5, 0, Math.PI * 2);
                    _dx.fillStyle = `hsla(${hue}, 75%, 52%, ${(0.10 + 0.04 * pulse)})`;
                    _dx.fill();
                }
            }
        }
    }

    function _triggerTextBlast() {
        if (!_dc || !_dx || _dd.length === 0) return;

        // Blast origins from bottom center (where input area is)
        const blastX = _dcW / 2;
        const blastY = _dcH;

        for (const d of _dd) {
            const dx = d.x - blastX;
            const dy = d.y - blastY;
            const dist = Math.hypot(dx, dy);

            // Stronger push close to source, fading over distance
            const force = Math.max(1, 450 / (dist + 80));
            const angle = Math.atan2(dy, dx) + (Math.random() - 0.5) * 0.25;

            d.bx = Math.cos(angle) * force * 18;
            d.by = Math.sin(angle) * force * 18;
        }

        if (!_dId) {
            _dId = requestAnimationFrame(_dotLoop);
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

    function updateSendBtn() {
        const hasText = bottomInput.value.trim().length > 0;
        bottomSend.disabled      = !hasText;
        bottomSend.style.opacity = !hasText ? '0.4' : '1';
    }
    bottomInput.addEventListener('input',    updateSendBtn);
    bottomInput.addEventListener('keyup',    updateSendBtn);
    bottomInput.addEventListener('change',   updateSendBtn);
    bottomInput.addEventListener('focus',    updateSendBtn);
    bottomInput.addEventListener('blur',     updateSendBtn);
    bottomInput.addEventListener('paste',    () => setTimeout(updateSendBtn, 10));
    bottomInput.addEventListener('touchend', () => setTimeout(updateSendBtn, 50));

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
    //  Send handler
    // ─────────────────────────────────────────────
    function handleSend() {
        const text = bottomInput.value.trim();
        if (!text) return;
        if (!window.currentChat) { toast('Open a chat first'); return; }

        removeAiActionBar();
        activeChat = getActiveChat();

        appendUserBubble(text);
        bottomInput.value = '';
        updateSendBtn();

        _triggerTextBlast(text);
        const chatBg = document.querySelector('.main-chat-background');
        if (chatBg) {
            chatBg.classList.remove('chat-sending');
            void chatBg.offsetWidth;
            chatBg.classList.add('chat-sending');
            setTimeout(() => chatBg.classList.remove('chat-sending'), 750);
        }

        msgQueue.push({ text, chat: activeChat });
        if (!processing) processQueue();
    }

    // ─────────────────────────────────────────────
    //  Queue processor
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
        if (msgQueue.length > 0) setTimeout(processQueue, 250);
    }

    // ─────────────────────────────────────────────
    //  Core AI request (streaming SSE)
    // ─────────────────────────────────────────────
    async function sendToAI(text, chatFolder) {
        const convId = conversationMap[chatFolder] || null;
        const cName  = contactNameMap[chatFolder]  ||
            (document.getElementById('chat-header-name')?.innerText) || 'AI';

        _dotStart();

        const typingEl = document.createElement('div');
        typingEl.id        = 'ai-typing-inline';
        typingEl.className = 'flex justify-start mb-1.5 animate-message';
        typingEl.innerHTML = `
            <div class="glass-chat-them rounded-2xl rounded-bl-md px-3.5 py-2 max-w-[75%]">
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
                            if (line.startsWith('event:'))     event = line.slice(6).trim();
                            else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
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
                            if (responseBubble) {
                                const timeEl = responseBubble.querySelector('.ai-bubble-time');
                                if (timeEl) timeEl.textContent = formatNow();
                            }
                            onTypewriterComplete = () => {
                                const cleanedText = fullText
                                    .replace(/\[#\d+[^\]\n]*\]/g, '')
                                    .replace(/[ \t]{2,}/g, ' ')
                                    .replace(/\n{3,}/g, '\n\n')
                                    .trim();
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

        const textEl = firstBubble.querySelector('.ai-response-text');
        if (textEl) textEl.textContent = paragraphs[0];

        const maxBubbles = Math.min(paragraphs.length, 4);
        let cumDelay = 180;

        for (let i = 1; i < maxBubbles; i++) {
            const prevLen  = paragraphs[i - 1].length;
            const nextLen  = paragraphs[i].length;
            const readPrev = Math.min(900,  Math.max(250, prevLen * 17));
            const typingMs = Math.min(2400, Math.max(500, nextLen * 33));
            cumDelay += readPrev;

            const para    = paragraphs[i];
            const startAt = cumDelay;
            const isLast  = (i === maxBubbles - 1);

            setTimeout(() => {
                const miniTyping = document.createElement('div');
                miniTyping.className = 'flex justify-start mb-1.5 animate-message';
                miniTyping.innerHTML = `
                    <div class="glass-chat-them rounded-2xl rounded-bl-md px-3.5 py-1.5 max-w-[75%]">
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
        wrap.className = 'flex justify-end mb-1.5 animate-message';
        wrap.innerHTML = `
            <div class="glass-chat-me rounded-2xl rounded-br-md px-3.5 py-2 max-w-[75%]">
                <p style="color:var(--msg-text)" class="text-[14px] leading-normal">${escapeHTML(text)}</p>
                <p style="color:var(--msg-time-me)" class="text-[9px] text-right mt-0.5">${time}</p>
            </div>`;
        chatContainer.appendChild(wrap);
        scrollArea.scrollTop = scrollArea.scrollHeight;
    }

    function appendContactBubble(name, timestamp) {
        const time = formatTime(timestamp);
        const wrap = document.createElement('div');
        wrap.className = 'flex justify-start mb-1.5 animate-message-ai';
        wrap.innerHTML = `
            <div class="glass-chat-them rounded-2xl rounded-bl-md px-3.5 py-2 max-w-[75%]">
                <p class="text-[10px] font-bold mb-0.5 tracking-wide" style="color: #6366f1">${escapeHTML(name || 'AI')}</p>
                <p style="color:var(--msg-text)" class="ai-response-text text-[14px] leading-normal"></p>
                <p style="color:var(--msg-time-them)" class="ai-bubble-time text-[9px] text-right mt-0.5">${time}</p>
            </div>`;
        chatContainer.appendChild(wrap);
        scrollArea.scrollTop = scrollArea.scrollHeight;
        return wrap;
    }

    function appendErrorBubble(msg) {
        const wrap = document.createElement('div');
        wrap.className = 'flex justify-center mb-1.5 animate-message';
        wrap.innerHTML = `
            <div class="bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/40 rounded-xl px-4 py-2 text-sm font-semibold text-red-800 dark:text-red-300 max-w-[85%] text-center">
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
    //  Sparkle button
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

        picker.innerHTML = `
            <div class="flex items-center justify-between mb-2 px-1">
                <span class="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">Saved conversations</span>
                <button id="ai-new-conv-btn" class="text-[11px] font-bold text-indigo-500 hover:text-indigo-400 flex items-center gap-1 transition">
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
            item.className = `ai-conv-item flex items-center gap-2 rounded-xl px-3 py-2 cursor-pointer transition ${isActive ? 'bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-500/40' : 'bg-white/60 dark:bg-white/5 border border-gray-100 dark:border-white/10 hover:bg-gray-50 dark:hover:bg-white/10'}`;
            item.dataset.convId = conv.id;
            item.innerHTML = `
                <div class="flex-1 min-w-0">
                    <p class="text-[11px] font-bold truncate ${isActive ? 'text-indigo-700 dark:text-indigo-300' : 'text-gray-700 dark:text-gray-300'}">${escapeHTML(conv.title || 'Conversation ' + (idx + 1))}</p>
                    <p class="text-[10px] opacity-40">${_fmtConvDate(conv.updated_at)} · ${conv.msg_count} msgs</p>
                </div>
                ${isActive ? '<span class="text-[9px] font-bold text-indigo-500 bg-indigo-100 px-1.5 py-0.5 rounded-full shrink-0">active</span>' : `<button class="conv-load-btn text-[11px] font-bold text-indigo-600 hover:text-indigo-800 shrink-0 px-2 py-1 rounded-lg hover:bg-indigo-50 transition" data-cid="${conv.id}">Load</button>`}
                <button class="conv-del-btn text-[11px] text-gray-400 hover:text-red-500 shrink-0 px-1 transition" data-cid="${conv.id}" title="Delete">✕</button>`;
            list.appendChild(item);
        });

        list.querySelectorAll('.conv-load-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const cid = Number(btn.dataset.cid);
                conversationMap[chatFolder] = cid;
                const msgs = chatContainer.querySelectorAll('.flex.justify-start,.flex.justify-end,.flex.justify-center');
                msgs.forEach(m => m.remove());
                await _loadConvMessages(cid, chatFolder);
                await window.kothaLoadAiHistory(chatFolder);
            });
        });

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
                    await window.kothaLoadAiHistory(chatFolder);
                    toast('Conversation deleted');
                } catch {}
            });
        });

        picker.querySelector('#ai-new-conv-btn').addEventListener('click', () => {
            delete conversationMap[chatFolder];
            const msgs = chatContainer.querySelectorAll('.flex.justify-start,.flex.justify-end,.flex.justify-center');
            msgs.forEach(m => m.remove());
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
        chatContainer.innerHTML = '';
        try {
            const resp = await fetch(`/api/ai/conversations?chat=${encodeURIComponent(chatFolder)}`);
            if (!resp.ok) return;
            const convs = await resp.json();
            await _renderConvPicker(convs, chatFolder);
            if (convs && convs.length > 0) {
                if (!conversationMap[chatFolder]) {
                    conversationMap[chatFolder] = convs[0].id;
                }
                await _loadConvMessages(conversationMap[chatFolder], chatFolder);
            }
        } catch (e) {
            console.error('Failed to load AI history', e);
        }
    };

    window.kothaToast = toast;

    // Disable browser context menu on chat messages — prevents "Share as image" etc.
    const _noCtx = e => e.preventDefault();
    chatContainer.addEventListener('contextmenu', _noCtx);
    document.getElementById('chat-container')?.addEventListener('contextmenu', _noCtx);
    scrollArea.addEventListener('contextmenu', e => {
        // Allow context menu on inputs/textareas only
        if (e.target.matches('input,textarea,select')) return;
        e.preventDefault();
    });

    // Init dot canvas on load (draws once, then loop stops — zero idle CPU)
    _dotInit();
})();
