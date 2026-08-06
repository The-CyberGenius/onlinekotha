// Retrieves the most relevant messages from a chat history for an AI question.
// No vector DB / embeddings — uses BM25-ish lexical scoring + recency boost + date awareness.
// Fast, free, good enough for v1.

// English + Hindi month aliases for date-aware query parsing
const MONTH_ALIASES = {
    jan: 1, january: 1, janwari: 1,
    feb: 2, february: 2, farvari: 2,
    mar: 3, march: 3,
    apr: 4, april: 4,
    may: 5,
    jun: 6, june: 6,
    jul: 7, july: 7,
    aug: 8, august: 8,
    sep: 9, september: 9, sept: 9,
    oct: 10, october: 10,
    nov: 11, november: 11,
    dec: 12, december: 12,
};

/**
 * Extract date clues from the user's query — months, years, specific days.
 * Supports "december 2023", "14/12/22", "last november", etc.
 */
function extractDateHints(query) {
    const lower = (query || '').toLowerCase();
    const months = new Set();
    const years  = new Set();
    let dayHint  = null;

    for (const [alias, num] of Object.entries(MONTH_ALIASES)) {
        if (lower.includes(alias)) months.add(num);
    }

    // 4-digit year like 2022, 2023, 2024
    const yearMatch = lower.match(/\b(20\d{2})\b/);
    if (yearMatch) years.add(parseInt(yearMatch[1]));

    // Explicit date pattern DD/MM/YY(YY) or DD-MM-YY(YY)
    const dateMatch = lower.match(/(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/);
    if (dateMatch) {
        dayHint = parseInt(dateMatch[1]);
        months.add(parseInt(dateMatch[2]));
        if (dateMatch[3]) {
            const yr = parseInt(dateMatch[3]);
            years.add(yr < 100 ? 2000 + yr : yr);
        }
    }

    return { months: [...months], years: [...years], day: dayHint };
}

const STOP_WORDS = new Set([
    'the', 'is', 'a', 'an', 'and', 'or', 'but', 'if', 'then', 'i', 'you', 'he', 'she',
    'it', 'we', 'they', 'this', 'that', 'these', 'those', 'to', 'of', 'in', 'on', 'at',
    'for', 'with', 'by', 'from', 'as', 'was', 'were', 'be', 'been', 'being', 'are', 'am',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may',
    'might', 'can', 'me', 'my', 'your', 'his', 'her', 'our', 'their', 'so', 'just', 'not',
    'no', 'yes', 'ok', 'okay', 'kya', 'hai', 'hi', 'ka', 'ki', 'ke', 'ko', 'se', 'me',
    'main', 'tum', 'tu', 'wo', 'woh', 'yeh', 'aur', 'bhi', 'hi',
]);

function tokenize(text) {
    return (text || '')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .split(/\s+/)
        .filter(t => t && t.length > 1 && !STOP_WORDS.has(t));
}

function uniq(arr) {
    return [...new Set(arr)];
}

/**
 * Score every message against the query, return top-K with context window.
 * @param {Array} messages — all chat messages
 * @param {String} query — user's question
 * @param {Object} opts
 * @returns Array of messages with id, sender, text, date, time, type
 */
function selectContext(messages, query, opts = {}) {
    let topK = opts.topK || 50;
    const windowBefore = opts.windowBefore || 2;
    const windowAfter = opts.windowAfter || 2;
    const recencyWeight = opts.recencyWeight !== undefined ? opts.recencyWeight : 0.15;
    const includeRecent = opts.includeRecent !== undefined ? opts.includeRecent : 20;

    if (!messages || !messages.length) return { selected: [], stats: { matched: 0 } };

    const n = messages.length;
    const queryTerms = uniq(tokenize(query));

    // Compute IDF for query terms
    const df = {};
    for (const term of queryTerms) df[term] = 0;
    const tokenizedMessages = messages.map(m => {
        const tokens = tokenize(m.text);
        const tokenSet = new Set(tokens);
        for (const t of queryTerms) if (tokenSet.has(t)) df[t]++;
        return tokens;
    });

    const idf = {};
    for (const t of queryTerms) {
        idf[t] = Math.log(1 + (n - df[t] + 0.5) / (df[t] + 0.5));
    }

    // BM25-lite + recency + date boost
    const k1 = 1.4;
    const b = 0.7;
    const avgLen = tokenizedMessages.reduce((s, t) => s + t.length, 0) / Math.max(1, n) || 1;

    // Extract date hints from query for boosting temporally relevant messages
    const dateHints = extractDateHints(query);
    const hasDateHints = dateHints.months.length > 0 || dateHints.years.length > 0 || dateHints.day !== null;

    // Detect if user wants a broad summary, date/time information, or sensitive/contact details
    const isSummarize = /(summarize|summary|what happened|what did we|history of|recap|tell me about)/i.test(query);
    const hasWeekdayHint = /(monday|tuesday|wednesday|thursday|friday|saturday|sunday|weekend|yesterday|today)/i.test(query);
    const isTemporalQuery = /(date|tarikh|tariq|kab|when|konsi date|kis din|konsa din|pehle|baat|history|time|upr|upar|yaad|dhund|dhoond)/i.test(query);
    const isSensitiveQuery = /(sensitive|contact|details|detail|phone|mobile|number|numbers|email|address|upi|bank|password|pass|pin|card|name|names|info|information|kya kya|puri chat|full chat|scan|check chat|share|shared|privacy|admin|private)/i.test(query);

    // Expand context window massively for date lookups, broad summaries, sensitive scans, or weekday questions
    if (hasDateHints || isSummarize || hasWeekdayHint || isTemporalQuery || isSensitiveQuery) {
        topK = Math.max(topK, 600); 
    }

    const sensitivePattern = /(\b(\+?\d{1,3}[-.\s]?)?[6-9]\d{9}\b|\b\d{5}[-.\s]?\d{5}\b|\b\d{10,12}\b|\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b|\b[a-zA-Z0-9.\-_]+@(ok\w+|paytm|ybl|apl|ibl|upi)\b|\b(password|pass|otp|pin|cvv|bank|account|card|credit|debit|aadhar|pan|ssn|address|location|number|contact)\b)/i;

    const scored = messages.map((m, i) => {
        const tokens = tokenizedMessages[i];
        const len = tokens.length || 1;

        let score = 0;
        if (queryTerms.length) {
            const tf = {};
            for (const t of tokens) tf[t] = (tf[t] || 0) + 1;
            for (const term of queryTerms) {
                if (!tf[term]) continue;
                const f = tf[term];
                score += (idf[term] * f * (k1 + 1)) / (f + k1 * (1 - b + (b * len) / avgLen));
            }
        }

        // Recency boost: most recent message i=n-1 → +recencyWeight max
        const recency = (i / Math.max(1, n - 1)) * recencyWeight;

        // Date boost: if query mentions a month/year, heavily surface messages from that period
        // Chat dates are in DD/MM/YY(YY) Indian format — parts[0]=day, parts[1]=month, parts[2]=year
        let dateBoost = 0;
        if (hasDateHints && m.date) {
            const parts = m.date.split('/');
            if (parts.length === 3) {
                const mDay   = parseInt(parts[0]);
                const mMonth = parseInt(parts[1]);
                const mYear  = parseInt(parts[2].length === 2 ? `20${parts[2]}` : parts[2]);
                if (dateHints.months.includes(mMonth)) dateBoost += 0.8;
                if (dateHints.years.includes(mYear))   dateBoost += 0.4;
                if (dateHints.day && dateHints.day === mDay) dateBoost += 0.3;
            }
        }

        // Sensitive/Contact info boost
        let sensitiveBoost = 0;
        if (isSensitiveQuery && m.text && sensitivePattern.test(m.text)) {
            sensitiveBoost = 2.5;
        }

        return { idx: i, score: score + recency * (score > 0 ? 1 : 0.1) + dateBoost + sensitiveBoost };
    });

    // Pick top-K by score
    let chosen = [...scored].sort((a, b) => b.score - a.score).slice(0, topK).map(s => s.idx);

    // Uniformly sample timeline for date/summary/sensitive queries so AI knows across the whole chat
    if (hasDateHints || isSummarize || isTemporalQuery || isSensitiveQuery) {
        const step = Math.max(1, Math.floor(n / 60));
        for (let i = 0; i < n; i += step) {
            chosen.push(i);
        }
    }

    // Plus always include the last `includeRecent` messages for tail context
    const tail = [];
    for (let i = Math.max(0, n - includeRecent); i < n; i++) tail.push(i);

    // Expand each chosen index with surrounding window
    const window = new Set([...chosen, ...tail]);
    for (const i of chosen) {
        for (let j = Math.max(0, i - windowBefore); j <= Math.min(n - 1, i + windowAfter); j++) {
            window.add(j);
        }
    }

    const ordered = [...window].sort((a, b) => a - b);
    const selected = ordered.map(i => messages[i]);

    return {
        selected,
        stats: {
            totalMessages: n,
            queryTerms,
            picked: ordered.length,
            topMatched: chosen.length,
        },
    };
}

/**
 * Format messages into a prompt block the LLM can read easily.
 * Includes id markers so we can map citations back.
 */
function formatContext(messages, chatName) {
    const lines = [];
    if (chatName) lines.push(`Chat name: ${chatName}`);
    lines.push(`The following are real messages from the user's WhatsApp chat history.`);
    lines.push(`Each message is prefixed by [#id date time sender] for citation.`);
    lines.push('');

    for (const m of messages) {
        const tag = `[#${m.id} ${m.date} ${m.time} ${m.sender}]`;
        if (m.type === 'text') {
            lines.push(`${tag} ${(m.text || '').replace(/\n/g, ' / ')}`);
        } else if (m.attachment) {
            lines.push(`${tag} <${m.type}: ${m.attachment}>${m.text ? ' ' + m.text : ''}`);
        }
    }
    return lines.join('\n');
}

const DEFAULT_SYSTEM_PROMPT = `You are Kotha — a thoughtful, warm assistant who helps the user reflect on their own WhatsApp chat history.

Rules:
- Only answer using information present in the provided chat messages. If something isn't in the context, say you don't see it in the conversations shown.
- When asked to check, scan, or extract sensitive information, contact details, phone numbers, email addresses, names, or private data, thoroughly inspect the chat history and list/extract all such details found.
- Quote specific phrases when relevant, in quotes.
- When you cite a specific moment, end that sentence with [#<id>] using the id from the message header. You may cite up to 5 ids per answer.
- Speak naturally, like a close friend. Hindi/Hinglish welcome if the user writes that way.
- Keep replies clear, helpful, and accurate.
- Never invent dates, names, or events that aren't in the chat. Never make up quotes.`;

module.exports = { selectContext, formatContext, DEFAULT_SYSTEM_PROMPT, extractDateHints };
