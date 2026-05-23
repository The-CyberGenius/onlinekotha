(function () {
    const chatContainer = document.getElementById('chat-container');
    const aiChatArea = document.getElementById('ai-chat-area');
    const aiMessages = document.getElementById('ai-messages');
    const bottomInput = document.getElementById('bottom-ai-input');
    const bottomSend = document.getElementById('bottom-ai-send');
    const sparkleBtn = document.getElementById('ask-ai-btn');
    const backBtn = document.getElementById('ai-back-to-chat');
    const newConvBtn = document.getElementById('ai-new-conv');
    const aiSubtitle = document.getElementById('ai-chat-subtitle');

    if (!aiChatArea || !bottomInput) return;

    let currentConversationId = null;
    let streaming = false;
    let aiMode = false;
    let lastLoadedChat = null;

    // ---------- Bottom bar input ----------
    bottomInput.addEventListener('input', () => {
        bottomSend.disabled = !bottomInput.value.trim() || streaming;
    });

    bottomInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleSend();
        }
    });

    bottomSend.addEventListener('click', handleSend);

    // ---------- Sparkle button toggles AI mode ----------
    if (sparkleBtn) {
        sparkleBtn.addEventListener('click', () => {
            if (!window.currentChat) { toast('Open a chat first'); return; }
            if (aiMode) {
                hideAIMode();
            } else {
                showAIMode();
            }
        });
    }

    // ---------- Back to chat ----------
    if (backBtn) backBtn.addEventListener('click', hideAIMode);

    // ---------- New conversation ----------
    if (newConvBtn) newConvBtn.addEventListener('click', () => {
        currentConversationId = null;
        lastLoadedChat = null;
        aiMessages.innerHTML = '';
        renderWelcome();
    });

    // ---------- Show / Hide AI mode ----------
    function showAIMode() {
        aiMode = true;
        chatContainer.classList.add('hidden');
        aiChatArea.classList.remove('hidden');
        aiChatArea.classList.add('flex');
        if (sparkleBtn) sparkleBtn.classList.add('ai-active');
        aiSubtitle.textContent = prettyName(window.currentChat);

        // Load existing conversation if switching to new chat
        if (lastLoadedChat !== window.currentChat) {
            currentConversationId = null;
            loadExistingConversation(window.currentChat);
            lastLoadedChat = window.currentChat;
        }

        bottomInput.focus();
    }

    function hideAIMode() {
        aiMode = false;
        chatContainer.classList.remove('hidden');
        aiChatArea.classList.add('hidden');
        aiChatArea.classList.remove('flex');
        if (sparkleBtn) sparkleBtn.classList.remove('ai-active');
    }

    // ---------- Load existing conversation ----------
    async function loadExistingConversation(chatFolder) {
        aiMessages.innerHTML = '';
        try {
            const r = await fetch(`/api/ai/conversations?chat=${encodeURIComponent(chatFolder)}`);
            const convs = await r.json();
            if (convs.length > 0) {
                const latest = convs[0];
                const r2 = await fetch(`/api/ai/conversations/${latest.id}`);
                const conv = await r2.json();
                currentConversationId = conv.id;
                if (conv.messages && conv.messages.length) {
                    for (const m of conv.messages) {
                        const b = addBubble(m.role, '');
                        if (m.role === 'assistant') {
                            b.innerHTML = renderAssistantText(m.content);
                            wireCitations(b);
                        } else {
                            b.textContent = m.content;
                        }
                    }
                    scrollAI();
                } else {
                    renderWelcome();
                }
            } else {
                renderWelcome();
            }
        } catch {
            renderWelcome();
        }
    }

    // ---------- Render welcome ----------
    function renderWelcome() {
        aiMessages.innerHTML = '';
        const w = document.createElement('div');
        w.className = 'ai-welcome text-center py-8 text-gray-500';
        w.innerHTML = `
            <div class="text-3xl mb-2">✨</div>
            <p class="font-bold text-gray-700 text-sm">Ask anything about your chat</p>
            <p class="text-xs mt-1">with <b>${escapeHTML(prettyName(window.currentChat))}</b></p>
        `;
        aiMessages.appendChild(w);
    }

    // ---------- Send ----------
    async function handleSend() {
        if (streaming) return;
        const text = bottomInput.value.trim();
        if (!text) return;
        if (!window.currentChat) { toast('Open a chat first'); return; }

        // Switch to AI mode if not already
        if (!aiMode) showAIMode();

        // Clear welcome
        const w = aiMessages.querySelector('.ai-welcome');
        if (w) w.remove();

        addBubble('user', text);
        bottomInput.value = '';
        bottomSend.disabled = true;
        streaming = true;

        const typingWrap = document.createElement('div');
        typingWrap.id = 'ai-typing-wrap';
        typingWrap.className = 'flex flex-col';
        typingWrap.innerHTML = '<div class="ai-bubble ai-bubble-assistant"><div class="ai-typing"><span></span><span></span><span></span></div></div>';
        aiMessages.appendChild(typingWrap);
        scrollAI();

        let assistantBubble = null;
        let fullText = '';

        try {
            const resp = await fetch('/api/ai/chat', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    chat: window.currentChat,
                    message: text,
                    conversationId: currentConversationId,
                }),
            });

            if (!resp.ok) {
                let errMsg = `Error ${resp.status}`;
                try { errMsg = (await resp.json()).error || errMsg; } catch {}
                typingWrap.remove();
                addErrorBubble(errMsg);
                streaming = false;
                bottomSend.disabled = !bottomInput.value.trim();
                return;
            }

            const reader = resp.body.getReader();
            const decoder = new TextDecoder();
            let buf = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buf += decoder.decode(value, { stream: true });

                let idx;
                while ((idx = buf.indexOf('\n\n')) !== -1) {
                    const block = buf.slice(0, idx);
                    buf = buf.slice(idx + 2);
                    let event = 'message';
                    let dataLines = [];
                    for (const line of block.split('\n')) {
                        if (line.startsWith('event:')) event = line.slice(6).trim();
                        else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
                    }
                    if (!dataLines.length) continue;
                    let data;
                    try { data = JSON.parse(dataLines.join('\n')); } catch { continue; }

                    if (event === 'start') {
                        currentConversationId = data.conversationId;
                    } else if (event === 'token') {
                        if (!assistantBubble) {
                            typingWrap.remove();
                            assistantBubble = addBubble('assistant', '');
                        }
                        fullText += data.text;
                        assistantBubble.innerHTML = renderAssistantText(fullText);
                        wireCitations(assistantBubble);
                        scrollAI();
                    } else if (event === 'done') {
                        if (assistantBubble) {
                            assistantBubble.innerHTML = renderAssistantText(fullText);
                            wireCitations(assistantBubble);
                        }
                    } else if (event === 'error') {
                        typingWrap.remove();
                        addErrorBubble(data.message || 'Something went wrong');
                    }
                }
            }
        } catch (err) {
            typingWrap.remove();
            addErrorBubble('Network error. Try again?');
        } finally {
            streaming = false;
            bottomSend.disabled = !bottomInput.value.trim();
            bottomInput.focus();
        }
    }

    // ---------- Helpers ----------
    function addBubble(role, text) {
        const wrap = document.createElement('div');
        wrap.className = 'flex flex-col';
        const b = document.createElement('div');
        b.className = `ai-bubble ${role === 'user' ? 'ai-bubble-user' : 'ai-bubble-assistant'}`;
        if (text) b.textContent = text;
        wrap.appendChild(b);
        aiMessages.appendChild(wrap);
        scrollAI();
        return b;
    }

    function addErrorBubble(msg) {
        const b = document.createElement('div');
        b.className = 'ai-bubble ai-bubble-error';
        b.textContent = msg;
        aiMessages.appendChild(b);
        scrollAI();
    }

    function scrollAI() {
        requestAnimationFrame(() => {
            aiMessages.scrollTop = aiMessages.scrollHeight;
        });
    }

    function renderAssistantText(text) {
        const escaped = escapeHTML(text);
        return escaped.replace(/\[#(\d+)\]/g, (_, id) =>
            `<span class="ai-cite" data-msg-id="${id}">#${id}</span>`
        );
    }

    function wireCitations(container) {
        container.querySelectorAll('.ai-cite').forEach(el => {
            el.onclick = () => {
                hideAIMode();
                if (window.scrollToMessageId) window.scrollToMessageId(Number(el.dataset.msgId));
            };
        });
    }

    function prettyName(s) {
        return (s || '').replace(/^WhatsApp Chat - /, '').replace(/_/g, ' ');
    }

    function escapeHTML(s) {
        return String(s || '').replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
        }[c]));
    }

    function toast(msg) {
        const t = document.createElement('div');
        t.textContent = msg;
        t.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#1f2937;color:white;padding:10px 18px;border-radius:12px;font-size:13px;font-weight:600;z-index:200;box-shadow:0 8px 24px rgba(0,0,0,0.2);opacity:0;transition:opacity 200ms';
        document.body.appendChild(t);
        requestAnimationFrame(() => t.style.opacity = '1');
        setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 250); }, 2400);
    }

    window.kothaToast = toast;
})();
