const express = require('express');
const geoip = require('geoip-lite');
const { db } = require('../db');

const router = express.Router();

router.post('/event', express.json(), (req, res) => {
    try {
        const {
            visitor_id,
            session_id,
            event_type,
            page,
            metadata = {},
            device,
            browser,
            os,
            screen_res,
            landing_page,
            referrer,
            utm_source,
            utm_medium,
            utm_campaign,
            utm_content
        } = req.body;

        if (!visitor_id || !event_type) {
            return res.status(400).json({ error: 'Missing visitor_id or event_type' });
        }

        const now = Date.now();
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip || '';
        const realIp = ip.split(',')[0].trim();
        
        let country = 'Unknown';
        let country_code = 'XX';
        let region = '';
        let city = '';
        
        if (realIp && realIp !== '127.0.0.1' && realIp !== '::1') {
            const geo = geoip.lookup(realIp);
            if (geo) {
                country = geo.country || 'Unknown';
                country_code = geo.country || 'XX';
                region = geo.region || '';
                city = geo.city || '';
            }
        }

        // Upsert Visitor
        const existingVisitor = db.prepare('SELECT visitor_id FROM analytics_visitors WHERE visitor_id = ?').get(visitor_id);
        
        if (!existingVisitor) {
            db.prepare(`
                INSERT INTO analytics_visitors (
                    visitor_id, ip_address, country, country_code, region, city, 
                    first_seen, last_seen, total_visits, total_page_views, 
                    device, browser, os, screen_res, user_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)
            `).run(
                visitor_id, realIp, country, country_code, region, city,
                now, now, event_type === 'page_view' ? 1 : 0,
                device, browser, os, screen_res, metadata.user_id || null
            );
        } else {
            db.prepare(`
                UPDATE analytics_visitors 
                SET last_seen = ?,
                    total_page_views = total_page_views + ?,
                    user_id = COALESCE(user_id, ?)
                WHERE visitor_id = ?
            `).run(
                now,
                event_type === 'page_view' ? 1 : 0,
                metadata.user_id || null,
                visitor_id
            );
        }

        // Upsert Session if provided
        if (session_id) {
            const existingSession = db.prepare('SELECT session_id FROM analytics_sessions WHERE session_id = ?').get(session_id);
            if (!existingSession) {
                db.prepare(`
                    INSERT INTO analytics_sessions (
                        session_id, visitor_id, start_time, last_active, 
                        landing_page, referrer, utm_source, utm_medium, utm_campaign, utm_content,
                        device, browser, os
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).run(
                    session_id, visitor_id, now, now,
                    landing_page, referrer, utm_source, utm_medium, utm_campaign, utm_content,
                    device, browser, os
                );
                
                // Increment total_visits for the visitor since this is a new session
                if (existingVisitor) {
                    db.prepare('UPDATE analytics_visitors SET total_visits = total_visits + 1 WHERE visitor_id = ?').run(visitor_id);
                }
            } else {
                db.prepare('UPDATE analytics_sessions SET last_active = ? WHERE session_id = ?').run(now, session_id);
            }
        }

        // Insert Event
        db.prepare(`
            INSERT INTO analytics_events (visitor_id, session_id, event_type, page, created_at, metadata)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(
            visitor_id, 
            session_id || null, 
            event_type, 
            page || '', 
            now, 
            Object.keys(metadata).length ? JSON.stringify(metadata) : null
        );

        res.status(200).json({ success: true });
    } catch (error) {
        console.error('Analytics event error:', error);
        res.status(500).json({ error: 'Failed to record event' });
    }
});

module.exports = router;
