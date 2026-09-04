const fs = require('fs');
const path = require('path');
const multer = require('multer');
const unzipper = require('unzipper');
const { findChatFile, parseChatFile } = require('./parser');
const { getMessages } = require('./cache');
const { db } = require('./db');

const SRC_DIR = path.join(__dirname, '..', 'src');
const TMP_DIR = path.join(__dirname, '..', '.tmp-uploads');

function ensureDir(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

ensureDir(SRC_DIR);
ensureDir(TMP_DIR);

function userDir(userId) {
    const dir = path.join(SRC_DIR, `u_${userId}`);
    ensureDir(dir);
    return dir;
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const sessionId =
            req.uploadSessionId ||
            (req.uploadSessionId = `up_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
        const sessionDir = path.join(TMP_DIR, sessionId);
        ensureDir(sessionDir);
        cb(null, sessionDir);
    },
    filename: (req, file, cb) => {
        const relPath = file.originalname.replace(/\\/g, '/').replace(/^\/+/, '');
        const safe = relPath
            .split('/')
            .map(s => s.replace(/[^\w.\-() ]/g, '_'))
            .join('__');
        cb(null, safe);
    },
});

const upload = multer({
    storage,
    limits: { fileSize: 650 * 1024 * 1024 },
});

function sanitizeChatName(name) {
    return name.replace(/[^\w.\-() ]/g, '_').trim() || `chat_${Date.now()}`;
}

function uniqueChatDir(baseName, parentDir) {
    let name = baseName;
    let i = 1;
    while (fs.existsSync(path.join(parentDir, name))) {
        name = `${baseName} (${i++})`;
    }
    return path.join(parentDir, name);
}

async function extractZip(zipPath, destDir) {
    await fs.createReadStream(zipPath).pipe(unzipper.Extract({ path: destDir })).promise();
}

function flattenSingleSubfolder(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    if (entries.length === 1 && entries[0].isDirectory()) {
        const inner = path.join(dir, entries[0].name);
        for (const f of fs.readdirSync(inner)) {
            fs.renameSync(path.join(inner, f), path.join(dir, f));
        }
        rmrf(inner);
    }
}

function moveAllFiles(srcDir, destDir) {
    ensureDir(destDir);
    const stack = [srcDir];
    while (stack.length) {
        const cur = stack.pop();
        for (const entry of fs.readdirSync(cur, { withFileTypes: true })) {
            const full = path.join(cur, entry.name);
            if (entry.isDirectory()) {
                stack.push(full);
            } else {
                fs.renameSync(full, path.join(destDir, entry.name));
            }
        }
    }
}

function rmrf(dir) {
    if (!fs.existsSync(dir)) return;
    fs.rmSync(dir, { recursive: true, force: true });
}

async function handleUpload(req, res) {
    try {
        const { getGuestStatus, recordGuestChatImport } = require('./guest');
        let ownerId = req.user ? req.user.id : null;
        let guestId = null;

        if (!ownerId) {
            const guestStatus = getGuestStatus(req, res);
            if (!guestStatus.canImportChat) {
                if (req.uploadSessionId) rmrf(path.join(TMP_DIR, req.uploadSessionId));
                return res.status(403).json({ error: 'Guest limit reached (1/1 free chat imported). Please sign in with Google to import more chats!', requireAuth: true });
            }
            guestId = guestStatus.guestId;
            ownerId = guestId;
        } else {
            // Free-tier registered users: max 2 chat imports (paid/trial/admin = unlimited)
            const { effectivePlan } = require('./auth');
            const plan = effectivePlan(req.user);
            if (plan === 'free') {
                const FREE_MAX_CHATS = 2;
                const chatCount = db.prepare('SELECT COUNT(*) AS c FROM chats WHERE user_id = ? AND deleted_by_user = 0').get(req.user.id)?.c || 0;
                if (chatCount >= FREE_MAX_CHATS) {
                    if (req.uploadSessionId) rmrf(path.join(TMP_DIR, req.uploadSessionId));
                    return res.status(403).json({
                        error: `Free plan allows up to ${FREE_MAX_CHATS} chats. Upgrade to Kotha Pro for unlimited chat imports!`,
                        upgrade: true
                    });
                }
            }
        }

        const files = req.files || [];
        if (!files.length) return res.status(400).json({ error: 'No files uploaded' });

        const sessionDir = path.join(TMP_DIR, req.uploadSessionId);
        const myDir = userDir(ownerId);

        const zipFile = files.find(f => f.originalname.toLowerCase().endsWith('.zip'));
        let finalDir;
        let baseName;

        if (zipFile) {
            const extractDir = path.join(sessionDir, 'extracted');
            ensureDir(extractDir);
            await extractZip(zipFile.path, extractDir);
            try { fs.unlinkSync(zipFile.path); } catch {}
            flattenSingleSubfolder(extractDir);

            const chatFile = findChatFile(extractDir);
            if (!chatFile) {
                rmrf(sessionDir);
                return res.status(400).json({ error: 'No _chat.txt found inside zip' });
            }

            baseName = sanitizeChatName(path.basename(zipFile.originalname, '.zip'));
            finalDir = uniqueChatDir(baseName, myDir);
            ensureDir(finalDir);
            moveAllFiles(extractDir, finalDir);
        } else {
            const chatFile = findChatFile(sessionDir);
            if (!chatFile) {
                rmrf(sessionDir);
                return res.status(400).json({ error: 'No _chat.txt found in uploaded files' });
            }
            const firstFile = files[0].originalname.replace(/\\/g, '/');
            const folderName = firstFile.includes('/')
                ? firstFile.split('/')[0]
                : `chat_${Date.now()}`;
            baseName = sanitizeChatName(folderName);
            finalDir = uniqueChatDir(baseName, myDir);
            ensureDir(finalDir);
            moveAllFiles(sessionDir, finalDir);
        }

        rmrf(sessionDir);

        const folderName = path.basename(finalDir);
        let finalDisplayName = baseName;

        // Clean the display name from common WhatsApp export prefixes/suffixes
        let cleaned = finalDisplayName.replace(/^whatsapp[\s_-]*chat[\s_-]*(with[\s_-]*)?[-–—]?\s*/i, '');
        cleaned = cleaned.replace(/_/g, ' ');
        cleaned = cleaned.replace(/[\s-]*\(?\d{4,}\)?[\s-]*$/g, '');
        cleaned = cleaned.replace(/[\s-]*\d{1,2}[\s/-]\d{1,2}[\s/-]\d{2,4}\s*$/g, '');
        cleaned = cleaned.replace(/[\s-]+\d+\s*$/g, '');
        cleaned = cleaned.replace(/\.(txt|zip|csv|json)\s*$/i, '');
        cleaned = cleaned.replace(/\s{2,}/g, ' ').trim();
        let targetName = cleaned || finalDisplayName;

        let message_count = 0;
        let is_group = 0;
        let participants = [];

        // ALWAYS try to parse the real contact name from the file content
        try {
            const chatFilePath = findChatFile(finalDir);
            if (chatFilePath) {
                // Call getMessages with the directory (not file) to ensure cache is generated and saved immediately
                const parsedData = await getMessages(finalDir);
                message_count = parsedData.messages ? parsedData.messages.length : 0;
                is_group = parsedData.isGroup ? 1 : 0;
                participants = parsedData.participants || [];

                const realSenders = participants;
                const matchedSender = realSenders.find(s => {
                    const sLow = s.toLowerCase();
                    const tLow = targetName.toLowerCase();
                    return sLow.includes(tLow) || tLow.includes(sLow);
                });

                const isGenericName = targetName.toLowerCase() === 'chat' || targetName.toLowerCase() === 'whatsapp chat' || /^chat_\d+$/.test(targetName) || targetName.toLowerCase() === 'export';

                if (parsedData.isGroup) {
                    if (matchedSender && !isGenericName) {
                        finalDisplayName = matchedSender;
                    } else if (targetName && !isGenericName) {
                        finalDisplayName = `${targetName} (Group)`;
                    } else {
                        finalDisplayName = `Group Chat (${realSenders.length} members)`;
                    }
                } else if (realSenders.length > 0) {
                    if (matchedSender && !isGenericName) {
                        finalDisplayName = matchedSender;
                    } else {
                        // 1-on-1 chat fallback when we don't have a specific filename
                        if (realSenders.length >= 2) {
                            finalDisplayName = `${realSenders[0]} & ${realSenders[1]}`;
                        } else {
                            finalDisplayName = realSenders[0];
                        }
                    }
                } else {
                    finalDisplayName = targetName;
                }
            } else {
                finalDisplayName = targetName;
            }
        } catch (e) {
            console.warn('Could not parse contact name:', e.message);
            finalDisplayName = targetName;
        }

        if (req.user) {
            db.prepare(
                `INSERT OR IGNORE INTO chats (user_id, folder_name, display_name, created_at, message_count, is_group, participants)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`
            ).run(req.user.id, folderName, finalDisplayName, Date.now(), message_count, is_group, JSON.stringify(participants));
        } else {
            db.prepare(
                `INSERT OR IGNORE INTO chats (user_id, guest_id, folder_name, display_name, created_at, message_count, is_group, participants)
                 VALUES (0, ?, ?, ?, ?, ?, ?, ?)`
            ).run(guestId, folderName, finalDisplayName, Date.now(), message_count, is_group, JSON.stringify(participants));
            recordGuestChatImport(req, res);
        }

        return res.json({ ok: true, chat: folderName });
    } catch (err) {
        console.error('Upload error:', err);
        if (req.uploadSessionId) rmrf(path.join(TMP_DIR, req.uploadSessionId));
        return res.status(500).json({ error: err.message || 'Upload failed' });
    }
}

module.exports = {
    upload,
    handleUpload,
    SRC_DIR,
    userDir,
};
