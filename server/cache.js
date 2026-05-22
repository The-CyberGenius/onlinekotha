const fs = require('fs');
const path = require('path');
const { parseChatFile, findChatFile } = require('./parser');

const CACHE_VERSION = 2;
const CACHE_NAME = '_chat.cache.json';

async function getMessages(chatDir) {
    const chatFile = findChatFile(chatDir);
    if (!chatFile) {
        const err = new Error('Chat file not found');
        err.code = 'NO_CHAT_FILE';
        throw err;
    }

    const cachePath = path.join(chatDir, CACHE_NAME);
    const chatStat = fs.statSync(chatFile);

    if (fs.existsSync(cachePath)) {
        try {
            const cached = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
            if (
                cached.version === CACHE_VERSION &&
                cached.sourceMtime === chatStat.mtimeMs &&
                cached.sourceSize === chatStat.size &&
                Array.isArray(cached.messages)
            ) {
                return { messages: cached.messages, cached: true, format: cached.format };
            }
        } catch {
            // fall through, will re-parse
        }
    }

    const { messages, format } = await parseChatFile(chatFile);

    try {
        fs.writeFileSync(
            cachePath,
            JSON.stringify({
                version: CACHE_VERSION,
                sourceMtime: chatStat.mtimeMs,
                sourceSize: chatStat.size,
                format,
                messages,
            })
        );
    } catch (err) {
        console.warn('Cache write failed:', err.message);
    }

    return { messages, cached: false, format };
}

function invalidateCache(chatDir) {
    const cachePath = path.join(chatDir, CACHE_NAME);
    if (fs.existsSync(cachePath)) fs.unlinkSync(cachePath);
}

module.exports = { getMessages, invalidateCache };
