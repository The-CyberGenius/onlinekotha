// StoryEngine for OnlineKotha
// Auto-generated premium social story experience

(function() {
    const esc = (s) => String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    // --- Dynamic CSS Injection ---
    const style = document.createElement('style');
    style.innerHTML = `
        .ok-story-overlay {
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            background: #000; z-index: 2147483647;
            display: flex; align-items: center; justify-content: center;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            overflow: hidden;
            opacity: 0;
            transition: opacity 0.4s ease;
        }
        .ok-story-viewport {
            position: relative;
            background: #111;
            overflow: hidden;
            border-radius: 16px;
            box-shadow: 0 0 80px rgba(0,0,0,0.6);
            transform-origin: center center;
        }
        @media (max-width: 600px) {
            .ok-story-viewport { border-radius: 0;  }
        }
        .ok-story-canvas {
            position: absolute; top: 0; left: 0; width: 1080px; height: 1920px;
            transform-origin: top left;
            background: #0a0a0c;
            color: #fff;
            overflow: hidden;
        }
        /* Progress Bar */
        .ok-story-progress-bar {
            position: absolute; top: 40px; left: 40px; right: 40px;
            display: flex; gap: 12px; z-index: 100;
        }
        .ok-story-progress-segment {
            flex: 1; height: 6px; background: rgba(255,255,255,0.2);
            border-radius: 6px; overflow: hidden;
        }
        .ok-story-progress-fill {
            height: 100%; background: #fff; width: 0%;
            border-radius: 6px;
        }
        
        /* Top Navigation Area */
        .ok-story-header {
            position: absolute; top: 70px; left: 40px; right: 40px;
            display: flex; justify-content: space-between; align-items: center;
            z-index: 100;
        }
        .ok-story-brand {
            font-size: 28px; font-weight: 900; letter-spacing: 1px;
            background: linear-gradient(90deg, #fff, #a78bfa);
            -webkit-background-clip: text; -webkit-text-fill-color: transparent;
            display: flex; align-items: center; gap: 12px;
        }
        .ok-story-close {
            width: 60px; height: 60px; display: flex; align-items: center; justify-content: center;
            border-radius: 50%; background: rgba(255,255,255,0.1); cursor: pointer;
            color: #fff; backdrop-filter: blur(10px);
        }
        
        /* Footer / Watermark */
        .ok-story-footer {
            position: absolute; bottom: 60px; left: 0; right: 0;
            text-align: center; font-size: 24px; font-weight: 600; color: rgba(255,255,255,0.4);
            letter-spacing: 4px; z-index: 50; text-transform: uppercase;
        }

        /* Safe Area for Content */
        .ok-story-content { position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 10; }
        .ok-story-safe {
            position: absolute; top: 160px; left: 100px; right: 100px; bottom: 180px;
            display: flex; flex-direction: column; justify-content: center;
            z-index: 50;
        }

        /* Nav Zones */
        .ok-story-nav-left { position: absolute; top: 120px; left: 0; width: 30%; height: calc(100% - 300px); z-index: 200; cursor: pointer; }
        .ok-story-nav-right { position: absolute; top: 120px; right: 0; width: 70%; height: calc(100% - 300px); z-index: 200; cursor: pointer; }

        /* Share Actions */
        .ok-story-actions {
            position: absolute; bottom: 40px; left: 0; right: 0;
            display: flex; justify-content: center; gap: 16px; z-index: 300;
        }
        .ok-story-btn {
            background: rgba(255,255,255,0.15); border: 2px solid rgba(255,255,255,0.3);
            color: #fff; padding: 12px 24px; border-radius: 40px; font-size: 15px; font-weight: 600;
            backdrop-filter: blur(20px); cursor: pointer; transition: all 0.2s;
            display: flex; align-items: center; gap: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.3);
        }
        .ok-story-btn:hover { background: rgba(255,255,255,0.25); transform: scale(1.05); }
        .ok-story-btn-primary {
            background: #a78bfa; border: none; color: #111;
        }
        .ok-story-btn-primary:hover { background: #bba6ff; }

        /* Typography & Layouts */
        .eyebrow { font-size: 32px; font-weight: 800; color: rgba(255,255,255,0.6); text-transform: uppercase; letter-spacing: 4px; margin-bottom: 40px; }
        .huge-title { font-size: 140px; font-weight: 900; line-height: 1.05; letter-spacing: -3px; margin-bottom: 40px; text-transform: uppercase; }
        .subtitle { font-size: 48px; font-weight: 600; color: rgba(255,255,255,0.8); line-height: 1.3; }
        
        .stat-block { display: flex; flex-direction: column; margin-top: 60px; }
        .stat-number { font-size: 180px; font-weight: 900; letter-spacing: -5px; line-height: 1; background: linear-gradient(135deg, #fff, #a78bfa); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        .stat-label { font-size: 40px; font-weight: 700; color: rgba(255,255,255,0.5); text-transform: uppercase; letter-spacing: 2px; }
        
        .bottom-quote { position: absolute; bottom: 0; left: 0; font-size: 36px; font-weight: 500; font-style: italic; color: rgba(255,255,255,0.6); }

        /* Animations */
        .anim-fade-up { animation: fadeUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) both; }
        .anim-delay-1 { animation-delay: 0.3s; }
        .anim-delay-2 { animation-delay: 0.6s; }
        .anim-delay-3 { animation-delay: 0.9s; }
        
        @keyframes fadeUp { 0% { opacity: 0; transform: translateY(40px); } 100% { opacity: 1; transform: translateY(0); } }
        @keyframes float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-20px); } }
        @keyframes pulse-glow { 0%, 100% { opacity: 0.5; transform: scale(1); } 50% { opacity: 0.8; transform: scale(1.1); } }
        
        /* Backgrounds */
        .bg-gradient { position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 1; }
        .bg-noise { position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 2; opacity: 0.05; background-image: url('data:image/svg+xml;utf8,%3Csvg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg"%3E%3Cfilter id="noiseFilter"%3E%3CfeTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch"/%3E%3C/filter%3E%3Crect width="100%25" height="100%25" filter="url(%23noiseFilter)"/%3E%3C/svg%3E'); }
        
        .bg-orb { position: absolute; border-radius: 50%; filter: blur(150px); animation: pulse-glow 8s infinite alternate; z-index: 1; }
    `;
    document.head.appendChild(style);

    class StoryEngine {
        static launch(stats, msgs, chatFolder, compatPromise) {
            const viewer = new StoryViewer(stats, msgs, chatFolder, compatPromise);
            viewer.init();
        }
    }

    class StoryViewer {
        constructor(stats, msgs, chatFolder, compatPromise) {
            this.stats = stats;
            this.msgs = msgs;
            this.chatFolder = chatFolder;
            this.compatPromise = compatPromise;
            
            this.currentIndex = 0;
            this.cards = [];
            this.timer = null;
            this.duration = 6000; // 6 seconds per slide
            this.isPaused = false;
            this.startTime = 0;
            this.remaining = this.duration;
            
            this.dom = {};
            this.buildCards();
        }

        buildCards() {
            const s = this.stats;
            const m = this.msgs;
            
            // Generate cards based on available data
            this.cards.push(this.cardCover(s));
            if (s.s1First > 0 || s.s2First > 0) this.cards.push(this.cardFirstText(s));
            if (s.busiestDate) this.cards.push(this.cardBusiestDay(s));
            if (s.busiestDay) this.cards.push(this.cardBusiestWeekday(s));
            if (s.laughCount > 0) this.cards.push(this.cardLaughs(s));
            if (s.mediaCount > 10) this.cards.push(this.cardMedia(s));
            if (s.longestMsgLen > 20) this.cards.push(this.cardLongestMsg(s));
            if (s.totalQuestions > 10) this.cards.push(this.cardQuestions(s));
            
            // Emoji card
            const emojis = this.getTopEmojis(m).filter(e => e && e.emoji);
            if (emojis.length > 0) this.cards.push(this.cardEmojis(emojis));
            
            // Late night
            const night = this.getNightStats(m);
            if (night.count > 50) this.cards.push(this.cardLateNight(night));
            
            this.cards.push(this.cardTotal(s));
        }

        // --- Card Templates ---
        cardCover(s) {
            return {
                bg: '<div class="bg-gradient" style="background: linear-gradient(to bottom, #0f0c29, #302b63, #24243e);"></div><div class="bg-orb" style="top: -10%; right: -10%; width: 800px; height: 800px; background: rgba(167, 139, 250, 0.4);"></div>',
                html: `
                    <div class="eyebrow anim-fade-up">Your Year in Conversation</div>
                    <div class="huge-title anim-fade-up anim-delay-1" style="font-size: 110px;">${esc(s.sender1Name)}<br><span style="color:#a78bfa">×</span><br>${esc(s.sender2Name)}</div>
                    <div class="stat-block anim-fade-up anim-delay-2">
                        <div class="stat-number">${s.totalMessages.toLocaleString()}</div>
                        <div class="stat-label">Messages. One long story.</div>
                    </div>
                `
            };
        }

        cardFirstText(s) {
            const eager = s.s1First >= s.s2First ? s.sender1Name : s.sender2Name;
            const eagerCount = Math.max(s.s1First, s.s2First);
            const patient = s.s1First >= s.s2First ? s.sender2Name : s.sender1Name;
            const patientCount = Math.min(s.s1First, s.s2First);
            
            return {
                bg: '<div class="bg-gradient" style="background: linear-gradient(to bottom, #140004, #400018);"></div><div class="bg-orb" style="bottom: 0; left: -10%; width: 800px; height: 800px; background: rgba(255, 60, 100, 0.3);"></div>',
                html: `
                    <div class="eyebrow anim-fade-up">Who couldn't wait?</div>
                    
                    <div style="display:flex; justify-content: space-between; align-items:flex-end; margin-top: 100px;" class="anim-fade-up anim-delay-1">
                        <div style="flex:1;">
                            <div style="font-size: 60px; margin-bottom: 20px;">👑</div>
                            <div style="font-size: 60px; font-weight: 800; color: #ff4d6d; text-transform: uppercase;">${esc(eager)}</div>
                            <div style="font-size: 160px; font-weight: 900; line-height: 1;">${eagerCount}</div>
                            <div style="font-size: 30px; font-weight: 600; color: rgba(255,255,255,0.6);">days texted first</div>
                        </div>
                        <div style="width: 2px; height: 400px; background: rgba(255,255,255,0.1); margin: 0 40px;"></div>
                        <div style="flex:1; text-align: right; opacity: 0.7;">
                            <div style="font-size: 40px; font-weight: 800; color: #fff; text-transform: uppercase;">${esc(patient)}</div>
                            <div style="font-size: 100px; font-weight: 900; line-height: 1;">${patientCount}</div>
                            <div style="font-size: 30px; font-weight: 600; color: rgba(255,255,255,0.6);">days</div>
                        </div>
                    </div>

                    <div class="bottom-quote anim-fade-up anim-delay-2">"Yeah... we noticed who was more eager. 👀"</div>
                `
            };
        }

        cardBusiestDay(s) {
            return {
                bg: '<div class="bg-gradient" style="background: linear-gradient(to bottom, #001219, #005f73);"></div><div class="bg-orb" style="top: 20%; left: 20%; width: 1000px; height: 1000px; background: rgba(10, 147, 150, 0.4);"></div>',
                html: `
                    <div class="eyebrow anim-fade-up">That one day</div>
                    <div class="huge-title anim-fade-up anim-delay-1" style="font-size: 120px;">When you two just wouldn't stop talking.</div>
                    
                    <div class="stat-block anim-fade-up anim-delay-2">
                        <div class="stat-label" style="color: #94d2bd; font-size: 50px;">${esc(s.busiestDate)}</div>
                        <div class="stat-number" style="color: #ffffff;">${s.busiestDateCount.toLocaleString()}</div>
                        <div class="stat-label">Messages in 24 hours 🔥</div>
                    </div>
                `
            };
        }

        
        
        cardBusiestWeekday(s) {
            return {
                bg: '<div class="bg-gradient" style="background: linear-gradient(135deg, #43e97b, #38f9d7);"></div><div style="position:absolute; font-size: 300px; font-weight: 900; opacity: 0.05; top: 10%; left: -10%; line-height: 0.8; word-wrap: break-word; width: 150%; text-transform: uppercase; z-index:0;">' + (s.busiestDay + ' ').repeat(20) + '</div>',
                html: `
                    <div class="eyebrow anim-fade-up">Activity Patterns</div>
                    <div class="huge-title anim-fade-up anim-delay-1" style="font-size: 140px; color: #fff;">${s.busiestDay}</div>
                    <div class="subtitle anim-fade-up anim-delay-2" style="font-size: 70px; font-weight: 800; color: rgba(0,0,0,0.5);">was your day.</div>
                    
                    <div class="stat-block anim-fade-up anim-delay-3" style="margin-top: 150px;">
                        <div class="stat-label" style="color: #000;">You sent more messages on ${s.busiestDay}s than any other day of the week.</div>
                    </div>
                `
            };
        }

        
        cardMedia(s) {
            return {
                bg: '<div class="bg-gradient" style="background: linear-gradient(135deg, #1d4ed8, #3b82f6);"></div><div class="bg-orb" style="bottom: -20%; left: -20%; width: 1000px; height: 1000px; background: rgba(96, 165, 250, 0.4);"></div>',
                html: `
                    <div class="eyebrow anim-fade-up">A gallery of memories</div>
                    <div class="huge-title anim-fade-up anim-delay-1" style="font-size: 130px;">You shared <br><span style="color: #93c5fd;">${s.mediaCount.toLocaleString()}</span><br>photos & videos.</div>
                    
                    <div class="stat-block anim-fade-up anim-delay-2" style="margin-top: 100px;">
                        <div class="stat-label" style="color: rgba(255,255,255,0.7); font-size: 36px; line-height: 1.4;">
                            That's a lot of screenshots,<br>memes, and double chins.<br>Keep them safe.
                        </div>
                    </div>
                `
            };
        }

        cardLongestMsg(s) {
            return {
                bg: '<div class="bg-gradient" style="background: linear-gradient(to bottom, #064e3b, #065f46);"></div><div style="position:absolute; font-size: 100px; font-weight: 900; opacity: 0.05; top: 10%; left: -10%; line-height: 0.9; word-wrap: break-word; width: 150%; z-index:0;">' + (s.longestMsgPreview + ' ').repeat(10) + '</div>',
                html: `
                    <div class="eyebrow anim-fade-up">The Novelist</div>
                    <div class="huge-title anim-fade-up anim-delay-1" style="font-size: 110px;">Someone wrote a whole essay.</div>
                    
                    <div class="stat-block anim-fade-up anim-delay-2" style="margin-top: 80px; background: rgba(0,0,0,0.4); padding: 40px; border-radius: 20px; border-left: 8px solid #34d399;">
                        <div style="font-size: 32px; font-style: italic; color: #a7f3d0; line-height: 1.4;">"${s.longestMsgPreview}"</div>
                    </div>
                    
                    <div class="stat-block anim-fade-up anim-delay-3" style="margin-top: 60px;">
                        <div class="stat-number" style="font-size: 100px; color: #34d399;">${s.longestMsgLen}</div>
                        <div class="stat-label">Words in a single message</div>
                    </div>
                `
            };
        }

        cardQuestions(s) {
            const curious = s.s1Questions > s.s2Questions ? s.sender1Name : s.sender2Name;
            return {
                bg: '<div class="bg-gradient" style="background: linear-gradient(135deg, #701a75, #9d174d);"></div><div style="position:absolute; font-size: 400px; font-weight: 900; opacity: 0.1; top: 20%; right: 10%; z-index:0;">?</div>',
                html: `
                    <div class="eyebrow anim-fade-up">The Inquisitor</div>
                    <div class="huge-title anim-fade-up anim-delay-1" style="font-size: 140px;">Who asked more questions?</div>
                    
                    <div style="display:flex; justify-content: space-between; align-items:flex-end; margin-top: 80px;" class="anim-fade-up anim-delay-2">
                        <div style="flex:1;">
                            <div style="font-size: 40px; font-weight: 800; color: #fbcfe8; margin-bottom: 20px;">${esc(s.sender1Name)}</div>
                            <div style="font-size: 100px; font-weight: 900; line-height: 1;">${s.s1Questions}</div>
                            <div style="font-size: 30px; font-weight: 600; color: rgba(255,255,255,0.6);">questions</div>
                        </div>
                        <div style="flex:1; text-align:right;">
                            <div style="font-size: 40px; font-weight: 800; color: #fbcfe8; margin-bottom: 20px;">${esc(s.sender2Name)}</div>
                            <div style="font-size: 100px; font-weight: 900; line-height: 1;">${s.s2Questions}</div>
                            <div style="font-size: 30px; font-weight: 600; color: rgba(255,255,255,0.6);">questions</div>
                        </div>
                    </div>
                    
                    <div class="bottom-quote anim-fade-up anim-delay-3" style="color: #f9a8d4;">Clearly, ${esc(curious)} is the curious one.</div>
                `
            };
        }

        cardLaughs(s) {
            return {
                bg: '<div class="bg-gradient" style="background: linear-gradient(135deg, #ff7e5f, #feb47b);"></div><div style="position:absolute; font-size: 300px; font-weight: 900; opacity: 0.05; top: 10%; left: -10%; line-height: 0.8; word-wrap: break-word; width: 150%; text-transform: uppercase; z-index:0;">HAHA '.repeat(20) + '</div>',
                html: `
                    <div class="eyebrow anim-fade-up">Vibe check</div>
                    <div class="subtitle anim-fade-up anim-delay-1" style="font-size: 60px;">You laughed</div>
                    <div class="stat-number anim-fade-up anim-delay-1" style="font-size: 200px; line-height: 1.1; color: #ffffff; word-break: break-all;">A LOT</div>
                    
                    <div class="stat-block anim-fade-up anim-delay-2" style="margin-top: 40px;">
                        <div class="stat-number" style="font-size: 140px;">${s.laughCount.toLocaleString()}</div>
                        <div class="stat-label" style="color: rgba(0,0,0,0.5);">Messages with HAHA, LOL, 😂</div>
                    </div>
                `
            };
        }

        cardEmojis(emojis) {
            let floaters = '';
            emojis.forEach((e, i) => {
                const size = 120 - (i * 15);
                const left = 10 + Math.random() * 70;
                const top = 20 + Math.random() * 60;
                const delay = Math.random() * 2;
                floaters += `<div style="position:absolute; left:${left}%; top:${top}%; font-size:${size}px; animation: float 4s ease-in-out ${delay}s infinite; z-index:0;">${e.emoji}</div>`;
            });

            return {
                bg: '<div class="bg-gradient" style="background: linear-gradient(to bottom, #232526, #414345);"></div>' + floaters,
                html: `
                    <div style="position:relative; z-index:10; background: rgba(0,0,0,0.4); padding: 60px; border-radius: 40px; backdrop-filter: blur(20px); border: 2px solid rgba(255,255,255,0.1);" class="anim-fade-up">
                        <div class="eyebrow" style="margin-bottom: 20px;">Emotional Support</div>
                        <div class="huge-title" style="font-size: 90px; margin-bottom: 60px;">Your chat's personality in emojis:</div>
                        
                        <div style="display:flex; flex-direction:column; gap: 30px;">
                            ${emojis.slice(0, 4).map(e => `
                                <div style="display:flex; align-items:center; gap: 30px;">
                                    <div style="font-size: 80px;">${e.emoji}</div>
                                    <div style="flex:1; height: 16px; background: rgba(255,255,255,0.1); border-radius: 8px; overflow:hidden;">
                                        <div style="width: ${(e.count / emojis[0].count) * 100}%; height: 100%; background: #a78bfa; border-radius: 8px;"></div>
                                    </div>
                                    <div style="font-size: 40px; font-weight: 700; color: rgba(255,255,255,0.6); width: 150px; text-align:right;">${e.count.toLocaleString()}</div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `
            };
        }

        cardLateNight(night) {
            return {
                bg: '<div class="bg-gradient" style="background: linear-gradient(to bottom, #020111, #20124d);"></div><div class="bg-orb" style="top: 10%; right: 10%; width: 200px; height: 200px; background: #fff; filter: blur(50px); opacity: 0.8;"></div>',
                html: `
                    <div class="eyebrow anim-fade-up">Midnight Thoughts</div>
                    <div class="huge-title anim-fade-up anim-delay-1" style="font-size: 110px;">You two had things to say after midnight.</div>
                    
                    <div class="stat-block anim-fade-up anim-delay-2" style="margin-top: 150px;">
                        <div class="stat-number" style="color: #fff;">${night.count.toLocaleString()}</div>
                        <div class="stat-label">Messages between 12AM and 4AM.</div>
                    </div>
                    
                    <div class="bottom-quote anim-fade-up anim-delay-3">"Sleep is for the weak."</div>
                `
            };
        }

        cardTotal(s) {
            return {
                bg: '<div class="bg-gradient" style="background: linear-gradient(to bottom, #000, #111);"></div><div class="bg-orb" style="bottom: -20%; right: -20%; width: 1200px; height: 1200px; background: rgba(167, 139, 250, 0.3);"></div>',
                html: `
                    <div class="huge-title anim-fade-up" style="font-size: 200px; margin-bottom: 20px;">${s.totalMessages.toLocaleString()}</div>
                    <div class="subtitle anim-fade-up anim-delay-1" style="font-size: 60px; margin-bottom: 80px;">Messages.</div>
                    
                    <div class="subtitle anim-fade-up anim-delay-2" style="font-size: 50px; font-weight: 500; color: rgba(255,255,255,0.7);">
                        Thousands of jokes.<br>
                        Thousands of random thoughts.<br>
                        And somehow...<br>
                        you kept talking.
                    </div>
                    
                    <div class="stat-block anim-fade-up anim-delay-3" style="margin-top: 100px;">
                        <div style="font-size: 40px; font-weight: 800; display:flex; justify-content:space-between; border-bottom: 2px solid rgba(255,255,255,0.1); padding-bottom: 20px; margin-bottom: 20px;">
                            <span>${esc(s.sender1Name)}</span>
                            <span style="color:#a78bfa">${Math.round(s.totalMessages * s.sender1Percent / 100).toLocaleString()}</span>
                        </div>
                        <div style="font-size: 40px; font-weight: 800; display:flex; justify-content:space-between;">
                            <span>${esc(s.sender2Name)}</span>
                            <span style="color:#a78bfa">${Math.round(s.totalMessages * s.sender2Percent / 100).toLocaleString()}</span>
                        </div>
                    </div>
                `
            };
        }

        // --- Data Helpers ---
        getTopEmojis(msgs) {
            const regex = /[\u{1f300}-\u{1f5ff}\u{1f900}-\u{1f9ff}\u{1f600}-\u{1f64f}\u{1f680}-\u{1f6ff}\u{2600}-\u{26ff}\u{2700}-\u{27bf}\u{1f1e6}-\u{1f1ff}\u{1f191}-\u{1f251}\u{1f004}\u{1f0cf}\u{1f170}-\u{1f171}\u{1f17e}-\u{1f17f}\u{1f18e}\u{3030}\u{2b50}\u{2b55}\u{2934}-\u{2935}\u{2b05}-\u{2b07}\u{2b1b}-\u{2b1c}\u{3297}\u{3299}\u{303d}\u{00a9}\u{00ae}\u{2122}\u{23f3}\u{24c2}\u{23e9}-\u{23ef}\u{25b6}\u{23f8}-\u{23fa}]/gu;
            const counts = {};
            msgs.forEach(m => {
                if (!m.text) return;
                let match;
                while ((match = regex.exec(m.text)) !== null) {
                    counts[match[0]] = (counts[match[0]] || 0) + 1;
                }
            });
            return Object.entries(counts).sort((a,b) => b[1] - a[1]).slice(0, 8).map(x => ({ emoji: x[0], count: x[1] }));
        }

        getNightStats(msgs) {
            let count = 0;
            msgs.forEach(m => {
                if (!m.time) return;
                const h = parseInt(m.time.split(':')[0]);
                const isAm = m.time.toLowerCase().includes('am');
                // Between 12:00 AM and 3:59 AM
                if (isAm && (h === 12 || (h >= 1 && h < 4))) count++;
            });
            return { count };
        }

        // --- Core Engine ---
        init() {
            this.renderDOM();
            this.bindEvents();
            this.showCard(0);
            
            // Trigger entry animation
            requestAnimationFrame(() => {
                this.dom.overlay.style.opacity = '1';
            });
        }

        renderDOM() {
            this.dom.overlay = document.createElement('div');
            this.dom.overlay.className = 'ok-story-overlay';
            
            this.dom.viewport = document.createElement('div');
            this.dom.viewport.className = 'ok-story-viewport';
            
            this.dom.canvas = document.createElement('div');
            this.dom.canvas.className = 'ok-story-canvas';
            this.dom.canvas.id = 'ok-story-export-target';
            
            // Progress Bar
            this.dom.progress = document.createElement('div');
            this.dom.progress.className = 'ok-story-progress-bar';
            this.cards.forEach((_, i) => {
                this.dom.progress.innerHTML += `<div class="ok-story-progress-segment"><div class="ok-story-progress-fill" id="story-fill-${i}"></div></div>`;
            });
            
            // Header
            this.dom.header = document.createElement('div');
            this.dom.header.className = 'ok-story-header';
            this.dom.header.innerHTML = `
                <div class="ok-story-brand">
                    <img src="/img/logo.svg" style="width:24px; height:24px; " />
                    OnlineKotha
                </div>
                <div class="ok-story-close">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </div>
            `;
            
            // Dynamic Content
            this.dom.content = document.createElement('div');
            this.dom.content.style.cssText = 'position:absolute; top:0; left:0; width:100%; height:100%;';
            
            // Footer
            this.dom.footer = document.createElement('div');
            this.dom.footer.className = 'ok-story-footer';
            this.dom.footer.innerHTML = 'onlinekotha.com';
            
            // Action Buttons
            this.dom.actions = document.createElement('div');
            this.dom.actions.className = 'ok-story-actions';
            this.dom.actions.style.display = 'none'; // Only show on last card or paused
            this.dom.actions.innerHTML = `
                <button class="ok-story-btn" id="story-share-btn">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                    Share
                </button>
                <button class="ok-story-btn ok-story-btn-primary" id="story-dl-btn">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                    Save Image
                </button>
            `;

            // Nav Zones
            this.dom.navLeft = document.createElement('div');
            this.dom.navLeft.className = 'ok-story-nav-left';
            this.dom.navRight = document.createElement('div');
            this.dom.navRight.className = 'ok-story-nav-right';

            // Assemble
            this.dom.canvas.appendChild(this.dom.content);
            this.dom.canvas.appendChild(this.dom.bgNoise = document.createElement('div'));
            this.dom.bgNoise.className = 'bg-noise';
            
            this.dom.canvas.appendChild(this.dom.progress);
            this.dom.canvas.appendChild(this.dom.header);
            this.dom.canvas.appendChild(this.dom.footer);
            
            this.dom.viewport.appendChild(this.dom.canvas);
            this.dom.viewport.appendChild(this.dom.navLeft);
            this.dom.viewport.appendChild(this.dom.navRight);
            this.dom.viewport.appendChild(this.dom.actions);
            
            this.dom.overlay.appendChild(this.dom.viewport);
            document.body.appendChild(this.dom.overlay);

            this.resize();
            window.addEventListener('resize', () => this.resize());
        }

        resize() {
            if (!this.dom.viewport) return;
            const w = window.innerWidth;
            const h = window.innerHeight;
            let tw = w, th = w / 0.5625;
            if (th > h) { th = h; tw = h * 0.5625; }
            if (w > 600) { th = h * 0.9; tw = th * 0.5625; }
            
            this.dom.viewport.style.width = tw + 'px';
            this.dom.viewport.style.height = th + 'px';
            this.dom.canvas.style.transform = `scale(${tw / 1080})`;
        }

        bindEvents() {
            this.dom.header.querySelector('.ok-story-close').onclick = () => this.close();
            this.dom.navLeft.onclick = () => this.prev();
            this.dom.navRight.onclick = () => this.next();
            
            const pause = () => { this.isPaused = true; this.dom.actions.style.display = 'flex'; };
            const resume = () => { this.isPaused = false; this.dom.actions.style.display = (this.currentIndex === this.cards.length - 1) ? 'flex' : 'none'; this.lastTick = Date.now(); };
            
            this.dom.navLeft.addEventListener('mousedown', pause);
            this.dom.navLeft.addEventListener('mouseup', resume);
            this.dom.navLeft.addEventListener('touchstart', pause);
            this.dom.navLeft.addEventListener('touchend', resume);
            
            this.dom.navRight.addEventListener('mousedown', pause);
            this.dom.navRight.addEventListener('mouseup', resume);
            this.dom.navRight.addEventListener('touchstart', pause);
            this.dom.navRight.addEventListener('touchend', resume);

            this.dom.overlay.querySelector('#story-dl-btn').onclick = () => this.exportCard();
            this.dom.overlay.querySelector('#story-share-btn').onclick = () => {
                if (navigator.share) {
                    this.exportCard(true);
                } else {
                    alert('Native sharing not supported on this browser. Downloading image instead.');
                    this.exportCard();
                }
            };
        }

        showCard(idx) {
            if (idx < 0 || idx >= this.cards.length) {
                if (idx >= this.cards.length) this.close();
                return;
            }
            this.currentIndex = idx;
            const card = this.cards[idx];
            
            // Render HTML inside safe area
            this.dom.content.innerHTML = `
                ${card.bg}
                <div class="ok-story-safe">
                    ${card.html}
                </div>
            `;
            
            // Update Progress bars
            for (let i = 0; i < this.cards.length; i++) {
                const fill = this.dom.progress.querySelector(`#story-fill-${i}`);
                if (i < idx) fill.style.width = '100%';
                else if (i > idx) fill.style.width = '0%';
            }
            
            // Show actions if last card
            this.dom.actions.style.display = (idx === this.cards.length - 1) ? 'flex' : 'none';
            
            // Start timer
            this.remaining = this.duration;
            this.lastTick = Date.now();
            cancelAnimationFrame(this.timer);
            this.tick();
        }

        tick() {
            if (!this.dom.overlay.parentNode) return;
            const now = Date.now();
            if (!this.isPaused) {
                const delta = now - this.lastTick;
                this.remaining -= delta;
                
                const fill = this.dom.progress.querySelector(`#story-fill-${this.currentIndex}`);
                const pct = Math.max(0, Math.min(100, 100 - (this.remaining / this.duration) * 100));
                if (fill) fill.style.width = pct + '%';
                
                if (this.remaining <= 0) {
                    this.next();
                    return;
                }
            }
            this.lastTick = now;
            this.timer = requestAnimationFrame(() => this.tick());
        }

        next() { this.showCard(this.currentIndex + 1); }
        prev() { this.showCard(this.currentIndex - 1); }
        
        close() {
            this.dom.overlay.style.opacity = '0';
            setTimeout(() => {
                if (this.dom.overlay.parentNode) this.dom.overlay.remove();
            }, 400);
        }

        async exportCard(nativeShare = false) {
            if (!window.htmlToImage) {
                alert('Export library missing.');
                return;
            }
            
            // Hide UI elements that shouldn't be in export
            this.dom.actions.style.display = 'none';
            this.dom.progress.style.display = 'none';
            this.dom.header.querySelector('.ok-story-close').style.display = 'none';
            
            // Temporarily remove transform scaling to capture true 1080x1920
            const oldTransform = this.dom.canvas.style.transform;
            this.dom.canvas.style.transform = 'scale(1)';
            
            try {
                const dataUrl = await window.htmlToImage.toPng(this.dom.canvas, {
                    width: 1080,
                    height: 1920,
                    pixelRatio: 1, // Already capturing at high res (1080x1920)
                    style: { transform: 'scale(1)', transformOrigin: 'top left' },
                    cacheBust: true
                });
                
                if (nativeShare && navigator.share) {
                    const blob = await (await fetch(dataUrl)).blob();
                    const file = new File([blob], 'onlinekotha_story.png', { type: 'image/png' });
                    await navigator.share({
                        title: 'My OnlineKotha Story',
                        files: [file]
                    });
                } else {
                    const a = document.createElement('a');
                    a.href = dataUrl;
                    a.download = `onlinekotha_story_${this.currentIndex + 1}.png`;
                    a.click();
                }
            } catch (err) {
                console.error('Export failed:', err);
                alert('Export failed.');
            } finally {
                // Restore UI
                this.dom.canvas.style.transform = oldTransform;
                if (this.currentIndex === this.cards.length - 1) this.dom.actions.style.display = 'flex';
                this.dom.progress.style.display = 'flex';
                this.dom.header.querySelector('.ok-story-close').style.display = 'flex';
            }
        }
    }

    window.StoryEngine = StoryEngine;
})();
