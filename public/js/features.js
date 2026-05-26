// features.js — On This Day memories + Share Moment + PWA install prompt

(function () {
    // ===== "On This Day" Memories =====
    async function loadMemories() {
        if (!window.currentChat) return;
        try {
            const resp = await fetch(`/api/ai/memories?chat=${encodeURIComponent(window.currentChat)}`);
            if (!resp.ok) return;
            const data = await resp.json();
            showMemoriesBanner(data);
        } catch {}
    }

    function showMemoriesBanner(data) {
        // Remove existing banner
        const existing = document.getElementById('memories-banner');
        if (existing) existing.remove();

        if (!data.memories || data.memories.length === 0) return;

        const container = document.getElementById('chat-container');
        if (!container) return;

        const banner = document.createElement('div');
        banner.id = 'memories-banner';
        banner.className = 'mb-6 animate-message';
        banner.innerHTML = `
            <div class="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/60 rounded-2xl p-4 mx-auto max-w-md shadow-sm">
                <div class="flex items-center gap-2 mb-3">
                    <div class="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d97706" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                    </div>
                    <div>
                        <p class="text-xs font-bold text-amber-800">On This Day</p>
                        <p class="text-[10px] text-amber-600">${data.count} messages from today in past years</p>
                    </div>
                    <button id="memories-close" class="ml-auto text-amber-400 hover:text-amber-600 transition">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                    </button>
                </div>
                <div class="flex flex-col gap-2 max-h-[120px] overflow-y-auto no-scrollbar" id="memories-list"></div>
            </div>
        `;
        container.insertBefore(banner, container.firstChild);

        const list = banner.querySelector('#memories-list');
        data.memories.slice(0, 5).forEach(m => {
            const item = document.createElement('div');
            item.className = 'bg-white/70 rounded-lg px-3 py-2 text-xs';
            item.innerHTML = `
                <span class="font-bold text-amber-700">${escH(m.sender)}</span>
                <span class="text-gray-600 ml-1">${escH((m.text || '').slice(0, 80))}${(m.text || '').length > 80 ? '...' : ''}</span>
                <span class="text-[10px] text-gray-400 ml-1">${m.date}</span>
            `;
            list.appendChild(item);
        });

        document.getElementById('memories-close')?.addEventListener('click', () => banner.remove());
    }

    // Load memories when chat switches
    const origLoadAiHistory = window.kothaLoadAiHistory;
    window.kothaLoadAiHistory = async (chatFolder) => {
        if (origLoadAiHistory) await origLoadAiHistory(chatFolder);
        // Delay slightly so chat loads first
        setTimeout(() => loadMemories(), 300);
    };

    // ===== Share Moment (Long-press on message bubble) =====
    let longPressTimer = null;
    let shareTarget = null;

    document.addEventListener('pointerdown', (e) => {
        const bubble = e.target.closest('.glass-chat-me, .glass-chat-them');
        if (!bubble) return;
        shareTarget = bubble;
        longPressTimer = setTimeout(() => {
            showShareMenu(bubble, e);
        }, 600);
    });

    document.addEventListener('pointerup', () => {
        clearTimeout(longPressTimer);
    });

    document.addEventListener('pointermove', () => {
        clearTimeout(longPressTimer);
    });

    function showShareMenu(bubble, e) {
        removeShareMenu();
        const menu = document.createElement('div');
        menu.id = 'share-context-menu';
        menu.className = 'fixed z-[150] bg-white rounded-xl shadow-2xl border border-gray-200 py-1.5 animate-message';
        menu.style.cssText = `left:${Math.min(e.clientX, window.innerWidth - 180)}px; top:${Math.min(e.clientY, window.innerHeight - 100)}px;`;
        menu.innerHTML = `
            <button id="share-copy-btn" class="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 w-full text-left transition">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                Copy text
            </button>
            <button id="share-image-btn" class="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 w-full text-left transition">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13"/></svg>
                Share as image
            </button>
        `;
        document.body.appendChild(menu);

        document.getElementById('share-copy-btn').addEventListener('click', () => {
            const textEl = bubble.querySelector('p.text-\\[15px\\], p.text-4xl, .ai-response-text');
            const text = textEl ? textEl.textContent : bubble.textContent;
            navigator.clipboard.writeText(text.trim()).then(() => {
                showToast('Copied!');
            });
            removeShareMenu();
        });

        document.getElementById('share-image-btn').addEventListener('click', () => {
            shareAsImage(bubble);
            removeShareMenu();
        });

        // Dismiss on click outside
        setTimeout(() => {
            document.addEventListener('click', dismissShareMenu, { once: true });
        }, 10);
    }

    function dismissShareMenu(e) {
        const menu = document.getElementById('share-context-menu');
        if (menu && !menu.contains(e.target)) removeShareMenu();
    }

    function removeShareMenu() {
        const m = document.getElementById('share-context-menu');
        if (m) m.remove();
    }

    function shareAsImage(bubble) {
        // Create a styled canvas representation
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const w = 600, padding = 40;
        const textEl = bubble.querySelector('p.text-\\[15px\\], p.text-4xl, .ai-response-text');
        const text = textEl ? textEl.textContent.trim() : bubble.textContent.trim();
        const nameEl = bubble.querySelector('p.text-\\[11px\\]');
        const sender = nameEl ? nameEl.textContent.trim() : 'You';
        const isMe = bubble.classList.contains('glass-chat-me');

        // Measure text
        ctx.font = '500 16px -apple-system, sans-serif';
        const lines = wrapText(ctx, text, w - padding * 2 - 40);
        const h = Math.max(180, padding * 2 + lines.length * 24 + 80);

        canvas.width = w * 2;
        canvas.height = h * 2;
        ctx.scale(2, 2);

        // Background
        ctx.fillStyle = '#f8f9fb';
        ctx.fillRect(0, 0, w, h);

        // Chat bubble
        const bubbleX = isMe ? w - 380 - padding : padding;
        const bubbleW = 380;
        const bubbleH = lines.length * 24 + 50;
        const bubbleY = (h - bubbleH) / 2;

        ctx.beginPath();
        roundedRect(ctx, bubbleX, bubbleY, bubbleW, bubbleH, 16);
        ctx.fillStyle = isMe ? '#075e54' : '#ffffff';
        ctx.fill();
        if (!isMe) {
            ctx.strokeStyle = '#e5e7eb';
            ctx.lineWidth = 1;
            ctx.stroke();
        }

        // Sender name
        ctx.font = 'bold 11px -apple-system, sans-serif';
        ctx.fillStyle = isMe ? '#86efac' : '#6366f1';
        ctx.fillText(sender, bubbleX + 16, bubbleY + 22);

        // Message text
        ctx.font = '500 15px -apple-system, sans-serif';
        ctx.fillStyle = isMe ? '#ffffff' : '#1f2937';
        lines.forEach((line, i) => {
            ctx.fillText(line, bubbleX + 16, bubbleY + 42 + i * 24);
        });

        // Branding
        ctx.font = 'bold 10px -apple-system, sans-serif';
        ctx.fillStyle = '#9ca3af';
        ctx.textAlign = 'center';
        ctx.fillText('Made with Kotha · onlinekotha.com', w / 2, h - 16);

        // Download
        canvas.toBlob((blob) => {
            if (!blob) return;
            // Try native share first (mobile)
            if (navigator.share && navigator.canShare) {
                const file = new File([blob], 'kotha-moment.png', { type: 'image/png' });
                navigator.share({ files: [file], title: 'Kotha Moment' }).catch(() => {
                    downloadBlob(blob);
                });
            } else {
                downloadBlob(blob);
            }
        }, 'image/png');
    }

    function downloadBlob(blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'kotha-moment.png';
        a.click();
        URL.revokeObjectURL(url);
        showToast('Image saved!');
    }

    function wrapText(ctx, text, maxWidth) {
        const words = text.split(' ');
        const lines = [];
        let line = '';
        for (const word of words) {
            const test = line + (line ? ' ' : '') + word;
            if (ctx.measureText(test).width > maxWidth && line) {
                lines.push(line);
                line = word;
            } else {
                line = test;
            }
        }
        if (line) lines.push(line);
        return lines.slice(0, 12); // Max 12 lines
    }

    function roundedRect(ctx, x, y, w, h, r) {
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    }

    function showToast(msg) {
        if (window.kothaToast) return window.kothaToast(msg);
        const t = document.createElement('div');
        t.textContent = msg;
        t.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#1f2937;color:white;padding:10px 18px;border-radius:12px;font-size:13px;font-weight:600;z-index:200;box-shadow:0 8px 24px rgba(0,0,0,0.2);opacity:0;transition:opacity 200ms';
        document.body.appendChild(t);
        requestAnimationFrame(() => t.style.opacity = '1');
        setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 250); }, 2400);
    }

    function escH(s) {
        return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    // ===== PWA Install Prompt =====
    let deferredPrompt = null;
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        showInstallBanner();
    });

    function showInstallBanner() {
        if (document.getElementById('pwa-install-banner')) return;
        const banner = document.createElement('div');
        banner.id = 'pwa-install-banner';
        banner.className = 'fixed bottom-20 left-4 right-4 md:left-auto md:right-4 md:w-80 bg-gray-900 text-white rounded-2xl p-4 shadow-2xl z-[90] flex items-center gap-3 animate-message';
        banner.innerHTML = `
            <div class="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center shrink-0">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
            </div>
            <div class="flex-1 min-w-0">
                <p class="text-sm font-bold">Install Kotha</p>
                <p class="text-[11px] text-gray-400">Add to home screen for app-like experience</p>
            </div>
            <button id="pwa-install-btn" class="bg-white text-gray-900 text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-gray-100 transition shrink-0">Install</button>
            <button id="pwa-dismiss-btn" class="text-gray-500 hover:text-white transition p-1 shrink-0">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
        `;
        document.body.appendChild(banner);

        document.getElementById('pwa-install-btn').addEventListener('click', async () => {
            if (!deferredPrompt) return;
            deferredPrompt.prompt();
            const result = await deferredPrompt.userChoice;
            if (result.outcome === 'accepted') showToast('App installed!');
            deferredPrompt = null;
            banner.remove();
        });

        document.getElementById('pwa-dismiss-btn').addEventListener('click', () => banner.remove());

        // Auto-dismiss after 15s
        setTimeout(() => { if (banner.parentNode) banner.remove(); }, 15000);
    }

    // ===== Chat Wrapped (Spotify-Story Style) =====
    class WrappedStory {
        constructor(slides, onEnd) {
            this.slides = slides;
            this.currentIndex = 0;
            this.duration = 5000; // 5 seconds per slide
            this.startTime = null;
            this.animationFrameId = null;
            this.isPaused = false;
            this.onEnd = onEnd;
        }

        start() {
            this.currentIndex = 0;
            this.showSlide(this.currentIndex);
        }

        showSlide(index) {
            this.slides.forEach((el, idx) => {
                if (idx === index) {
                    el.classList.add('active');
                } else {
                    el.classList.remove('active');
                }
            });

            const fills = document.querySelectorAll('.wrapped-progress-fill');
            fills.forEach((fill, idx) => {
                if (idx < index) {
                    fill.style.width = '100%';
                } else if (idx > index) {
                    fill.style.width = '0%';
                } else {
                    fill.style.width = '0%';
                }
            });

            this.startTime = performance.now();
            this.isPaused = false;
            this.animateProgress();
        }

        animateProgress() {
            if (this.isPaused) return;

            const now = performance.now();
            const elapsed = now - this.startTime;
            const progress = Math.min((elapsed / this.duration) * 100, 100);

            const fills = document.querySelectorAll('.wrapped-progress-fill');
            const currentFill = fills[this.currentIndex];
            if (currentFill) {
                currentFill.style.width = `${progress}%`;
            }

            if (progress < 100) {
                this.animationFrameId = requestAnimationFrame(() => this.animateProgress());
            } else {
                this.next();
            }
        }

        next() {
            cancelAnimationFrame(this.animationFrameId);
            if (this.currentIndex < this.slides.length - 1) {
                this.currentIndex++;
                this.showSlide(this.currentIndex);
            } else {
                // Stay on the final slide
                this.pause();
                if (this.onEnd) this.onEnd();
            }
        }

        prev() {
            cancelAnimationFrame(this.animationFrameId);
            if (this.currentIndex > 0) {
                this.currentIndex--;
                this.showSlide(this.currentIndex);
            } else {
                this.showSlide(0);
            }
        }

        pause() {
            this.isPaused = true;
            cancelAnimationFrame(this.animationFrameId);
        }

        resume() {
            if (!this.isPaused) return;
            if (this.currentIndex === this.slides.length - 1) return;
            this.isPaused = false;
            const fills = document.querySelectorAll('.wrapped-progress-fill');
            const currentFill = fills[this.currentIndex];
            const currentWidthPercent = parseFloat(currentFill?.style.width || '0');
            const elapsed = (currentWidthPercent / 100) * this.duration;
            this.startTime = performance.now() - elapsed;
            this.animateProgress();
        }

        destroy() {
            cancelAnimationFrame(this.animationFrameId);
        }
    }

    let activeStory = null;

    function getHour(timeStr) {
        if (!timeStr) return 12;
        const isPM = /pm/i.test(timeStr);
        const isAM = /am/i.test(timeStr);
        const cleanTime = timeStr.replace(/(?:am|pm)/i, '').trim();
        const parts = cleanTime.split(':');
        if (parts.length < 2) return 12;
        let hour = parseInt(parts[0], 10);
        if (isNaN(hour)) return 12;
        if (isPM && hour < 12) hour += 12;
        if (isAM && hour === 12) hour = 0;
        return hour;
    }

    function extractEmojis(text) {
        if (!text) return [];
        const matches = text.match(/[\u{1F300}-\u{1F9FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{1F191}-\u{1F251}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}\u{2318}-\u{27B0}]/gu) || [];
        return matches;
    }

    function exportWrappedCanvas(stats, action = 'download') {
        const canvas = document.createElement('canvas');
        canvas.width = 1080;
        canvas.height = 1920;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Draw background gradient
        const grad = ctx.createLinearGradient(0, 0, 1080, 1920);
        grad.addColorStop(0, '#0f0c1b'); 
        grad.addColorStop(0.5, '#1b143a'); 
        grad.addColorStop(1, '#0b0914'); 
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 1080, 1920);

        // Radial glow 1
        const radial1 = ctx.createRadialGradient(200, 200, 50, 200, 200, 600);
        radial1.addColorStop(0, 'rgba(217, 70, 239, 0.18)');
        radial1.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = radial1;
        ctx.beginPath();
        ctx.arc(200, 200, 600, 0, Math.PI * 2);
        ctx.fill();

        // Radial glow 2
        const radial2 = ctx.createRadialGradient(800, 1700, 50, 800, 1600, 700);
        radial2.addColorStop(0, 'rgba(99, 102, 241, 0.22)');
        radial2.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = radial2;
        ctx.beginPath();
        ctx.arc(800, 1600, 700, 0, Math.PI * 2);
        ctx.fill();

        // Center card container
        const cardX = 90;
        const cardY = 300;
        const cardW = 900;
        const cardH = 1260;
        const cardR = 60;

        ctx.beginPath();
        roundedRect(ctx, cardX, cardY, cardW, cardH, cardR);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
        ctx.fill();

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 4;
        ctx.stroke();

        ctx.textBaseline = 'top';

        // Header KOTHA WRAPPED
        ctx.font = 'bold 36px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillStyle = '#818cf8'; 
        ctx.textAlign = 'left';
        ctx.fillText('KOTHA WRAPPED', cardX + 80, cardY + 100);

        // Site link
        ctx.textAlign = 'right';
        ctx.font = 'bold 30px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillStyle = '#6b7280'; 
        ctx.fillText('onlinekotha.com', cardX + cardW - 80, cardY + 106);

        ctx.textAlign = 'left';

        // Title: Chat with
        ctx.font = '900 68px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(`Chat with ${stats.otherName}`, cardX + 80, cardY + 200);

        // Total Messages Label
        ctx.font = '800 32px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillStyle = '#9ca3af'; 
        ctx.fillText('TOTAL MESSAGES', cardX + 80, cardY + 370);

        // Total Messages count
        ctx.font = '900 130px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        const textGrad = ctx.createLinearGradient(cardX + 80, cardY + 430, cardX + 80, cardY + 560);
        textGrad.addColorStop(0, '#ffffff');
        textGrad.addColorStop(1, '#a5b4fc');
        ctx.fillStyle = textGrad;
        ctx.fillText(stats.totalMessages.toLocaleString(), cardX + 80, cardY + 420);

        const colY = cardY + 620;
        
        // Who talked more?
        ctx.font = '800 30px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillStyle = '#9ca3af';
        ctx.fillText('TALK RATIO', cardX + 80, colY);

        // Sender 1 progress
        ctx.font = 'bold 32px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillStyle = '#a5b4fc';
        ctx.fillText(`${stats.sender1Name} (${stats.sender1Percent}%)`, cardX + 80, colY + 55);

        const barW = 340;
        const barH = 20;
        ctx.beginPath();
        roundedRect(ctx, cardX + 80, colY + 110, barW, barH, 10);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.fill();

        ctx.beginPath();
        roundedRect(ctx, cardX + 80, colY + 110, Math.max(1, barW * (stats.sender1Percent / 100)), barH, 10);
        ctx.fillStyle = '#6366f1';
        ctx.fill();

        // Sender 2 progress
        ctx.fillStyle = '#f472b6';
        ctx.fillText(`${stats.sender2Name} (${stats.sender2Percent}%)`, cardX + 480, colY + 55);

        ctx.beginPath();
        roundedRect(ctx, cardX + 480, colY + 110, barW, barH, 10);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.fill();

        ctx.beginPath();
        roundedRect(ctx, cardX + 480, colY + 110, Math.max(1, barW * (stats.sender2Percent / 100)), barH, 10);
        const gradPink = ctx.createLinearGradient(cardX + 480, 0, cardX + 480 + barW, 0);
        gradPink.addColorStop(0, '#ec4899');
        gradPink.addColorStop(1, '#a855f7');
        ctx.fillStyle = gradPink;
        ctx.fill();

        // Peak Time Zone
        const row2Y = colY + 220;
        ctx.font = '800 30px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillStyle = '#9ca3af';
        ctx.fillText('PEAK TIME ZONE', cardX + 80, row2Y);

        ctx.font = '900 48px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillStyle = '#fbbf24'; 
        ctx.fillText(stats.peakLabel.split(' ')[0], cardX + 80, row2Y + 55);

        // Chat Vibe
        ctx.font = '800 30px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillStyle = '#9ca3af';
        ctx.fillText('CHAT VIBE', cardX + 480, row2Y);

        ctx.font = '900 48px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillStyle = '#f472b6'; 
        ctx.fillText(stats.vibe.split(' ')[0], cardX + 480, row2Y + 55);

        // Top Emojis
        const emojiY = row2Y + 180;
        ctx.font = '800 30px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillStyle = '#9ca3af';
        ctx.fillText('TOP EMOJIS', cardX + 80, emojiY);

        ctx.font = '64px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        const emojiStr = stats.topEmojis.slice(0, 5).join('   ');
        ctx.fillText(emojiStr || '💬', cardX + 80, emojiY + 55);

        // Footer watermarks
        ctx.textAlign = 'center';
        ctx.font = 'bold 36px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.fillText('Created with Kotha · onlinekotha.com', 540, 1720);

        ctx.font = '600 24px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.fillText('Scan & analyze your WhatsApp conversations privately', 540, 1770);

        canvas.toBlob((blob) => {
            if (!blob) return;
            const filename = `${stats.otherName.toLowerCase().replace(/[^a-z0-9]/g, '_')}_kotha_wrapped.png`;

            if (action === 'copy') {
                if (navigator.clipboard && window.ClipboardItem) {
                    navigator.clipboard.write([
                        new ClipboardItem({ 'image/png': blob })
                    ]).then(() => {
                        showToast('Image copied to clipboard! Paste it directly into your chat.');
                    }).catch((err) => {
                        console.error('Clipboard copy failed, downloading instead:', err);
                        downloadBlobFallback(blob, filename);
                    });
                } else {
                    showToast('Direct copying not supported. Downloading instead...');
                    downloadBlobFallback(blob, filename);
                }
            } else {
                downloadBlobFallback(blob, filename);
            }
        }, 'image/png');
    }

    function downloadBlobFallback(blob, filename) {
        const file = new File([blob], filename, { type: 'image/png' });
        if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
            navigator.share({
                files: [file],
                title: 'My Kotha Chat Wrapped',
                text: 'Check out our chat statistics on onlinekotha.com!'
            }).catch(() => {
                triggerDownload(blob, filename);
            });
        } else {
            triggerDownload(blob, filename);
        }
    }

    function triggerDownload(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        showToast('Wrapped card saved!');
    }

    function launchWrapped() {
        const rawMessages = window.kothaGetAllMessages ? window.kothaGetAllMessages() : [];
        if (!rawMessages || rawMessages.length === 0) {
            showToast("Please import/open a chat first!");
            return;
        }

        const messages = rawMessages.filter(m => m.sender && m.type !== 'system');
        const totalMessages = messages.length;
        if (totalMessages < 5) {
            showToast("Need at least 5 messages in this chat to generate Wrapped!");
            return;
        }

        // Calculate Stats
        const senderCounts = {};
        messages.forEach(msg => {
            if (msg.sender) senderCounts[msg.sender] = (senderCounts[msg.sender] || 0) + 1;
        });

        const sortedSenders = Object.entries(senderCounts).sort((a,b) => b[1] - a[1]);
        const sender1Name = sortedSenders[0] ? sortedSenders[0][0] : "You";
        const sender1Count = sortedSenders[0] ? sortedSenders[0][1] : 0;
        const sender2Name = sortedSenders[1] ? sortedSenders[1][0] : "Friend";
        const sender2Count = sortedSenders[1] ? sortedSenders[1][1] : 0;

        const sender1Percent = totalMessages > 0 ? Math.round((sender1Count / totalMessages) * 100) : 50;
        const sender2Percent = totalMessages > 0 ? Math.round((sender2Count / totalMessages) * 100) : 0;

        // Peak Time Zone
        const timeCounts = { morning: 0, afternoon: 0, evening: 0, night: 0 };
        messages.forEach(msg => {
            const hr = getHour(msg.time);
            if (hr >= 6 && hr < 12) {
                timeCounts.morning++;
            } else if (hr >= 12 && hr < 17) {
                timeCounts.afternoon++;
            } else if (hr >= 17 && hr < 22) {
                timeCounts.evening++;
            } else {
                timeCounts.night++;
            }
        });

        let peakPeriod = 'night';
        let maxMsgs = timeCounts.night;
        if (timeCounts.morning > maxMsgs) { peakPeriod = 'morning'; maxMsgs = timeCounts.morning; }
        if (timeCounts.afternoon > maxMsgs) { peakPeriod = 'afternoon'; maxMsgs = timeCounts.afternoon; }
        if (timeCounts.evening > maxMsgs) { peakPeriod = 'evening'; maxMsgs = timeCounts.evening; }

        const periodLabels = {
            morning: "Early Birds 🌅 (Morning)",
            afternoon: "Daytime Connectors ☀️ (Afternoon)",
            evening: "Twilight Chatters 🌆 (Evening)",
            night: "Midnight Owls 🦉 (Late Night)"
        };
        const peakLabel = periodLabels[peakPeriod];

        // Emojis
        const emojiCounts = {};
        messages.forEach(msg => {
            if (msg.text) {
                const emojis = extractEmojis(msg.text);
                emojis.forEach(e => {
                    emojiCounts[e] = (emojiCounts[e] || 0) + 1;
                });
            }
        });
        const sortedEmojis = Object.entries(emojiCounts).sort((a,b) => b[1] - a[1]);
        const topEmojis = sortedEmojis.slice(0, 5).map(e => e[0]);

        // Vibe
        let romanceCount = 0;
        let comedyCount = 0;
        let chillCount = 0;
        let supportCount = 0;

        const romanceList = ['❤️', '💖', '💕', '💓', '😘', '😍', '🥰', '💜', '💙', '💚', '💛', '🧡', '🤍', '❣️', '😻'];
        const comedyList = ['😂', '🤣', '😭', '💀', '👽', '💩', '🤡', '🤷', '🤦'];
        const chillList = ['😎', '😴', '✌️', '🍵', '🍕', '🍻', '🍷', '🌿', '🌊', '🏡'];
        const supportList = ['👍', '🙌', '💯', '🔥', '👏', '👌', '⭐', '💪', '👑'];

        Object.entries(emojiCounts).forEach(([emoji, count]) => {
            if (romanceList.includes(emoji)) romanceCount += count;
            else if (comedyList.includes(emoji)) comedyCount += count;
            else if (chillList.includes(emoji)) chillCount += count;
            else if (supportList.includes(emoji)) supportCount += count;
        });

        let vibe = "Chill & Cozy ☕";
        let vibeDesc = "You keep things relaxed, peaceful, and warm. No rush, just pure cozy chats.";
        let maxVibe = Math.max(romanceCount, comedyCount, chillCount, supportCount);

        if (maxVibe > 0) {
            if (maxVibe === romanceCount) {
                vibe = "Romantic & Wholesome ✨";
                vibeDesc = "Lots of hearts and love-filled emojis! Your bond is incredibly sweet and affectionate.";
            } else if (maxVibe === comedyCount) {
                vibe = "Chaotic Comedy 🤪";
                vibeDesc = "Constant laughter and inside jokes! You keep each other giggling through everything.";
            } else if (maxVibe === supportCount) {
                vibe = "Supportive Hype 🤝";
                vibeDesc = "High energy, thumbs up, and fire! You're each other's biggest cheerleader and hype squad.";
            }
        }

        const stats = {
            totalMessages,
            otherName: window.kothaGetOtherPersonName() || "Friend",
            sender1Name,
            sender1Percent,
            sender2Name,
            sender2Percent,
            peakLabel,
            vibe,
            vibeDesc,
            topEmojis,
            timeCounts
        };

        const overlay = document.createElement('div');
        overlay.id = 'wrapped-overlay';
        overlay.className = 'wrapped-overlay';
        overlay.innerHTML = `
            <div class="wrapped-container">
                <!-- Background blobs -->
                <div class="wrapped-blob wrapped-blob-1"></div>
                <div class="wrapped-blob wrapped-blob-2"></div>
                <div class="wrapped-blob wrapped-blob-3"></div>

                <!-- Top Progress Bars -->
                <div class="wrapped-progress-container" id="wrapped-progress-container"></div>

                <!-- Close Button -->
                <button class="wrapped-close-btn" id="wrapped-close-btn" title="Close">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>

                <!-- Slides Wrapper -->
                <div class="wrapped-slide-wrapper" id="wrapped-slide-wrapper">
                    <!-- Slide 1: Welcome -->
                    <div class="wrapped-slide active">
                        <div class="wrapped-slide-content">
                            <div class="wrapped-header-tag">KOTHA WRAPPED</div>
                            <div class="wrapped-main-body">
                                <h2 class="wrapped-title">Your Chat Story<br>with <span class="text-indigo-400">${stats.otherName}</span></h2>
                                <p class="text-sm text-gray-400 mt-4 leading-relaxed max-w-[280px]">We analyzed your chat history to reveal the trends, top moments, and vibes that define your connection.</p>
                                <div class="mt-8 text-4xl animate-bounce">✨</div>
                            </div>
                            <div class="text-[10px] text-gray-500 text-center tracking-widest uppercase">TAP RIGHT TO BEGIN</div>
                        </div>
                    </div>

                    <!-- Slide 2: Message Count & Ratio -->
                    <div class="wrapped-slide">
                        <div class="wrapped-slide-content">
                            <div class="wrapped-header-tag">THE VOLUME</div>
                            <div class="wrapped-main-body w-full">
                                <p class="text-xs text-gray-400 uppercase tracking-wider mb-2">Total Messages Exchanged</p>
                                <div class="wrapped-accent-huge mb-6">${stats.totalMessages.toLocaleString()}</div>
                                
                                <div class="wrapped-badge-box mt-4 text-left">
                                    <p class="text-xs font-bold text-gray-300 mb-3">Who talked more?</p>
                                    
                                    <div class="mb-3">
                                        <div class="flex justify-between text-xs font-semibold mb-1 text-indigo-300">
                                            <span>${stats.sender1Name}</span>
                                            <span>${stats.sender1Percent}%</span>
                                        </div>
                                        <div class="wrapped-meter-track">
                                            <div class="wrapped-meter-fill" style="width: ${stats.sender1Percent}%"></div>
                                        </div>
                                    </div>
                                    
                                    <div>
                                        <div class="flex justify-between text-xs font-semibold mb-1 text-purple-300">
                                            <span>${stats.sender2Name}</span>
                                            <span>${stats.sender2Percent}%</span>
                                        </div>
                                        <div class="wrapped-meter-track">
                                            <div class="wrapped-meter-fill bg-gradient-to-r from-purple-500 to-pink-500" style="width: ${stats.sender2Percent}%"></div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div class="text-[10px] text-gray-500 text-center">TAP RIGHT FOR MORE</div>
                        </div>
                    </div>

                    <!-- Slide 3: Active Times -->
                    <div class="wrapped-slide">
                        <div class="wrapped-slide-content">
                            <div class="wrapped-header-tag">TIMING IS EVERYTHING</div>
                            <div class="wrapped-main-body w-full">
                                <p class="text-xs text-gray-400 uppercase tracking-wider mb-3">You chat the most as...</p>
                                <div class="text-xl font-black text-amber-400 mb-6">${stats.peakLabel}</div>
                                
                                <div class="wrapped-badge-box text-left space-y-2">
                                    <div class="flex justify-between text-xs text-gray-300">
                                        <span>🌅 Morning (6am - 12pm)</span>
                                        <span class="font-bold">${stats.timeCounts.morning.toLocaleString()} msgs</span>
                                    </div>
                                    <div class="flex justify-between text-xs text-gray-300">
                                        <span>☀️ Afternoon (12pm - 5pm)</span>
                                        <span class="font-bold">${stats.timeCounts.afternoon.toLocaleString()} msgs</span>
                                    </div>
                                    <div class="flex justify-between text-xs text-gray-300">
                                        <span>🌆 Evening (5pm - 10pm)</span>
                                        <span class="font-bold">${stats.timeCounts.evening.toLocaleString()} msgs</span>
                                    </div>
                                    <div class="flex justify-between text-xs text-gray-300">
                                        <span>🦉 Late Night (10pm - 6am)</span>
                                        <span class="font-bold">${stats.timeCounts.night.toLocaleString()} msgs</span>
                                    </div>
                                </div>
                            </div>
                            <div class="text-[10px] text-gray-500 text-center">TAP FOR TOP EMOJIS</div>
                        </div>
                    </div>

                    <!-- Slide 4: Top Emojis -->
                    <div class="wrapped-slide">
                        <div class="wrapped-slide-content">
                            <div class="wrapped-header-tag">EMOJI CHAMPIONS</div>
                            <div class="wrapped-main-body w-full">
                                <p class="text-xs text-gray-400 uppercase tracking-wider mb-6">Your most used emojis</p>
                                
                                ${stats.topEmojis.length > 0 ? `
                                    <div class="flex items-end justify-center gap-4 h-40">
                                        ${stats.topEmojis.slice(0, 3).map((emoji, index) => {
                                            const heights = ['h-32', 'h-24', 'h-20'];
                                            const sizes = ['text-5xl', 'text-4xl', 'text-3xl'];
                                            const places = ['#1', '#2', '#3'];
                                            const colors = ['bg-indigo-600/30 border-indigo-500/50', 'bg-purple-600/30 border-purple-500/50', 'bg-pink-600/30 border-pink-500/50'];
                                            return `
                                                <div class="flex flex-col items-center gap-1.5">
                                                    <div class="w-16 ${heights[index]} ${colors[index]} border backdrop-blur-sm rounded-t-2xl flex items-center justify-center ${sizes[index]} animate-message shadow-lg">
                                                        ${emoji}
                                                    </div>
                                                    <span class="text-[10px] font-bold text-gray-400">${places[index]}</span>
                                                </div>
                                            `;
                                        }).join('')}
                                    </div>
                                    
                                    <div class="flex gap-4 mt-6 justify-center">
                                        ${stats.topEmojis.slice(3, 5).map((emoji, index) => `
                                            <div class="bg-gray-800/40 border border-gray-700/50 rounded-xl px-3 py-1.5 flex items-center gap-2">
                                                <span class="text-xl">${emoji}</span>
                                                <span class="text-[10px] font-bold text-gray-400">#${index + 4}</span>
                                            </div>
                                        `).join('')}
                                    </div>
                                ` : `
                                    <div class="text-gray-400 text-sm italic">No emojis found in this chat!</div>
                                `}
                            </div>
                            <div class="text-[10px] text-gray-500 text-center">TAP FOR THE VIBE</div>
                        </div>
                    </div>

                    <!-- Slide 5: The Vibe -->
                    <div class="wrapped-slide">
                        <div class="wrapped-slide-content">
                            <div class="wrapped-header-tag">THE VIBE CHECK</div>
                            <div class="wrapped-main-body">
                                <p class="text-xs text-gray-400 uppercase tracking-wider mb-3">Your Relationship Vibe</p>
                                <div class="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-pink-400 to-indigo-400 mb-4">${stats.vibe}</div>
                                
                                <div class="wrapped-badge-box mt-4">
                                    <p class="text-xs text-gray-300 leading-relaxed font-medium">${stats.vibeDesc}</p>
                                </div>
                                <div class="text-6xl mt-8 animate-pulse">${stats.topEmojis[0] || '💬'}</div>
                            </div>
                            <div class="text-[10px] text-gray-500 text-center">TAP FOR SUMMARY CARD</div>
                        </div>
                    </div>

                    <!-- Slide 6: Summary / Export -->
                    <div class="wrapped-slide">
                        <div class="wrapped-slide-content">
                            <div class="wrapped-header-tag">SHARE YOUR STORY</div>
                            <div class="wrapped-main-body w-full">
                                <div class="bg-gradient-to-br from-indigo-950/40 to-purple-950/40 border border-indigo-500/20 backdrop-blur-md rounded-3xl p-5 w-full text-left shadow-2xl relative overflow-hidden">
                                    <div class="absolute -top-10 -right-10 w-24 h-24 bg-pink-500/10 rounded-full filter blur-xl"></div>
                                    <div class="absolute -bottom-10 -left-10 w-24 h-24 bg-indigo-500/10 rounded-full filter blur-xl"></div>
                                    
                                    <div class="flex justify-between items-center mb-4">
                                        <span class="text-[9px] font-black text-indigo-400 tracking-wider uppercase">Kotha Wrapped</span>
                                        <span class="text-[9px] text-gray-500 font-bold">onlinekotha.com</span>
                                    </div>
                                    
                                    <h3 class="text-lg font-black text-white leading-tight mb-4">Chat with ${stats.otherName}</h3>
                                    
                                    <div class="space-y-3.5">
                                        <div>
                                            <p class="text-[9px] text-gray-400 uppercase font-extrabold tracking-wider">Total Messages</p>
                                            <p class="text-xl font-black text-white">${stats.totalMessages.toLocaleString()}</p>
                                        </div>
                                        
                                        <div class="grid grid-cols-2 gap-2">
                                            <div>
                                                <p class="text-[9px] text-gray-400 uppercase font-extrabold tracking-wider">Peak Time</p>
                                                <p class="text-xs font-extrabold text-indigo-200">${stats.peakLabel.split(' ')[0]}</p>
                                            </div>
                                            <div>
                                                <p class="text-[9px] text-gray-400 uppercase font-extrabold tracking-wider">Chat Vibe</p>
                                                <p class="text-xs font-extrabold text-purple-200">${stats.vibe.split(' ')[0]}</p>
                                            </div>
                                        </div>
                                        
                                        <div>
                                            <p class="text-[9px] text-gray-400 uppercase font-extrabold tracking-wider mb-1">Top Emojis</p>
                                            <p class="text-xl font-bold flex gap-1.5">${stats.topEmojis.slice(0, 5).join(' ')}</p>
                                        </div>
                                    </div>
                                </div>
                                
                                <div class="flex flex-col gap-2 mt-5 w-full">
                                    <button class="wrapped-download-btn mt-0 flex items-center gap-2 w-full justify-center" id="wrapped-download-btn">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                                        Share / Download Card
                                    </button>
                                    <button class="bg-white/10 hover:bg-white/20 border border-white/10 text-white font-extrabold text-[12.5px] rounded-xl py-2.5 px-4 flex items-center gap-2 w-full justify-center transition active:scale-95 cursor-pointer" id="wrapped-copy-btn">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                                        Copy Card to Clipboard
                                    </button>
                                </div>
                            </div>
                            <div class="text-[10px] text-gray-500 text-center uppercase tracking-widest">TAP LEFT TO REWATCH</div>
                        </div>
                    </div>
                </div>

                <!-- Navigation Tap Zones -->
                <div class="wrapped-nav-tap wrapped-nav-tap-left" id="wrapped-nav-left"></div>
                <div class="wrapped-nav-tap wrapped-nav-tap-right" id="wrapped-nav-right"></div>
            </div>
        `;
        document.body.appendChild(overlay);

        const progressContainer = overlay.querySelector('#wrapped-progress-container');
        const slideEls = overlay.querySelectorAll('.wrapped-slide');
        progressContainer.innerHTML = '';
        slideEls.forEach(() => {
            const bar = document.createElement('div');
            bar.className = 'wrapped-progress-bar';
            bar.innerHTML = '<div class="wrapped-progress-fill"></div>';
            progressContainer.appendChild(bar);
        });

        activeStory = new WrappedStory(slideEls, () => {});
        activeStory.start();

        const container = overlay.querySelector('.wrapped-container');
        container.addEventListener('pointerdown', (e) => {
            if (e.target.closest('#wrapped-close-btn') || e.target.closest('.wrapped-download-btn') || e.target.closest('#wrapped-copy-btn')) return;
            activeStory.pause();
        });
        const resumeAction = () => {
            if (activeStory) activeStory.resume();
        };
        container.addEventListener('pointerup', resumeAction);
        container.addEventListener('pointerleave', resumeAction);

        overlay.querySelector('#wrapped-nav-left').addEventListener('click', (e) => {
            e.stopPropagation();
            activeStory.prev();
        });
        overlay.querySelector('#wrapped-nav-right').addEventListener('click', (e) => {
            e.stopPropagation();
            activeStory.next();
        });

        const closeOverlay = () => {
            if (activeStory) {
                activeStory.destroy();
                activeStory = null;
            }
            overlay.remove();
            document.removeEventListener('keydown', escListener);
        };
        overlay.querySelector('#wrapped-close-btn').addEventListener('click', closeOverlay);

        const escListener = (e) => {
            if (e.key === 'Escape') closeOverlay();
        };
        document.addEventListener('keydown', escListener);

        overlay.querySelector('#wrapped-download-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            exportWrappedCanvas(stats, 'download');
        });

        overlay.querySelector('#wrapped-copy-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            exportWrappedCanvas(stats, 'copy');
        });
    }

    function initWrapped() {
        const btnWrapped = document.getElementById('btn-wrapped');
        if (btnWrapped) {
            btnWrapped.addEventListener('click', launchWrapped);
        }
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initWrapped);
    } else {
        initWrapped();
    }
})();

