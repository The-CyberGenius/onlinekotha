const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'kotha.db');
const db = new Database(dbPath);

console.log('Inserting dummy data...');
const now = Date.now();

// Insert dummy visitors
db.prepare('INSERT OR IGNORE INTO analytics_visitors (visitor_id, ip_address, country, country_code, total_visits, first_seen, last_seen, browser, os, device) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('dummy_v1', '192.168.1.1', 'United States', 'US', 5, now - 86400000, now, 'Chrome', 'Windows', 'Desktop');
db.prepare('INSERT OR IGNORE INTO analytics_visitors (visitor_id, ip_address, country, country_code, total_visits, first_seen, last_seen, browser, os, device) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('dummy_v2', '192.168.1.2', 'India', 'IN', 2, now - 186400000, now, 'Safari', 'iOS', 'Mobile');
db.prepare('INSERT OR IGNORE INTO analytics_visitors (visitor_id, ip_address, country, country_code, total_visits, first_seen, last_seen, browser, os, device) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('dummy_v3', '192.168.1.3', 'United Kingdom', 'GB', 1, now, now, 'Firefox', 'Mac', 'Desktop');

// Insert dummy sessions
db.prepare('INSERT OR IGNORE INTO analytics_sessions (session_id, visitor_id, start_time, last_active, landing_page, referrer) VALUES (?, ?, ?, ?, ?, ?)').run('dummy_s1', 'dummy_v1', now - 3600000, now, '/', 'https://google.com');
db.prepare('INSERT OR IGNORE INTO analytics_sessions (session_id, visitor_id, start_time, last_active, landing_page, referrer) VALUES (?, ?, ?, ?, ?, ?)').run('dummy_s2', 'dummy_v2', now - 7200000, now, '/login', 'Direct');
db.prepare('INSERT OR IGNORE INTO analytics_sessions (session_id, visitor_id, start_time, last_active, landing_page, referrer) VALUES (?, ?, ?, ?, ?, ?)').run('dummy_s3', 'dummy_v3', now, now, '/dashboard', 'https://bing.com');

// Insert dummy events
db.prepare('INSERT INTO analytics_events (visitor_id, session_id, event_type, page, created_at, metadata) VALUES (?, ?, ?, ?, ?, ?)').run('dummy_v1', 'dummy_s1', 'page_view', '/', now - 3600000, '{}');
db.prepare('INSERT INTO analytics_events (visitor_id, session_id, event_type, page, created_at, metadata) VALUES (?, ?, ?, ?, ?, ?)').run('dummy_v1', 'dummy_s1', 'signup_completed', '/signup', now - 3500000, '{}');
db.prepare('INSERT INTO analytics_events (visitor_id, session_id, event_type, page, created_at, metadata) VALUES (?, ?, ?, ?, ?, ?)').run('dummy_v2', 'dummy_s2', 'page_view', '/login', now - 7200000, '{}');
db.prepare('INSERT INTO analytics_events (visitor_id, session_id, event_type, page, created_at, metadata) VALUES (?, ?, ?, ?, ?, ?)').run('dummy_v3', 'dummy_s3', 'page_view', '/dashboard', now, '{}');
db.prepare('INSERT INTO analytics_events (visitor_id, session_id, event_type, page, created_at, metadata) VALUES (?, ?, ?, ?, ?, ?)').run('dummy_v1', 'dummy_s1', 'button_click', '/', now - 3000000, '{"button":"start"}');

console.log('Dummy data inserted!');
