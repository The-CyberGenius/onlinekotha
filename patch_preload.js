const fs = require('fs');

// --- 1. Update features.js ---
let feat = fs.readFileSync('public/js/features.js', 'utf8');

const preloadCode = `
    // ── Preload Wrapped ──
    window.kothaWrappedCache = {};
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
    };
`;

if (!feat.includes('window.preloadWrappedStory')) {
    feat = feat.replace(
        /\/\/ ── Launch Wrapped ──/,
        preloadCode + '\n    // ── Launch Wrapped ──'
    );
    
    // Update launchWrapped to use cache
    feat = feat.replace(
        /const stats = computeWrappedStats\(msgs\);/,
        `let stats, compatPromise;
        const cache = window.kothaWrappedCache && window.kothaWrappedCache[targetChat];
        if (cache) {
             stats = cache.stats;
             compatPromise = cache.compatPromise;
        } else {
             stats = computeWrappedStats(msgs);
             compatPromise = fetch(\`/api/ai/chat/\${encodeURIComponent(targetChat)}/compatibility\`, { method: 'POST' })
                 .then(res => res.json())
                 .catch(() => null);
        }
        
        ['btn-wrapped', 'btn-wrapped-2'].forEach(id => {
            const b = document.getElementById(id);
            if (b) b.classList.remove('wrapped-ready-pop');
        });`
    );
    
    // Remove old compatPromise fetch
    feat = feat.replace(
        /let compatPromise = fetch[\s\S]*?catch\(\(\) => null\);/m,
        ''
    );
    
    fs.writeFileSync('public/js/features.js', feat);
}

// --- 2. Update script.js ---
let script = fs.readFileSync('public/js/script.js', 'utf8');
if (!script.includes('preloadWrappedStory(chatName)')) {
    script = script.replace(
        /window\.kothaLoadedChat = chatName;/,
        'window.kothaLoadedChat = chatName;\n            if (window.preloadWrappedStory) window.preloadWrappedStory(chatName);'
    );
    fs.writeFileSync('public/js/script.js', script);
}
