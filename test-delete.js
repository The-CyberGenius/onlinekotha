const { db } = require('./server/db');
const { SRC_DIR } = require('./server/upload');
const fs = require('fs');
const path = require('path');
const userId = 1386; // Vasanth & Alex
const chatId = 280; // Assuming 280 is a chat
// Check if chat exists
const chat = db.prepare('SELECT * FROM chats WHERE user_id = ?').get(userId);
console.log('Chat:', chat);
if (chat) {
    const chatDir = path.join(SRC_DIR, `u_${userId}`, chat.folder_name);
    console.log('Exists on disk?', fs.existsSync(chatDir));
}
