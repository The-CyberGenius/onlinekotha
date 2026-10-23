const fs = require('fs');
const path = require('path');
const multer = require('multer');
const unzipper = require('unzipper');
const { execFile } = require('child_process');
const { findChatFile, parseChatFile } = require('./parser');
const { getMessages } = require('./cache');
const { db, getSetting } = require('./db');

const SRC_DIR = path.join(__dirname, '..', 'src');
const TMP_DIR = path.join(__dirname, '..', '.tmp-uploads');

function ensureDir(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

ensureDir(SRC_DIR);
ensureDir(TMP_DIR);

// Clean up stale temporary upload sessions (> 2 hours old)
function cleanupStaleTmpUploads() {
    try {
        if (!fs.existsSync(TMP_DIR)) return;
        const now = Date.now();
        const maxAge = 2 * 60 * 60 * 1000;
        for (const entry of fs.readdirSync(TMP_DIR)) {
            const full = path.join(TMP_DIR, entry);
            try {
                const stat = fs.statSync(full);
                if (now - stat.mtimeMs > maxAge) {
                    rmrf(full);
                }
            } catch {}
        }
    } catch (e) {
        console.warn('Stale tmp cleanup error:', e.message);
    }
}
setInterval(cleanupStaleTmpUploads, 60 * 60 * 1000).unref();
cleanupStaleTmpUploads();

function userDir(userId) {
    const dir = path.join(SRC_DIR, `u_${userId}`);
    ensureDir(dir);
    return dir;
}

// Check guest and free-tier quotas before or during upload
function checkUploadQuota(req, res) {
    const { getGuestStatus } = require('./guest');
    let ownerId = req.user ? req.user.id : null;
    let guestId = null;

    if (!ownerId) {
        const guestStatus = getGuestStatus(req, res);
        if (!guestStatus.canImportChat) {
            const maxGuestChats = getSetting('guest_max_chats', '1');
            return {
                allowed: false,
                status: 403,
                body: {
                    error: `Guest limit reached (${maxGuestChats}/${maxGuestChats} free chat imported). Please sign in with Google to import more chats!`,
                    requireAuth: true
                }
            };
        }
        guestId = guestStatus.guestId;
        ownerId = guestId;
    } else {
        const { effectivePlan } = require('./auth');
        const plan = effectivePlan(req.user);
        if (plan === 'free') {
            const FREE_MAX_CHATS = Number(getSetting('free_max_chats', '2'));
            const chatCount = db.prepare('SELECT COUNT(*) AS c FROM chats WHERE user_id = ? AND deleted_by_user = 0').get(req.user.id)?.c || 0;
            if (chatCount >= FREE_MAX_CHATS) {
                return {
                    allowed: false,
                    status: 403,
                    body: {
                        error: `Free plan allows up to ${FREE_MAX_CHATS} chats. Upgrade to Kotha Pro for unlimited chat imports!`,
                        upgrade: true
                    }
                };
            }
        }
    }

    return { allowed: true, ownerId, guestId, isGuest: !req.user };
}

// ── Standard Monolithic Multer (Legacy & Small uploads up to 2GB) ──
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
    limits: { fileSize: 2048 * 1024 * 1024, fieldSize: 50 * 1024 * 1024 },
});

// ── Chunked Multer (5MB-50MB chunks) ──
const chunkStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadId = (req.query.uploadId || req.body.uploadId || req.uploadSessionId || `up_${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, '');
        req.uploadSessionId = uploadId;
        const chunkDir = path.join(TMP_DIR, uploadId, 'chunks');
        ensureDir(chunkDir);
        cb(null, chunkDir);
    },
    filename: (req, file, cb) => {
        const chunkIndex = parseInt(req.query.chunkIndex ?? req.body.chunkIndex, 10);
        const safeIndex = isNaN(chunkIndex) ? '0' : String(chunkIndex);
        cb(null, `chunk_${safeIndex}`);
    },
});

const uploadChunk = multer({
    storage: chunkStorage,
    limits: { fileSize: 50 * 1024 * 1024 },
});

// ── Individual File Multer (for multi-file / folder uploads) ──
const fileStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadId = (req.query.uploadId || req.body.uploadId || req.uploadSessionId || `up_${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, '');
        req.uploadSessionId = uploadId;
        const rawRel = (req.query.relPath || file.originalname || '').replace(/\\/g, '/').replace(/^\/+/, '');
        const relDir = path.dirname(rawRel);
        const targetDir = path.join(TMP_DIR, uploadId, 'files', relDir);
        ensureDir(targetDir);
        cb(null, targetDir);
    },
    filename: (req, file, cb) => {
        const rawRel = (req.query.relPath || file.originalname || '').replace(/\\/g, '/');
        const base = path.basename(rawRel).replace(/[^\w.\-() ]/g, '_');
        cb(null, base || `file_${Date.now()}`);
    },
});

