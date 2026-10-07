// StoryEngine for OnlineKotha — Production v4
// Redesigned: Sleek floating rounded card modal, single round share icon, rich Spotify-Wrapped cards, responsive mobile UX

(function () {
    'use strict';

    const esc = (s) => String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    const css = `
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;700;800;900&display=swap');

        .ok-ov {
            position: fixed; inset: 0; width: 100%; height: 100%; height: 100dvh;
            background: rgba(6, 6, 14, 0.94); z-index: 2147483647;
            backdrop-filter: blur(28px); -webkit-backdrop-filter: blur(28px);
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            font-family: 'Outfit', -apple-system, BlinkMacSystemFont, sans-serif;
            overflow: hidden; opacity: 1;
            touch-action: manipulation; -webkit-user-select: none; user-select: none;
            box-sizing: border-box;
            padding: 16px 16px;
            padding-bottom: max(40px, env(safe-area-inset-bottom, 36px));
            padding-top: max(20px, env(safe-area-inset-top, 20px));
        }

        .ok-vp {
            position: relative; overflow: hidden;
            border-radius: 28px;
            box-shadow: 0 25px 70px -15px rgba(0, 0, 0, 0.95), 0 0 35px rgba(99, 102, 241, 0.22);
            border: 1.5px solid rgba(255, 255, 255, 0.18);
            flex-shrink: 0; background: #080812;
            margin: auto auto;
            transition: width 0.15s ease, height 0.15s ease;
        }

        /* 1080×1920 canvas scaled down */
        .ok-cv {
            position: absolute; top: 0; left: 0;
            width: 1080px; height: 1920px;
            transform-origin: top left;
            background: #080812; color: #fff; overflow: hidden;
        }

        /* Progress bar */
        .ok-prog {
            position: absolute; top: 32px; left: 40px; right: 40px;
            display: flex; gap: 8px; z-index: 200;
        }
        .ok-seg { flex: 1; height: 5px; background: rgba(255,255,255,0.22); border-radius: 6px; overflow: hidden; }
        .ok-fill { height: 100%; background: #ffffff; width: 0%; border-radius: 6px; transition: none; }

        /* Header */
        .ok-hdr {
            position: absolute; top: 58px; left: 40px; right: 40px;
            display: flex; justify-content: space-between; align-items: center;
            z-index: 200;
        }
        .ok-brand {
            display: flex; align-items: center; gap: 12px;
            font-size: 26px; font-weight: 900; letter-spacing: 0.5px;
            color: #ffffff;
            background: rgba(255, 255, 255, 0.12);
            padding: 8px 18px; border-radius: 999px;
            border: 1px solid rgba(255, 255, 255, 0.2);
            backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
        }
        .ok-brand img { width: 28px; height: 28px; border-radius: 6px; flex-shrink: 0; }
        .ok-close {
            width: 58px; height: 58px; display: flex; align-items: center; justify-content: center;
            border-radius: 50%; background: rgba(255,255,255,0.18); cursor: pointer;
            color: #fff; border: 1px solid rgba(255,255,255,0.25); flex-shrink: 0;
            backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
            transition: background 0.15s, transform 0.15s;
            -webkit-tap-highlight-color: transparent;
        }
        .ok-close:hover { background: rgba(255,255,255,0.28); transform: scale(1.05); }
        .ok-close:active { transform: scale(0.92); }

        /* Footer watermark */
        .ok-ftr {
            position: absolute; bottom: 44px; left: 48px; right: 48px;
            display: flex; justify-content: space-between; align-items: center;
            font-size: 20px; font-weight: 700;
            color: rgba(255,255,255,0.45); letter-spacing: 3px; z-index: 50;
            text-transform: uppercase;
        }

        /* Content & safe zone */
        .ok-content { position: absolute; inset: 0; z-index: 10; }
        .ok-safe {
            position: absolute; top: 150px; left: 70px; right: 70px; bottom: 120px;
            display: flex; flex-direction: column; justify-content: center; z-index: 50;
            text-align: center;
        }

        /* Nav zones — left 35% prev, right 65% next (restricted height so header and bottom buttons are always clickable) */
        .ok-nav-l, .ok-nav-r {
            position: absolute; top: 80px; bottom: 80px; z-index: 300; cursor: pointer;
            -webkit-tap-highlight-color: transparent;
        }
        .ok-nav-l { left: 0; width: 35%; }
        .ok-nav-r { right: 0; width: 65%; }

        /* Top-Right Close Button on Viewport */
        .ok-vp-close-btn {
            position: absolute;
            top: 14px;
            right: 14px;
            width: 44px;
            height: 44px;
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.22);
            border: 1.5px solid rgba(255, 255, 255, 0.4);
            color: #ffffff;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            z-index: 500;
            backdrop-filter: blur(16px);
            -webkit-backdrop-filter: blur(16px);
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
            transition: transform 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
            -webkit-tap-highlight-color: transparent;
            outline: none;
        }
        .ok-vp-close-btn:hover {
            background: rgba(255, 255, 255, 0.35);
            transform: scale(1.08);
            box-shadow: 0 6px 20px rgba(0, 0, 0, 0.45);
        }
        .ok-vp-close-btn:active {
            transform: scale(0.92);
        }

        /* Round Share Button — positioned at bottom right of the floating story card */
        .ok-round-share-btn {
            position: absolute;
            bottom: 80px;
            right: 24px;
            width: 48px;
            height: 48px;
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.22);
            border: 1.5px solid rgba(255, 255, 255, 0.4);
            color: #ffffff;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            z-index: 500;
            backdrop-filter: blur(16px);
            -webkit-backdrop-filter: blur(16px);
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);
            transition: transform 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
            -webkit-tap-highlight-color: transparent;
            outline: none;
        }
        .ok-round-share-btn:hover {
            background: rgba(255, 255, 255, 0.35);
            transform: scale(1.08);
            box-shadow: 0 12px 35px rgba(0, 0, 0, 0.55);
        }
        .ok-round-share-btn:active {
            transform: scale(0.92);
        }
        .ok-round-share-btn.loading {
            pointer-events: none;
            opacity: 0.8;
        }
        .ok-round-share-btn.loading svg {
            animation: ok-spin 0.8s linear infinite;
        }
        @keyframes ok-spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
        }

        /* BG helpers */
        .ok-bg { position: absolute; inset: 0; z-index: 1; }
        .ok-orb { position: absolute; border-radius: 50%; filter: blur(150px); z-index: 1; pointer-events: none; }
        .ok-noise {
            position: absolute; inset: 0; z-index: 2; opacity: 0.045; pointer-events: none;
            background-image: url('data:image/svg+xml;utf8,<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch"/></filter><rect width="100%" height="100%" filter="url(%23n)"/></svg>');
        }

        /* Rich Visual Components for 1080x1920 canvas */
        .ok-badge-pill {
            display: inline-flex;
            align-items: center;
            gap: 12px;
            padding: 12px 32px;
            background: rgba(255, 255, 255, 0.12);
            border: 1.5px solid rgba(255, 255, 255, 0.24);
            border-radius: 999px;
            font-size: 26px;
            font-weight: 800;
            letter-spacing: 3px;
            color: #ffffff;
            text-transform: uppercase;
            backdrop-filter: blur(16px);
            -webkit-backdrop-filter: blur(16px);
            margin-bottom: 24px;
        }
        .ok-glass-card {
            background: rgba(18, 18, 34, 0.65);
            border: 1.5px solid rgba(255, 255, 255, 0.16);
            border-radius: 36px;
            padding: 44px;
            text-align: center;
            backdrop-filter: blur(24px);
            -webkit-backdrop-filter: blur(24px);
            box-shadow: 0 20px 50px rgba(0, 0, 0, 0.4);
        }
        .ok-quote-box {
            background: rgba(255, 255, 255, 0.08);
            border: 1px solid rgba(255, 255, 255, 0.15);
            border-radius: 24px;
            padding: 24px 32px;
            font-size: 32px;
            font-weight: 500;
            font-style: italic;
            color: rgba(255, 255, 255, 0.9);
            line-height: 1.45;
        }
        .ok-metric-chip {
            display: inline-block;
            padding: 10px 24px;
            background: rgba(255, 255, 255, 0.14);
            border-radius: 999px;
            font-size: 26px;
            font-weight: 700;
            color: #ffffff;
        }
        .ok-tap-hint {
            margin-top: 40px;
            font-size: 26px;
            font-weight: 800;
            letter-spacing: 2px;
            text-transform: uppercase;
            color: rgba(255, 255, 255, 0.65);
            animation: ok-pulse 1.6s infinite ease-in-out;
        }

        /* Card typography */
        .ok-eyebrow { font-size: 30px; font-weight: 800; color: rgba(255,255,255,0.65); text-transform: uppercase; letter-spacing: 4px; margin-bottom: 24px; }
        .ok-huge { font-size: 110px; font-weight: 900; line-height: 1.08; letter-spacing: -2px; margin-bottom: 24px; color: #fff; }
        .ok-sub { font-size: 44px; font-weight: 600; color: rgba(255,255,255,0.85); line-height: 1.35; }
        .ok-stat-num { font-size: 150px; font-weight: 900; letter-spacing: -4px; line-height: 1; color: #fff; }
        .ok-stat-lbl { font-size: 36px; font-weight: 700; color: rgba(255,255,255,0.6); text-transform: uppercase; letter-spacing: 2px; margin-top: 14px; }
        .ok-stat-block { display: flex; flex-direction: column; margin-top: 40px; }

        /* Entry animation — safe start so text is never invisible */
        .ok-anim { animation: ok-fade-in 0.35s ease-out both; }
        .ok-d1 { animation-delay: 0.08s; }
        .ok-d2 { animation-delay: 0.16s; }
        .ok-d3 { animation-delay: 0.24s; }
        @keyframes ok-fade-in { from { opacity: 0.6; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes ok-float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-18px)} }
        @keyframes ok-pulse { 0%,100%{opacity:0.6; transform:scale(0.98);} 50%{opacity:1; transform:scale(1.02);} }
    `;

    if (!document.getElementById('ok-story-css')) {
        const s = document.createElement('style');
        s.id = 'ok-story-css';
        s.textContent = css;
        document.head.appendChild(s);
    }

    // ─── StoryEngine entry point ─────────────────────────────────────────────────
    class StoryEngine {
        static launch(stats, msgs, chatFolder, compatPromise) {
            // Prevent duplicate viewers
            if (document.querySelector('.ok-ov')) return;
            try {
                new StoryViewer(stats, msgs, chatFolder, compatPromise).init();
            } catch (err) {
                console.error('[StoryEngine] Launch failed:', err);
                alert('Could not open story cards. Please try again.');
            }
        }
    }

    // ─── StoryViewer ─────────────────────────────────────────────────────────────
    class StoryViewer {
        constructor(stats, msgs, chatFolder, compatPromise) {
            this.stats = stats || {};
            this.msgs = Array.isArray(msgs) ? msgs : [];
            this.chatFolder = chatFolder || '';
            this.compatPromise = compatPromise || Promise.resolve(null);

            this.idx = 0;
            this.cards = [];
            this.duration = 7000;
            this.remaining = this.duration;
            this.lastTick = 0;
            this.isPaused = false;
            this.rafId = null;
            this.dom = {};
            this.isExporting = false;

            this._buildCards();
        }

        // ── Card builder ───────────────────────────────────────────────────────
        _buildCards() {
            const s = this.stats;
            const m = this.msgs;

            const push = (c) => { if (c) this.cards.push(c); };

            push(this._cardCover(s));
            if ((s.s1First || 0) > 0 || (s.s2First || 0) > 0) push(this._cardFirstText(s));
            if (s.busiestDate && s.busiestDateCount > 0) push(this._cardBusiestDay(s));
            if (s.busiestDay) push(this._cardBusiestWeekday(s));
            if ((s.mediaCount || 0) > 5) push(this._cardMedia(s));
            if ((s.laughCount || 0) > 0) push(this._cardLaughs(s));
            if ((s.longestMsgLen || 0) > 15 && s.longestMsgPreview) push(this._cardLongestMsg(s));
            if ((s.totalQuestions || 0) > 5) push(this._cardQuestions(s));

            const emojis = this._topEmojis(m);
            if (emojis.length > 0) push(this._cardEmojis(emojis));

            const nightCount = this._nightCount(m);
            if (nightCount > 20) push(this._cardLateNight(nightCount, s));

            push(this._cardTotal(s));

            // Safety fallback
            if (this.cards.length < 2) push(this._cardTotal(s));
        }

        // ── DOM Builder ───────────────────────────────────────────────────────
        init() {
            this._buildDOM();
            this._bindEvents();
            this._showCard(0);
            requestAnimationFrame(() => { this.dom.ov.style.opacity = '1'; });
        }

        _buildDOM() {
            const d = this.dom;

            // Overlay
            d.ov = document.createElement('div');
            d.ov.className = 'ok-ov';

            // Viewport (sized by resize, centered floating card)
            d.vp = document.createElement('div');
            d.vp.className = 'ok-vp';

            // Canvas 1080×1920 (scaled)
            d.cv = document.createElement('div');
            d.cv.className = 'ok-cv';

            // Content slot
            d.content = document.createElement('div');
            d.content.className = 'ok-content';
            d.cv.appendChild(d.content);

            // Noise overlay
            const noise = document.createElement('div');
            noise.className = 'ok-noise';
            d.cv.appendChild(noise);

            // Progress bar
            d.prog = document.createElement('div');
            d.prog.className = 'ok-prog';
            for (let i = 0; i < this.cards.length; i++) {
                d.prog.innerHTML += `<div class="ok-seg"><div class="ok-fill" id="ok-f${i}"></div></div>`;
            }
            d.cv.appendChild(d.prog);

            // Header: logo + close
            d.hdr = document.createElement('div');
            d.hdr.className = 'ok-hdr';
            d.hdr.innerHTML = `
                <div class="ok-brand">
                    <svg width="24" height="24" viewBox="0 0 32 32" fill="none">
                        <rect width="32" height="32" rx="8" fill="url(#okBrandGrad)" />
                        <circle cx="11" cy="16" r="4.5" fill="#ffffff" />
                        <circle cx="21" cy="16" r="4.5" fill="#ffffff" />
                        <path d="M11 16h10" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" />
                        <defs>
                            <linearGradient id="okBrandGrad" x1="0" y1="0" x2="32" y2="32">
                                <stop offset="0%" stop-color="#8b5cf6"/>
                                <stop offset="100%" stop-color="#ec4899"/>
                            </linearGradient>
                        </defs>
                    </svg>
                    <span>OnlineKotha</span>
                </div>`;
            d.cv.appendChild(d.hdr);

            // Footer watermark
            d.ftr = document.createElement('div');
            d.ftr.className = 'ok-ftr';
            d.ftr.innerHTML = `
                <span>onlinekotha.com</span>
                <span>Chat Wrapped</span>`;
            d.cv.appendChild(d.ftr);

            // Nav zones (inside viewport, outside canvas)
            d.navL = document.createElement('div');
            d.navL.className = 'ok-nav-l';
            d.navR = document.createElement('div');
            d.navR.className = 'ok-nav-r';

            // Top-Right Close Button — positioned on the floating story card with highest z-index
            d.closeBtn = document.createElement('button');
            d.closeBtn.className = 'ok-vp-close-btn';
            d.closeBtn.id = 'ok-close-btn';
            d.closeBtn.setAttribute('aria-label', 'Close story');
            d.closeBtn.setAttribute('title', 'Close');
            d.closeBtn.innerHTML = `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M18 6L6 18M6 6l12 12"/>
                </svg>`;

            // Single Round Share Button — positioned at bottom right of the floating story card
            d.shareBtn = document.createElement('button');
            d.shareBtn.className = 'ok-round-share-btn';
            d.shareBtn.id = 'ok-share-btn';
            d.shareBtn.setAttribute('aria-label', 'Share story');
            d.shareBtn.setAttribute('title', 'Share story');
            d.shareBtn.innerHTML = `
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="18" cy="5" r="3"></circle>
                    <circle cx="6" cy="12" r="3"></circle>
                    <circle cx="18" cy="19" r="3"></circle>
                    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
                </svg>`;

            // Assemble
            d.vp.appendChild(d.cv);
            d.vp.appendChild(d.navL);
            d.vp.appendChild(d.navR);
            d.vp.appendChild(d.closeBtn);
            d.vp.appendChild(d.shareBtn);
            d.ov.appendChild(d.vp);
            document.body.appendChild(d.ov);

            this._resize();
            this._onResize = () => this._resize();
            window.addEventListener('resize', this._onResize);
            if (window.visualViewport) {
                window.visualViewport.addEventListener('resize', this._onResize);
            }
        }

        _resize() {
            const vv = window.visualViewport;
            const vw = vv ? vv.width : (window.innerWidth || document.documentElement.clientWidth);
            const vh = vv ? vv.height : (window.innerHeight || document.documentElement.clientHeight);
            const ratio = 1080 / 1920; // 9:16 ~0.5625

            // Ample margin on all sides, especially bottom for mobile toolbars
            const isMobile = vw <= 600;
            const horizMargin = isMobile ? 32 : 64;
            const vertMargin  = isMobile ? 140 : 100;

            const availW = Math.max(260, vw - horizMargin);
            const availH = Math.max(400, vh - vertMargin);

            const maxW = isMobile ? Math.min(availW, 350) : Math.min(availW, 440);
            const maxH = isMobile ? Math.min(availH, 580) : Math.min(availH, 840);

            let vph = maxH;
            let vpw = maxH * ratio;
            if (vpw > maxW) {
                vpw = maxW;
                vph = maxW / ratio;
            }

            const scale = vpw / 1080;

            this.dom.vp.style.width  = Math.floor(vpw) + 'px';
            this.dom.vp.style.height = Math.floor(vph) + 'px';
            this.dom.cv.style.transform = `scale(${scale})`;
        }

        _bindEvents() {
            const d = this.dom;

            // Close
            d.ov.addEventListener("click", (e) => { if (e.target === d.ov) this.close(); });

            if (d.closeBtn) {
                d.closeBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.close();
                });
            }
            const oldClose = d.hdr.querySelector('.ok-close');
            if (oldClose) {
                oldClose.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.close();
                });
            }
            d.ov.addEventListener('click', (e) => {
                if (e.target === d.ov) this.close();
            });
            document.addEventListener('keydown', this._onKey = (e) => {
                if (e.key === 'Escape') this.close();
                if (e.key === 'ArrowRight') this._next();
                if (e.key === 'ArrowLeft')  this._prev();
            });

            // Nav zones — tap / click
            d.navL.addEventListener('click', () => this._prev());
            d.navR.addEventListener('click', () => this._next());

            // Touch swipe
            let tx0 = 0, ty0 = 0;
            d.vp.addEventListener('touchstart', (e) => {
                tx0 = e.touches[0].clientX;
                ty0 = e.touches[0].clientY;
            }, { passive: true });
            d.vp.addEventListener('touchend', (e) => {
                const dx = e.changedTouches[0].clientX - tx0;
                const dy = e.changedTouches[0].clientY - ty0;
                if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 40) {
                    dx < 0 ? this._next() : this._prev();
                }
            }, { passive: true });

            // Long-press to pause
            let pressTimer;
            const startPause = () => { pressTimer = setTimeout(() => { this.isPaused = true; }, 150); };
            const endPause   = () => { clearTimeout(pressTimer); if (this.isPaused) { this.isPaused = false; this.lastTick = Date.now(); } };
            d.vp.addEventListener('mousedown',  startPause);
            d.vp.addEventListener('mouseup',    endPause);
            d.vp.addEventListener('touchstart', startPause, { passive: true });
            d.vp.addEventListener('touchend',   endPause,   { passive: true });

            // Single Round Share Button
            d.shareBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._export(true);
            });
        }

        // ── Show card ────────────────────────────────────────────────────────
        _showCard(idx) {
            if (idx < 0) return;
            if (idx >= this.cards.length) { this.close(); return; }

            this.idx = idx;
            const card = this.cards[idx];

            // Render content
            this.dom.content.innerHTML = `
                <div class="ok-bg" style="${card.bgStyle}"></div>
                ${card.bgExtra || ''}
                <div class="ok-safe">${card.html}</div>
            `;

            // Progress bar
            for (let i = 0; i < this.cards.length; i++) {
                const f = document.getElementById(`ok-f${i}`);
                if (!f) continue;
                f.style.transition = 'none';
                f.style.width = i < idx ? '100%' : '0%';
            }

            // Reset timer
            this.remaining = this.duration;
            this.lastTick = Date.now();
            cancelAnimationFrame(this.rafId);
            this._tick();
        }

        // ── Timer ────────────────────────────────────────────────────────────
        _tick() {
            if (!this.dom.ov.parentNode) return;
            if (!this.isPaused && !this.isExporting) {
                const now = Date.now();
                const delta = now - this.lastTick;
                this.lastTick = now;
                this.remaining -= delta;

                const fill = document.getElementById(`ok-f${this.idx}`);
                if (fill) {
                    const pct = Math.max(0, Math.min(100, 100 - (this.remaining / this.duration) * 100));
                    fill.style.width = pct + '%';
                }
                if (this.remaining <= 0) { this._next(); return; }
            } else {
                this.lastTick = Date.now();
            }
            this.rafId = requestAnimationFrame(() => this._tick());
        }

        _next() { this._showCard(this.idx + 1); }
        _prev() { this._showCard(this.idx - 1); }

        // ── Close ────────────────────────────────────────────────────────────
        close() {
            cancelAnimationFrame(this.rafId);
            window.removeEventListener('resize', this._onResize);
            if (window.visualViewport) {
                window.visualViewport.removeEventListener('resize', this._onResize);
            }
            document.removeEventListener('keydown', this._onKey);
            this.dom.ov.style.opacity = '0';
            setTimeout(() => { this.dom.ov?.remove(); }, 400);
        }

        async _export(share = true) {
            if (this.isExporting) return;

            if (!window.htmlToImage) {
                this._showToast('Export library not loaded. Please refresh.');
                return;
            }

            this.isExporting = true;
            this.isPaused = true;
            if (this.dom.shareBtn) this.dom.shareBtn.classList.add('loading');
            this._showToast('Preparing story...');

            try {
                const clone = this.dom.cv.cloneNode(true);
                
                // Prepare clone off-screen but within paint area
                clone.style.transform = 'none';
                clone.style.position = 'fixed';
                clone.style.left = '0';
                clone.style.top = '0';
                clone.style.zIndex = '-9999';
                
                document.body.appendChild(clone);

                // Remove UI elements and problematic blur filters (html-to-image fails on CSS blur)
                const removeEls = clone.querySelectorAll('.ok-prog, .ok-noise, .ok-vp-close-btn, .ok-round-share-btn, .ok-orb');
                removeEls.forEach(el => el.remove());
                
                // Freeze animations and fix glassmorphism (causes black screen)
                const allEls = clone.querySelectorAll('*');
                allEls.forEach(el => {
                    // Freeze animations explicitly
                    if (el.classList.contains('ok-anim') || el.classList.contains('ok-huge')) {
                        el.style.animation = 'none';
                        el.style.opacity = '1';
                        el.style.transform = 'none';
                    }
                    // Strip backdrop-filter, use opaque fallback
                    el.style.backdropFilter = 'none';
                    el.style.webkitBackdropFilter = 'none';
                    if (el.classList.contains('ok-glass-card')) {
                        el.style.backgroundColor = 'rgba(30, 30, 45, 0.95)';
                    }
                });

                // Add a small delay to ensure DOM paints the clone
                await new Promise(r => setTimeout(r, 250));

                const dataUrl = await window.htmlToImage.toPng(clone, {
                    width: 1080,
                    height: 1920,
                    pixelRatio: 1,
                    cacheBust: true,
                    backgroundColor: '#080812'
                });

                document.body.removeChild(clone);

                if (!dataUrl || dataUrl.length < 1000) {
                    throw new Error('Generated image is empty');
                }

                if (share && navigator.share && navigator.canShare) {
                    try {
                        const blob = await (await fetch(dataUrl)).blob();
                        const file = new File([blob], `onlinekotha_wrapped_${this.idx + 1}.png`, { type: 'image/png' });
                        if (navigator.canShare({ files: [file] })) {
                            await navigator.share({
                                title: 'My OnlineKotha Chat Wrapped',
                                text: 'Check out our Chat Wrapped on OnlineKotha! ✨',
                                files: [file]
                            });
                        } else {
                            this._download(dataUrl);
                        }
                    } catch (e) {
                        this._download(dataUrl);
                    }
                } else {
                    this._download(dataUrl);
                }
            } catch (err) {
                console.error('Export error:', err);
                this._showToast('Export failed. Please try again.');
            } finally {
                this.isExporting = false;
                this.isPaused = false;
                if (this.dom.shareBtn) this.dom.shareBtn.classList.remove('loading');
                this.lastTick = Date.now();
            }
        }

        _download(dataUrl) {
            const a = document.createElement('a');
            a.href = dataUrl;
            a.download = `onlinekotha_wrapped_${this.idx + 1}.png`;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => { a.remove(); }, 250);
        }

        _showToast(msg) {
            if (window.showToast) { window.showToast(msg); return; }
            const t = document.createElement('div');
            t.style.cssText = 'position:fixed;bottom:90px;left:50%;transform:translateX(-50%);background:#1e1e2e;color:#fff;padding:12px 22px;border-radius:12px;font-size:14px;z-index:2147483648;';
            t.textContent = msg;
            document.body.appendChild(t);
            setTimeout(() => t.remove(), 3000);
        }

        // ── Data helpers ──────────────────────────────────────────────────────
        _topEmojis(msgs) {
            const counts = {};
            const re = /[\u{1F300}-\u{1F9FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;
            msgs.forEach(m => {
                if (!m.text) return;
                const matches = m.text.match(re) || [];
                matches.forEach(e => { counts[e] = (counts[e] || 0) + 1; });
            });
            return Object.entries(counts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 6)
                .map(([emoji, count]) => ({ emoji, count }));
        }

        _nightCount(msgs) {
            let n = 0;
            msgs.forEach(m => {
                if (!m.time) return;
                const isPM = /pm/i.test(m.time), isAM = /am/i.test(m.time);
                const h = parseInt(m.time.replace(/[^0-9:]/g, '').split(':')[0], 10);
                if (isAM && (h === 12 || (h >= 1 && h < 4))) n++;
                if (!isAM && !isPM && (h === 0 || h === 1 || h === 2 || h === 3)) n++;
            });
            return n;
        }

        // ── Rich Card Templates ────────────────────────────────────────────────
        _cardCover(s) {
            const n1 = esc(s.sender1Name || 'You');
            const n2 = esc(s.sender2Name || 'Friend');
            const total = (s.totalMessages || 0).toLocaleString();
            return {
                bgStyle: 'background: radial-gradient(circle at 100% 0%, #a855f7 0%, transparent 55%), radial-gradient(circle at 0% 100%, #ec4899 0%, transparent 55%), linear-gradient(135deg, #1e1b4b, #312e81);',
                bgExtra: `<div class="ok-orb" style="top:-10%;right:-10%;width:800px;height:800px;background:rgba(167,139,250,0.3);"></div>`,
                html: `
                    <div><span class="ok-badge-pill ok-anim">✨ KOTHA WRAPPED</span></div>
                    <div class="ok-huge ok-anim ok-d1" style="font-size:92px;line-height:1.15;margin-top:20px;">
                        ${n1}<br><span style="color:#f472b6;font-size:70px;">×</span><br>${n2}
                    </div>
                    
                    <div class="ok-glass-card ok-anim ok-d2" style="margin-top:40px;">
                        <div style="font-size:28px;font-weight:700;color:rgba(255,255,255,0.7);text-transform:uppercase;letter-spacing:2px;">Total Conversations</div>
                        <div class="ok-stat-num" style="font-size:130px;background:linear-gradient(135deg,#ffffff,#c084fc);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin:10px 0;">${total}</div>
                        <div style="font-size:32px;color:rgba(255,255,255,0.85);">messages analyzed &amp; preserved</div>
                    </div>
                    
                    <div class="ok-tap-hint ok-anim ok-d3">Tap right to begin 👉</div>`
            };
        }

        _cardFirstText(s) {
            const first = (s.s1First || 0) >= (s.s2First || 0) ? s.sender1Name : s.sender2Name;
            return {
                bgStyle: 'background: radial-gradient(circle at 50% 50%, #10b981 0%, transparent 70%), linear-gradient(135deg, #064e3b, #022c22);',
                html: `
                    <div><span class="ok-badge-pill ok-anim">🌅 THE INITIATOR</span></div>
                    <div class="ok-huge ok-anim ok-d1" style="font-size:84px;margin-top:16px;line-height:1.15;">Who sparked the conversation first?</div>
                    
                    <div class="ok-glass-card ok-anim ok-d2" style="margin-top:40px;">
                        <div style="font-size:24px;color:rgba(255,255,255,0.65);font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:20px;">First text of the day</div>
                        <div style="display:flex;justify-content:space-between;border-bottom:1px solid rgba(255,255,255,0.15);padding-bottom:16px;margin-bottom:16px;">
                            <span style="font-size:36px;font-weight:800;">${esc(s.sender1Name)}</span>
                            <span style="font-size:42px;font-weight:900;color:#6ee7b7;">${s.s1First || 0} times</span>
                        </div>
                        <div style="display:flex;justify-content:space-between;">
                            <span style="font-size:36px;font-weight:800;">${esc(s.sender2Name)}</span>
                            <span style="font-size:42px;font-weight:900;color:#6ee7b7;">${s.s2First || 0} times</span>
                        </div>
                    </div>
                    
                    <div class="ok-anim ok-d3 ok-quote-box" style="margin-top:40px;text-align:center;">
                        It looks like <strong>${esc(first)}</strong> just couldn't wait to talk! 🥰
                    </div>`
            };
        }

        _cardBusiestDay(s) {
            return {
                bgStyle: 'background: radial-gradient(circle at 80% 20%, #f59e0b 0%, transparent 60%), radial-gradient(circle at 10% 80%, #ef4444 0%, transparent 60%), linear-gradient(135deg, #1c1004, #451a03);',
                bgExtra: `<div class="ok-orb" style="top:20%;left:20%;width:900px;height:900px;background:rgba(245,158,11,0.25);"></div>`,
                html: `
                    <div><span class="ok-badge-pill ok-anim">🔥 MOST ACTIVE DAY EVER</span></div>
                    <div class="ok-huge ok-anim ok-d1" style="font-size:84px;margin-top:16px;line-height:1.15;">When you two just wouldn't stop talking.</div>

                    <div class="ok-glass-card ok-anim ok-d2" style="margin-top:36px;">
                        <div style="font-size:60px;margin-bottom:10px;">🎉</div>
                        <div style="font-size:38px;font-weight:800;color:#fbbf24;margin-bottom:12px;">${esc(s.busiestDate)}</div>
                        <div class="ok-stat-num" style="font-size:135px;line-height:1;color:#fff;">${(s.busiestDateCount || 0).toLocaleString()}</div>
                        <div style="font-size:32px;font-weight:700;color:rgba(255,255,255,0.7);text-transform:uppercase;letter-spacing:2px;margin-top:14px;">messages in 24 hours 🔥</div>
                    </div>`
            };
        }

        _cardBusiestWeekday(s) {
            const day = s.busiestDay || 'Friday';
            return {
                bgStyle: 'background: radial-gradient(circle at 80% 20%, #14b8a6 0%, transparent 60%), radial-gradient(circle at 20% 80%, #0d9488 0%, transparent 60%), linear-gradient(135deg, #042f2e, #115e59);',
                bgExtra: `<div class="ok-orb" style="top:25%;right:10%;width:700px;height:700px;background:rgba(45,212,191,0.25);"></div>`,
                html: `
                    <div><span class="ok-badge-pill ok-anim">📅 YOUR MAGIC DAY</span></div>
                    <div class="ok-huge ok-anim ok-d1" style="font-size:130px;line-height:1.05;background:linear-gradient(135deg,#5eead4,#ffffff);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-top:16px;">${day}</div>
                    <div class="ok-sub ok-anim ok-d2" style="font-size:42px;color:rgba(255,255,255,0.9);margin-top:8px;">was your day.</div>
                    
                    <div class="ok-glass-card ok-anim ok-d3" style="margin-top:44px;">
                        <div style="font-size:56px;margin-bottom:12px;">⚡</div>
                        <div style="font-size:34px;font-weight:800;color:#5eead4;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Peak Energy Day</div>
                        <div style="font-size:32px;color:rgba(255,255,255,0.85);line-height:1.45;">You sent more messages on <b>${day}s</b> than any other day of the week.</div>
                        <div class="ok-metric-chip" style="margin-top:24px;">🔥 The conversation never stopped</div>
                    </div>`
            };
        }

        _cardMedia(s) {
            return {
                bgStyle: 'background: radial-gradient(circle at 80% 10%, #3b82f6 0%, transparent 60%), radial-gradient(circle at 20% 90%, #6366f1 0%, transparent 60%), linear-gradient(135deg, #091a3c, #172554);',
                bgExtra: `<div class="ok-orb" style="bottom:-10%;left:-10%;width:800px;height:800px;background:rgba(59,130,246,0.25);"></div>`,
                html: `
                    <div><span class="ok-badge-pill ok-anim">📸 GALLERY OF MEMORIES</span></div>
                    <div class="ok-huge ok-anim ok-d1" style="font-size:84px;margin-top:16px;line-height:1.15;">A timeline of shared frames.</div>

                    <div class="ok-glass-card ok-anim ok-d2" style="margin-top:36px;">
                        <div style="font-size:60px;margin-bottom:10px;">🖼️</div>
                        <div class="ok-stat-num" style="font-size:130px;line-height:1;color:#60a5fa;">${(s.mediaCount || 0).toLocaleString()}</div>
                        <div style="font-size:34px;font-weight:700;color:#ffffff;margin-top:14px;">photos, videos &amp; voice notes</div>
                        <div style="font-size:28px;color:rgba(255,255,255,0.65);margin-top:10px;line-height:1.4;">Screenshots, memes, and late-night voice clips.</div>
                    </div>`
            };
        }

        _cardLaughs(s) {
            return {
                bgStyle: 'background: radial-gradient(circle at 20% 50%, #fb923c 0%, transparent 60%), linear-gradient(135deg, #7c2d12, #431407);',
                html: `
                    <div><span class="ok-badge-pill ok-anim">😂 THE COMEDIAN</span></div>
                    <div class="ok-huge ok-anim ok-d1" style="font-size:84px;margin-top:16px;line-height:1.15;">Lots of inside jokes!</div>

                    <div class="ok-glass-card ok-anim ok-d2" style="margin-top:40px;">
                        <div style="font-size:24px;font-weight:700;color:rgba(255,255,255,0.65);text-transform:uppercase;letter-spacing:1px;margin-bottom:20px;">Laughter Tracked</div>
                        <div class="ok-stat-num" style="font-size:120px;line-height:1;color:#fdba74;">${(s.laughCount||0).toLocaleString()}</div>
                        <div style="font-size:28px;font-weight:600;margin-top:16px;color:#fff;">times someone died laughing</div>
                    </div>
                    
                    <div class="ok-anim ok-d3 ok-quote-box" style="margin-top:40px;text-align:center;">
                        Between "haha", "lol", and "lmao", you two never run out of reasons to smile. 😄
                    </div>`
            };
        }

        _cardLongestMsg(s) {
            const preview = esc(s.longestMsgPreview || '...');
            return {
                bgStyle: 'background: radial-gradient(circle at 50% 20%, #15803d 0%, transparent 60%), linear-gradient(135deg, #052e16, #14532d);',
                bgExtra: '',
                html: `
                    <div><span class="ok-badge-pill ok-anim">✍️ THE NOVELIST</span></div>
                    <div class="ok-huge ok-anim ok-d1" style="font-size:84px;margin-top:16px;line-height:1.15;">Someone had<br>a lot to say.</div>

                    <div class="ok-glass-card ok-anim ok-d2" style="margin-top:34px;text-align:left;border-left:8px solid #4ade80;">
                        <div style="font-size:30px;font-style:italic;color:#bbf7d0;line-height:1.5;">"${preview}"</div>
                        <div style="display:flex;align-items:baseline;gap:12px;margin-top:24px;border-top:1px solid rgba(255,255,255,0.1);padding-top:18px;">
                            <span style="font-size:72px;font-weight:900;color:#4ade80;">${s.longestMsgLen || 0}</span>
                            <span style="font-size:26px;color:rgba(255,255,255,0.65);">words in one message</span>
                        </div>
                    </div>`
            };
        }

        _cardQuestions(s) {
            const curious = (s.s1Questions || 0) >= (s.s2Questions || 0) ? s.sender1Name : s.sender2Name;
            const totalQ = (s.s1Questions || 0) + (s.s2Questions || 0);
            return {
                bgStyle: 'background: radial-gradient(circle at 90% 10%, #8b5cf6 0%, transparent 60%), radial-gradient(circle at 10% 90%, #6366f1 0%, transparent 60%), linear-gradient(135deg, #1e1145, #311068);',
                bgExtra: `<div style="position:absolute;font-size:500px;font-weight:900;opacity:0.06;top:10%;right:5%;z-index:0;color:#fff;">?</div>`,
                html: `
                    <div><span class="ok-badge-pill ok-anim">❓ THE CURIOUS ONE</span></div>
                    <div class="ok-huge ok-anim ok-d1" style="font-size:84px;margin-top:16px;line-height:1.15;">Who asked all the questions?</div>

                    <div class="ok-glass-card ok-anim ok-d2" style="margin-top:36px;padding:36px;">
                        <div style="font-size:24px;font-weight:700;color:rgba(255,255,255,0.65);text-transform:uppercase;letter-spacing:2px;">Total Questions Asked</div>
                        <div style="font-size:110px;font-weight:900;color:#c084fc;line-height:1.1;margin:8px 0;">${totalQ.toLocaleString()}</div>
                        
                        <div style="display:flex;gap:30px;margin-top:24px;border-top:1px solid rgba(255,255,255,0.12);padding-top:22px;">
                            <div style="flex:1;text-align:left;">
                                <div style="font-size:32px;font-weight:800;color:#e9d5ff;">${esc(s.sender1Name || 'Person 1')}</div>
                                <div style="font-size:64px;font-weight:900;color:#fff;margin-top:4px;">${s.s1Questions || 0}</div>
                            </div>
                            <div style="width:2px;background:rgba(255,255,255,0.15);"></div>
                            <div style="flex:1;text-align:left;">
                                <div style="font-size:32px;font-weight:800;color:#e9d5ff;">${esc(s.sender2Name || 'Person 2')}</div>
                                <div style="font-size:64px;font-weight:900;color:#fff;margin-top:4px;">${s.s2Questions || 0}</div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="ok-anim ok-d3 ok-quote-box" style="margin-top:32px;text-align:center;font-size:32px;">
                        Clearly, <strong>${esc(curious)}</strong> is the one carrying the interrogation. 🕵️‍♂️
                    </div>`
            };
        }

        _cardEmojis(emojis) {
            return {
                bgStyle: 'background: radial-gradient(circle at 50% -20%, #facc15 0%, transparent 60%), linear-gradient(135deg, #713f12, #422006);',
                html: `
                    <div><span class="ok-badge-pill ok-anim">🎭 THE VIBE CHECK</span></div>
                    <div class="ok-huge ok-anim ok-d1" style="font-size:76px;margin-top:16px;line-height:1.15;">A picture is worth a thousand words...</div>
                    <div class="ok-anim ok-d1" style="font-size:32px;font-weight:600;color:rgba(255,255,255,0.8);margin-top:20px;">So here are your most used ones!</div>

                    <div class="ok-anim ok-d2" style="display:flex;justify-content:center;gap:36px;flex-wrap:wrap;margin-top:50px;">
                        ${emojis.map((e, i) => `<div style="font-size:${130 - (i*12)}px; animation: ok-float ${3 + i*0.5}s ease-in-out infinite alternate;">${e.emoji}</div>`).join('')}
                    </div>
                    
                    <div class="ok-glass-card ok-anim ok-d3" style="margin-top:50px;padding:32px;background:rgba(255,255,255,0.1);">
                        <div style="font-size:24px;font-weight:700;color:rgba(255,255,255,0.7);text-transform:uppercase;margin-bottom:12px;">Your Chat Personality</div>
                        <div style="font-size:38px;font-weight:800;color:#fef08a;">Uniquely Yours ✨</div>
                    </div>`
            };
        }

        _cardLateNight(count) {
            return {
                bgStyle: 'background: radial-gradient(circle at 85% 15%, #3b0764 0%, transparent 60%), radial-gradient(circle at 15% 85%, #1e1b4b 0%, transparent 60%), linear-gradient(135deg, #02010a, #0f0a21);',
                bgExtra: `<div class="ok-orb" style="top:10%;right:10%;width:500px;height:500px;background:rgba(192,132,252,0.25);"></div>`,
                html: `
                    <div><span class="ok-badge-pill ok-anim">🌙 NIGHT OWLS</span></div>
                    <div class="ok-huge ok-anim ok-d1" style="font-size:84px;margin-top:16px;line-height:1.15;">Things got deep after midnight.</div>

                    <div class="ok-glass-card ok-anim ok-d2" style="margin-top:36px;">
                        <div style="font-size:64px;margin-bottom:12px;">🦉</div>
                        <div class="ok-stat-num" style="font-size:130px;line-height:1;color:#c084fc;">${count.toLocaleString()}</div>
                        <div style="font-size:32px;font-weight:700;color:rgba(255,255,255,0.75);text-transform:uppercase;letter-spacing:2px;margin-top:14px;">messages between 12 AM – 4 AM</div>
                    </div>

                    <div class="ok-quote-box ok-anim ok-d3" style="margin-top:28px;">
                        "Sleep was clearly optional." 🥱
                    </div>`
            };
        }

        _cardTotal(s) {
            const p1 = s.sender1Percent || 50;
            const p2 = s.sender2Percent || 50;
            let dynamic = 'A perfectly balanced connection! ⚖️';
            if (p1 > 60) dynamic = `<strong>${esc(s.sender1Name)}</strong> is definitely the talkative one! 🗣️`;
            else if (p2 > 60) dynamic = `<strong>${esc(s.sender2Name)}</strong> carries the conversation! 🗣️`;
            else if (p1 > 55) dynamic = `<strong>${esc(s.sender1Name)}</strong> talks just a little bit more. 😉`;
            else if (p2 > 55) dynamic = `<strong>${esc(s.sender2Name)}</strong> talks just a little bit more. 😉`;

            return {
                bgStyle: 'background: radial-gradient(circle at 10% 20%, #f43f5e 0%, transparent 50%), radial-gradient(circle at 90% 80%, #9333ea 0%, transparent 50%), linear-gradient(135deg, #4c0519, #3b0764);',
                html: `
                    <div><span class="ok-badge-pill ok-anim">💬 THE YAPPERS</span></div>
                    <div class="ok-huge ok-anim ok-d1" style="font-size:84px;margin-top:16px;line-height:1.15;">Who texted more?</div>

                    <div class="ok-glass-card ok-anim ok-d2" style="margin-top:40px;">
                        <div style="font-size:24px;font-weight:700;color:rgba(255,255,255,0.65);text-transform:uppercase;letter-spacing:2px;margin-bottom:24px;">Message Breakdown</div>
                        
                        <!-- P1 -->
                        <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:12px;">
                            <div style="font-size:36px;font-weight:800;">${esc(s.sender1Name)}</div>
                            <div style="font-size:36px;font-weight:900;color:#fda4af;">${p1}%</div>
                        </div>
                        <div style="height:24px;background:rgba(255,255,255,0.1);border-radius:12px;overflow:hidden;margin-bottom:40px;">
                            <div style="height:100%;width:${p1}%;background:#f43f5e;border-radius:12px;"></div>
                        </div>
                        
                        <!-- P2 -->
                        <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:12px;">
                            <div style="font-size:36px;font-weight:800;">${esc(s.sender2Name)}</div>
                            <div style="font-size:36px;font-weight:900;color:#d8b4fe;">${p2}%</div>
                        </div>
                        <div style="height:24px;background:rgba(255,255,255,0.1);border-radius:12px;overflow:hidden;">
                            <div style="height:100%;width:${p2}%;background:#9333ea;border-radius:12px;"></div>
                        </div>
                    </div>

                    <div class="ok-anim ok-d3 ok-quote-box" style="margin-top:40px;text-align:center;font-size:32px;">
                        ${dynamic}
                    </div>`
            };
        }
    }

    window.StoryEngine = StoryEngine;
})();
