const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const { db } = require('../db');
const { requireUserOrGuest } = require('../auth');
const { getOrCreateGuestId } = require('../guest');
const { SRC_DIR } = require('../upload');

// Helper to get storage directory for either User or Guest
function getOwnerId(req, res) {
    if (req.user) {
        if (req.user.is_impersonating && req.user.guest_id) {
            return req.user.guest_id;
        }
        if (req.user.id > 0) return req.user.id;
    }
    return getOrCreateGuestId(req, res);
}

// Media: serve only the requesting user's files
router.get('/*rest', requireUserOrGuest, (req, res, next) => {
    const ownerId = getOwnerId(req, res);
    const rel = Array.isArray(req.params.rest)
        ? req.params.rest.join('/')
        : req.params.rest;

    if (!rel || rel.includes('..')) return res.status(400).end();

    const userBase = path.resolve(SRC_DIR, `u_${ownerId}`);
    const fullPath = path.resolve(userBase, rel);

    // Prevent prefix traversal (e.g. u_1 matching u_10)
    if (!fullPath.startsWith(userBase + path.sep) && fullPath !== userBase) {
        return res.status(403).end();
    }

    let finalFullPath = fullPath;
    if (!fs.existsSync(finalFullPath)) {
        // Fallback 1: Admin or Admin Impersonating has access across any user folder
        if (req.user && (req.user.is_admin || req.user.original_admin_id)) {
            const relParts = rel.split('/');
            const chatFolder = relParts[0];
            const fileName = relParts.slice(1).join('/');
            if (fs.existsSync(SRC_DIR)) {
                const subdirs = fs.readdirSync(SRC_DIR, { withFileTypes: true }).filter(d => d.isDirectory() && (d.name.startsWith('u_') || d.name.startsWith('gst_')));
                for (const sd of subdirs) {
                    const cand = path.join(SRC_DIR, sd.name, chatFolder, fileName);
                    if (fs.existsSync(cand)) {
                        finalFullPath = cand;
                        break;
                    }
                }
            }
        } else {
            // Fallback 2: Check if chat belongs to this user or guest in the DB
            try {
                const relParts = rel.split('/');
                const chatFolder = relParts[0];
                const fileName = relParts.slice(1).join('/');
                const dbChat = db.prepare('SELECT user_id, guest_id FROM chats WHERE (guest_id = ? OR user_id = ?) AND folder_name = ?').get(ownerId, typeof ownerId === 'number' ? ownerId : 0, chatFolder);
                if (dbChat) {
                    if (dbChat.user_id && dbChat.user_id > 0) {
                        const cand = path.join(SRC_DIR, `u_${dbChat.user_id}`, chatFolder, fileName);
                        if (fs.existsSync(cand)) finalFullPath = cand;
                    }
                    if (!fs.existsSync(finalFullPath) && dbChat.guest_id) {
                        const cand = path.join(SRC_DIR, `u_${dbChat.guest_id}`, chatFolder, fileName);
                        if (fs.existsSync(cand)) finalFullPath = cand;
                    }
                }
            } catch (e) {}
        }
    }

    if (!fs.existsSync(finalFullPath)) return res.status(404).end();

    const ext = path.extname(finalFullPath).toLowerCase();
    const MIME_MAP = {
        '.mp4': 'video/mp4', '.mov': 'video/mp4', '.m4v': 'video/mp4',
        '.webm': 'video/webm', '.3gp': 'video/3gpp',
        '.mkv': 'video/x-matroska', '.avi': 'video/x-msvideo',
        '.m4a': 'audio/mp4', '.aac': 'audio/aac',
        '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg',
        '.opus': 'audio/ogg; codecs=opus', '.wav': 'audio/wav',
        '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
        '.png': 'image/png', '.gif': 'image/gif',
        '.webp': 'image/webp', '.heic': 'image/heic',
        '.svg': 'image/svg+xml', '.svgz': 'image/svg+xml',
    };

    const mime = MIME_MAP[ext];
    const isVideo = mime && mime.startsWith('video/');

    if (isVideo) {
        const stat = fs.statSync(finalFullPath);
        const fileSize = stat.size;
        const rangeHeader = req.headers.range;

        if (rangeHeader) {
            const parts = rangeHeader.replace(/bytes=/, '').split('-');
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : Math.min(start + 10 * 1024 * 1024 - 1, fileSize - 1);
            const chunkSize = end - start + 1;
            res.writeHead(206, {
                'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunkSize,
                'Content-Type': mime,
            });
            fs.createReadStream(finalFullPath, { start, end }).pipe(res);
        } else {
            res.writeHead(200, {
                'Content-Length': fileSize,
                'Content-Type': mime,
                'Accept-Ranges': 'bytes',
            });
            fs.createReadStream(finalFullPath).pipe(res);
        }
        return;
    }

    if (mime) res.setHeader('Content-Type', mime);
    res.sendFile(finalFullPath);
});


const multer = require('multer');
const crypto = require('crypto');

const MEDIA_DIR = path.join(__dirname, '..', '..', 'data', 'chat_media');
if (!fs.existsSync(MEDIA_DIR)) {
    fs.mkdirSync(MEDIA_DIR, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, MEDIA_DIR),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        const rand = crypto.randomBytes(8).toString('hex');
        cb(null, `media_${Date.now()}_${rand}${ext}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) return cb(new Error('Only images allowed'));
        cb(null, true);
    }
});

router.post('/chat-upload', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    res.json({ url: `/api/media/chat-view/${req.file.filename}` });
});

router.get('/chat-view/:filename', (req, res) => {
    const filename = req.params.filename;
    if (!/^[a-zA-Z0-9_\-\.]+$/.test(filename) || filename.includes('..')) {
        return res.status(400).json({ error: 'Invalid filename' });
    }
    const filePath = path.join(MEDIA_DIR, filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Not found' });
    res.sendFile(filePath);
});

module.exports = router;
