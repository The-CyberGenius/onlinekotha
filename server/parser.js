const fs = require('fs');
const path = require('path');
const readline = require('readline');

// iOS: [3/22/23, 4:51:35 PM] Sender Name: Message
const IOS_REGEX = /^\[(\d{1,2}\/\d{1,2}\/\d{2,4}),\s*(\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM|am|pm)?)\]\s*(.*?):\s*(.*)$/;

// Android: 3/22/23, 4:51 PM - Sender Name: Message
// Also handles: 3/22/23, 16:51 - Sender Name: Message (24-hour)
const ANDROID_REGEX = /^(\d{1,2}\/\d{1,2}\/\d{2,4}),\s*(\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM|am|pm)?)\s*-\s*(.*?):\s*(.*)$/;

// iOS attachment: <attached: filename.ext>
// Android attachment: filename.ext (file attached)
const IOS_ATTACH_REGEX = /<attached:\s*(.+?)>/;
const ANDROID_ATTACH_REGEX = /^(.+?)\s*\(file attached\)$/;

const MEDIA_EXT = {
    image: ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic'],
    video: ['.mp4', '.mov', '.avi', '.mkv', '.3gp'],
    audio: ['.m4a', '.opus', '.mp3', '.wav', '.ogg', '.aac'],
};

function classifyAttachment(filename) {
    const ext = path.extname(filename).toLowerCase();
    for (const [type, exts] of Object.entries(MEDIA_EXT)) {
        if (exts.includes(ext)) return type;
    }
    return 'document';
}

function detectFormat(line) {
    if (IOS_REGEX.test(line)) return 'ios';
    if (ANDROID_REGEX.test(line)) return 'android';
    return null;
}

function parseLine(line, format) {
    const regex = format === 'ios' ? IOS_REGEX : ANDROID_REGEX;
    const match = line.match(regex);
    if (!match) return null;

    const [, date, time, sender, rawText] = match;
    let text = rawText;
    let attachment = null;
    let type = 'text';

    const iosAttach = text.match(IOS_ATTACH_REGEX);
    const androidAttach = text.match(ANDROID_ATTACH_REGEX);

    if (iosAttach) {
        attachment = iosAttach[1].trim();
        text = '';
        type = classifyAttachment(attachment);
    } else if (androidAttach) {
        attachment = androidAttach[1].trim();
        text = '';
        type = classifyAttachment(attachment);
    }

    return {
        date,
        time,
        sender: sender.trim(),
        text,
        attachment,
        type,
    };
}

async function parseChatFile(chatFilePath) {
    const messages = [];
    const fileStream = fs.createReadStream(chatFilePath);
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

    let detectedFormat = null;
    let currentMessage = null;

    for await (const rawLine of rl) {
        const line = rawLine.replace(/[‎‏‪-‮]/g, '');

        if (!detectedFormat) {
            detectedFormat = detectFormat(line);
            if (!detectedFormat) continue;
        }

        const parsed = parseLine(line, detectedFormat);
        if (parsed) {
            if (currentMessage) messages.push(currentMessage);
            currentMessage = { id: messages.length, ...parsed };
        } else if (currentMessage && currentMessage.type === 'text') {
            currentMessage.text += '\n' + line;
        }
    }

    if (currentMessage) messages.push(currentMessage);

    return { messages, format: detectedFormat || 'unknown' };
}

function findChatFile(folderPath) {
    if (!fs.existsSync(folderPath)) return null;

    const direct = path.join(folderPath, '_chat.txt');
    if (fs.existsSync(direct)) return direct;

    const entries = fs.readdirSync(folderPath, { withFileTypes: true });
    for (const entry of entries) {
        if (entry.isFile() && /^.*chat.*\.txt$/i.test(entry.name)) {
            return path.join(folderPath, entry.name);
        }
    }

    for (const entry of entries) {
        if (entry.isDirectory()) {
            const found = findChatFile(path.join(folderPath, entry.name));
            if (found) return found;
        }
    }

    return null;
}

module.exports = {
    parseChatFile,
    findChatFile,
    classifyAttachment,
};
