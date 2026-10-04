// Service Worker for Kotha PWA
const CACHE_NAME = 'kotha-v43';
const DYNAMIC_CACHE = 'kotha-dynamic-v43';
const STATIC_ASSETS = [
    '/css/style.css',
    '/js/tailwind.js',
    '/js/script.js',
    '/js/auth-init.js',
    '/js/ai-panel.js',
    '/js/upload.js',
    '/js/story.js',
    '/js/features.js',
    '/img/favicon.svg',
    '/manifest.json',
];

self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME && k !== DYNAMIC_CACHE).map(k => caches.delete(k)))
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', (e) => {
    const url = new URL(e.request.url);

    // ── Share Target: receive a file shared from WhatsApp (POST /share-target) ──
    if (e.request.method === 'POST' && url.pathname === '/share-target') {
        e.respondWith((async () => {
            try {
                const form = await e.request.formData();
                const file = form.get('files');
                if (file) {
                    const cache = await caches.open('kotha-share');
                    // Stash the shared file with its name so the page can pick it up
                    const headers = new Headers({ 'x-filename': file.name || 'shared_chat.zip' });
                    await cache.put('/__shared_chat', new Response(file, { headers }));
                }
            } catch (err) { /* ignore */ }
            // Redirect into the app, which will pick up the stashed file
            return Response.redirect('/app?shared=1', 303);
        })());
        return;
    }

    // Network-first for API, navigation, and auth routes
    if (url.pathname.includes('messages?after') || url.pathname.includes('/online-count')) {
        return; // Bypass ServiceWorker entirely for real-time polling to reduce DevTools noise
    }
    
    if (e.request.mode === 'navigate' || url.pathname.startsWith('/api/') || url.pathname === '/app' || url.pathname === '/login.html') {
        // SSE route MUST bypass Service Worker completely
        if (url.pathname === '/api/admin/playground') {
            return;
        }
        e.respondWith(
            fetch(e.request).catch(() => caches.match(e.request))
        );
        return;
    }
    
    // Always fetch admin files from network (never stale cache)
    if (url.pathname.includes('admin')) {
        e.respondWith(
            fetch(e.request).catch(() => caches.match(e.request))
        );
        return;
    }

    // Network-first for JavaScript, CSS, and HTML so updates are applied immediately
    if (url.pathname.endsWith('.js') || url.pathname.endsWith('.css') || url.pathname.endsWith('.html')) {
        e.respondWith(
            fetch(e.request).then(response => {
                if (response && response.status === 200) {
                    const copy = response.clone();
                    caches.open(DYNAMIC_CACHE).then(cache => cache.put(e.request, copy));
                }
                return response;
            }).catch(() => caches.match(e.request))
        );
        return;
    }

    // Cache-first for other static assets (images, fonts, icons)
    e.respondWith(
        caches.match(e.request).then(cached => cached || fetch(e.request))
    );
});
