const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { db } = require('./db');
const integ = require('./integrations');

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

function getBaseUrl() {
    return integ.get('integ.app.base_url') || process.env.PUBLIC_BASE_URL || 'http://localhost:3000';
}

function getFrom() {
    return integ.get('integ.email.email_from') || 'Kotha <noreply@kotha.app>';
}

// Build a fresh transporter from current config (DB or env). Cached until reset.
let cachedTransporter = null;
let cachedFingerprint = null;

function buildTransporter() {
    const host = integ.get('integ.email.smtp_host');
    const user = integ.get('integ.email.smtp_user');
    const pass = integ.get('integ.email.smtp_pass');
    if (!host || !user || !pass) return null;

    const port = Number(integ.get('integ.email.smtp_port') || 587);
    const secure = String(integ.get('integ.email.smtp_secure') || 'false') === 'true';
    const fingerprint = `${host}|${port}|${secure}|${user}|${pass}`;

    if (cachedTransporter && fingerprint === cachedFingerprint) return cachedTransporter;
    cachedTransporter = nodemailer.createTransport({
        host, port, secure,
        auth: { user, pass },
    });
    cachedFingerprint = fingerprint;
    return cachedTransporter;
}

function resetTransporter() {
    cachedTransporter = null;
    cachedFingerprint = null;
}

async function sendMail({ to, subject, html, text }) {
    const transporter = buildTransporter();
    if (!transporter) {
        console.log('\n📧 [EMAIL — would send, SMTP not configured]');
        console.log('   To:', to);
        console.log('   Subject:', subject);
        console.log('   Text:', text || html.replace(/<[^>]*>/g, '').slice(0, 200));
        console.log('');
        return { ok: true, mode: 'console' };
    }
    await transporter.sendMail({ from: getFrom(), to, subject, html, text });
    return { ok: true, mode: 'smtp' };
}

function createToken(userId, kind) {
    const token = crypto.randomBytes(32).toString('hex');
    db.prepare(
        `INSERT INTO email_tokens (token, user_id, kind, expires_at) VALUES (?, ?, ?, ?)`
    ).run(token, userId, kind, Date.now() + TOKEN_TTL_MS);
    return token;
}

function consumeToken(token, kind) {
    const row = db.prepare('SELECT * FROM email_tokens WHERE token = ? AND kind = ?').get(token, kind);
    if (!row) return null;
    if (row.used_at) return null;
    if (row.expires_at < Date.now()) return null;
    db.prepare('UPDATE email_tokens SET used_at = ? WHERE token = ?').run(Date.now(), token);
    return row;
}

function emailLayout(headline, body, ctaUrl, ctaText) {
    return `
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif;background:#f9fafb;margin:0;padding:32px 16px;color:#1f2937;">
  <div style="max-width:480px;margin:0 auto;background:white;border-radius:16px;padding:36px 32px;box-shadow:0 4px 20px rgba(0,0,0,0.04);">
    <div style="font-size:24px;font-weight:800;margin-bottom:8px;">💬 Kotha</div>
    <h1 style="font-size:22px;font-weight:700;margin:24px 0 12px;">${headline}</h1>
    <div style="font-size:15px;line-height:1.6;color:#4b5563;">${body}</div>
    ${ctaUrl ? `
    <a href="${ctaUrl}" style="display:inline-block;margin-top:24px;background:#0f172a;color:white;text-decoration:none;font-weight:700;font-size:15px;padding:13px 24px;border-radius:12px;">${ctaText}</a>
    <p style="font-size:12px;color:#9ca3af;margin-top:18px;">Or copy this link: <br><span style="word-break:break-all;color:#6b7280;">${ctaUrl}</span></p>
    ` : ''}
    <hr style="border:none;border-top:1px solid #f1f5f9;margin:28px 0 16px;">
    <p style="font-size:12px;color:#9ca3af;margin:0;">If you didn't expect this email, you can safely ignore it.</p>
  </div>
</body></html>`;
}

async function sendVerifyEmail(user) {
    const token = createToken(user.id, 'verify');
    const url = `${getBaseUrl()}/api/auth/verify?token=${token}`;
    const html = emailLayout(
        'Confirm your email',
        `Welcome to Kotha! Tap below to verify <b>${user.email}</b> and unlock your 24-hour AI trial.`,
        url,
        'Verify email'
    );
    return sendMail({
        to: user.email,
        subject: 'Verify your Kotha account',
        html,
        text: `Verify your email: ${url}`,
    });
}

async function sendPasswordResetEmail(user) {
    const token = createToken(user.id, 'reset');
    const url = `${getBaseUrl()}/reset.html?token=${token}`;
    const html = emailLayout(
        'Reset your password',
        `Click below to set a new password for your Kotha account. This link expires in 1 hour.`,
        url,
        'Reset password'
    );
    return sendMail({
        to: user.email,
        subject: 'Reset your Kotha password',
        html,
        text: `Reset your password: ${url}`,
    });
}

// Test sending a real email to a target — for admin "test" button
async function testEmail(to) {
    const transporter = buildTransporter();
    if (!transporter) return { ok: false, error: 'SMTP not configured' };
    try {
        await transporter.verify();
        await transporter.sendMail({
            from: getFrom(),
            to,
            subject: 'Kotha — Test email',
            html: emailLayout('Test successful', `If you can read this, your SMTP setup is working. 🎉`),
            text: 'Kotha SMTP test successful.',
        });
        return { ok: true };
    } catch (err) {
        return { ok: false, error: err.message };
    }
}

function configured() {
    return !!buildTransporter();
}

module.exports = {
    sendVerifyEmail,
    sendPasswordResetEmail,
    consumeToken,
    createToken,
    testEmail,
    resetTransporter,
    configured,
};
