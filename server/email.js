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

async function sendMail({ to, subject, html, text, userId = null, type = 'general' }) {
    const transporter = buildTransporter();
    
    let mode = 'smtp';
    let status = 'sent';
    let errorMsg = null;
    let ok = true;

    try {
        if (!transporter) {
            console.log('\n📧 [EMAIL — would send, SMTP not configured]');
            console.log('   To:', to);
            console.log('   Subject:', subject);
            console.log('   Text:', text || html.replace(/<[^>]*>/g, '').slice(0, 200));
            console.log('');
            mode = 'console';
            status = 'console'; // Indicate it wasn't actually sent via SMTP
        } else {
            await transporter.sendMail({ from: getFrom(), to, subject, html, text });
        }
    } catch (err) {
        console.error('Email sending failed:', err);
        ok = false;
        status = 'failed';
        errorMsg = err.message;
    }

    try {
        db.prepare(
            `INSERT INTO email_logs (user_id, recipient_email, subject, status, error_message, sent_at, type)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).run(userId, to, subject, status, errorMsg, Date.now(), type);
    } catch (dbErr) {
        console.error('Failed to log email:', dbErr);
    }

    if (!ok) return { ok: false, mode, error: errorMsg };
    return { ok: true, mode };
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
        userId: user.id,
        type: 'verify'
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
        userId: user.id,
        type: 'reset'
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

async function sendWelcomeEmail(to, name) {
    const greeting = name ? `Hi ${name},` : 'Hi there,';
    
    const body = `
        <p>${greeting}</p>
        <p>Thanks for joining Kotha! We're thrilled to have you here.</p>
        
        <h3 style="color:#111827;font-size:16px;margin-top:24px;">How to use Kotha:</h3>
        <ol style="color:#4b5563;font-size:15px;line-height:1.6;padding-left:20px;">
            <li style="margin-bottom:8px;"><strong>Chat & Explore:</strong> Start interacting immediately by jumping into a chat or exploring the models available.</li>
            <li style="margin-bottom:8px;"><strong>Settings:</strong> Customize your profile and AI preferences by clicking on the settings icon on the bottom left.</li>
            <li style="margin-bottom:8px;"><strong>Save your work:</strong> Your chats are automatically saved so you can pick up exactly where you left off across any device.</li>
        </ol>

        <h3 style="color:#111827;font-size:16px;margin-top:24px;">Unlock more with the Pro Plan 🌟</h3>
        <p style="color:#4b5563;font-size:15px;">If you need more power, our Pro plan gives you:</p>
        <ul style="color:#4b5563;font-size:15px;line-height:1.6;padding-left:20px;">
            <li style="margin-bottom:6px;"><strong>Unlimited Messages:</strong> No daily chat limits.</li>
            <li style="margin-bottom:6px;"><strong>Premium Models:</strong> Chat with the most advanced AI models (GPT-4, Claude Opus, etc.).</li>
            <li style="margin-bottom:6px;"><strong>Faster Response:</strong> Priority processing for zero delays.</li>
            <li style="margin-bottom:6px;"><strong>Early Access:</strong> Be the first to try out our new experimental features!</li>
        </ul>
        <p style="color:#4b5563;font-size:15px;margin-top:16px;">You can upgrade anytime from the "Plans" section in your dashboard.</p>
        
        <p style="color:#4b5563;font-size:15px;margin-top:24px;">
            Happy exploring!<br>
            <strong>The Kotha Team</strong>
        </p>
    `;

    const html = emailLayout(
        'Welcome aboard! 🚀',
        body,
        getBaseUrl(),
        'Explore Kotha'
    );

    const text = `${greeting}\n\nThanks for joining Kotha! We're thrilled to have you here.\n\nHow to use Kotha:\n1. Chat & Explore\n2. Settings\n3. Save your work\n\nUnlock more with the Pro Plan:\n- Unlimited Messages\n- Premium Models\n- Faster Response\n- Early Access\n\nHappy exploring!\nThe Kotha Team`;

    return sendMail({
        to,
        subject: "Welcome to Kotha! 🚀 Here's how to get started",
        html,
        text,
        type: 'welcome'
    });
}

function configured() {
    return !!buildTransporter();
}

async function sendManualEmail(to, userId, subject, bodyHtml) {
    const html = emailLayout(subject, bodyHtml, null, null);
    const text = bodyHtml.replace(/<[^>]*>?/gm, ''); // simple strip tags
    
    return sendMail({
        to,
        subject,
        html,
        text,
        userId,
        type: 'manual'
    });
}

module.exports = {
    sendVerifyEmail,
    sendPasswordResetEmail,
    consumeToken,
    createToken,
    testEmail,
    resetTransporter,
    configured,
    sendWelcomeEmail,
    sendManualEmail,
};
