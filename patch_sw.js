const fs = require('fs');
let sw = fs.readFileSync('public/sw.js', 'utf8');

// Replace the network-first routing
sw = sw.replace(
    /if \(e.request.mode === 'navigate' \|\| url.pathname.startsWith\('\/api\/'\) \|\| url.pathname === '\/app' \|\| url.pathname === '\/login.html'\) \{/,
    `if (url.pathname.includes('messages?after') || url.pathname.includes('/online-count')) {
        return; // Bypass ServiceWorker entirely for real-time polling to reduce DevTools noise
    }
    
    if (e.request.mode === 'navigate' || url.pathname.startsWith('/api/') || url.pathname === '/app' || url.pathname === '/login.html') {`
);
fs.writeFileSync('public/sw.js', sw);
