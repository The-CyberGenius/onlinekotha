const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Robust Date and Time matching to support various WhatsApp formats across all languages (English, Chinese, Spanish, Japanese, Korean, Arabic, etc.)
const MERIDIAN_WORDS = 'AM|PM|am|pm|a\\.m\\.|p\\.m\\.|A\\.M\\.|P\\.M\\.|上午|下午|中午|晚上|早上|凌晨|午夜|午前|午後|오전|오후|ص|م';
const DATE_PAT = `\\d{1,4}[\\/\\-\\.]\\d{1,2}[\\/\\-\\.]\\d{1,4}`;
const TIME_PAT = `(?:(?:${MERIDIAN_WORDS})\\s*)?\\d{1,2}:\\d{2}(?::\\d{2})?(?:\\s*(?:${MERIDIAN_WORDS}))?`;

// Bracketed: [16:51, 3/22/23] or [3/22/23, 4:51 PM] or [2026/7/17 下午5:43:00]
const BRACKET_REGEX = new RegExp(`^\\[([^\\]]+)\\]\\s*([^:]+?)(?:\\s*:\\s*(.*))?$`);

// Standard: 3/22/23, 4:51 PM - Sender: Message OR 2026/7/17 下午5:43 - Sender: Message
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

function normalizeTime(rawTime) {
    if (!rawTime) return '';
    let t = rawTime.trim();

    // Check Chinese / East Asian / Latin prefixes
    const prefixMatch = t.match(/^(上午|早上|凌晨|午夜|中午|下午|晚上|午前|午後|오전|오후|AM|PM|am|pm)\s*(\d{1,2}:\d{2}(?::\d{2})?)/i);
    if (prefixMatch) {
        const pfx = prefixMatch[1];
        const pfxLow = pfx.toLowerCase();
        const timeDigits = prefixMatch[2];
        const isPM = ['下午', '晚上', '中午', '午後', '오후', 'pm'].includes(pfxLow) || ['下午', '晚上', '中午', '午後', '오후'].includes(pfx);
        const parts = timeDigits.split(':');
        let h = parseInt(parts[0], 10);
        const m = parts[1];
        const s = parts[2] ? ':' + parts[2] : '';

        if (pfx === '中午') {
            return `${h}:${m}${s} PM`;
        } else if (pfx === '午夜' || pfx === '凌晨') {
            if (h === 12) h = 0;
            return `${h === 0 ? 12 : h}:${m}${s} AM`;
        } else if (isPM) {
            return `${h}:${m}${s} PM`;
        } else {
            return `${h}:${m}${s} AM`;
        }
    }

    // Check Chinese / East Asian suffixes
    const suffixMatch = t.match(/^(\d{1,2}:\d{2}(?::\d{2})?)\s*(上午|早上|凌晨|午夜|中午|下午|晚上|午前|午後|오전|오후)/);
    if (suffixMatch) {
        const timeDigits = suffixMatch[1];
        const sfx = suffixMatch[2];
        const isPM = ['下午', '晚上', '中午', '午後', '오후'].includes(sfx);
        const parts = timeDigits.split(':');
        let h = parseInt(parts[0], 10);
        const m = parts[1];
        const s = parts[2] ? ':' + parts[2] : '';
        return `${h}:${m}${s} ${isPM ? 'PM' : 'AM'}`;
    }

    return t;
}

