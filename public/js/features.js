// features.js — On This Day memories + PWA install + Chat Wrapped (Spotify-story)

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

    const origLoadAiHistory = window.kothaLoadAiHistory;
    window.kothaLoadAiHistory = async (chatFolder) => {
        if (origLoadAiHistory) await origLoadAiHistory(chatFolder);
        setTimeout(() => loadMemories(), 300);
    };

    // ===== Shared Utilities =====
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
        setTimeout(() => { if (banner.parentNode) banner.remove(); }, 15000);
    }

    // ═══════════════════════════════════════════════════════════════════
    //  CHAT WRAPPED — Spotify-style story with smart name extraction
    // ═══════════════════════════════════════════════════════════════════

    // ── Smart contact name extraction ──
    // Handles: "WhatsApp Chat - Sunil Mamu", "WhatsApp_Chat_with_Sunil_Mamu_2024",
    //          folder names with underscores, trailing dates, numbers, junk
    function cleanContactName(rawFolderName, senderNames) {
        if (!rawFolderName) return senderNames?.[0] || 'Friend';

        let name = rawFolderName;

        // Strip common WhatsApp export prefixes (case-insensitive)
        name = name.replace(/^whatsapp[\s_-]*chat[\s_-]*(with[\s_-]*)?[-–—]?\s*/i, '');

        // Replace underscores with spaces
        name = name.replace(/_/g, ' ');

        // Remove trailing timestamps/dates: (2024), _2024, -20240115, etc.
        name = name.replace(/[\s_-]*\(?\d{4,}\)?[\s_-]*$/g, '');
        name = name.replace(/[\s_-]*\d{1,2}[\s_/-]\d{1,2}[\s_/-]\d{2,4}\s*$/g, '');

        // Remove trailing junk: random numbers, hashes, file extensions
        name = name.replace(/[\s_-]+\d+\s*$/g, '');
        name = name.replace(/\.(txt|zip|csv|json)\s*$/i, '');

        // Remove ".txt" that sometimes remains
        name = name.replace(/\.txt$/i, '');

        // Collapse multiple spaces
        name = name.replace(/\s{2,}/g, ' ').trim();

        // If after cleaning we got nothing or too short, try sender names
        if (name.length < 2 && senderNames && senderNames.length > 0) {
            // Pick the non-"You" sender
            name = senderNames.find(n => n && n.toLowerCase() !== 'you') || senderNames[0] || 'Friend';
        }

        // Title case each word (but keep ALL CAPS words if they're short like "DJ")
        name = name.replace(/\b\w+/g, w => {
            if (w.length <= 3 && w === w.toUpperCase()) return w; // keep "DJ", "AB"
            return w.charAt(0).toUpperCase() + w.slice(1);
        });

        // Truncate if still too long (e.g. group chat names)
        if (name.length > 24) {
            name = name.slice(0, 22).trim() + '…';
        }

        return name || 'Friend';
    }

    // ── Story controller ──
    class WrappedStory {
        constructor(slides, onEnd) {
            this.slides = slides;
            this.currentIndex = 0;
            this.duration = 6000; // 6s per slide (more time to read)
            this.startTime = null;
            this.animationFrameId = null;
            this.isPaused = false;
            this.onEnd = onEnd;
        }

        start() {
            this.currentIndex = 0;
            this.showSlide(0);
        }

        showSlide(index) {
            this.slides.forEach((el, i) => {
                el.classList.toggle('active', i === index);
            });

            const fills = document.querySelectorAll('#wrapped-overlay .wrapped-progress-fill');
            fills.forEach((fill, i) => {
                fill.style.transition = 'none';
                fill.style.width = i < index ? '100%' : '0%';
            });

            this.startTime = performance.now();
            this.isPaused = false;
            this.animateProgress();
        }

        animateProgress() {
            if (this.isPaused) return;
            const elapsed = performance.now() - this.startTime;
            const progress = Math.min((elapsed / this.duration) * 100, 100);

            const fills = document.querySelectorAll('#wrapped-overlay .wrapped-progress-fill');
            const fill = fills[this.currentIndex];
            if (fill) {
                fill.style.transition = 'none';
                fill.style.width = `${progress}%`;
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
            const fills = document.querySelectorAll('#wrapped-overlay .wrapped-progress-fill');
            const fill = fills[this.currentIndex];
            const pct = parseFloat(fill?.style.width || '0');
            const elapsed = (pct / 100) * this.duration;
            this.startTime = performance.now() - elapsed;
            this.animateProgress();
        }

        destroy() {
            cancelAnimationFrame(this.animationFrameId);
        }
    }

    let activeStory = null;

    // ── Helpers ──
    function getHour(timeStr) {
        if (!timeStr) return 12;
        const isPM = /pm/i.test(timeStr);
        const isAM = /am/i.test(timeStr);
        const clean = timeStr.replace(/(?:am|pm)/i, '').trim();
        const parts = clean.split(':');
        if (parts.length < 2) return 12;
        let h = parseInt(parts[0], 10);
        if (isNaN(h)) return 12;
        if (isPM && h < 12) h += 12;
        if (isAM && h === 12) h = 0;
        return h;
    }

    function extractEmojis(text) {
        if (!text) return [];
        return text.match(/[\u{1F300}-\u{1F9FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{1F191}-\u{1F251}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}\u{2318}-\u{27B0}]/gu) || [];
    }

    // ── Compute stats from messages ──
    function computeWrappedStats(messages) {
        const totalMessages = messages.length;

        // Sender breakdown
        const senderCounts = {};
        messages.forEach(m => {
            if (m.sender) senderCounts[m.sender] = (senderCounts[m.sender] || 0) + 1;
        });
        const sorted = Object.entries(senderCounts).sort((a, b) => b[1] - a[1]);
        const s1 = sorted[0] || ['You', 0];
        const s2 = sorted[1] || ['Friend', 0];
        const s1Pct = totalMessages > 0 ? Math.round((s1[1] / totalMessages) * 100) : 50;
        const s2Pct = totalMessages > 0 ? Math.round((s2[1] / totalMessages) * 100) : 0;

        // All sender names for name fallback
        const allSenderNames = sorted.map(s => s[0]);

        // Clean name from folder + senders
        const rawFolder = window.kothaGetCurrentChat ? window.kothaGetCurrentChat() : '';
        const rawOther = window.kothaGetOtherPersonName ? window.kothaGetOtherPersonName() : '';
        const otherName = cleanContactName(rawOther || rawFolder, allSenderNames);

        // Peak time
        const tc = { morning: 0, afternoon: 0, evening: 0, night: 0 };
        messages.forEach(m => {
            const h = getHour(m.time);
            if (h >= 6 && h < 12) tc.morning++;
            else if (h >= 12 && h < 17) tc.afternoon++;
            else if (h >= 17 && h < 22) tc.evening++;
            else tc.night++;
        });
        let peak = 'night', pMax = tc.night;
        if (tc.morning > pMax)   { peak = 'morning';   pMax = tc.morning; }
        if (tc.afternoon > pMax) { peak = 'afternoon'; pMax = tc.afternoon; }
        if (tc.evening > pMax)   { peak = 'evening';   pMax = tc.evening; }

        const peakLabels = {
            morning:   'Early Birds 🌅',
            afternoon: 'Daytime Connectors ☀️',
            evening:   'Twilight Chatters 🌆',
            night:     'Midnight Owls 🦉',
        };

        // Top emojis
        const emojiCounts = {};
        messages.forEach(m => {
            if (m.text) extractEmojis(m.text).forEach(e => {
                emojiCounts[e] = (emojiCounts[e] || 0) + 1;
            });
        });
        const topEmojis = Object.entries(emojiCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(e => e[0]);

        // Vibe
        const romanceList = ['❤️','💖','💕','💓','😘','😍','🥰','💜','💙','💚','💛','🧡','🤍','❣️','😻'];
        const comedyList  = ['😂','🤣','😭','💀','👽','💩','🤡','🤷','🤦'];
        const chillList   = ['😎','😴','✌️','🍵','🍕','🍻','🍷','🌿','🌊','🏡'];
        const supportList = ['👍','🙌','💯','🔥','👏','👌','⭐','💪','👑'];

        let rc = 0, cc = 0, ch = 0, sc = 0;
        Object.entries(emojiCounts).forEach(([e, c]) => {
            if (romanceList.includes(e)) rc += c;
            else if (comedyList.includes(e)) cc += c;
            else if (chillList.includes(e)) ch += c;
            else if (supportList.includes(e)) sc += c;
        });

        let vibe = 'Chill & Cozy ☕';
        let vibeDesc = 'Relaxed, warm chats with no rush — just cozy vibes.';
        const mv = Math.max(rc, cc, ch, sc);
        if (mv > 0) {
            if (mv === rc) { vibe = 'Romantic & Wholesome ✨'; vibeDesc = 'Hearts everywhere! Your bond is sweet and affectionate.'; }
            else if (mv === cc) { vibe = 'Chaotic Comedy 🤪'; vibeDesc = 'Non-stop laughter and inside jokes — you two are hilarious together.'; }
            else if (mv === sc) { vibe = 'Supportive Hype 🤝'; vibeDesc = "Fire, thumbs up, and crowns — you're each other's biggest cheerleader."; }
        }

        // Average words per message
        let totalWords = 0;
        messages.forEach(m => { if (m.text) totalWords += m.text.split(/\s+/).length; });
        const avgWords = totalMessages > 0 ? Math.round(totalWords / totalMessages) : 0;

        // Date range
        let firstDate = '', lastDate = '';
        for (const m of messages) { if (m.date) { firstDate = m.date; break; } }
        for (let i = messages.length - 1; i >= 0; i--) { if (messages[i].date) { lastDate = messages[i].date; break; } }

        return {
            totalMessages, otherName,
            sender1Name: s1[0], sender1Percent: s1Pct,
            sender2Name: s2[0], sender2Percent: s2Pct,
            peakLabel: peakLabels[peak], peakPeriod: peak,
            timeCounts: tc,
            topEmojis, vibe, vibeDesc,
            avgWords, firstDate, lastDate,
        };
    }

    // ── Canvas export card ──
    function exportWrappedCanvas(stats, action) {
        const C = document.createElement('canvas');
        C.width = 1080; C.height = 1920;
        const ctx = C.getContext('2d');
        if (!ctx) return;

        // Background
        const bg = ctx.createLinearGradient(0, 0, 540, 1920);
        bg.addColorStop(0, '#0c0a1a');
        bg.addColorStop(0.4, '#1a1040');
        bg.addColorStop(1, '#0a0812');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, 1080, 1920);

        // Glow orbs
        [[240, 300, '#6366f1', 500], [850, 1600, '#d946ef', 450], [540, 960, '#f59e0b', 300]].forEach(([x, y, color, r]) => {
            const g = ctx.createRadialGradient(x, y, 0, x, y, r);
            g.addColorStop(0, color.replace(')', ',0.18)').replace('rgb', 'rgba').replace('#', ''));
            // Simple hex→rgba
            const hr = parseInt(color.slice(1, 3), 16), hg = parseInt(color.slice(3, 5), 16), hb = parseInt(color.slice(5, 7), 16);
            const g2 = ctx.createRadialGradient(x, y, 0, x, y, r);
            g2.addColorStop(0, `rgba(${hr},${hg},${hb},0.2)`);
            g2.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = g2;
            ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        });

        // Card
        const cx = 80, cy = 260, cw = 920, ch = 1340, cr = 50;
        ctx.beginPath(); roundedRect(ctx, cx, cy, cw, ch, cr);
        ctx.fillStyle = 'rgba(255,255,255,0.04)'; ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 3; ctx.stroke();

        ctx.textBaseline = 'top';

        // Header
        ctx.font = 'bold 32px -apple-system, sans-serif';
        ctx.fillStyle = '#818cf8'; ctx.textAlign = 'left';
        ctx.fillText('KOTHA WRAPPED', cx + 60, cy + 60);
        ctx.textAlign = 'right';
        ctx.font = '600 26px -apple-system, sans-serif';
        ctx.fillStyle = '#4b5563';
        ctx.fillText('onlinekotha.com', cx + cw - 60, cy + 66);
        ctx.textAlign = 'left';

        // Name
        ctx.font = '900 64px -apple-system, sans-serif';
        ctx.fillStyle = '#fff';
        const nameText = `Chat with ${stats.otherName}`;
        // Auto-shrink if too wide
        let nameFont = 64;
        while (ctx.measureText(nameText).width > cw - 140 && nameFont > 36) {
            nameFont -= 2;
            ctx.font = `900 ${nameFont}px -apple-system, sans-serif`;
        }
        ctx.fillText(nameText, cx + 60, cy + 140);

        // Date range
        ctx.font = '600 26px -apple-system, sans-serif';
        ctx.fillStyle = '#6b7280';
        ctx.fillText(`${stats.firstDate || '—'} → ${stats.lastDate || '—'}`, cx + 60, cy + 140 + nameFont + 16);

        // Total messages
        const secY = cy + 320;
        ctx.font = '800 28px -apple-system, sans-serif';
        ctx.fillStyle = '#9ca3af';
        ctx.fillText('TOTAL MESSAGES', cx + 60, secY);
        ctx.font = '900 110px -apple-system, sans-serif';
        const tg = ctx.createLinearGradient(cx, secY + 50, cx, secY + 160);
        tg.addColorStop(0, '#ffffff'); tg.addColorStop(1, '#a5b4fc');
        ctx.fillStyle = tg;
        ctx.fillText(stats.totalMessages.toLocaleString(), cx + 60, secY + 50);

        // Talk ratio
        const ratY = secY + 210;
        ctx.font = '800 28px -apple-system, sans-serif';
        ctx.fillStyle = '#9ca3af';
        ctx.fillText('TALK RATIO', cx + 60, ratY);

        const barW = 380, barH = 18, barY = ratY + 90;
        // Sender 1
        ctx.font = 'bold 28px -apple-system, sans-serif';
        ctx.fillStyle = '#a5b4fc';
        ctx.fillText(`${stats.sender1Name} · ${stats.sender1Percent}%`, cx + 60, ratY + 45);
        ctx.beginPath(); roundedRect(ctx, cx + 60, barY, barW, barH, 9);
        ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fill();
        ctx.beginPath(); roundedRect(ctx, cx + 60, barY, Math.max(2, barW * stats.sender1Percent / 100), barH, 9);
        ctx.fillStyle = '#6366f1'; ctx.fill();

        // Sender 2
        ctx.fillStyle = '#f472b6';
        ctx.fillText(`${stats.sender2Name} · ${stats.sender2Percent}%`, cx + 500, ratY + 45);
        ctx.beginPath(); roundedRect(ctx, cx + 500, barY, barW, barH, 9);
        ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fill();
        ctx.beginPath(); roundedRect(ctx, cx + 500, barY, Math.max(2, barW * stats.sender2Percent / 100), barH, 9);
        const pg = ctx.createLinearGradient(cx + 500, 0, cx + 880, 0);
        pg.addColorStop(0, '#ec4899'); pg.addColorStop(1, '#a855f7');
        ctx.fillStyle = pg; ctx.fill();

        // Bottom row: Peak + Vibe + Emojis
        const bY = barY + 80;
        ctx.font = '800 28px -apple-system, sans-serif';
        ctx.fillStyle = '#9ca3af';
        ctx.fillText('PEAK TIME', cx + 60, bY);
        ctx.font = '900 42px -apple-system, sans-serif';
        ctx.fillStyle = '#fbbf24';
        ctx.fillText(stats.peakLabel, cx + 60, bY + 45);

        ctx.font = '800 28px -apple-system, sans-serif';
        ctx.fillStyle = '#9ca3af';
        ctx.fillText('CHAT VIBE', cx + 60, bY + 140);
        ctx.font = '900 42px -apple-system, sans-serif';
        ctx.fillStyle = '#f472b6';
        ctx.fillText(stats.vibe, cx + 60, bY + 185);

        ctx.font = '800 28px -apple-system, sans-serif';
        ctx.fillStyle = '#9ca3af';
        ctx.fillText('TOP EMOJIS', cx + 60, bY + 290);
        ctx.font = '56px -apple-system, sans-serif';
        ctx.fillText(stats.topEmojis.slice(0, 5).join('  ') || '💬', cx + 60, bY + 335);

        // Footer
        ctx.textAlign = 'center';
        ctx.font = 'bold 30px -apple-system, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.fillText('Made with Kotha · onlinekotha.com', 540, 1740);
        ctx.font = '500 22px -apple-system, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.fillText('Your WhatsApp conversations, beautifully analyzed', 540, 1785);

        // Export
        C.toBlob((blob) => {
            if (!blob) { showToast('Export failed — try again'); return; }
            const fname = `${stats.otherName.toLowerCase().replace(/[^a-z0-9]/g, '_')}_kotha_wrapped.png`;

            if (action === 'copy') {
                if (navigator.clipboard && window.ClipboardItem) {
                    navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
                        .then(() => showToast('Copied to clipboard!'))
                        .catch(() => fallbackDownload(blob, fname));
                } else {
                    fallbackDownload(blob, fname);
                }
            } else {
                fallbackDownload(blob, fname);
            }
        }, 'image/png');
    }

    function fallbackDownload(blob, fname) {
        const file = new File([blob], fname, { type: 'image/png' });
        if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
            navigator.share({ files: [file], title: 'My Kotha Wrapped' })
                .catch(() => directDownload(blob, fname));
        } else {
            directDownload(blob, fname);
        }
    }

    function directDownload(blob, fname) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = fname;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
        showToast('Wrapped card saved!');
    }

    // ── Launch Wrapped ──
    function launchWrapped() {
        const raw = window.kothaGetAllMessages ? window.kothaGetAllMessages() : [];
        if (!raw || raw.length === 0) { showToast('Open a chat first!'); return; }

        const msgs = raw.filter(m => m.sender && m.type !== 'system');
        if (msgs.length < 5) { showToast('Need at least 5 messages for Wrapped!'); return; }

        const stats = computeWrappedStats(msgs);

        // Build overlay
        const overlay = document.createElement('div');
        overlay.id = 'wrapped-overlay';
        overlay.className = 'wrapped-overlay';
        overlay.innerHTML = `
            <div class="wrapped-container">
                <div class="wrapped-blob wrapped-blob-1"></div>
                <div class="wrapped-blob wrapped-blob-2"></div>
                <div class="wrapped-blob wrapped-blob-3"></div>

                <div class="wrapped-progress-container" id="wrapped-progress-container"></div>

                <button class="wrapped-close-btn" id="wrapped-close-btn" title="Close">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>

                <div class="wrapped-slide-wrapper" id="wrapped-slide-wrapper">

                    <!-- 1: Welcome -->
                    <div class="wrapped-slide active">
                        <div class="wrapped-slide-content">
                            <div class="wrapped-header-tag">KOTHA WRAPPED</div>
                            <div class="wrapped-main-body">
                                <div class="text-5xl mb-5" style="animation:pulse 2s infinite">✨</div>
                                <h2 class="wrapped-title" style="overflow-wrap:break-word;word-break:break-word;">Your Chat Story<br>with <span class="text-indigo-400 font-black">${escH(stats.otherName)}</span></h2>
                                <p class="text-sm text-gray-400 mt-4 leading-relaxed max-w-[280px]">${stats.totalMessages.toLocaleString()} messages analyzed across ${stats.firstDate || '?'} to ${stats.lastDate || '?'}</p>
                                <p class="text-xs text-gray-600 mt-3 font-medium">${stats.avgWords} avg words per message</p>
                            </div>
                            <div class="text-[10px] text-gray-500 text-center tracking-widest uppercase">TAP RIGHT TO BEGIN →</div>
                        </div>
                    </div>

                    <!-- 2: Volume -->
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
                                            <span>${escH(stats.sender1Name)}</span>
                                            <span>${stats.sender1Percent}%</span>
                                        </div>
                                        <div class="wrapped-meter-track">
                                            <div class="wrapped-meter-fill" style="width:${stats.sender1Percent}%"></div>
                                        </div>
                                    </div>
                                    <div>
                                        <div class="flex justify-between text-xs font-semibold mb-1 text-purple-300">
                                            <span>${escH(stats.sender2Name)}</span>
                                            <span>${stats.sender2Percent}%</span>
                                        </div>
                                        <div class="wrapped-meter-track">
                                            <div class="wrapped-meter-fill bg-gradient-to-r from-purple-500 to-pink-500" style="width:${stats.sender2Percent}%"></div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div class="text-[10px] text-gray-500 text-center tracking-widest uppercase">TAP RIGHT →</div>
                        </div>
                    </div>

                    <!-- 3: Timing -->
                    <div class="wrapped-slide">
                        <div class="wrapped-slide-content">
                            <div class="wrapped-header-tag">TIMING IS EVERYTHING</div>
                            <div class="wrapped-main-body w-full">
                                <p class="text-xs text-gray-400 uppercase tracking-wider mb-3">You chat the most as...</p>
                                <div class="text-xl font-black text-amber-400 mb-6">${stats.peakLabel}</div>
                                <div class="wrapped-badge-box text-left space-y-2.5">
                                    ${['morning','afternoon','evening','night'].map(p => {
                                        const icons = { morning: '🌅', afternoon: '☀️', evening: '🌆', night: '🦉' };
                                        const labels = { morning: 'Morning (6am–12pm)', afternoon: 'Afternoon (12–5pm)', evening: 'Evening (5–10pm)', night: 'Late Night (10pm–6am)' };
                                        const count = stats.timeCounts[p];
                                        const pct = stats.totalMessages > 0 ? Math.round((count / stats.totalMessages) * 100) : 0;
                                        const isP = p === stats.peakPeriod;
                                        return `
                                            <div>
                                                <div class="flex justify-between text-xs ${isP ? 'text-amber-300 font-bold' : 'text-gray-400'} mb-1">
                                                    <span>${icons[p]} ${labels[p]}</span>
                                                    <span class="font-bold">${count.toLocaleString()} (${pct}%)</span>
                                                </div>
                                                <div class="h-1.5 rounded-full bg-white/[0.08] overflow-hidden">
                                                    <div class="h-full rounded-full ${isP ? 'bg-amber-400' : 'bg-white/15'}" style="width:${pct}%"></div>
                                                </div>
                                            </div>
                                        `;
                                    }).join('')}
                                </div>
                            </div>
                            <div class="text-[10px] text-gray-500 text-center tracking-widest uppercase">TAP RIGHT →</div>
                        </div>
                    </div>

                    <!-- 4: Emojis -->
                    <div class="wrapped-slide">
                        <div class="wrapped-slide-content">
                            <div class="wrapped-header-tag">EMOJI CHAMPIONS</div>
                            <div class="wrapped-main-body w-full">
                                <p class="text-xs text-gray-400 uppercase tracking-wider mb-6">Your most used emojis</p>
                                ${stats.topEmojis.length > 0 ? `
                                    <div class="flex items-end justify-center gap-4 h-40">
                                        ${stats.topEmojis.slice(0, 3).map((emoji, i) => {
                                            const h = ['h-32', 'h-24', 'h-20'][i];
                                            const s = ['text-5xl', 'text-4xl', 'text-3xl'][i];
                                            const c = ['bg-indigo-600/30 border-indigo-500/50', 'bg-purple-600/30 border-purple-500/50', 'bg-pink-600/30 border-pink-500/50'][i];
                                            return `
                                                <div class="flex flex-col items-center gap-1.5">
                                                    <div class="w-16 ${h} ${c} border backdrop-blur-sm rounded-t-2xl flex items-center justify-center ${s} shadow-lg" style="animation:slideUp 400ms ${i * 100}ms both cubic-bezier(0.16,1,0.3,1)">${emoji}</div>
                                                    <span class="text-[10px] font-bold text-gray-400">#${i + 1}</span>
                                                </div>
                                            `;
                                        }).join('')}
                                    </div>
                                    ${stats.topEmojis.length > 3 ? `
                                        <div class="flex gap-4 mt-6 justify-center">
                                            ${stats.topEmojis.slice(3, 5).map((emoji, i) => `
                                                <div class="bg-gray-800/40 border border-gray-700/50 rounded-xl px-3 py-1.5 flex items-center gap-2">
                                                    <span class="text-xl">${emoji}</span>
                                                    <span class="text-[10px] font-bold text-gray-400">#${i + 4}</span>
                                                </div>
                                            `).join('')}
                                        </div>
                                    ` : ''}
                                ` : `<div class="text-gray-500 text-sm">No emojis found in this chat!</div>`}
                            </div>
                            <div class="text-[10px] text-gray-500 text-center tracking-widest uppercase">TAP RIGHT →</div>
                        </div>
                    </div>

                    <!-- 5: Vibe -->
                    <div class="wrapped-slide">
                        <div class="wrapped-slide-content">
                            <div class="wrapped-header-tag">THE VIBE CHECK</div>
                            <div class="wrapped-main-body">
                                <p class="text-xs text-gray-400 uppercase tracking-wider mb-3">Your Relationship Vibe</p>
                                <div class="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-pink-400 to-indigo-400 mb-4">${stats.vibe}</div>
                                <div class="wrapped-badge-box mt-4">
                                    <p class="text-xs text-gray-300 leading-relaxed font-medium">${stats.vibeDesc}</p>
                                </div>
                                <div class="text-6xl mt-8" style="animation:pulse 2s infinite">${stats.topEmojis[0] || '💬'}</div>
                            </div>
                            <div class="text-[10px] text-gray-500 text-center tracking-widest uppercase">TAP RIGHT FOR SHARE CARD →</div>
                        </div>
                    </div>

                    <!-- 6: Share / Export -->
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
                                    <h3 class="text-lg font-black text-white leading-tight mb-4">Chat with ${escH(stats.otherName)}</h3>
                                    <div class="space-y-3.5">
                                        <div>
                                            <p class="text-[9px] text-gray-400 uppercase font-extrabold tracking-wider">Total Messages</p>
                                            <p class="text-xl font-black text-white">${stats.totalMessages.toLocaleString()}</p>
                                        </div>
                                        <div class="grid grid-cols-2 gap-2">
                                            <div>
                                                <p class="text-[9px] text-gray-400 uppercase font-extrabold tracking-wider">Peak Time</p>
                                                <p class="text-xs font-extrabold text-indigo-200">${stats.peakLabel}</p>
                                            </div>
                                            <div>
                                                <p class="text-[9px] text-gray-400 uppercase font-extrabold tracking-wider">Chat Vibe</p>
                                                <p class="text-xs font-extrabold text-purple-200">${stats.vibe}</p>
                                            </div>
                                        </div>
                                        <div>
                                            <p class="text-[9px] text-gray-400 uppercase font-extrabold tracking-wider mb-1">Top Emojis</p>
                                            <p class="text-xl font-bold flex gap-1.5">${stats.topEmojis.slice(0, 5).join(' ') || '💬'}</p>
                                        </div>
                                    </div>
                                </div>

                                <!-- BUTTONS — z-index raised above nav taps -->
                                <div class="wrapped-action-btns flex flex-col gap-2 mt-5 w-full relative" style="z-index:200">
                                    <button class="wrapped-download-btn mt-0 flex items-center gap-2 w-full justify-center" id="wrapped-download-btn">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                                        Share / Download Card
                                    </button>
                                    <button class="bg-white/10 hover:bg-white/20 border border-white/10 text-white font-extrabold text-[12.5px] rounded-xl py-2.5 px-4 flex items-center gap-2 w-full justify-center transition active:scale-95 cursor-pointer" id="wrapped-copy-btn">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                                        Copy Image to Clipboard
                                    </button>
                                </div>
                            </div>
                            <div class="text-[10px] text-gray-500 text-center uppercase tracking-widest">← TAP LEFT TO REWATCH</div>
                        </div>
                    </div>
                </div>

                <!-- Navigation Tap Zones -->
                <div class="wrapped-nav-tap wrapped-nav-tap-left" id="wrapped-nav-left"></div>
                <div class="wrapped-nav-tap wrapped-nav-tap-right" id="wrapped-nav-right"></div>
            </div>
        `;
        document.body.appendChild(overlay);

        // Build progress bars
        const progC = overlay.querySelector('#wrapped-progress-container');
        const slideEls = overlay.querySelectorAll('.wrapped-slide');
        progC.innerHTML = '';
        slideEls.forEach(() => {
            const bar = document.createElement('div');
            bar.className = 'wrapped-progress-bar';
            bar.innerHTML = '<div class="wrapped-progress-fill"></div>';
            progC.appendChild(bar);
        });

        // Start story
        activeStory = new WrappedStory(slideEls, () => {});
        activeStory.start();

        // Pause / resume on hold (but not on buttons)
        const cont = overlay.querySelector('.wrapped-container');
        cont.addEventListener('pointerdown', (e) => {
            if (e.target.closest('.wrapped-action-btns') || e.target.closest('#wrapped-close-btn')) return;
            activeStory.pause();
        });
        const doResume = () => { if (activeStory) activeStory.resume(); };
        cont.addEventListener('pointerup', doResume);
        cont.addEventListener('pointerleave', doResume);

        // Nav taps — but NOT when on last slide action buttons
        overlay.querySelector('#wrapped-nav-left').addEventListener('click', (e) => {
            e.stopPropagation();
            activeStory.prev();
        });
        overlay.querySelector('#wrapped-nav-right').addEventListener('click', (e) => {
            // If on last slide, don't hijack — let the button work
            if (activeStory && activeStory.currentIndex === slideEls.length - 1) return;
            e.stopPropagation();
            activeStory.next();
        });

        // Close
        const close = () => {
            if (activeStory) { activeStory.destroy(); activeStory = null; }
            overlay.remove();
            document.removeEventListener('keydown', escH2);
        };
        overlay.querySelector('#wrapped-close-btn').addEventListener('click', close);
        const escH2 = (e) => { if (e.key === 'Escape') close(); };
        document.addEventListener('keydown', escH2);

        // Download & Copy — direct listeners, high z-index, no interference
        overlay.querySelector('#wrapped-download-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            exportWrappedCanvas(stats, 'download');
        });
        overlay.querySelector('#wrapped-copy-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            exportWrappedCanvas(stats, 'copy');
        });
    }

    // ── Init ──
    function initWrapped() {
        const btn = document.getElementById('btn-wrapped');
        if (btn) btn.addEventListener('click', launchWrapped);
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initWrapped);
    } else {
        initWrapped();
    }
})();
