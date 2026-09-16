const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const { db } = require('../db');
const { requireUser, requireUserOrGuest } = require('../auth');
const { getOrCreateGuestId } = require('../guest');
const { getMessages } = require('../cache');
const { userDir } = require('../upload');
const { findChatFile } = require('../parser');

// Helper to get storage directory for either User or Guest
function getOwnerId(req, res) {
    if (req.user) return req.user.id;
    return getOrCreateGuestId(req, res);
}

router.get('/chats', requireUserOrGuest, (req, res) => {
    const ownerId = getOwnerId(req, res);
    const myDir = userDir(ownerId);
    if (!fs.existsSync(myDir)) return res.json([]);
    
    let deletedSet = new Set();
    let dbChats = [];
    if (req.user) {
        dbChats = db.prepare('SELECT folder_name, created_at, deleted_by_user FROM chats WHERE user_id = ?').all(req.user.id);
        const deletedRows = dbChats.filter(r => r.deleted_by_user === 1);
        deletedSet = new Set(deletedRows.map(r => r.folder_name));
    } else {
        dbChats = db.prepare('SELECT folder_name, created_at FROM chats WHERE guest_id = ?').all(ownerId);
    }
    
    const timeMap = {};
    for (const r of dbChats) timeMap[r.folder_name] = r.created_at || 0;

    const folders = fs
        .readdirSync(myDir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name)
        .filter(name => {
            if (req.user && !req.user.is_impersonating && deletedSet.has(name)) return false;
            const dir = path.join(myDir, name);
            return !!findChatFile(dir);
        })
        .sort((a, b) => {
            const timeA = timeMap[a] || 0;
            const timeB = timeMap[b] || 0;
            return timeA - timeB; // Oldest first
        });
    res.json(folders);
});

router.get('/chats/meta', requireUserOrGuest, (req, res) => {
    const ownerId = getOwnerId(req, res);
    let rows = [];
    if (req.user) {
        rows = db.prepare('SELECT folder_name, display_name, deleted_by_user, message_count, is_group, participants FROM chats WHERE user_id = ?').all(req.user.id);
    } else {
        rows = db.prepare('SELECT folder_name, display_name, message_count, is_group, participants FROM chats WHERE guest_id = ?').all(ownerId);
    }
    const map = {};
    for (const r of rows) {
        let parts = [];
        if (r.participants) {
            try { parts = JSON.parse(r.participants); } catch(e){}
        }
        map[r.folder_name] = {
            display_name: r.display_name || '',
            deleted_by_user: r.deleted_by_user || 0,
            message_count: r.message_count || 0,
            is_group: r.is_group || 0,
            participants: parts
        };
    }
    res.json(map);
});

router.get('/messages', requireUserOrGuest, async (req, res) => {
    const chatName = req.query.chat;
    if (!chatName) return res.status(400).json({ error: 'No chat specified' });

    const ownerId = getOwnerId(req, res);
    const myDir = userDir(ownerId);
    const chatDir = path.join(myDir, chatName);
    if (!path.normalize(chatDir).startsWith(myDir)) {
        return res.status(403).json({ error: 'Invalid path' });
    }

    try {
        const result = await getMessages(chatDir);
        res.json(result.messages);
    } catch (err) {
        if (err.code === 'NO_CHAT_FILE') return res.status(404).json({ error: 'Chat file not found' });
        console.error('Messages error:', err);
        res.status(500).json({ error: err.message });
    }
});

router.delete('/chats/:name', requireUser, (req, res) => {
    const myDir = userDir(req.user.id);
    const chatDir = path.join(myDir, req.params.name);
    if (!path.normalize(chatDir).startsWith(myDir)) return res.status(403).json({ error: 'Invalid path' });
    if (!fs.existsSync(chatDir)) return res.status(404).json({ error: 'Chat not found' });
    // Soft delete — mark as deleted so admin still has access
    db.prepare('UPDATE chats SET deleted_by_user = 1 WHERE user_id = ? AND folder_name = ?')
        .run(req.user.id, req.params.name);
    res.json({ ok: true });
});

router.put('/chats/:name/rename', requireUser, (req, res) => {
    const { newName } = req.body || {};
    if (!newName || !newName.trim()) return res.status(400).json({ error: 'newName is required' });
    const cleanName = newName.trim();
    
    const existing = db.prepare('SELECT id FROM chats WHERE user_id = ? AND folder_name = ?').get(req.user.id, req.params.name);
    if (existing) {
        db.prepare('UPDATE chats SET display_name = ? WHERE user_id = ? AND folder_name = ?')
            .run(cleanName, req.user.id, req.params.name);
    } else {
        db.prepare('INSERT INTO chats (user_id, folder_name, display_name, created_at) VALUES (?, ?, ?, ?)')
            .run(req.user.id, req.params.name, cleanName, Date.now());
    }
    res.json({ ok: true, display_name: cleanName });
});

module.exports = router;
