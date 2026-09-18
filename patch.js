const fs = require('fs');
let code = fs.readFileSync('/var/www/onlinekotha/server/llm.js', 'utf8');

code = code.replace(
    'async function streamOpenAICompatible({ model, messages, systemPrompt, maxTokens, temperature, onToken, signal }) {',
    `async function streamOpenAICompatible({ model, messages, systemPrompt, maxTokens, temperature, onToken, signal }) {
    console.log("[DEBUG] streamOpenAICompatible called for model: " + model?.model_id);
    console.log("[DEBUG] Is signal provided?", !!signal);`
);

code = code.replace(
    'const resp = await fetch(url, {',
    `console.log("[DEBUG] About to fetch from: " + url);
    try {
    const resp = await fetch(url, {`
);

code = code.replace(
    '        signal,\n    });',
    `        signal,\n    });
    console.log("[DEBUG] fetch resolved with status: " + resp.status);`
);

code = code.replace(
    '    if (!resp.ok) {',
    `    } catch(err) {
        console.error("[DEBUG] fetch threw an error!", err);
        throw err;
    }
    if (!resp.ok) {`
);

code = code.replace(
    'async function callModelDirectly({ modelId, messages, systemPrompt, userId, onToken, signal, maxTokens = 1024, temperature = 0.7 }) {',
    `async function callModelDirectly({ modelId, messages, systemPrompt, userId, onToken, signal, maxTokens = 1024, temperature = 0.7 }) {
    console.log("[DEBUG] callModelDirectly called for modelId:", modelId);`
);

fs.writeFileSync('/var/www/onlinekotha/server/llm.js', code);
