const fs = require('fs');
let code = fs.readFileSync('public/js/features.js', 'utf8');

// Undo the mess inside preloadWrappedStory
code = code.replace(
    /let stats, compatPromise;[\s\S]*?\}\);/m,
    `const stats = computeWrappedStats(msgs);
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
        });`
);

// Now fix the launchWrapped block correctly
code = code.replace(
    /const stats = computeWrappedStats\(msgs\);\s*hideWrappedLoader\(\);/g,
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
        });

        hideWrappedLoader();`
);

fs.writeFileSync('public/js/features.js', code);
