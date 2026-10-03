const { db } = require('./server/db');
const { SRC_DIR } = require('./server/upload');
const fs = require('fs');
const path = require('path');
function getFolderSize(dirPath) {
    let totalSize = 0;
    try {
        if (!fs.existsSync(dirPath)) return 0;
        const stat = fs.statSync(dirPath);
        if (!stat.isDirectory()) { return stat.size; }
        const files = fs.readdirSync(dirPath, { withFileTypes: true });
        for (const file of files) {
            const fullPath = path.join(dirPath, file.name);
            if (file.isDirectory()) { totalSize += getFolderSize(fullPath); } 
            else { try { totalSize += fs.statSync(fullPath).size; } catch (e) {} }
        }
    } catch(err) { console.error('getFolderSize error:', err.message); }
    return totalSize;
}
const userId = 1382;
try {
    const chats = db.prepare('SELECT id, folder_name, display_name, message_count, created_at, deleted_by_user FROM chats WHERE user_id = ? ORDER BY created_at DESC').all(userId);
    const chatsWithSize = chats.map(chat => {
        const chatDir = path.join(SRC_DIR, `u_${userId}`, chat.folder_name);
        chat.size_bytes = getFolderSize(chatDir);
        return chat;
    });
    console.log(JSON.stringify(chatsWithSize, null, 2));
} catch(e) {
    console.error(e);
}
