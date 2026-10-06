
window.openUpgradeModal = function() {
    const modal = document.getElementById('upgrade-modal');
    if (modal) {
        modal.classList.remove('hidden');
        setTimeout(() => {
            modal.classList.remove('opacity-0');
            const card = modal.querySelector('.glass-upgrade-card');
            if(card) {
                card.classList.remove('scale-95');
                card.classList.add('scale-100');
            }
        }, 10);
    }
};

window.closeUpgradeModal = function() {
    const modal = document.getElementById('upgrade-modal');
    if (modal) {
        modal.classList.add('opacity-0');
        const card = modal.querySelector('.glass-upgrade-card');
        if(card) {
            card.classList.remove('scale-100');
            card.classList.add('scale-95');
        }
        setTimeout(() => {
            modal.classList.add('hidden');
        }, 400);
    }
};

document.addEventListener('DOMContentLoaded', () => {
    const chatContainer = document.getElementById('chat-container');
    const scrollArea = document.getElementById('chat-scroll-area');
    const headerName = document.getElementById('chat-header-name');
    const headerAvatar = document.getElementById('header-avatar');
    const sidebarAvatar = document.getElementById('sidebar-avatar');
    const sidebarTitle = document.getElementById('sidebar-title');
    const statsInfo = document.getElementById('stats-info');
    const searchBox = document.getElementById('search-box');
    const payBtn = document.getElementById('modal-pay-btn');
    const payMonthlyBtn = document.getElementById('modal-pay-monthly-btn');

    async function handlePayment(planType) {
        if (window.__IS_GUEST__) {
            window.closeUpgradeModal();
            window.openAuthModal("Please log in to upgrade to Pro.");
            return;
        }

        const btn = planType === 'pro_lifetime' ? payBtn : payMonthlyBtn;
        const originalText = btn.innerHTML;
        btn.innerHTML = '<span class="text-[14px] font-bold mx-auto">Redirecting to checkout...</span>';
        btn.disabled = true;
        btn.classList.add('opacity-75');

        // Pass metadata to Dodo checkout link so the webhook knows who paid
        const userId = window.__USER__ ? window.__USER__.id : '';
        const email = window.__USER__ ? window.__USER__.email : '';
        
        // Construct the checkout URL
        let checkoutUrl = '';
        if (planType === 'pro_lifetime') {
            checkoutUrl = `https://checkout.dodopayments.com/buy/pdt_0NmeknVE7dw1eni6bdKN1?quantity=1&metadata_user_id=${userId}&metadata_plan=${planType}&customer_email=${encodeURIComponent(email)}`;
        } else {
            checkoutUrl = `https://checkout.dodopayments.com/buy/pdt_0NmImonOlRx3cxyGfsvry?quantity=1&metadata_user_id=${userId}&metadata_plan=${planType}&customer_email=${encodeURIComponent(email)}`;
        }

        setTimeout(() => {
            window.location.href = checkoutUrl;
        }, 300);
    }

    const headerRenameBtn = document.getElementById('header-rename-btn');
    if (headerRenameBtn) {
        headerRenameBtn.addEventListener('click', async () => {
            if (!currentChat) return;
            let currentName = headerName.innerText;
            const subTitle = headerName.querySelector('span');
            if (subTitle) currentName = currentName.replace(subTitle.innerText, '').trim();
            
            const newName = prompt(`Rename "${currentName}" to:`, currentName);
            if (!newName || !newName.trim() || newName.trim() === currentName) return;
            const cleanNewName = newName.trim();
            try {
                const r = await fetch(`/api/chats/${encodeURIComponent(currentChat)}/rename`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ newName: cleanNewName })
                });
                if (!r.ok) throw new Error('Rename failed');
                
                if (!window._chatMetaCache) window._chatMetaCache = {};
                if (!window._chatMetaCache[currentChat]) window._chatMetaCache[currentChat] = {};
                window._chatMetaCache[currentChat].contactName = cleanNewName;
                
                headerName.innerText = cleanNewName;
                if (subTitle) headerName.appendChild(subTitle);
                
                if (typeof renderChatList === 'function' && loadedChats) {
                    renderChatList(loadedChats, currentChat);
                }
            } catch (err) {
                alert('Rename failed: ' + err.message);
            }
        });
    }

    if (payBtn) {
        payBtn.addEventListener('click', () => handlePayment('pro_lifetime'));
    }
    if (payMonthlyBtn) {
        payMonthlyBtn.addEventListener('click', () => handlePayment('pro_monthly'));
    }

    // Auto-trigger checkout if URL param is present
    const urlParams = new URLSearchParams(window.location.search);
    const checkoutPlan = urlParams.get('checkout');
    if (checkoutPlan === 'pro_lifetime' || checkoutPlan === 'pro_monthly' || checkoutPlan === '1') {
        const plan = checkoutPlan === '1' ? 'pro_lifetime' : checkoutPlan;
        setTimeout(() => {
            handlePayment(plan);
        }, 1000);
    }
    
    // Auto-trigger import modal if action=import is in URL
    const actionParam = urlParams.get('action');
    if (actionParam === 'import') {
        setTimeout(() => {
            const openUploadBtn = document.getElementById('open-upload-btn');
            if (openUploadBtn) openUploadBtn.click();
        }, 500);
    }

    // Chat Interface Logic
    const searchActionBtn = document.getElementById('search-action-btn');
    const searchClearBtn = document.getElementById('search-clear-btn');
    const resultsList = document.getElementById('results-list');

    // Search Modal Elements
    const searchModal = document.getElementById('search-modal');
    const closeSearchModalBtn = document.getElementById('close-search-modal');
    const searchModalResults = document.getElementById('search-modal-results');
    const searchModalStats = document.getElementById('search-modal-stats');

    const closeSearchModal = () => {
        if (!searchModal) return;
        searchModal.classList.remove('opacity-100');
        searchModal.classList.add('opacity-0');
        setTimeout(() => {
            searchModal.classList.add('hidden');
        }, 300);
    };

    if (closeSearchModalBtn) {
        closeSearchModalBtn.addEventListener('click', closeSearchModal);
    }
    if (searchModal) {
        searchModal.addEventListener('click', (e) => {
            if (e.target === searchModal) closeSearchModal();
        });
    }

    // Quick buttons
    const btnTop = document.getElementById('btn-top');
    const btnBottom = document.getElementById('btn-bottom');
    const btnMedia = document.getElementById('btn-media');
    
    const btnTop2 = document.getElementById('btn-top-2');
    const btnBottom2 = document.getElementById('btn-bottom-2');
    const btnMedia2 = document.getElementById('btn-media-2');

    // Mobile Sidebar Elements
    const sidebar = document.getElementById('sidebar');
    const openSidebarBtn = document.getElementById('open-sidebar-btn');
    const closeSidebarBtn = document.getElementById('close-sidebar-btn');

    // Modal Elements
    const mediaModal = document.getElementById('media-modal');
    const closeModal = document.getElementById('close-modal');
    const modalContent = document.getElementById('modal-content');

    const btnAnalytics = document.getElementById('btn-analytics');
    const btnAnalytics2 = document.getElementById('btn-analytics-2');
    const analyticsModal = document.getElementById('analytics-modal');
    const closeAnalytics = document.getElementById('close-analytics');
    const dynamicHeaderDate = document.getElementById('dynamic-header-date');

    let allMessages = [];
    window.getAllMessages = () => allMessages;
    let displayedMessages = [];
    let otherPersonName = "Contact";
    
    // Robust mobile check matching CSS exactly
    const isMobile = () => window.matchMedia('(max-width: 767px)').matches;
    let myName = null;
    let currentChat = '';
    let datePartsOrder = { monthIdx: 0, dayIdx: 1 }; // default MM/DD/YY

    // View state
    let renderStart = 0;
    let renderEnd = 0;
    const CHUNK_SIZE = 100;

    // Smart name cleaning — used everywhere names are displayed
    function cleanDisplayName(raw) {
        if (!raw) return '';
        let n = raw;
        // Strip WhatsApp prefixes
        n = n.replace(/^whatsapp[\s_-]*chat[\s_-]*(with[\s_-]*)?[-–—]?\s*/i, '');
        // Underscores → spaces
        n = n.replace(/_/g, ' ');
        // Trailing dates/numbers/junk
        n = n.replace(/[\s-]*\(?\d{4,}\)?[\s-]*$/g, '');
        n = n.replace(/[\s-]*\d{1,2}[\s/-]\d{1,2}[\s/-]\d{2,4}\s*$/g, '');
        n = n.replace(/[\s-]+\d+\s*$/g, '');
        n = n.replace(/\.(txt|zip|csv|json)\s*$/i, '');
        // Collapse spaces + trim
        n = n.replace(/\s{2,}/g, ' ').trim();
        // Title case
        if (n) n = n.replace(/\b\w+/g, w => w.charAt(0).toUpperCase() + w.slice(1));
        return n;
    }

    function isGarbageName(s) {
        if (!s) return true;
        const cleaned = s.replace(/[\s\-_+().]/g, '').toLowerCase();
        if (/^(user|contact|unknown|friend|you|me|myself|chat|group|whatsapp|whatsappchat)$/i.test(cleaned)) return true;
        // Mostly digits (phone numbers)
        const digitRatio = (cleaned.replace(/\D/g, '').length) / cleaned.length;
        if (digitRatio > 0.5) return true;
        if (cleaned.length < 2) return true;
        return false;
    }


    const closeMod = () => {
        mediaModal.classList.remove('opacity-100');
        mediaModal.classList.add('opacity-0');
        setTimeout(() => {
            mediaModal.classList.add('hidden');
            modalContent.innerHTML = '';
        }, 300);
    };

    closeModal.addEventListener('click', closeMod);
    mediaModal.addEventListener('click', (e) => {
        if (e.target === mediaModal) closeMod();
    });

    const getStringColor = (str, forceDark) => {
        const isDark = forceDark !== undefined ? forceDark : document.documentElement.classList.contains('dark');
        let hash = 0;
        for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
        let color = '#';
        for (let i = 0; i < 3; i++) {
            let value = (hash >> (i * 8)) & 0xFF;
            value = isDark ? (value % 100) + 155 : (value % 200) + 30;
            color += ('00' + value.toString(16)).substr(-2);
        }
        return color;
    };

    // Sidebar toggle — true = open, false = close, undefined = toggle
    const toggleSidebar = (open) => {
        if (!isMobile() && !window.kothaCompact) return; // desktop mode
        const backdrop = document.getElementById('sidebar-backdrop');
        if (open === true) {
            sidebar.classList.remove('-translate-x-full');
            sidebar.classList.add('translate-x-0');
            if (backdrop) backdrop.classList.remove('hidden');
        } else if (open === false) {
            sidebar.classList.add('-translate-x-full');
            sidebar.classList.remove('translate-x-0');
            if (backdrop) backdrop.classList.add('hidden');
        } else {
            sidebar.classList.toggle('-translate-x-full');
            sidebar.classList.toggle('translate-x-0');
            if (backdrop) backdrop.classList.toggle('hidden');
        }
    };

    // Expose for other modules
    window.kothaSidebarOpen = () => toggleSidebar(true);
    window.kothaSidebarClose = () => toggleSidebar(false);

    document.getElementById('open-sidebar-btn').addEventListener('click', () => toggleSidebar(true));
    document.getElementById('close-sidebar-btn').addEventListener('click', () => toggleSidebar(false));
    const sidebarBackdrop = document.getElementById('sidebar-backdrop');
    if (sidebarBackdrop) sidebarBackdrop.addEventListener('click', () => toggleSidebar(false));
    
    // Close chat button logic
    const closeChatBtn = document.getElementById('close-chat-btn');
    if (closeChatBtn) {
        closeChatBtn.addEventListener('click', () => {
            // ── Fully reset all chat state ──
            currentChat = '';
            window.currentChat = ''; localStorage.setItem("kotha_active_chat", '');
            allMessages = [];
            displayedMessages = [];
            renderStart = 0;
            renderEnd = 0;
            lastRenderedDate = '';
            isScrolling = false;
            
            // Clear the chat container content immediately
            if (chatContainer) chatContainer.innerHTML = '';
            const aiC = document.getElementById('ai-chat-container');
            if (aiC) aiC.innerHTML = '';
            
            // Update URL to remove ?chat=
            const urlParams = new URLSearchParams(window.location.search);
            if (urlParams.has('chat')) {
                window.history.pushState({}, '', window.location.pathname);
            }
            
            // Unselect all chats in the sidebar visually
            document.querySelectorAll('.chat-item').forEach(el => {
                el.classList.remove('bg-indigo-50/80', 'dark:bg-indigo-500/10', 'border-indigo-100', 'dark:border-indigo-500/20', 'shadow-sm');
                el.classList.add('hover:bg-slate-50', 'dark:hover:bg-white/5', 'border-transparent');
            });
            
            // Show the empty state screen
            showEmptyState();
            
            // On mobile, automatically re-open the sidebar since there's no chat to view
            if (isMobile() || window.kothaCompact) {
                toggleSidebar(true);
            }
        });
    }

    // Swipe left to close sidebar
    let sidebarTouchStartX = 0;
    sidebar.addEventListener('touchstart', e => {
        if (e.touches.length > 1) return;
        sidebarTouchStartX = e.touches[0].clientX;
    }, {passive: true});
    sidebar.addEventListener('touchend', e => {
        const deltaX = e.changedTouches[0].clientX - sidebarTouchStartX;
        if (deltaX < -50) { // Swiped left by 50px
            toggleSidebar(false);
        }
    });

    // Swipe right from left edge to open sidebar
    let edgeTouchStartX = 0;
    let edgeTouchStartY = 0;
    document.addEventListener('touchstart', e => {
        if (e.touches.length > 1) return;
        edgeTouchStartX = e.touches[0].clientX;
        edgeTouchStartY = e.touches[0].clientY;
    }, {passive: true});
    document.addEventListener('touchend', e => {
        const deltaX = e.changedTouches[0].clientX - edgeTouchStartX;
        const deltaY = Math.abs(e.changedTouches[0].clientY - edgeTouchStartY);
        if (edgeTouchStartX < 30 && deltaX > 50 && deltaY < 50) {
            toggleSidebar(true);
        }
    });

    // Desktop sidebar collapse/expand
    const collapseBtn = document.getElementById('collapse-sidebar-btn');
    const collapseIcon = document.getElementById('collapse-icon');
    if (collapseBtn) {
        const savedState = localStorage.getItem('kotha_sidebar_collapsed');
        if (savedState === '1') {
            sidebar.classList.add('sidebar-collapsed');
            if (collapseIcon) collapseIcon.style.transform = 'rotate(180deg)';
        }
        collapseBtn.addEventListener('click', () => {
            const collapsed = sidebar.classList.toggle('sidebar-collapsed');
            if (collapseIcon) collapseIcon.style.transform = collapsed ? 'rotate(180deg)' : '';
            localStorage.setItem('kotha_sidebar_collapsed', collapsed ? '1' : '0');
        });
    }

    const mobileFilterBtn = document.getElementById('mobile-filter-btn');
    if (mobileFilterBtn) {
        mobileFilterBtn.addEventListener('click', () => {
            // Force open the sidebar
            if (isMobile()) {
                toggleSidebar(true);
            }
            const container = document.getElementById('smart-filters-container');
            container.classList.remove('hidden'); // Focus filters
        });
    }

    function kothaLinkify(text) {
        if (!text) return '';
        const esc = String(text).replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
        }[c]));
        
        let processed = esc.replace(/(https?:\/\/[^\s<]+|www\.[^\s<]+)/gi, (url) => {
            const href = url.toLowerCase().startsWith('www.') ? `http://${url}` : url;
            return `<a href="${href}" target="_blank" rel="noopener noreferrer" class="chat-link" onclick="event.stopPropagation()">${url}</a>`;
        });
        
        const mediaRegex = /&lt;(image|video|audio|sticker|document|file):\s*([^&>]+)&gt;/gi;
        processed = processed.replace(mediaRegex, (match, type, filename) => {
            const chatFolder = window.currentChat || (window.location.pathname.includes('/chat/') ? window.location.pathname.split('/').pop() : '');
            const fileUrl = `/media/${encodeURIComponent(chatFolder)}/${encodeURIComponent(filename.trim())}`;
            const t = type.toLowerCase();
            if (t === 'image' || t === 'sticker') {
                return `<div class="relative overflow-hidden rounded-xl border border-black/10 dark:border-white/10 bg-white/80 dark:bg-black/40 flex items-center justify-center w-[200px] h-[200px] my-1"><img src="${fileUrl}" loading="lazy" class="w-full h-full object-contain rounded-lg cursor-zoom-in" onclick="if(window.openImageModal) window.openImageModal('${fileUrl}')" alt="${filename}"></div>`;
            } else if (t === 'video') {
                return `<div class="my-1 border border-black/10 dark:border-white/10 rounded-xl overflow-hidden max-w-[240px]"><video controls class="w-full h-auto max-h-[300px]"><source src="${fileUrl}"></video><a href="${fileUrl}" target="_blank" download class="block text-[10px] text-center bg-black/5 dark:bg-white/5 py-1 text-indigo-500 font-bold hover:underline">Download</a></div>`;
            } else if (t === 'audio') {
                return `<div class="my-1"><audio controls preload="metadata" class="h-10 w-64 max-w-full rounded-xl"><source src="${fileUrl}"></audio></div>`;
            } else {
                return `<div class="flex items-center gap-2 p-2 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg my-1 max-w-xs"><div class="text-xs font-bold w-8 h-8 flex items-center justify-center bg-white dark:bg-gray-800 rounded">DOC</div><a href="${fileUrl}" target="_blank" download class="text-[11px] font-bold text-indigo-500 hover:underline truncate w-full">${filename}</a></div>`;
            }
        });
        
        return processed;
    }
    window.kothaLinkify = kothaLinkify;

    const renderMessage = (msg, index, isConsecutive = false) => {
        const isMe = msg.sender === myName || msg.sender === 'You';

        let mediaHtml = '';
        if (msg.attachment && msg.type !== 'system') {
            const fileUrl = `/media/${encodeURIComponent(currentChat)}/${encodeURIComponent(msg.attachment)}`;

            if (msg.type === 'image') {
                mediaHtml = `
                    <div class="relative group/media overflow-hidden rounded-2xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 p-1.5 shadow-sm backdrop-blur-sm transition-all duration-300 hover:shadow-md hover:border-indigo-400/50 w-[240px] sm:w-[260px] h-[220px] sm:h-[240px] flex flex-col justify-between mb-1" onclick="openImageModal('${fileUrl}')">
                        <div class="relative overflow-hidden rounded-xl bg-white/80 dark:bg-black/40 flex items-center justify-center flex-1 w-full p-2.5">
                            <img src="${fileUrl}" loading="lazy" class="w-full h-full object-contain rounded-lg cursor-zoom-in transition-transform duration-300 group-hover/media:scale-105" alt="Image" onerror="this.onerror=null;this.src='../img/favicon.svg';">
                        </div>
                    </div>
                `;
            } else if (msg.type === 'video') {
                const vext = (msg.attachment.split('.').pop() || '').toLowerCase();
                // .mov = server sends video/mp4 (same H.264 container, Chrome can play it)
                // .mkv / .avi may not play in browser — show player + download fallback
                const browserPlayable = ['mp4', 'mov', 'm4v', 'webm', '3gp'].includes(vext);
                const vmime = vext === 'webm' ? 'video/webm'
                    : vext === '3gp' ? 'video/3gpp'
                    : 'video/mp4';
                mediaHtml = `
                    <div class="relative z-10 pointer-events-auto mb-1">
                        ${browserPlayable ? `
                        <video controls playsinline preload="metadata" class="w-64 max-w-full rounded-xl shadow-md border border-white/20 bg-black"
                            onerror="this.style.display='none';this.nextElementSibling.style.display='block'">
                            <source src="${fileUrl}" type="${vmime}">
                        </video>
                        <a href="${fileUrl}" target="_blank" download style="display:none" class="block text-[11px] font-bold ${isMe ? 'opacity-70' : 'text-indigo-500'} hover:underline mt-1">⬇ Can't play — Download video</a>
                        ` : `
                        <div class="w-64 h-16 rounded-xl bg-black/30 flex items-center justify-center text-xs text-gray-400">
                            <span>📹 ${escH(msg.attachment.split('/').pop() || 'video')}</span>
                        </div>
                        `}
                        <a href="${fileUrl}" target="_blank" download class="block text-[11px] font-bold ${isMe ? 'opacity-70' : 'text-indigo-500'} hover:underline mt-1">⬇ Download video</a>
                    </div>
                `;
            } else if (msg.type === 'audio') {
                mediaHtml = `
                    <div class="mb-2">
                        <audio controls preload="metadata" class="h-10 w-64 max-w-full rounded-xl shadow-sm ${isMe ? 'opacity-90' : 'opacity-100'}">
                            <source src="${fileUrl}" type="audio/mpeg">
                        </audio>
                    </div>
                `;
            } else {
                mediaHtml = `
                    <div class="flex items-center ${isMe ? 'doc-me' : 'doc-them'} p-3 rounded-xl gap-3 cursor-pointer hover:opacity-80 transition mb-1 border">
                        <div class="w-10 h-10 ${isMe ? 'doc-icon-me' : 'doc-icon-them'} rounded-lg flex items-center justify-center font-bold text-xs">DOC</div>
                        <div class="overflow-hidden">
                            <p class="text-sm font-semibold truncate">${msg.attachment}</p>
                            <a href="${fileUrl}" target="_blank" download class="text-xs font-bold uppercase hover:underline ${isMe ? 'opacity-70' : 'text-indigo-500'}">Download</a>
                        </div>
                    </div>
                `;
            }
        }

        let msgClass = isMe ? 'glass-chat-me ml-auto rounded-2xl rounded-tr-sm' : 'glass-chat-them mr-auto rounded-2xl rounded-tl-sm';
        if (isConsecutive) {
            msgClass = isMe ? 'glass-chat-me ml-auto rounded-2xl rounded-tr-md rounded-br-sm' : 'glass-chat-them mr-auto rounded-2xl rounded-tl-md rounded-bl-sm';
        }

        let nameHtml = '';
        if (!isMe && !isConsecutive) {
            nameHtml = `<p class="sender-name text-[11px] font-bold mb-1 tracking-wide" style="color: ${getStringColor(msg.sender)}">${msg.sender}</p>`;
        }

        let contentHtml = '';
        if (msg.text) {
            const onlyEmojis = /^[\u{1f300}-\u{1f5ff}\u{1f900}-\u{1f9ff}\u{1f600}-\u{1f64f}\u{1f680}-\u{1f6ff}\u{2600}-\u{26ff}\u{2700}-\u{27bf}\u{1f1e6}-\u{1f1ff}\u{1f191}-\u{1f251}\u{1f004}\u{1f0cf}\u{1f170}-\u{1f171}\u{1f17e}-\u{1f17f}\u{1f18e}\u{3030}\u{2b50}\u{2b55}\u{2934}-\u{2935}\u{2b05}-\u{2b07}\u{2b1b}-\u{2b1c}\u{3297}\u{3299}\u{303d}\u{00a9}\u{00ae}\u{2122}\u{23f3}\u{24c2}\u{23e9}-\u{23ef}\u{25b6}\u{23f8}-\u{23fa}\s]+$/gu;
            const isBigEmoji = msg.text.trim().length > 0 && msg.text.trim().length <= 6 && onlyEmojis.test(msg.text);
            contentHtml = `<p style="color:var(--msg-text)" class="${isBigEmoji ? 'text-4xl' : 'text-[14px]'} leading-normal font-medium whitespace-pre-wrap break-words select-text">${isBigEmoji ? msg.text : kothaLinkify(msg.text)}</p>`;
        }
        if (msg.type === 'system') {
            return `
            <div class="flex justify-center mb-4" id="msg-${msg.id}">
                <div class="glass-panel text-gray-600 text-[11px] px-4 py-2 font-medium rounded-full shadow-sm truncate max-w-xs md:max-w-md">
                    ${msg.text || msg.attachment}
                </div>
            </div>`;
        }

        const timeVar = isMe ? '--msg-time-me' : '--msg-time-them';
        const topMargin = isConsecutive ? 'mt-0.5' : 'mt-2';

        return `
            <div class="flex flex-col mb-1 w-full ${topMargin}" id="msg-${msg.id}">
                <div class="max-w-[80%] md:max-w-[70%] lg:max-w-[65%] relative px-3 py-1.5 md:px-3.5 md:py-2 ${msgClass} flex flex-col gap-0.5">
                    ${nameHtml}
                    ${mediaHtml}
                    ${contentHtml}
                    <div style="color:var(${timeVar})" class="text-[10px] flex items-center justify-end font-semibold mt-1 ml-auto select-none pt-0.5">
                        ${msg.time}
                        ${isMe ? `<svg class="w-3.5 h-3.5 ml-1 text-blue-500" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7" /></svg>` : ''}
                    </div>
                </div>
            </div>
        `;
    };

    window.openImageModal = (url) => {
        mediaModal.classList.remove('hidden');
        void mediaModal.offsetWidth;
        mediaModal.classList.remove('opacity-0');
        mediaModal.classList.add('opacity-100');
        modalContent.innerHTML = `<img src="${url}" class="max-w-full max-h-[85vh] object-contain rounded-2xl shadow-2xl border-4 border-white/20">`;
    };

    // ---------- Date formatting ----------
    function formatChatDate(raw) {
        if (!raw) return '';
        let d;
        if (raw.includes('-')) {
            // YYYY-MM-DD format (ISO style from desktop regex)
            const parts = raw.split('-');
            if (parts.length === 3) {
                d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
            }
        } else if (raw.includes('/')) {
            // DD/MM/YY format (Indian WhatsApp style)
            const parts = raw.split('/');
            if (parts.length === 3) {
                const day = parseInt(parts[0]);
                const month = parseInt(parts[1]);
                let year = parts[2].length === 2 ? 2000 + parseInt(parts[2]) : parseInt(parts[2]);
                d = new Date(year, month - 1, day);
                // Fallback to MM/DD/YY if the parsed date is in the future
                if (d > new Date()) {
                    const altD = new Date(year, day - 1, month);
                    if (altD <= new Date()) {
                        d = altD;
                    }
                }
            }
        }
        if (!d || isNaN(d.getTime())) return raw;
        return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
    }

    let lastRenderedDate = '';

    const generateChatsHtml = (snippet) => {
        const frag = document.createDocumentFragment();
        snippet.forEach((msg, idx) => {
            if (msg.date && msg.date !== lastRenderedDate) {
                const dateSep = document.createElement('div');
                dateSep.className = 'flex justify-center mb-6 w-full date-separator';
                dateSep.setAttribute('data-date', msg.date);
                dateSep.innerHTML = `<span class="bg-[#E1F2FB] dark:bg-[#182229] text-[#54656f] dark:text-[#8696a0] text-[12.5px] px-3 py-1 rounded-lg shadow-sm font-medium">${formatChatDate(msg.date)}</span>`;
                frag.appendChild(dateSep);
                lastRenderedDate = msg.date;
            }
            let isConsecutive = false;
            if (idx > 0) {
                const prevMsg = snippet[idx - 1];
                if (prevMsg.sender === msg.sender && prevMsg.type !== 'system' && msg.type !== 'system' && prevMsg.date === msg.date) {
                    isConsecutive = true;
                }
            }
            const wrapper = document.createElement('div');
            wrapper.innerHTML = renderMessage(msg, idx, isConsecutive);
            while (wrapper.firstChild) frag.appendChild(wrapper.firstChild);
        });
        return frag;
    };

    const renderChats = (startIndex, endIndex, mode = 'reset') => {
        if (mode === 'reset' && (startIndex === -1 || endIndex === -1 || startIndex >= endIndex || displayedMessages.length === 0)) {
            lastRenderedDate = '';
            chatContainer.innerHTML = '<div class="text-center py-12 text-sm text-gray-400 dark:text-gray-500 italic">No messages found matching current filters.</div>';
            renderStart = 0;
            renderEnd = 0;
            return;
        }

        const snippet = displayedMessages.slice(startIndex, endIndex);

        if (snippet.length === 0) return;

        if (mode === 'reset') {
            lastRenderedDate = '';
            chatContainer.innerHTML = '';
            chatContainer.appendChild(generateChatsHtml(snippet));
            renderStart = startIndex;
            renderEnd = endIndex;
        } else if (mode === 'older') {
            lastRenderedDate = '';
            const frag = generateChatsHtml(snippet);
            const oldScroll = scrollArea.scrollHeight;
            chatContainer.insertBefore(frag, chatContainer.firstChild);
            scrollArea.scrollTop += (scrollArea.scrollHeight - oldScroll);
            renderStart = startIndex;
        } else if (mode === 'newer') {
            lastRenderedDate = displayedMessages[renderEnd - 1]?.date || '';
            const frag = generateChatsHtml(snippet);
            chatContainer.appendChild(frag);
            renderEnd = endIndex;
        }

        // Remove loaders visually as we approach the edges
        const topLoader = document.getElementById('top-loader');
        if (topLoader && renderStart === 0) topLoader.remove();
    };

    window.loadOlder = () => {
        if (!currentChat || renderStart <= 0 || displayedMessages.length === 0) return;
        const newStart = Math.max(0, renderStart - CHUNK_SIZE);
        renderChats(newStart, renderStart, 'older');

        // Optional Memory Prune: Keep max 600 nodes
        if (renderEnd - renderStart > 600) {
            renderEnd -= CHUNK_SIZE;
            for (let i = 0; i < CHUNK_SIZE && chatContainer.lastElementChild; i++) {
                chatContainer.removeChild(chatContainer.lastElementChild);
            }
        }
    };

    window.loadNewer = () => {
        if (!currentChat || renderEnd >= displayedMessages.length || displayedMessages.length === 0) return;
        const newEnd = Math.min(displayedMessages.length, renderEnd + CHUNK_SIZE);
        const oldScroll = scrollArea.scrollTop;
        renderChats(renderEnd, newEnd, 'newer');

        // Prune from top
        if (renderEnd - renderStart > 600) {
            renderStart += CHUNK_SIZE;
            for (let i = 0; i < CHUNK_SIZE && chatContainer.firstElementChild; i++) {
                chatContainer.removeChild(chatContainer.firstElementChild);
            }
            scrollArea.scrollTop = oldScroll; // Maintain visual position
        }
    };

    let isScrolling = false;
    let scrollTimeout;
    let _scrollRaf = null;
    const floatingDate = document.getElementById('floating-date');

    // Cached date string for header — avoid repeated DOM updates
    let _lastHeaderDateStr = '';

    function parseMsgDate(dateStr) {
        if (!dateStr) return null;
        let day, mon, y;
        if (dateStr.includes('-')) {
            const parts = dateStr.split('-');
            if (parts.length !== 3) return null;
            y = parseInt(parts[0]);
            mon = parseInt(parts[1]);
            day = parseInt(parts[2]);
        } else if (dateStr.includes('/')) {
            const parts = dateStr.split('/');
            if (parts.length !== 3) return null;
            day = parseInt(parts[0]);
            mon = parseInt(parts[1]);
            y = parts[2].length === 2 ? 2000 + parseInt(parts[2]) : parseInt(parts[2]);
            
            // Fallback to MM/DD/YY if the parsed date is in the future
            const d = new Date(y, mon - 1, day);
            if (d > new Date()) {
                const altD = new Date(y, day - 1, mon);
                if (altD <= new Date()) {
                    const temp = day;
                    day = mon;
                    mon = temp;
                }
            }
        } else {
            return null;
        }
        return { day, mon, y };
    }

    scrollArea.addEventListener('scroll', () => {
        // ── Guard: skip ALL scroll processing when no chat is open ──
        if (!currentChat || currentChat === '__global__') return;

        // Use rAF to batch scroll work — prevents layout thrashing
        if (!_scrollRaf) {
            _scrollRaf = requestAnimationFrame(() => {
                _scrollRaf = null;

                // ── Floating date + header date ── 
                // OPTIMIZED: Use array index instead of DOM querySelectorAll scan
                if (floatingDate && displayedMessages.length > 0) {
                    // Estimate visible message index from scroll position ratio
                    const scrollRatio = scrollArea.scrollTop / Math.max(1, scrollArea.scrollHeight - scrollArea.clientHeight);
                    const estimatedIdx = renderStart + Math.floor((renderEnd - renderStart) * scrollRatio);
                    const clampedIdx = Math.max(renderStart, Math.min(estimatedIdx, renderEnd - 1));

                    // Find date from displayedMessages array — O(1) vs O(n) DOM scan
                    const visibleMsg = displayedMessages[clampedIdx];
                    let closestDate = null;
                    if (visibleMsg && visibleMsg.date) {
                        const pd = parseMsgDate(visibleMsg.date);
                        if (pd) {
                            const dateObj = new Date(pd.y, pd.mon - 1, pd.day);
                            const monthName = dateObj.toLocaleString('en-IN', { month: 'long' });
                            closestDate = `${pd.day} ${monthName} ${pd.y}`;
                        }
                    }

                    if (closestDate) {
                        // Check if AI section is visible and override closestDate
                        const aiContainer = document.getElementById('ai-chat-container');
                        if (aiContainer && aiContainer.childElementCount > 0) {
                            const aiTopOffset = aiContainer.offsetTop;
                            const scrollPos = scrollArea.scrollTop + scrollArea.clientHeight;
                            if (aiTopOffset < scrollPos - 50) {
                                const aiSeps = aiContainer.getElementsByClassName('ai-date-separator');
                                if (aiSeps.length > 0) {
                                    let closestSep = aiSeps[aiSeps.length - 1];
                                    const threshold = scrollArea.scrollTop + 50;
                                    for (let i = 0; i < aiSeps.length; i++) {
                                        // offsetTop is much faster than getBoundingClientRect
                                        if (aiSeps[i].offsetTop > threshold) {
                                            closestSep = i > 0 ? aiSeps[i - 1] : aiSeps[i];
                                            break;
                                        }
                                    }
                                    if (closestSep) {
                                        closestDate = closestSep.getAttribute('data-date') || closestDate;
                                    }
                                }
                            }
                        }

                        floatingDate.innerText = closestDate;
                        floatingDate.classList.remove('opacity-0');
                        floatingDate.classList.add('opacity-100');

                        if (dynamicHeaderDate && closestDate !== _lastHeaderDateStr && currentChat !== 'kotha_assistant') {
                            _lastHeaderDateStr = closestDate;
                            dynamicHeaderDate.innerText = closestDate;
                            dynamicHeaderDate.classList.remove('hidden');
                        }
                    }

                    clearTimeout(scrollTimeout);
                    scrollTimeout = setTimeout(() => {
                        floatingDate.classList.add('opacity-0', 'translate-y-[-10px]');
                        floatingDate.classList.remove('opacity-100', 'translate-y-0');
                    }, 1500);
                }

                // ── Infinite scroll: load older/newer chunks ──
                if (!isScrolling) {
                    if (scrollArea.scrollTop <= 400 && renderStart > 0) {
                        isScrolling = true;
                        window.loadOlder();
                        setTimeout(() => { isScrolling = false; }, 250);
                    }

                    if (Math.abs((scrollArea.scrollHeight - scrollArea.scrollTop) - scrollArea.clientHeight) <= 400 && renderEnd < displayedMessages.length) {
                        isScrolling = true;
                        window.loadNewer();
                        setTimeout(() => { isScrolling = false; }, 250);
                    }
                }
            });
        }
    }, { passive: true });

    const detectDateFormat = (messages) => {
        for (const msg of messages) {
            if (!msg.date) continue;
            const parts = msg.date.split('/');
            if (parts.length === 3) {
                const val0 = parseInt(parts[0], 10);
                const val1 = parseInt(parts[1], 10);
                if (val0 > 12) return { monthIdx: 1, dayIdx: 0 }; // DD/MM/YY
                if (val1 > 12) return { monthIdx: 0, dayIdx: 1 }; // MM/DD/YY
            }
        }
        return { monthIdx: 0, dayIdx: 1 }; // default MM/DD/YY
    };

    const animatePlaceholder = (inputEl, text) => {
        if (!inputEl) return;
        inputEl.targetPlaceholderText = text;

        if (inputEl.placeholderTimer) clearTimeout(inputEl.placeholderTimer);
        if (inputEl.cursorTimer) clearInterval(inputEl.cursorTimer);

        let index = 0;
        let currentText = '';
        const cursorChar = ' |';

        const type = () => {
            const currentTarget = inputEl.targetPlaceholderText || text;
            if (document.activeElement === inputEl) {
                inputEl.placeholder = currentTarget;
                return;
            }
            if (index < currentTarget.length) {
                currentText += currentTarget[index];
                inputEl.placeholder = currentText + cursorChar;
                index++;
                const delay = currentTarget[index - 1] === ' ' ? 80 : (35 + Math.random() * 40);
                inputEl.placeholderTimer = setTimeout(type, delay);
            } else {
                let showCursor = true;
                inputEl.placeholder = currentTarget + cursorChar;
                inputEl.cursorTimer = setInterval(() => {
                    if (document.activeElement === inputEl) {
                        inputEl.placeholder = currentTarget;
                        clearInterval(inputEl.cursorTimer);
                        return;
                    }
                    showCursor = !showCursor;
                    inputEl.placeholder = currentTarget + (showCursor ? cursorChar : '  ');
                }, 500);
            }
        };

        if (!inputEl.placeholderListenersAdded) {
            inputEl.placeholderListenersAdded = true;
            inputEl.addEventListener('focus', () => {
                if (inputEl.placeholderTimer) clearTimeout(inputEl.placeholderTimer);
                if (inputEl.cursorTimer) clearInterval(inputEl.cursorTimer);
                inputEl.placeholder = inputEl.targetPlaceholderText || text;
            });
            inputEl.addEventListener('blur', () => {
                if (!inputEl.value) {
                    animatePlaceholder(inputEl, inputEl.targetPlaceholderText || text);
                }
            });
        }

        type();
    };

    const loadData = async (chatName) => {
        // Mark messages for this chat as still loading so features (e.g. Wrapped)
        // don't show stale data from a previously opened chat (no mismatch).
        window.kothaChatLoading = true;
        window.kothaLoadedChat = null;
        try {
            // Block UI while we check/ensure identity
            showSkeleton();
            statsInfo.innerText = 'Loading identity...';

            if (typeof window.ensureIdentity === 'function') {
                const identityConfirmed = await window.ensureIdentity(chatName);
                if (!identityConfirmed) {
                    window.kothaChatLoading = false;
                    currentChat = '';
                    showEmptyState();
                    return; // Abort loading if identity wasn't confirmed
                }
            }

            // ── Client-side cache: re-opening a chat is instant (no network/re-fetch) ──
            if (!window._chatMsgCache) window._chatMsgCache = {};
            let data = window._chatMsgCache[chatName];

            if (!data) {
                statsInfo.innerText = 'Loading...';
                
                if (chatName === 'kotha_assistant') {
                    // Load assistant from local storage
                    const stored = localStorage.getItem('kotha_assistant_history');
                    let history = [];
                    if (stored) {
                        try { history = JSON.parse(stored); } catch(e){}
                    }
                    if (history.length === 0) {
                        const todayIso = new Date().toLocaleDateString('en-CA');
                        history = [
                            {
                                text: "Hi there! 👋 I'm Kotha Assistant, the official in-app AI assistant for OnlineKotha. How can I help you today? Ask me about exporting WhatsApp chats, how AI chat works, Wrapped, or our plans!",
                                sender: "Kotha Assistant",
                                time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
                                date: todayIso
                            }
                        ];
                    }
                    data = history;
                    window._chatMsgCache[chatName] = data;
                } else {
                    const resp = await fetch(`/api/messages?chat=${encodeURIComponent(chatName)}`);
                    data = await resp.json();

                    if (data.error) {
                        statsInfo.innerText = "Error: " + data.error;
                        window.kothaChatLoading = false;
                        return;
                    }
                    // Stash in cache for instant re-open
                    window._chatMsgCache[chatName] = data;
                }
            }

            // Safety: if the user switched to a different chat while this was
            // loading, abort — never render one chat's data under another's name.
            if (currentChat !== chatName) { window.kothaChatLoading = false; return; }

            allMessages = data;
            // Messages now belong to this chat — safe for Wrapped to read.
            window.kothaLoadedChat = chatName;
            if (window.preloadWrappedStory) window.preloadWrappedStory(chatName);
            window.kothaChatLoading = false;
            displayedMessages = allMessages; // Default view is everything
            datePartsOrder = detectDateFormat(allMessages);

            // Cache last message preview for sidebar display
            if (!window._chatMetaCache) window._chatMetaCache = {};
            if (allMessages.length > 0) {
                // Backward loop instead of [...arr].reverse() — avoids copying huge arrays
                let lastTextMsg = null, count = 0;
                for (let i = allMessages.length - 1; i >= 0; i--) {
                    const m = allMessages[i];
                    if (m.type !== 'system') {
                        count++;
                        if (!lastTextMsg && m.text) lastTextMsg = m;
                    }
                }
                window._chatMetaCache[chatName] = {
                    ...window._chatMetaCache[chatName],
                    lastMessage: lastTextMsg ? (lastTextMsg.text.length > 40 ? lastTextMsg.text.slice(0, 40) + '…' : lastTextMsg.text) : '',
                    lastTime: lastTextMsg?.time || '',
                    count: count,
                };
            }

            // Clear previous dynamically added filters if changing chats
            const participantContainer = document.getElementById('participant-filters-container');
            if (participantContainer) {
                participantContainer.innerHTML = '';
                participantContainer.classList.add('hidden');
            }

            if (chatName === 'kotha_assistant') {
                otherPersonName = 'Kotha Assistant';
                const uName = (window.__USER__ && (window.__USER__.display_name || window.__USER__.email?.split('@')[0])) || 'You';
                myName = uName;
                if (typeof window.kothaSetMyName === 'function') {
                    window.kothaSetMyName(uName, 'Kotha Assistant');
                }
                if (!window._chatMetaCache) window._chatMetaCache = {};
                if (!window._chatMetaCache['kotha_assistant']) window._chatMetaCache['kotha_assistant'] = {};
                window._chatMetaCache['kotha_assistant'].contactName = 'Kotha Assistant';
                window._chatMetaCache['kotha_assistant'].isGroup = false;

                if (headerName) {
                    headerName.innerHTML = `Kotha Assistant <span class="text-[11px] font-normal text-emerald-500 block -mt-0.5">Online · Official Guide</span>`;
                }
                if (headerAvatar) {
                    headerAvatar.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/></svg>`;
                    headerAvatar.style.background = 'linear-gradient(135deg, #8b5cf6, #ec4899)';
                    headerAvatar.className = 'w-10 h-10 rounded-full flex items-center justify-center text-white shrink-0 shadow-sm';
                }
                if (dynamicHeaderDate) {
                    dynamicHeaderDate.innerText = '';
                    dynamicHeaderDate.classList.add('hidden');
                }
                _lastHeaderDateStr = '';
                if (sidebarAvatar) sidebarAvatar.innerText = 'K';

                const groupRolesBtn = document.getElementById('group-roles-btn');
                if (groupRolesBtn) groupRolesBtn.classList.add('hidden');

                sidebarTitle.innerText = "All Chats";
                renderChatList(loadedChats, currentChat);

                const bottomAiInput = document.getElementById('bottom-ai-input');
                if (bottomAiInput) {
                    animatePlaceholder(bottomAiInput, 'Ask Kotha Assistant anything…');
                }

                statsInfo.innerHTML = `Kotha Assistant · Official OnlineKotha Guide`;

                renderChats(-1, -1);
                const end = displayedMessages.length;
                const start = Math.max(0, end - CHUNK_SIZE);
                renderChats(start, end, 'reset');
                setTimeout(() => { scrollArea.scrollTop = scrollArea.scrollHeight; }, 10);
                return;
            }

            if (allMessages.length > 0) {
                const senderCounts = {};
                let totalMessages = 0;
                allMessages.forEach(msg => {
                    if (msg.sender && msg.type !== 'system') {
                        senderCounts[msg.sender] = (senderCounts[msg.sender] || 0) + 1;
                        totalMessages++;
                    }
                });

                const sortedSenders = Object.keys(senderCounts).sort((a, b) => senderCounts[b] - senderCounts[a]);
                const dynamicThreshold = Math.max(5, totalMessages * 0.01);
                const realParticipants = sortedSenders.filter(s => senderCounts[s] >= dynamicThreshold && !s.toLowerCase().includes('http') && !s.toLowerCase().includes('www.'));
                if (realParticipants.length === 0) realParticipants.push(...sortedSenders);

                let isGroupChatFrontend = realParticipants.length > 2;
                if (isGroupChatFrontend && sortedSenders.length >= 2) {
                    const top2Messages = senderCounts[sortedSenders[0]] + senderCounts[sortedSenders[1]];
                    if (top2Messages / Math.max(totalMessages, 1) > 0.95) {
                        isGroupChatFrontend = false;
                        realParticipants.length = 2; // Trim to top 2
                        realParticipants[0] = sortedSenders[0];
                        realParticipants[1] = sortedSenders[1];
                    }
                }

                // Override senders array format to match existing code `[[name, count], ...]`
                const senders = realParticipants.map(s => [s, senderCounts[s]]);
                const senderNames = realParticipants;
                const chatContactName = chatName.replace('WhatsApp Chat - ', '');
                
                // ── Change Identity Button ──
                const groupRolesBtn = document.getElementById('group-roles-btn');
                if (groupRolesBtn) {
                    groupRolesBtn.classList.remove('hidden');
                    groupRolesBtn.innerHTML = `
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
                        <span>Change Identity</span>
                    `;
                    groupRolesBtn.onclick = () => {
                        if (typeof window.ensureIdentity === 'function') {
                            window.ensureIdentity(chatName, true).then(() => {
                                // Re-render chat entirely after change
                                lastRenderedDate = '';
                                chatContainer.innerHTML = '';
                                const end = Math.min(displayedMessages.length, renderStart + (renderEnd - renderStart || 100));
                                renderChats(renderStart, end, 'reset');
                            });
                        }
                    };
                }

                // Identity is already set by ensureIdentity() earlier in loadData.
                // We do NOT overwrite myName or otherPersonName here.
                if (!myName) {
                    console.warn('[IDENTITY FLOW] myName is still null after ensureIdentity! Assuming identityStatus is required.');
                }


                const isGroupChat = data.isGroup || isGroupChatFrontend;
                const actualGroupName = window._chatMetaCache?.[chatName]?.contactName || chatContactName;

                if (isGroupChat) {
                    headerName.innerText = actualGroupName.replace(/(Group, d+ members)/, '').trim();
                    const participantCount = data.participants ? data.participants.length : senderNames.length;
                    const subTitle = document.createElement('span');
                    subTitle.className = 'text-[11px] font-normal text-gray-400 block -mt-1';
                    subTitle.innerText = `${participantCount} members`;
                    headerName.appendChild(subTitle);
                    
                    headerAvatar.innerHTML = `<svg class="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>`;
                    if (sidebarAvatar) sidebarAvatar.innerText = 'G';
                } else {
                    headerName.innerText = otherPersonName;
                    if (otherPersonName) {
                        headerAvatar.innerText = otherPersonName.charAt(0).toUpperCase();
                        headerAvatar.style.background = '';
                        headerAvatar.className = 'w-10 h-10 rounded-full flex items-center justify-center font-bold text-white shadow-sm bg-gradient-to-br from-emerald-400 to-teal-500 text-sm';
                        if (sidebarAvatar) sidebarAvatar.innerText = 'C';
                    }
                }
                
                sidebarTitle.innerText = "All Chats";

                if (window._chatMetaCache[chatName] && chatName !== 'kotha_assistant') {
                    window._chatMetaCache[chatName].contactName = isGroupChat ? actualGroupName : otherPersonName;
                }
                renderChatList(loadedChats, currentChat);

                // Animate bottom input placeholder typewriter effect
                const bottomAiInput = document.getElementById('bottom-ai-input');
                if (bottomAiInput) {
                    animatePlaceholder(bottomAiInput, isGroupChat ? `Continue With virtual Group Chat…` : `Continue With virtual ${otherPersonName}…`);
                }

                statsInfo.innerHTML = `Loaded <span class="font-bold text-blue-600 dark:text-blue-400">${allMessages.length.toLocaleString()}</span> messages dynamically.`;

                // Add Sender Filters to the Participant Container automatically (toggle on/off)
                let activeSenderFilter = null;
                const senderBtns = [];
                
                if (senders.length > 0 && participantContainer) {
                    participantContainer.classList.remove('hidden');
                    
                    const headerRow = document.createElement('div');
                    headerRow.className = 'flex items-center justify-between px-3 py-1.5 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition';
                    
                    const leftCol = document.createElement('div');
                    leftCol.className = 'flex items-center gap-1.5';
                    leftCol.innerHTML = `
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="text-gray-400">
                            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                            <circle cx="9" cy="7" r="4"></circle>
                            <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                            <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                        </svg>
                        <span class="text-[9px] font-bold text-gray-500 uppercase tracking-widest">Participants</span>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="text-gray-400 transition-transform duration-200" id="participant-chevron">
                            <path d="M6 9l6 6 6-6"></path>
                        </svg>
                    `;

                    const rightCol = document.createElement('div');
                    rightCol.className = 'flex items-center gap-1.5';
                    
                    const avatarsWrap = document.createElement('div');
                    avatarsWrap.className = 'flex items-center -space-x-1.5 mr-0.5';
                    
                    const topSenders = senders.slice(0, 3);
                    topSenders.forEach(([sName]) => {
                        const av = document.createElement('div');
                        av.className = 'w-4 h-4 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 text-white flex items-center justify-center text-[8px] font-bold border border-white dark:border-[#111b21] shadow-sm';
                        av.innerText = sName.charAt(0).toUpperCase();
                        avatarsWrap.appendChild(av);
                    });

                    rightCol.appendChild(avatarsWrap);
                    
                    const countSpan = document.createElement('span');
                    countSpan.className = 'text-[10px] font-medium text-gray-500 flex items-center gap-1.5';
                    const formatNum = n => n > 9999 ? (n/1000).toFixed(1) + 'k' : n.toLocaleString();
                    countSpan.innerHTML = `<span class="bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.5 rounded font-bold tracking-tight">${formatNum(totalMessages)} msgs</span> <span>${senders.length} participants &gt;</span>`;
                    rightCol.appendChild(countSpan);

                    headerRow.appendChild(leftCol);
                    headerRow.appendChild(rightCol);
                    participantContainer.appendChild(headerRow);

                    const expandedContent = document.createElement('div');
                    expandedContent.className = 'hidden flex flex-col gap-3 border-t border-gray-100 dark:border-gray-800 pt-3 pb-3 px-3';
                    
                    // Add quick stats strip
                    let activeDays = new Set(allMessages.map(m => m.date)).size;
                    let mediaCount = allMessages.filter(m => m.text && (m.text.includes('<Media omitted>') || m.text.includes('image omitted') || m.text.includes('video omitted') || m.text.includes('sticker omitted'))).length;
                    
                    const statsStrip = document.createElement('div');
                    statsStrip.className = 'flex items-center gap-2 mb-1';
                    statsStrip.innerHTML = `
                        <div class="flex-1 bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-indigo-950/30 dark:to-blue-900/20 rounded-lg p-2 text-center border border-indigo-100/50 dark:border-indigo-800/30">
                            <div class="text-[10px] text-indigo-500 font-bold uppercase tracking-widest mb-0.5">Active Days</div>
                            <div class="text-[14px] font-black text-gray-800 dark:text-gray-200">${activeDays}</div>
                        </div>
                        <div class="flex-1 bg-gradient-to-br from-fuchsia-50 to-pink-50 dark:from-fuchsia-950/30 dark:to-pink-900/20 rounded-lg p-2 text-center border border-fuchsia-100/50 dark:border-fuchsia-800/30">
                            <div class="text-[10px] text-fuchsia-500 font-bold uppercase tracking-widest mb-0.5">Media Shared</div>
                            <div class="text-[14px] font-black text-gray-800 dark:text-gray-200">${formatNum(mediaCount)}</div>
                        </div>
                    `;
                    expandedContent.appendChild(statsStrip);
                    
                    const filterWrap = document.createElement('div');
                    filterWrap.className = 'flex flex-wrap gap-1.5';
                    expandedContent.appendChild(filterWrap);
                    
                    participantContainer.appendChild(expandedContent);

                    let isExpanded = false;
                    headerRow.onclick = () => {
                        isExpanded = !isExpanded;
                        expandedContent.classList.toggle('hidden', !isExpanded);
                        document.getElementById('participant-chevron').style.transform = isExpanded ? 'rotate(180deg)' : '';
                    };

                    senders.slice(0, 4).forEach(([sName, count]) => {
                        if (!sName) return;
                        const btn = document.createElement('button');
                        const defaultClass = 'text-[10px] bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full px-2 py-0.5 font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition whitespace-nowrap cursor-pointer flex items-center gap-1.5 font-sans';
                        const activeClass = 'text-[10px] bg-indigo-600 border border-indigo-600 rounded-full px-2 py-0.5 font-medium text-white hover:bg-indigo-700 transition whitespace-nowrap cursor-pointer flex items-center gap-1.5 font-sans';
                        
                        btn.className = defaultClass;
                        const formatCount = count > 9999 ? (count/1000).toFixed(1) + 'k' : count.toLocaleString();
                        btn.innerHTML = `<div class="w-3.5 h-3.5 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 text-white flex items-center justify-center text-[7.5px] font-bold tracking-tighter">${sName.charAt(0).toUpperCase()}</div> <span>${sName}</span> <span class="opacity-60 ml-0.5">${formatCount}</span>`;
                        
                        btn.onclick = () => {
                            if (activeSenderFilter === sName) {
                                // Toggle OFF
                                activeSenderFilter = null;
                                displayedMessages = [...allMessages];
                                senderBtns.forEach(b => {
                                    b.className = defaultClass;
                                    b.querySelector('div').className = 'w-3.5 h-3.5 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 text-white flex items-center justify-center text-[7.5px] font-bold tracking-tighter';
                                });
                                statsInfo.innerHTML = `Showing all <span class="font-bold text-blue-600 dark:text-blue-400">${allMessages.length.toLocaleString()}</span> messages.`;
                            } else {
                                // Toggle ON
                                activeSenderFilter = sName;
                                displayedMessages = allMessages.filter(msg => msg.sender === sName);
                                senderBtns.forEach(b => {
                                    b.className = defaultClass + ' opacity-50';
                                    b.querySelector('div').className = 'w-3.5 h-3.5 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 text-white flex items-center justify-center text-[7.5px] font-bold tracking-tighter';
                                });
                                btn.className = activeClass;
                                btn.querySelector('div').className = 'w-3.5 h-3.5 rounded-full bg-white text-indigo-600 flex items-center justify-center text-[7.5px] font-bold tracking-tighter';
                                statsInfo.innerHTML = `Showing <span class="font-bold text-indigo-600 dark:text-indigo-400">${displayedMessages.length.toLocaleString()}</span> msgs by ${sName}.`;
                            }
                            renderChats(-1, -1);
                            const end = displayedMessages.length;
                            const start = Math.max(0, end - CHUNK_SIZE);
                            renderChats(start, end, 'reset');
                            setTimeout(() => { scrollArea.scrollTop = scrollArea.scrollHeight; }, 10);
                            toggleSidebar(false);
                        };
                        senderBtns.push(btn);
                        expandedContent.querySelector(".flex-wrap").appendChild(btn);
                    });
                }

                // Populate Smart Filters (Years & Days)
                const yearCounts = {};
                const currentYearNum = new Date().getFullYear();
                allMessages.forEach(msg => {
                    if (!msg.date) return;
                    const parts = msg.date.split(/[\/\-.]/);
                    if (parts.length === 3) {
                        let yRaw = parts[2].trim();
                        if (parts[0].trim().length === 4) {
                            yRaw = parts[0].trim(); // Handle YYYY-MM-DD
                        }
                        const fullY = yRaw.length === 2 ? 2000 + parseInt(yRaw) : parseInt(yRaw);
                        if (!isNaN(fullY) && fullY >= 2009 && fullY <= currentYearNum + 1) {
                            yearCounts[yRaw] = (yearCounts[yRaw] || 0) + 1;
                        }
                    }
                });
                
                const validYears = Object.keys(yearCounts).filter(y => {
                    // Only include years that have a meaningful amount of messages, to filter out random parser mistakes
                    return yearCounts[y] > 5 || yearCounts[y] >= Math.max(1, allMessages.length * 0.001);
                });

                const yearSelect = document.getElementById('filter-year');
                yearSelect.innerHTML = '<option value="">Year</option>';
                validYears.sort().forEach(y => {
                    const fullYear = y.length === 2 ? `20${y}` : (y.length === 4 ? y : null);
                    if (fullYear) yearSelect.innerHTML += `<option value="${y}">${fullYear}</option>`;
                });
                const daySelect = document.getElementById('filter-day');
                daySelect.innerHTML = '<option value="">Day</option>';
                for (let i = 1; i <= 31; i++) {
                    daySelect.innerHTML += `<option value="${i}">${i}</option>`;
                }

                // Smart Filters Logic — Apply button driven (no auto-change listeners)
                const filterMonth = document.getElementById('filter-month');
                const toggleMedia = document.getElementById('toggle-media');
                const toggleStickers = document.getElementById('toggle-stickers');
                const toggleLinks = document.getElementById('toggle-links');
                const resetFiltersBtn = document.getElementById('reset-filters');
                const applyFiltersBtn = document.getElementById('apply-filters-btn');

                const applyFilters = () => {
                    let anchorId = null;
                    const msgs = document.querySelectorAll('.chat-message');
                    for (let i = 0; i < msgs.length; i++) {
                        const rect = msgs[i].getBoundingClientRect();
                        if (rect.top >= 0 && rect.bottom <= window.innerHeight) {
                            anchorId = msgs[i].id.replace('msg-', '');
                            break;
                        }
                    }
                    if (!anchorId && msgs.length > 0) {
                        anchorId = msgs[Math.floor(msgs.length/2)].id.replace('msg-', '');
                    }

                    const d = daySelect.value;
                    const m = filterMonth.value;
                    const y = yearSelect.value;
                    const showMedia = toggleMedia.checked;
                    const showStickers = toggleStickers.checked;
                    const showLinks = toggleLinks ? toggleLinks.checked : false;
                    const hasDateFilter = !!(d || m || y);

                    if (hasDateFilter || !showMedia || !showStickers || showLinks) {
                        resetFiltersBtn.classList.remove('hidden');
                    } else {
                        resetFiltersBtn.classList.add('hidden');
                    }

                    displayedMessages = allMessages.filter(msg => {
                        // Respect active sender filter
                        if (activeSenderFilter && msg.sender !== activeSenderFilter) return false;

                        // Media Toggle (Mobile)
                        if (window.__showOnlyMedia) {
                            const isMedia = msg.attachment || (msg.text && ['.jpg', '.jpeg', '.png', '.mp4', '.mov', 'image omitted', 'video omitted', 'audio omitted', 'document omitted'].some(ext => msg.text.toLowerCase().includes(ext)));
                            if (!isMedia) return false;
                        }

                        // Content check
                        if (!showMedia && msg.attachment) return false;

                        if (msg.text) {
                            const text = msg.text.toLowerCase();

                            if (showLinks) {
                                if (!text.includes('http') && !text.includes('www.')) return false;
                            }

                            if (!showMedia) {
                                const mediaExts = ['.jpg', '.jpeg', '.png', '.mp4', '.mov', 'image omitted', 'video omitted', 'audio omitted', 'document omitted'];
                                if (mediaExts.some(ext => text.includes(ext))) return false;
                            }

                            if (!showStickers) {
                                const stickerExts = ['.webp', 'sticker omitted'];
                                if (stickerExts.some(ext => text.includes(ext))) return false;
                            }
                        } else {
                            if (showLinks) return false;
                        }

                        return true;
                    });

                    // Find index of the first message matching the date filter
                    let targetIdx = -1;
                    if (hasDateFilter) {
                        targetIdx = displayedMessages.findIndex(msg => {
                            if (!msg.date) return false;
                            const parts = msg.date.split('/');
                            if (parts.length === 3) {
                                const msgM = parseInt(parts[datePartsOrder.monthIdx]);
                                const msgD = parseInt(parts[datePartsOrder.dayIdx]);
                                const msgY = parts[2];

                                if (m && msgM !== parseInt(m)) return false;
                                if (d && msgD !== parseInt(d)) return false;
                                if (y && msgY !== y) return false;
                                return true;
                            }
                            return false;
                        });
                    }

                    renderChats(-1, -1); // Clear UI

                    if (displayedMessages.length > 0) {
                        if (hasDateFilter && targetIdx !== -1) {
                            // Date matches, render chunk centered around it
                            const start = Math.max(0, targetIdx - 30);
                            const end = Math.min(displayedMessages.length, start + CHUNK_SIZE);
                            renderChats(start, end, 'reset');
                            setTimeout(() => {
                                const targetMsg = displayedMessages[targetIdx];
                                const targetEl = document.getElementById(`msg-${targetMsg.id}`);
                                if (targetEl) {
                                    targetEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
                                    targetEl.classList.add('jump-highlight');
                                    setTimeout(() => {
                                        targetEl.classList.remove('jump-highlight');
                                    }, 2500);
                                }
                            }, 80);
                            statsInfo.innerHTML = `Jumped to date. Showing <span class="font-bold text-indigo-600 dark:text-indigo-400">${displayedMessages.length.toLocaleString()}</span> total messages.`;
                        } else {
                            if (anchorId && !hasDateFilter) {
                                const aidx = displayedMessages.findIndex(m => m.id == anchorId);
                                if (aidx !== -1) {
                                    const start = Math.max(0, aidx - 30);
                                    const end = Math.min(displayedMessages.length, start + CHUNK_SIZE);
                                    renderChats(start, end, 'reset');
                                    setTimeout(() => {
                                        const targetEl = document.getElementById(`msg-${anchorId}`);
                                        if (targetEl) {
                                            targetEl.scrollIntoView({ block: 'center' });
                                        }
                                    }, 80);
                                    statsInfo.innerHTML = `Showing <span class="font-bold text-indigo-600 dark:text-indigo-400">${displayedMessages.length.toLocaleString()}</span> messages.`;
                                    toggleSidebar(false);
                                    return;
                                }
                            }
                            // Default: show newest messages at bottom
                            const end = displayedMessages.length;
                            renderChats(Math.max(0, end - CHUNK_SIZE), end, 'reset');
                            setTimeout(() => { scrollArea.scrollTop = scrollArea.scrollHeight; }, 10);

                            if (hasDateFilter && targetIdx === -1) {
                                statsInfo.innerHTML = `<span class="text-red-500 font-semibold">No messages found on that date.</span> Showing all ${displayedMessages.length.toLocaleString()} messages.`;
                            } else {
                                statsInfo.innerHTML = `Showing <span class="font-bold text-indigo-600 dark:text-indigo-400">${displayedMessages.length.toLocaleString()}</span> messages.`;
                            }
                        }
                    } else {
                        statsInfo.innerHTML = `Showing <span class="font-bold text-indigo-600 dark:text-indigo-400">0</span> messages.`;
                    }

                    // Close sidebar on mobile after applying
                    toggleSidebar(false);
                    if (typeof window.closeMobileFilterModal === 'function') {
                        window.closeMobileFilterModal();
                    }
                };

                // Apply button — single click to filter
                if (applyFiltersBtn) {
                    applyFiltersBtn.onclick = applyFilters;
                }

                // NO auto-change listeners on dropdowns — only the Apply button triggers filtering
                // Checkboxes still auto-apply since they're simple toggles
                [toggleMedia, toggleStickers, toggleLinks].forEach(el => {
                    if (el) el.onchange = applyFilters;
                });

                if (resetFiltersBtn) {
                    resetFiltersBtn.onclick = () => {
                        if (daySelect) daySelect.value = ''; 
                        if (filterMonth) filterMonth.value = ''; 
                        if (yearSelect) yearSelect.value = '';
                        if (toggleMedia) toggleMedia.checked = true; 
                        if (toggleStickers) toggleStickers.checked = true;
                        if (toggleLinks) toggleLinks.checked = false;
                        
                        applyFilters();
                    };
                }

                // Initial render: last CHUNK_SIZE messages
                const end = allMessages.length;
                const start = Math.max(0, end - CHUNK_SIZE);
                renderChats(start, end);

                setTimeout(() => {
                    scrollArea.scrollTop = scrollArea.scrollHeight;
                }, 100);

                if (window.kothaLoadAiHistory) {
                    window.kothaLoadAiHistory(chatName);
                }

            } else {
                chatContainer.innerHTML = '';
            }
        } catch (e) {
            statsInfo.innerText = "Fetch error: " + e.message;
            window.kothaChatLoading = false;
        }
    };

    // ---------- Chat List UI Rendering ----------
    const chatListUI = document.getElementById('chat-list-ui');

    const chatColors = [
        'from-emerald-400 to-teal-500',
        'from-violet-500 to-indigo-600',
        'from-pink-500 to-rose-500',
        'from-amber-400 to-orange-500',
        'from-cyan-400 to-blue-500',
        'from-fuchsia-500 to-purple-600',
    ];

    function renderChatList(chats, activeChat) {
        if (!chatListUI) return;
        chatListUI.innerHTML = '';
        if (chats.length === 0) {
            chatListUI.innerHTML = '<p class="text-xs text-gray-400 text-center py-4">No chats yet. Import one!</p>';
            return;
        }
        chats.forEach((chat, idx) => {
            const isAssistant = chat === 'kotha_assistant';
            const chatMeta = window._chatMetaCache?.[chat];
            let displayName = isAssistant ? 'Kotha Assistant' : (chatMeta?.contactName ? cleanDisplayName(chatMeta.contactName) : cleanDisplayName(chat));
            const initial = displayName.charAt(0).toUpperCase();
            const colorClass = chatColors[idx % chatColors.length];
            const isActive = chat === activeChat;

            // Get last message preview from cache if available
            const lastMsg = chatMeta?.lastMessage || (isAssistant ? "Ask me anything about OnlineKotha…" : '');
            const lastTime = chatMeta?.lastTime || '';
            const msgCount = chatMeta?.messageCount || chatMeta?.count || '';

            const item = document.createElement('div');
            item.className = `flex items-center gap-3 px-3 py-2.5 mx-1 mb-0 rounded-xl cursor-pointer transition-all duration-200 group border-b border-gray-100 dark:border-gray-800/50 last:border-0 ${isActive ? 'bg-indigo-50/80 dark:bg-[#2a3942] shadow-sm ring-1 ring-indigo-100 dark:ring-transparent' : 'hover:bg-gray-50 dark:hover:bg-[#202c33]'}`;
            item.dataset.chat = chat;
            item.innerHTML = `
                ${isAssistant
                    ? `<div class="w-9 h-9 rounded-full bg-gradient-to-br from-violet-500 to-pink-500 flex items-center justify-center text-white shadow-sm shrink-0"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/></svg></div>`
                    : `<div class="w-9 h-9 rounded-full bg-gradient-to-br ${colorClass} flex items-center justify-center text-white font-bold text-[14px] shadow-sm shrink-0">${initial}</div>`
                }
                <div class="min-w-0 flex-1 pb-0.5">
                    <div class="flex items-center justify-between gap-1 mt-0">
                        <div class="flex items-center gap-1.5 overflow-hidden">
                            <p class="text-[14px] font-semibold text-gray-900 dark:text-gray-100 truncate leading-tight tracking-tight">${escapeHTML(displayName)}</p>
                            ${isAssistant ? '<span class="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400 border border-violet-200 dark:border-violet-800 shrink-0">AI Guide</span>' : ''}
                            ${chatMeta?.deletedByUser ? '<span class="px-1 py-0.5 rounded text-[9px] font-bold bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 border border-red-200 dark:border-red-800 shrink-0">Deleted</span>' : ''}
                        </div>
                        <span class="text-[10px] text-gray-400 font-medium shrink-0 whitespace-nowrap">${lastTime}</span>
                    </div>
                    <div class="flex items-center justify-between gap-1 mt-0.5">
                        <p class="text-[12px] text-gray-500 dark:text-gray-400 font-normal truncate leading-tight">${isActive ? '<span class="text-indigo-500 dark:text-indigo-400 font-medium">● Active</span>' : 'Tap to open'}</p>
                    </div>
                </div>
                <div class="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition">
                    <button class="chat-rename-btn w-7 h-7 rounded-lg flex items-center justify-center text-gray-300 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition" title="Rename chat" data-chat="${chat}">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    <button class="chat-del-btn w-7 h-7 rounded-lg flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition" title="Delete chat" data-chat="${chat}">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                </div>
            `;
            // Rename button
            const renameBtn = item.querySelector('.chat-rename-btn');
            if (renameBtn) {
                renameBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const newName = prompt(`Rename "${displayName}" to:`, displayName);
                    if (!newName || !newName.trim() || newName.trim() === displayName) return;
                    const cleanNewName = newName.trim();
                    try {
                        const r = await fetch(`/api/chats/${encodeURIComponent(chat)}/rename`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ newName: cleanNewName })
                        });
                        if (!r.ok) throw new Error('Rename failed');
                        if (!window._chatMetaCache) window._chatMetaCache = {};
                        if (!window._chatMetaCache[chat]) window._chatMetaCache[chat] = {};
                        window._chatMetaCache[chat].contactName = cleanNewName;
                        
                        if (chat === currentChat) {
                            const headerName = document.getElementById('chat-header-name');
                            if (headerName) headerName.innerText = cleanNewName;
                        }
                        renderChatList(loadedChats || [], currentChat);
                    } catch (err) {
                        alert('Rename failed: ' + err.message);
                    }
                });
            }

            // Delete button
            const delBtn = item.querySelector('.chat-del-btn');
            if (delBtn) {
                delBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    if (!confirm(`Are you sure you want to delete "${displayName}"?`)) return;
                    try {
                        const res = await fetch(`/api/chats/${encodeURIComponent(chat)}`, { method: 'DELETE' });
                        if (!res.ok) throw new Error('Delete failed');
                        loadedChats = loadedChats.filter(c => c !== chat);
                        if (chat === currentChat) {
                            document.getElementById('close-chat-btn')?.click();
                        }
                        renderChatList(loadedChats, currentChat);
                    } catch (error) {
                        alert('Failed to delete chat: ' + error.message);
                    }
                });
            }

            item.addEventListener('click', (e) => {
                if (e.target.closest('.chat-del-btn') || e.target.closest('.chat-rename-btn')) return;
                if (chat === currentChat) {
                    if (isMobile() || window.kothaCompact) toggleSidebar(false);
                    return;
                }
                if (currentChat === '__global__') {
                    deactivateGlobalUI();
                }
                currentChat = chat;
                window.currentChat = chat; localStorage.setItem("kotha_active_chat", chat);
                try {
                    const newUrl = new URL(window.location.href);
                    newUrl.searchParams.set('chat', chat);
                    window.history.replaceState({ chat }, '', newUrl.toString());
                } catch(e) {}
                const selector = document.getElementById('chat-selector');
                if (selector) selector.value = chat;
                removeEmptyState();
                renderChatList(chats, chat);
                loadData(chat).then(() => {
                    if (window.innerWidth >= 768) {
                        const inp = document.getElementById('bottom-ai-input');
                        if (inp) inp.focus();
                    }
                });

                toggleSidebar(false);
                // Also try focus after sidebar animation completes (mobile)
                setTimeout(() => { 
                    if (window.innerWidth >= 768) {
                        const inp = document.getElementById('bottom-ai-input'); 
                        if (inp) inp.focus(); 
                    }
                }, 350);
            });
            chatListUI.appendChild(item);
        });

        // Add Reactivate Assistant button if hidden
        if (localStorage.getItem('hide_kotha_assistant') === 'true') {
            const btnContainer = document.createElement('div');
            btnContainer.className = 'mt-4 flex justify-center pb-4';
            btnContainer.innerHTML = `
                <button class="text-[11px] text-indigo-500 font-medium hover:underline flex items-center gap-1 opacity-80 hover:opacity-100 transition">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                    Reactivate Assistant
                </button>
            `;
            btnContainer.querySelector('button').addEventListener('click', () => {
                localStorage.removeItem('hide_kotha_assistant');
                if (!loadedChats.includes('kotha_assistant')) {
                    loadedChats.push('kotha_assistant');
                }
                renderChatList(loadedChats, currentChat);
            });
            chatListUI.appendChild(btnContainer);
        }
    }

    // Keep reference to loaded chats for re-rendering
    let loadedChats = [];

    const loadChatsList = async () => {
        // Show skeleton in sidebar while loading
        if (chatListUI) {
            chatListUI.innerHTML = `
                <div class="skeleton-chat-item"><div class="skeleton skeleton-avatar"></div><div class="skeleton-lines"><div class="skeleton skeleton-line skeleton-line-long"></div><div class="skeleton skeleton-line skeleton-line-short"></div></div></div>
                <div class="skeleton-chat-item"><div class="skeleton skeleton-avatar"></div><div class="skeleton-lines"><div class="skeleton skeleton-line skeleton-line-long"></div><div class="skeleton skeleton-line skeleton-line-short"></div></div></div>
                <div class="skeleton-chat-item"><div class="skeleton skeleton-avatar"></div><div class="skeleton-lines"><div class="skeleton skeleton-line skeleton-line-long"></div><div class="skeleton skeleton-line skeleton-line-short"></div></div></div>
            `;
        }
        try {
            const resp = await fetch('/api/chats');
            if (resp.status === 401) {
                // not logged in
                return;
            }
            let chats = await resp.json();
            
            // Kotha Assistant Injection
            const assistantHidden = localStorage.getItem('hide_kotha_assistant') === 'true';
            if (!assistantHidden && !chats.includes('kotha_assistant')) {
                chats.push('kotha_assistant');
            }
            loadedChats = chats;
            
            fetch('/api/chats/meta').then(r => r.json()).then(metaMap => {
                if (!window._chatMetaCache) window._chatMetaCache = {};
                for (const [folder, meta] of Object.entries(metaMap)) {
                    if (!window._chatMetaCache[folder]) window._chatMetaCache[folder] = {};
                    if (typeof meta === 'object' && meta !== null) {
                        window._chatMetaCache[folder].contactName = meta.display_name;
                        window._chatMetaCache[folder].deletedByUser = meta.deleted_by_user;
                        window._chatMetaCache[folder].messageCount = meta.message_count;
                        window._chatMetaCache[folder].isGroup = meta.is_group === 1;
                        window._chatMetaCache[folder].participants = meta.participants;
                    } else {
                        window._chatMetaCache[folder].contactName = meta; // backwards compatibility
                    }
                }
                if (chats.includes('kotha_assistant')) {
                    if (!window._chatMetaCache['kotha_assistant']) window._chatMetaCache['kotha_assistant'] = {};
                    window._chatMetaCache['kotha_assistant'].contactName = "Kotha Assistant";
                    window._chatMetaCache['kotha_assistant'].isGroup = false;
                    if (!window._chatMetaCache['kotha_assistant'].lastMessage) {
                        const stored = localStorage.getItem('kotha_assistant_history');
                        let history = [];
                        if (stored) { try { history = JSON.parse(stored); } catch(e){} }
                        if (history.length > 0) {
                            const last = history[history.length - 1];
                            window._chatMetaCache['kotha_assistant'].lastMessage = last.text.length > 40 ? last.text.slice(0, 40) + '…' : last.text;
                            window._chatMetaCache['kotha_assistant'].lastTime = last.time || '';
                        } else {
                            window._chatMetaCache['kotha_assistant'].lastMessage = "Ask me anything about OnlineKotha…";
                            window._chatMetaCache['kotha_assistant'].lastTime = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                        }
                    }
                }
                renderChatList(loadedChats, currentChat);
            }).catch(() => {});
            const selector = document.getElementById('chat-selector');
            if (!selector) return;
            selector.innerHTML = '<option value="">Select a chat...</option>';
            chats.forEach(chat => {
                const opt = document.createElement('option');
                opt.value = chat;
                opt.textContent = chat.replace('WhatsApp Chat - ', '');
                selector.appendChild(opt);
            });
            if (chats.length > 0) {
                const urlParams = new URLSearchParams(window.location.search);
                const urlChat = urlParams.get('chat');
                const savedChat = localStorage.getItem('kotha_active_chat');
                let targetChat = urlChat || savedChat;
                
                // If the user is viewing a Direct Message (DM) via hash or saved DM conversation, do NOT load WhatsApp chats
                const isViewingDM = (window.location.hash && window.location.hash.startsWith('#chat-')) || (localStorage.getItem('kotha_dm_view') === 'messages' && localStorage.getItem('kotha_dm_active_conv'));
                if (isViewingDM) {
                    targetChat = null;
                }

                if (targetChat === '__global__') {
                    const btn = document.getElementById('global-chat-item');
                    if (btn) btn.click();
                    if (isMobile() || window.kothaCompact) {
                        toggleSidebar(false);
                    }
                } else if (targetChat) {
                    const match = chats.find(c => c === targetChat || c.toLowerCase() === targetChat.toLowerCase());
                    if (match) {
                        if (selector) selector.value = match;
                        currentChat = match;
                        window.currentChat = match; localStorage.setItem("kotha_active_chat", match);
                        
                        try {
                            const newUrl = new URL(window.location.href);
                            if (newUrl.searchParams.get('chat') !== match) {
                                newUrl.searchParams.set('chat', match);
                                window.history.replaceState({ chat: match }, '', newUrl.toString());
                            }
                        } catch(e) {}

                        loadData(match);
                        removeEmptyState();

                        // Keep mobile sidebar closed so the user stays inside the open chat after refresh
                        if (isMobile() || window.kothaCompact) {
                            toggleSidebar(false);
                        }
                    } else {
                        // Target chat not found
                        if (chats.length === 1 && chats[0] === 'kotha_assistant') {
                            currentChat = 'kotha_assistant';
                            window.currentChat = 'kotha_assistant'; localStorage.setItem("kotha_active_chat", 'kotha_assistant');
                            loadData('kotha_assistant');
                            removeEmptyState();
                            if (isMobile() || window.kothaCompact) {
                                toggleSidebar(false);
                            }
                        } else {
                            showEmptyState(); // Restore empty state
                        }
                    }
                } else if (currentChat && chats.includes(currentChat)) {
                    // Already viewing an active chat, preserve it
                    if (selector) selector.value = currentChat;
                    removeEmptyState();
                    if (isMobile() || window.kothaCompact) {
                        toggleSidebar(false);
                    }
                } else if (!isViewingDM) {
                    // Fresh startup with no active chat: do not open any chat by default
                    currentChat = '';
                    window.currentChat = ''; localStorage.setItem("kotha_active_chat", '');
                    showEmptyState();
                }
                
                // Render visual chat list (always)
                renderChatList(chats, currentChat);
            } else {
                renderChatList([], '');
            }
        } catch (e) {
            console.error("Failed to load chats:", e);
            statsInfo.innerText = "Error loading chats list";
        }
    };

    // ── Skeleton Loading ──
    function showSkeleton() {
        chatContainer.innerHTML = `
            <div id="chat-skeleton" class="py-4 px-2">
                <div class="skeleton skeleton-date"></div>
                <div class="skeleton skeleton-bubble-left" style="width:50%;animation-delay:0.1s"></div>
                <div class="skeleton skeleton-bubble-right" style="animation-delay:0.2s"></div>
                <div class="skeleton skeleton-bubble-left" style="width:60%;animation-delay:0.3s"></div>
                <div class="skeleton skeleton-bubble-right-sm" style="animation-delay:0.4s"></div>
                <div class="skeleton skeleton-date" style="animation-delay:0.5s"></div>
                <div class="skeleton skeleton-bubble-right" style="width:55%;animation-delay:0.6s"></div>
                <div class="skeleton skeleton-bubble-left" style="animation-delay:0.7s"></div>
                <div class="skeleton skeleton-bubble-right-sm" style="width:35%;animation-delay:0.8s"></div>
                <div class="skeleton skeleton-bubble-left" style="width:45%;animation-delay:0.9s"></div>
            </div>`;
    }

    function showEmptyState() {
        // If the user is currently viewing a DM, do not show the WhatsApp empty state
        if (window.location.hash && window.location.hash.startsWith('#chat-')) return;
        
        const container = document.getElementById('chat-container');
        if (!container) return;

        // Hide header and bottom input robustly
        const header = document.getElementById('chat-header-bar');
        const footer = document.getElementById('bottom-ai-bar');
        const filterBar = document.getElementById('filter-buttons-container');
        if (header) header.style.display = 'none';
        if (footer) footer.style.display = 'none';
        
        // Hide participants
        const partContainer = document.getElementById('participant-filters-container');
        if (partContainer) { partContainer.innerHTML = ''; partContainer.classList.add('hidden'); }
        
        // Lock scroll area completely with inline style (more reliable than class)
        const scrollArea = document.getElementById('chat-scroll-area');
        if (scrollArea) {
            scrollArea.style.overflow = 'hidden';
            scrollArea.scrollTop = 0;
        }

        // Also ensure any lingering AI chat content is cleared
        const aiContainer = document.getElementById('ai-chat-container');
        if (aiContainer) aiContainer.innerHTML = '';

        // Check if user is on free plan to show Pro CTA
        const isPro = window.__USER__ && window.__USER__.plan === 'pro';

        container.innerHTML = `
            <div class="absolute inset-0 z-[25] flex flex-col items-center justify-center bg-slate-50 dark:bg-[#0b141a] overflow-hidden select-none" id="empty-state">
                
                <!-- Mobile sidebar open button (visible only on mobile when header is hidden) -->
                <button id="empty-open-sidebar-btn" class="md:hidden absolute z-30 w-10 h-10 rounded-full bg-white dark:bg-[#202c33] shadow-md border border-gray-200 dark:border-gray-700 flex items-center justify-center transition hover:bg-gray-100 dark:hover:bg-gray-700 active:scale-95 cursor-pointer" style="top: max(1rem, env(safe-area-inset-top)); left: 1rem;">
                    <svg class="w-5 h-5 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h7"></path>
                    </svg>
                </button>

                <!-- Ambient Background Blur Glows -->
                <div class="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full bg-gradient-to-tr from-indigo-500/15 via-purple-500/10 to-pink-500/15 blur-3xl pointer-events-none"></div>
                <div class="absolute bottom-10 right-10 w-72 h-72 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none"></div>

                <div class="relative z-10 text-center px-6 flex flex-col items-center">
                    
                    <!-- Logo Emblem Container (Matched with OK Messages) -->
                    <div class="relative mb-6 group cursor-default">
                        <!-- Ambient Glow -->
                        <div class="absolute -inset-4 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-full blur-2xl opacity-40 group-hover:opacity-75 transition duration-500"></div>
                        
                        <!-- Clean OK Emblem with animated logo (Light / Dark adaptive) -->
                        <div class="relative w-24 h-24 rounded-3xl bg-white dark:bg-[#1c1c2e] shadow-2xl flex items-center justify-center p-3 transform transition-all duration-300 group-hover:scale-105 border border-gray-200/80 dark:border-white/10">
                            <img src="../img/logo.svg" alt="OK Logo" class="w-full h-full object-contain" />
                        </div>
                    </div>

                <!-- Headline -->
                <h2 class="text-lg sm:text-xl font-extrabold tracking-tight text-gray-900 dark:text-white mb-1">Your chats, reimagined</h2>
                <p class="text-[12px] sm:text-[13px] text-gray-500 dark:text-gray-400 max-w-[260px] leading-relaxed mb-5">Select a chat from the sidebar, or import a new one to start talking with AI.</p>

                <!-- Import + DM Buttons -->
                <div class="flex flex-wrap items-center justify-center gap-2.5 w-full max-w-[280px] mx-auto mb-5">
                    <button id="empty-upload-btn" class="flex-1 min-w-[120px] whitespace-nowrap bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-semibold text-[12px] rounded-xl px-4 py-2.5 transition-all shadow-md flex items-center justify-center gap-1.5">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
                        Import Chat
                    </button>
                    <button id="empty-dm-btn" class="flex-1 min-w-[120px] whitespace-nowrap bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400 font-semibold text-[12px] rounded-xl px-4 py-2.5 transition-all hover:bg-indigo-50 dark:hover:bg-indigo-900/20 active:scale-95 flex items-center justify-center gap-1.5 shadow-sm">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                        Message Someone
                    </button>
                </div>

                ${!isPro ? `
                <!-- Pro CTA -->
                <div class="w-full max-w-[280px] rounded-[14px] bg-white dark:bg-[#1c1c2e] p-2.5 text-left border border-gray-100 dark:border-white/5 shadow-sm flex items-center justify-between gap-2 transition-all hover:border-indigo-500/30">
                    <div class="flex items-center gap-2.5">
                        <div class="w-8 h-8 flex items-center justify-center shrink-0">
                            <img src="../img/KothaPro.png" alt="Pro Logo" class="w-full h-full object-contain drop-shadow-sm rounded-lg">
                        </div>
                        <div class="flex flex-col justify-center">
                            <p class="text-[12px] font-bold text-gray-900 dark:text-white leading-tight mb-0.5">Kotha Pro</p>
                            <p class="text-[9px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide leading-none">Unlimited AI</p>
                        </div>
                    </div>
                    <button id="empty-pro-btn" class="bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 active:scale-95 font-bold text-[11px] rounded-lg px-3 py-1.5 transition-all">
                        Upgrade
                    </button>
                </div>` : ''}

                <!-- Trust badges -->
                <div class="flex items-center justify-center gap-3 text-[10px] text-gray-400 dark:text-gray-500 font-medium mt-4">
                    <span class="flex items-center gap-1"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg> Private</span>
                    <span class="w-1 h-1 rounded-full bg-gray-300 dark:bg-gray-600"></span>
                    <span class="flex items-center gap-1"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg> Free Demo</span>
                    <span class="w-1 h-1 rounded-full bg-gray-300 dark:bg-gray-600"></span>
                    <span class="flex items-center gap-1"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg> AI-Powered</span>
                </div>
                </div> <!-- End of relative z-10 wrapper -->
            </div>
        `;


        // Wire up mobile sidebar button on empty state
        const emptySidebarBtn = document.getElementById('empty-open-sidebar-btn');
        if (emptySidebarBtn) emptySidebarBtn.addEventListener('click', () => {
            toggleSidebar(true);
        });

        const btn = document.getElementById('empty-upload-btn');
        if (btn) btn.addEventListener('click', () => {
            const openUploadBtn = document.getElementById('open-upload-btn');
            if (openUploadBtn) openUploadBtn.click();
        });
        const dmBtn = document.getElementById('empty-dm-btn');
        if (dmBtn) dmBtn.addEventListener('click', () => {
            const btnDm = document.getElementById('btn-dm');
            if (btnDm) btnDm.click();
        });
        const proBtn = document.getElementById('empty-pro-btn');
        if (proBtn) proBtn.addEventListener('click', () => {
            if (typeof openUpgradeModal === 'function') openUpgradeModal();
        });
    }

    function removeEmptyState() {
        const e = document.getElementById('empty-state');
        if (e) e.remove();
        
        // Show header and bottom input again
        const header = document.getElementById('chat-header-bar');
        const footer = document.getElementById('bottom-ai-bar');
        if (header) header.style.display = 'flex';
        if (footer) footer.style.display = 'block';
        
        // Re-enable scroll with inline style (matches how showEmptyState locks it)
        const scrollArea = document.getElementById('chat-scroll-area');
        if (scrollArea) {
            scrollArea.style.overflow = '';
        }
    }

    const chatSelector = document.getElementById('chat-selector');
    if (chatSelector) {
        chatSelector.addEventListener('change', (e) => {
            if (e.target.value) {
                if (currentChat === '__global__') {
                    deactivateGlobalUI();
                }
                currentChat = e.target.value;
                window.currentChat = currentChat; localStorage.setItem("kotha_active_chat", currentChat);
                try {
                    const newUrl = new URL(window.location.href);
                    newUrl.searchParams.set('chat', currentChat);
                    window.history.replaceState({ chat: currentChat }, '', newUrl.toString());
                } catch(err) {}
                removeEmptyState();
                loadData(currentChat);
                if (isMobile() || window.kothaCompact) {
                    toggleSidebar(false);
                }
            }
        });
    }

    // Expose for upload.js to refresh after import
    window.refreshChats = async (selectName) => {
        if (selectName) {
            currentChat = selectName;
            window.currentChat = selectName; localStorage.setItem("kotha_active_chat", selectName);
        }
        await loadChatsList();
        if (selectName) {
            if (currentChat === '__global__' && typeof deactivateGlobalUI === 'function') {
                deactivateGlobalUI();
            }
            // Switch to chats tab if DM tab was active
            const tabChatsBtn = document.getElementById('tab-chats-btn');
            if (tabChatsBtn) {
                tabChatsBtn.click();
            }
            const dmChatArea = document.getElementById('dm-chat-area');
            if (dmChatArea) dmChatArea.style.display = 'none';
            const dmEmpty = document.getElementById('dm-empty-state');
            if (dmEmpty) dmEmpty.classList.add('hidden');

            const selector = document.getElementById('chat-selector');
            if (selector) {
                selector.value = selectName;
            }

            // Remove empty state completely & show header and bottom input
            removeEmptyState();

            // On mobile / compact mode: close sidebar so ONLY the chat side is visible!
            toggleSidebar(false);

            // Re-render chat list with new active chat highlighted
            renderChatList(loadedChats, selectName);

            // Load chat data
            await loadData(selectName);

            // Focus AI input
            setTimeout(() => {
                const inp = document.getElementById('bottom-ai-input');
                if (inp) inp.focus();
            }, 100);
        }
    };

    // Inline Filters toggle under search bar
    const filtersToggle = document.getElementById('btn-filters-toggle');
    const filtersToggle2 = document.getElementById('btn-filters-toggle-2');
    const filtersContainer = document.getElementById('smart-filters-container');
    const closeFiltersBtn = document.getElementById('close-filters-btn');
    if (filtersContainer) {
        function openFilters() {
            filtersContainer.classList.remove('hidden');
            if (filtersToggle) filtersToggle.classList.add('text-amber-600', 'bg-amber-50', 'dark:bg-amber-900/30');
            if (filtersToggle2) filtersToggle2.classList.add('text-amber-600', 'bg-amber-50', 'dark:bg-amber-900/30');
            // Scroll sidebar list to top so filters are in full view
            const sidebarChatsTab = document.getElementById('sidebar-chats-tab');
            if (sidebarChatsTab) sidebarChatsTab.scrollTop = 0;
        }
        function closeFilters() {
            filtersContainer.classList.add('hidden');
            if (filtersToggle) filtersToggle.classList.remove('text-amber-600', 'bg-amber-50', 'dark:bg-amber-900/30');
            if (filtersToggle2) filtersToggle2.classList.remove('text-amber-600', 'bg-amber-50', 'dark:bg-amber-900/30');
            if (typeof window.closeMobileFilterModal === 'function') {
                window.closeMobileFilterModal();
            }
        }
        const toggleFilters = (e) => {
            e.stopPropagation();
            if (filtersContainer.classList.contains('hidden')) { openFilters(); } else { closeFilters(); }
        };
        if (filtersToggle) filtersToggle.addEventListener('click', toggleFilters);
        if (filtersToggle2) filtersToggle2.addEventListener('click', toggleFilters);
        if (closeFiltersBtn) closeFiltersBtn.addEventListener('click', closeFilters);
    }


    // Expose for ai-panel.js — keep window.currentChat in sync
    window.scrollToMessageId = (id) => {
        if (typeof window.jumpToMsg === 'function') {
            window.jumpToMsg(id);
        }
    };

    // ── Onboarding Flow (first-time users) ──
    function showOnboarding() {
        if (localStorage.getItem('kotha_onboarded')) return;
        const steps = [
            {
                icon: '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>',
                title: 'Upload your chat',
                desc: 'Export your chat history as a .zip file and drop it here. We support Android, iPhone, individual and group chats.',
            },
            {
                icon: '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="1.5"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>',
                title: 'See your chats beautifully',
                desc: 'Messages appear in beautiful chat bubbles with photos, videos, and voice notes inline. Search through years instantly.',
            },
            {
                icon: '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="1.5"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/></svg>',
                title: 'Talk with AI',
                desc: 'AI learns how your contact texts — their slang, emojis, humor — and responds just like them. Click the sparkle button to start!',
            },
        ];
        let step = 0;

        function renderStep() {
            const s = steps[step];
            const dots = steps.map((_, i) => `<div class="onboarding-step-dot ${i === step ? 'active' : ''}"></div>`).join('');
            const isLast = step === steps.length - 1;
            document.getElementById('onboarding-overlay').innerHTML = `
                <div class="onboarding-card">
                    <div class="w-16 h-16 rounded-2xl bg-indigo-50 flex items-center justify-center mx-auto mb-5">${s.icon}</div>
                    <h3 class="text-xl font-bold text-gray-900 mb-2">${s.title}</h3>
                    <p class="text-sm text-gray-500 leading-relaxed mb-6 max-w-xs mx-auto">${s.desc}</p>
                    <div class="flex items-center justify-center gap-2 mb-5">${dots}</div>
                    <div class="flex gap-3 justify-center">
                        <button id="onboard-skip" class="text-sm text-gray-400 hover:text-gray-600 font-medium px-4 py-2 transition">${isLast ? '' : 'Skip'}</button>
                        <button id="onboard-next" class="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-xl px-6 py-2.5 transition shadow-sm">${isLast ? 'Get Started!' : 'Next'}</button>
                    </div>
                </div>
            `;
            document.getElementById('onboard-next').addEventListener('click', () => {
                if (isLast) { closeOnboarding(); return; }
                step++;
                renderStep();
            });
            const skipBtn = document.getElementById('onboard-skip');
            if (skipBtn) skipBtn.addEventListener('click', closeOnboarding);
        }

        function closeOnboarding() {
            localStorage.setItem('kotha_onboarded', '1');
            const overlay = document.getElementById('onboarding-overlay');
            if (overlay) { overlay.style.opacity = '0'; setTimeout(() => overlay.remove(), 300); }
        }

        const overlay = document.createElement('div');
        overlay.id = 'onboarding-overlay';
        overlay.className = 'onboarding-overlay';
        document.body.appendChild(overlay);
        renderStep();
    }

    // ── Global Chat Room Logic ──
    let globalEventSource = null;
    const globalChatItem = document.getElementById('global-chat-item');
    const globalOnlineUsersList = document.getElementById('global-online-users-list');
    const globalActiveIndicator = document.getElementById('global-active-indicator');
    const globalOnlineCount = document.getElementById('global-online-count');
    const askAiBtn = document.getElementById('ask-ai-btn');
    const bottomAiInput = document.getElementById('bottom-ai-input');
    const clearGlobalChatBtn = document.getElementById('clear-global-chat-btn');

    // Poll online count independently of SSE so the sidebar updates globally
    async function pollGlobalOnlineCount() {
        if (currentChat === '__global__') return; // SSE handles it when inside
        try {
            const r = await fetch('/api/global-chat/online-count');
            const data = await r.json();
            if (globalOnlineCount) {
                globalOnlineCount.textContent = `${data.count} user${data.count === 1 ? '' : 's'} online`;
            }
        } catch (err) {}
    }
    setInterval(pollGlobalOnlineCount, 5000);
    pollGlobalOnlineCount();

    // Reply and Reaction State variables
    window.replyingTo = null;
    let activePicker = null;

    const replyPreview = document.getElementById('reply-preview-container');
    const replySender = document.getElementById('reply-preview-sender');
    const replyText = document.getElementById('reply-preview-text');
    const replyClose = document.getElementById('reply-preview-close');
    const inputWrap = document.getElementById('ai-input-wrap');

    function setupReply(msgId, sender, text) {
        window.replyingTo = { msgId, sender, text };
        if (replySender) replySender.textContent = sender;
        if (replyText) replyText.textContent = text;
        if (replyPreview) replyPreview.classList.remove('hidden');
        if (inputWrap) {
            inputWrap.classList.remove('rounded-2xl');
            inputWrap.classList.add('rounded-b-2xl', 'rounded-t-none', 'border-t', 'border-gray-100', 'dark:border-gray-800');
        }
        if (bottomAiInput) bottomAiInput.focus();
    }

    window.clearReplyPreview = function () {
        window.replyingTo = null;
        if (replyPreview) replyPreview.classList.add('hidden');
        if (inputWrap) {
            inputWrap.classList.add('rounded-2xl');
            inputWrap.classList.remove('rounded-b-2xl', 'rounded-t-none', 'border-t', 'border-gray-100', 'dark:border-gray-800');
        }
    };

    if (replyClose) {
        replyClose.addEventListener('click', window.clearReplyPreview);
    }

    function showReactionPicker(btn, msgId) {
        if (activePicker) activePicker.remove();

        const picker = document.createElement('div');
        picker.className = 'reaction-picker absolute bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-full px-2.5 py-1.5 flex items-center gap-1 z-50 shadow-lg';

        const emojis = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
        emojis.forEach(emoji => {
            const emojiBtn = document.createElement('button');
            emojiBtn.className = 'reaction-emoji-btn text-[17px] hover:scale-125 transition duration-150 p-1 cursor-pointer';
            emojiBtn.textContent = emoji;
            emojiBtn.addEventListener('click', () => {
                sendReaction(msgId, emoji);
                picker.remove();
            });
            picker.appendChild(emojiBtn);
        });

        document.body.appendChild(picker);
        const rect = btn.getBoundingClientRect();
        picker.style.position = 'fixed';
        picker.style.left = `${rect.left + window.scrollX - 70}px`;
        picker.style.top = `${rect.top + window.scrollY - 46}px`;

        activePicker = picker;

        setTimeout(() => {
            document.addEventListener('click', (e) => {
                if (picker.parentNode && !picker.contains(e.target) && e.target !== btn) {
                    picker.remove();
                }
            }, { once: true });
        }, 10);
    }

    async function sendReaction(messageId, emoji) {
        try {
            await fetch('/api/global-chat/react', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ messageId, emoji })
            });
        } catch (err) {
            console.error('Failed to send reaction:', err);
        }
    }

    function updateMessageReactionsInDOM(messageId, reactions) {
        const msgEl = document.getElementById(`global-msg-${messageId}`);
        if (!msgEl) return;

        const bubbleEl = msgEl.querySelector('.glass-chat-me, .glass-chat-them');
        if (!bubbleEl) return;

        let badge = bubbleEl.querySelector('.msg-reactions-badge');
        if (!reactions || Object.keys(reactions).length === 0) {
            if (badge) badge.remove();
            return;
        }

        if (!badge) {
            badge = document.createElement('div');
            const isMe = bubbleEl.classList.contains('glass-chat-me');
            badge.className = `msg-reactions-badge absolute -bottom-2.5 ${isMe ? 'right-2' : 'left-2'} bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-full px-1.5 py-0.5 shadow-sm text-[10px] flex items-center gap-1 select-none z-10`;
            bubbleEl.appendChild(badge);
        }

        let inner = '';
        for (const [emoji, count] of Object.entries(reactions)) {
            inner += `<span>${emoji}<span class="text-[8px] font-bold text-gray-400 ml-0.5">${count}</span></span>`;
        }
        badge.innerHTML = inner;
    }

    function renderSystemMessage(text) {
        chatContainer.insertAdjacentHTML('beforeend', `
            <div class="flex justify-center my-3 w-full animate-message">
                <span class="bg-gray-200/50 dark:bg-white/5 text-gray-500 dark:text-gray-400 text-[11px] px-3.5 py-1 font-semibold rounded-full border border-gray-300/30 dark:border-white/5 shadow-sm">${escapeHTML(text)}</span>
            </div>
        `);
        scrollArea.scrollTop = scrollArea.scrollHeight;
    }

    function updateTypingStatus(typers) {
        const otherTypers = typers.filter(name => name !== window.myGlobalAnonName);
        const statusEl = document.querySelector('#chat-header-name + div p');
        if (!statusEl) return;

        if (otherTypers.length === 0) {
            const countText = globalOnlineCount ? globalOnlineCount.textContent : '0 users online';
            statusEl.innerHTML = `<span class="flex items-center gap-1.5"><span class="online-pulse"></span> ${countText}</span>`;
        } else {
            let text = '';
            if (otherTypers.length === 1) {
                text = `${otherTypers[0]} is typing...`;
            } else if (otherTypers.length === 2) {
                text = `${otherTypers[0]} and ${otherTypers[1]} are typing...`;
            } else {
                text = 'Several people are typing...';
            }
            statusEl.innerHTML = `<span class="text-emerald-500 font-semibold italic animate-pulse">${escapeHTML(text)}</span>`;
        }
    }

    let typingTimeout = null;
    let isCurrentlyTyping = false;

    if (bottomAiInput) {
        bottomAiInput.addEventListener('input', () => {
            if (currentChat === '__global__') {
                if (!isCurrentlyTyping) {
                    isCurrentlyTyping = true;
                    sendGlobalTypingState(true);
                }
                clearTimeout(typingTimeout);
                typingTimeout = setTimeout(() => {
                    isCurrentlyTyping = false;
                    sendGlobalTypingState(false);
                }, 2000);
            }
        });
    }

    async function sendGlobalTypingState(isTyping) {
        try {
            await fetch('/api/global-chat/typing', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ isTyping })
            });
        } catch { }
    }

    // Event delegation for message actions (Reply, React, Delete)
    chatContainer.addEventListener('click', (e) => {
        const replyBtn = e.target.closest('.reply-btn');
        if (replyBtn) {
            const msgId = replyBtn.dataset.msgId;
            const sender = replyBtn.dataset.sender;
            const text = replyBtn.dataset.text;
            setupReply(msgId, sender, text);
            return;
        }

        const reactTrigger = e.target.closest('.react-trigger-btn');
        if (reactTrigger) {
            const msgId = reactTrigger.dataset.msgId;
            showReactionPicker(reactTrigger, msgId);
            return;
        }

        const delBtn = e.target.closest('.delete-msg-btn');
        if (delBtn) {
            const msgId = delBtn.dataset.msgId;
            if (!confirm('Delete this message for everyone in Global Chat?')) return;
            fetch(`/api/global-chat/messages/${msgId}`, { method: 'DELETE' })
                .then(r => r.json())
                .then(d => { if (!d.ok) alert(d.error || 'Failed to delete'); })
                .catch(err => console.error('[Delete Msg Error]', err));
            return;
        }
    });

    async function promptChangeGlobalAlias() {
        const currentName = window.myGlobalAnonName || '';
        const newAlias = prompt(`Set your Global Chat Handle / Nickname:\n(Only visible in Global Chat. Leave empty to use random animal name)`, currentName);
        if (newAlias === null) return;

        try {
            const r = await fetch('/api/global-chat/alias', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ alias: newAlias.trim() })
            });
            const d = await r.json();
            if (d.ok) {
                window.myGlobalAnonName = d.name;
                const aliasLabel = document.querySelector('#change-global-alias-btn span');
                if (aliasLabel) aliasLabel.textContent = `Alias: ${d.name}`;
            } else {
                alert(d.error || 'Failed to update alias');
            }
        } catch(err) {
            console.error('[promptChangeGlobalAlias]', err);
            alert('Error updating alias');
        }
    }

    function connectGlobalChat() {
        if (globalEventSource) return;

        chatContainer.innerHTML = `
            <div class="flex justify-center my-6 animate-pulse">
                <span class="bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 text-xs px-4 py-2 font-bold rounded-full shadow-sm border border-indigo-100 dark:border-indigo-900/40">Connecting to Global Chat...</span>
            </div>
        `;

        globalEventSource = new EventSource('/api/global-chat/stream');

        globalEventSource.addEventListener('init', (e) => {
            try {
                const data = JSON.parse(e.data);
                window.myGlobalAnonName = data.name;
                if (currentChat === '__global__' && headerName) {
                    headerName.innerHTML = `
                        <div class="flex items-center gap-2">
                            <span>Global Chat Room</span>
                            <button id="change-global-alias-btn" title="Set your custom anonymous handle" class="text-xs px-2 py-0.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 transition flex items-center gap-1 font-medium">
                                <span>Alias: ${escapeHTML(data.name)}</span>
                                <span class="text-[10px]">✏️</span>
                            </button>
                        </div>
                    `;
                    document.getElementById('change-global-alias-btn')?.addEventListener('click', promptChangeGlobalAlias);
                }
            } catch (err) { }
        });

        globalEventSource.addEventListener('history', (e) => {
            try {
                const msgs = JSON.parse(e.data);
                chatContainer.innerHTML = '';
                let lastDate = '';
                msgs.forEach(msg => {
                    if (msg.date !== lastDate) {
                        chatContainer.insertAdjacentHTML('beforeend', `
                            <div class="flex justify-center mb-6 w-full date-separator">
                                <span class="bg-[#E1F2FB] dark:bg-[#182229] text-[#54656f] dark:text-[#8696a0] text-[12.5px] px-3 py-1 rounded-lg shadow-sm font-medium">${formatChatDate(msg.date)}</span>
                            </div>
                        `);
                        lastDate = msg.date;
                    }
                    const bubble = renderGlobalMessage(msg);
                    chatContainer.insertAdjacentHTML('beforeend', bubble);
                });
                scrollArea.scrollTop = scrollArea.scrollHeight;
            } catch (err) {
                console.error('Failed to parse global chat history:', err);
            }
        });

        globalEventSource.addEventListener('message', (e) => {
            try {
                const msg = JSON.parse(e.data);
                const bubble = renderGlobalMessage(msg);
                chatContainer.insertAdjacentHTML('beforeend', bubble);
                scrollArea.scrollTop = scrollArea.scrollHeight;
            } catch (err) {
                console.error('Failed to parse incoming global message:', err);
            }
        });

        globalEventSource.addEventListener('clear', (e) => {
            chatContainer.innerHTML = '';
        });

        globalEventSource.addEventListener('online-list', (e) => {
            try {
                const users = JSON.parse(e.data);
                updateOnlineUsersList(users);
                if (currentChat === '__global__') {
                    const statusEl = document.querySelector('#chat-header-name + div p');
                    if (statusEl) {
                        statusEl.innerHTML = `<span class="flex items-center gap-1.5"><span class="online-pulse"></span> ${users.length} user${users.length === 1 ? '' : 's'} online</span>`;
                    }
                }
            } catch (err) {
                console.error('Failed to parse online users list:', err);
            }
        });

        globalEventSource.addEventListener('typing-list', (e) => {
            try {
                const typers = JSON.parse(e.data);
                updateTypingStatus(typers);
            } catch (err) { }
        });

        globalEventSource.addEventListener('system', (e) => {
            try {
                const sys = JSON.parse(e.data);
                renderSystemMessage(sys.text);
            } catch (err) { }
        });

        globalEventSource.addEventListener('reaction', (e) => {
            try {
                const data = JSON.parse(e.data);
                updateMessageReactionsInDOM(data.messageId, data.reactions);
            } catch (err) { }
        });

        globalEventSource.addEventListener('delete-message', (e) => {
            try {
                const data = JSON.parse(e.data);
                const msgEl = document.getElementById(`global-msg-${data.messageId}`);
                if (msgEl) {
                    msgEl.style.transition = 'all 0.2s ease-out';
                    msgEl.style.opacity = '0';
                    msgEl.style.transform = 'scale(0.95)';
                    setTimeout(() => msgEl.remove(), 200);
                }
            } catch (err) { }
        });

        globalEventSource.onerror = (err) => {
            console.error('Global EventSource error:', err);
        };

        if (globalActiveIndicator) globalActiveIndicator.classList.remove('hidden');
    }

    function disconnectGlobalChat() {
        if (globalEventSource) {
            globalEventSource.close();
            globalEventSource = null;
        }
        if (globalActiveIndicator) globalActiveIndicator.classList.add('hidden');
        window.clearReplyPreview();
    }

    function updateOnlineUsersList(users) {
        if (globalOnlineCount) {
            globalOnlineCount.textContent = `${users.length} user${users.length === 1 ? '' : 's'} online`;
        }
        if (!globalOnlineUsersList) return;
        globalOnlineUsersList.innerHTML = '';
        users.forEach(u => {
            const item = document.createElement('div');
            item.className = 'flex items-center gap-2 py-0.5';
            const displayName = u.name || 'Anonymous User';

            let avatarHtml = `<div class="w-4 h-4 rounded-full bg-indigo-500 text-white font-bold flex items-center justify-center text-[8px] shrink-0">${displayName.charAt(0).toUpperCase()}</div>`;

            item.innerHTML = `
                ${avatarHtml}
                <span class="truncate font-semibold text-gray-700 dark:text-gray-300 flex-1">${escapeHTML(displayName)}</span>
                <div class="w-1.5 h-1.5 rounded-full bg-green-500"></div>
            `;
            globalOnlineUsersList.appendChild(item);
        });
    }

    function renderGlobalMessage(msg) {
        const isMe = window.__USER__ && msg.userId === window.__USER__.id;
        const msgClass = isMe ? 'glass-chat-me ml-auto rounded-2xl rounded-tr-sm' : 'glass-chat-them mr-auto rounded-2xl rounded-tl-sm';
        const nameHtml = !isMe ? `<p class="sender-name text-[11px] font-bold mb-1 tracking-wide" style="color: ${getStringColor(msg.sender)}">${msg.sender}</p>` : '';

        let replyBlockHtml = '';
        if (msg.replyTo) {
            replyBlockHtml = `
                <div class="reply-block border-l-4 border-indigo-500 bg-black/5 dark:bg-white/5 px-2 py-1 rounded-md mb-1.5 text-xs select-none">
                    <p class="font-bold text-indigo-600 dark:text-indigo-400">${escapeHTML(msg.replyTo.sender)}</p>
                    <p class="text-gray-500 dark:text-gray-300 truncate">${escapeHTML(msg.replyTo.text)}</p>
                </div>
            `;
        }

        const contentHtml = `<p style="color:var(--msg-text)" class="text-[14px] leading-normal font-medium whitespace-pre-wrap break-words">${escapeHTML(msg.text)}</p>`;
        const timeVar = isMe ? '--msg-time-me' : '--msg-time-them';

        // Actions: reply, react & delete (for own messages)
        const actionsHtml = `
            <div class="msg-actions absolute top-1/2 -translate-y-1/2 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity duration-150 flex items-center gap-1 z-30 ${isMe ? 'right-full mr-2 flex-row-reverse' : 'left-full ml-2'}">
                <button class="msg-action-btn reply-btn w-6 h-6 rounded-full bg-white dark:bg-gray-800 shadow-sm border border-gray-100 dark:border-gray-700 flex items-center justify-center text-gray-500 hover:text-indigo-600 transition" title="Reply" data-msg-id="${msg.id}" data-sender="${escapeHTML(msg.sender)}" data-text="${escapeHTML(msg.text)}">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 14L4 9l5-5"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg>
                </button>
                <button class="msg-action-btn react-trigger-btn w-6 h-6 rounded-full bg-white dark:bg-gray-800 shadow-sm border border-gray-100 dark:border-gray-700 flex items-center justify-center text-gray-500 hover:text-amber-500 transition" title="React" data-msg-id="${msg.id}">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18z"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
                </button>
                ${isMe || (window.__USER__ && (window.__USER__.is_admin === 1 || window.__USER__.is_admin === true)) ? `
                <button class="msg-action-btn delete-msg-btn w-6 h-6 rounded-full bg-white dark:bg-gray-800 shadow-sm border border-gray-100 dark:border-gray-700 flex items-center justify-center text-gray-500 hover:text-red-600 transition" title="Delete for everyone" data-msg-id="${msg.id}">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>` : ''}
            </div>
        `;

        let reactionsHtml = '';
        if (msg.reactions && Object.keys(msg.reactions).length > 0) {
            reactionsHtml = `<div class="msg-reactions-badge absolute -bottom-2.5 ${isMe ? 'right-2' : 'left-2'} bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-full px-1.5 py-0.5 shadow-sm text-[10px] flex items-center gap-1 select-none z-10">`;
            for (const [emoji, count] of Object.entries(msg.reactions)) {
                reactionsHtml += `<span>${emoji}<span class="text-[8px] font-bold text-gray-400 ml-0.5">${count}</span></span>`;
            }
            reactionsHtml += `</div>`;
        }

        const ticksHtml = isMe ? `
            <svg class="w-3.5 h-3.5 ml-1 text-blue-500 inline-block align-middle" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M2 12l5.25 5 10.75-11" />
                <path d="M8 12l5.25 5 6.75-7" stroke-width="2.5" />
            </svg>
        ` : '';

        return `
            <div class="flex flex-col mb-3.5 w-full animate-message relative group" id="global-msg-${msg.id}">
                <div class="max-w-[80%] md:max-w-[70%] lg:max-w-[65%] relative px-3 py-1.5 md:px-3.5 md:py-2 ${msgClass} flex flex-col gap-0.5">
                    ${replyBlockHtml}
                    ${nameHtml}
                    ${contentHtml}
                    <div style="color:var(${timeVar})" class="text-[9px] flex items-center justify-end font-semibold mt-1 ml-auto select-none pt-0.5">
                        ${msg.time}
                        ${ticksHtml}
                    </div>
                    ${reactionsHtml}
                </div>
                ${actionsHtml}
            </div>
        `;
    }

    function escapeHTML(s) {
        return String(s || '').replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
        }[c]));
    }

    function deactivateGlobalUI() {
        disconnectGlobalChat();
        if (globalChatItem) {
            globalChatItem.classList.remove('bg-indigo-50', 'border-indigo-200', 'shadow-sm');
            globalChatItem.classList.add('hover:bg-gray-100', 'border-transparent');
        }
        if (globalOnlineUsersList) globalOnlineUsersList.classList.add('hidden');
        if (askAiBtn) askAiBtn.classList.remove('hidden');
        if (clearGlobalChatBtn) clearGlobalChatBtn.classList.add('hidden');
        if (bottomAiInput) {
            animatePlaceholder(bottomAiInput, `Continue With virtual ${otherPersonName}…`);
        }
        // Restore header to current chat's contact name
        if (headerName && otherPersonName) headerName.innerText = otherPersonName;
        const statusEl = document.querySelector('#chat-header-name + div p');
        if (statusEl) statusEl.innerText = 'online';

        // Show filters and search since they apply to private chats
        const filterBar = document.getElementById('filter-buttons-container');
        if (filterBar) filterBar.classList.remove('hidden');
        const searchBar = document.querySelector('.px-4.pt-3.pb-2.shrink-0.flex.gap-2.relative');
        if (searchBar) searchBar.classList.remove('hidden');
        const searchResults = document.getElementById('search-results');
        if (searchResults) searchResults.classList.remove('hidden');
        const smartFilters = document.getElementById('smart-filters-container');
        if (smartFilters) smartFilters.classList.add('hidden'); // remains hidden unless toggled
    }

    if (globalChatItem) {
        globalChatItem.addEventListener('click', () => {
            if (currentChat === '__global__') {
                if (isMobile() || window.kothaCompact) toggleSidebar(false);
                return;
            }

            disconnectGlobalChat();

            currentChat = '__global__';
            window.currentChat = '__global__'; localStorage.setItem("kotha_active_chat", '__global__');

            globalChatItem.classList.add('bg-indigo-50', 'border-indigo-200', 'shadow-sm');
            globalChatItem.classList.remove('hover:bg-gray-100', 'border-transparent');
            if (globalOnlineUsersList) globalOnlineUsersList.classList.remove('hidden');

            renderChatList(loadedChats, '');

            if (askAiBtn) askAiBtn.classList.add('hidden');
            if (window.__USER__ && (window.__USER__.is_admin === 1 || window.__USER__.is_admin === true)) {
                if (clearGlobalChatBtn) clearGlobalChatBtn.classList.remove('hidden');
            }
            if (headerName) {
                const myAlias = window.myGlobalAnonName || '';
                headerName.innerHTML = `
                    <div class="flex items-center gap-2">
                        <span>Global Chat Room</span>
                        <button id="change-global-alias-btn" title="Set your custom anonymous handle" class="text-xs px-2 py-0.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 transition flex items-center gap-1 font-medium">
                            <span>Alias: ${escapeHTML(myAlias || 'Set Alias')}</span>
                            <span class="text-[10px]">✏️</span>
                        </button>
                    </div>
                `;
                document.getElementById('change-global-alias-btn')?.addEventListener('click', promptChangeGlobalAlias);
            }
            if (sidebarTitle) sidebarTitle.innerText = 'Global Chat';
            const statusEl = document.querySelector('#chat-header-name + div p');
            if (statusEl) statusEl.innerText = 'Connecting...';

            if (bottomAiInput) {
                animatePlaceholder(bottomAiInput, 'Send a message to everyone…');
            }

            const aiChatContainer = document.getElementById('ai-chat-container');
            if (aiChatContainer) aiChatContainer.innerHTML = '';

            // Hide filters and search since they don't apply to global chat
            const filterBar = document.getElementById('filter-buttons-container');
            if (filterBar) filterBar.classList.add('hidden');
            const searchBar = document.querySelector('.px-4.pt-3.pb-2.shrink-0.flex.gap-2.relative');
            if (searchBar) searchBar.classList.add('hidden');
            const searchResults = document.getElementById('search-results');
            if (searchResults) searchResults.classList.add('hidden');
            const smartFilters = document.getElementById('smart-filters-container');
            if (smartFilters) smartFilters.classList.add('hidden');

            // Reset displayed messages so scroll/other filters don't operate on old data
            displayedMessages = [];
            allMessages = [];
            renderStart = 0;
            renderEnd = 0;

            removeEmptyState();

            connectGlobalChat();
            toggleSidebar(false);
        });
    }

    if (clearGlobalChatBtn) {
        clearGlobalChatBtn.addEventListener('click', async () => {
            if (!confirm('Are you sure you want to clear the entire global chat history? This cannot be undone.')) return;
            try {
                const resp = await fetch('/api/global-chat/clear', { method: 'DELETE' });
                if (!resp.ok) {
                    const err = await resp.json();
                    alert('Failed to clear global chat: ' + (err.error || resp.statusText));
                } else {
                    window.kothaToast('Global chat cleared');
                }
            } catch (err) {
                alert('Network error: ' + err.message);
            }
        });
    }

    // Initialize application by fetching the list of available chats
    loadChatsList();
    setTimeout(showOnboarding, 800);

    // Quick Action Listeners
    const scrollToTopAction = () => {
        if (!currentChat || currentChat === '__global__' || !allMessages.length) {
            if (window.kothaToast) window.kothaToast('Open a chat first');
            return;
        }
        displayedMessages = allMessages; // Reset filter if active
        renderChats(0, Math.min(CHUNK_SIZE, displayedMessages.length));
        setTimeout(() => scrollArea.scrollTop = 0, 10);
        toggleSidebar(false);
    };
    if (btnTop) btnTop.addEventListener('click', scrollToTopAction);
    if (btnTop2) btnTop2.addEventListener('click', scrollToTopAction);

    const scrollToBottomAction = () => {
        if (!currentChat || currentChat === '__global__' || !allMessages.length) {
            if (window.kothaToast) window.kothaToast('Open a chat first');
            return;
        }
        displayedMessages = allMessages;
        const end = displayedMessages.length;
        renderChats(Math.max(0, end - CHUNK_SIZE), end);
        setTimeout(() => scrollArea.scrollTop = scrollArea.scrollHeight, 10);
        toggleSidebar(false);
    };
    if (btnBottom) btnBottom.addEventListener('click', scrollToBottomAction);
    if (btnBottom2) btnBottom2.addEventListener('click', scrollToBottomAction);

    const openMediaGallery = () => {
        if (!currentChat || currentChat === '__global__' || !allMessages.length) {
            if (window.kothaToast) window.kothaToast('Open a chat first');
            return;
        }
        
        window.__showOnlyMedia = !window.__showOnlyMedia;
        
        [btnMedia, btnMedia2].forEach(btn => {
            if (btn) {
                if (window.__showOnlyMedia) {
                    btn.classList.add('text-indigo-600', 'dark:text-indigo-400', 'bg-indigo-50', 'dark:bg-indigo-900/30');
                    btn.classList.remove('text-gray-500', 'dark:text-gray-400');
                } else {
                    btn.classList.remove('text-indigo-600', 'dark:text-indigo-400', 'bg-indigo-50', 'dark:bg-indigo-900/30');
                    btn.classList.add('text-gray-500', 'dark:text-gray-400');
                }
            }
        });
        
        const applyFiltersBtn = document.getElementById('apply-filters-btn');
        if (applyFiltersBtn) applyFiltersBtn.click();
        
        toggleSidebar(false);
    };
    if (btnMedia) btnMedia.addEventListener('click', openMediaGallery);
    if (btnMedia2) btnMedia2.addEventListener('click', openMediaGallery);

    const closeAnModal = () => {
        analyticsModal.classList.remove('opacity-100');
        analyticsModal.classList.add('opacity-0');
        setTimeout(() => analyticsModal.classList.add('hidden'), 300);
    };

    closeAnalytics.addEventListener('click', closeAnModal);
    analyticsModal.addEventListener('click', (e) => {
        if (e.target === analyticsModal) closeAnModal();
    });

    const openAnalyticsModal = () => {
        const totalMsgs = allMessages.filter(m => m.type !== 'system').length;
        const totalMedia = allMessages.filter(m => m.attachment && m.type !== 'system').length;
        const totalLinks = allMessages.filter(m => m.text && m.text.includes('http')).length;
        const firstDate = allMessages.find(m => m.date)?.date || '-';

        document.getElementById('stat-chat-title').innerText = `Chat with ${otherPersonName}`;
        document.getElementById('stat-total-msgs').innerText = totalMsgs.toLocaleString();
        document.getElementById('stat-total-media').innerText = totalMedia.toLocaleString();
        document.getElementById('stat-total-links').innerText = totalLinks.toLocaleString();
        document.getElementById('stat-first-date').innerText = firstDate;

        // Clean sender filter — rejects URLs, links, or system message artifacts
        const isCleanSender = (name) => {
            if (!name || typeof name !== 'string') return false;
            const s = name.trim();
            if (s.length < 2) return false;
            if (/^https?:\/\//i.test(s) || /^www\./i.test(s) || /https?:\/\//i.test(s) || /\.(com|org|net|me|in|io|co|app)\b/i.test(s)) return false;
            if (/(end-to-end|security code|changed the subject|changed this group|left the group|joined using|added you|removed you|<media omitted>|omitted|deleted this message)/i.test(s)) return false;
            return true;
        };

        const senderCounts = {};
        allMessages.forEach(msg => {
            if (msg.sender && msg.type !== 'system' && isCleanSender(msg.sender)) {
                senderCounts[msg.sender] = (senderCounts[msg.sender] || 0) + 1;
            }
        });

        // Fallback if no sender parsed cleanly
        if (Object.keys(senderCounts).length === 0) {
            senderCounts[otherPersonName || 'You'] = totalMsgs;
        }

        let contributorsHtml = '';
        const sortedContributors = Object.entries(senderCounts).sort((a, b) => b[1] - a[1]).slice(0, 3);
        const maxTotal = Math.max(1, totalMsgs);
        sortedContributors.forEach(([sName, count], idx) => {
            const pct = Math.round((count / maxTotal) * 100);
            const colors = ['text-indigo-400 bg-indigo-500/10', 'text-pink-400 bg-pink-500/10', 'text-emerald-400 bg-emerald-500/10'];
            const barColors = ['bg-indigo-500', 'bg-pink-500', 'bg-emerald-500'];
            const cClass = colors[idx] || 'text-teal-400 bg-teal-500/10';
            const bColor = barColors[idx] || 'bg-teal-500';

            contributorsHtml += `
                <div>
                    <div class="flex justify-between items-center text-xs mb-1">
                        <span class="font-bold text-white/90 truncate max-w-[180px]">${sName}</span>
                        <span class="font-extrabold ${cClass} px-2 py-0.5 rounded text-[10px]">${count.toLocaleString()} (${pct}%)</span>
                    </div>
                    <div class="w-full h-1.5 rounded-full bg-white/5 overflow-hidden">
                        <div class="h-full ${bColor} rounded-full" style="width: ${pct}%"></div>
                    </div>
                </div>
            `;
        });
        document.getElementById('stat-contributors').innerHTML = contributorsHtml;

        // ── Compute Impressive Chat Stats ──
        // 1. Peak Weekday
        const weekdayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const weekdayTallies = [0, 0, 0, 0, 0, 0, 0];
        allMessages.forEach(m => {
            if (!m.date || m.type === 'system') return;
            const pd = parseMsgDate(m.date);
            if (pd) {
                const dObj = new Date(pd.y, pd.mon - 1, pd.day);
                if (!isNaN(dObj.getTime())) {
                    weekdayTallies[dObj.getDay()]++;
                }
            }
        });
        let maxWIdx = 5, maxWCnt = 0;
        weekdayTallies.forEach((cnt, idx) => {
            if (cnt > maxWCnt) { maxWCnt = cnt; maxWIdx = idx; }
        });
        const peakWeekday = weekdayNames[maxWIdx];

        // 2. Night Owls (11 PM – 5 AM)
        let nightCount = 0;
        allMessages.forEach(m => {
            if (!m.time || m.type === 'system') return;
            const isPM = /pm/i.test(m.time);
            const isAM = /am/i.test(m.time);
            const parts = m.time.replace(/[^0-9:]/g, '').split(':');
            let h = parseInt(parts[0], 10);
            if (isNaN(h)) return;
            if (isPM && h !== 12) h += 12;
            if (isAM && h === 12) h = 0;
            if (h >= 23 || h < 5) nightCount++;
        });

        // 3. Laughs Count
        let laughCount = 0;
        const laughRegex = /[\u{1F602}\u{1F923}\u{1F606}]|haha|hehe|lmao|lol\b|rofl/iu;
        allMessages.forEach(m => {
            if (m.text && m.type !== 'system' && laughRegex.test(m.text)) {
                laughCount++;
            }
        });

        // 4. Top Emojis
        const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;
        const emojiCounts = {};
        allMessages.forEach(m => {
            if (!m.text || m.type === 'system') return;
            const matches = m.text.match(emojiRegex);
            if (matches) {
                matches.forEach(e => { emojiCounts[e] = (emojiCounts[e] || 0) + 1; });
            }
        });
        const topEmojis = Object.entries(emojiCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 4);

        // Populate Impressive Highlight Metrics
        const peakDayEl = document.getElementById('stat-peak-day');
        if (peakDayEl) peakDayEl.innerText = peakWeekday;

        const nightMsgsEl = document.getElementById('stat-night-msgs');
        if (nightMsgsEl) nightMsgsEl.innerText = nightCount.toLocaleString();

        const laughCountEl = document.getElementById('stat-laugh-count');
        if (laughCountEl) laughCountEl.innerText = laughCount.toLocaleString();

        const emojisRow = document.getElementById('stat-emojis-row');
        const emojisContainer = document.getElementById('stat-top-emojis');
        if (emojisRow && emojisContainer) {
            if (topEmojis.length > 0) {
                emojisContainer.innerHTML = topEmojis.map(([e, cnt]) => `
                    <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/10 text-xs font-bold" title="${cnt} times">
                        <span>${e}</span>
                        <span class="text-[10px] text-white/60">${cnt}</span>
                    </span>
                `).join('');
                emojisRow.classList.remove('hidden');
            } else {
                emojisRow.classList.add('hidden');
            }
        }

        // Hook up download/copy handlers
        const dlBtn = document.getElementById('stat-download-btn');
        const cpBtn = document.getElementById('stat-copy-btn');

        const showToast = (msg) => {
            if (window.kothaToast) window.kothaToast(msg);
            else console.log(msg);
        };

        const statsPayload = {
            contactName: otherPersonName,
            totalMsgs,
            totalMedia,
            totalLinks,
            firstDate,
            peakDay: peakWeekday,
            nightMsgs: nightCount,
            laughCount: laughCount,
            topEmojis: topEmojis,
            contributors: sortedContributors.map(([sName, count]) => {
                const pct = Math.round((count / maxTotal) * 100);
                return [sName, count, pct];
            })
        };

        if (dlBtn) dlBtn.statsPayload = statsPayload;
        if (cpBtn) cpBtn.statsPayload = statsPayload;

        if (dlBtn && !dlBtn.hasListener) {
            dlBtn.hasListener = true;
            const handleDl = (e) => {
                e.stopPropagation();
                e.preventDefault();
                showToast('Generating stats card...');
                if (window.kothaExportStatsCard) {
                    window.kothaExportStatsCard(dlBtn.statsPayload, 'download');
                } else {
                    showToast('Export module not loaded yet');
                }
            };
            dlBtn.addEventListener('click', handleDl);
            dlBtn.addEventListener('touchend', (e) => {
                e.stopPropagation();
                e.preventDefault();
                handleDl(e);
            }, { passive: false });
        }

        if (cpBtn && !cpBtn.hasListener) {
            cpBtn.hasListener = true;
            const handleCp = (e) => {
                e.stopPropagation();
                e.preventDefault();
                showToast('Copying stats card...');
                if (window.kothaExportStatsCard) {
                    window.kothaExportStatsCard(cpBtn.statsPayload, 'copy');
                } else {
                    showToast('Export module not loaded yet');
                }
            };
            cpBtn.addEventListener('click', handleCp);
            cpBtn.addEventListener('touchend', (e) => {
                e.stopPropagation();
                e.preventDefault();
                handleCp(e);
            }, { passive: false });
        }

        toggleSidebar(false);
        analyticsModal.classList.remove('hidden');
        void analyticsModal.offsetWidth;
        analyticsModal.classList.remove('opacity-0');
        analyticsModal.classList.add('opacity-100');
    };
    if (btnAnalytics) btnAnalytics.addEventListener('click', openAnalyticsModal);
    if (btnAnalytics2) btnAnalytics2.addEventListener('click', openAnalyticsModal);

    // Explicit Button-Triggered Search Logic
    const searchResultsContainer = document.getElementById('search-results');

    searchBox.addEventListener('input', (e) => {
        const val = e.target.value.trim();
        const lowerVal = val.toLowerCase();
        
        if (val.length > 0) {
            searchClearBtn.classList.remove('hidden');
        } else {
            searchClearBtn.classList.add('hidden');
        }

        // Live filter chat list
        if (loadedChats && loadedChats.length > 0) {
            const filteredChats = loadedChats.filter(c => c.toLowerCase().includes(lowerVal));
            renderChatList(filteredChats, currentChat);
        }

        const globalSpaceSection = document.getElementById('global-space-section');
        const chatsListSection = document.getElementById('chats-list-section');
        const participantContainer = document.getElementById('participant-filters-container');

        if (lowerVal.length < 2) {
            if (searchResultsContainer) searchResultsContainer.classList.add('hidden');
            if (resultsList) resultsList.innerHTML = '';
            if (globalSpaceSection) globalSpaceSection.classList.remove('hidden');
            if (chatsListSection) chatsListSection.classList.remove('hidden');
            if (participantContainer && window.allMessages && window.allMessages.length > 0) participantContainer.classList.remove('hidden');
            return;
        }

        // Deep search in loaded messages
        if (globalSpaceSection) globalSpaceSection.classList.add('hidden');
        if (chatsListSection) chatsListSection.classList.add('hidden');
        if (participantContainer) participantContainer.classList.add('hidden');
        if (searchResultsContainer) searchResultsContainer.classList.remove('hidden');

        const filteredMsgs = [];
        if (allMessages && allMessages.length > 0) {
            for (let i = 0; i < allMessages.length; i++) {
                if (allMessages[i].text && allMessages[i].text.toLowerCase().includes(lowerVal)) {
                    filteredMsgs.push(allMessages[i]);
                }
            }
        }

        if (statsInfo) {
            statsInfo.innerHTML = `Found <span class="font-bold text-indigo-600 dark:text-indigo-400">${filteredMsgs.length.toLocaleString()}</span> message matches.`;
        }

        if (resultsList) {
            if (filteredMsgs.length === 0) {
                resultsList.innerHTML = `<div class="text-xs text-gray-400 py-2 text-center">No message matches found</div>`;
            } else {
                let resultsHtml = '';
                // Show up to 100 results so they fill the screen better
                const limitRes = filteredMsgs.slice(-100);
                const regex = new RegExp(`(${lowerVal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
                limitRes.forEach(msg => {
                    const highlightedText = (msg.text || '').replace(regex, `<mark class="bg-yellow-200 text-gray-900 font-bold px-0.5 rounded">$1</mark>`);
                    resultsHtml += `
                        <div class="p-1.5 bg-white dark:bg-gray-800 hover:bg-indigo-50/50 dark:hover:bg-gray-700/50 shadow-xs cursor-pointer border border-gray-100 dark:border-gray-700 transition-all rounded-lg mb-1" onclick="jumpToMsg(${msg.id})">
                            <div class="flex justify-between items-center mb-0.5">
                                <span class="text-[10px] font-bold uppercase tracking-wide" style="color:${getStringColor(msg.sender || 'System')}">${msg.sender || 'System'}</span> 
                                <span class="text-[9px] text-gray-400 font-semibold">${msg.date || ''} ${msg.time || ''}</span>
                            </div>
                            <p class="text-[11px] text-gray-700 dark:text-gray-200 font-medium line-clamp-2 leading-relaxed">${highlightedText}</p>
                        </div>
                    `;
                });
                resultsList.innerHTML = resultsHtml;
            }
        }

        if (searchResultsContainer) {
            searchResultsContainer.classList.remove('hidden');
        }
    });

    searchClearBtn.addEventListener('click', () => {
        searchBox.value = '';
        searchClearBtn.classList.add('hidden');
        
        const globalSpaceSection = document.getElementById('global-space-section');
        const chatsListSection = document.getElementById('chats-list-section');
        const participantContainer = document.getElementById('participant-filters-container');
        if (globalSpaceSection) globalSpaceSection.classList.remove('hidden');
        if (chatsListSection) chatsListSection.classList.remove('hidden');
        if (participantContainer && window.allMessages && window.allMessages.length > 0) participantContainer.classList.remove('hidden');

        if (loadedChats) {
            renderChatList(loadedChats, currentChat);
        }
        if (searchResultsContainer) searchResultsContainer.classList.add('hidden');
        if (resultsList) resultsList.innerHTML = '';
        if (statsInfo) {
            statsInfo.innerHTML = `Loaded <span class="font-bold text-blue-600 dark:text-blue-400">${allMessages.length.toLocaleString()}</span> messages dynamically.`;
        }
    });

    // ── Dark Mode Toggle ──
    const darkBtn = document.getElementById('dark-mode-btn');
    const dmIcon = document.getElementById('dm-icon');
    function updateDmIcon() {
        const isDark = document.documentElement.classList.contains('dark');
        const svgContent = isDark
            ? '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>'
            : '<path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>';
        
        if (dmIcon) dmIcon.innerHTML = svgContent;
        document.querySelectorAll('.dm-icon-svg').forEach(el => el.innerHTML = svgContent);
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.content = isDark ? '#111b21' : '#f0f2f5';
    }

    function toggleTheme() {
        document.documentElement.classList.toggle('dark');
        const isDark = document.documentElement.classList.contains('dark');
        localStorage.setItem('kotha_dark', isDark ? '1' : '0');
        updateDmIcon();
        window.dispatchEvent(new CustomEvent('kotha-theme-change', { detail: { dark: isDark } }));
    }
    window.kothaToggleTheme = toggleTheme;

    updateDmIcon(); // Set initial icon unconditionally
    if (darkBtn) {
        darkBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleTheme();
        });
    }

    window.jumpToMsg = (id) => {
        displayedMessages = allMessages; // Make sure we are in main view
        const idx = displayedMessages.findIndex(m => String(m.id) === String(id));
        if (idx !== -1) {
            const start = Math.max(0, idx - 50);
            const end = Math.min(displayedMessages.length, idx + 100);
            renderChats(start, end);

            toggleSidebar(false);
            if (typeof closeSearchModal === 'function') closeSearchModal();
            
            // Close mobile overlays if open
            const mobOverlay = document.getElementById('mobile-popup-overlay');
            const searchMod = document.getElementById('mobile-search-modal');
            const filtMod = document.getElementById('mobile-filter-modal');
            if (mobOverlay) { mobOverlay.classList.add('hidden'); mobOverlay.style.display = 'none'; }
            if (searchMod) { searchMod.classList.add('hidden'); searchMod.style.display = 'none'; }
            if (filtMod) { filtMod.classList.add('hidden'); filtMod.style.display = 'none'; }
            const inlineSearchOverlay = document.getElementById('chat-inline-search-overlay');
            if (inlineSearchOverlay) {
                inlineSearchOverlay.classList.add('hidden');
                document.getElementById('inline-search-results-container').classList.add('hidden');
            }

            setTimeout(() => {
                const el = document.getElementById(`msg-${id}`);
                if (el) {
                    scrollArea.scrollTop = el.offsetTop - (scrollArea.clientHeight / 2) + 50;
                    const bubble = el.firstElementChild;
                    if (bubble) {
                        bubble.style.transition = 'all 0.3s ease';
                        bubble.style.boxShadow = '0 0 0 3px rgba(250,204,21,0.6), 0 8px 24px -4px rgba(0,0,0,0.15)';
                        bubble.style.transform = 'scale(1.02)';
                        bubble.classList.add('search-result-flash');

                        // Highlight search query inside the message
                        const deskQuery = searchBox ? searchBox.value.trim() : '';
                        const mobQuery = document.getElementById('inline-search-input') ? document.getElementById('inline-search-input').value.trim() : '';
                        const query = deskQuery || mobQuery;
                        if (query.length >= 3) {
                            const textEl = bubble.querySelector('p');
                            if (textEl && textEl.textContent.toLowerCase().includes(query.toLowerCase())) {
                                const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
                                textEl.innerHTML = textEl.textContent.replace(regex, '<mark class="search-highlight">$1</mark>');
                            }
                        }

                        setTimeout(() => {
                            bubble.style.boxShadow = '';
                            bubble.style.transform = '';
                            bubble.classList.remove('search-result-flash');
                            // Remove highlight marks after a while
                            setTimeout(() => {
                                const marks = bubble.querySelectorAll('mark.search-highlight');
                                marks.forEach(m => {
                                    m.outerHTML = m.textContent;
                                });
                            }, 3000);
                        }, 2500);
                    }
                }
                
                // Clear the mobile input now that highlighting is set up
                const mobInput = document.getElementById('inline-search-input');
                if (mobInput) {
                    mobInput.value = '';
                    const countLabel = document.getElementById('inline-search-count');
                    if (countLabel) countLabel.textContent = '';
                }
            }, 100);
        }
    };

    // Hotkey: Press '/' to focus `#bottom-ai-input` on PC/desktop
    document.addEventListener('keydown', (e) => {
        if (e.key === '/') {
            const activeEl = document.activeElement;
            if (activeEl && (
                activeEl.tagName === 'INPUT' ||
                activeEl.tagName === 'TEXTAREA' ||
                activeEl.isContentEditable
            )) {
                return;
            }
            if (bottomAiInput) {
                e.preventDefault();
                bottomAiInput.focus();
            }
        }
    });

    // Expose chat data getters globally for features (like Chat Wrapped)
    window.kothaGetAllMessages = () => allMessages;
    window.kothaGetMyName = () => myName;

    // Called by ai-panel.js after identity modal resolves so messages align immediately
    window.kothaSetMyName = (name, otherName) => {
        myName = name || null;
        if (otherName) otherPersonName = otherName;
        // Re-render the current visible chat slice to apply correct alignment
        if (currentChat && displayedMessages.length > 0) {
            lastRenderedDate = '';
            chatContainer.innerHTML = '';
            const end = Math.min(displayedMessages.length, renderStart + (renderEnd - renderStart || 100));
            renderChats(renderStart, end, 'reset');
            // Scroll to bottom to show latest messages in correct alignment
            scrollArea.scrollTop = scrollArea.scrollHeight;
        }
    };

    window.kothaGetOtherPersonName = () => otherPersonName;
    window.kothaGetCurrentChat = () => currentChat;

    // ─── Auto-focus input on any keypress ───
    // When user starts typing anywhere, focus the chat input automatically
    document.addEventListener('keydown', (e) => {
        // Only act when a chat is open
        if (!currentChat) return;
        const inp = document.getElementById('bottom-ai-input');
        if (!inp) return;
        // Don't steal focus if already in an input/textarea/contenteditable
        const tag = (document.activeElement && document.activeElement.tagName) || '';
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        if (document.activeElement && document.activeElement.isContentEditable) return;
        // Skip modifier-combos (Ctrl+A, Cmd+K, etc.) — only printable + Enter/Space/Backspace
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        // Only act on printable keys (length 1) or Enter/Backspace
        const isPrintable = e.key.length === 1;
        const isEnter = e.key === 'Enter';
        const isBackspace = e.key === 'Backspace';
        if (!isPrintable && !isEnter && !isBackspace) return;
        // Focus the input — the keystroke itself will land in it
        inp.focus();
    });

    // ─── macOS Window: Drag + Traffic Lights (md+ only) ───
    (function initMacFrame() {
        const frame = document.getElementById('mac-frame');
        const titlebar = document.getElementById('mac-titlebar');
        if (!frame || !titlebar) return;

        let inited = false;
        let userHasDragged = false;
        let userHasResized = false;

        function centerFrame() {
            if (frame.classList.contains('mac-fullscreen') || isMobile()) return;
            const targetW = userHasResized
                ? Math.min(parseInt(frame.style.width) || 960, window.innerWidth - 30)
                : Math.max(760, Math.min(window.innerWidth * 0.82, 1100));
            const targetH = userHasResized
                ? Math.min(parseInt(frame.style.height) || 720, window.innerHeight - 100)
                : Math.min(window.innerHeight * 0.82, Math.max(620, window.innerHeight - 130));

            const left = Math.max(10, Math.round((window.innerWidth - targetW) / 2));
            const top = Math.max(15, Math.round((window.innerHeight - targetH - 80) / 2));

            frame.style.position = 'absolute';
            frame.style.width = Math.round(targetW) + 'px';
            frame.style.height = Math.round(targetH) + 'px';
            frame.style.left = left + 'px';
            frame.style.top = top + 'px';
            frame.style.margin = '0';
            document.body.style.position = 'relative';
            inited = true;
        }

        function clampFrameInViewport() {
            if (frame.classList.contains('mac-fullscreen') || isMobile()) return;
            const r = frame.getBoundingClientRect();
            let w = parseInt(frame.style.width) || r.width;
            let h = parseInt(frame.style.height) || r.height;
            let l = parseInt(frame.style.left) || r.left;
            let t = parseInt(frame.style.top) || r.top;

            // If the user hasn't manually resized the frame, auto-scale it dynamically!
            if (!userHasResized) {
                w = Math.max(760, Math.min(window.innerWidth * 0.82, 1100));
                h = Math.min(window.innerHeight * 0.82, Math.max(620, window.innerHeight - 130));
            }

            if (w > window.innerWidth - 20) {
                w = Math.max(380, window.innerWidth - 20);
            }
            if (h > window.innerHeight - 100) {
                h = Math.max(400, window.innerHeight - 100);
            }
            if (l + w > window.innerWidth - 10) {
                l = Math.max(10, window.innerWidth - w - 10);
            }
            if (t + h > window.innerHeight - 95) { // 95px clears the dock perfectly
                t = Math.max(10, window.innerHeight - h - 95);
            }
            if (l < 10) l = 10;
            if (t < 10) t = 10;

            frame.style.width = Math.round(w) + 'px';
            frame.style.height = Math.round(h) + 'px';
            frame.style.left = Math.round(l) + 'px';
            frame.style.top = Math.round(t) + 'px';
        }

        function initPosition() {
            if (inited) return;
            inited = true;
            const r = frame.getBoundingClientRect();
            frame.style.position = 'absolute';
            frame.style.left = (parseInt(frame.style.left) || r.left) + 'px';
            frame.style.top = (parseInt(frame.style.top) || r.top) + 'px';
            frame.style.width = (parseInt(frame.style.width) || r.width) + 'px';
            frame.style.height = (parseInt(frame.style.height) || r.height) + 'px';
            frame.style.margin = '0';
            document.body.style.position = 'relative';
        }

        function resetPosition() {
            frame.style.position = '';
            frame.style.left = '';
            frame.style.top = '';
            frame.style.width = '';
            frame.style.height = '';
            frame.style.margin = '';
            document.body.style.position = '';
            frame.classList.remove('is-dragging');
            inited = false;
        }

        // Initialize desktop position
        if (!isMobile() && window.innerWidth >= 768) {
            centerFrame();
        }

        // --- Resize handles overlay ---
        const rhOverlay = document.createElement('div');
        rhOverlay.id = 'rh-overlay';
        const rhTpl = document.getElementById('resize-handles-tpl');
        if (rhTpl) rhOverlay.appendChild(rhTpl.content.cloneNode(true));
        document.body.appendChild(rhOverlay);

        function syncOverlay() {
            if (isMobile()) {
                if (inited) resetPosition();
                rhOverlay.style.display = 'none';
                return;
            }
            if (frame.classList.contains('mac-fullscreen') || frame.classList.contains('mac-minimized')) {
                rhOverlay.style.display = 'none';
                return;
            }
            const r = frame.getBoundingClientRect();
            rhOverlay.style.display = 'block';
            rhOverlay.style.left = r.left + 'px';
            rhOverlay.style.top = r.top + 'px';
            rhOverlay.style.width = r.width + 'px';
            rhOverlay.style.height = r.height + 'px';
        }

        syncOverlay();

        window.addEventListener('resize', () => {
            if (dragging) {
                dragging = false;
                isActualDrag = false;
                frame.classList.remove('is-dragging');
            }
            if (isMobile()) {
                resetPosition();
                rhOverlay.style.display = 'none';
                return;
            }
            if (frame.classList.contains('mac-fullscreen')) {
                rhOverlay.style.display = 'none';
                return;
            }
            // If they haven't manually modified the window, keep it perfectly centered and auto-scaled
            if (!userHasDragged && !userHasResized) {
                centerFrame();
            } else {
                // Otherwise, keep it in viewport without overriding their custom position/size
                clampFrameInViewport();
            }
            syncOverlay();
        });

        // --- Compact (phone-like) mode based on the FRAME's own width ---
        const sidebarEl = document.getElementById('sidebar');
        function hasActiveChatOrPending() {
            if (window.currentChat) return true;
            if (typeof window.dmIsConvActive === 'function' && window.dmIsConvActive()) return true;
            if (window.location.hash && window.location.hash.startsWith('#chat-')) return true;

            const urlParams = new URLSearchParams(window.location.search);
            if (urlParams.get('chat')) return true;

            const savedChat = localStorage.getItem('kotha_active_chat');
            const isViewingDM = window.location.hash && window.location.hash.startsWith('#chat-');
            if (savedChat && !isViewingDM) return true;

            const dmView = localStorage.getItem('kotha_dm_view');
            const dmConv = localStorage.getItem('kotha_dm_active_conv');
            if (dmView === 'messages' && dmConv) return true;

            return false;
        }

        function updateCompact() {
            const compact = frame.getBoundingClientRect().width < 760;
            if (compact === !!window.kothaCompact) return;
            window.kothaCompact = compact;
            frame.classList.toggle('kompact', compact);
            if (compact) {
                // collapse sidebar into slide-in overlay, BUT open it automatically if no chat is active
                const hasActiveChat = hasActiveChatOrPending();
                if (!hasActiveChat) {
                    if (sidebarEl) {
                        sidebarEl.classList.remove('-translate-x-full');
                        sidebarEl.classList.add('translate-x-0');
                    }
                    const bd = document.getElementById('sidebar-backdrop');
                    if (bd) bd.classList.remove('hidden');
                } else {
                    if (sidebarEl) {
                        sidebarEl.classList.add('-translate-x-full');
                        sidebarEl.classList.remove('translate-x-0');
                    }
                    const bd = document.getElementById('sidebar-backdrop');
                    if (bd) bd.classList.add('hidden');
                }
            } else {
                if (sidebarEl) {
                    sidebarEl.classList.remove('-translate-x-full');
                    sidebarEl.classList.remove('translate-x-0');
                }
                const bd = document.getElementById('sidebar-backdrop');
                if (bd) bd.classList.add('hidden');
            }
        }
        if (window.ResizeObserver) {
            new ResizeObserver(updateCompact).observe(frame);
        }
        updateCompact();

        let dragging = false;
        let isActualDrag = false;
        let sx = 0, sy = 0, sl = 0, st = 0;

        titlebar.addEventListener('mousedown', (e) => {
            if (e.target.closest('button')) return;
            if (frame.classList.contains('mac-fullscreen') || isMobile()) return;

            const rect = frame.getBoundingClientRect();
            // Don't drag if click is within 10px of top, left, or right edge (resize zones)
            if (e.clientY - rect.top < 10 || e.clientX - rect.left < 10 || rect.right - e.clientX < 10) {
                return;
            }

            initPosition();
            dragging = true;
            isActualDrag = false;
            sx = e.clientX;
            sy = e.clientY;
            sl = parseInt(frame.style.left) || rect.left;
            st = parseInt(frame.style.top) || rect.top;
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!dragging) return;
            if (!isActualDrag) {
                if (Math.hypot(e.clientX - sx, e.clientY - sy) > 4) {
                    isActualDrag = true;
                    userHasDragged = true;
                    frame.classList.add('is-dragging');
                } else {
                    return;
                }
            }
            const w = parseInt(frame.style.width) || frame.getBoundingClientRect().width;
            const h = parseInt(frame.style.height) || frame.getBoundingClientRect().height;
            const maxL = Math.max(0, window.innerWidth - Math.min(w, window.innerWidth - 60));
            const maxT = Math.max(0, window.innerHeight - h - 95);
            
            frame.style.left = Math.max(0, Math.min(maxL, sl + (e.clientX - sx))) + 'px';
            frame.style.top = Math.max(0, Math.min(maxT, st + (e.clientY - sy))) + 'px';
            syncOverlay();
        });

        document.addEventListener('mouseup', () => {
            if (!dragging) return;
            dragging = false;
            isActualDrag = false;
            frame.classList.remove('is-dragging');
        });

        window.addEventListener('blur', () => {
            if (dragging) {
                dragging = false;
                isActualDrag = false;
                frame.classList.remove('is-dragging');
            }
        });

        // Double-click titlebar to toggle fullscreen
        titlebar.addEventListener('dblclick', (e) => {
            if (e.target.closest('button')) return;
            document.getElementById('mac-fullscreen').click();
        });

        // --- Traffic light buttons ---
        const closeBtn = document.getElementById('mac-close');
        const minBtn = document.getElementById('mac-minimize');
        const fsBtn = document.getElementById('mac-fullscreen');
        const dock = document.getElementById('mac-dock');
        const dockIcon = document.getElementById('dock-kotha-icon');

        let minimized = false;
        let isAnimating = false;

        const dockDot = document.getElementById('dock-dot');

        function genieMinimize() {
            if (minimized || isAnimating) return;
            isAnimating = true;
            minimized = true;
            rhOverlay.style.display = 'none';
            frame.classList.remove('genie-restore');
            frame.classList.add('genie-minimize');
            if (dockDot) dockDot.style.opacity = '0';
            if (dock) dock.style.removeProperty('display'); // Make sure dock is shown on minimize
            setTimeout(() => {
                frame.classList.add('mac-minimized');
                frame.classList.remove('genie-minimize');
                isAnimating = false;
            }, 500);
        }

        function genieRestore() {
            if (!minimized || isAnimating) return;
            isAnimating = true;
            minimized = false;
            frame.classList.remove('mac-minimized', 'genie-minimize');
            frame.classList.add('genie-restore');
            if (dockDot) dockDot.style.opacity = '1';
            
            // If restoring while still in fullscreen mode, keep dock hidden, otherwise show it
            if (dock) {
                if (frame.classList.contains('mac-fullscreen')) {
                    dock.style.setProperty('display', 'none', 'important');
                } else {
                    dock.style.removeProperty('display');
                }
            }

            if (dockIcon) {
                dockIcon.classList.add('dock-bounce');
                setTimeout(() => dockIcon.classList.remove('dock-bounce'), 600);
            }
            setTimeout(() => {
                frame.classList.remove('genie-restore');
                syncOverlay();
                isAnimating = false;
            }, 450);
        }

        if (closeBtn) closeBtn.addEventListener('click', () => {
            window.location.href = '/';
        });
        if (minBtn) minBtn.addEventListener('click', genieMinimize);
        if (fsBtn) fsBtn.addEventListener('click', () => {
            const isFs = frame.classList.toggle('mac-fullscreen');
            if (isFs) {
                resetPosition();
                if (dock) dock.style.setProperty('display', 'none', 'important');
            } else {
                userHasDragged = false;
                userHasResized = false;
                if (dock) dock.style.removeProperty('display');
                centerFrame();
            }
            requestAnimationFrame(syncOverlay);
        });

        // Dock icon click toggles minimize/restore
        if (dockIcon) dockIcon.addEventListener('click', () => {
            if (minimized) genieRestore(); else genieMinimize();
        });

        // --- All-side resize handles (attached to the outside overlay) ---
        {
            const MIN_W = 380, MIN_H = 400;
            rhOverlay.querySelectorAll('.rh').forEach(handle => {
                const dir = handle.dataset.dir;
                handle.addEventListener('mousedown', (e) => {
                    if (frame.classList.contains('mac-fullscreen') || isMobile()) return;
                    initPosition();
                    e.preventDefault();
                    e.stopPropagation();
                    userHasResized = true;

                    const startX = e.clientX, startY = e.clientY;
                    const rect = frame.getBoundingClientRect();
                    const startL = parseInt(frame.style.left) || rect.left;
                    const startT = parseInt(frame.style.top) || rect.top;
                    const startW = rect.width, startH = rect.height;

                    const SNAP = 20; // px — magnetic catch distance to screen edges
                    frame.classList.add('is-resizing');

                    function onMove(ev) {
                        const dx = ev.clientX - startX, dy = ev.clientY - startY;
                        let l = startL, t = startT, w = startW, h = startH;
                        const vw = window.innerWidth, vh = window.innerHeight;

                        if (dir.includes('e')) {
                            w = Math.max(MIN_W, startW + dx);
                            if (Math.abs((l + w) - vw) <= SNAP) w = vw - l; // snap right edge
                        }
                        if (dir.includes('w')) {
                            w = Math.max(MIN_W, startW - dx);
                            l = startL + startW - w;
                            if (Math.abs(l) <= SNAP) { w += l; l = 0; } // snap left edge
                            userHasDragged = true;
                        }
                        if (dir.includes('s')) {
                            h = Math.max(MIN_H, startH + dy);
                            if (Math.abs((t + h) - (vh - 95)) <= SNAP) h = vh - 95 - t; // snap bottom edge above dock
                            if (t + h > vh - 95) h = vh - 95 - t; // prevent overflowing into dock
                        }
                        if (dir.includes('n')) {
                            h = Math.max(MIN_H, startH - dy); 
                            t = startT + startH - h;
                            // Prevent dragging above top of screen
                            if (t < 10) {
                                t = 10;
                                h = startT + startH - 10; // Cap height to prevent jumping off screen
                            }
                            if (Math.abs(t - 10) <= SNAP) { h += (t - 10); t = 10; } // snap top edge
                            userHasDragged = true;
                        }

                        frame.style.left = Math.round(l) + 'px';
                        frame.style.top = Math.round(t) + 'px';
                        frame.style.width = Math.round(w) + 'px';
                        frame.style.height = Math.round(h) + 'px';
                        syncOverlay();
                    }
                    function onUp() {
                        frame.classList.remove('is-resizing');
                        document.removeEventListener('mousemove', onMove);
                        document.removeEventListener('mouseup', onUp);
                    }
                    document.addEventListener('mousemove', onMove);
                    document.addEventListener('mouseup', onUp);
                });
            });
        }
    })();




});


// Mobile Quick Actions FAB Logic
document.addEventListener('DOMContentLoaded', () => {
    const fab = document.getElementById('quick-actions-fab');
    const menu = document.getElementById('quick-actions-menu');
    const iconGrid = document.getElementById('fab-icon-grid');
    const iconClose = document.getElementById('fab-icon-close');
    let isMenuOpen = false;

    if (fab && menu) {
        fab.addEventListener('click', (e) => {
            e.stopPropagation();
            isMenuOpen = !isMenuOpen;
            if (isMenuOpen) {
                menu.classList.remove('hidden');
                // Small delay to allow display block to apply before transition
                setTimeout(() => {
                    menu.classList.remove('scale-90', 'opacity-0');
                    menu.classList.add('scale-100', 'opacity-100');
                    iconGrid.classList.add('scale-50', 'opacity-0', 'rotate-90');
                    iconClose.classList.remove('scale-50', 'opacity-0');
                    iconClose.classList.add('scale-100', 'opacity-100', 'rotate-90');
                }, 10);
            } else {
                menu.classList.remove('scale-100', 'opacity-100');
                menu.classList.add('scale-90', 'opacity-0');
                iconGrid.classList.remove('scale-50', 'opacity-0', 'rotate-90');
                iconClose.classList.remove('scale-100', 'opacity-100', 'rotate-90');
                iconClose.classList.add('scale-50', 'opacity-0');
                setTimeout(() => {
                    menu.classList.add('hidden');
                }, 300);
            }
        });

        // Close when clicking outside
        document.addEventListener('click', (e) => {
            if (isMenuOpen && !menu.contains(e.target) && !fab.contains(e.target)) {
                fab.click();
            }
        });
    }

    // Map QA buttons to their desktop counterparts (works for both FAB menu and bottom nav)
    document.querySelectorAll('.qa-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const targetId = btn.getAttribute('data-target');

            if (targetId === 'btn-media') {
                window.__showOnlyMedia = !window.__showOnlyMedia;
                if (window.__showOnlyMedia) {
                    btn.classList.add('text-indigo-600', 'dark:text-indigo-400', 'bg-indigo-50', 'dark:bg-indigo-900/30');
                    btn.classList.remove('text-gray-500', 'dark:text-gray-400');
                } else {
                    btn.classList.remove('text-indigo-600', 'dark:text-indigo-400', 'bg-indigo-50', 'dark:bg-indigo-900/30');
                    btn.classList.add('text-gray-500', 'dark:text-gray-400');
                }
                const applyFiltersBtn = document.getElementById('apply-filters-btn');
                if (applyFiltersBtn) applyFiltersBtn.click();
                if (fab && isMenuOpen) fab.click();
                return;
            }

            if (targetId === 'btn-filters-toggle') {
                const overlay = document.getElementById('mobile-popup-overlay');
                const filterModal = document.getElementById('mobile-filter-modal');
                const searchModal = document.getElementById('mobile-search-modal');
                const filterContent = document.getElementById('mobile-filter-content');
                const smartFilters = document.getElementById('smart-filters-container');
                
                if (overlay && filterModal && smartFilters) {
                    if (searchModal) {
                        searchModal.classList.add('hidden');
                        searchModal.style.display = 'none';
                    }
                    filterModal.classList.remove('hidden');
                    filterModal.style.display = 'block';
                    overlay.classList.remove('hidden');
                    overlay.style.setProperty('display', 'flex', 'important');
                    
                    // Move filters into mobile modal
                    filterContent.appendChild(smartFilters);
                    smartFilters.classList.remove('hidden');
                    smartFilters.style.display = 'block';
                } else if (window.kothaSidebarOpen) {
                    window.kothaSidebarOpen();
                    const targetEl = document.getElementById(targetId);
                    if (targetEl) targetEl.click();
                }
                
                if (fab && isMenuOpen) fab.click();
                return;
            }

            const targetEl = document.getElementById(targetId);
            if (targetEl) {
                targetEl.click();
            }
            // Close FAB menu if it's open
            if (fab && isMenuOpen) fab.click();
        });
    });

    // Header search button — opens inline chat search overlay
    const headerSearchBtn = document.getElementById('header-search-btn');
    const inlineSearchOverlay = document.getElementById('chat-inline-search-overlay');
    const closeInlineSearchBtn = document.getElementById('close-inline-search-btn');
    const clearInlineSearchBtn = document.getElementById('clear-inline-search-btn');
    const inlineSearchInput = document.getElementById('inline-search-input');
    const inlineSearchResultsContainer = document.getElementById('inline-search-results-container');
    const inlineResultsList = document.getElementById('inline-results-list');
    const inlineSearchCount = document.getElementById('inline-search-count');

    // Click outside to close inline search
    document.addEventListener('click', (e) => {
        if (inlineSearchOverlay && !inlineSearchOverlay.classList.contains('hidden')) {
            if (!inlineSearchOverlay.contains(e.target) && !inlineSearchResultsContainer.contains(e.target) && (!headerSearchBtn || !headerSearchBtn.contains(e.target))) {
                if (closeInlineSearchBtn) closeInlineSearchBtn.click();
            }
        }
    });

    if (headerSearchBtn && inlineSearchOverlay && inlineSearchInput) {
        headerSearchBtn.addEventListener('click', () => {
            const sidebarBtn = document.getElementById('open-sidebar-btn');
            const isMobile = sidebarBtn && sidebarBtn.offsetParent !== null;
            
            if (!isMobile) {
                // Desktop: Open sidebar search box
                const mainSearchInput = document.getElementById('search-box');
                if (mainSearchInput) {
                    if (window.kothaSidebarOpen) window.kothaSidebarOpen();
                    setTimeout(() => mainSearchInput.focus(), 150);
                }
                return;
            }

            // Mobile: Inline chat search
            inlineSearchOverlay.classList.remove('hidden');
            inlineSearchInput.focus();
        });

        closeInlineSearchBtn.addEventListener('click', () => {
            inlineSearchOverlay.classList.add('hidden');
            inlineSearchInput.value = '';
            inlineSearchResultsContainer.classList.add('hidden');
            inlineSearchCount.textContent = '';
            if (clearInlineSearchBtn) clearInlineSearchBtn.classList.add('hidden');
        });

        if (clearInlineSearchBtn) {
            clearInlineSearchBtn.addEventListener('click', () => {
                inlineSearchInput.value = '';
                inlineSearchResultsContainer.classList.add('hidden');
                inlineResultsList.innerHTML = '';
                inlineSearchCount.textContent = '';
                clearInlineSearchBtn.classList.add('hidden');
                inlineSearchInput.focus();
            });
        }

        inlineSearchInput.addEventListener('focus', () => {
            if (inlineSearchInput.value.trim().length >= 2 && inlineResultsList.innerHTML.trim() !== '') {
                inlineSearchResultsContainer.classList.remove('hidden');
            }
        });

        inlineSearchInput.addEventListener('input', (e) => {
            const val = e.target.value.trim();
            const lowerVal = val.toLowerCase();

            if (clearInlineSearchBtn) {
                if (val.length > 0) clearInlineSearchBtn.classList.remove('hidden');
                else clearInlineSearchBtn.classList.add('hidden');
            }
            
            if (lowerVal.length < 2) {
                inlineSearchResultsContainer.classList.add('hidden');
                inlineResultsList.innerHTML = '';
                inlineSearchCount.textContent = '';
                return;
            }

            // Deep search in loaded messages
            inlineSearchResultsContainer.classList.remove('hidden');
            const filteredMsgs = [];
            const msgs = typeof window.getAllMessages === 'function' ? window.getAllMessages() : [];
            if (msgs && msgs.length > 0) {
                for (let i = 0; i < msgs.length; i++) {
                    if (msgs[i].text && msgs[i].text.toLowerCase().includes(lowerVal)) {
                        filteredMsgs.push(msgs[i]);
                    }
                }
            }

            inlineSearchCount.textContent = `${filteredMsgs.length}`;
            inlineSearchResultsContainer.classList.remove('hidden');

            if (filteredMsgs.length === 0) {
                inlineResultsList.innerHTML = `<div class="text-xs text-gray-400 py-3 text-center">No messages found for "${val}"</div>`;
            } else {
                let resultsHtml = '';
                try {
                    const escapeHTML = (s) => String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
                    const getStrColor = (str) => {
                        let hash = 0; for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
                        const isDark = document.documentElement.classList.contains('dark');
                        const colors = isDark ? ['#ef9a9a', '#f48fb1', '#ce93d8', '#b39ddb', '#9fa8da', '#90caf9', '#81d4fa', '#80cbc4', '#a5d6a7', '#c5e1a5', '#e6ee9c', '#ffe082', '#ffcc80', '#ffab91', '#bcaaa4', '#eeeeee'] : ['#e53935', '#d81b60', '#8e24aa', '#5e35b1', '#3949ab', '#1e88e5', '#039be5', '#00897b', '#43a047', '#7cb342', '#c0ca33', '#fbc02d', '#fb8c00', '#f4511e', '#6d4c41', '#757575'];
                        return colors[Math.abs(hash) % colors.length];
                    };
                    const limitRes = filteredMsgs.slice(-50);
                    const regex = new RegExp(`(${lowerVal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
                    
                    limitRes.forEach(msg => {
                        const highlightedText = String(msg.text || '').replace(regex, `<mark class="bg-yellow-200 text-gray-900 font-bold px-0.5 rounded">$1</mark>`);
                        const myName = typeof window.kothaGetMyName === 'function' ? window.kothaGetMyName() : null;
                        const isMe = (myName && msg.sender === myName) || msg.sender === 'You';
                        const senderName = isMe ? 'Me' : String(msg.sender || 'System');
                        const timeStr = msg.time && msg.date ? `${msg.date} • ${msg.time}` : String(msg.time || 'Unknown');
                        
                        const alignClass = isMe ? 'ml-auto' : 'mr-auto';
                        const bubbleClass = isMe ? 'glass-chat-me' : 'glass-chat-them';
                        
                        const timeVar = isMe ? '--msg-time-me' : '--msg-time-them';

                        let nameHtml = '';
                        // Remove sender name in search results to keep it clean like WhatsApp 1-on-1 chats
                        
                        resultsHtml += `
                            <div class="flex flex-col mb-2 w-full cursor-pointer hover:opacity-85 transition-opacity" onclick="document.getElementById('inline-search-results-container').classList.add('hidden'); window.jumpToMsg && window.jumpToMsg('${msg.id}')">
                                <div class="max-w-[80%] md:max-w-[70%] relative px-3 py-1.5 md:px-3.5 md:py-2 ${bubbleClass} ${alignClass} rounded-2xl flex flex-col gap-0.5 shadow-sm">
                                    ${nameHtml}
                                    <p style="color:var(--msg-text)" class="text-[13px] leading-normal font-medium whitespace-pre-wrap break-words line-clamp-2">${highlightedText}</p>
                                    <div style="color:var(${timeVar})" class="text-[10px] flex items-center justify-end font-semibold mt-1 ml-auto pt-0.5">
                                        ${escapeHTML(timeStr)}
                                    </div>
                                </div>
                            </div>
                        `;
                    });
                } catch (err) {
                    resultsHtml = `<div class="p-4 m-4 bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400 rounded-xl text-xs font-mono break-words">Error: ${err.message}</div>`;
                }
                inlineResultsList.innerHTML = resultsHtml;
            }
        });
    }

    // --- Mobile Filter Modal Closing Logic ---
    window.closeMobileFilterModal = function() {
        const overlay = document.getElementById('mobile-popup-overlay');
        const filterModal = document.getElementById('mobile-filter-modal');
        const smartFilters = document.getElementById('smart-filters-container');
        const placeholder = document.getElementById('smart-filters-placeholder');
        
        if (overlay) {
            overlay.classList.add('hidden');
            overlay.style.setProperty('display', 'none', 'important');
        }
        if (filterModal) {
            filterModal.classList.add('hidden');
            filterModal.style.display = 'none';
        }
        
        // Return smart filters to original location
        if (smartFilters && placeholder && placeholder.parentNode) {
            smartFilters.classList.add('hidden');
            smartFilters.style.display = '';
            placeholder.parentNode.insertBefore(smartFilters, placeholder.nextSibling);
        }
    };

    const closeMobileFilterBtn = document.getElementById('close-mobile-filter');
    if (closeMobileFilterBtn) {
        closeMobileFilterBtn.addEventListener('click', window.closeMobileFilterModal);
    }

    const mobOverlay = document.getElementById('mobile-popup-overlay');
    if (mobOverlay) {
        mobOverlay.addEventListener('click', (e) => {
            if (e.target === mobOverlay) {
                if (typeof window.closeMobileFilterModal === 'function') window.closeMobileFilterModal();
                if (typeof closeSearchModal === 'function') closeSearchModal();
            }
        });
    }
});



// Fix for iOS Safari Keyboard overlap (Removed to prevent spring/bounce effect on scroll)
// if (window.visualViewport) {
//     const adjustViewport = () => {
//         document.documentElement.style.setProperty('--viewport-height', `${window.visualViewport.height}px`);
//         // If the input is focused, scroll it into view
//         const input = document.activeElement;
//         if (input && input.tagName === 'INPUT') {
//             setTimeout(() => {
//                 // input.scrollIntoView({ behavior: 'smooth', block: 'end' });
//             }, 100);
//         }
//     };
//     // window.visualViewport.addEventListener('resize', adjustViewport);
//     // adjustViewport();
// }
