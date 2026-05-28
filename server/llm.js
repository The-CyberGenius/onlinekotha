const { db, getSetting } = require('./db');
const { decrypt } = require('./crypto');

class LLMError extends Error {
    constructor(message, code) {
        super(message);
        this.code = code;
    }
}

function getRoute(feature) {
    const row = db.prepare('SELECT * FROM routes WHERE feature = ?').get(feature);
    return row || null;
}

function getModelWithProvider(modelId) {
    if (!modelId) return null;
    return db.prepare(
        `SELECT m.*, p.name AS provider_name, p.api_key_encrypted, p.base_url, p.enabled AS provider_enabled
         FROM models m JOIN providers p ON p.id = m.provider_id
         WHERE m.id = ? AND m.enabled = 1 AND p.enabled = 1`
    ).get(modelId);
}

function todaySpend() {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const row = db.prepare(
        'SELECT COALESCE(SUM(cost_usd), 0) AS c FROM usage_log WHERE created_at >= ?'
    ).get(startOfDay.getTime());
    return row.c || 0;
}

function checkSpendCap() {
    const cap = Number(getSetting('daily_spend_cap_usd', '5'));
    const spent = todaySpend();
    if (spent >= cap) {
        throw new LLMError(`Daily spend cap reached ($${cap.toFixed(2)}). Try again tomorrow.`, 'SPEND_CAP');
    }
}

