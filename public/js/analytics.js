(function() {
    // Analytics Constants
    const VISITOR_COOKIE_NAME = 'kotha_visitor_id';
    const SESSION_STORAGE_KEY = 'kotha_session_id';

    // Helper: Generate UUID v4
    function generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    // Helper: Get or Set Persistent Visitor ID (Cookie, 1 Year)
    function getVisitorId() {
        let match = document.cookie.match(new RegExp('(^| )' + VISITOR_COOKIE_NAME + '=([^;]+)'));
        if (match) return match[2];
        
        let id = generateUUID();
        let expires = new Date();
        expires.setFullYear(expires.getFullYear() + 1);
        document.cookie = VISITOR_COOKIE_NAME + '=' + id + ';expires=' + expires.toUTCString() + ';path=/';
        return id;
    }

    // Helper: Get or Set Session ID (Session Storage)
    function getSessionId() {
        let id = sessionStorage.getItem(SESSION_STORAGE_KEY);
        if (!id) {
            id = generateUUID();
            sessionStorage.setItem(SESSION_STORAGE_KEY, id);
        }
        return id;
    }

    // Parse UTM Parameters
    function getUTMParams() {
        const params = new URLSearchParams(window.location.search);
        return {
            utm_source: params.get('utm_source') || '',
            utm_medium: params.get('utm_medium') || '',
            utm_campaign: params.get('utm_campaign') || '',
            utm_content: params.get('utm_content') || ''
        };
    }

    // Collect Device Info
    function getDeviceInfo() {
        const ua = navigator.userAgent;
        let browser = 'Unknown';
        let os = 'Unknown';
        let device = 'Desktop';

        // Very basic detection for analytics
        if (/Mobile|Android|iP(hone|od|ad)/.test(ua)) device = 'Mobile';
        else if (/Tablet/.test(ua)) device = 'Tablet';

        if (/Win/.test(ua)) os = 'Windows';
        else if (/Mac/.test(ua)) os = 'MacOS';
        else if (/Linux/.test(ua)) os = 'Linux';
        else if (/Android/.test(ua)) os = 'Android';
        else if (/iOS|iPhone|iPad/.test(ua)) os = 'iOS';

        if (/Chrome/.test(ua) && !/Edge/.test(ua)) browser = 'Chrome';
        else if (/Safari/.test(ua) && !/Chrome/.test(ua)) browser = 'Safari';
        else if (/Firefox/.test(ua)) browser = 'Firefox';
        else if (/Edge/.test(ua)) browser = 'Edge';

        return { device, browser, os, screen_res: `${window.screen.width}x${window.screen.height}` };
    }

    // Main tracking function exposed globally
    window.trackKothaEvent = async function(event_type, metadata = {}) {
        try {
            const visitor_id = getVisitorId();
            const session_id = getSessionId();
            const utm = getUTMParams();
            const device = getDeviceInfo();

            // Link user_id if logged in
            if (window.__USER__ && window.__USER__.id) {
                metadata.user_id = window.__USER__.id;
            }

            const payload = {
                visitor_id,
                session_id,
                event_type,
                page: window.location.pathname,
                landing_page: sessionStorage.getItem('kotha_landing_page') || window.location.pathname,
                referrer: document.referrer || '',
                ...utm,
                ...device,
                metadata
            };

            // Store landing page for the session
            if (!sessionStorage.getItem('kotha_landing_page')) {
                sessionStorage.setItem('kotha_landing_page', window.location.pathname);
            }

            // Send async
            fetch('/api/analytics/event', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                keepalive: true
            }).catch(() => { /* silent fail for analytics */ });

        } catch (e) {
            // Do not break the app if analytics fails
            console.warn('Analytics tracking error:', e);
        }
    };

    // Automatically track page view on load
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        window.trackKothaEvent('page_view');
    } else {
        window.addEventListener('DOMContentLoaded', () => {
            window.trackKothaEvent('page_view');
        });
    }

})();
