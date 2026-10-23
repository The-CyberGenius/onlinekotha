const Database = require('better-sqlite3');
const path = require('path');
const { sanitizeAIMessage } = require('../server/context');

const dbPath = process.argv[2] || path.join(__dirname, '../data/kotha.db');
const db = new Database(dbPath);

console.log('Connecting to database at:', dbPath);

// 1. Update system_prompt in routes table if needed
const route = db.prepare('SELECT system_prompt FROM routes WHERE feature = ?').get('chat');
if (route && route.system_prompt) {
    let p = route.system_prompt;
    if (!p.includes('NO HTML/XML TAGS')) {
        p = p.replace(
            /STEP 2: WHATSAPP TEXTING STYLE \(HARD RULES\)/g,
            `STEP 2: WHATSAPP TEXTING STYLE (HARD RULES)\n- NO HTML/XML TAGS (ABSOLUTE RULE): NEVER output any HTML or XML tags (such as <p>, </p>, <br>, <div>, </div>, <span>, </span>, <thought>, </thought>, <think>, etc.). WhatsApp messages are 100% plain text. Never include any tags or wrap text in tags.`
        );
        db.prepare('UPDATE routes SET system_prompt = ? WHERE feature = ?').run(p, 'chat');
        console.log('Updated routes.chat system_prompt with strict NO HTML/XML rule.');
    }
}

// 2. Clean dirty rows in conv_messages
const dirtyRows = db.prepare(`
    SELECT id, role, content FROM conv_messages 
    WHERE content LIKE '%<p%' OR content LIKE '%</p%' OR content LIKE '%</thought%' 
       OR content LIKE '%<thought%' OR content LIKE '%</div>%' OR content LIKE '%</vag>%'
       OR content LIKE '%<br%' OR content LIKE '%</span>%'
`).all();

console.log(`Found ${dirtyRows.length} dirty messages in conv_messages.`);

let cleanedCount = 0;
const updateStmt = db.prepare('UPDATE conv_messages SET content = ? WHERE id = ?');
for (const row of dirtyRows) {
    const cleaned = sanitizeAIMessage(row.content);
    if (cleaned !== row.content) {
        updateStmt.run(cleaned, row.id);
        cleanedCount++;
        console.log(`Cleaned msg #${row.id}: ${JSON.stringify(row.content)} -> ${JSON.stringify(cleaned)}`);
    }
}

console.log(`Finished! Cleaned ${cleanedCount} messages.`);
