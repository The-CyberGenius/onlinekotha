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

    // ===== iOS Install Prompt =====
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isStandalone = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;

    if (isIOS && !isStandalone) {
        setTimeout(showIOSInstallBanner, 4000);
    }

    function showIOSInstallBanner() {
        if (document.getElementById('ios-install-banner') || localStorage.getItem('kotha_ios_install_dismissed')) return;
        const banner = document.createElement('div');
        banner.id = 'ios-install-banner';
        banner.className = 'fixed bottom-20 left-4 right-4 md:left-auto md:right-4 md:w-80 bg-zinc-950 text-white rounded-2xl p-4 shadow-2xl z-[90] flex flex-col gap-3 animate-message border border-white/10';
        banner.innerHTML = `
            <div class="flex items-start gap-3">
                <div class="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center shrink-0">
                    <img src="/logo.svg" alt="Logo" class="w-6 h-6">
                </div>
                <div class="flex-1 min-w-0">
                    <p class="text-sm font-bold">Install Kotha App</p>
                    <p class="text-[11px] text-zinc-400">Save memories and view chats faster on your iPhone.</p>
                </div>
                <button id="ios-dismiss-btn" class="text-zinc-500 hover:text-white transition p-1 shrink-0">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
            </div>
            <div class="bg-white/5 rounded-xl p-3 text-[11px] text-zinc-300 flex flex-col gap-2 border border-white/5">
                <div class="flex items-center gap-2">
                    <span class="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center font-bold text-[10px] shrink-0">1</span>
                    <span>Tap Safari's **Share** button below:</span>
                    <svg class="w-4 h-4 text-blue-400 inline shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13"/></svg>
                </div>
                <div class="flex items-center gap-2">
                    <span class="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center font-bold text-[10px] shrink-0">2</span>
                    <span>Scroll down and select **Add to Home Screen**.</span>
                </div>
            </div>
        `;
        document.body.appendChild(banner);

        document.getElementById('ios-dismiss-btn').addEventListener('click', () => {
            banner.remove();
            localStorage.setItem('kotha_ios_install_dismissed', '1');
        });
    }

    // ===== Tactical Haptic Feedback =====
    document.addEventListener('click', (e) => {
        const target = e.target.closest('.cta-primary, button, a.nav-cta, .reaction-emoji-btn');
        if (target && navigator.vibrate) {
            try { navigator.vibrate(12); } catch {}
        }
    });

    // ═══════════════════════════════════════════════════════════════════
    //  CHAT WRAPPED — Spotify-style story with smart name extraction
    // ═══════════════════════════════════════════════════════════════════

    // ═══════════════════════════════════════════════════════════════
    //  SMART NAME DETECTION — multi-layer intelligence
    // ═══════════════════════════════════════════════════════════════
    //
    // Priority:
    //   1. Clean folder name (if it's a real name, not phone/junk)
    //   2. Other person's WhatsApp sender name (from messages)
    //   3. Nickname detection — scan USER's messages for what they
    //      call the other person most ("Mamu", "Bhai", "Baby" etc.)
    //   4. Fallback: "Friend"

    // Check if a string looks like a phone number or gibberish, not a real name
    function isGarbageName(s) {
        if (!s || s.length < 2) return true;
        const cleaned = s.replace(/[\s\-_+().]/g, '');
        // Mostly digits → phone number
        const digitRatio = (cleaned.replace(/\D/g, '').length) / cleaned.length;
        if (digitRatio > 0.5) return true;
        // Too short after cleaning
        if (cleaned.length < 2) return true;
        // Just "User", "Contact", "Unknown" etc.
        if (/^(user|contact|unknown|friend|you|me|myself)$/i.test(cleaned)) return true;
        return false;
    }

    // Clean a raw folder/chat name into something presentable
    function cleanRawName(raw) {
        if (!raw) return '';
        let name = raw;
        // Strip WhatsApp export prefixes
        name = name.replace(/^whatsapp[\s_-]*chat[\s_-]*(with[\s_-]*)?[-–—]?\s*/i, '');
        // Replace underscores
        name = name.replace(/_/g, ' ');
        // Remove trailing dates/timestamps/numbers
        name = name.replace(/[\s_-]*\(?\d{4,}\)?[\s_-]*$/g, '');
        name = name.replace(/[\s_-]*\d{1,2}[\s_/-]\d{1,2}[\s_/-]\d{2,4}\s*$/g, '');
        name = name.replace(/[\s_-]+\d+\s*$/g, '');
        // Remove file extensions
        name = name.replace(/\.(txt|zip|csv|json)\s*$/i, '');
        // Collapse spaces
        name = name.replace(/\s{2,}/g, ' ').trim();
        return name;
    }

    // Title-case a name nicely
    function titleCase(s) {
        if (!s) return '';
        return s.replace(/\b\w+/g, w => {
            if (w.length <= 3 && w === w.toUpperCase()) return w; // keep "DJ","AB"
            return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
        });
    }

    // ── Nickname detection from actual message content ──
    // Scans the user's own messages for how they address the other person.
    // Returns the most used nickname/address term, or null if nothing found.
    function detectNicknameFromMessages(messages, myName) {
        if (!messages || !myName) return null;

        // Only scan user's own messages (what THEY write TO the other person)
        const myMsgs = messages.filter(m => m.sender === myName && m.text && m.text.length > 1);
        if (myMsgs.length < 5) return null; // Need enough data

        // Common addressing words that could be nicknames (Hindi + English)
        // These are words people use to CALL someone — not just random words
        const addressPatterns = new Set([
            // Hindi family/relationship
            'mamu', 'mama', 'maamu', 'chachu', 'chacha', 'tau', 'tauji',
            'papa', 'mumma', 'mummy', 'mom', 'dad', 'daddy', 'maa',
            'didi', 'di', 'bhaiya', 'bhabhi', 'nanu', 'nani', 'dada', 'dadi',
            'anna', 'akka', 'amma',
            // Hindi casual
            'bhai', 'bro', 'yaar', 'yar', 'yrr', 'dude', 'bhai',
            'pagal', 'pagle', 'pagali', 'buddhu', 'chutki',
            // Romantic / close
            'baby', 'babe', 'babu', 'jaanu', 'jaan', 'jannu', 'janu',
            'shona', 'sonu', 'meri', 'mera', 'love', 'darling', 'dear',
            'sweetheart', 'honey', 'hubby', 'wifey', 'cutie', 'cutey',
            'gudiya', 'golu', 'chintu', 'pintu', 'chiku', 'chhotu',
            'raju', 'munna', 'munni', 'ladoo', 'laddu',
            // Respectful
            'sir', 'maam', 'madam', 'boss', 'bro', 'bruh',
        ]);

        // Words to IGNORE — too common, not names
        const stopWords = new Set([
            'hi', 'hello', 'hey', 'hii', 'hiii', 'yo', 'oi',
            'ok', 'okay', 'okk', 'okkk', 'hmm', 'hmmm', 'hmmmm',
            'ha', 'haa', 'haan', 'nhi', 'nahi', 'na', 'ni',
            'kya', 'kyu', 'kyun', 'kab', 'kaha', 'kaise', 'kaisa',
            'ye', 'yeh', 'wo', 'woh', 'tu', 'tum', 'aap', 'me', 'mai', 'mein',
            'acha', 'accha', 'achha', 'theek', 'thik', 'sahi',
            'are', 'arre', 'arey', 'arre',
            'chal', 'chalo', 'chlo', 'sun', 'suno', 'sunno', 'sunn',
            'ab', 'abhi', 'aaj', 'kal', 'kl',
            'the', 'a', 'an', 'is', 'was', 'i', 'my', 'your', 'we',
            'what', 'why', 'how', 'when', 'where', 'who',
            'lol', 'lmao', 'haha', 'hehe', 'omg', 'wtf', 'bruh',
            'good', 'morning', 'night', 'gm', 'gn',
            'yes', 'no', 'ya', 'yeah', 'nope',
            'so', 'but', 'and', 'or', 'if', 'then', 'to', 'se', 'ka', 'ki', 'ke',
            'bht', 'bohot', 'bahut', 'bhot',
            'image', 'omitted', 'video', 'audio', 'sticker', 'gif', 'document',
            'deleted', 'message', 'this',
        ]);

        // Count how often each word appears as the FIRST word of a message
        // (that's where people usually address someone: "Mamu sun", "Baby good morning")
        const firstWordCounts = {};
        // Also count words that appear RIGHT AT the start, followed by common separators
        const addressCounts = {};

        for (const msg of myMsgs) {
            const text = msg.text.trim();
            if (text.length < 2) continue;

            // Get first word (or first 2 words for compound names like "Sunil Mamu")
            const words = text.split(/[\s,!?.]+/).filter(w => w.length > 0);
            if (words.length === 0) continue;

            const w1 = words[0].toLowerCase().replace(/[^a-zऀ-ॿ]/gi, '');
            if (!w1 || w1.length < 2 || stopWords.has(w1)) continue;

            // Skip if first word is a number
            if (/^\d+$/.test(w1)) continue;

            // Count first-word occurrences
            firstWordCounts[w1] = (firstWordCounts[w1] || 0) + 1;

            // If first word is a known address pattern, boost it
            if (addressPatterns.has(w1)) {
                addressCounts[w1] = (addressCounts[w1] || 0) + 2; // double weight
            }

            // Check 2-word combo: "Sunil Mamu", "Baby girl" etc.
            if (words.length >= 2) {
                const w2 = words[1].toLowerCase().replace(/[^a-zऀ-ॿ]/gi, '');
                if (w2 && w2.length >= 2 && !stopWords.has(w2)) {
                    const combo = `${w1} ${w2}`;
                    firstWordCounts[combo] = (firstWordCounts[combo] || 0) + 1;
                    if (addressPatterns.has(w1) || addressPatterns.has(w2)) {
                        addressCounts[combo] = (addressCounts[combo] || 0) + 2;
                    }
                }
            }
        }

        // Merge scores: address patterns get boosted
        const scores = {};
        for (const [word, count] of Object.entries(firstWordCounts)) {
            // Need at least 3 occurrences to be a real pattern
            if (count < 3) continue;
            scores[word] = count + (addressCounts[word] || 0);
        }

        // Find the word with highest score
        const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
        if (sorted.length === 0) return null;

        const [bestWord, bestScore] = sorted[0];

        // Must appear in at least 2% of user's messages to be meaningful
        const minThreshold = Math.max(3, myMsgs.length * 0.02);
        if (bestScore < minThreshold) return null;

        // Title-case the detected nickname
        return titleCase(bestWord);
    }

    // ── Master name resolver ──
    // Combines all strategies to find the best display name
    function resolveBestName(rawFolder, rawOtherName, senderNames, messages, myName) {
        // Strategy 1: Clean folder name
        const cleanedFolder = cleanRawName(rawFolder);

        // Strategy 2: Other person's sender name from messages
        const otherSender = senderNames?.find(n => n !== myName) || '';

        // Strategy 3: Detect nickname from message content
        const nickname = detectNicknameFromMessages(messages, myName);

        // Decision logic:
        let finalName = '';

        // If folder name is a real name (not phone/junk) → use it
        if (cleanedFolder && !isGarbageName(cleanedFolder)) {
            finalName = cleanedFolder;
        }
        // Else if sender name is real → use it
        else if (otherSender && !isGarbageName(otherSender)) {
            finalName = otherSender;
        }
        // Else if we detected a nickname → use it (this is the magic)
        else if (nickname) {
            finalName = nickname;
        }
        // Else use whatever sender name we have
        else if (otherSender) {
            finalName = otherSender;
        }
        // Last resort
        else {
            finalName = senderNames?.[0] || 'Friend';
        }

        // BUT — if nickname was detected AND folder/sender name exists,
        // check if nickname is MORE personal (people prefer nicknames on Wrapped)
        // If nickname frequency is high enough, prefer it over formal name
        if (nickname && finalName !== nickname) {
            // If nickname is a known relationship term, prefer it as subtitle
            // We'll return both: name + nickname
        }

        // Title case + truncate
        finalName = titleCase(finalName);
        if (finalName.length > 24) {
            finalName = finalName.slice(0, 22).trim() + '…';
        }

        return { name: finalName || 'Friend', nickname: nickname || null };
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
        const myName = window.kothaGetMyName ? window.kothaGetMyName() : s1[0];

        // Smart name resolution: folder → sender → nickname from messages
        const rawFolder = window.kothaGetCurrentChat ? window.kothaGetCurrentChat() : '';
        const rawOther = window.kothaGetOtherPersonName ? window.kothaGetOtherPersonName() : '';
        const { name: otherName, nickname: detectedNickname } = resolveBestName(
            rawOther || rawFolder, rawOther, allSenderNames, messages, myName
        );

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
        let longestMsg = '', longestMsgLen = 0;
        messages.forEach(m => {
            if (m.text) {
                const wc = m.text.split(/\s+/).length;
                totalWords += wc;
                if (wc > longestMsgLen) { longestMsgLen = wc; longestMsg = m.text; }
            }
        });
        const avgWords = totalMessages > 0 ? Math.round(totalWords / totalMessages) : 0;

        // Date range
        let firstDate = '', lastDate = '';
        for (const m of messages) { if (m.date) { firstDate = m.date; break; } }
        for (let i = messages.length - 1; i >= 0; i--) { if (messages[i].date) { lastDate = messages[i].date; break; } }

        // ── Advanced analytics ──

        // Messages per day of week
        const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
        const dayFullNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
        const dayCounts = [0,0,0,0,0,0,0];
        const dateSet = new Set();
        const dateMsgCounts = {};

        messages.forEach(m => {
            if (!m.date) return;
            dateSet.add(m.date);
            dateMsgCounts[m.date] = (dateMsgCounts[m.date] || 0) + 1;
            // Parse date for day-of-week (handles DD/MM/YYYY, MM/DD/YYYY, etc.)
            const parts = m.date.split(/[\/\-\.]/);
            if (parts.length >= 3) {
                // Try DD/MM/YYYY first (WhatsApp default)
                let d = new Date(parseInt(parts[2] < 100 ? '20'+parts[2] : parts[2]), parseInt(parts[1])-1, parseInt(parts[0]));
                if (isNaN(d.getTime())) d = new Date(m.date);
                if (!isNaN(d.getTime())) dayCounts[d.getDay()]++;
            }
        });

        const totalDays = dateSet.size || 1;
        const msgsPerDay = Math.round(totalMessages / totalDays);

        // Busiest day of week
        let busiestDayIdx = 0;
        dayCounts.forEach((c, i) => { if (c > dayCounts[busiestDayIdx]) busiestDayIdx = i; });
        const busiestDay = dayFullNames[busiestDayIdx];

        // Busiest single date
        let busiestDate = '', busiestDateCount = 0;
        Object.entries(dateMsgCounts).forEach(([dt, c]) => {
            if (c > busiestDateCount) { busiestDateCount = c; busiestDate = dt; }
        });

        // Chat streak (consecutive days)
        const sortedDates = [...dateSet].sort((a, b) => {
            const pa = a.split(/[\/\-\.]/), pb = b.split(/[\/\-\.]/);
            const da = new Date(parseInt(pa[2]<100?'20'+pa[2]:pa[2]), parseInt(pa[1])-1, parseInt(pa[0]));
            const db = new Date(parseInt(pb[2]<100?'20'+pb[2]:pb[2]), parseInt(pb[1])-1, parseInt(pb[0]));
            return da - db;
        });
        let maxStreak = 1, curStreak = 1;
        for (let i = 1; i < sortedDates.length; i++) {
            const pa = sortedDates[i-1].split(/[\/\-\.]/), pb = sortedDates[i].split(/[\/\-\.]/);
            const da = new Date(parseInt(pa[2]<100?'20'+pa[2]:pa[2]), parseInt(pa[1])-1, parseInt(pa[0]));
            const db = new Date(parseInt(pb[2]<100?'20'+pb[2]:pb[2]), parseInt(pb[1])-1, parseInt(pb[0]));
            const diff = Math.round((db - da) / 86400000);
            if (diff === 1) { curStreak++; if (curStreak > maxStreak) maxStreak = curStreak; }
            else curStreak = 1;
        }

        // Question marks count (who asks more)
        let s1Questions = 0, s2Questions = 0;
        messages.forEach(m => {
            if (m.text && m.text.includes('?')) {
                if (m.sender === s1[0]) s1Questions++;
                else s2Questions++;
            }
        });
        const totalQuestions = s1Questions + s2Questions;

        // Media count (messages with <Media omitted> or attachment)
        let mediaCount = 0;
        messages.forEach(m => {
            if (m.text && (/media omitted|image omitted|video omitted|audio omitted|sticker omitted|gif omitted|document omitted/i.test(m.text) || /\.(jpg|png|mp4|opus|webp)/i.test(m.text))) mediaCount++;
        });

        // Laughter count
        let laughCount = 0;
        messages.forEach(m => {
            if (m.text && (/ha{2,}|lol|lmao|rofl|😂|🤣|😭/i.test(m.text))) laughCount++;
        });

        // Late night ratio
        const lateNightPct = totalMessages > 0 ? Math.round((tc.night / totalMessages) * 100) : 0;

        // Who texts first (by date — first message of each day)
        let s1First = 0, s2First = 0;
        const seenDates = new Set();
        messages.forEach(m => {
            if (m.date && !seenDates.has(m.date)) {
                seenDates.add(m.date);
                if (m.sender === s1[0]) s1First++;
                else s2First++;
            }
        });

        // Longest message preview (truncated)
        const longestMsgPreview = longestMsg.length > 80 ? longestMsg.slice(0, 77) + '...' : longestMsg;

        return {
            totalMessages, otherName,
            sender1Name: s1[0], sender1Percent: s1Pct,
            sender2Name: s2[0], sender2Percent: s2Pct,
            peakLabel: peakLabels[peak], peakPeriod: peak,
            timeCounts: tc,
            topEmojis, vibe, vibeDesc,
            avgWords, firstDate, lastDate, detectedNickname,
            // Advanced
            totalDays, msgsPerDay, totalWords,
            busiestDay, busiestDayIdx, dayCounts, dayNames,
            busiestDate, busiestDateCount,
            maxStreak, longestMsgLen, longestMsgPreview,
            totalQuestions, s1Questions, s2Questions,
            mediaCount, laughCount, lateNightPct,
            s1First, s2First,
        };
    }

    // ── Canvas export card — Instagram/Facebook story optimized (1080×1920) ──
    function exportWrappedCanvas(stats, action) {
        try {
            const C = document.createElement('canvas');
            const W = 1080, H = 1920;
            C.width = W; C.height = H;
            const ctx = C.getContext('2d');
            if (!ctx) { showToast('Canvas not supported'); return; }

            // ── Rich gradient background ──
            const bg = ctx.createLinearGradient(0, 0, W, H);
            bg.addColorStop(0, '#0f0720');
            bg.addColorStop(0.3, '#1a0d3a');
            bg.addColorStop(0.6, '#120a2e');
            bg.addColorStop(1, '#080510');
            ctx.fillStyle = bg;
            ctx.fillRect(0, 0, W, H);

            // ── Multiple glow orbs for depth ──
            const orbs = [
                [180, 240, '#6366f1', 420, 0.25],
                [900, 400, '#a855f7', 350, 0.18],
                [540, 960, '#ec4899', 500, 0.12],
                [200, 1500, '#f59e0b', 380, 0.15],
                [850, 1650, '#6366f1', 300, 0.2],
            ];
            orbs.forEach(([x, y, hex, r, alpha]) => {
                const hr = parseInt(hex.slice(1, 3), 16), hg = parseInt(hex.slice(3, 5), 16), hb = parseInt(hex.slice(5, 7), 16);
                const g = ctx.createRadialGradient(x, y, 0, x, y, r);
                g.addColorStop(0, `rgba(${hr},${hg},${hb},${alpha})`);
                g.addColorStop(0.6, `rgba(${hr},${hg},${hb},${alpha * 0.3})`);
                g.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = g;
                ctx.fillRect(0, 0, W, H);
            });

            // ── Noise/grain texture overlay ──
            for (let i = 0; i < 3000; i++) {
                const nx = Math.random() * W, ny = Math.random() * H;
                ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.015})`;
                ctx.fillRect(nx, ny, 1, 1);
            }

            ctx.textBaseline = 'top';

            // ── Top branding bar ──
            ctx.textAlign = 'left';
            ctx.font = '800 28px -apple-system, "Segoe UI", sans-serif';
            ctx.fillStyle = '#818cf8';
            ctx.fillText('✦ KOTHA WRAPPED', 80, 100);
            // Professional watermark top right
            ctx.textAlign = 'right';
            ctx.font = '800 24px -apple-system, sans-serif';
            ctx.fillStyle = 'rgba(255,255,255,0.7)';
            ctx.fillText('onlinekotha.com', W - 80, 104);

            // Thin accent line
            const lineGrad = ctx.createLinearGradient(80, 0, W - 80, 0);
            lineGrad.addColorStop(0, '#6366f1');
            lineGrad.addColorStop(0.5, '#ec4899');
            lineGrad.addColorStop(1, '#f59e0b');
            ctx.fillStyle = lineGrad;
            ctx.fillRect(80, 148, W - 160, 3);

            // ── Name section ──
            ctx.textAlign = 'left';
            ctx.font = '900 72px -apple-system, "Segoe UI", sans-serif';
            ctx.fillStyle = '#fff';
            const nameText = `Chat with`;
            ctx.fillText(nameText, 80, 200);

            // Name with gradient
            let nameFont = 80;
            ctx.font = `900 ${nameFont}px -apple-system, "Segoe UI", sans-serif`;
            const nameVal = stats.otherName;
            while (ctx.measureText(nameVal).width > W - 180 && nameFont > 40) {
                nameFont -= 2;
                ctx.font = `900 ${nameFont}px -apple-system, "Segoe UI", sans-serif`;
            }
            const nameGrad = ctx.createLinearGradient(80, 290, 600, 290);
            nameGrad.addColorStop(0, '#a5b4fc');
            nameGrad.addColorStop(0.5, '#c084fc');
            nameGrad.addColorStop(1, '#f472b6');
            ctx.fillStyle = nameGrad;
            ctx.fillText(nameVal, 80, 290);

            // Nickname subtitle
            let subtitleY = 290 + nameFont + 10;
            if (stats.detectedNickname && stats.detectedNickname.toLowerCase() !== stats.otherName.toLowerCase()) {
                ctx.font = '700 30px -apple-system, sans-serif';
                ctx.fillStyle = '#c084fc';
                ctx.fillText(`aka "${stats.detectedNickname}"`, 80, subtitleY);
                subtitleY += 45;
            }

            // Date range
            ctx.font = '600 26px -apple-system, sans-serif';
            ctx.fillStyle = 'rgba(255,255,255,0.35)';
            ctx.fillText(`${stats.firstDate || '—'}  →  ${stats.lastDate || '—'}`, 80, subtitleY);

            // ── Glass card: Total Messages ──
            const cardY = subtitleY + 80;
            ctx.beginPath();
            roundedRect(ctx, 60, cardY, W - 120, 260, 32);
            ctx.fillStyle = 'rgba(255,255,255,0.04)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.08)';
            ctx.lineWidth = 2;
            ctx.stroke();

            ctx.font = '800 22px -apple-system, sans-serif';
            ctx.fillStyle = 'rgba(255,255,255,0.4)';
            ctx.letterSpacing = '3px';
            ctx.fillText('TOTAL MESSAGES', 110, cardY + 35);

            ctx.font = '900 120px -apple-system, sans-serif';
            const numGrad = ctx.createLinearGradient(110, cardY + 70, 110, cardY + 200);
            numGrad.addColorStop(0, '#ffffff');
            numGrad.addColorStop(1, '#a5b4fc');
            ctx.fillStyle = numGrad;
            ctx.fillText(stats.totalMessages.toLocaleString(), 110, cardY + 75);

            ctx.font = '600 24px -apple-system, sans-serif';
            ctx.fillStyle = 'rgba(255,255,255,0.25)';
            ctx.fillText(`${stats.avgWords} avg words per message`, 110, cardY + 210);

            // ── Talk Ratio section ──
            const ratY = cardY + 300;
            ctx.font = '800 22px -apple-system, sans-serif';
            ctx.fillStyle = 'rgba(255,255,255,0.4)';
            ctx.fillText('WHO TALKED MORE', 80, ratY);

            // Sender 1
            const s1Y = ratY + 50;
            ctx.font = 'bold 30px -apple-system, sans-serif';
            ctx.fillStyle = '#a5b4fc';
            ctx.fillText(`${stats.sender1Name}`, 80, s1Y);
            ctx.textAlign = 'right';
            ctx.fillText(`${stats.sender1Percent}%`, W - 80, s1Y);
            ctx.textAlign = 'left';

            const barFullW = W - 160;
            // Bar track
            ctx.beginPath(); roundedRect(ctx, 80, s1Y + 48, barFullW, 16, 8);
            ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fill();
            // Bar fill
            const s1W = Math.max(4, barFullW * stats.sender1Percent / 100);
            ctx.beginPath(); roundedRect(ctx, 80, s1Y + 48, s1W, 16, 8);
            const s1Grad = ctx.createLinearGradient(80, 0, 80 + s1W, 0);
            s1Grad.addColorStop(0, '#6366f1');
            s1Grad.addColorStop(1, '#818cf8');
            ctx.fillStyle = s1Grad; ctx.fill();

            // Sender 2
            const s2Y = s1Y + 85;
            ctx.font = 'bold 30px -apple-system, sans-serif';
            ctx.fillStyle = '#f472b6';
            ctx.fillText(`${stats.sender2Name}`, 80, s2Y);
            ctx.textAlign = 'right';
            ctx.fillText(`${stats.sender2Percent}%`, W - 80, s2Y);
            ctx.textAlign = 'left';

            ctx.beginPath(); roundedRect(ctx, 80, s2Y + 48, barFullW, 16, 8);
            ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fill();
            const s2W = Math.max(4, barFullW * stats.sender2Percent / 100);
            ctx.beginPath(); roundedRect(ctx, 80, s2Y + 48, s2W, 16, 8);
            const s2Grad = ctx.createLinearGradient(80, 0, 80 + s2W, 0);
            s2Grad.addColorStop(0, '#ec4899');
            s2Grad.addColorStop(1, '#a855f7');
            ctx.fillStyle = s2Grad; ctx.fill();

            // ── Two glass cards side by side: Peak Time + Vibe ──
            const pairY = s2Y + 110;
            const cardW = (W - 180) / 2;

            // Peak time card
            ctx.beginPath(); roundedRect(ctx, 60, pairY, cardW, 180, 24);
            ctx.fillStyle = 'rgba(255,255,255,0.03)'; ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1.5; ctx.stroke();

            ctx.font = '800 18px -apple-system, sans-serif';
            ctx.fillStyle = 'rgba(255,255,255,0.35)';
            ctx.fillText('PEAK TIME', 100, pairY + 30);
            ctx.font = '900 36px -apple-system, sans-serif';
            ctx.fillStyle = '#fbbf24';
            // Split peak label if needed
            const peakWords = stats.peakLabel.split(' ');
            if (peakWords.length > 2) {
                ctx.font = '900 32px -apple-system, sans-serif';
                ctx.fillText(peakWords.slice(0, -1).join(' '), 100, pairY + 75);
                ctx.fillText(peakWords.slice(-1).join(' '), 100, pairY + 115);
            } else {
                ctx.fillText(stats.peakLabel, 100, pairY + 85);
            }

            // Vibe card
            const vibeX = 60 + cardW + 60;
            ctx.beginPath(); roundedRect(ctx, vibeX, pairY, cardW, 180, 24);
            ctx.fillStyle = 'rgba(255,255,255,0.03)'; ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1.5; ctx.stroke();

            ctx.font = '800 18px -apple-system, sans-serif';
            ctx.fillStyle = 'rgba(255,255,255,0.35)';
            ctx.fillText('CHAT VIBE', vibeX + 40, pairY + 30);
            ctx.font = '900 32px -apple-system, sans-serif';
            const vibeGrad = ctx.createLinearGradient(vibeX, pairY + 75, vibeX + cardW, pairY + 75);
            vibeGrad.addColorStop(0, '#f472b6');
            vibeGrad.addColorStop(1, '#c084fc');
            ctx.fillStyle = vibeGrad;
            const vibeWords = stats.vibe.split(' ');
            if (vibeWords.length > 2) {
                ctx.font = '900 28px -apple-system, sans-serif';
                ctx.fillText(vibeWords.slice(0, -1).join(' '), vibeX + 40, pairY + 75);
                ctx.fillText(vibeWords.slice(-1).join(' '), vibeX + 40, pairY + 115);
            } else {
                ctx.fillText(stats.vibe, vibeX + 40, pairY + 85);
            }

            // ── Emoji row ──
            const emojiY = pairY + 220;
            ctx.beginPath(); roundedRect(ctx, 60, emojiY, W - 120, 120, 24);
            ctx.fillStyle = 'rgba(255,255,255,0.03)'; ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1.5; ctx.stroke();

            ctx.font = '800 18px -apple-system, sans-serif';
            ctx.fillStyle = 'rgba(255,255,255,0.35)';
            ctx.fillText('TOP EMOJIS', 100, emojiY + 20);
            ctx.font = '56px -apple-system, sans-serif';
            ctx.fillText(stats.topEmojis.slice(0, 5).join('   ') || '💬', 100, emojiY + 50);

            // ── Footer with CTA ──
            // Gradient accent line
            ctx.fillStyle = lineGrad;
            ctx.fillRect(80, H - 220, W - 160, 2);

            ctx.textAlign = 'center';
            ctx.font = '800 28px -apple-system, sans-serif';
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.fillText('Generate your own stats at', W / 2, H - 180);

            // Beautiful Pill Badge for onlinekotha.com
            ctx.beginPath();
            roundedRect(ctx, W/2 - 220, H - 135, 440, 70, 35);
            const badgeGrad = ctx.createLinearGradient(W/2 - 220, 0, W/2 + 220, 0);
            badgeGrad.addColorStop(0, '#6366f1');
            badgeGrad.addColorStop(0.5, '#c084fc');
            badgeGrad.addColorStop(1, '#f472b6');
            ctx.fillStyle = badgeGrad;
            ctx.fill();
            
            // Shadow / glow for badge
            ctx.shadowColor = 'rgba(192, 132, 252, 0.4)';
            ctx.shadowBlur = 20;
            ctx.fill();
            ctx.shadowBlur = 0; // reset
            
            ctx.font = '900 32px -apple-system, sans-serif';
            ctx.fillStyle = '#ffffff';
            ctx.fillText('onlinekotha.com', W/2, H - 117);

            // ── Export ──
            const fname = `${stats.otherName.toLowerCase().replace(/[^a-z0-9]/g, '_')}_kotha_wrapped.png`;
            if (action === 'copy') {
                if (navigator.clipboard && window.ClipboardItem) {
                    try {
                        const copyPromise = new Promise((resolve, reject) => {
                            C.toBlob((blob) => {
                                if (blob) resolve(blob);
                                else reject(new Error('Canvas to blob failed'));
                            }, 'image/png', 1.0);
                        });
                        navigator.clipboard.write([
                            new ClipboardItem({ 'image/png': copyPromise })
                        ]).then(() => {
                            showToast('✅ Copied to clipboard!');
                        }).catch((err) => {
                            console.error('Clipboard write error, falling back to download:', err);
                            C.toBlob((blob) => {
                                if (blob) fallbackDownload(blob, fname);
                            }, 'image/png', 1.0);
                        });
                    } catch (e) {
                        console.error('ClipboardItem promise error, falling back:', e);
                        C.toBlob((blob) => {
                            if (blob) fallbackDownload(blob, fname);
                        }, 'image/png', 1.0);
                    }
                } else {
                    C.toBlob((blob) => {
                        if (blob) fallbackDownload(blob, fname);
                    }, 'image/png', 1.0);
                }
            } else {
                syncDownload(C, fname);
            }
        } catch (err) {
            console.error('Wrapped export error:', err);
            showToast('Export failed — ' + (err.message || 'unknown error'));
        }
    }

    // Helper used previously to convert dataUrl to file (removed since we use canvas.toBlob directly now)


    function syncDownload(canvas, fname) {
        try {
            canvas.toBlob((blob) => {
                if (!blob) { showToast('Canvas generation failed'); return; }
                const dataUrl = URL.createObjectURL(blob);
                showShareModal(dataUrl, blob, fname);
            }, 'image/png', 1.0);
        } catch (err) {
            console.error('Download error:', err);
            showToast('Error preparing image');
        }
    }

    function showShareModal(dataUrl, blob, fname) {
        // Remove existing modal if any
        const existing = document.getElementById('kotha-share-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'kotha-share-modal';
        modal.className = 'fixed inset-0 z-[9999] bg-black/80 backdrop-blur-md flex flex-col items-center justify-center p-4 transition-all duration-300 animate-in fade-in';
        
        // WhatsApp SVG
        const waIcon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M12.031 21.082c-1.637 0-3.21-.424-4.63-1.229l-5.182 1.36 1.385-5.051a9.982 9.982 0 0 1-1.34-4.992c0-5.512 4.49-10 10.016-10 5.51 0 9.998 4.488 9.998 10s-4.488 10-9.998 10l-.249-.088zm-4.485-3.08l.31.184c1.28.762 2.768 1.164 4.296 1.164 4.595 0 8.337-3.74 8.337-8.335s-3.742-8.336-8.337-8.336-8.338 3.741-8.338 8.336c0 1.577.42 3.1 1.223 4.42l.202.333-1.1 4 4.107-1.077zm4.61-9.967c-.201-.448-.415-.456-.6-.464-.154-.008-.33-.008-.507-.008a.965.965 0 0 0-.693.32c-.24.256-.91.888-.91 2.16 0 1.272.932 2.504 1.063 2.68.13.176 1.828 2.792 4.43 3.856 2.6 1.064 2.6.704 3.064.64.464-.064 1.498-.608 1.708-1.2.21-.592.21-1.104.148-1.2-.063-.104-.24-.168-.508-.304-.268-.136-1.583-.784-1.83-8.872-.246-.088-.426-.088-.61-.312L15 15.655c-.177.216-.364.24-.62.104-.256-.128-1.132-.416-2.158-1.328-.797-.712-1.336-1.592-1.494-1.85-.157-.256-.017-.392.112-.52.115-.112.268-.304.4-.464.131-.152.176-.256.264-.424.088-.168.044-.32-.02-.456-.064-.136-.61-1.472-.835-2.016z"/></svg>`;
        
        // Insta SVG
        const igIcon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>`;
        
        // Download SVG
        const dlIcon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>`;

        modal.innerHTML = `
            <div class="bg-[#12141c] border border-gray-700/50 shadow-2xl rounded-[32px] p-6 w-full max-w-sm flex flex-col items-center relative" style="box-shadow: 0 25px 50px -12px rgba(99, 102, 241, 0.25);">
                <button class="absolute -top-4 -right-4 w-10 h-10 bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded-full flex items-center justify-center text-white transition-transform active:scale-95" id="close-img-modal">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
                
                <h3 class="text-white font-black text-xl mb-1 mt-2 tracking-tight">Share Your Stats</h3>
                <p class="text-gray-400 text-xs font-medium mb-5 text-center">Exported in high quality</p>
                
                <div class="relative w-full aspect-[9/16] max-h-[50vh] bg-gray-900 rounded-2xl overflow-hidden shadow-inner mb-6 border border-gray-800 flex items-center justify-center group">
                    <img src="${dataUrl}" class="w-full h-full object-contain pointer-events-none" />
                </div>
                
                <div class="flex flex-col gap-3 w-full">
                    <!-- WhatsApp Share -->
                    <button id="share-wa" class="w-full bg-[#25D366] hover:bg-[#20b858] text-white font-extrabold py-3.5 px-4 rounded-xl flex items-center justify-center gap-3 transition-transform active:scale-95">
                        ${waIcon} Share to WhatsApp
                    </button>
                    
                    <!-- Instagram Share -->
                    <button id="share-ig" class="w-full bg-gradient-to-r from-[#f09433] via-[#e6683c] via-[#dc2743] via-[#cc2366] to-[#bc1888] text-white font-extrabold py-3.5 px-4 rounded-xl flex items-center justify-center gap-3 transition-transform active:scale-95">
                        ${igIcon} Share to Instagram
                    </button>
                    
                    <!-- Download -->
                    <button id="share-dl" class="w-full bg-gray-800 hover:bg-gray-700 text-white font-extrabold py-3.5 px-4 rounded-xl flex items-center justify-center gap-3 transition-transform active:scale-95 border border-gray-700">
                        ${dlIcon} Download Image
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        
        // Close handling
        const closeMod = () => {
            modal.style.opacity = '0';
            setTimeout(() => { modal.remove(); URL.revokeObjectURL(dataUrl); }, 300);
        };
        modal.querySelector('#close-img-modal').addEventListener('click', closeMod);
        modal.addEventListener('click', (e) => { if (e.target === modal) closeMod(); });

        const isMobile = /iPad|iPhone|iPod|Android/i.test(navigator.userAgent);

        // Perform share if supported natively, otherwise fallback to download
        const executeShare = async (platform) => {
            const file = new File([blob], fname, { type: 'image/png' });
            
            // Native share is supported (Mobile Safari/Chrome)
            if (isMobile && navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
                try {
                    await navigator.share({ 
                        title: 'My Kotha Stats',
                        text: 'Check out my WhatsApp wrapped from onlinekotha.com! ✨',
                        files: [file] 
                    });
                    showToast(`Shared to ${platform}!`);
                } catch (err) {
                    if (err.name !== 'AbortError') {
                        console.warn('Share failed, downloading instead:', err);
                        performDirectDownload(dataUrl, fname);
                    }
                }
            } else {
                // Desktop fallback - web share API for files on desktop is buggy (creates local tmp paths)
                // Better to just download and tell them to share it
                performDirectDownload(dataUrl, fname);
                showToast(`Image downloaded! Open ${platform} to share it.`);
            }
        };

        modal.querySelector('#share-wa').addEventListener('click', () => {
            executeShare('WhatsApp');
        });
        
        modal.querySelector('#share-ig').addEventListener('click', () => {
            executeShare('Instagram');
        });
        
        modal.querySelector('#share-dl').addEventListener('click', () => {
            performDirectDownload(dataUrl, fname);
        });
    }

    function performDirectDownload(dataUrl, fname) {
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = fname;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        showToast('Image downloaded!');
    }

    // ═══════════════════════════════════════════════════════════════
    //  SINGLE STORY CARD EXPORT — 1080×1920 Instagram/WhatsApp story PNG
    // ═══════════════════════════════════════════════════════════════
    function exportSingleStoryCard(stats, idx) {
        return new Promise((resolveCard) => {
            const W = 1080, H = 1920;
            const C = document.createElement('canvas');
            C.width = W; C.height = H;
            const ctx = C.getContext('2d');
            if (!ctx) { showToast('Canvas not supported'); resolveCard(); return; }

            // ── Drawing helpers ──
            function drawBg() {
                const bg = ctx.createLinearGradient(0, 0, W, H);
                bg.addColorStop(0, '#0f0720');
                bg.addColorStop(0.35, '#1a0d3a');
                bg.addColorStop(0.65, '#120a2e');
                bg.addColorStop(1, '#080510');
                ctx.fillStyle = bg;
                ctx.fillRect(0, 0, W, H);

                // Glow orbs
                const orbs = [
                    [180,300,'#6366f1',400,0.2],
                    [900,500,'#a855f7',350,0.15],
                    [540,1000,'#ec4899',450,0.1],
                    [200,1500,'#f59e0b',350,0.12],
                    [850,1700,'#6366f1',280,0.18]
                ];
                orbs.forEach(([x,y,hex,r,a]) => {
                    const hr=parseInt(hex.slice(1,3),16),hg=parseInt(hex.slice(3,5),16),hb=parseInt(hex.slice(5,7),16);
                    const g=ctx.createRadialGradient(x,y,0,x,y,r);
                    g.addColorStop(0,`rgba(${hr},${hg},${hb},${a})`);
                    g.addColorStop(1,'rgba(0,0,0,0)');
                    ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
                });
            }

            function drawBranding(t) {
                const alpha = Math.min(1, t * 3);
                ctx.save(); ctx.globalAlpha = alpha;
                ctx.textBaseline = 'top'; ctx.textAlign = 'left';
                ctx.font = '800 28px -apple-system, sans-serif';
                ctx.fillStyle = '#818cf8';
                ctx.fillText('✦ KOTHA WRAPPED', 80, 100);
                
                // Professional watermark top right
                ctx.textAlign = 'right';
                ctx.font = '800 24px -apple-system, sans-serif';
                ctx.fillStyle = 'rgba(255,255,255,0.7)';
                ctx.fillText('onlinekotha.com', W - 80, 104);
                
                // Accent line
                const lineGrad = ctx.createLinearGradient(80, 0, W - 80, 0);
                lineGrad.addColorStop(0, '#6366f1');
                lineGrad.addColorStop(0.5, '#ec4899');
                lineGrad.addColorStop(1, '#f59e0b');
                ctx.fillStyle = lineGrad;
                ctx.fillRect(80, 148, W - 160, 3);
                ctx.restore();
            }

            function drawFooter(t) {
                const alpha = Math.min(1, t * 2);
                ctx.save(); ctx.globalAlpha = alpha; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
                
                // Top border line for footer
                const lineGrad = ctx.createLinearGradient(80, 0, W - 80, 0);
                lineGrad.addColorStop(0, '#6366f1'); lineGrad.addColorStop(0.5, '#ec4899'); lineGrad.addColorStop(1, '#f59e0b');
                ctx.fillStyle = lineGrad;
                ctx.fillRect(80, H - 220, W - 160, 2);
                
                ctx.font = '800 28px -apple-system, sans-serif';
                ctx.fillStyle = 'rgba(255,255,255,0.5)';
                ctx.fillText('Generate your own stats at', W/2, H - 180);
                
                // Beautiful Pill Badge for onlinekotha.com
                ctx.beginPath();
                roundedRect(ctx, W/2 - 220, H - 135, 440, 70, 35);
                const badgeGrad = ctx.createLinearGradient(W/2 - 220, 0, W/2 + 220, 0);
                badgeGrad.addColorStop(0, '#6366f1');
                badgeGrad.addColorStop(0.5, '#c084fc');
                badgeGrad.addColorStop(1, '#f472b6');
                ctx.fillStyle = badgeGrad;
                ctx.fill();
                
                // Shadow / glow for badge
                ctx.shadowColor = 'rgba(192, 132, 252, 0.4)';
                ctx.shadowBlur = 20;
                ctx.fill();
                ctx.shadowBlur = 0; // reset
                
                ctx.font = '900 32px -apple-system, sans-serif';
                ctx.fillStyle = '#ffffff';
                ctx.fillText('onlinekotha.com', W/2, H - 117);
                
                ctx.restore();
            }

            // Scene 1: Welcome + Name
            function drawScene1(t) {
                const cy = 400;
                ctx.save();
                ctx.font = `120px -apple-system, sans-serif`;
                ctx.textAlign = 'center';
                ctx.fillText('✨', W/2, cy - 80);
                ctx.restore();

                ctx.save();
                ctx.font = '900 72px -apple-system, sans-serif';
                ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
                ctx.fillText('Your Chat Story', W/2, cy + 80);
                ctx.restore();

                ctx.save();
                let nf = 80;
                ctx.font = `900 ${nf}px -apple-system, sans-serif`;
                while (ctx.measureText('with ' + stats.otherName).width > W - 160 && nf > 40) {
                    nf -= 2; ctx.font = `900 ${nf}px -apple-system, sans-serif`;
                }
                const ng = ctx.createLinearGradient(W/2-300, 0, W/2+300, 0);
                ng.addColorStop(0,'#a5b4fc'); ng.addColorStop(0.5,'#c084fc'); ng.addColorStop(1,'#f472b6');
                ctx.fillStyle = ng; ctx.fillText('with ' + stats.otherName, W/2, cy + 170);
                ctx.restore();

                ctx.save(); ctx.globalAlpha = 0.5;
                ctx.font = '600 30px -apple-system, sans-serif';
                ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
                ctx.fillText(`${stats.firstDate || '—'}  →  ${stats.lastDate || '—'}`, W/2, cy + 170 + nf + 30);
                ctx.restore();

                ctx.save();
                ctx.font = '700 36px -apple-system, sans-serif';
                ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.textAlign = 'center';
                ctx.fillText(`${stats.totalMessages.toLocaleString()} messages analyzed`, W/2, cy + 170 + nf + 90);
                ctx.restore();
            }

            // Scene 2: Total Messages + Talk Ratio
            function drawScene2(t) {
                const cy = 300;
                ctx.save();
                ctx.font = '800 26px -apple-system, sans-serif';
                ctx.fillStyle = 'rgba(255,255,255,0.4)';
                ctx.fillText('TOTAL MESSAGES', 80, cy);
                ctx.restore();

                ctx.font = '900 140px -apple-system, sans-serif';
                const numG = ctx.createLinearGradient(80, cy+50, 80, cy+200);
                numG.addColorStop(0,'#ffffff'); numG.addColorStop(1,'#a5b4fc');
                ctx.fillStyle = numG;
                ctx.fillText(stats.totalMessages.toLocaleString(), 80, cy + 50);

                ctx.save();
                const ratY = cy + 280;
                ctx.font = '800 26px -apple-system, sans-serif';
                ctx.fillStyle = 'rgba(255,255,255,0.4)';
                ctx.fillText('WHO TALKED MORE', 80, ratY);

                const barW = W - 160;

                ctx.font = 'bold 30px -apple-system, sans-serif';
                ctx.fillStyle = '#a5b4fc';
                ctx.fillText(stats.sender1Name, 80, ratY + 55);
                ctx.textAlign = 'right'; ctx.fillText(stats.sender1Percent + '%', W-80, ratY + 55); ctx.textAlign = 'left';
                ctx.beginPath(); roundedRect(ctx, 80, ratY+100, barW, 20, 10);
                ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fill();
                const s1w = Math.max(4, barW * stats.sender1Percent/100);
                ctx.beginPath(); roundedRect(ctx, 80, ratY+100, s1w, 20, 10);
                const sg1 = ctx.createLinearGradient(80,0,80+s1w,0);
                sg1.addColorStop(0,'#6366f1'); sg1.addColorStop(1,'#818cf8');
                ctx.fillStyle = sg1; ctx.fill();

                ctx.fillStyle = '#f472b6';
                ctx.fillText(stats.sender2Name, 80, ratY + 145);
                ctx.textAlign = 'right'; ctx.fillText(stats.sender2Percent + '%', W-80, ratY + 145); ctx.textAlign = 'left';
                ctx.beginPath(); roundedRect(ctx, 80, ratY+190, barW, 20, 10);
                ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fill();
                const s2w = Math.max(4, barW * stats.sender2Percent/100);
                ctx.beginPath(); roundedRect(ctx, 80, ratY+190, s2w, 20, 10);
                const sg2 = ctx.createLinearGradient(80,0,80+s2w,0);
                sg2.addColorStop(0,'#ec4899'); sg2.addColorStop(1,'#a855f7');
                ctx.fillStyle = sg2; ctx.fill();
                ctx.restore();
            }

            // Scene 3: Peak Time + Time Distribution
            function drawScene3(t) {
                const cy = 300;
                ctx.save();
                ctx.font = '800 26px -apple-system, sans-serif';
                ctx.fillStyle = 'rgba(255,255,255,0.4)';
                ctx.fillText('PEAK CHAT TIME', 80, cy);
                ctx.restore();

                ctx.save();
                ctx.font = '900 64px -apple-system, sans-serif';
                ctx.fillStyle = '#fbbf24';
                ctx.fillText(stats.peakLabel, 80, cy + 55);
                ctx.restore();

                const periods = ['morning','afternoon','evening','night'];
                const icons = { morning:'🌅', afternoon:'☀️', evening:'🌆', night:'🦉' };
                const labels = { morning:'Morning', afternoon:'Afternoon', evening:'Evening', night:'Late Night' };

                periods.forEach((p, i) => {
                    const count = stats.timeCounts[p];
                    const pct = stats.totalMessages > 0 ? Math.round((count/stats.totalMessages)*100) : 0;
                    const isP = p === stats.peakPeriod;
                    const by = cy + 180 + i * 90;

                    ctx.save();
                    ctx.font = `${isP ? 'bold' : '600'} 28px -apple-system, sans-serif`;
                    ctx.fillStyle = isP ? '#fbbf24' : 'rgba(255,255,255,0.4)';
                    ctx.fillText(`${icons[p]} ${labels[p]}`, 80, by);
                    ctx.textAlign = 'right';
                    ctx.fillText(`${count.toLocaleString()} (${pct}%)`, W-80, by);
                    ctx.textAlign = 'left';

                    const barW = W - 160;
                    ctx.beginPath(); roundedRect(ctx, 80, by+40, barW, 14, 7);
                    ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fill();
                    const bw = Math.max(2, barW * pct/100);
                    ctx.beginPath(); roundedRect(ctx, 80, by+40, bw, 14, 7);
                    ctx.fillStyle = isP ? '#fbbf24' : 'rgba(255,255,255,0.15)'; ctx.fill();
                    ctx.restore();
                });
            }

            // Scene 4: Fun Facts & Records
            function drawScene4(t) {
                ctx.textBaseline = 'top'; ctx.textAlign = 'left';
                const cy = 220;
                ctx.font = '800 24px -apple-system, sans-serif';
                ctx.fillStyle = 'rgba(255,255,255,0.4)';
                ctx.fillText('FUN FACTS', 80, cy);

                const facts = [
                    ['🔥', 'LONGEST STREAK', stats.maxStreak + ' days straight', '#fb923c'],
                    ['📅', 'DAYS CHATTING', stats.totalDays + ' days · ' + stats.msgsPerDay + ' msgs/day', '#a5b4fc'],
                    ['💬', 'TOTAL WORDS', stats.totalWords.toLocaleString() + ' words', '#c084fc'],
                    ['😂', 'LOL MOMENTS', stats.laughCount.toLocaleString() + ' msgs with laughter', '#fbbf24'],
                ];
                if (stats.mediaCount > 0) facts.push(['📸', 'MEDIA SHARED', stats.mediaCount.toLocaleString() + ' photos/videos', '#22d3ee']);

                facts.forEach(([icon, label, value, color], i) => {
                    const fy = cy + 65 + i * 145;
                    // Card
                    ctx.beginPath(); roundedRect(ctx, 60, fy, W-120, 120, 24);
                    ctx.fillStyle = 'rgba(255,255,255,0.03)'; ctx.fill();
                    ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1.5; ctx.stroke();
                    // Icon
                    ctx.font = '48px -apple-system, sans-serif';
                    ctx.fillText(icon, 90, fy + 15);
                    // Label
                    ctx.font = '700 18px -apple-system, sans-serif';
                    ctx.fillStyle = 'rgba(255,255,255,0.4)';
                    ctx.fillText(label, 165, fy + 20);
                    // Value
                    let vf = 38;
                    ctx.font = `900 ${vf}px -apple-system, sans-serif`;
                    while (ctx.measureText(value).width > W - 280 && vf > 22) { vf -= 2; ctx.font = `900 ${vf}px -apple-system, sans-serif`; }
                    ctx.fillStyle = color;
                    ctx.fillText(value, 165, fy + 55);
                });
            }

            // Scene 5: Who's Eager + Day Activity
            function drawScene5(t) {
                ctx.textBaseline = 'top'; ctx.textAlign = 'center';
                const cy = 220;
                ctx.font = '800 24px -apple-system, sans-serif';
                ctx.fillStyle = 'rgba(255,255,255,0.4)';
                ctx.fillText("WHO'S MORE EAGER?", W/2, cy);

                ctx.font = '600 28px -apple-system, sans-serif';
                ctx.fillStyle = 'rgba(255,255,255,0.35)';
                ctx.fillText('Who texts first each day?', W/2, cy + 50);

                // VS layout
                const vsY = cy + 120;
                // Sender 1
                ctx.font = '900 72px -apple-system, sans-serif';
                ctx.fillStyle = stats.s1First >= stats.s2First ? '#a5b4fc' : 'rgba(255,255,255,0.3)';
                ctx.fillText(String(stats.s1First), W/2 - 200, vsY);
                ctx.font = '700 26px -apple-system, sans-serif';
                ctx.fillStyle = 'rgba(255,255,255,0.5)';
                ctx.fillText(stats.sender1Name, W/2 - 200, vsY + 80);
                if (stats.s1First >= stats.s2First) {
                    ctx.font = '700 22px -apple-system, sans-serif';
                    ctx.fillStyle = '#a5b4fc';
                    ctx.fillText('👑 STARTER', W/2 - 200, vsY + 115);
                }
                // VS
                ctx.font = '800 40px -apple-system, sans-serif';
                ctx.fillStyle = 'rgba(255,255,255,0.15)';
                ctx.fillText('vs', W/2, vsY + 30);
                // Sender 2
                ctx.font = '900 72px -apple-system, sans-serif';
                ctx.fillStyle = stats.s2First > stats.s1First ? '#f472b6' : 'rgba(255,255,255,0.3)';
                ctx.fillText(String(stats.s2First), W/2 + 200, vsY);
                ctx.font = '700 26px -apple-system, sans-serif';
                ctx.fillStyle = 'rgba(255,255,255,0.5)';
                ctx.fillText(stats.sender2Name, W/2 + 200, vsY + 80);
                if (stats.s2First > stats.s1First) {
                    ctx.font = '700 22px -apple-system, sans-serif';
                    ctx.fillStyle = '#f472b6';
                    ctx.fillText('👑 STARTER', W/2 + 200, vsY + 115);
                }

                // Busiest day card
                const bdY = vsY + 190;
                ctx.textAlign = 'left';
                ctx.beginPath(); roundedRect(ctx, 60, bdY, W-120, 130, 28);
                ctx.fillStyle = 'rgba(251,191,36,0.06)'; ctx.fill();
                ctx.strokeStyle = 'rgba(251,191,36,0.2)'; ctx.lineWidth = 2; ctx.stroke();
                ctx.font = '700 20px -apple-system, sans-serif';
                ctx.fillStyle = 'rgba(255,255,255,0.4)';
                ctx.fillText('BUSIEST DAY OF WEEK', 110, bdY + 25);
                ctx.font = '900 42px -apple-system, sans-serif';
                ctx.fillStyle = '#fbbf24';
                ctx.fillText(stats.busiestDay + 's are your day! 📆', 110, bdY + 60);

                // Most active date
                if (stats.busiestDateCount > 0) {
                    const mdY = bdY + 165;
                    ctx.beginPath(); roundedRect(ctx, 60, mdY, W-120, 120, 28);
                    ctx.fillStyle = 'rgba(52,211,153,0.06)'; ctx.fill();
                    ctx.strokeStyle = 'rgba(52,211,153,0.2)'; ctx.lineWidth = 2; ctx.stroke();
                    ctx.font = '700 20px -apple-system, sans-serif';
                    ctx.fillStyle = 'rgba(255,255,255,0.4)';
                    ctx.fillText('MOST ACTIVE DAY EVER', 110, mdY + 22);
                    ctx.font = '900 36px -apple-system, sans-serif';
                    ctx.fillStyle = '#34d399';
                    ctx.fillText(stats.busiestDate + ' — ' + stats.busiestDateCount + ' msgs! 🎉', 110, mdY + 60);
                }

                // Questions
                if (stats.totalQuestions > 0) {
                    const qY = bdY + (stats.busiestDateCount > 0 ? 320 : 165);
                    ctx.beginPath(); roundedRect(ctx, 60, qY, W-120, 110, 28);
                    ctx.fillStyle = 'rgba(255,255,255,0.03)'; ctx.fill();
                    ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1.5; ctx.stroke();
                    ctx.font = '700 20px -apple-system, sans-serif';
                    ctx.fillStyle = 'rgba(255,255,255,0.4)';
                    ctx.fillText('QUESTIONS ASKED ❓', 110, qY + 20);
                    ctx.font = '800 30px -apple-system, sans-serif';
                    ctx.fillStyle = '#c084fc';
                    ctx.fillText(stats.sender1Name + ': ' + stats.s1Questions + '  ·  ' + stats.sender2Name + ': ' + stats.s2Questions, 110, qY + 55);
                }
            }

            // Scene 6: Emojis
            function drawScene6(t) {
                ctx.textBaseline = 'top'; ctx.textAlign = 'center';
                const cy = 300;
                ctx.font = '800 26px -apple-system, sans-serif';
                ctx.fillStyle = 'rgba(255,255,255,0.4)';
                ctx.fillText('EMOJI CHAMPIONS', W/2, cy);

                const emojis = stats.topEmojis.slice(0, 5);
                const spacing = 170;
                const startX = W/2 - ((emojis.length - 1) * spacing) / 2;

                // Podium style
                emojis.forEach((emoji, i) => {
                    const ex = startX + i * spacing;
                    const heights = [260, 200, 160, 120, 100];
                    const barH = heights[i] || 100;
                    const barY = 720 - barH;
                    const colors = ['#6366f1','#a855f7','#ec4899','#f472b6','#818cf8'];
                    // Bar
                    ctx.beginPath(); roundedRect(ctx, ex - 55, barY, 110, barH, 20);
                    const bg = ctx.createLinearGradient(0, barY, 0, barY + barH);
                    bg.addColorStop(0, colors[i]); bg.addColorStop(1, 'rgba(0,0,0,0.1)');
                    ctx.fillStyle = bg; ctx.fill();
                    ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 1.5; ctx.stroke();
                    // Emoji on top
                    ctx.font = `${i === 0 ? 72 : i < 3 ? 56 : 44}px -apple-system, sans-serif`;
                    ctx.fillText(emoji, ex, barY - (i === 0 ? 85 : i < 3 ? 70 : 55));
                    // Rank
                    ctx.font = '800 28px -apple-system, sans-serif';
                    ctx.fillStyle = '#fff';
                    ctx.fillText('#' + (i + 1), ex, barY + 20);
                });
                ctx.textAlign = 'left';
            }

            // Scene 7: Vibe
            function drawScene7(t) {
                ctx.textBaseline = 'top'; ctx.textAlign = 'center';
                const cy = 350;
                ctx.font = '800 26px -apple-system, sans-serif';
                ctx.fillStyle = 'rgba(255,255,255,0.4)';
                ctx.fillText('YOUR CHAT VIBE', W/2, cy);

                ctx.font = '900 56px -apple-system, sans-serif';
                const vg = ctx.createLinearGradient(W/2-300,0,W/2+300,0);
                vg.addColorStop(0,'#f472b6'); vg.addColorStop(1,'#c084fc');
                ctx.fillStyle = vg;
                ctx.fillText(stats.vibe, W/2, cy + 55);

                ctx.save(); ctx.globalAlpha = 0.6;
                ctx.font = '600 28px -apple-system, sans-serif';
                ctx.fillStyle = '#fff';
                const desc = stats.vibeDesc || '';
                if (desc.length > 55) {
                    const mid = desc.lastIndexOf(' ', 55);
                    ctx.fillText(desc.slice(0, mid > 0 ? mid : 55), W/2, cy + 145);
                    ctx.fillText(desc.slice(mid > 0 ? mid+1 : 55), W/2, cy + 183);
                } else {
                    ctx.fillText(desc, W/2, cy + 145);
                }
                ctx.restore();

                // Big emoji
                ctx.font = '120px -apple-system, sans-serif';
                ctx.fillText(stats.topEmojis[0] || '💬', W/2, cy + 250);

                // Late night stat
                ctx.font = '700 26px -apple-system, sans-serif';
                ctx.fillStyle = 'rgba(255,255,255,0.35)';
                ctx.fillText(stats.lateNightPct + '% of chats happen after midnight 🌙', W/2, cy + 420);
                ctx.textAlign = 'left';
            }

            // Scene 8: Summary card + CTA (for share image)
            function drawScene8(t) {
                const cardY = 220;
                const cardH = 1000;
                ctx.textBaseline = 'top';

                ctx.save();
                ctx.beginPath(); roundedRect(ctx, 80, cardY, W-160, cardH, 40);
                ctx.fillStyle = 'rgba(255,255,255,0.04)'; ctx.fill();
                ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 2; ctx.stroke();

                ctx.textAlign = 'left';
                let y = cardY + 40;

                ctx.font = '900 48px -apple-system, sans-serif';
                ctx.fillStyle = '#fff';
                let nf2 = 48;
                ctx.font = `900 ${nf2}px -apple-system, sans-serif`;
                while (ctx.measureText('Chat with ' + stats.otherName).width > W - 280 && nf2 > 28) { nf2 -= 2; ctx.font = `900 ${nf2}px -apple-system, sans-serif`; }
                ctx.fillText('Chat with ' + stats.otherName, 140, y);
                y += nf2 + 25;

                const items = [
                    ['💬', 'MESSAGES', stats.totalMessages.toLocaleString(), '#a5b4fc'],
                    ['📅', 'DAYS ACTIVE', String(stats.totalDays), '#818cf8'],
                    ['🔥', 'STREAK', stats.maxStreak + ' days', '#fb923c'],
                    ['⏰', 'PEAK TIME', stats.peakLabel, '#fbbf24'],
                    ['✨', 'VIBE', stats.vibe, '#f472b6'],
                    ['😂', 'LOL MOMENTS', stats.laughCount.toLocaleString(), '#fbbf24'],
                ];
                // 2-col grid
                const colW = (W - 320) / 2;
                items.forEach(([icon, label, value, color], i) => {
                    const col = i % 2;
                    const row = Math.floor(i / 2);
                    const cx = 140 + col * (colW + 40);
                    const ry = y + row * 120;

                    ctx.font = '36px -apple-system, sans-serif';
                    ctx.fillText(icon, cx, ry);
                    ctx.font = '700 16px -apple-system, sans-serif';
                    ctx.fillStyle = 'rgba(255,255,255,0.35)';
                    ctx.fillText(label, cx + 50, ry + 5);
                    let vf2 = 36;
                    ctx.font = `900 ${vf2}px -apple-system, sans-serif`;
                    while (ctx.measureText(value).width > colW - 60 && vf2 > 20) { vf2 -= 2; ctx.font = `900 ${vf2}px -apple-system, sans-serif`; }
                    ctx.fillStyle = color;
                    ctx.fillText(value, cx + 50, ry + 30);
                });
                y += Math.ceil(items.length / 2) * 120 + 15;

                // Emojis
                ctx.font = '700 16px -apple-system, sans-serif';
                ctx.fillStyle = 'rgba(255,255,255,0.35)';
                ctx.fillText('TOP EMOJIS', 140, y);
                ctx.font = '52px -apple-system, sans-serif';
                ctx.fillText(stats.topEmojis.slice(0,5).join('  ') || '💬', 140, y + 28);

                ctx.restore();
            }

            const scenes = [drawScene1, drawScene2, drawScene3, drawScene4, drawScene5, drawScene6, drawScene7, drawScene8];
            
            ctx.clearRect(0, 0, W, H);
            drawBg();
            drawBranding(1.0);
            scenes[idx](1.0);
            drawFooter(1.0);

            const fname = `wrapped_story_${idx + 1}_${stats.otherName.toLowerCase().replace(/[^a-z0-9]/g, '_')}.png`;
            syncDownload(C, fname);
            resolveCard();
        });
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
                                ${stats.detectedNickname && stats.detectedNickname.toLowerCase() !== stats.otherName.toLowerCase() ? `<p class="text-xs text-purple-400/80 mt-1 font-bold tracking-wide">aka "${escH(stats.detectedNickname)}"</p>` : ''}
                                <p class="text-sm text-gray-400 mt-4 leading-relaxed max-w-[280px]">${stats.totalMessages.toLocaleString()} messages analyzed across ${stats.firstDate || '?'} to ${stats.lastDate || '?'}</p>
                                <p class="text-xs text-gray-600 mt-3 font-medium">${stats.avgWords} avg words per message</p>
                            </div>
                            <div class="wrapped-action-btns flex justify-center w-full mt-3 relative" style="z-index:200">
                                <button class="wrapped-slide-save-btn bg-white/10 hover:bg-white/20 border border-white/10 text-white font-extrabold text-[12px] rounded-xl py-2 px-3.5 flex items-center gap-1.5 transition active:scale-95 cursor-pointer" data-scene="0">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                                    Save Card
                                </button>
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
                            <div class="wrapped-action-btns flex justify-center w-full mt-3 relative" style="z-index:200">
                                <button class="wrapped-slide-save-btn bg-white/10 hover:bg-white/20 border border-white/10 text-white font-extrabold text-[12px] rounded-xl py-2 px-3.5 flex items-center gap-1.5 transition active:scale-95 cursor-pointer" data-scene="1">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                                    Save Card
                                </button>
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
                            <div class="wrapped-action-btns flex justify-center w-full mt-3 relative" style="z-index:200">
                                <button class="wrapped-slide-save-btn bg-white/10 hover:bg-white/20 border border-white/10 text-white font-extrabold text-[12px] rounded-xl py-2 px-3.5 flex items-center gap-1.5 transition active:scale-95 cursor-pointer" data-scene="2">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                                    Share / Save
                                </button>
                            </div>
                            <div class="text-[10px] text-gray-500 text-center tracking-widest uppercase">TAP RIGHT →</div>
                        </div>
                    </div>

                    <!-- 4: Fun Facts & Records -->
                    <div class="wrapped-slide">
                        <div class="wrapped-slide-content">
                            <div class="wrapped-header-tag">FUN FACTS</div>
                            <div class="wrapped-main-body w-full">
                                <p class="text-xs text-gray-400 uppercase tracking-wider mb-4">Mind-blowing chat stats</p>
                                <div class="space-y-3 w-full">
                                    <div class="wrapped-badge-box text-left flex items-center gap-3">
                                        <span class="text-2xl">🔥</span>
                                        <div>
                                            <p class="text-[10px] text-gray-400 uppercase font-bold tracking-wider">Longest Streak</p>
                                            <p class="text-lg font-black text-orange-400">${stats.maxStreak} days straight</p>
                                        </div>
                                    </div>
                                    <div class="wrapped-badge-box text-left flex items-center gap-3">
                                        <span class="text-2xl">📅</span>
                                        <div>
                                            <p class="text-[10px] text-gray-400 uppercase font-bold tracking-wider">Total Days Chatting</p>
                                            <p class="text-lg font-black text-indigo-300">${stats.totalDays} days · ${stats.msgsPerDay} msgs/day</p>
                                        </div>
                                    </div>
                                    <div class="wrapped-badge-box text-left flex items-center gap-3">
                                        <span class="text-2xl">💬</span>
                                        <div>
                                            <p class="text-[10px] text-gray-400 uppercase font-bold tracking-wider">Total Words Written</p>
                                            <p class="text-lg font-black text-purple-300">${stats.totalWords.toLocaleString()} words</p>
                                        </div>
                                    </div>
                                    <div class="wrapped-badge-box text-left flex items-center gap-3">
                                        <span class="text-2xl">😂</span>
                                        <div>
                                            <p class="text-[10px] text-gray-400 uppercase font-bold tracking-wider">LOL Moments</p>
                                            <p class="text-lg font-black text-yellow-300">${stats.laughCount.toLocaleString()} msgs with laughter</p>
                                        </div>
                                    </div>
                                    ${stats.mediaCount > 0 ? `
                                    <div class="wrapped-badge-box text-left flex items-center gap-3">
                                        <span class="text-2xl">📸</span>
                                        <div>
                                            <p class="text-[10px] text-gray-400 uppercase font-bold tracking-wider">Media Shared</p>
                                            <p class="text-lg font-black text-cyan-300">${stats.mediaCount.toLocaleString()} photos/videos/audio</p>
                                        </div>
                                    </div>` : ''}
                                </div>
                            </div>
                            <div class="wrapped-action-btns flex justify-center w-full mt-3 relative" style="z-index:200">
                                <button class="wrapped-slide-save-btn bg-white/10 hover:bg-white/20 border border-white/10 text-white font-extrabold text-[12px] rounded-xl py-2 px-3.5 flex items-center gap-1.5 transition active:scale-95 cursor-pointer" data-scene="3">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                                    Save Card
                                </button>
                            </div>
                            <div class="text-[10px] text-gray-500 text-center tracking-widest uppercase">TAP RIGHT →</div>
                        </div>
                    </div>

                    <!-- 5: Who Starts + Day Activity -->
                    <div class="wrapped-slide">
                        <div class="wrapped-slide-content">
                            <div class="wrapped-header-tag">WHO'S MORE EAGER?</div>
                            <div class="wrapped-main-body w-full">
                                <p class="text-xs text-gray-400 uppercase tracking-wider mb-3">Who texts first each day?</p>
                                <div class="flex justify-center gap-6 mb-6">
                                    <div class="text-center">
                                        <div class="text-3xl font-black ${stats.s1First >= stats.s2First ? 'text-indigo-400' : 'text-gray-400'}">${stats.s1First}</div>
                                        <p class="text-[10px] text-gray-400 mt-1 font-bold">${escH(stats.sender1Name)}</p>
                                        ${stats.s1First >= stats.s2First ? '<p class="text-[9px] text-indigo-400 font-bold mt-0.5">👑 STARTER</p>' : ''}
                                    </div>
                                    <div class="text-gray-600 text-2xl font-bold self-center">vs</div>
                                    <div class="text-center">
                                        <div class="text-3xl font-black ${stats.s2First > stats.s1First ? 'text-pink-400' : 'text-gray-400'}">${stats.s2First}</div>
                                        <p class="text-[10px] text-gray-400 mt-1 font-bold">${escH(stats.sender2Name)}</p>
                                        ${stats.s2First > stats.s1First ? '<p class="text-[9px] text-pink-400 font-bold mt-0.5">👑 STARTER</p>' : ''}
                                    </div>
                                </div>

                                <div class="wrapped-badge-box text-left w-full mb-3">
                                    <p class="text-[10px] text-gray-400 uppercase font-bold tracking-wider mb-2">Busiest Day of Week</p>
                                    <p class="text-lg font-black text-amber-400">${stats.busiestDay}s are your day! 📆</p>
                                </div>

                                ${stats.totalQuestions > 0 ? `
                                <div class="wrapped-badge-box text-left w-full mb-3">
                                    <p class="text-[10px] text-gray-400 uppercase font-bold tracking-wider mb-2">Questions Asked</p>
                                    <p class="text-sm font-bold text-gray-300">${stats.totalQuestions.toLocaleString()} total questions</p>
                                    <div class="flex gap-3 mt-2">
                                        <span class="text-xs text-indigo-300 font-bold">${escH(stats.sender1Name)}: ${stats.s1Questions}</span>
                                        <span class="text-xs text-pink-300 font-bold">${escH(stats.sender2Name)}: ${stats.s2Questions}</span>
                                    </div>
                                </div>` : ''}

                                ${stats.busiestDateCount > 0 ? `
                                <div class="wrapped-badge-box text-left w-full">
                                    <p class="text-[10px] text-gray-400 uppercase font-bold tracking-wider mb-1">Most Active Day Ever</p>
                                    <p class="text-sm font-black text-green-400">${stats.busiestDate} — ${stats.busiestDateCount} messages! 🎉</p>
                                </div>` : ''}
                            </div>
                            <div class="wrapped-action-btns flex justify-center w-full mt-3 relative" style="z-index:200">
                                <button class="wrapped-slide-save-btn bg-white/10 hover:bg-white/20 border border-white/10 text-white font-extrabold text-[12px] rounded-xl py-2 px-3.5 flex items-center gap-1.5 transition active:scale-95 cursor-pointer" data-scene="4">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                                    Save Card
                                </button>
                            </div>
                            <div class="text-[10px] text-gray-500 text-center tracking-widest uppercase">TAP RIGHT →</div>
                        </div>
                    </div>

                    <!-- 6: Emojis -->
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
                            <div class="wrapped-action-btns flex justify-center w-full mt-3 relative" style="z-index:200">
                                <button class="wrapped-slide-save-btn bg-white/10 hover:bg-white/20 border border-white/10 text-white font-extrabold text-[12px] rounded-xl py-2 px-3.5 flex items-center gap-1.5 transition active:scale-95 cursor-pointer" data-scene="5">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                                    Save Card
                                </button>
                            </div>
                            <div class="text-[10px] text-gray-500 text-center tracking-widest uppercase">TAP RIGHT →</div>
                        </div>
                    </div>

                    <!-- 7: Vibe -->
                    <div class="wrapped-slide">
                        <div class="wrapped-slide-content">
                            <div class="wrapped-header-tag">THE VIBE CHECK</div>
                            <div class="wrapped-main-body">
                                <p class="text-xs text-gray-400 uppercase tracking-wider mb-3">Your Relationship Vibe</p>
                                <div class="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-pink-400 to-indigo-400 mb-4">${stats.vibe}</div>
                                <div class="wrapped-badge-box mt-4">
                                    <p class="text-xs text-gray-300 leading-relaxed font-medium">${stats.vibeDesc}</p>
                                </div>
                                <div class="text-6xl mt-6" style="animation:pulse 2s infinite">${stats.topEmojis[0] || '💬'}</div>
                                <div class="mt-4 text-xs text-gray-500 font-bold">${stats.lateNightPct}% of chats happen after midnight 🌙</div>
                            </div>
                            <div class="wrapped-action-btns flex justify-center w-full mt-3 relative" style="z-index:200">
                                <button class="wrapped-slide-save-btn bg-white/10 hover:bg-white/20 border border-white/10 text-white font-extrabold text-[12px] rounded-xl py-2 px-3.5 flex items-center gap-1.5 transition active:scale-95 cursor-pointer" data-scene="6">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                                    Save Card
                                </button>
                            </div>
                            <div class="text-[10px] text-gray-500 text-center tracking-widest uppercase">TAP RIGHT FOR SHARE CARD →</div>
                        </div>
                    </div>

                    <!-- 8: Share / Export -->
                    <div class="wrapped-slide">
                        <div class="wrapped-slide-content">
                            <div class="wrapped-header-tag">SHARE YOUR STORY</div>
                            <div class="wrapped-main-body w-full">
                                <div class="bg-gradient-to-br from-indigo-950/40 to-purple-950/40 border border-indigo-500/20 backdrop-blur-md rounded-3xl p-5 w-full text-left shadow-2xl relative overflow-hidden">
                                    <div class="absolute -top-10 -right-10 w-24 h-24 bg-pink-500/10 rounded-full filter blur-xl"></div>
                                    <div class="absolute -bottom-10 -left-10 w-24 h-24 bg-indigo-500/10 rounded-full filter blur-xl"></div>
                                    <div class="flex justify-between items-center mb-3">
                                        <span class="text-[9px] font-black text-indigo-400 tracking-wider uppercase">Kotha Wrapped</span>
                                        <span class="text-[9px] text-gray-500 font-bold">onlinekotha.com</span>
                                    </div>
                                    <h3 class="text-base font-black text-white leading-tight mb-3">Chat with ${escH(stats.otherName)}</h3>
                                    <div class="space-y-2.5">
                                        <div class="grid grid-cols-2 gap-2">
                                            <div>
                                                <p class="text-[8px] text-gray-400 uppercase font-extrabold tracking-wider">Messages</p>
                                                <p class="text-lg font-black text-white">${stats.totalMessages.toLocaleString()}</p>
                                            </div>
                                            <div>
                                                <p class="text-[8px] text-gray-400 uppercase font-extrabold tracking-wider">Days Active</p>
                                                <p class="text-lg font-black text-indigo-300">${stats.totalDays}</p>
                                            </div>
                                        </div>
                                        <div class="grid grid-cols-3 gap-2">
                                            <div>
                                                <p class="text-[8px] text-gray-400 uppercase font-extrabold tracking-wider">Streak</p>
                                                <p class="text-xs font-black text-orange-400">🔥 ${stats.maxStreak}d</p>
                                            </div>
                                            <div>
                                                <p class="text-[8px] text-gray-400 uppercase font-extrabold tracking-wider">Peak</p>
                                                <p class="text-xs font-extrabold text-amber-300">${stats.peakLabel}</p>
                                            </div>
                                            <div>
                                                <p class="text-[8px] text-gray-400 uppercase font-extrabold tracking-wider">Vibe</p>
                                                <p class="text-xs font-extrabold text-purple-300">${stats.vibe}</p>
                                            </div>
                                        </div>
                                        <div class="grid grid-cols-2 gap-2">
                                            <div>
                                                <p class="text-[8px] text-gray-400 uppercase font-extrabold tracking-wider">LOL Moments</p>
                                                <p class="text-xs font-black text-yellow-300">😂 ${stats.laughCount.toLocaleString()}</p>
                                            </div>
                                            <div>
                                                <p class="text-[8px] text-gray-400 uppercase font-extrabold tracking-wider">Words Written</p>
                                                <p class="text-xs font-black text-green-300">${stats.totalWords.toLocaleString()}</p>
                                            </div>
                                        </div>
                                        <div>
                                            <p class="text-[8px] text-gray-400 uppercase font-extrabold tracking-wider mb-1">Top Emojis</p>
                                            <p class="text-lg font-bold flex gap-1.5">${stats.topEmojis.slice(0, 5).join(' ') || '💬'}</p>
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
        const navLeft = overlay.querySelector('#wrapped-nav-left');
        const navRight = overlay.querySelector('#wrapped-nav-right');

        // Helper: toggle nav tap pointer-events based on current slide
        function updateNavTapsForSlide(index) {
            const isLastSlide = index === slideEls.length - 1;
            // On last slide, completely disable nav taps so buttons underneath get clicks
            navRight.style.pointerEvents = isLastSlide ? 'none' : 'auto';
            // Keep left nav active so user can go back
            navLeft.style.pointerEvents = 'auto';
        }

        // Patch showSlide to also update nav taps
        const origShowSlide = WrappedStory.prototype.showSlide;
        activeStory = new WrappedStory(slideEls, () => {});
        const storyRef = activeStory;
        const origShow = storyRef.showSlide.bind(storyRef);
        storyRef.showSlide = function(index) {
            origShow(index);
            updateNavTapsForSlide(index);
        };
        storyRef.start();

        // Pause / resume on hold (but not on buttons or close)
        const cont = overlay.querySelector('.wrapped-container');
        cont.addEventListener('pointerdown', (e) => {
            if (e.target.closest('.wrapped-action-btns') || e.target.closest('#wrapped-close-btn')) return;
            if (storyRef) storyRef.pause();
        });
        const doResume = () => { if (storyRef) storyRef.resume(); };
        cont.addEventListener('pointerup', doResume);
        cont.addEventListener('pointerleave', doResume);

        // Nav taps
        navLeft.addEventListener('click', (e) => {
            e.stopPropagation();
            storyRef.prev();
        });
        navRight.addEventListener('click', (e) => {
            e.stopPropagation();
            storyRef.next();
        });

        // Close
        const close = () => {
            if (storyRef) { storyRef.destroy(); }
            activeStory = null;
            overlay.remove();
            document.removeEventListener('keydown', escH2);
        };
        overlay.querySelector('#wrapped-close-btn').addEventListener('click', close);
        const escH2 = (e) => { if (e.key === 'Escape') close(); };
        document.addEventListener('keydown', escH2);

        // Download & Copy — direct listeners with mobile touch support
        const dlBtn = overlay.querySelector('#wrapped-download-btn');
        const cpBtn = overlay.querySelector('#wrapped-copy-btn');

        function handleDownload(e) {
            e.stopPropagation();
            e.preventDefault();
            dlBtn.style.opacity = '0.6';
            showToast('Generating card...');
            exportWrappedCanvas(stats, 'download');
            setTimeout(() => { dlBtn.style.opacity = '1'; }, 300);
        }
        function handleCopy(e) {
            e.stopPropagation();
            e.preventDefault();
            cpBtn.style.opacity = '0.6';
            showToast('Copying...');
            exportWrappedCanvas(stats, 'copy');
            setTimeout(() => { cpBtn.style.opacity = '1'; }, 300);
        }

        // Both click and touchend for maximum mobile compatibility
        dlBtn.addEventListener('click', handleDownload);
        dlBtn.addEventListener('touchend', (e) => {
            e.stopPropagation();
            e.preventDefault();
            handleDownload(e);
        }, { passive: false });

        cpBtn.addEventListener('click', handleCopy);
        cpBtn.addEventListener('touchend', (e) => {
            e.stopPropagation();
            e.preventDefault();
            handleCopy(e);
        }, { passive: false });

        // Individual story cards save buttons
        const saveBtns = overlay.querySelectorAll('.wrapped-slide-save-btn');
        saveBtns.forEach(btn => {
            const idx = parseInt(btn.getAttribute('data-scene'), 10);
            function handleSave(e) {
                e.stopPropagation();
                e.preventDefault();
                storyRef.pause(); // Pause slideshow while downloading
                
                const originalText = btn.innerHTML;
                btn.style.opacity = '0.6';
                btn.textContent = '⏳ Saving...';
                
                showToast(`Saving story card ${idx + 1}...`);
                
                // Synchronously trigger generation/download inside user gesture tick
                exportSingleStoryCard(stats, idx);
                
                setTimeout(() => {
                    btn.style.opacity = '1';
                    btn.innerHTML = originalText;
                    storyRef.resume(); // Resume slideshow
                }, 100);
            }
            btn.addEventListener('click', handleSave);
            btn.addEventListener('touchend', (e) => {
                e.stopPropagation();
                e.preventDefault();
                handleSave(e);
            }, { passive: false });
        });
    }

    function exportStatsCanvas(stats, action) {
        try {
            const C = document.createElement('canvas');
            const W = 1080, H = 1920;
            C.width = W; C.height = H;
            const ctx = C.getContext('2d');
            if (!ctx) { showToast('Canvas not supported'); return; }

            // ── Background ──
            const bg = ctx.createLinearGradient(0, 0, W, H);
            bg.addColorStop(0, '#0f0720');
            bg.addColorStop(0.35, '#1a0d3a');
            bg.addColorStop(0.65, '#120a2e');
            bg.addColorStop(1, '#080510');
            ctx.fillStyle = bg;
            ctx.fillRect(0, 0, W, H);

            // Glow orbs
            const orbs = [
                [180, 240, '#6366f1', 420, 0.25],
                [900, 400, '#a855f7', 350, 0.18],
                [540, 960, '#ec4899', 500, 0.12],
                [200, 1500, '#f59e0b', 380, 0.15],
                [850, 1650, '#6366f1', 300, 0.2],
            ];
            orbs.forEach(([x, y, hex, r, alpha]) => {
                const hr = parseInt(hex.slice(1, 3), 16), hg = parseInt(hex.slice(3, 5), 16), hb = parseInt(hex.slice(5, 7), 16);
                const g = ctx.createRadialGradient(x, y, 0, x, y, r);
                g.addColorStop(0, `rgba(${hr},${hg},${hb},${alpha})`);
                g.addColorStop(0.6, `rgba(${hr},${hg},${hb},${alpha * 0.3})`);
                g.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = g;
                ctx.fillRect(0, 0, W, H);
            });

            // Noise texture
            for (let i = 0; i < 3000; i++) {
                const nx = Math.random() * W, ny = Math.random() * H;
                ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.015})`;
                ctx.fillRect(nx, ny, 1, 1);
            }

            ctx.textBaseline = 'top';

            // ── Top branding bar ──
            ctx.textAlign = 'left';
            ctx.font = '800 28px -apple-system, "Segoe UI", sans-serif';
            ctx.fillStyle = '#818cf8';
            ctx.fillText('✦ KOTHA STATS', 80, 100);
            ctx.textAlign = 'right';
            ctx.font = '800 24px -apple-system, sans-serif';
            ctx.fillStyle = 'rgba(255,255,255,0.7)';
            ctx.fillText('onlinekotha.com', W - 80, 104);

            // Thin accent line
            const lineGrad = ctx.createLinearGradient(80, 0, W - 80, 0);
            lineGrad.addColorStop(0, '#6366f1');
            lineGrad.addColorStop(0.5, '#ec4899');
            lineGrad.addColorStop(1, '#f59e0b');
            ctx.fillStyle = lineGrad;
            ctx.fillRect(80, 148, W - 160, 3);

            // ── Title section ──
            ctx.textAlign = 'left';
            ctx.font = '900 72px -apple-system, "Segoe UI", sans-serif';
            ctx.fillStyle = '#fff';
            ctx.fillText('Chat Analytics', 80, 200);

            let nameFont = 80;
            ctx.font = `900 ${nameFont}px -apple-system, "Segoe UI", sans-serif`;
            const nameVal = `with ${stats.contactName}`;
            while (ctx.measureText(nameVal).width > W - 180 && nameFont > 40) {
                nameFont -= 2;
                ctx.font = `900 ${nameFont}px -apple-system, sans-serif`;
            }
            const nameGrad = ctx.createLinearGradient(80, 290, 600, 290);
            nameGrad.addColorStop(0, '#a5b4fc');
            nameGrad.addColorStop(0.5, '#c084fc');
            nameGrad.addColorStop(1, '#f472b6');
            ctx.fillStyle = nameGrad;
            ctx.fillText(nameVal, 80, 290);

            // ── Big Total Messages Box ──
            const cardY = 410;
            ctx.beginPath();
            roundedRect(ctx, 80, cardY, W - 160, 240, 32);
            ctx.fillStyle = 'rgba(255,255,255,0.04)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.08)';
            ctx.lineWidth = 2;
            ctx.stroke();

            ctx.font = '800 22px -apple-system, sans-serif';
            ctx.fillStyle = 'rgba(255,255,255,0.4)';
            ctx.letterSpacing = '3px';
            ctx.fillText('TOTAL MESSAGES EXCHANGED', 120, cardY + 40);

            ctx.font = '900 110px -apple-system, sans-serif';
            const numGrad = ctx.createLinearGradient(120, cardY + 70, 120, cardY + 200);
            numGrad.addColorStop(0, '#ffffff');
            numGrad.addColorStop(1, '#a5b4fc');
            ctx.fillStyle = numGrad;
            ctx.fillText(stats.totalMsgs.toLocaleString(), 120, cardY + 80);

            // ── Grid row: Media & Links ──
            const gridY = cardY + 280;
            const gridItemW = (W - 200) / 2;

            // Media
            ctx.beginPath(); roundedRect(ctx, 80, gridY, gridItemW, 180, 24);
            ctx.fillStyle = 'rgba(255,255,255,0.03)'; ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.stroke();
            ctx.font = '800 18px -apple-system, sans-serif';
            ctx.fillStyle = 'rgba(255,255,255,0.35)';
            ctx.fillText('MEDIA SHARED', 110, gridY + 30);
            ctx.font = '900 48px -apple-system, sans-serif';
            ctx.fillStyle = '#c084fc';
            ctx.fillText(stats.totalMedia.toLocaleString(), 110, gridY + 75);

            // Links
            ctx.beginPath(); roundedRect(ctx, 80 + gridItemW + 40, gridY, gridItemW, 180, 24);
            ctx.fillStyle = 'rgba(255,255,255,0.03)'; ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.stroke();
            ctx.font = '800 18px -apple-system, sans-serif';
            ctx.fillStyle = 'rgba(255,255,255,0.35)';
            ctx.fillText('LINKS SHARED', 80 + gridItemW + 70, gridY + 30);
            ctx.font = '900 48px -apple-system, sans-serif';
            ctx.fillStyle = '#34d399';
            ctx.fillText(stats.totalLinks.toLocaleString(), 80 + gridItemW + 70, gridY + 75);

            // ── First Message row ──
            const fRowY = gridY + 220;
            ctx.beginPath(); roundedRect(ctx, 80, fRowY, W - 160, 110, 20);
            ctx.fillStyle = 'rgba(255,255,255,0.03)'; ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.stroke();
            ctx.font = '800 18px -apple-system, sans-serif';
            ctx.fillStyle = 'rgba(255,255,255,0.35)';
            ctx.fillText('FIRST MESSAGE SENT', 110, fRowY + 25);
            ctx.font = 'bold 32px -apple-system, sans-serif';
            ctx.fillStyle = '#f59e0b';
            ctx.fillText(stats.firstDate, 110, fRowY + 55);

            // ── Contributors section ──
            const contY = fRowY + 160;
            ctx.font = '800 22px -apple-system, sans-serif';
            ctx.fillStyle = 'rgba(255,255,255,0.4)';
            ctx.fillText('TOP CONTRIBUTORS', 80, contY);

            let currentItemY = contY + 45;
            stats.contributors.forEach((c, idx) => {
                const [sName, count, pct] = c;
                ctx.font = 'bold 28px -apple-system, sans-serif';
                const color = idx === 0 ? '#818cf8' : idx === 1 ? '#f472b6' : '#34d399';
                ctx.fillStyle = color;
                ctx.fillText(sName, 80, currentItemY);
                ctx.textAlign = 'right';
                ctx.fillText(`${count.toLocaleString()} (${pct}%)`, W - 80, currentItemY);
                ctx.textAlign = 'left';

                // Bar
                ctx.beginPath(); roundedRect(ctx, 80, currentItemY + 42, W - 160, 14, 7);
                ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fill();
                const fillW = Math.max(4, (W - 160) * pct / 100);
                ctx.beginPath(); roundedRect(ctx, 80, currentItemY + 42, fillW, 14, 7);
                ctx.fillStyle = color; ctx.fill();

                currentItemY += 85;
            });

            // ── Footer ──
            ctx.fillStyle = lineGrad;
            ctx.fillRect(80, H - 220, W - 160, 2);

            ctx.textAlign = 'center';
            ctx.font = '800 28px -apple-system, sans-serif';
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.fillText('Generate your own stats at', W / 2, H - 180);

            // Beautiful Pill Badge for onlinekotha.com
            ctx.beginPath();
            roundedRect(ctx, W/2 - 220, H - 135, 440, 70, 35);
            const badgeGrad = ctx.createLinearGradient(W/2 - 220, 0, W/2 + 220, 0);
            badgeGrad.addColorStop(0, '#6366f1');
            badgeGrad.addColorStop(0.5, '#c084fc');
            badgeGrad.addColorStop(1, '#f472b6');
            ctx.fillStyle = badgeGrad;
            ctx.fill();
            
            // Shadow / glow for badge
            ctx.shadowColor = 'rgba(192, 132, 252, 0.4)';
            ctx.shadowBlur = 20;
            ctx.fill();
            ctx.shadowBlur = 0; // reset
            
            ctx.font = '900 32px -apple-system, sans-serif';
            ctx.fillStyle = '#ffffff';
            ctx.fillText('onlinekotha.com', W/2, H - 117);

            // ── Export ──
            const fname = `${stats.contactName.toLowerCase().replace(/[^a-z0-9]/g, '_')}_kotha_stats.png`;
            if (action === 'copy') {
                if (navigator.clipboard && window.ClipboardItem) {
                    try {
                        const copyPromise = new Promise((resolve, reject) => {
                            C.toBlob((blob) => {
                                if (blob) resolve(blob);
                                else reject(new Error('Canvas to blob failed'));
                            }, 'image/png', 1.0);
                        });
                        navigator.clipboard.write([
                            new ClipboardItem({ 'image/png': copyPromise })
                        ]).then(() => {
                            showToast('✅ Copied to clipboard!');
                        }).catch((err) => {
                            console.error('Clipboard write error, falling back to download:', err);
                            C.toBlob((blob) => {
                                if (blob) fallbackDownload(blob, fname);
                            }, 'image/png', 1.0);
                        });
                    } catch (e) {
                        console.error('ClipboardItem promise error, falling back:', e);
                        C.toBlob((blob) => {
                            if (blob) fallbackDownload(blob, fname);
                        }, 'image/png', 1.0);
                    }
                } else {
                    C.toBlob((blob) => {
                        if (blob) fallbackDownload(blob, fname);
                    }, 'image/png', 1.0);
                }
            } else {
                syncDownload(C, fname);
            }

        } catch (err) {
            console.error('Stats export error:', err);
            showToast('Export failed — ' + (err.message || 'unknown error'));
        }
    }

    window.kothaExportStatsCard = exportStatsCanvas;

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
