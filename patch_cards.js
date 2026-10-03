const fs = require('fs');
let code = fs.readFileSync('public/js/story.js', 'utf8');

// Add new cards to buildCards
code = code.replace(
    /if \(s\.laughCount > 0\) this\.cards\.push\(this\.cardLaughs\(s\)\);/,
    `if (s.laughCount > 0) this.cards.push(this.cardLaughs(s));
            if (s.mediaCount > 10) this.cards.push(this.cardMedia(s));
            if (s.longestMsgLen > 20) this.cards.push(this.cardLongestMsg(s));
            if (s.totalQuestions > 10) this.cards.push(this.cardQuestions(s));`
);

// Add the template methods
const newTemplates = `
        cardMedia(s) {
            return {
                bg: '<div class="bg-gradient" style="background: linear-gradient(135deg, #1d4ed8, #3b82f6);"></div><div class="bg-orb" style="bottom: -20%; left: -20%; width: 1000px; height: 1000px; background: rgba(96, 165, 250, 0.4);"></div>',
                html: \`
                    <div class="eyebrow anim-fade-up">A gallery of memories</div>
                    <div class="huge-title anim-fade-up anim-delay-1" style="font-size: 130px;">You shared <br><span style="color: #93c5fd;">\${s.mediaCount.toLocaleString()}</span><br>photos & videos.</div>
                    
                    <div class="stat-block anim-fade-up anim-delay-2" style="margin-top: 100px;">
                        <div class="stat-label" style="color: rgba(255,255,255,0.7); font-size: 36px; line-height: 1.4;">
                            That's a lot of screenshots,<br>memes, and double chins.<br>Keep them safe.
                        </div>
                    </div>
                \`
            };
        }

        cardLongestMsg(s) {
            return {
                bg: '<div class="bg-gradient" style="background: linear-gradient(to bottom, #064e3b, #065f46);"></div><div style="position:absolute; font-size: 100px; font-weight: 900; opacity: 0.05; top: 10%; left: -10%; line-height: 0.9; word-wrap: break-word; width: 150%; z-index:0;">' + (s.longestMsgPreview + ' ').repeat(10) + '</div>',
                html: \`
                    <div class="eyebrow anim-fade-up">The Novelist</div>
                    <div class="huge-title anim-fade-up anim-delay-1" style="font-size: 110px;">Someone wrote a whole essay.</div>
                    
                    <div class="stat-block anim-fade-up anim-delay-2" style="margin-top: 80px; background: rgba(0,0,0,0.4); padding: 40px; border-radius: 20px; border-left: 8px solid #34d399;">
                        <div style="font-size: 32px; font-style: italic; color: #a7f3d0; line-height: 1.4;">"\${s.longestMsgPreview}"</div>
                    </div>
                    
                    <div class="stat-block anim-fade-up anim-delay-3" style="margin-top: 60px;">
                        <div class="stat-number" style="font-size: 100px; color: #34d399;">\${s.longestMsgLen}</div>
                        <div class="stat-label">Words in a single message</div>
                    </div>
                \`
            };
        }

        cardQuestions(s) {
            const curious = s.s1Questions > s.s2Questions ? s.sender1Name : s.sender2Name;
            return {
                bg: '<div class="bg-gradient" style="background: linear-gradient(135deg, #701a75, #9d174d);"></div><div style="position:absolute; font-size: 400px; font-weight: 900; opacity: 0.1; top: 20%; right: 10%; z-index:0;">?</div>',
                html: \`
                    <div class="eyebrow anim-fade-up">The Inquisitor</div>
                    <div class="huge-title anim-fade-up anim-delay-1" style="font-size: 140px;">Who asked more questions?</div>
                    
                    <div style="display:flex; justify-content: space-between; align-items:flex-end; margin-top: 80px;" class="anim-fade-up anim-delay-2">
                        <div style="flex:1;">
                            <div style="font-size: 40px; font-weight: 800; color: #fbcfe8; margin-bottom: 20px;">\${esc(s.sender1Name)}</div>
                            <div style="font-size: 100px; font-weight: 900; line-height: 1;">\${s.s1Questions}</div>
                            <div style="font-size: 30px; font-weight: 600; color: rgba(255,255,255,0.6);">questions</div>
                        </div>
                        <div style="flex:1; text-align:right;">
                            <div style="font-size: 40px; font-weight: 800; color: #fbcfe8; margin-bottom: 20px;">\${esc(s.sender2Name)}</div>
                            <div style="font-size: 100px; font-weight: 900; line-height: 1;">\${s.s2Questions}</div>
                            <div style="font-size: 30px; font-weight: 600; color: rgba(255,255,255,0.6);">questions</div>
                        </div>
                    </div>
                    
                    <div class="bottom-quote anim-fade-up anim-delay-3" style="color: #f9a8d4;">Clearly, \${esc(curious)} is the curious one.</div>
                \`
            };
        }

        cardLaughs(s) {`;

code = code.replace(/cardLaughs\(s\) \{/, newTemplates);

fs.writeFileSync('public/js/story.js', code);
