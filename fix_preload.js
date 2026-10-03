const fs = require('fs');
let code = fs.readFileSync('public/js/features.js', 'utf8');

// Replace the entire preloadWrappedStory function with a clean one
const cleanPreload = `    window.kothaWrappedCache = {};
    window.preloadWrappedStory = function(chatName) {
        if (!chatName) return;
        const raw = window.kothaGetAllMessages ? window.kothaGetAllMessages() : [];
        const msgs = raw.filter(m => m.sender && m.type !== 'system');
        if (msgs.length < 5) return;

        const stats = computeWrappedStats(msgs);
        const compatPromise = fetch(\`/api/ai/chat/\${encodeURIComponent(chatName)}/compatibility\`, { method: 'POST' })
            .then(res => res.json())
            .catch(() => null);

        window.kothaWrappedCache[chatName] = { stats, compatPromise };

        compatPromise.then(() => {
            if (window.kothaGetCurrentChat && window.kothaGetCurrentChat() === chatName) {
                ['btn-wrapped', 'btn-wrapped-2'].forEach(id => {
                    const b = document.getElementById(id);
                    if (b) b.classList.add('wrapped-ready-pop');
                });
            }
        });
    };`;

code = code.replace(/window\.kothaWrappedCache = \{\};[\s\S]*?\}\);[\s\S]*?\}\);[\s\S]*?\}\;/m, cleanPreload);
fs.writeFileSync('public/js/features.js', code);
