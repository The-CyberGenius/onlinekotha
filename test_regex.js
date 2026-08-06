const lines = [
    "[3/22/23, 4:51:35 PM] Sender Name: Message",
    "3/22/23, 4:51 PM - Sender Name: Message",
    "3/22/23, 16:51 - Sender Name: Message",
    "[16:51, 3/22/23] Sender: Web message",
    "12.04.24, 15:30 - Hans: Hallo",
    "12-04-2024 15:30 - Person: No comma",
    "05/08/26, 11:37\u202Fam - Shiva: Narrow space AM",
    "‎[22/03/23, 16:51:35] Sender: LTR mark"
];

const DATE_PAT = `\\d{1,4}[\\/\\-\\.]\\d{1,2}[\\/\\-\\.]\\d{1,4}`;
const TIME_PAT = `\\d{1,2}:\\d{2}(?::\\d{2})?\\s*(?:[APap][\\.\\s]*[Mm]\\.?)?`;

const IOS_REGEX = new RegExp(`^\\[(${DATE_PAT})[,\\s]+(${TIME_PAT})\\]\\s*(.*?):\\s*(.*)$`);
const WEB_REGEX = new RegExp(`^\\[(${TIME_PAT})[,\\s]+(${DATE_PAT})\\]\\s*(.*?):\\s*(.*)$`);
const ANDROID_REGEX = new RegExp(`^(${DATE_PAT})[,\\s]+(${TIME_PAT})\\s*-\\s*(.*?):\\s*(.*)$`);

for (let rawLine of lines) {
    let line = rawLine.replace(/[\u200E\u200F\u202A\u202B\u202C\u202D\u202E]/g, '').replace(/[\u202F\u00A0]/g, ' ').trim();
    let match = line.match(IOS_REGEX) || line.match(ANDROID_REGEX);
    let type = match ? "iOS/Android" : "None";
    if (!match) {
        match = line.match(WEB_REGEX);
        type = match ? "Web" : "None";
    }
    console.log(type, "=>", match ? `Date: ${match[1]}, Time: ${match[2]}, Sender: ${match[3]}, Msg: ${match[4]}` : `FAILED: ${line}`);
}
