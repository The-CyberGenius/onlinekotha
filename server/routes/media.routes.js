const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const { requireUserOrGuest } = require('../auth');
const { getOrCreateGuestId } = require('../guest');
const { SRC_DIR } = require('../upload');

// Helper to get storage directory for either User or Guest
function getOwnerId(req, res) {
    if (req.user) return req.user.id;
    return getOrCreateGuestId(req, res);
}

// Media: serve only the requesting user's files
router.get('/*rest', requireUserOrGuest, (req, res, next) => {
    const ownerId = getOwnerId(req, res);
    const rel = Array.isArray(req.params.rest)
        ? req.params.rest.join('/')
        : req.params.rest;
    const userRel = `u_${ownerId}/${rel}`;
    const fullPath = path.resolve(SRC_DIR, userRel);

    const userBase = path.resolve(SRC_DIR, `u_${ownerId}`);
    if (!fullPath.startsWith(userBase)) return res.status(403).end();

    if (!fs.existsSync(fullPath)) return res.status(404).end();

    const ext = path.extname(fullPath).toLowerCase();
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
        const stat = fs.statSync(fullPath);
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
            fs.createReadStream(fullPath, { start, end }).pipe(res);
        } else {
            res.writeHead(200, {
                'Content-Length': fileSize,
                'Content-Type': mime,
                'Accept-Ranges': 'bytes',
            });
            fs.createReadStream(fullPath).pipe(res);
        }
        return;
    }

    if (mime) res.setHeader('Content-Type', mime);
    res.sendFile(fullPath);
});

module.exports = router;
