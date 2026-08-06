const crypto = require('crypto');
const { db } = require('./db');

const GUEST_MAX_CHATS = 1;
const GUEST_MAX_AI_MSGS = 10;

function getClientIp(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
        return forwarded.split(',')[0].trim();
    }
    return req.ip || req.socket.remoteAddress || '127.0.0.1';
}

function getFingerprint(req) {
    const ip = getClientIp(req);
    const ua = req.headers['user-agent'] || '';
    const lang = req.headers['accept-language'] || '';
    return crypto.createHash('sha256').update(`${ip}|${ua}|${lang}`).digest('hex');
}

function getOrCreateGuestId(req, res) {
    let guestId = req.cookies && req.cookies.kotha_guest_id;
    if (!guestId) {
        guestId = 'gst_' + crypto.randomBytes(16).toString('hex');
        if (res) {
            const IS_PROD = process.env.NODE_ENV === 'production';
            res.cookie('kotha_guest_id', guestId, {
                maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year
                httpOnly: false,
                sameSite: 'lax',
                path: '/',
                ...(IS_PROD && { secure: true }),
            });
        }
    }
    return guestId;
}

function getGuestRecord(guestId, ip, fp) {
    const now = Date.now();
    let row = db.prepare('SELECT * FROM guest_sessions WHERE id = ? OR ip = ? OR fingerprint = ?').get(guestId, ip, fp);
    if (!row) {
        db.prepare(`
            INSERT INTO guest_sessions (id, ip, fingerprint, chats_imported, ai_messages_count, created_at, updated_at)
            VALUES (?, ?, ?, 0, 0, ?, ?)
        `).run(guestId, ip, fp, now, now);
        row = db.prepare('SELECT * FROM guest_sessions WHERE id = ?').get(guestId);
    } else if (row.id !== guestId) {
        // Associate this guestId with the existing IP/fingerprint session if IP matches
        db.prepare('UPDATE guest_sessions SET id = ?, updated_at = ? WHERE id = ?').run(guestId, now, row.id);
        row = db.prepare('SELECT * FROM guest_sessions WHERE id = ?').get(guestId);
    }
    return row;
}

function getGuestStatus(req, res) {
    const guestId = getOrCreateGuestId(req, res);
    const ip = getClientIp(req);
    const fp = getFingerprint(req);
    const record = getGuestRecord(guestId, ip, fp);

    const chatsImported = record ? record.chats_imported : 0;
    const aiMsgsUsed = record ? record.ai_messages_count : 0;

    return {
        guestId,
        chatsImported,
        maxChats: GUEST_MAX_CHATS,
        canImportChat: chatsImported < GUEST_MAX_CHATS,
        aiMsgsUsed,
        maxAiMsgs: GUEST_MAX_AI_MSGS,
        canUseAI: aiMsgsUsed < GUEST_MAX_AI_MSGS,
        chatsRemaining: Math.max(0, GUEST_MAX_CHATS - chatsImported),
        aiMsgsRemaining: Math.max(0, GUEST_MAX_AI_MSGS - aiMsgsUsed),
    };
}

function recordGuestChatImport(req, res) {
    const guestId = getOrCreateGuestId(req, res);
    const ip = getClientIp(req);
    const fp = getFingerprint(req);
    getGuestRecord(guestId, ip, fp);

    const now = Date.now();
    db.prepare('UPDATE guest_sessions SET chats_imported = chats_imported + 1, updated_at = ? WHERE id = ? OR ip = ? OR fingerprint = ?').run(now, guestId, ip, fp);
}

function recordGuestAIMessage(req, res) {
    const guestId = getOrCreateGuestId(req, res);
    const ip = getClientIp(req);
    const fp = getFingerprint(req);
    getGuestRecord(guestId, ip, fp);

    const now = Date.now();
    db.prepare('UPDATE guest_sessions SET ai_messages_count = ai_messages_count + 1, updated_at = ? WHERE id = ? OR ip = ? OR fingerprint = ?').run(now, guestId, ip, fp);
}

function claimGuestData(guestId, userId) {
    if (!guestId || !userId) return;
    try {
        // Link any guest chats to the user
        db.prepare('UPDATE chats SET user_id = ? WHERE guest_id = ?').run(userId, guestId);
        db.prepare('UPDATE conversations SET user_id = ? WHERE guest_id = ?').run(userId, guestId);
    } catch (e) {
        console.error('Error claiming guest data:', e);
    }
}

module.exports = {
    GUEST_MAX_CHATS,
    GUEST_MAX_AI_MSGS,
    getOrCreateGuestId,
    getGuestStatus,
    recordGuestChatImport,
    recordGuestAIMessage,
    claimGuestData,
};
