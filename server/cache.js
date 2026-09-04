const fs = require('fs');
const path = require('path');
const { parseChatFile, findChatFile } = require('./parser');

const CACHE_VERSION = 8;
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
                return { 
                    messages: cached.messages, 
                    cached: true, 
                    format: cached.format,
                    isGroup: cached.isGroup || false,
                    participants: cached.participants || []
                };
            }
        } catch {
            // fall through, will re-parse
        }
    }

    const { messages, format } = await parseChatFile(chatFile);

    const sendersCount = {};
    let totalMessages = 0;
    
    for (const m of messages) {
        if (m.type !== 'system' && m.sender) {
            sendersCount[m.sender] = (sendersCount[m.sender] || 0) + 1;
            totalMessages++;
        }
    }
    
    const sortedSenders = Object.keys(sendersCount).sort((a, b) => sendersCount[b] - sendersCount[a]);
    const dynamicThreshold = Math.max(5, totalMessages * 0.01);
    const realParticipants = sortedSenders.filter(s => sendersCount[s] >= dynamicThreshold);
    
    if (realParticipants.length === 0) realParticipants.push(...sortedSenders);

    let isGroup = realParticipants.length > 2;
    if (isGroup && sortedSenders.length >= 2) {
        const top2Messages = sendersCount[sortedSenders[0]] + sendersCount[sortedSenders[1]];
        if (top2Messages / Math.max(totalMessages, 1) > 0.95) {
            isGroup = false;
            realParticipants.length = 2; // Trim to top 2
            realParticipants[0] = sortedSenders[0];
            realParticipants[1] = sortedSenders[1];
        }
    }
    
    const participants = realParticipants;

    try {
        fs.writeFileSync(
            cachePath,
            JSON.stringify({
                version: CACHE_VERSION,
                sourceMtime: chatStat.mtimeMs,
                sourceSize: chatStat.size,
                format,
                isGroup,
                participants,
                messages,
            })
        );
    } catch (err) {
        console.warn('Cache write failed:', err.message);
    }

    return { messages, cached: false, format, isGroup, participants };
}

function invalidateCache(chatDir) {
    const cachePath = path.join(chatDir, CACHE_NAME);
    if (fs.existsSync(cachePath)) fs.unlinkSync(cachePath);
}

module.exports = { getMessages, invalidateCache };
