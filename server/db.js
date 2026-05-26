const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'kotha.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  plan TEXT NOT NULL DEFAULT 'trial',
  trial_expires_at INTEGER,
  is_admin INTEGER NOT NULL DEFAULT 0,
  email_verified INTEGER NOT NULL DEFAULT 0,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  plan_renews_at INTEGER
);

CREATE TABLE IF NOT EXISTS email_tokens (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_email_tokens_user ON email_tokens(user_id);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS chats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  folder_name TEXT NOT NULL,
  display_name TEXT,
  created_at INTEGER NOT NULL,
  message_count INTEGER DEFAULT 0,
  format TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(user_id, folder_name)
);
CREATE INDEX IF NOT EXISTS idx_chats_user ON chats(user_id);

CREATE TABLE IF NOT EXISTS providers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  label TEXT,
  api_key_encrypted TEXT NOT NULL,
  base_url TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  last_tested_at INTEGER,
  last_test_ok INTEGER,
  last_test_error TEXT
);

CREATE TABLE IF NOT EXISTS models (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider_id INTEGER NOT NULL,
  model_id TEXT NOT NULL,
  display_name TEXT,
  input_price_per_1m REAL DEFAULT 0,
  output_price_per_1m REAL DEFAULT 0,
  context_window INTEGER,
  enabled INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE,
  UNIQUE(provider_id, model_id)
);

CREATE TABLE IF NOT EXISTS routes (
  feature TEXT PRIMARY KEY,
  primary_model_id INTEGER,
  fallback_model_id INTEGER,
  system_prompt TEXT,
  max_tokens INTEGER DEFAULT 1024,
  temperature REAL DEFAULT 0.7,
  FOREIGN KEY (primary_model_id) REFERENCES models(id) ON DELETE SET NULL,
  FOREIGN KEY (fallback_model_id) REFERENCES models(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS usage_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  feature TEXT,
  provider_id INTEGER,
  model_id INTEGER,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  cost_usd REAL DEFAULT 0,
  created_at INTEGER NOT NULL,
  error TEXT
);
CREATE INDEX IF NOT EXISTS idx_usage_user ON usage_log(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_created ON usage_log(created_at);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  chat_folder TEXT NOT NULL,
  title TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_conv_user_chat ON conversations(user_id, chat_folder);

CREATE TABLE IF NOT EXISTS conv_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  citations TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_convmsg_conv ON conv_messages(conversation_id);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  provider TEXT NOT NULL DEFAULT 'razorpay',
  order_id TEXT UNIQUE NOT NULL,
  payment_id TEXT,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  plan TEXT,
  status TEXT NOT NULL DEFAULT 'captured',
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);
 
CREATE TABLE IF NOT EXISTS global_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  sender TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_global_messages_user ON global_messages(user_id);
`);

// Migrations: ALTER existing users table for new columns
function safeAddColumn(table, column, def) {
    try { db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`).run(); } catch {}
}
safeAddColumn('users', 'email_verified', 'INTEGER NOT NULL DEFAULT 0');
safeAddColumn('users', 'stripe_customer_id', 'TEXT');
safeAddColumn('users', 'stripe_subscription_id', 'TEXT');
safeAddColumn('users', 'plan_renews_at', 'INTEGER');
safeAddColumn('users', 'google_id', 'TEXT');
safeAddColumn('chats', 'deleted_by_user', 'INTEGER NOT NULL DEFAULT 0');
safeAddColumn('users', 'avatar_url', 'TEXT');
safeAddColumn('users', 'display_name', 'TEXT');
try { db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id) WHERE google_id IS NOT NULL').run(); } catch {}

// Default settings
const defaults = {
    daily_spend_cap_usd: '5',
    trial_duration_hours: '72',
    free_user_daily_messages: '3',
    paid_user_daily_messages: '500',
};
const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
for (const [k, v] of Object.entries(defaults)) insertSetting.run(k, v);

// Migrate old defaults → new values
const curTrial = db.prepare("SELECT value FROM settings WHERE key = 'trial_duration_hours'").get();
if (curTrial && curTrial.value === '24') {
    db.prepare("UPDATE settings SET value = '72' WHERE key = 'trial_duration_hours'").run();
}
const curFree = db.prepare("SELECT value FROM settings WHERE key = 'free_user_daily_messages'").get();
if (curFree && curFree.value === '0') {
    db.prepare("UPDATE settings SET value = '3' WHERE key = 'free_user_daily_messages'").run();
}

function getSetting(key, fallback = null) {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return row ? row.value : fallback;
}

function setSetting(key, value) {
    db.prepare(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value'
    ).run(key, String(value));
}

module.exports = { db, getSetting, setSetting, DB_PATH };