function parseLine(line, format) {
    const regex = format === 'bracket' ? BRACKET_REGEX : STANDARD_REGEX;
    const match = line.match(regex);
    if (!match) return null;

    let date, time, sender, rawText;
    
    if (format === 'bracket') {
        const inside = match[1].trim();
        // Extract time pattern: e.g. 23:18:22 or 4:51 PM or 下午5:43
        const timeMatch = inside.match(new RegExp(`(?:(?:${MERIDIAN_WORDS})\\s*)?\\d{1,2}:\\d{2}(?::\\d{2})?(?:\\s*(?:${MERIDIAN_WORDS}))?`));
        if (timeMatch) {
            time = normalizeTime(timeMatch[0].trim());
            date = inside.replace(timeMatch[0], '')
                         .replace(/^[\s\,\@à\–\—\-]+|[\s\,\@à\–\—\-]+$/g, '')
                         .trim();
        } else {
            const dtParts = inside.split(',');
            if (dtParts.length === 2) {
                const p1 = dtParts[0].trim();
                const p2 = dtParts[1].trim();
                if (p1.includes(':')) { time = normalizeTime(p1); date = p2; }
                else { date = p1; time = normalizeTime(p2); }
            } else {
                date = inside;
                time = '';
            }
        }
        sender = match[2];
        rawText = match[3];
    } else {
        date = match[1];
        time = normalizeTime(match[2].trim());
        sender = match[3];
        rawText = match[4];
    }

    let text = rawText || '';
    let type = 'text';

    // Normalize international "Media omitted" tags
    if (text.includes('<省略影音内容>') || text.includes('<已省略媒體>') || text.includes('<省略媒體>') ||
        /<(?:Multimedia omitido|archivo omitido|Arquivo de mídia oculto|mídia omitida|Médias omis|Medien weggelassen|Medien ausgelassen|File multimediale omesso|Без медиафайлов|Media tidak disertakan)>/i.test(text)) {
        text = text.replace(/<省略影音内容>|<已省略媒體>|<省略媒體>|<(?:Multimedia omitido|archivo omitido|Arquivo de mídia oculto|mídia omitida|Médias omis|Medien weggelassen|Medien ausgelassen|File multimediale omesso|Без медиафайлов|Media tidak disertakan)>/gi, '<Media omitted>');
    }

    // Normalize international "This message was edited" tags
    if (text.includes('<这条消息已经过编辑>') || text.includes('<這條訊息已編輯>') ||
        /<(?:Este mensaje fue editado|Esta mensagem foi editada|Ce message a été modifié|Diese Nachricht wurde bearbeitet|Questo messaggio è stato modificato|Сообщение изменено|Pesan ini telah diedit)>/i.test(text)) {
        text = text.replace(/<这条消息已经过编辑>|<這條訊息已編輯>|<(?:Este mensaje fue editado|Esta mensagem foi editada|Ce message a été modifié|Diese Nachricht wurde bearbeitet|Questo messaggio è stato modificato|Сообщение изменено|Pesan ini telah diedit)>/gi, '<This message was edited>');
    }
    
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
    let ambiguous = true;
    for (const msg of messages) {
        if (!msg.date) continue;
        const parts = msg.date.split(/[\/\-\.]/);
        if (parts.length === 3) {
            if (parts[0].length === 4) continue; // Already YYYY-MM-DD
            const p0 = parseInt(parts[0]);
            const p1 = parseInt(parts[1]);
            if (p0 > 12 && p1 <= 12) {
                isUSFormat = false;
                ambiguous = false;
                break;
            } else if (p1 > 12 && p0 <= 12) {
                isUSFormat = true;
                ambiguous = false;
                break;
            }
        }
    }

    if (ambiguous) {
        let p0s = new Set();
        let p1s = new Set();
        let sampleParts = null;
        
        for (const msg of messages) {
            if (!msg.date) continue;
            const parts = msg.date.split(/[\/\-\.]/);
            if (parts.length === 3 && parts[0].length !== 4) {
                p0s.add(parts[0]);
                p1s.add(parts[1]);
                if (!sampleParts) sampleParts = parts;
            }
        }

        if (p0s.size > p1s.size) {
            isUSFormat = false; // p0 changes more, so p0 is day
        } else if (p1s.size > p0s.size) {
            isUSFormat = true; // p1 changes more, so p1 is day
        } else if (sampleParts) {
            // Check if one interpretation results in a future date
            const p0 = parseInt(sampleParts[0]);
            const p1 = parseInt(sampleParts[1]);
            let yearStr = sampleParts[2].replace(/\D/g, '');
            let year = yearStr.length === 2 ? 2000 + parseInt(yearStr) : parseInt(yearStr);
            
            const now = new Date();
            const dateIfUS = new Date(year, p0 - 1, p1); // MM/DD
            const dateIfNotUS = new Date(year, p1 - 1, p0); // DD/MM
            
            if (dateIfNotUS > now && dateIfUS <= now) {
                isUSFormat = true; // DD/MM is impossible (future), so it must be MM/DD
            } else if (dateIfUS > now && dateIfNotUS <= now) {
                isUSFormat = false; // MM/DD is impossible (future), so it must be DD/MM
            } else {
                // Fallback heuristic: leading zeros (e.g. 9/10/26 vs 09/10/26)
                if (sampleParts[0].length === 1 && sampleParts[1].length === 2) {
                    isUSFormat = true; // M/DD/YY is typical for US
                } else if (sampleParts[0].length === 2 && sampleParts[1].length === 1) {
                    isUSFormat = false; // DD/M/YY
                }
            }
        }
    }

    for (const msg of messages) {
        if (!msg.date) continue;
        const parts = msg.date.split(/[\/\-\.]/);
        if (parts.length === 3) {
            if (parts[0].length >= 4) {
                // It's already YYYY-MM-DD, sanitize year to 4 digits just in case
                let yStr = parts[0].trim();
                if (yStr.length > 4) yStr = yStr.substring(0, 4);
                msg.date = `${yStr}-${parts[1].trim().padStart(2, '0')}-${parts[2].trim().padStart(2, '0')}`;
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
            let yearStr = parts[2].trim().split(/\s+/)[0].replace(/\D/g, ''); // strip any non-digits / trailing space
            if (yearStr.length > 4) yearStr = yearStr.substring(0, 4);
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
