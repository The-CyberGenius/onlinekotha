// Service Worker for Kotha PWA
const CACHE_NAME = 'kotha-v1';
const STATIC_ASSETS = [
    '/app',
    '/css/style.css',
    '/js/tailwind.js',
    '/js/script.js',
    '/js/auth-init.js',
    '/js/ai-panel.js',
    '/js/upload.js',
    '/js/features.js',
    '/favicon.svg',
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
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', (e) => {
    // Network-first for API calls
    if (e.request.url.includes('/api/')) {
        e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
        return;
    }
    // Cache-first for static assets
    e.respondWith(
        caches.match(e.request).then(cached => cached || fetch(e.request))
    );
});
