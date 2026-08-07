// Rate Limiter & Word Count Enforcer
const userMsgBurstTracker = new Map(); // key -> { count: number, resetAt: number }

function countWords(str) {
    if (!str) return 0;
    return String(str).trim().split(/\s+/).filter(Boolean).length;
}

function checkBurstLimit(key, maxMsgs = 10, windowMs = 30000) {
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
            error: `Slow down! You are sending messages too fast (10 msg limit reached). Please wait ${secsLeft}s before sending more.`,
        };
    }
    return { allowed: true };
}

module.exports = { countWords, checkBurstLimit };
