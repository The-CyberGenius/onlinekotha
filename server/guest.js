const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { db, getSetting } = require('./db');

function getClientIp(req) {
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

    const actualChats = db.prepare('SELECT COUNT(*) AS c FROM chats WHERE guest_id = ?').get(guestId)?.c || 0;
    const chatsImported = Math.max(record ? record.chats_imported : 0, actualChats);
    const aiMsgsUsed = record ? record.ai_messages_count : 0;
    
    const GUEST_MAX_CHATS = Number(getSetting('guest_max_chats', '1'));
    const GUEST_MAX_AI_MSGS = Number(getSetting('guest_max_messages', '10'));

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
        db.prepare('UPDATE chats SET user_id = ? WHERE guest_id = ? AND (user_id = 0 OR user_id IS NULL)').run(userId, guestId);
        db.prepare('UPDATE conversations SET user_id = ? WHERE guest_id = ? AND (user_id = 0 OR user_id IS NULL)').run(userId, guestId);
        try {
            db.prepare('UPDATE kotha_assistant_messages SET user_id = ? WHERE guest_id = ? AND (user_id = 0 OR user_id IS NULL)').run(userId, guestId);
        } catch (e) {}

        // Move files from u_<guestId> to u_<userId> on disk
        const { SRC_DIR } = require('./upload');
        const guestDir = path.join(SRC_DIR, `u_${guestId}`);
        const userDir = path.join(SRC_DIR, `u_${userId}`);

        if (fs.existsSync(guestDir)) {
            if (!fs.existsSync(userDir)) {
                fs.mkdirSync(userDir, { recursive: true });
            }
            const entries = fs.readdirSync(guestDir, { withFileTypes: true });
            for (const entry of entries) {
                const srcPath = path.join(guestDir, entry.name);
                const destPath = path.join(userDir, entry.name);
                try {
                    if (fs.existsSync(destPath)) {
                        const uniqueDest = path.join(userDir, `${entry.name}_${Date.now()}`);
                        fs.renameSync(srcPath, uniqueDest);
                    } else {
                        fs.renameSync(srcPath, destPath);
                    }
                } catch (err) {
                    console.error(`Failed to move chat folder from ${srcPath} to ${destPath}:`, err);
                }
            }
            try {
                if (fs.readdirSync(guestDir).length === 0) {
                    fs.rmdirSync(guestDir);
                }
            } catch (e) {}
        }

        try {
            db.prepare('UPDATE guest_sessions SET chats_imported = 0 WHERE id = ?').run(guestId);
        } catch (e) {}
    } catch (e) {
        console.error('Error claiming guest data:', e);
    }
}

function healOrphanedGuestChats() {
    try {
        const { SRC_DIR } = require('./upload');
        if (!fs.existsSync(SRC_DIR)) return;

        // Find all chats where user is registered and guest_id is known
        const chats = db.prepare("SELECT id, user_id, guest_id, folder_name FROM chats WHERE user_id > 0 AND guest_id IS NOT NULL AND guest_id != ''").all();
        for (const chat of chats) {
            const userChatDir = path.join(SRC_DIR, `u_${chat.user_id}`, chat.folder_name);
            const guestChatDir = path.join(SRC_DIR, `u_${chat.guest_id}`, chat.folder_name);
            if (!fs.existsSync(userChatDir) && fs.existsSync(guestChatDir)) {
                console.log(`[Auto-Heal] Moving orphaned chat "${chat.folder_name}" from guest u_${chat.guest_id} to user u_${chat.user_id}`);
                const userBase = path.join(SRC_DIR, `u_${chat.user_id}`);
                if (!fs.existsSync(userBase)) fs.mkdirSync(userBase, { recursive: true });
                try {
                    fs.renameSync(guestChatDir, userChatDir);
                } catch(e) {
                    console.error(`[Auto-Heal] Failed to rename:`, e.message);
                }
            }
        }

        // Clean up any remaining guest folders whose chats were claimed
        const allGuestDirs = fs.readdirSync(SRC_DIR, { withFileTypes: true }).filter(d => d.isDirectory() && d.name.startsWith('u_gst_'));
        for (const gDir of allGuestDirs) {
            const guestId = gDir.name.replace(/^u_/, '');
            const unclaimedCount = db.prepare('SELECT COUNT(*) as c FROM chats WHERE guest_id = ? AND (user_id = 0 OR user_id IS NULL)').get(guestId)?.c || 0;
            if (unclaimedCount === 0) {
                const gDirPath = path.join(SRC_DIR, gDir.name);
                const subfolders = fs.readdirSync(gDirPath, { withFileTypes: true });
                for (const sub of subfolders) {
                    if (sub.isDirectory()) {
                        const claimedRow = db.prepare('SELECT user_id FROM chats WHERE guest_id = ? AND folder_name = ? AND user_id > 0').get(guestId, sub.name);
                        if (claimedRow && claimedRow.user_id) {
                            const destUserBase = path.join(SRC_DIR, `u_${claimedRow.user_id}`);
                            if (!fs.existsSync(destUserBase)) fs.mkdirSync(destUserBase, { recursive: true });
                            const destChatPath = path.join(destUserBase, sub.name);
                            if (!fs.existsSync(destChatPath)) {
                                console.log(`[Auto-Heal] Migrated "${sub.name}" from ${gDir.name} to u_${claimedRow.user_id}`);
                                try { fs.renameSync(path.join(gDirPath, sub.name), destChatPath); } catch(e) {}
                            }
                        }
                    }
                }
                try {
                    if (fs.readdirSync(gDirPath).length === 0) {
                        fs.rmdirSync(gDirPath);
                    }
                } catch(e) {}
            }
        }
    } catch (err) {
        console.error('healOrphanedGuestChats error:', err);
    }
}

module.exports = {
    getOrCreateGuestId,
    getGuestStatus,
    recordGuestChatImport,
    recordGuestAIMessage,
    claimGuestData,
    healOrphanedGuestChats,
};
