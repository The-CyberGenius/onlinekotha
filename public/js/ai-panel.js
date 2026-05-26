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
    let _dDotSp = 22;          // dot spacing (px)
    let _blastLock = false;

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
    }

    function _dotResize() {
        if (!_dc) return;
        const isMobile = window.innerWidth < 768;
        _dDPR   = Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 2);
        _dDotSp = isMobile ? 28 : 22;

        _dcW = scrollArea.clientWidth  || window.innerWidth;
        _dcH = scrollArea.clientHeight || window.innerHeight;

        _dc.width  = Math.ceil(_dcW * _dDPR);
        _dc.height = Math.ceil(_dcH * _dDPR);
        _dc.style.width  = _dcW + 'px';
        _dc.style.height = _dcH + 'px';
        _dc.style.marginBottom = '-' + _dcH + 'px';
        _dx.setTransform(_dDPR, 0, 0, _dDPR, 0, 0);

        _dd = [];
        for (let x = _dDotSp / 2; x < _dcW; x += _dDotSp) {
            for (let y = _dDotSp / 2; y < _dcH; y += _dDotSp) {
                _dd.push({
                    x, y,
                    bX: x, bY: y,
                    phase:      (x + y) * 0.013 + Math.random() * 1.4,
                    speed:      0.45 + Math.random() * 0.85,
                    hueBase:    Math.random() * 360,
                    pulseSpeed: 0.7 + Math.random() * 1.5,
                    sparkle:    0,
                    bs: 0,   // 0=normal 1=glow 2=blasting 3=returning
                    bT: 0,
                    bVx: 0, bVy: 0,
                    glowHue: 240,
                });
            }
        }
        _dotDrawOnce();
        if (!_dId && (_dOn || _dA > 0.01)) _dId = requestAnimationFrame(_dotLoop);
    }

    // Draw exactly one frame — used to paint idle dots without keeping loop alive
    function _dotDrawOnce() {
        _dotDraw(_dA, performance.now() / 1000);
    }

    function _dotStart() {
        if (!_dc) _dotInit();
        _dOn = true;
        if (!_dId) _dId = requestAnimationFrame(_dotLoop);
    }
    function _dotStop() { _dOn = false; }

    function _dotLoop(ts) {
        _dId = null;
        if (!_dx) return;

        const t = ts / 1000;
        const hasBlast = _dd.some(d => d.bs > 0);

        _dA += ((_dOn ? 1 : 0) - _dA) * 0.045;
        _dotDraw(_dA, t);

        // Only keep running while there is something to animate
        if (_dOn || _dA > 0.01 || hasBlast) {
            _dId = requestAnimationFrame(_dotLoop);
        }
        // Loop stops naturally when idle — restarted by _dotStart() or _triggerTextBlast()
    }

    function _dotDraw(alpha, t) {
        if (!_dx || !_dc || _dd.length === 0) return;
        const dk = document.documentElement.classList.contains('dark');
        _dx.clearRect(0, 0, _dcW, _dcH);

        for (const d of _dd) {
            // ── GLOW (bright, no gradient — much cheaper) ────────────
            if (d.bs === 1) {
                const gp = 0.5 + 0.5 * Math.sin(t * 9 + d.phase * 1.7);
                const r  = 2.5 + gp * 1.5;
                // Outer soft halo (cheap: one big transparent circle)
                _dx.beginPath();
                _dx.arc(d.x, d.y, r * 3, 0, Math.PI * 2);
                _dx.fillStyle = `hsla(${d.glowHue},88%,68%,${0.10 * gp})`;
                _dx.fill();
                // Core bright dot
                _dx.beginPath();
                _dx.arc(d.x, d.y, r, 0, Math.PI * 2);
                _dx.fillStyle = `hsla(${d.glowHue},92%,72%,${0.7 + gp * 0.3})`;
                _dx.fill();
                continue;
            }

            // ── BLASTING ──────────────────────────────────────────────
            if (d.bs === 2) {
                const dt   = t - d.bT;
                const fric = Math.exp(-dt * 2.8);
                const rx   = d.x + d.bVx * dt * fric;
                const ry   = d.y + d.bVy * dt * fric;
                const fade = Math.max(0, 1 - dt * 2.4);
                if (dt > 0.42) { d.bs = 3; d.bT = t; d.bX = rx; d.bY = ry; }
                if (fade > 0.015) {
                    _dx.beginPath();
                    _dx.arc(rx, ry, 1.8, 0, Math.PI * 2);
                    _dx.fillStyle = `hsla(${d.glowHue},85%,65%,${fade})`;
                    _dx.fill();
                }
                continue;
            }

            // ── RETURNING ─────────────────────────────────────────────
            if (d.bs === 3) {
                const dt = t - d.bT;
                const p  = Math.min(1, dt / 0.55);
                const e  = 1 - Math.pow(1 - p, 2.5);
                const rx = d.bX + (d.x - d.bX) * e;
                const ry = d.bY + (d.y - d.bY) * e;
                if (p >= 1) d.bs = 0;
                _dx.beginPath();
                _dx.arc(rx, ry, 1.5, 0, Math.PI * 2);
                _dx.fillStyle = dk
                    ? `rgba(255,255,255,${0.07 * Math.min(1, dt * 3)})`
                    : `rgba(209,213,219,${0.75 * Math.min(1, dt * 3)})`;
                _dx.fill();
                continue;
            }

            // ── NORMAL (idle pulse / AI color wave) ───────────────────
            const pulse = 0.5 + 0.5 * Math.sin(t * d.pulseSpeed + d.phase * 2.1);
            if (Math.random() < 0.00008) d.sparkle = 1;
            d.sparkle *= 0.80;
            const sp = d.sparkle;
            const r  = 1.5 + alpha * 0.6 + sp * 0.9;

            _dx.beginPath();
            _dx.arc(d.x, d.y, r, 0, Math.PI * 2);

            if (alpha < 0.025) {
                const iHue = (d.hueBase + t * 5) % 360;
                const iSat = dk ? 14 : 20;
                const iLit = dk ? 74 : 64;
                const a    = Math.min(1, (dk ? 0.06 + 0.07 * pulse : 0.60 + 0.32 * pulse) + sp * 0.5);
                _dx.fillStyle = `hsla(${iHue},${iSat}%,${iLit}%,${a})`;
            } else {
                const wave = d.phase + t * d.speed;
                const hue  = (d.hueBase + wave * 52) % 360;
                const sat  = 74 + 14 * pulse;
                const lit  = dk ? 54 + 18 * pulse : 54 + 22 * pulse;
                const nA   = dk ? 0.04 * (1 - alpha) : 0.88 * (1 - alpha * 0.88);
                if (nA > 0.01) {
                    _dx.fillStyle = dk ? `rgba(255,255,255,${nA})` : `rgba(209,213,219,${nA})`;
                    _dx.fill();
                    _dx.beginPath();
                    _dx.arc(d.x, d.y, r, 0, Math.PI * 2);
                }
                const cA = (dk ? 0.30 : 0.84) * alpha * (0.55 + 0.45 * pulse) + sp * 0.4;
                _dx.fillStyle = `hsla(${hue},${sat}%,${lit}%,${Math.min(1, cA)})`;
            }
            _dx.fill();
        }
    }

    // ─────────────────────────────────────────────
    //  Dynamic Blast — 5 lightweight geometric patterns,
    //  random colors every time, zero image processing
    // ─────────────────────────────────────────────
    const _BLAST_PATTERNS = ['ring', 'wave', 'burst', 'diagonal', 'spiral'];
    let   _blastPatternIdx = 0; // cycles so you never see same twice in a row

    function _triggerTextBlast() {
        if (!_dc || !_dx || _dd.length === 0 || _blastLock) return;
        _blastLock = true;
        for (const d of _dd) d.bs = 0;

        // Fresh random hue palette each blast
        const baseHue = Math.random() * 360;
        const hues = [0,45,90,135,180].map(o => (baseHue + o) % 360);

        // Cycle through patterns (ring → wave → burst → diagonal → spiral → ring…)
        const pattern = _BLAST_PATTERNS[_blastPatternIdx % _BLAST_PATTERNS.length];
        _blastPatternIdx++;

        let glowDots = [];
        let cX = _dcW / 2, cY = _dcH / 2;

        if (pattern === 'ring') {
            // Glowing ring of dots at a random radius
            cX = _dcW * (0.3 + Math.random() * 0.4);
            cY = _dcH * (0.3 + Math.random() * 0.4);
            const r = Math.min(_dcW, _dcH) * (0.18 + Math.random() * 0.18);
            glowDots = _dd.filter(d => {
                const dist = Math.hypot(d.x - cX, d.y - cY);
                return dist >= r - _dDotSp * 1.6 && dist <= r + _dDotSp * 1.6;
            });

        } else if (pattern === 'wave') {
            // Horizontal band across the screen
            const bandY = _dcH * (0.25 + Math.random() * 0.5);
            glowDots = _dd.filter(d => Math.abs(d.y - bandY) <= _dDotSp * 2);
            cY = bandY;

        } else if (pattern === 'burst') {
            // Radial burst from a random off-center point
            cX = _dcW * (0.2 + Math.random() * 0.6);
            cY = _dcH * (0.2 + Math.random() * 0.6);
            const r = Math.min(_dcW, _dcH) * (0.20 + Math.random() * 0.15);
            glowDots = _dd.filter(d => Math.hypot(d.x - cX, d.y - cY) <= r);

        } else if (pattern === 'diagonal') {
            // Diagonal strip — slash or backslash randomly
            const dir = Math.random() > 0.5 ? 1 : -1;
            const sc  = _dcH / Math.max(1, _dcW);
            glowDots = _dd.filter(d => {
                const proj = Math.abs((d.y - cY) - dir * (d.x - cX) * sc) / Math.sqrt(1 + sc * sc);
                return proj < _dDotSp * 2.2;
            });

        } else { // spiral — select dots whose angle from center matches a spiral curve
            const turns = 1.4 + Math.random() * 0.8;
            glowDots = _dd.filter(d => {
                const ang  = Math.atan2(d.y - cY, d.x - cX);
                const dist = Math.hypot(d.x - cX, d.y - cY);
                const maxR = Math.min(_dcW, _dcH) * 0.45;
                const expected = (((ang + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2)) * maxR / turns;
                return Math.abs(dist - expected) < _dDotSp * 1.4;
            });
        }

        if (glowDots.length < 3) { _blastLock = false; return; }

        // Assign hues along the dot set for a gradient effect
        glowDots.forEach((d, i) => {
            d.glowHue = hues[Math.floor((i / glowDots.length) * hues.length)];
        });

        if (!_dId) _dId = requestAnimationFrame(_dotLoop);
        for (const d of glowDots) d.bs = 1;

        setTimeout(() => {
            for (const d of glowDots) {
                if (d.bs !== 1) continue;
                d.bs  = 2;
                d.bT  = performance.now() / 1000;
                // Blast away from pattern center + scatter
                const ang = Math.atan2(d.y - cY, d.x - cX) + (Math.random() - 0.5) * 1.2;
                const spd = 100 + Math.random() * 170;
                d.bVx = Math.cos(ang) * spd;
                d.bVy = Math.sin(ang) * spd;
            }
            setTimeout(() => { _blastLock = false; }, 900);
        }, 480);
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

    // Init dot canvas on load (draws once, then loop stops — zero idle CPU)
    _dotInit();
})();
