(function () {
    const panel = document.getElementById('ai-panel');
    const backdrop = document.getElementById('ai-panel-backdrop');
    const openBtn = document.getElementById('ask-ai-btn');
    const closeBtn = document.getElementById('ai-close');
    const newBtn = document.getElementById('ai-new');
    const messagesEl = document.getElementById('ai-messages');
    const input = document.getElementById('ai-input');
    const sendBtn = document.getElementById('ai-send');
    const subtitle = document.getElementById('ai-subtitle');

    if (!panel || !openBtn) return;

    let currentConversationId = null;
    let streaming = false;
    let suggestions = [];

    // Auto-resize textarea
    input.addEventListener('input', () => {
        input.style.height = 'auto';
        input.style.height = Math.min(140, input.scrollHeight) + 'px';
        sendBtn.disabled = !input.value.trim() || streaming;
    });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    });

    sendBtn.addEventListener('click', handleSend);

    openBtn.addEventListener('click', openPanel);
    closeBtn.addEventListener('click', closePanel);
    backdrop.addEventListener('click', closePanel);
    newBtn.addEventListener('click', () => {
        currentConversationId = null;
        renderEmptyState();
    });

    // Keyboard escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && panel.classList.contains('open')) closePanel();
    });

    async function openPanel() {
        if (!window.currentChat) {
            toast('Open a chat first to ask questions');
            return;
        }
        panel.classList.add('open');
        backdrop.classList.add('open');
        subtitle.textContent = `About: ${window.currentChat}`;
        if (!suggestions.length) await loadSuggestions();
        renderEmptyState();
        setTimeout(() => input.focus(), 360);
    }

    function closePanel() {
        panel.classList.remove('open');
        backdrop.classList.remove('open');
    }

    async function loadSuggestions() {
        try {
            const r = await fetch('/api/ai/suggestions');
            const data = await r.json();
            suggestions = data.suggestions || [];
        } catch {
            suggestions = [];
        }
    }

    function renderEmptyState() {
        messagesEl.innerHTML = '';
        const welcome = document.createElement('div');
        welcome.className = 'ai-bubble ai-bubble-assistant';
        welcome.style.maxWidth = '100%';
        welcome.style.background = 'transparent';
        welcome.style.padding = '8px 4px';
        welcome.innerHTML = `
            <div class="text-gray-700 text-[15px] leading-relaxed">
                Hi! I've read your conversation with <b>${escapeHTML(prettyName(window.currentChat))}</b>.
                What would you like to know?
            </div>
        `;
        messagesEl.appendChild(welcome);

        if (suggestions.length) {
            const wrap = document.createElement('div');
            wrap.className = 'flex flex-col gap-2 mt-2';
            for (const s of suggestions) {
                const btn = document.createElement('button');
                btn.className = 'ai-suggestion';
                btn.textContent = s;
                btn.addEventListener('click', () => {
                    input.value = s;
                    input.dispatchEvent(new Event('input'));
                    handleSend();
                });
                wrap.appendChild(btn);
            }
            messagesEl.appendChild(wrap);
        }
    }

    function prettyName(s) {
        return (s || '').replace(/^WhatsApp Chat - /, '').replace(/_/g, ' ');
    }

    function escapeHTML(s) {
        return String(s || '').replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
        }[c]));
    }

    function addBubble(role, initialText = '') {
        const wrap = document.createElement('div');
        wrap.className = 'flex flex-col';
        const b = document.createElement('div');
        b.className = `ai-bubble ${role === 'user' ? 'ai-bubble-user' : 'ai-bubble-assistant'}`;
        b.dataset.role = role;
        b.textContent = initialText;
        wrap.appendChild(b);
        messagesEl.appendChild(wrap);
        scrollToBottom();
        return b;
    }

    function addTypingBubble() {
        const wrap = document.createElement('div');
        wrap.className = 'flex flex-col';
        const b = document.createElement('div');
        b.className = 'ai-bubble ai-bubble-assistant';
        b.innerHTML = '<div class="ai-typing"><span></span><span></span><span></span></div>';
        wrap.appendChild(b);
        messagesEl.appendChild(wrap);
        scrollToBottom();
        return b;
    }

    function addErrorBubble(msg) {
        const wrap = document.createElement('div');
        const b = document.createElement('div');
        b.className = 'ai-bubble ai-bubble-error';
        b.textContent = msg;
        wrap.appendChild(b);
        messagesEl.appendChild(wrap);
        scrollToBottom();
    }

    function scrollToBottom() {
        requestAnimationFrame(() => {
            messagesEl.scrollTop = messagesEl.scrollHeight;
        });
    }

    function clearSuggestionsIfPresent() {
        // Remove the welcome+suggestions block once first message is sent
        const containers = messagesEl.querySelectorAll('.flex.flex-col.gap-2');
        containers.forEach(c => {
            if (c.querySelector('.ai-suggestion')) c.remove();
        });
        // Remove welcome bubble
        const welcomeBubble = messagesEl.querySelector('.ai-bubble.ai-bubble-assistant[style*="transparent"]');
        if (welcomeBubble && welcomeBubble.parentElement) welcomeBubble.parentElement.remove();
    }

    async function handleSend() {
        if (streaming) return;
        const text = input.value.trim();
        if (!text) return;
        if (!window.currentChat) {
            toast('Open a chat first');
            return;
        }

        clearSuggestionsIfPresent();
        addBubble('user', text);
        input.value = '';
        input.style.height = 'auto';
        sendBtn.disabled = true;
        streaming = true;

        const typingBubble = addTypingBubble();
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
                typingBubble.parentElement.remove();
                if (resp.status === 402) {
                    addUpgradeBubble(errMsg);
                } else {
                    addErrorBubble(errMsg);
                }
                streaming = false;
                input.dispatchEvent(new Event('input'));
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
                            typingBubble.parentElement.remove();
                            assistantBubble = addBubble('assistant', '');
                        }
                        fullText += data.text;
                        assistantBubble.innerHTML = renderAssistantText(fullText);
                        wireCitations(assistantBubble);
                        scrollToBottom();
                    } else if (event === 'done') {
                        // final pass — ensure citations rendered
                        if (assistantBubble) {
                            assistantBubble.innerHTML = renderAssistantText(fullText);
                            wireCitations(assistantBubble);
                        }
                    } else if (event === 'error') {
                        if (typingBubble.parentElement) typingBubble.parentElement.remove();
                        addErrorBubble(data.message || 'Something went wrong');
                    }
                }
            }
        } catch (err) {
            if (typingBubble.parentElement) typingBubble.parentElement.remove();
            addErrorBubble('Network error. Try again?');
        } finally {
            streaming = false;
            input.dispatchEvent(new Event('input'));
            input.focus();
        }
    }

    function renderAssistantText(text) {
        // Convert [#123] to clickable spans
        const escaped = escapeHTML(text);
        return escaped.replace(/\[#(\d+)\]/g, (_, id) => {
            return `<span class="ai-cite" data-msg-id="${id}">#${id}</span>`;
        });
    }

    function wireCitations(container) {
        container.querySelectorAll('.ai-cite').forEach(el => {
            el.onclick = () => jumpToMessage(Number(el.dataset.msgId));
        });
    }

    function jumpToMessage(id) {
        // Hook called from script.js if available
        if (window.scrollToMessageId) {
            window.scrollToMessageId(id);
        }
    }

    function addUpgradeBubble(msg) {
        const wrap = document.createElement('div');
        wrap.className = 'flex flex-col items-center gap-3 py-6';
        wrap.innerHTML = `
            <div class="text-4xl">🔒</div>
            <div class="text-center">
                <div class="font-bold text-gray-900 text-base">${escapeHTML(msg)}</div>
                <div class="text-sm text-gray-500 mt-1">Continue chatting with your history</div>
            </div>
            <button class="bg-gray-900 text-white font-bold text-sm rounded-xl px-5 py-2.5 hover:bg-black transition">
                Upgrade — $5/mo
            </button>
        `;
        messagesEl.appendChild(wrap);
        scrollToBottom();
    }

    function toast(msg) {
        const t = document.createElement('div');
        t.textContent = msg;
        t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#1f2937;color:white;padding:10px 18px;border-radius:12px;font-size:13px;font-weight:600;z-index:200;box-shadow:0 8px 24px rgba(0,0,0,0.2);opacity:0;transition:opacity 200ms';
        document.body.appendChild(t);
        requestAnimationFrame(() => t.style.opacity = '1');
        setTimeout(() => {
            t.style.opacity = '0';
            setTimeout(() => t.remove(), 250);
        }, 2400);
    }

    // Expose toast for other modules
    window.kothaToast = toast;
})();
