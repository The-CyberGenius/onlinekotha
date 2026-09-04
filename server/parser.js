const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Robust Date and Time matching to support various WhatsApp formats
const DATE_PAT = `\\d{1,4}[\\/\\-\\.]\\d{1,2}[\\/\\-\\.]\\d{1,4}`;
const TIME_PAT = `\\d{1,2}:\\d{2}(?::\\d{2})?\\s*(?:(?:AM|PM|am|pm|a\\.m\\.|p\\.m\\.|A\\.M\\.|P\\.M\\.)\\b)?`;

// Bracketed: [16:51, 3/22/23] or [3/22/23, 4:51 PM]
const BRACKET_REGEX = new RegExp(`^\\[([^\\]]+)\\]\\s*([^:]+?)(?:\\s*:\\s*(.*))?$`);

// Standard: 3/22/23, 4:51 PM - Sender: Message OR 2024-08-07 20:02 Sender: Message
const STANDARD_REGEX = new RegExp(`^(${DATE_PAT})[,\\s]+(${TIME_PAT})[\\s\\-]*([^:]+?)(?:\\s*:\\s*(.*))?$`);

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
    if (BRACKET_REGEX.test(line)) return 'bracket';
    if (STANDARD_REGEX.test(line)) return 'standard';
    return null;
}

function parseLine(line, format) {
    const regex = format === 'bracket' ? BRACKET_REGEX : STANDARD_REGEX;
    const match = line.match(regex);
    if (!match) return null;

    let date, time, sender, rawText;
    
    if (format === 'bracket') {
        const dtParts = match[1].split(',');
        if (dtParts.length === 2) {
            const p1 = dtParts[0].trim();
            const p2 = dtParts[1].trim();
            if (p1.includes(':')) { time = p1; date = p2; }
            else { date = p1; time = p2; }
        } else {
            date = match[1]; time = '';
        }
        sender = match[2];
        rawText = match[3];
    } else {
        date = match[1];
        time = match[2].trim();
        sender = match[3];
        rawText = match[4];
    }

    let text = rawText || '';
    let type = 'text';
    
    // If rawText is undefined, it means there was no colon (it's a system message)
    if (rawText === undefined) {
        text = sender.trim();
        sender = 'system';
        type = 'system';
    }
    
    let attachment = null;

    if (type !== 'system') {
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

    // Normalize dates across the entire chat to YYYY-MM-DD
    let isUSFormat = false; // MM/DD/YY
    for (const msg of messages) {
        if (!msg.date) continue;
        const parts = msg.date.split(/[\/\-\.]/);
        if (parts.length === 3) {
            if (parts[0].length === 4) continue; // Already YYYY-MM-DD
            const p0 = parseInt(parts[0]);
            const p1 = parseInt(parts[1]);
            if (p0 > 12 && p1 <= 12) {
                isUSFormat = false;
                break;
            } else if (p1 > 12 && p0 <= 12) {
                isUSFormat = true;
                break;
            }
        }
    }

    for (const msg of messages) {
        if (!msg.date) continue;
        const parts = msg.date.split(/[\/\-\.]/);
        if (parts.length === 3) {
            if (parts[0].length === 4) {
                // It's already YYYY-MM-DD, just ensure dashes
                msg.date = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
                continue;
            }
            
            let day, month;
            if (isUSFormat) {
                month = parseInt(parts[0]);
                day = parseInt(parts[1]);
            } else {
                day = parseInt(parts[0]);
                month = parseInt(parts[1]);
            }
            let yearStr = parts[2].replace(/\D/g, ''); // strip any non-digits
            let year = yearStr.length === 2 ? 2000 + parseInt(yearStr) : parseInt(yearStr);
            const dd = String(day).padStart(2, '0');
            const mm = String(month).padStart(2, '0');
            msg.date = `${year}-${mm}-${dd}`;
        }
    }

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
