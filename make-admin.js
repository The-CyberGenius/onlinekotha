const path = require('path');
const Database = require('better-sqlite3');

const email = process.argv[2];
if (!email) {
    console.error('Usage: node make-admin.js <email>');
    process.exit(1);
}

const dbPath = path.join(__dirname, 'data', 'kotha.db');
const db = new Database(dbPath);

const user = db.prepare('SELECT id, email, is_admin FROM users WHERE email = ?').get(email.toLowerCase());

if (!user) {
    console.error(`User with email ${email} not found.`);
    process.exit(1);
}

if (user.is_admin) {
    console.log(`User ${email} is already an admin.`);
    process.exit(0);
}

db.prepare('UPDATE users SET is_admin = 1 WHERE email = ?').run(email.toLowerCase());
console.log(`Successfully made ${email} an admin!`);
