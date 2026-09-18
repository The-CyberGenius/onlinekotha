router.post('/playground', async (req, res) => {
    const { model_id, system_prompt, message } = req.body || {};
    if (!model_id || !message) return res.status(400).json({ error: 'model_id and message required' });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const controller = new AbortController();
    req.on('close', () => controller.abort());

    try {
        const messages = [{ role: 'user', content: message }];
        const result = await callModelDirectly({
            modelId: Number(model_id),
            messages,
            systemPrompt: system_prompt || '',
            userId: req.user.id,
            signal: controller.signal,
            maxTokens: 1024,
            temperature: 0.7,
            onToken: (text) => {
                res.write(`data: ${JSON.stringify(text)}\n\n`);
            }
        });
        res.write(`event: stats\ndata: ${JSON.stringify(result)}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
    } catch (err) {
        if (err.name === 'AbortError') {
            res.end();
            return;
        }
        res.write(`event: error\ndata: ${JSON.stringify({ error: err.message })}\n\n`);
        res.end();
    }
});
