// Centralized config store for integrations (email / stripe / oauth).
// Values live in the `settings` table. Secret keys are encrypted via crypto.js.
// Falls back to env vars if DB has no value (for first-boot bootstrap).

const { db } = require('./db');
const { encrypt, decrypt, maskKey } = require('./crypto');

// Which keys hold secrets and must be encrypted at rest
const SECRET_KEYS = new Set([
    'integ.email.smtp_pass',
    'integ.stripe.secret_key',
    'integ.stripe.webhook_secret',
    'integ.oauth.google_client_secret',
    'integ.razorpay.key_secret',
    'integ.razorpay.webhook_secret',
]);

// Map of integration field → env var fallback
const ENV_FALLBACK = {
    'integ.email.smtp_host': 'SMTP_HOST',
    'integ.email.smtp_port': 'SMTP_PORT',
    'integ.email.smtp_secure': 'SMTP_SECURE',
    'integ.email.smtp_user': 'SMTP_USER',
    'integ.email.smtp_pass': 'SMTP_PASS',
    'integ.email.email_from': 'EMAIL_FROM',
    'integ.stripe.secret_key': 'STRIPE_SECRET_KEY',
    'integ.stripe.webhook_secret': 'STRIPE_WEBHOOK_SECRET',
    'integ.stripe.pro_price_id': 'STRIPE_PRO_PRICE_ID',
    'integ.stripe.lifetime_price_id': 'STRIPE_LIFETIME_PRICE_ID',
    'integ.oauth.google_client_id': 'GOOGLE_CLIENT_ID',
    'integ.oauth.google_client_secret': 'GOOGLE_CLIENT_SECRET',
    'integ.razorpay.key_id':        'RAZORPAY_KEY_ID',
    'integ.razorpay.key_secret':    'RAZORPAY_KEY_SECRET',
    'integ.razorpay.webhook_secret':'RAZORPAY_WEBHOOK_SECRET',
};

// In-memory cache invalidated on write
let cache = new Map();
function invalidateCache() { cache.clear(); }

function getRaw(key) {
    if (cache.has(key)) return cache.get(key);
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    let value = row ? row.value : null;
    if (value === null || value === '') {
        // env fallback (raw, not encrypted)
        const envKey = ENV_FALLBACK[key];
        if (envKey && process.env[envKey]) value = { source: 'env', plain: process.env[envKey] };
        else value = null;
    } else {
        // From DB; decrypt if secret
        if (SECRET_KEYS.has(key)) {
            try { value = { source: 'db', plain: decrypt(value) }; }
            catch { value = null; }
        } else {
            value = { source: 'db', plain: value };
        }
    }
    cache.set(key, value);
    return value;
}

function get(key) {
    const r = getRaw(key);
    return r ? r.plain : null;
}

function source(key) {
    const r = getRaw(key);
    return r ? r.source : null;
}

function set(key, plainValue) {
    if (plainValue == null || plainValue === '') {
        db.prepare('DELETE FROM settings WHERE key = ?').run(key);
    } else {
        const stored = SECRET_KEYS.has(key) ? encrypt(String(plainValue)) : String(plainValue);
        db.prepare(
            'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value'
        ).run(key, stored);
    }
    invalidateCache();
}

function isSecret(key) {
    return SECRET_KEYS.has(key);
}

// Read all integration config (with secrets masked for display)
function snapshot() {
    const out = { email: {}, stripe: {}, oauth: {}, razorpay: {} };
    for (const key of Object.keys(ENV_FALLBACK)) {
        const [, section, field] = key.split('.');
        const r = getRaw(key);
        if (!r) {
            out[section][field] = { set: false, masked: '', source: null };
        } else if (SECRET_KEYS.has(key)) {
            out[section][field] = { set: true, masked: maskKey(r.plain), source: r.source };
        } else {
            out[section][field] = { set: true, value: r.plain, source: r.source };
        }
    }
    return out;
}

// Write multiple at once. Only non-empty values are saved.
// `nulls` array means "clear these keys".
function bulkUpdate(updates = {}, nulls = []) {
    for (const [key, val] of Object.entries(updates)) {
        if (val === '' || val === null || val === undefined) continue;
        set(key, val);
    }
    for (const key of nulls) set(key, null);
}

module.exports = {
    get,
    set,
    source,
    isSecret,
    snapshot,
    bulkUpdate,
    invalidateCache,
    SECRET_KEYS,
    ENV_FALLBACK,
};
