const fs = require('fs');
let code = fs.readFileSync('public/js/story.js', 'utf8');

code = code.replace(/s\.totalMsgs/g, 's.totalMessages');
code = code.replace(/s\.topDayDate/g, 's.busiestDate');
code = code.replace(/s\.topDayCount/g, 's.busiestDateCount');
code = code.replace(/s\.s1Count/g, '(s.totalMessages * s.sender1Percent / 100)');
code = code.replace(/s\.s2Count/g, '(s.totalMessages * s.sender2Percent / 100)');

code = code.replace(/if \(s.topWord\) this.cards.push\(this.cardTopWord\(s\)\);/, 'if (s.laughCount > 0) this.cards.push(this.cardLaughs(s));');

// Create cardLaughs
const cardLaughsStr = `
        cardLaughs(s) {
            return {
                bg: '<div class="bg-gradient" style="background: linear-gradient(135deg, #ff7e5f, #feb47b);"></div><div style="position:absolute; font-size: 300px; font-weight: 900; opacity: 0.05; top: 10%; left: -10%; line-height: 0.8; word-wrap: break-word; width: 150%; text-transform: uppercase; z-index:0;">HAHA '.repeat(20) + '</div>',
                html: \`
                    <div class="eyebrow anim-fade-up">Vibe check</div>
                    <div class="subtitle anim-fade-up anim-delay-1" style="font-size: 60px;">You laughed</div>
                    <div class="stat-number anim-fade-up anim-delay-1" style="font-size: 200px; line-height: 1.1; background: #fff; -webkit-background-clip: text; word-break: break-all;">A LOT</div>
                    
                    <div class="stat-block anim-fade-up anim-delay-2" style="margin-top: 40px;">
                        <div class="stat-number" style="font-size: 140px;">\${s.laughCount.toLocaleString()}</div>
                        <div class="stat-label" style="color: rgba(0,0,0,0.5);">Messages with HAHA, LOL, 😂</div>
                    </div>
                \`
            };
        }
`;

code = code.replace(/cardTopWord\(s\) \{[\s\S]*?\}\s*cardEmojis\(emojis\)/, cardLaughsStr + '\n        cardEmojis(emojis)');

// Add busiest day of week card
code = code.replace(/this\.cards\.push\(this\.cardBusiestDay\(s\)\);/g, 'this.cards.push(this.cardBusiestDay(s));\n            if (s.busiestDay) this.cards.push(this.cardBusiestWeekday(s));');

const cardBusiestWeekdayStr = `
        cardBusiestWeekday(s) {
            return {
                bg: '<div class="bg-gradient" style="background: linear-gradient(135deg, #43e97b, #38f9d7);"></div><div style="position:absolute; font-size: 300px; font-weight: 900; opacity: 0.05; top: 10%; left: -10%; line-height: 0.8; word-wrap: break-word; width: 150%; text-transform: uppercase; z-index:0;">' + (s.busiestDay + ' ').repeat(20) + '</div>',
                html: \`
                    <div class="eyebrow anim-fade-up">Activity Patterns</div>
                    <div class="huge-title anim-fade-up anim-delay-1" style="font-size: 140px; color: #fff;">\${s.busiestDay}</div>
                    <div class="subtitle anim-fade-up anim-delay-2" style="font-size: 70px; font-weight: 800; color: rgba(0,0,0,0.5);">was your day.</div>
                    
                    <div class="stat-block anim-fade-up anim-delay-3" style="margin-top: 150px;">
                        <div class="stat-label" style="color: #000;">You sent more messages on \${s.busiestDay}s than any other day of the week.</div>
                    </div>
                \`
            };
        }
`;

code = code.replace(/cardBusiestDay\(s\) \{[\s\S]*?\}\s*cardLaughs\(s\)/, (match) => match.replace('cardLaughs(s)', cardBusiestWeekdayStr + '\n        cardLaughs(s)'));


fs.writeFileSync('public/js/story.js', code);
