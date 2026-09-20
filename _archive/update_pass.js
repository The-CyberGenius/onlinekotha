const { db } = require('/var/www/onlinekotha/server/db');
db.prepare("UPDATE users SET password_hash = ?, is_admin = 1 WHERE email = ?").run(
    '$2b$10$dB1IHDCFeYuaYp.RJYcfP.L7efaQjHB4i4aTMeb1wDTM.TxCK4yT.',
    'porpostesting12@gmail.com'
);
console.log('Updated password for test user');