const uploadIndividualFile = multer({
    storage: fileStorage,
    limits: { fileSize: 2048 * 1024 * 1024 },
});

function sanitizeChatName(name) {
    return name.replace(/[^\w.\-() ]/g, '_').trim() || `chat_${Date.now()}`;
}

function uniqueChatDir(baseName, parentDir, ownerId, isGuest) {
    let name = baseName;
    let i = 1;
    const existsInDb = (n) => {
        try {
            if (isGuest) {
                return Boolean(db.prepare('SELECT 1 FROM chats WHERE guest_id = ? AND folder_name = ?').get(ownerId, n));
            } else {
                return Boolean(db.prepare('SELECT 1 FROM chats WHERE user_id = ? AND folder_name = ?').get(ownerId, n));
            }
        } catch { return false; }
    };
    while (fs.existsSync(path.join(parentDir, name)) || existsInDb(name)) {
        name = `${baseName} (${i++})`;
    }
    return path.join(parentDir, name);
}

async function extractZip(zipPath, destDir) {
    ensureDir(destDir);
    // 1. Try system unzip (fastest, lowest memory overhead)
    try {
        await new Promise((resolve, reject) => {
            execFile('unzip', ['-o', '-q', zipPath, '-d', destDir], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        return;
    } catch (e) {
        console.warn('System unzip failed, falling back to node unzipper:', e.message);
    }
    // 2. Fallback to node stream unzipper
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
    try {
        fs.rmSync(dir, { recursive: true, force: true });
    } catch (e) {
        console.warn(`rmrf failed for ${dir}:`, e.message);
    }
}

// ── Merge chunks into final file with on-the-fly cleanup ──
async function mergeChunks({ chunkDir, totalChunks, finalFilePath }) {
    const writeStream = fs.createWriteStream(finalFilePath, { flags: 'w' });
    for (let i = 0; i < totalChunks; i++) {
        const chunkPath = path.join(chunkDir, `chunk_${i}`);
        if (!fs.existsSync(chunkPath)) {
            writeStream.close();
            throw new Error(`Upload incomplete: missing chunk ${i} of ${totalChunks}`);
        }
        await new Promise((resolve, reject) => {
            const readStream = fs.createReadStream(chunkPath);
            readStream.pipe(writeStream, { end: false });
            readStream.on('end', () => {
                try { fs.unlinkSync(chunkPath); } catch {}
                resolve();
            });
            readStream.on('error', (err) => {
                writeStream.close();
                reject(err);
            });
        });
    }
    await new Promise((resolve, reject) => {
        writeStream.end(resolve);
        writeStream.on('error', reject);
    });
    rmrf(chunkDir);
}

// ── Common Chat Finalizer (processes extracted or uploaded files) ──
async function finalizeChatImport({ sessionDir, finalFilePath, fileName, originalName, ownerId, guestId, req, res }) {
    const myDir = userDir(ownerId);
    let finalDir;
    let baseName;

    const isZip = (fileName || '').toLowerCase().endsWith('.zip');

    if (isZip && finalFilePath && fs.existsSync(finalFilePath)) {
        const extractDir = path.join(sessionDir, 'extracted');
        ensureDir(extractDir);
        await extractZip(finalFilePath, extractDir);
        try { fs.unlinkSync(finalFilePath); } catch {}
        flattenSingleSubfolder(extractDir);

        const chatFile = findChatFile(extractDir);
        if (!chatFile) {
            rmrf(sessionDir);
            return res.status(400).json({ error: 'No _chat.txt found inside zip' });
        }

        baseName = sanitizeChatName(path.basename(originalName || fileName, '.zip'));
        finalDir = uniqueChatDir(baseName, myDir, ownerId, !req.user);
        ensureDir(finalDir);
        moveAllFiles(extractDir, finalDir);
    } else {
        const filesDir = fs.existsSync(path.join(sessionDir, 'files')) ? path.join(sessionDir, 'files') : sessionDir;
        const chatFile = findChatFile(filesDir);
        if (!chatFile) {
            rmrf(sessionDir);
            return res.status(400).json({ error: 'No _chat.txt found in uploaded file(s)' });
        }
        const ext = path.extname(originalName || fileName || 'chat.txt');
        const folderName = path.basename(originalName || fileName || 'chat.txt', ext).trim() || `chat_${Date.now()}`;
        baseName = sanitizeChatName(folderName);
        finalDir = uniqueChatDir(baseName, myDir, ownerId, !req.user);
        ensureDir(finalDir);
        moveAllFiles(filesDir, finalDir);
    }

    rmrf(sessionDir);

    const folderName = path.basename(finalDir);
    let finalDisplayName = baseName;

    // Clean display name from common WhatsApp export prefixes/suffixes
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

    // Parse contact / group name, message count, participants
    try {
        const chatFilePath = findChatFile(finalDir);
        if (chatFilePath) {
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
            `INSERT INTO chats (user_id, folder_name, display_name, created_at, message_count, is_group, participants)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).run(req.user.id, folderName, finalDisplayName, Date.now(), message_count, is_group, JSON.stringify(participants));
    } else {
        const { recordGuestChatImport } = require('./guest');
        db.prepare(
            `INSERT INTO chats (user_id, guest_id, folder_name, display_name, created_at, message_count, is_group, participants)
             VALUES (0, ?, ?, ?, ?, ?, ?, ?)`
        ).run(guestId, folderName, finalDisplayName, Date.now(), message_count, is_group, JSON.stringify(participants));
        recordGuestChatImport(req, res);
    }

    return res.json({ ok: true, chat: folderName });
}

// ── Standard Monolithic Upload Handler ──
async function handleUpload(req, res) {
    try {
        const quota = checkUploadQuota(req, res);
        if (!quota.allowed) {
            if (req.uploadSessionId) rmrf(path.join(TMP_DIR, req.uploadSessionId));
            return res.status(quota.status).json(quota.body);
        }

        const files = req.files || [];
        if (!files.length) return res.status(400).json({ error: 'No files uploaded' });

        const sessionDir = path.join(TMP_DIR, req.uploadSessionId);
        const zipFile = files.find(f => f.originalname.toLowerCase().endsWith('.zip'));

        await finalizeChatImport({
            sessionDir,
            finalFilePath: zipFile ? zipFile.path : null,
            fileName: zipFile ? zipFile.originalname : files[0].originalname,
            originalName: zipFile ? zipFile.originalname : files[0].originalname,
            ownerId: quota.ownerId,
            guestId: quota.guestId,
            req,
            res
        });
    } catch (err) {
        console.error('Upload error:', err);
        if (req.uploadSessionId) rmrf(path.join(TMP_DIR, req.uploadSessionId));
        return res.status(500).json({ error: err.message || 'Upload failed' });
    }
}

// ── Chunk Handler ──
function handleChunk(req, res) {
    try {
        const uploadId = (req.query.uploadId || req.body.uploadId || '').replace(/[^a-zA-Z0-9_-]/g, '');
        const chunkIndex = parseInt(req.query.chunkIndex ?? req.body.chunkIndex, 10);

        if (!uploadId || isNaN(chunkIndex)) {
            return res.status(400).json({ error: 'Missing uploadId or chunkIndex' });
        }

        // Check quota on chunk 0 so unauthorized/over-quota uploads abort immediately
        if (chunkIndex === 0) {
            const quota = checkUploadQuota(req, res);
            if (!quota.allowed) {
                rmrf(path.join(TMP_DIR, uploadId));
                return res.status(quota.status).json(quota.body);
            }
        }

        return res.json({ ok: true, chunkIndex, received: true });
    } catch (err) {
        console.error('handleChunk error:', err);
        return res.status(500).json({ error: err.message || 'Chunk save failed' });
    }
}

// ── Chunk Complete Handler ──
async function handleChunkComplete(req, res) {
    const uploadId = (req.body.uploadId || req.query.uploadId || '').replace(/[^a-zA-Z0-9_-]/g, '');
    const totalChunks = parseInt(req.body.totalChunks || req.query.totalChunks, 10);
    const fileName = (req.body.fileName || 'whatsapp_chat.zip').replace(/[^a-zA-Z0-9._-]/g, '_');
    const originalName = req.body.originalName || fileName;

    if (!uploadId || isNaN(totalChunks) || totalChunks <= 0) {
        return res.status(400).json({ error: 'Invalid upload parameters' });
    }

    const sessionDir = path.join(TMP_DIR, uploadId);
    const chunkDir = path.join(sessionDir, 'chunks');

    if (!fs.existsSync(chunkDir)) {
        return res.status(400).json({ error: 'No chunks found for session' });
    }

    const quota = checkUploadQuota(req, res);
    if (!quota.allowed) {
        rmrf(sessionDir);
        return res.status(quota.status).json(quota.body);
    }

    try {
        const finalFilePath = path.join(sessionDir, fileName);
        await mergeChunks({ chunkDir, totalChunks, finalFilePath });

        await finalizeChatImport({
            sessionDir,
            finalFilePath,
            fileName,
            originalName,
            ownerId: quota.ownerId,
            guestId: quota.guestId,
            req,
            res
        });
    } catch (err) {
        console.error('Chunk complete error:', err);
        rmrf(sessionDir);
        return res.status(500).json({ error: err.message || 'Processing chat failed' });
    }
}

// ── Multi-file Handlers (for folder uploads) ──
function handleIndividualFile(req, res) {
    const uploadId = (req.query.uploadId || req.body.uploadId || '').replace(/[^a-zA-Z0-9_-]/g, '');
    const fileIndex = parseInt(req.query.fileIndex ?? req.body.fileIndex, 10);

    if (!uploadId) {
        return res.status(400).json({ error: 'Missing uploadId' });
    }

    if (fileIndex === 0) {
        const quota = checkUploadQuota(req, res);
        if (!quota.allowed) {
            rmrf(path.join(TMP_DIR, uploadId));
            return res.status(quota.status).json(quota.body);
        }
    }

    return res.json({ ok: true, received: true });
}

async function handleCompleteMultiFiles(req, res) {
    const uploadId = (req.body.uploadId || req.query.uploadId || '').replace(/[^a-zA-Z0-9_-]/g, '');
    const originalName = req.body.folderName || 'whatsapp_chat';

    if (!uploadId) {
        return res.status(400).json({ error: 'Invalid upload session' });
    }

    const sessionDir = path.join(TMP_DIR, uploadId);
    const quota = checkUploadQuota(req, res);
    if (!quota.allowed) {
        rmrf(sessionDir);
        return res.status(quota.status).json(quota.body);
    }

    try {
        await finalizeChatImport({
            sessionDir,
            finalFilePath: null,
            fileName: originalName,
            originalName,
            ownerId: quota.ownerId,
            guestId: quota.guestId,
            req,
            res
        });
    } catch (err) {
        console.error('Multi files complete error:', err);
        rmrf(sessionDir);
        return res.status(500).json({ error: err.message || 'Processing files failed' });
    }
}

module.exports = {
    upload,
    handleUpload,
    uploadChunk,
    handleChunk,
    handleChunkComplete,
    uploadIndividualFile,
    handleIndividualFile,
    handleCompleteMultiFiles,
    SRC_DIR,
    userDir,
};
