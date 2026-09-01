// Automated Daily Database Backup Script (Retains last 7 days backups)
// Uses SQLite's native .backup() API for crash-safe copies (no WAL corruption)
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'kotha.db');
const backupDir = path.join(__dirname, '..', 'backups');

if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

const dateStr = new Date().toISOString().slice(0, 10);
const destPath = path.join(backupDir, `kotha_backup_${dateStr}.db`);

if (fs.existsSync(dbPath)) {
    try {
        const db = new Database(dbPath, { readonly: true });
        db.backup(destPath)
            .then(() => {
                db.close();
                console.log(`[DB Backup] Successfully created safe backup at ${destPath}`);

                // Retain only the last 7 daily backups to optimize disk usage
                const files = fs.readdirSync(backupDir)
                    .filter(f => f.startsWith('kotha_backup_') && f.endsWith('.db'))
                    .sort();

                while (files.length > 7) {
                    const oldFile = files.shift();
                    fs.unlinkSync(path.join(backupDir, oldFile));
                    console.log(`[DB Backup] Removed old backup: ${oldFile}`);
                }
            })
            .catch(err => {
                db.close();
                console.error(`[DB Backup Error] Backup failed:`, err.message);
                process.exit(1);
            });
    } catch (err) {
        console.error(`[DB Backup Error] Could not open database:`, err.message);
        process.exit(1);
    }
} else {
    console.error(`[DB Backup Error] Database not found at ${dbPath}`);
    process.exit(1);
}

