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
})();
