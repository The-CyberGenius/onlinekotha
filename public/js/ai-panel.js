(function () {
    const chatContainer = document.getElementById('ai-chat-container');
    const scrollArea = document.getElementById('chat-scroll-area');
    const bottomInput = document.getElementById('bottom-ai-input');
    const bottomSend = document.getElementById('bottom-ai-send');

    if (!bottomInput || !bottomSend || !chatContainer || !scrollArea) return;

    // Per-chat conversation tracking
    let conversationMap = {};   // { chatFolder: conversationId }
    let contactNameMap = {};    // { chatFolder: contactName }
    let activeChat = null;
    let streaming = false;

    // Watch for chat switches — reset AI context per chat
    function getActiveChat() { return window.currentChat || null; }
    function getCurrentConvId() { return activeChat ? (conversationMap[activeChat] || null) : null; }
    function getContactName() { return activeChat ? (contactNameMap[activeChat] || '') : ''; }

    // ---------- Fix: multiple events for mobile compatibility ----------
    function updateSendBtn() {
        const hasText = bottomInput.value.trim().length > 0;
        bottomSend.disabled = !hasText || streaming;
        bottomSend.style.opacity = (!hasText || streaming) ? '0.4' : '1';
    }
    bottomInput.addEventListener('input', updateSendBtn);
    bottomInput.addEventListener('keyup', updateSendBtn);
    bottomInput.addEventListener('change', updateSendBtn);
    bottomInput.addEventListener('focus', updateSendBtn);
    bottomInput.addEventListener('blur', updateSendBtn);
    bottomInput.addEventListener('paste', () => setTimeout(updateSendBtn, 10));
    bottomInput.addEventListener('touchend', () => setTimeout(updateSendBtn, 50));

    // Periodic check as fallback for mobile keyboards
    setInterval(updateSendBtn, 500);

    bottomInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleSend();
        }
    });

    // Send on click — bypass disabled check, verify text directly
    bottomSend.addEventListener('click', () => {
        if (bottomInput.value.trim()) handleSend();
    });
    // Also handle touch for mobile
    bottomSend.addEventListener('touchend', (e) => {
        e.preventDefault();
        if (bottomInput.value.trim()) handleSend();
    });

    // ---------- Send ----------
    async function handleSend() {
        if (streaming) return;
        const text = bottomInput.value.trim();
        if (!text) return;
        if (!window.currentChat) { toast('Open a chat first'); return; }

        // Track which chat this message belongs to
        activeChat = getActiveChat();
        const convId = getCurrentConvId();
        const cName = getContactName();

        // Add user bubble to chat container
        appendUserBubble(text);
        bottomInput.value = '';
        bottomSend.disabled = true;
        streaming = true;

        // Add typing indicator
        const typingEl = document.createElement('div');
        typingEl.id = 'ai-typing-inline';
        typingEl.className = 'flex justify-start mb-3 animate-message';
        typingEl.innerHTML = `
            <div class="glass-chat-them rounded-2xl rounded-bl-md px-4 py-3 max-w-[75%]">
                <p class="text-[11px] font-bold mb-1 tracking-wide" style="color: #6366f1">✨ ${escapeHTML(cName || 'AI')}</p>
                <div class="ai-typing"><span></span><span></span><span></span></div>
            </div>
        `;
        chatContainer.appendChild(typingEl);
        scrollArea.scrollTop = scrollArea.scrollHeight;

        let fullText = '';
        let responseBubble = null;

        try {
            const resp = await fetch('/api/ai/chat', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    chat: activeChat,
                    message: text,
                    conversationId: convId,
                }),
            });

            if (!resp.ok) {
                let errMsg = `Error ${resp.status}`;
                try { errMsg = (await resp.json()).error || errMsg; } catch {}
                typingEl.remove();
                appendErrorBubble(errMsg);
                streaming = false;
                updateSendBtn();
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
                        // Save conversation per chat folder
                        if (activeChat) {
                            conversationMap[activeChat] = data.conversationId;
                            if (data.contactName) contactNameMap[activeChat] = data.contactName;
                        }
                    } else if (event === 'token') {
                        if (!responseBubble) {
                            typingEl.remove();
                            responseBubble = appendContactBubble(
                                (activeChat && contactNameMap[activeChat]) || data.contactName || 'AI'
                            );
                        }
                        fullText += data.text;
                        responseBubble.querySelector('.ai-response-text').textContent = fullText;
                        scrollArea.scrollTop = scrollArea.scrollHeight;
                    } else if (event === 'done') {
                        // Final
                    } else if (event === 'error') {
                        typingEl.remove();
                        appendErrorBubble(data.message || 'Something went wrong');
                    }
                }
            }
        } catch (err) {
            typingEl.remove();
            appendErrorBubble('Network error. Try again?');
        } finally {
            streaming = false;
            updateSendBtn();
            bottomInput.focus();
        }
    }

    // ---------- Bubble helpers ----------
    function appendUserBubble(text) {
        const wrap = document.createElement('div');
        wrap.className = 'flex justify-end mb-3 animate-message';
        wrap.innerHTML = `
            <div class="glass-chat-me rounded-2xl rounded-br-md px-4 py-3 max-w-[75%]">
                <p class="text-sm leading-relaxed text-white">${escapeHTML(text)}</p>
                <p class="text-[10px] text-white/60 text-right mt-1">just now</p>
            </div>
        `;
        chatContainer.appendChild(wrap);
        scrollArea.scrollTop = scrollArea.scrollHeight;
    }

    function appendContactBubble(name) {
        const wrap = document.createElement('div');
        wrap.className = 'flex justify-start mb-3 animate-message';
        wrap.innerHTML = `
            <div class="glass-chat-them rounded-2xl rounded-bl-md px-4 py-3 max-w-[75%]">
                <p class="text-[11px] font-bold mb-1 tracking-wide" style="color: #6366f1">✨ ${escapeHTML(name || 'AI')}</p>
                <p class="ai-response-text text-sm leading-relaxed text-gray-800"></p>
                <p class="text-[10px] text-gray-400 text-right mt-1">just now</p>
            </div>
        `;
        chatContainer.appendChild(wrap);
        scrollArea.scrollTop = scrollArea.scrollHeight;
        return wrap;
    }

    function appendErrorBubble(msg) {
        const wrap = document.createElement('div');
        wrap.className = 'flex justify-center mb-3 animate-message';
        wrap.innerHTML = `
            <div class="bg-red-50 border border-red-200 rounded-xl px-4 py-2 text-sm text-red-600 font-medium max-w-[85%] text-center">
                ${escapeHTML(msg)}
            </div>
        `;
        chatContainer.appendChild(wrap);
        scrollArea.scrollTop = scrollArea.scrollHeight;
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

    // ---------- Sparkle button focuses AI input ----------
    const sparkleBtn = document.getElementById('ask-ai-btn');
    if (sparkleBtn) {
        sparkleBtn.addEventListener('click', () => {
            bottomInput.focus();
            bottomInput.scrollIntoView({ behavior: 'smooth', block: 'end' });
        });
    }

    window.kothaLoadAiHistory = async (chatFolder) => {
        if (!chatFolder) return;
        chatContainer.innerHTML = '';
        activeChat = chatFolder;
        
        try {
            const resp = await fetch(`/api/ai/conversations?chat=${encodeURIComponent(chatFolder)}`);
            if (!resp.ok) return;
            const convs = await resp.json();
            
            if (convs && convs.length > 0) {
                const conv = convs[0];
                conversationMap[chatFolder] = conv.id;
                
                const msgResp = await fetch(`/api/ai/conversations/${conv.id}`);
                if (!msgResp.ok) return;
                const data = await msgResp.json();
                
                if (data.messages && data.messages.length > 0) {
                    data.messages.forEach(msg => {
                        if (msg.role === 'user') {
                            appendUserBubble(msg.content);
                        } else if (msg.role === 'assistant') {
                            const headerEl = document.getElementById('chat-header-name');
                            const name = (contactNameMap[chatFolder]) || (headerEl ? headerEl.innerText : 'AI');
                            const wrap = appendContactBubble(name);
                            wrap.querySelector('.ai-response-text').textContent = msg.content;
                        }
                    });
                    setTimeout(() => {
                        scrollArea.scrollTop = scrollArea.scrollHeight;
                    }, 50);
                }
            }
        } catch (e) {
            console.error("Failed to load AI history", e);
        }
    };

    window.kothaToast = toast;
})();
