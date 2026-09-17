// Rate Limiter & Word Count Enforcer
const userMsgBurstTracker = new Map(); // key -> { count: number, resetAt: number }

const { getSetting } = require('./db');

function countWords(str) {
    if (!str) return 0;
    return String(str).trim().split(/\s+/).filter(Boolean).length;
}

function checkBurstLimit(key, maxMsgs, windowMs) {
    if (maxMsgs === undefined) maxMsgs = Number(getSetting('burst_limit_messages', '10'));
    if (windowMs === undefined) windowMs = Number(getSetting('burst_limit_seconds', '30')) * 1000;

    const now = Date.now();
    let record = userMsgBurstTracker.get(key);
    if (!record || now > record.resetAt) {
        record = { count: 1, resetAt: now + windowMs };
        userMsgBurstTracker.set(key, record);
        return { allowed: true };
    }
    record.count += 1;
    if (record.count > maxMsgs) {
        const secsLeft = Math.ceil((record.resetAt - now) / 1000);
        return {
            allowed: false,
            error: `Slow down! You are sending messages too fast (${maxMsgs} msg limit reached). Please wait ${secsLeft}s before sending more.`,
        };
    }
    return { allowed: true };
}

module.exports = { countWords, checkBurstLimit };
