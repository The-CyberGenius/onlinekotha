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
    if (req.user) {
        if (req.user.is_impersonating && req.user.guest_id) {
            return req.user.guest_id;
        }
        if (req.user.id > 0) return req.user.id;
    }
    return getOrCreateGuestId(req, res);
}

router.get('/chats', requireUserOrGuest, (req, res) => {
    const ownerId = getOwnerId(req, res);
    const myDir = userDir(ownerId);
    
    let deletedSet = new Set();
    let dbChats = [];
    if (req.user && (!req.user.is_impersonating || !req.user.guest_id)) {
        dbChats = db.prepare('SELECT folder_name, created_at, deleted_by_user, user_id FROM chats WHERE user_id = ?').all(req.user.id);
        const deletedRows = dbChats.filter(r => r.deleted_by_user === 1);
        deletedSet = new Set(deletedRows.map(r => r.folder_name));
    } else {
        dbChats = db.prepare('SELECT folder_name, created_at, deleted_by_user, user_id FROM chats WHERE guest_id = ?').all(ownerId);
        const deletedRows = dbChats.filter(r => r.deleted_by_user === 1);
        deletedSet = new Set(deletedRows.map(r => r.folder_name));
    }
    
    const timeMap = {};
    for (const r of dbChats) timeMap[r.folder_name] = r.created_at || 0;

    const foldersSet = new Set();
    const { SRC_DIR } = require('../upload');

    // 1. Check user/guest directory on disk
    if (fs.existsSync(myDir)) {
        fs.readdirSync(myDir, { withFileTypes: true })
            .filter(d => d.isDirectory())
            .forEach(d => {
                const dir = path.join(myDir, d.name);
                if (findChatFile(dir)) foldersSet.add(d.name);
            });
    }

    // 2. Cross-reference with DB records (finds claimed chats, moved chats, or fallback dirs)
    for (const r of dbChats) {
        if (!r.folder_name || foldersSet.has(r.folder_name)) continue;
        const primaryDir = path.join(myDir, r.folder_name);
        if (findChatFile(primaryDir)) {
            foldersSet.add(r.folder_name);
            continue;
        }
        if (r.user_id && r.user_id > 0) {
            const claimedDir = path.join(SRC_DIR, `u_${r.user_id}`, r.folder_name);
            if (findChatFile(claimedDir)) {
                foldersSet.add(r.folder_name);
                continue;
            }
        }
        if (fs.existsSync(SRC_DIR)) {
            const subdirs = fs.readdirSync(SRC_DIR, { withFileTypes: true }).filter(d => d.isDirectory() && (d.name.startsWith('u_') || d.name.startsWith('gst_')));
            for (const sd of subdirs) {
                const cand = path.join(SRC_DIR, sd.name, r.folder_name);
                if (findChatFile(cand)) {
                    foldersSet.add(r.folder_name);
                    break;
                }
            }
        }
    }

    const folders = Array.from(foldersSet)
        .filter(name => {
            if (req.user && !req.user.is_impersonating && deletedSet.has(name)) return false;
            return true;
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
    if (req.user && (!req.user.is_impersonating || !req.user.guest_id)) {
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
        let dispName = (r.display_name || '').trim();
        if (!dispName || /^(chat|whatsapp[\s_-]*chat)[\s_-]*\d*$/i.test(dispName)) {
            if (parts.length >= 2) {
                dispName = `${parts[0]} & ${parts[1]}`;
            } else if (parts.length === 1) {
                dispName = parts[0];
            }
        }
        map[r.folder_name] = {
            display_name: dispName,
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

    let finalChatDir = chatDir;
    if (!fs.existsSync(finalChatDir)) {
        const { SRC_DIR } = require('../upload');
        try {
            const dbChat = db.prepare('SELECT user_id, guest_id FROM chats WHERE (guest_id = ? OR user_id = ?) AND folder_name = ?').get(ownerId, typeof ownerId === 'number' ? ownerId : 0, chatName);
            if (dbChat) {
                if (dbChat.user_id && dbChat.user_id > 0) {
                    const userCand = path.join(SRC_DIR, `u_${dbChat.user_id}`, chatName);
                    if (fs.existsSync(userCand)) finalChatDir = userCand;
                }
                if (!fs.existsSync(finalChatDir) && dbChat.guest_id) {
                    const guestCand = path.join(SRC_DIR, `u_${dbChat.guest_id}`, chatName);
                    if (fs.existsSync(guestCand)) finalChatDir = guestCand;
                }
            }
        } catch(e) {}

        if (!fs.existsSync(finalChatDir) && fs.existsSync(SRC_DIR)) {
            const subdirs = fs.readdirSync(SRC_DIR, { withFileTypes: true }).filter(d => d.isDirectory() && (d.name.startsWith('u_') || d.name.startsWith('gst_')));
            for (const sd of subdirs) {
                const cand = path.join(SRC_DIR, sd.name, chatName);
                if (fs.existsSync(cand)) {
                    finalChatDir = cand;
                    break;
                }
            }
        }
    }

    try {
        const result = await getMessages(finalChatDir);
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