function logUsage({ userId, feature, providerId, modelId, inputTokens, outputTokens, costUsd, error }) {
    db.prepare(
        `INSERT INTO usage_log (user_id, feature, provider_id, model_id, input_tokens, output_tokens, cost_usd, created_at, error)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
        userId || null,
        feature,
        providerId || null,
        modelId || null,
        inputTokens || 0,
        outputTokens || 0,
        costUsd || 0,
        Date.now(),
        error || null
    );
}

function calcCost(model, inputTokens, outputTokens) {
    const inCost = (inputTokens / 1_000_000) * (model.input_price_per_1m || 0);
    const outCost = (outputTokens / 1_000_000) * (model.output_price_per_1m || 0);
    return inCost + outCost;
}

// ---------- Provider streaming adapters ----------

async function streamAnthropic({ model, messages, systemPrompt, maxTokens, temperature, onToken, signal }) {
    const apiKey = decrypt(model.api_key_encrypted);
    const url = `${model.base_url || 'https://api.anthropic.com/v1'}/messages`;

    const body = {
        model: model.model_id,
        max_tokens: maxTokens,
        temperature,
        stream: true,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
    };
    if (systemPrompt) body.system = systemPrompt;

    const resp = await fetch(url, {
        method: 'POST',
        headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
        },
        body: JSON.stringify(body),
        signal,
    });

    if (!resp.ok) {
        const text = await resp.text();
        throw new LLMError(`Anthropic ${resp.status}: ${text.slice(0, 300)}`, 'PROVIDER_ERROR');
    }

    let inputTokens = 0;
    let outputTokens = 0;

    await readSSE(resp.body, evt => {
        if (evt.event === 'message_start' && evt.data?.message?.usage) {
            inputTokens = evt.data.message.usage.input_tokens || 0;
        }
        if (evt.event === 'content_block_delta' && evt.data?.delta?.text) {
            onToken(evt.data.delta.text);
        }
        if (evt.event === 'message_delta' && evt.data?.usage) {
            outputTokens = evt.data.usage.output_tokens || outputTokens;
        }
    });

    return { inputTokens, outputTokens };
}

async function streamOpenAICompatible({ model, messages, systemPrompt, maxTokens, temperature, onToken, signal }) {
    const apiKey = decrypt(model.api_key_encrypted);
    const url = `${model.base_url}/chat/completions`;

    const chatMessages = [];
    if (systemPrompt) chatMessages.push({ role: 'system', content: systemPrompt });
    for (const m of messages) chatMessages.push({ role: m.role, content: m.content });

    const resp = await fetch(url, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'content-type': 'application/json',
        },
        body: JSON.stringify({
            model: model.model_id,
            messages: chatMessages,
            max_tokens: maxTokens,
            temperature,
            stream: true,
            stream_options: { include_usage: true },
        }),
        signal,
    });

    if (!resp.ok) {
        const text = await resp.text();
        throw new LLMError(`${model.provider_name} ${resp.status}: ${text.slice(0, 300)}`, 'PROVIDER_ERROR');
    }

    let inputTokens = 0;
    let outputTokens = 0;

    await readSSE(resp.body, evt => {
        if (!evt.data || evt.data === '[DONE]') return;
        const delta = evt.data?.choices?.[0]?.delta?.content;
        if (delta) onToken(delta);
        if (evt.data?.usage) {
            inputTokens = evt.data.usage.prompt_tokens || inputTokens;
            outputTokens = evt.data.usage.completion_tokens || outputTokens;
        }
    });

    return { inputTokens, outputTokens };
}

async function streamGoogle({ model, messages, systemPrompt, maxTokens, temperature, onToken, signal }) {
    const apiKey = decrypt(model.api_key_encrypted);
    const url = `${model.base_url || 'https://generativelanguage.googleapis.com/v1beta'}/models/${model.model_id}:streamGenerateContent?alt=sse&key=${apiKey}`;

    const contents = messages.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
    }));

    const body = {
        contents,
        generationConfig: { maxOutputTokens: maxTokens, temperature, thinkingConfig: { thinkingBudget: 0 } },
        safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
        ],
    };
    if (systemPrompt) body.systemInstruction = { parts: [{ text: systemPrompt }] };

    const resp = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal,
    });

    if (!resp.ok) {
        const text = await resp.text();
        throw new LLMError(`Google ${resp.status}: ${text.slice(0, 300)}`, 'PROVIDER_ERROR');
    }

    let inputTokens = 0;
    let outputTokens = 0;

    await readSSE(resp.body, evt => {
        if (!evt.data) return;
        const txt = evt.data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (txt) onToken(txt);
        if (evt.data?.usageMetadata) {
            inputTokens = evt.data.usageMetadata.promptTokenCount || inputTokens;
            outputTokens = evt.data.usageMetadata.candidatesTokenCount || outputTokens;
        }
    });

    return { inputTokens, outputTokens };
}

// ---------- Generic SSE reader ----------
async function readSSE(stream, onEvent) {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        // Normalize CRLF → LF (Google Gemini uses \r\n)
        buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');

        let idx;
        while ((idx = buffer.indexOf('\n\n')) !== -1) {
            const block = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);

            let eventType = 'message';
            let dataLines = [];
            for (const line of block.split('\n')) {
                if (line.startsWith('event:')) eventType = line.slice(6).trim();
                else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
            }
            if (!dataLines.length) continue;
            const rawData = dataLines.join('\n');
            if (rawData === '[DONE]') {
                onEvent({ event: eventType, data: '[DONE]' });
                continue;
            }
            try {
                const data = JSON.parse(rawData);
                onEvent({ event: eventType, data });
            } catch {
                onEvent({ event: eventType, data: rawData });
            }
        }
    }
}

// ---------- Main entry ----------
async function callLLM({ feature, messages, systemPrompt, userId, onToken, signal }) {
    checkSpendCap();

    const route = getRoute(feature);
    if (!route) throw new LLMError(`No route configured for "${feature}"`, 'NO_ROUTE');

    const primary = getModelWithProvider(route.primary_model_id);
    const fallback = getModelWithProvider(route.fallback_model_id);
    if (!primary && !fallback) throw new LLMError('No models available for this feature', 'NO_MODEL');

    const finalSystemPrompt = systemPrompt || route.system_prompt;
    const maxTokens = route.max_tokens || 1024;
    const temperature = route.temperature ?? 0.7;

    const attempts = [primary, fallback].filter(Boolean);
    let lastError = null;

    for (const model of attempts) {
        const adapter = pickAdapter(model.provider_name);
        if (!adapter) {
            lastError = new LLMError(`No adapter for provider ${model.provider_name}`, 'NO_ADAPTER');
            continue;
        }

        try {
            const { inputTokens, outputTokens } = await adapter({
                model,
                messages,
                systemPrompt: finalSystemPrompt,
                maxTokens,
                temperature,
                onToken,
                signal,
            });
            const cost = calcCost(model, inputTokens, outputTokens);
            logUsage({
                userId,
                feature,
                providerId: model.provider_id,
                modelId: model.id,
                inputTokens,
                outputTokens,
                costUsd: cost,
            });
            return { model: model.model_id, inputTokens, outputTokens, cost };
        } catch (err) {
            lastError = err;
            logUsage({
                userId,
                feature,
                providerId: model.provider_id,
                modelId: model.id,
                error: err.message,
            });
            // continue to fallback
        }
    }

    throw lastError || new LLMError('All providers failed', 'ALL_FAILED');
}

function pickAdapter(providerName) {
    switch (providerName) {
        case 'anthropic':
            return streamAnthropic;
        case 'openai':
        case 'groq':
        case 'openrouter':
        case 'ollama':
        case 'deepseek':
        case 'qwen':
        case 'mistral':
        case 'xai':
        case 'together':
        case 'custom':
            return streamOpenAICompatible;
        case 'google':
            return streamGoogle;
        default:
            // Default fallback: assume OpenAI-compatible (most providers are)
            return streamOpenAICompatible;
    }
}

module.exports = { callLLM, LLMError, todaySpend };
