const crypto = require('crypto');

const ALGO = 'aes-256-gcm';

function getKey() {
    const secret = process.env.ENCRYPTION_SECRET;
    if (!secret || secret.length < 16) {
        throw new Error(
            'ENCRYPTION_SECRET env var missing or too short (min 16 chars). Set it in .env'
        );
    }
    return crypto.createHash('sha256').update(secret).digest();
}

function encrypt(plaintext) {
    if (plaintext == null) return null;
    const key = getKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ALGO, key, iv);
    const encrypted = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

function decrypt(payload) {
    if (!payload) return null;
    const key = getKey();
    const data = Buffer.from(payload, 'base64');
    const iv = data.slice(0, 12);
    const tag = data.slice(12, 28);
    const encrypted = data.slice(28);
    const decipher = crypto.createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
}

function maskKey(key) {
    if (!key) return '';
    if (key.length <= 8) return '****';
    return key.slice(0, 4) + '••••••••' + key.slice(-4);
}

module.exports = { encrypt, decrypt, maskKey };
