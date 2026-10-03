// StoryEngine for OnlineKotha — Production v3
// Clean rewrite: fixes blank cards, broken buttons, mobile UX, export reliability

(function () {
    'use strict';

    const esc = (s) => String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    // ─── CSS ────────────────────────────────────────────────────────────────────
    const css = `
        .ok-ov {
            position: fixed; inset: 0; width: 100vw; height: 100vh;
            background: rgba(0,0,0,0.97); z-index: 2147483647;
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
            overflow: hidden; opacity: 0; transition: opacity 0.35s ease;
            touch-action: manipulation;
        }
        .ok-vp {
            position: relative; overflow: hidden;
            border-radius: 20px;
            box-shadow: 0 30px 100px rgba(0,0,0,0.8);
            flex-shrink: 0;
        }
        @media (max-width: 600px) { .ok-vp { border-radius: 0; } }

        /* 1080×1920 canvas scaled down */
        .ok-cv {
            position: absolute; top: 0; left: 0;
            width: 1080px; height: 1920px;
            transform-origin: top left;
            background: #080810; color: #fff; overflow: hidden;
        }

        /* Progress bar — INSIDE canvas, will be excluded from export */
        .ok-prog {
            position: absolute; top: 36px; left: 44px; right: 44px;
            display: flex; gap: 10px; z-index: 200;
        }
        .ok-seg { flex: 1; height: 5px; background: rgba(255,255,255,0.22); border-radius: 6px; overflow: hidden; }
        .ok-fill { height: 100%; background: #fff; width: 0%; border-radius: 6px; transition: none; }

        /* Header */
        .ok-hdr {
            position: absolute; top: 62px; left: 44px; right: 44px;
            display: flex; justify-content: space-between; align-items: center;
            z-index: 200;
        }
        .ok-brand {
            display: flex; align-items: center; gap: 14px;
            font-size: 26px; font-weight: 900; letter-spacing: 1px;
            background: linear-gradient(90deg, #fff 30%, #a78bfa);
            -webkit-background-clip: text; -webkit-text-fill-color: transparent;
        }
        .ok-brand img { width: 32px; height: 32px; flex-shrink: 0; }
        .ok-close {
            width: 64px; height: 64px; display: flex; align-items: center; justify-content: center;
            border-radius: 50%; background: rgba(255,255,255,0.12); cursor: pointer;
            color: #fff; border: none; flex-shrink: 0; -webkit-text-fill-color: #fff;
        }
        .ok-close:hover { background: rgba(255,255,255,0.22); }

        /* Footer watermark */
        .ok-ftr {
            position: absolute; bottom: 56px; left: 0; right: 0;
            text-align: center; font-size: 22px; font-weight: 600;
            color: rgba(255,255,255,0.35); letter-spacing: 5px; z-index: 50;
            text-transform: uppercase;
        }

        /* Content & safe zone */
        .ok-content { position: absolute; inset: 0; z-index: 10; }
        .ok-safe {
            position: absolute; top: 160px; left: 100px; right: 100px; bottom: 180px;
            display: flex; flex-direction: column; justify-content: center; z-index: 50;
        }

        /* Nav zones — left 35% prev, right 65% next */
        .ok-nav-l, .ok-nav-r {
            position: absolute; top: 0; bottom: 0; z-index: 300; cursor: pointer;
        }
        .ok-nav-l { left: 0; width: 35%; }
        .ok-nav-r { right: 0; width: 65%; }

        /* Action buttons — OUTSIDE canvas, always visible */
        .ok-actions {
            position: absolute; bottom: 0; left: 0; right: 0;
            display: none; justify-content: center; gap: 14px;
            padding: 16px 20px 24px;
            background: linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 100%);
            z-index: 400;
        }
        .ok-actions.visible { display: flex; }
        .ok-btn {
            display: flex; align-items: center; gap: 8px;
            padding: 11px 22px; border-radius: 50px; font-size: 14px; font-weight: 700;
            cursor: pointer; border: 1.5px solid rgba(255,255,255,0.3);
            background: rgba(30,30,50,0.85); color: #fff;
            backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
            transition: transform 0.15s, background 0.15s;
            -webkit-text-fill-color: #fff; white-space: nowrap;
            box-shadow: 0 4px 20px rgba(0,0,0,0.4);
        }
        .ok-btn:active { transform: scale(0.95); }
        .ok-btn-primary { background: #7c3aed; border-color: #7c3aed; }
        .ok-btn-primary:hover { background: #6d28d9; }
        .ok-btn-export { position: relative; }
        .ok-btn-export.loading::after {
            content: ''; position: absolute; inset: 0;
            border-radius: 50px; background: rgba(255,255,255,0.1);
            animation: ok-pulse 0.8s infinite;
        }
        @keyframes ok-pulse { 0%,100%{opacity:0.5} 50%{opacity:1} }

        /* BG helpers */
        .ok-bg { position: absolute; inset: 0; z-index: 1; }
        .ok-orb { position: absolute; border-radius: 50%; filter: blur(150px); z-index: 1; }
        .ok-noise {
            position: absolute; inset: 0; z-index: 2; opacity: 0.04; pointer-events: none;
            background-image: url('data:image/svg+xml;utf8,<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch"/></filter><rect width="100%" height="100%" filter="url(%23n)"/></svg>');
        }

        /* Card typography */
        .ok-eyebrow { font-size: 30px; font-weight: 800; color: rgba(255,255,255,0.55); text-transform: uppercase; letter-spacing: 4px; margin-bottom: 36px; }
        .ok-huge { font-size: 120px; font-weight: 900; line-height: 1.05; letter-spacing: -3px; margin-bottom: 36px; text-transform: uppercase; color: #fff; }
        .ok-sub { font-size: 46px; font-weight: 600; color: rgba(255,255,255,0.8); line-height: 1.3; }
        .ok-stat-num { font-size: 170px; font-weight: 900; letter-spacing: -5px; line-height: 1; color: #fff; }
        .ok-stat-lbl { font-size: 38px; font-weight: 700; color: rgba(255,255,255,0.45); text-transform: uppercase; letter-spacing: 2px; margin-top: 14px; }
        .ok-stat-block { display: flex; flex-direction: column; margin-top: 60px; }
        .ok-bq { position: absolute; bottom: 0; left: 0; font-size: 34px; font-weight: 500; font-style: italic; color: rgba(255,255,255,0.55); line-height: 1.4; }

        /* Entry animation */
        .ok-anim { animation: ok-up 0.75s cubic-bezier(0.16,1,0.3,1) both; }
        .ok-d1 { animation-delay: 0.2s; }
        .ok-d2 { animation-delay: 0.45s; }
        .ok-d3 { animation-delay: 0.7s; }
        @keyframes ok-up { from { opacity:0; transform:translateY(30px); } to { opacity:1; transform:translateY(0); } }
        @keyframes ok-float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-18px)} }
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
            if ((s.mediaCount || 0) > 10) push(this._cardMedia(s));
            if ((s.laughCount || 0) > 0) push(this._cardLaughs(s));
            if ((s.longestMsgLen || 0) > 15 && s.longestMsgPreview) push(this._cardLongestMsg(s));
            if ((s.totalQuestions || 0) > 10) push(this._cardQuestions(s));

            const emojis = this._topEmojis(m);
            if (emojis.length > 0) push(this._cardEmojis(emojis));

            const nightCount = this._nightCount(m);
            if (nightCount > 30) push(this._cardLateNight(nightCount));

            push(this._cardTotal(s));

            // Safety: always at least cover + total
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

            // Viewport (sized by resize)
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
                    <img src="/img/logo.svg" alt="OnlineKotha" />
                    <span>OnlineKotha</span>
                </div>
                <button class="ok-close" aria-label="Close story">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>`;
            d.cv.appendChild(d.hdr);

            // Footer
            d.ftr = document.createElement('div');
            d.ftr.className = 'ok-ftr';
            d.ftr.textContent = 'onlinekotha.com';
            d.cv.appendChild(d.ftr);

            // Nav zones (inside viewport, outside canvas)
            d.navL = document.createElement('div');
            d.navL.className = 'ok-nav-l';
            d.navR = document.createElement('div');
            d.navR.className = 'ok-nav-r';

            // Action buttons (outside canvas — always legible)
            d.actions = document.createElement('div');
            d.actions.className = 'ok-actions';
            d.actions.innerHTML = `
                <button class="ok-btn ok-btn-share" id="ok-share-btn" aria-label="Share story">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                    Share
                </button>
                <button class="ok-btn ok-btn-primary ok-btn-export" id="ok-save-btn" aria-label="Save image">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                    Save Image
                </button>`;

            // Assemble
            d.vp.appendChild(d.cv);
            d.vp.appendChild(d.navL);
            d.vp.appendChild(d.navR);
            d.vp.appendChild(d.actions);
            d.ov.appendChild(d.vp);
            document.body.appendChild(d.ov);

            this._resize();
            this._onResize = () => this._resize();
            window.addEventListener('resize', this._onResize);
        }

        _resize() {
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            const ratio = 1080 / 1920; // 9:16 ~0.5625

            let vph = vh, vpw = vh * ratio;
            if (vpw > vw) { vpw = vw; vph = vw / ratio; }

            // Desktop: don't take 100% height
            if (vw > 600) {
                const maxH = vh * 0.92;
                if (vph > maxH) { vph = maxH; vpw = maxH * ratio; }
            }

            const scale = vpw / 1080;

            this.dom.vp.style.width  = vpw + 'px';
            this.dom.vp.style.height = vph + 'px';
            this.dom.cv.style.transform = `scale(${scale})`;

            // Actions sit outside canvas but inside viewport, at bottom
            this.dom.actions.style.width = vpw + 'px';
            this.dom.actions.style.left  = '0';
        }

        _bindEvents() {
            const d = this.dom;

            // Close
            d.hdr.querySelector('.ok-close').addEventListener('click', () => this.close());
            d.ov.addEventListener('click', (e) => { if (e.target === d.ov) this.close(); });
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

            // Buttons
            d.ov.querySelector('#ok-save-btn').addEventListener('click',  (e) => { e.stopPropagation(); this._export(false); });
            d.ov.querySelector('#ok-share-btn').addEventListener('click', (e) => { e.stopPropagation(); this._export(!!navigator.share); });
        }

        // ── Show card ────────────────────────────────────────────────────────
        _showCard(idx) {
            if (idx < 0) return;
            if (idx >= this.cards.length) { this.close(); return; }

            this.idx = idx;
            const card = this.cards[idx];
            const isLast = idx === this.cards.length - 1;

            // Render
            this.dom.content.innerHTML = `
                <div class="ok-bg" style="${card.bgStyle}"></div>
                ${card.bgExtra || ''}
                <div class="ok-safe">${card.html}</div>
            `;

            // Progress
            for (let i = 0; i < this.cards.length; i++) {
                const f = document.getElementById(`ok-f${i}`);
                if (!f) continue;
                f.style.transition = 'none';
                f.style.width = i < idx ? '100%' : '0%';
            }

            // Show/hide action buttons
            if (isLast) {
                this.dom.actions.classList.add('visible');
            } else {
                this.dom.actions.classList.remove('visible');
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
            document.removeEventListener('keydown', this._onKey);
            this.dom.ov.style.opacity = '0';
            setTimeout(() => { this.dom.ov?.remove(); }, 400);
        }

        // ── Export ───────────────────────────────────────────────────────────
        async _export(share = false) {
            if (this.isExporting) return;

            // Check library
            if (!window.htmlToImage) {
                this._showToast('Export library not loaded. Please refresh.');
                return;
            }

            this.isExporting = true;
            const saveBtn = this.dom.ov.querySelector('#ok-save-btn');
            const shareBtn = this.dom.ov.querySelector('#ok-share-btn');
            if (saveBtn) saveBtn.classList.add('loading');

            // Hide UI from canvas temporarily
            this.dom.prog.style.visibility = 'hidden';
            this.dom.hdr.style.visibility = 'hidden';
            const oldTransform = this.dom.cv.style.transform;
            this.dom.cv.style.transform = 'scale(1)';
            this.dom.cv.style.position = 'fixed';
            this.dom.cv.style.top = '-9999px';
            this.dom.cv.style.left = '-9999px';
            document.body.appendChild(this.dom.cv);

            try {
                await new Promise(r => setTimeout(r, 60)); // let layout settle
                const dataUrl = await window.htmlToImage.toPng(this.dom.cv, {
                    width: 1080,
                    height: 1920,
                    pixelRatio: 1,
                    cacheBust: true,
                    skipFonts: false,
                });

                if (share && navigator.share) {
                    const blob = await (await fetch(dataUrl)).blob();
                    const file = new File([blob], 'onlinekotha_story.png', { type: 'image/png' });
                    try {
                        await navigator.share({ title: 'My OnlineKotha Story', files: [file] });
                    } catch (shareErr) {
                        if (shareErr.name !== 'AbortError') this._download(dataUrl);
                    }
                } else {
                    this._download(dataUrl);
                }
            } catch (err) {
                console.error('[StoryEngine] export failed:', err);
                this._showToast('Could not export card. Try again.');
            } finally {
                // Restore canvas
                this.dom.cv.style.position = 'absolute';
                this.dom.cv.style.top = '0';
                this.dom.cv.style.left = '0';
                this.dom.cv.style.transform = oldTransform;
                this.dom.vp.insertBefore(this.dom.cv, this.dom.vp.firstChild);

                this.dom.prog.style.visibility = '';
                this.dom.hdr.style.visibility = '';
                if (saveBtn) saveBtn.classList.remove('loading');
                this.isExporting = false;
            }
        }

        _download(dataUrl) {
            const a = document.createElement('a');
            a.href = dataUrl;
            a.download = `onlinekotha_story_${this.idx + 1}.png`;
            a.click();
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

        // ── Card Templates ────────────────────────────────────────────────────
        _cardCover(s) {
            return {
                bgStyle: 'background: linear-gradient(to bottom, #0f0c29, #302b63, #24243e);',
                bgExtra: `<div class="ok-orb" style="top:-10%;right:-10%;width:800px;height:800px;background:rgba(167,139,250,0.35);"></div>`,
                html: `
                    <div class="ok-eyebrow ok-anim">Your Story in Conversation</div>
                    <div class="ok-huge ok-anim ok-d1" style="font-size:100px;">${esc(s.sender1Name || 'You')}<br><span style="color:#a78bfa">×</span><br>${esc(s.sender2Name || 'Friend')}</div>
                    <div class="ok-stat-block ok-anim ok-d2">
                        <div class="ok-stat-num" style="font-size:150px;">${(s.totalMessages || 0).toLocaleString()}</div>
                        <div class="ok-stat-lbl">messages &amp; counting</div>
                    </div>`
            };
        }

        _cardFirstText(s) {
            const eager = (s.s1First || 0) >= (s.s2First || 0) ? s.sender1Name : s.sender2Name;
            const eagerN = Math.max(s.s1First || 0, s.s2First || 0);
            const other  = (s.s1First || 0) >= (s.s2First || 0) ? s.sender2Name : s.sender1Name;
            const otherN = Math.min(s.s1First || 0, s.s2First || 0);
            return {
                bgStyle: 'background: linear-gradient(to bottom, #140004, #400018);',
                bgExtra: `<div class="ok-orb" style="bottom:-10%;left:-10%;width:800px;height:800px;background:rgba(255,60,100,0.3);"></div>`,
                html: `
                    <div class="ok-eyebrow ok-anim">Who couldn't wait?</div>
                    <div style="display:flex;gap:40px;margin-top:80px;" class="ok-anim ok-d1">
                        <div style="flex:1;">
                            <div style="font-size:54px;">👑</div>
                            <div style="font-size:52px;font-weight:800;color:#ff4d6d;text-transform:uppercase;margin:10px 0;">${esc(eager)}</div>
                            <div style="font-size:150px;font-weight:900;line-height:1;color:#fff;">${eagerN}</div>
                            <div style="font-size:28px;color:rgba(255,255,255,0.6);">days texted first</div>
                        </div>
                        <div style="width:2px;background:rgba(255,255,255,0.1);align-self:stretch;margin-top:20px;"></div>
                        <div style="flex:1;opacity:0.65;">
                            <div style="font-size:52px;font-weight:800;color:#fff;text-transform:uppercase;margin-top:80px;">${esc(other)}</div>
                            <div style="font-size:100px;font-weight:900;line-height:1;color:#fff;">${otherN}</div>
                            <div style="font-size:28px;color:rgba(255,255,255,0.6);">days</div>
                        </div>
                    </div>
                    <div class="ok-bq ok-anim ok-d2">"Yeah... we see you, ${esc(eager)}. 👀"</div>`
            };
        }

        _cardBusiestDay(s) {
            return {
                bgStyle: 'background: linear-gradient(to bottom, #001219, #005f73);',
                bgExtra: `<div class="ok-orb" style="top:20%;left:20%;width:1000px;height:1000px;background:rgba(10,147,150,0.4);"></div>`,
                html: `
                    <div class="ok-eyebrow ok-anim">That one day.</div>
                    <div class="ok-huge ok-anim ok-d1" style="font-size:110px;">When you two just wouldn't stop talking.</div>
                    <div class="ok-stat-block ok-anim ok-d2">
                        <div style="font-size:48px;font-weight:700;color:#94d2bd;margin-bottom:10px;">${esc(s.busiestDate)}</div>
                        <div class="ok-stat-num">${(s.busiestDateCount || 0).toLocaleString()}</div>
                        <div class="ok-stat-lbl">messages in 24 hours 🔥</div>
                    </div>`
            };
        }

        _cardBusiestWeekday(s) {
            const day = s.busiestDay || 'Today';
            return {
                bgStyle: 'background: linear-gradient(135deg, #134e4a, #0f766e);',
                bgExtra: `<div style="position:absolute;font-size:280px;font-weight:900;opacity:0.06;top:5%;left:-5%;line-height:0.85;word-break:break-all;width:115%;text-transform:uppercase;z-index:0;color:#fff;">${(day + ' ').repeat(18)}</div>`,
                html: `
                    <div class="ok-eyebrow ok-anim">Your magic day</div>
                    <div class="ok-huge ok-anim ok-d1" style="font-size:160px;color:#5eead4;">${day}</div>
                    <div class="ok-sub ok-anim ok-d2">was your day.</div>
                    <div class="ok-stat-block ok-anim ok-d3">
                        <div class="ok-stat-lbl" style="color:rgba(255,255,255,0.6);font-size:36px;">You sent more messages on ${day}s than any other day of the week.</div>
                    </div>`
            };
        }

        _cardMedia(s) {
            return {
                bgStyle: 'background: linear-gradient(135deg, #1e3a5f, #1d4ed8);',
                bgExtra: `<div class="ok-orb" style="bottom:-20%;left:-20%;width:1000px;height:1000px;background:rgba(96,165,250,0.4);"></div>`,
                html: `
                    <div class="ok-eyebrow ok-anim">A gallery of memories</div>
                    <div class="ok-anim ok-d1">
                        <div style="font-size:120px;">📸</div>
                        <div class="ok-huge" style="font-size:140px;color:#93c5fd;">${(s.mediaCount || 0).toLocaleString()}</div>
                        <div class="ok-sub" style="font-size:56px;">photos &amp; videos shared.</div>
                    </div>
                    <div class="ok-stat-block ok-anim ok-d2">
                        <div class="ok-stat-lbl" style="color:rgba(255,255,255,0.6);font-size:34px;">That's a lot of screenshots,<br>memes, and memories.</div>
                    </div>`
            };
        }

        _cardLaughs(s) {
            return {
                bgStyle: 'background: linear-gradient(135deg, #7c2d12, #c2410c);',
                bgExtra: `<div style="position:absolute;font-size:280px;font-weight:900;opacity:0.07;top:5%;left:-5%;line-height:0.85;word-break:break-all;width:130%;z-index:0;">HAHA HAHA LOL HAHA HAHA LOL HAHA LOL</div>`,
                html: `
                    <div class="ok-eyebrow ok-anim">Vibe check ✓</div>
                    <div class="ok-huge ok-anim ok-d1" style="font-size:130px;">You laughed<br><span style="color:#fb923c;">A LOT.</span></div>
                    <div class="ok-stat-block ok-anim ok-d2">
                        <div class="ok-stat-num">${(s.laughCount || 0).toLocaleString()}</div>
                        <div class="ok-stat-lbl">messages with haha, lol, 😂</div>
                    </div>`
            };
        }

        _cardLongestMsg(s) {
            const preview = esc(s.longestMsgPreview || '...');
            return {
                bgStyle: 'background: linear-gradient(to bottom, #052e16, #14532d);',
                bgExtra: '',
                html: `
                    <div class="ok-eyebrow ok-anim">The Novelist ✍️</div>
                    <div class="ok-huge ok-anim ok-d1" style="font-size:100px;">Someone had<br>a lot to say.</div>
                    <div class="ok-anim ok-d2" style="background:rgba(0,0,0,0.45);padding:50px;border-radius:24px;border-left:8px solid #4ade80;margin-top:60px;">
                        <div style="font-size:32px;font-style:italic;color:#bbf7d0;line-height:1.5;">"${preview}"</div>
                    </div>
                    <div class="ok-stat-block ok-anim ok-d3" style="margin-top:40px;">
                        <div class="ok-stat-num" style="font-size:120px;color:#4ade80;">${s.longestMsgLen || 0}</div>
                        <div class="ok-stat-lbl">words in one message</div>
                    </div>`
            };
        }

        _cardQuestions(s) {
            const curious = (s.s1Questions || 0) > (s.s2Questions || 0) ? s.sender1Name : s.sender2Name;
            return {
                bgStyle: 'background: linear-gradient(135deg, #4c1d95, #7e22ce);',
                bgExtra: `<div style="position:absolute;font-size:500px;font-weight:900;opacity:0.08;top:10%;right:5%;z-index:0;color:#fff;">?</div>`,
                html: `
                    <div class="ok-eyebrow ok-anim">The Curious One</div>
                    <div class="ok-huge ok-anim ok-d1" style="font-size:110px;">Who asked more questions?</div>
                    <div style="display:flex;gap:40px;margin-top:60px;" class="ok-anim ok-d2">
                        <div style="flex:1;">
                            <div style="font-size:44px;font-weight:800;color:#e9d5ff;text-transform:uppercase;">${esc(s.sender1Name || 'Person 1')}</div>
                            <div style="font-size:130px;font-weight:900;line-height:1;color:#fff;">${s.s1Questions || 0}</div>
                            <div style="font-size:28px;color:rgba(255,255,255,0.55);">questions</div>
                        </div>
                        <div style="flex:1;">
                            <div style="font-size:44px;font-weight:800;color:#e9d5ff;text-transform:uppercase;">${esc(s.sender2Name || 'Person 2')}</div>
                            <div style="font-size:130px;font-weight:900;line-height:1;color:#fff;">${s.s2Questions || 0}</div>
                            <div style="font-size:28px;color:rgba(255,255,255,0.55);">questions</div>
                        </div>
                    </div>
                    <div class="ok-bq ok-anim ok-d3" style="color:#d8b4fe;">Clearly, ${esc(curious)} is the curious one.</div>`
            };
        }

        _cardEmojis(emojis) {
            let floaters = '';
            emojis.forEach((e, i) => {
                const sz = 100 - i * 12, l = 5 + Math.random() * 80, t = 5 + Math.random() * 75, dl = (Math.random() * 3).toFixed(1);
                floaters += `<div style="position:absolute;left:${l}%;top:${t}%;font-size:${sz}px;animation:ok-float ${3+Math.random()*2}s ease-in-out ${dl}s infinite;z-index:0;pointer-events:none;">${e.emoji}</div>`;
            });
            return {
                bgStyle: 'background: linear-gradient(to bottom, #1c1c2e, #2d2d44);',
                bgExtra: floaters,
                html: `
                    <div style="position:relative;z-index:10;background:rgba(0,0,0,0.5);padding:70px;border-radius:40px;backdrop-filter:blur(20px);border:1.5px solid rgba(255,255,255,0.1);" class="ok-anim">
                        <div class="ok-eyebrow" style="margin-bottom:24px;">Your chat in emojis</div>
                        <div style="display:flex;flex-direction:column;gap:36px;">
                            ${emojis.slice(0, 4).map(e => `
                                <div style="display:flex;align-items:center;gap:30px;">
                                    <div style="font-size:72px;width:90px;flex-shrink:0;">${e.emoji}</div>
                                    <div style="flex:1;height:14px;background:rgba(255,255,255,0.12);border-radius:8px;overflow:hidden;">
                                        <div style="width:${Math.round((e.count / emojis[0].count) * 100)}%;height:100%;background:#a78bfa;border-radius:8px;"></div>
                                    </div>
                                    <div style="font-size:36px;font-weight:700;color:rgba(255,255,255,0.55);width:130px;text-align:right;">${e.count.toLocaleString()}</div>
                                </div>`).join('')}
                        </div>
                    </div>`
            };
        }

        _cardLateNight(count) {
            return {
                bgStyle: 'background: linear-gradient(to bottom, #020111, #1a0536);',
                bgExtra: `<div class="ok-orb" style="top:8%;right:8%;width:200px;height:200px;background:#fff;filter:blur(60px);opacity:0.7;"></div>
                          <div class="ok-orb" style="bottom:20%;left:20%;width:120px;height:120px;background:#a78bfa;filter:blur(40px);opacity:0.5;"></div>`,
                html: `
                    <div class="ok-eyebrow ok-anim">🌙 midnight thoughts</div>
                    <div class="ok-huge ok-anim ok-d1" style="font-size:100px;">You two had things to say after midnight.</div>
                    <div class="ok-stat-block ok-anim ok-d2" style="margin-top:120px;">
                        <div class="ok-stat-num">${count.toLocaleString()}</div>
                        <div class="ok-stat-lbl">messages between 12AM – 4AM</div>
                    </div>
                    <div class="ok-bq ok-anim ok-d3">"Sleep is overrated anyway."</div>`
            };
        }

        _cardTotal(s) {
            return {
                bgStyle: 'background: linear-gradient(to bottom, #000, #0d0d1a);',
                bgExtra: `<div class="ok-orb" style="bottom:-15%;right:-15%;width:1100px;height:1100px;background:rgba(167,139,250,0.25);"></div>`,
                html: `
                    <div class="ok-huge ok-anim" style="font-size:180px;">${(s.totalMessages || 0).toLocaleString()}</div>
                    <div class="ok-sub ok-anim ok-d1" style="font-size:58px;margin-bottom:60px;">messages.</div>
                    <div class="ok-sub ok-anim ok-d2" style="font-size:44px;font-weight:400;color:rgba(255,255,255,0.6);">
                        Not just texts.<br>
                        Jokes. Rants. Voice notes at 2AM.<br>
                        And somehow… you kept going.
                    </div>
                    <div class="ok-stat-block ok-anim ok-d3" style="margin-top:80px;border-top:2px solid rgba(255,255,255,0.08);padding-top:40px;">
                        <div style="display:flex;justify-content:space-between;font-size:38px;font-weight:800;margin-bottom:16px;">
                            <span>${esc(s.sender1Name || '')}</span>
                            <span style="color:#a78bfa;">${Math.round((s.totalMessages || 0) * (s.sender1Percent || 0) / 100).toLocaleString()}</span>
                        </div>
                        <div style="display:flex;justify-content:space-between;font-size:38px;font-weight:800;">
                            <span>${esc(s.sender2Name || '')}</span>
                            <span style="color:#a78bfa;">${Math.round((s.totalMessages || 0) * (s.sender2Percent || 0) / 100).toLocaleString()}</span>
                        </div>
                    </div>`
            };
        }
    }

    window.StoryEngine = StoryEngine;
})();
