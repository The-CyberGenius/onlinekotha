const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Robust Date and Time matching to support various WhatsApp formats
const DATE_PAT = `\\d{1,4}[\\/\\-\\.]\\d{1,2}[\\/\\-\\.]\\d{1,4}`;
const TIME_PAT = `\\d{1,2}:\\d{2}(?::\\d{2})?\\s*(?:[APap][\\.\\s]*[Mm]\\.?)?`;

// iOS: [3/22/23, 4:51:35 PM] Sender Name: Message
const IOS_REGEX = new RegExp(`^\\[(${DATE_PAT})[,\\s]+(${TIME_PAT})\\]\\s*(.*?):\\s*(.*)$`);

// Web/Desktop: [16:51, 3/22/23] Sender Name: Message
const WEB_REGEX = new RegExp(`^\\[(${TIME_PAT})[,\\s]+(${DATE_PAT})\\]\\s*(.*?):\\s*(.*)$`);

// Android: 3/22/23, 4:51 PM - Sender Name: Message
const ANDROID_REGEX = new RegExp(`^(${DATE_PAT})[,\\s]+(${TIME_PAT})\\s*-\\s*(.*?):\\s*(.*)$`);

// Desktop/Alternative: 2024-08-07 18:59 Sender Name: Message
// Also supports: 2024-08-07 18:59 - Sender Name: Message
const DESKTOP_REGEX = new RegExp(`^(${DATE_PAT})[,\\s]+(${TIME_PAT})[\\s\\-]*([^:]+):\\s*(.*)$`);

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
    if (WEB_REGEX.test(line)) return 'web';
    if (DESKTOP_REGEX.test(line)) return 'desktop';
    return null;
}

function parseLine(line, format) {
    let regex = IOS_REGEX;
    if (format === 'android') regex = ANDROID_REGEX;
    else if (format === 'web') regex = WEB_REGEX;
    else if (format === 'desktop') regex = DESKTOP_REGEX;

    const match = line.match(regex);
    if (!match) return null;

    let date, time, sender, rawText;
    if (format === 'web') {
        time = match[1];
        date = match[2];
        sender = match[3];
        rawText = match[4];
    } else {
        date = match[1];
        time = match[2];
        sender = match[3];
        rawText = match[4];
    }
    
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
        // Remove left-to-right marks and other invisible chars that break regex
        const line = rawLine.replace(/[\u200E\u200F\u202A\u202B\u202C\u202D\u202E]/g, '').replace(/[\u202F\u00A0]/g, ' ');

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

    // Fallback: just return the first .txt file found
    for (const entry of entries) {
        if (entry.isFile() && entry.name.toLowerCase().endsWith('.txt')) {
            return path.join(folderPath, entry.name);
        }
    }

    return null;
}

module.exports = {
    parseChatFile,
    findChatFile,
    classifyAttachment,
};
