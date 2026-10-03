const fs = require('fs');
const path = require('path');
const { db } = require('../server/db');
const { getMessages } = require('../server/cache');
const { SRC_DIR } = require('../server/upload');

async function run() {
    const chats = db.prepare('SELECT id, user_id, guest_id, folder_name FROM chats WHERE message_count = 0 OR message_count IS NULL').all();
    console.log(`Found ${chats.length} chats to backfill...`);
    
    let updated = 0;
    for (const chat of chats) {
        let ownerPrefix = chat.user_id !== 0 ? `u_${chat.user_id}` : `g_${chat.guest_id}`;
        const chatDir = path.join(SRC_DIR, ownerPrefix, chat.folder_name);
        
        try {
            if (fs.existsSync(chatDir)) {
                const parsed = await getMessages(chatDir);
                const count = parsed.messages ? parsed.messages.length : 0;
                const isGroup = parsed.isGroup ? 1 : 0;
                const participants = parsed.participants || [];
                
                if (count > 0) {
                    db.prepare('UPDATE chats SET message_count = ?, is_group = ?, participants = ? WHERE id = ?').run(
                        count, isGroup, JSON.stringify(participants), chat.id
                    );
                    updated++;
                    console.log(`Updated chat ${chat.id}: ${count} messages`);
                }
            } else {
                console.log(`Dir not found for chat ${chat.id} -> ${chatDir}`);
            }
        } catch (err) {
            console.error(`Error processing chat ${chat.id}:`, err.message);
        }
    }
    console.log(`Backfill complete. Updated ${updated} chats.`);
}

run();
