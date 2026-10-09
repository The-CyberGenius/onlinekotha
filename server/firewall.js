const { db } = require('./db');

// In-memory set of blocked IPs for instant O(1) checks on every HTTP & WebSocket connection
const blockedIps = new Set();

function initFirewall() {
    try {
        db.exec(`
            CREATE TABLE IF NOT EXISTS blocked_ips (
                ip TEXT PRIMARY KEY,
                reason TEXT,
                blocked_by TEXT,
                created_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_blocked_ips_created ON blocked_ips(created_at);
        `);
        const rows = db.prepare('SELECT ip FROM blocked_ips').all();
        blockedIps.clear();
        for (const r of rows) {
            if (r.ip) blockedIps.add(r.ip.trim());
        }
        console.log(`🛡️  Firewall active: ${blockedIps.size} blocked IP(s) loaded into memory`);
    } catch (err) {
        console.error('Error initializing firewall table:', err);
    }
}

// Initial load
initFirewall();

function isBlocked(ip) {
    if (!ip) return false;
    const cleanIp = String(ip).split(',')[0].trim();
    if (!cleanIp || cleanIp === '127.0.0.1' || cleanIp === '::1' || cleanIp === 'localhost') return false;
    return blockedIps.has(cleanIp);
}

function blockIp(ip, reason = 'Blocked by administrator', blockedBy = 'admin') {
    if (!ip) return { ok: false, error: 'IP address is required' };
    const cleanIp = String(ip).split(',')[0].trim();
    if (!cleanIp) return { ok: false, error: 'Invalid IP address' };
    if (cleanIp === '127.0.0.1' || cleanIp === '::1' || cleanIp === 'localhost') {
        return { ok: false, error: 'Cannot block localhost' };
    }
    
    const now = Date.now();
    try {
        db.prepare(`
            INSERT OR REPLACE INTO blocked_ips (ip, reason, blocked_by, created_at)
            VALUES (?, ?, ?, ?)
        `).run(cleanIp, String(reason || '').trim() || 'Blocked by administrator', blockedBy || 'admin', now);
        
        blockedIps.add(cleanIp);
        return { ok: true, ip: cleanIp, reason, created_at: now };
    } catch (err) {
        console.error('Failed to block IP in db:', err);
        return { ok: false, error: err.message };
    }
}

function unblockIp(ip) {
    if (!ip) return { ok: false, error: 'IP address is required' };
    const cleanIp = String(ip).split(',')[0].trim();
    try {
        db.prepare('DELETE FROM blocked_ips WHERE ip = ?').run(cleanIp);
        blockedIps.delete(cleanIp);
        return { ok: true, ip: cleanIp };
    } catch (err) {
        console.error('Failed to unblock IP in db:', err);
        return { ok: false, error: err.message };
    }
}

function getBlockedIps() {
    try {
        return db.prepare('SELECT ip, reason, blocked_by, created_at FROM blocked_ips ORDER BY created_at DESC').all();
    } catch (err) {
        console.error('Failed to fetch blocked IPs:', err);
        return [];
    }
}

function clearAllBlocks() {
    try {
        db.prepare('DELETE FROM blocked_ips').run();
        blockedIps.clear();
        return { ok: true };
    } catch (err) {
        console.error('Failed to clear blocked IPs:', err);
        return { ok: false, error: err.message };
    }
}

module.exports = {
    isBlocked,
    blockIp,
    unblockIp,
    getBlockedIps,
    clearAllBlocks,
    initFirewall
};
