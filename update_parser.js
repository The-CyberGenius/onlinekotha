const fs = require('fs');

let content = fs.readFileSync('server/parser.js', 'utf8');

const regexSectionRegex = /\/\/ iOS:[\s\S]*?const ANDROID_REGEX[^\n]*\n/;

const newRegexSection = `
const DATE_PAT = \`\\\\d{1,4}[\\\\/\\\\-\\\\.]\\\\d{1,2}[\\\\/\\\\-\\\\.]\\\\d{1,4}\`;
const TIME_PAT = \`\\\\d{1,2}:\\\\d{2}(?::\\\\d{2})?\\\\s*(?:[APap][\\\\.\\\\s]*[Mm]\\\\.?)?\`;

const IOS_REGEX = new RegExp(\`^\\\\[(\${DATE_PAT})[,\\\\s]+(\${TIME_PAT})\\\\]\\\\s*(.*?):\\\\s*(.*)$\`);
const WEB_REGEX = new RegExp(\`^\\\\[(\${TIME_PAT})[,\\\\s]+(\${DATE_PAT})\\\\]\\\\s*(.*?):\\\\s*(.*)$\`);
const ANDROID_REGEX = new RegExp(\`^(\${DATE_PAT})[,\\\\s]+(\${TIME_PAT})\\\\s*-\\\\s*(.*?):\\\\s*(.*)$\`);
`;

content = content.replace(regexSectionRegex, newRegexSection.trim() + '\n');

// Update detectFormat
const detectFormatRegex = /function detectFormat\(line\) \{[\s\S]*?return null;\n\}/;
const newDetectFormat = `function detectFormat(line) {
    if (IOS_REGEX.test(line)) return 'ios';
    if (ANDROID_REGEX.test(line)) return 'android';
    if (WEB_REGEX.test(line)) return 'web';
    return null;
}`;
content = content.replace(detectFormatRegex, newDetectFormat);

// Update parseLine
const parseLineRegex = /function parseLine\(line, format\) \{[\s\S]*?const \[, date, time, sender, rawText\] = match;.*?$/m;
const newParseLine = `function parseLine(line, format) {
    let regex = IOS_REGEX;
    if (format === 'android') regex = ANDROID_REGEX;
    else if (format === 'web') regex = WEB_REGEX;
    
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
    }`;

// Wait, the regex replace for parseLine might be tricky if we don't do it carefully. Let's just use string replacement.
