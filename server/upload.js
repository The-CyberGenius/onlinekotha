const fs = require('fs');
const path = require('path');
const multer = require('multer');
const unzipper = require('unzipper');
const { findChatFile } = require('./parser');
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
    limits: { fileSize: 500 * 1024 * 1024 },
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
        fs.rmdirSync(inner);
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
            fs.unlinkSync(zipFile.path);
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

        // If baseName is generic (e.g. "Chat", "WhatsApp Chat"), try to parse the real contact name
        if (/^(chat|whatsapp|whatsappchat|unknown|group|user)$/i.test(baseName.replace(/[\s\-_]/g, ''))) {
            try {
                const parsed = await parseChatFile(findChatFile(finalDir));
                const senders = {};
                (parsed.messages || []).forEach(m => {
                    if (m.sender && m.type !== 'system') senders[m.sender] = (senders[m.sender] || 0) + 1;
                });
                const sorted = Object.keys(senders).sort((a, b) => senders[b] - senders[a]);
                if (sorted.length > 2) {
                    finalDisplayName = `Group Chat (${sorted.length} members)`;
                } else if (sorted.length > 0) {
                    finalDisplayName = sorted[1] || sorted[0];
                }
            } catch (e) {
                console.warn('Could not parse contact name for generic upload:', e.message);
            }
        }

        if (req.user) {
            db.prepare(
                `INSERT OR IGNORE INTO chats (user_id, folder_name, display_name, created_at)
                 VALUES (?, ?, ?, ?)`
            ).run(req.user.id, folderName, finalDisplayName, Date.now());
        } else {
            db.prepare(
                `INSERT OR IGNORE INTO chats (user_id, guest_id, folder_name, display_name, created_at)
                 VALUES (0, ?, ?, ?, ?)`
            ).run(guestId, folderName, finalDisplayName, Date.now());
            recordGuestChatImport(req, res);
        }

        return res.json({ ok: true, chat: folderName });

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
