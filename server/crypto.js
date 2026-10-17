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

// Map of AI provider names to possible environment variable names
const PROVIDER_ENV_MAP = {
    openrouter: ['OPENROUTER_API_KEY'],
    google: ['GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GOOGLE_AI_API_KEY'],
    openai: ['OPENAI_API_KEY'],
    anthropic: ['ANTHROPIC_API_KEY'],
    groq: ['GROQ_API_KEY'],
    deepseek: ['DEEPSEEK_API_KEY'],
    mistral: ['MISTRAL_API_KEY'],
    qwen: ['QWEN_API_KEY', 'DASHSCOPE_API_KEY'],
    xai: ['XAI_API_KEY', 'GROK_API_KEY'],
    together: ['TOGETHER_API_KEY'],
};

function getProviderApiKey(providerName, encryptedPayload = null) {
    // 1. Check process.env first (gives priority/fallback to .env keys)
    if (providerName) {
        const nameKey = String(providerName).toLowerCase().trim();
        const envVars = PROVIDER_ENV_MAP[nameKey] || [];
        for (const envVar of envVars) {
            const val = process.env[envVar];
            if (val && typeof val === 'string' && val.trim()) {
                return val.trim();
            }
        }
        // Generic fallback: <NAME>_API_KEY
        const genericEnv = `${nameKey.toUpperCase().replace(/[^A-Z0-9_]/g, '_')}_API_KEY`;
        const genVal = process.env[genericEnv];
        if (genVal && typeof genVal === 'string' && genVal.trim()) {
            return genVal.trim();
        }
    }

    // 2. Fall back to decrypted payload from database if available
    if (encryptedPayload) {
        try {
            const dec = decrypt(encryptedPayload);
            if (dec && typeof dec === 'string' && dec.trim()) {
                return dec.trim();
            }
        } catch {}
    }

    return null;
}

module.exports = { encrypt, decrypt, maskKey, getProviderApiKey, PROVIDER_ENV_MAP };

