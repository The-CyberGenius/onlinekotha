const fs = require('fs');
let code = fs.readFileSync('server/db.js', 'utf8');

code = code.replace(
    'module.exports = { db, getSetting, setSetting, DB_PATH };',
    `function updateLastActive(userId) {
    if (!userId) return;
    try {
        db.prepare('UPDATE users SET last_active_at = ? WHERE id = ?').run(Date.now(), userId);
    } catch (e) {}
}

module.exports = { db, getSetting, setSetting, DB_PATH, updateLastActive };`
);
fs.writeFileSync('server/db.js', code);
