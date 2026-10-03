const { db } = require('./server/db');
const { SRC_DIR } = require('./server/upload');
const fs = require('fs');
const path = require('path');
function getFolderSize(dirPath) {
    let totalSize = 0;
    try {
        if (!fs.existsSync(dirPath)) return 0;
        const stat = fs.statSync(dirPath);
        if (!stat.isDirectory()) {
            return stat.size;
        }
        const files = fs.readdirSync(dirPath, { withFileTypes: true });
        for (const file of files) {
            const fullPath = path.join(dirPath, file.name);
            if (file.isDirectory()) {
                totalSize += getFolderSize(fullPath);
            } else {
                try { totalSize += fs.statSync(fullPath).size; } catch (e) {}
            }
        }
    } catch(err) {}
    return totalSize;
}
console.time('Total getFolderSize');
const chats = db.prepare('SELECT id, user_id, folder_name FROM chats').all();
for (const chat of chats) {
    const chatDir = path.join(SRC_DIR, `u_${chat.user_id}`, chat.folder_name);
    getFolderSize(chatDir);
}
console.timeEnd('Total getFolderSize');
