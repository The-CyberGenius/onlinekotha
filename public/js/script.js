document.addEventListener('DOMContentLoaded', () => {
    const chatContainer = document.getElementById('chat-container');
    const scrollArea = document.getElementById('chat-scroll-area');
    const headerName = document.getElementById('chat-header-name');
    const headerAvatar = document.getElementById('header-avatar');
    const sidebarAvatar = document.getElementById('sidebar-avatar');
    const sidebarTitle = document.getElementById('sidebar-title');
    const statsInfo = document.getElementById('stats-info');
    const searchBox = document.getElementById('search-box');
    const searchActionBtn = document.getElementById('search-action-btn');
    const searchClearBtn = document.getElementById('search-clear-btn');
    const resultsList = document.getElementById('results-list');
    
    // Quick buttons
    const btnTop = document.getElementById('btn-top');
    const btnBottom = document.getElementById('btn-bottom');
    const btnMedia = document.getElementById('btn-media');

    // Mobile Sidebar Elements
    const sidebar = document.getElementById('sidebar');
    const openSidebarBtn = document.getElementById('open-sidebar-btn');
    const closeSidebarBtn = document.getElementById('close-sidebar-btn');

    // Modal Elements
    const mediaModal = document.getElementById('media-modal');
    const closeModal = document.getElementById('close-modal');
    const modalContent = document.getElementById('modal-content');

    const btnAnalytics = document.getElementById('btn-analytics');
    const analyticsModal = document.getElementById('analytics-modal');
    const closeAnalytics = document.getElementById('close-analytics');
    const dynamicHeaderDate = document.getElementById('dynamic-header-date');

    let allMessages = [];
    let displayedMessages = [];
    let otherPersonName = "Contact";
    let myName = null;
    let currentChat = '';

    // View state
    let renderStart = 0;
    let renderEnd = 0;
    const CHUNK_SIZE = 100;

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
        if(e.target === mediaModal) closeMod();
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
        if (window.innerWidth >= 768) return; // only on mobile
        const backdrop = document.getElementById('sidebar-backdrop');
        if (open === true) {
            sidebar.classList.remove('-translate-x-full');
            if (backdrop) backdrop.classList.remove('hidden');
        } else if (open === false) {
            sidebar.classList.add('-translate-x-full');
            if (backdrop) backdrop.classList.add('hidden');
        } else {
            sidebar.classList.toggle('-translate-x-full');
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

    const mobileFilterBtn = document.getElementById('mobile-filter-btn');
    if (mobileFilterBtn) {
        mobileFilterBtn.addEventListener('click', () => {
            // Force open the sidebar
            if (window.innerWidth < 768) {
                sidebar.classList.remove('-translate-x-full');
                const backdrop = document.getElementById('sidebar-backdrop');
                if (backdrop) backdrop.classList.remove('hidden');
            }
            const container = document.getElementById('smart-filters-container');
            container.classList.remove('hidden'); // Focus filters
        });
    }

    const renderMessage = (msg, index) => {
        const isMe = msg.sender === myName;
        
        let mediaHtml = '';
        if (msg.attachment && msg.type !== 'system') {
            const fileUrl = `/media/${encodeURIComponent(currentChat)}/${encodeURIComponent(msg.attachment)}`;
            
            if (msg.type === 'image') {
                mediaHtml = `
                    <div class="relative cursor-pointer w-64 max-w-full rounded-xl overflow-hidden img-zoom shadow-md border border-white/20 mb-1" onclick="openImageModal('${fileUrl}')">
                        <img src="${fileUrl}" loading="lazy" class="w-full h-auto object-cover max-h-[300px]" alt="Image">
                    </div>
                `;
            } else if (msg.type === 'video') {
                mediaHtml = `
                    <video controls preload="metadata" class="w-64 max-w-full rounded-xl shadow-md border border-white/20 mb-1">
                        <source src="${fileUrl}" type="video/mp4">
                    </video>
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

        const msgClass = isMe ? 'glass-chat-me ml-auto rounded-2xl rounded-tr-sm' : 'glass-chat-them mr-auto rounded-2xl rounded-tl-sm';
        const nameHtml = !isMe ? `<p class="sender-name text-[11px] font-bold mb-1 tracking-wide" style="color: ${getStringColor(msg.sender)}">${msg.sender}</p>` : '';
        
        let contentHtml = '';
        if (msg.text) {
            const onlyEmojis = /^[\u{1f300}-\u{1f5ff}\u{1f900}-\u{1f9ff}\u{1f600}-\u{1f64f}\u{1f680}-\u{1f6ff}\u{2600}-\u{26ff}\u{2700}-\u{27bf}\u{1f1e6}-\u{1f1ff}\u{1f191}-\u{1f251}\u{1f004}\u{1f0cf}\u{1f170}-\u{1f171}\u{1f17e}-\u{1f17f}\u{1f18e}\u{3030}\u{2b50}\u{2b55}\u{2934}-\u{2935}\u{2b05}-\u{2b07}\u{2b1b}-\u{2b1c}\u{3297}\u{3299}\u{303d}\u{00a9}\u{00ae}\u{2122}\u{23f3}\u{24c2}\u{23e9}-\u{23ef}\u{25b6}\u{23f8}-\u{23fa}\s]+$/gu;
            const isBigEmoji = msg.text.trim().length > 0 && msg.text.trim().length <= 6 && onlyEmojis.test(msg.text);
            contentHtml = `<p style="color:var(--msg-text)" class="${isBigEmoji ? 'text-4xl' : 'text-[14px]'} leading-normal font-medium whitespace-pre-wrap break-words">${msg.text}</p>`;
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

        return `
            <div class="flex flex-col mb-1.5 w-full" id="msg-${msg.id}">
                <div class="max-w-[85%] md:max-w-md lg:max-w-lg relative px-3 py-1.5 md:px-3.5 md:py-2 ${msgClass} flex flex-col gap-0.5">
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
    // Indian WhatsApp uses DD/MM/YY format
    function formatChatDate(raw) {
        if (!raw) return '';
        const parts = raw.split('/');
        if (parts.length !== 3) return raw;
        const day   = parseInt(parts[0]);
        const month = parseInt(parts[1]);
        let year    = parts[2].length === 2 ? 2000 + parseInt(parts[2]) : parseInt(parts[2]);
        const d = new Date(year, month - 1, day);
        if (isNaN(d.getTime())) return raw;
        return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
    }

    let lastRenderedDate = '';

    const generateChatsHtml = (snippet) => {
        let html = '';
        snippet.forEach((msg, idx) => {
            if (msg.type !== 'system' && msg.date !== lastRenderedDate) {
                html += `
                <div class="flex justify-center mb-6 w-full date-separator">
                    <span class="bg-gray-800/20 backdrop-blur-md text-gray-800 text-xs px-5 py-1.5 font-bold tracking-widest rounded-full shadow-sm border border-gray-300/30 uppercase">${formatChatDate(msg.date)}</span>
                </div>`;
                lastRenderedDate = msg.date;
            }
            html += renderMessage(msg, idx);
        });
        return html;
    };

    const renderChats = (startIndex, endIndex, mode = 'reset') => {
        const snippet = displayedMessages.slice(startIndex, endIndex);
        
        if (snippet.length === 0) return;

        if (mode === 'reset') {
            lastRenderedDate = '';
            chatContainer.innerHTML = generateChatsHtml(snippet);
            renderStart = startIndex;
            renderEnd = endIndex;
        } else if (mode === 'older') {
            // Need to calculate date separately for prepends since they are inserted backwards relative to existing DOM
            const previousFirst = displayedMessages[renderStart]?.date;
            lastRenderedDate = '';
            const html = generateChatsHtml(snippet);
            const oldScroll = scrollArea.scrollHeight;
            chatContainer.insertAdjacentHTML('afterbegin', html);
            scrollArea.scrollTop += (scrollArea.scrollHeight - oldScroll);
            renderStart = startIndex;
        } else if (mode === 'newer') {
            lastRenderedDate = displayedMessages[renderEnd - 1]?.date || '';
            const html = generateChatsHtml(snippet);
            chatContainer.insertAdjacentHTML('beforeend', html);
            renderEnd = endIndex;
        }
        
        // Remove loaders visually as we approach the edges
        const topLoader = document.getElementById('top-loader');
        if (topLoader && renderStart === 0) topLoader.remove();
    };

    window.loadOlder = () => {
        if (renderStart <= 0) return;
        const newStart = Math.max(0, renderStart - CHUNK_SIZE);
        renderChats(newStart, renderStart, 'older');

        // Optional Memory Prune: Keep max 600 nodes
        if (renderEnd - renderStart > 600) {
            renderEnd -= CHUNK_SIZE;
            for(let i=0; i<CHUNK_SIZE && chatContainer.lastElementChild; i++) {
                chatContainer.removeChild(chatContainer.lastElementChild);
            }
        }
    };

    window.loadNewer = () => {
        if (renderEnd >= displayedMessages.length) return;
        const newEnd = Math.min(displayedMessages.length, renderEnd + CHUNK_SIZE);
        const oldScroll = scrollArea.scrollTop;
        renderChats(renderEnd, newEnd, 'newer');

        // Prune from top
        if (renderEnd - renderStart > 600) {
            renderStart += CHUNK_SIZE;
            for(let i=0; i<CHUNK_SIZE && chatContainer.firstElementChild; i++) {
                chatContainer.removeChild(chatContainer.firstElementChild);
            }
            scrollArea.scrollTop = oldScroll; // Maintain visual position
        }
    };

    let isScrolling = false;
    let scrollTimeout;
    const floatingDate = document.getElementById('floating-date');

    scrollArea.addEventListener('scroll', () => {
        // Floating Date indicator logic
        if (floatingDate) {
            const topEl = Array.from(chatContainer.children).find(el => {
                return el.id && el.id.startsWith('msg-') && (el.offsetTop - scrollArea.scrollTop + 20) > 0;
            });

            if (topEl) {
                const msgId = parseInt(topEl.id.replace('msg-', ''));
                const msg = displayedMessages.find(m => m.id === msgId);
                if (msg && msg.date) {
                    const parts = msg.date.split('/');
                    if (parts.length === 3) {
                        // Indian WhatsApp: DD/MM/YY
                        const day = parseInt(parts[0]);
                        const mon = parseInt(parts[1]);
                        const y   = parts[2].length === 2 ? 2000 + parseInt(parts[2]) : parseInt(parts[2]);
                        const dateObj = new Date(y, mon - 1, day);
                        const monthName = dateObj.toLocaleString('en-IN', { month: 'long' });
                        const formattedDate = `${monthName} ${y}`;

                        floatingDate.innerText = formattedDate;
                        floatingDate.classList.remove('opacity-0', 'translate-y-[-10px]');
                        floatingDate.classList.add('opacity-100', 'translate-y-0');

                        if (dynamicHeaderDate) {
                            dynamicHeaderDate.innerText = `${day} ${monthName} ${y}`;
                            dynamicHeaderDate.classList.remove('hidden');
                        }
                    }
                }
            }
            clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(() => {
                floatingDate.classList.add('opacity-0', 'translate-y-[-10px]');
                floatingDate.classList.remove('opacity-100', 'translate-y-0');
            }, 800);
        }

        if (isScrolling) return;
        
        if (scrollArea.scrollTop <= 400 && renderStart > 0) {
            isScrolling = true;
            window.loadOlder();
            setTimeout(() => { isScrolling = false; }, 100);
        }
        
        if (Math.abs((scrollArea.scrollHeight - scrollArea.scrollTop) - scrollArea.clientHeight) <= 400 && renderEnd < displayedMessages.length) {
            isScrolling = true;
            window.loadNewer();
            setTimeout(() => { isScrolling = false; }, 100);
        }
    });

    const loadData = async (chatName) => {
        try {
            showSkeleton();
            statsInfo.innerText = 'Loading...';
            const resp = await fetch(`/api/messages?chat=${encodeURIComponent(chatName)}`);
            const data = await resp.json();

            if (data.error) {
                statsInfo.innerText = "Error: " + data.error;
                return;
            }

            allMessages = data;
            displayedMessages = allMessages; // Default view is everything
            
            // Clear previous dynamically added filters if changing chats
            const filterContainer = document.getElementById('filter-buttons-container');
            Array.from(filterContainer.children).forEach(child => {
                if (child.innerText.startsWith('👤')) filterContainer.removeChild(child);
            });

            if (allMessages.length > 0) {
                const senderCounts = {};
                allMessages.forEach(msg => {
                    if (msg.sender) senderCounts[msg.sender] = (senderCounts[msg.sender] || 0) + 1;
                });
                
                const senders = Object.entries(senderCounts).sort((a,b) => b[1] - a[1]);
                myName = senders[0]?.[0]; 
                otherPersonName = senders[1]?.[0] || myName || "User";

                headerName.innerText = otherPersonName;
                sidebarTitle.innerText = "All Chats";
                
                if (otherPersonName) {
                    headerAvatar.innerText = otherPersonName.charAt(0).toUpperCase();
                    sidebarAvatar.innerText = 'C';
                }

                statsInfo.innerHTML = `Loaded <span class="font-bold text-blue-700">${allMessages.length.toLocaleString()}</span> messages dynamically.`;

                // Add Sender Filters to the Quick Actions UI automatically (toggle on/off)
                let activeSenderFilter = null;
                const senderBtns = [];
                senders.slice(0, 3).forEach(([sName, count]) => {
                    if (!sName) return;
                    const btn = document.createElement('button');
                    btn.className = 'text-xs bg-purple-50 border border-purple-100 shadow-sm rounded-lg px-3 py-1.5 font-semibold text-purple-700 hover:bg-purple-100 hover:shadow transition whitespace-nowrap cursor-pointer';
                    btn.innerText = `👤 ${sName}`;
                    btn.onclick = () => {
                        if (activeSenderFilter === sName) {
                            // Toggle OFF — show all messages
                            activeSenderFilter = null;
                            displayedMessages = [...allMessages];
                            btn.className = 'text-xs bg-purple-50 border border-purple-100 shadow-sm rounded-lg px-3 py-1.5 font-semibold text-purple-700 hover:bg-purple-100 hover:shadow transition whitespace-nowrap cursor-pointer';
                            statsInfo.innerHTML = `Showing all <span class="font-bold text-blue-700">${allMessages.length.toLocaleString()}</span> messages.`;
                        } else {
                            // Toggle ON — filter by this sender
                            activeSenderFilter = sName;
                            displayedMessages = allMessages.filter(msg => msg.sender === sName);
                            // Reset all buttons, highlight active
                            senderBtns.forEach(b => {
                                b.className = 'text-xs bg-purple-50 border border-purple-100 shadow-sm rounded-lg px-3 py-1.5 font-semibold text-purple-700 hover:bg-purple-100 hover:shadow transition whitespace-nowrap cursor-pointer';
                            });
                            btn.className = 'text-xs bg-purple-600 border border-purple-600 shadow-sm rounded-lg px-3 py-1.5 font-semibold text-white hover:bg-purple-700 hover:shadow transition whitespace-nowrap cursor-pointer';
                            statsInfo.innerHTML = `Showing <span class="font-bold text-indigo-700">${displayedMessages.length.toLocaleString()}</span> msgs by ${sName}.`;
                        }
                        renderChats(-1, -1);
                        renderChats(0, Math.min(CHUNK_SIZE, displayedMessages.length), 'reset');
                        setTimeout(() => scrollArea.scrollTop = 0, 10);
                        toggleSidebar(false);
                    };
                    senderBtns.push(btn);
                    filterContainer.appendChild(btn);
                });

                // Populate Smart Filters (Years & Days)
                const years = new Set();
                allMessages.forEach(msg => {
                    if(!msg.date) return;
                    const parts = msg.date.split('/');
                    if(parts.length === 3) years.add(parts[2]);
                });
                const yearSelect = document.getElementById('filter-year');
                yearSelect.innerHTML = '<option value="">Year</option>';
                [...years].sort().forEach(y => {
                    const fullYear = y.length === 2 ? `20${y}` : y;
                    yearSelect.innerHTML += `<option value="${y}">${fullYear}</option>`;
                });
                const daySelect = document.getElementById('filter-day');
                daySelect.innerHTML = '<option value="">Day</option>';
                for(let i=1; i<=31; i++) {
                    daySelect.innerHTML += `<option value="${i}">${i}</option>`;
                }
                
                // Smart Filters Logic
                const filterMonth = document.getElementById('filter-month');
                const toggleMedia = document.getElementById('toggle-media');
                const toggleStickers = document.getElementById('toggle-stickers');
                const toggleLinks = document.getElementById('toggle-links');
                const resetFiltersBtn = document.getElementById('reset-filters');

                const applyFilters = () => {
                    const d = daySelect.value;
                    const m = filterMonth.value;
                    const y = yearSelect.value;
                    const showMedia = toggleMedia.checked;
                    const showStickers = toggleStickers.checked;
                    const showLinks = toggleLinks ? toggleLinks.checked : false;

                    if(d || m || y || !showMedia || !showStickers || showLinks) {
                        resetFiltersBtn.classList.remove('hidden');
                    } else {
                        resetFiltersBtn.classList.add('hidden');
                    }

                    displayedMessages = allMessages.filter(msg => {
                        // Date check
                        if(d || m || y) {
                            const parts = msg.date.split('/'); // Assuming MM/DD/YY or DD/MM/YY
                            if (parts.length === 3) {
                                const msgM = parseInt(parts[0]);
                                const msgD = parseInt(parts[1]);
                                const msgY = parts[2];

                                if (m && msgM !== parseInt(m)) return false;
                                if (d && msgD !== parseInt(d)) return false;
                                if (y && msgY !== y) return false;
                            }
                        }

                        // Content check
                        if (!showMedia && msg.attachment) return false;

                        if (msg.text) {
                            const text = msg.text.toLowerCase();
                            
                            if (showLinks) {
                                if (!text.includes('http') && !text.includes('www.')) return false;
                            }

                            if(!showMedia) {
                                const mediaExts = ['.jpg', '.jpeg', '.png', '.mp4', '.mov', 'image omitted', 'video omitted', 'audio omitted', 'document omitted'];
                                if(mediaExts.some(ext => text.includes(ext))) return false;
                            }
                            
                            if(!showStickers) {
                                const stickerExts = ['.webp', 'sticker omitted'];
                                if(stickerExts.some(ext => text.includes(ext))) return false;
                            }
                        } else {
                            if (showLinks) return false; // exclude messages without text if strictly looking for links
                        }

                        return true;
                    });

                    // Maintain visual anchor position when filtering toggles back and forth
                    const visibleBubble = Array.from(chatContainer.children).find(el => {
                        return el.id && el.id.startsWith('msg-') && el.getBoundingClientRect().top >= 0;
                    });
                    const anchorId = visibleBubble ? parseInt(visibleBubble.id.replace('msg-', '')) : null;

                    renderChats(-1, -1); // Clear UI

                    if (displayedMessages.length > 0) {
                        let anchorIdx = -1;
                        if (anchorId !== null) {
                            anchorIdx = displayedMessages.findIndex(m => m.id === anchorId);
                            if (anchorIdx === -1) anchorIdx = displayedMessages.findIndex(m => m.id > anchorId);
                        }
                        
                        // If we found the message we were previously looking at after filtering, render around it!
                        if (anchorIdx !== -1) {
                            const start = Math.max(0, anchorIdx - 20);
                            const end = Math.min(displayedMessages.length, start + CHUNK_SIZE);
                            renderChats(start, end, 'reset');
                            
                            setTimeout(() => {
                                const targetId = displayedMessages[anchorIdx]?.id;
                                const el = document.getElementById(`msg-${targetId}`);
                                if (el) {
                                    el.scrollIntoView({ block: 'start' });
                                    // small nudge up to account for absolute header
                                    scrollArea.scrollTop -= 60; 
                                }
                            }, 10);
                        } else {
                            // If anchor not found or filter completely altered view, default to newest chats
                            const end = displayedMessages.length;
                            renderChats(Math.max(0, end - CHUNK_SIZE), end, 'reset');
                            setTimeout(() => scrollArea.scrollTop = scrollArea.scrollHeight, 10);
                        }
                    }

                    statsInfo.innerHTML = `Showing <span class="font-bold text-indigo-700">${displayedMessages.length.toLocaleString()}</span> filtered msgs.`;
                };

                [daySelect, filterMonth, yearSelect, toggleMedia, toggleStickers, toggleLinks].forEach(el => {
                    if(el) el.addEventListener('change', applyFilters);
                });

                resetFiltersBtn.addEventListener('click', () => {
                    daySelect.value = ''; filterMonth.value = ''; yearSelect.value = '';
                    toggleMedia.checked = true; toggleStickers.checked = true;
                    if(toggleLinks) toggleLinks.checked = false;
                    applyFilters();
                });
                
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
            const displayName = chat.replace('WhatsApp Chat - ', '');
            const initial = displayName.charAt(0).toUpperCase();
            const colorClass = chatColors[idx % chatColors.length];
            const isActive = chat === activeChat;

            const item = document.createElement('div');
            item.className = `flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all duration-150 group ${isActive ? 'bg-indigo-50 border border-indigo-200 shadow-sm' : 'hover:bg-gray-100 border border-transparent'}`;
            item.dataset.chat = chat;
            item.innerHTML = `
                <div class="w-9 h-9 rounded-full bg-gradient-to-br ${colorClass} flex items-center justify-center text-white font-bold text-sm shadow-sm shrink-0">${initial}</div>
                <div class="min-w-0 flex-1">
                    <p class="text-[13px] font-semibold text-gray-800 truncate leading-tight ${isActive ? 'text-indigo-700' : ''}">${displayName}</p>
                    <p class="text-[10px] text-gray-400 font-medium mt-0.5">${isActive ? '● Active' : 'Tap to open'}</p>
                </div>
                <button class="chat-del-btn shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 transition opacity-0 group-hover:opacity-100" title="Delete chat" data-chat="${chat}">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
                ${isActive ? '<div class="w-2 h-2 rounded-full bg-indigo-500 shrink-0"></div>' : ''}
            `;
            // Delete button
            item.querySelector('.chat-del-btn').addEventListener('click', async (e) => {
                e.stopPropagation();
                if (!confirm(`Delete "${displayName}"?\n\nYou won't see this chat anymore.`)) return;
                try {
                    const r = await fetch(`/api/chats/${encodeURIComponent(chat)}`, { method: 'DELETE' });
                    if (!r.ok) throw new Error('Failed');
                    loadedChats = loadedChats.filter(c => c !== chat);
                    if (chat === currentChat && loadedChats.length > 0) {
                        currentChat = loadedChats[0];
                        window.currentChat = loadedChats[0];
                        loadData(loadedChats[0]);
                    } else if (loadedChats.length === 0) {
                        currentChat = '';
                        window.currentChat = '';
                        showEmptyState();
                    }
                    renderChatList(loadedChats, currentChat);
                } catch (err) {
                    alert('Delete failed: ' + err.message);
                }
            });
            // Open chat on click
            item.addEventListener('click', (e) => {
                if (e.target.closest('.chat-del-btn')) return;
                if (chat === currentChat) return;
                if (currentChat === '__global__') {
                    deactivateGlobalUI();
                }
                currentChat = chat;
                window.currentChat = chat;
                const selector = document.getElementById('chat-selector');
                if (selector) selector.value = chat;
                renderChatList(chats, chat);
                loadData(chat);
                toggleSidebar(false);
            });
            chatListUI.appendChild(item);
        });
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
            const chats = await resp.json();
            loadedChats = chats;
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
                if (currentChat === '__global__') {
                    removeEmptyState();
                    renderChatList(chats, '');
                } else {
                    selector.value = chats[0];
                    currentChat = chats[0];
                    window.currentChat = chats[0];
                    loadData(chats[0]);
                    removeEmptyState();
                    // Render visual chat list
                    renderChatList(chats, chats[0]);
                }
            } else {
                if (currentChat !== '__global__') {
                    showEmptyState();
                }
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
        const container = document.getElementById('chat-container');
        if (!container) return;
        container.innerHTML = `
            <div class="h-full flex flex-col items-center justify-center px-8 text-center" id="empty-state">
                <div class="empty-state-float mb-6">
                    <div class="w-24 h-24 rounded-3xl bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center shadow-lg shadow-indigo-200/50 relative">
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                        <div class="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-gradient-to-br from-amber-300 to-orange-400 flex items-center justify-center shadow-md empty-state-pulse">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/></svg>
                        </div>
                    </div>
                </div>
                <h2 class="text-2xl font-bold text-gray-900 mb-2">Bring a chat to life</h2>
                <p class="text-sm text-gray-500 max-w-sm leading-relaxed mb-2">Upload your WhatsApp export and see it beautifully — search through years of messages and talk to your memories with AI.</p>
                <div class="flex items-center gap-4 text-[11px] text-gray-400 font-medium mb-6">
                    <span class="flex items-center gap-1"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg> Private</span>
                    <span class="flex items-center gap-1"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/></svg> AI-powered</span>
                    <span class="flex items-center gap-1"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg> Free</span>
                </div>
                <button id="empty-upload-btn" class="bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white font-bold text-sm rounded-2xl px-7 py-3.5 transition shadow-lg shadow-indigo-300/30 hover:shadow-indigo-400/40 flex items-center gap-2 mx-auto">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
                    Import WhatsApp Chat
                </button>
            </div>
        `;
        const btn = document.getElementById('empty-upload-btn');
        if (btn) btn.addEventListener('click', () => {
            const openUploadBtn = document.getElementById('open-upload-btn');
            if (openUploadBtn) openUploadBtn.click();
        });
    }
    function removeEmptyState() {
        const e = document.getElementById('empty-state');
        if (e) e.remove();
    }

    const chatSelector = document.getElementById('chat-selector');
    if (chatSelector) {
        chatSelector.addEventListener('change', (e) => {
            if (e.target.value) {
                if (currentChat === '__global__') {
                    deactivateGlobalUI();
                }
                currentChat = e.target.value;
                window.currentChat = currentChat;
                loadData(currentChat);
            }
        });
    }

    // Expose for upload.js to refresh after import
    window.refreshChats = async (selectName) => {
        await loadChatsList();
        if (selectName) {
            if (currentChat === '__global__') {
                deactivateGlobalUI();
            }
            const selector = document.getElementById('chat-selector');
            if (selector) {
                selector.value = selectName;
                currentChat = selectName;
                window.currentChat = selectName;
                loadData(selectName);
                // Re-render chat list with new active
                renderChatList(loadedChats, selectName);
            }
        }
    };

    // Filters drawer toggle
    const filtersToggle = document.getElementById('btn-filters-toggle');
    const filtersContainer = document.getElementById('smart-filters-container');
    if (filtersToggle && filtersContainer) {
        filtersToggle.addEventListener('click', () => {
            filtersContainer.classList.toggle('hidden');
            filtersToggle.classList.toggle('text-indigo-600');
            filtersToggle.classList.toggle('bg-indigo-50');
        });
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
                desc: 'Export your WhatsApp chat as a .zip file and drop it here. We support Android, iPhone, individual and group chats.',
            },
            {
                icon: '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="1.5"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>',
                title: 'See your chats beautifully',
                desc: 'Messages appear in proper WhatsApp-style bubbles with photos, videos, and voice notes inline. Search through years instantly.',
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

    window.clearReplyPreview = function() {
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
        } catch {}
    }

    // Event delegation for message actions (Reply and React)
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
    });

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
            } catch (err) {}
        });

        globalEventSource.addEventListener('history', (e) => {
            chatContainer.innerHTML = '';
            scrollArea.scrollTop = scrollArea.scrollHeight;
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
            } catch (err) {}
        });

        globalEventSource.addEventListener('system', (e) => {
            try {
                const sys = JSON.parse(e.data);
                renderSystemMessage(sys.text);
            } catch (err) {}
        });

        globalEventSource.addEventListener('reaction', (e) => {
            try {
                const data = JSON.parse(e.data);
                updateMessageReactionsInDOM(data.messageId, data.reactions);
            } catch (err) {}
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
                <span class="truncate font-semibold text-gray-700 dark:text-gray-300 flex-1">${displayName}</span>
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

        // Actions: reply & react
        const actionsHtml = `
            <div class="msg-actions absolute top-1/2 -translate-y-1/2 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity duration-150 flex items-center gap-1 z-30 ${isMe ? 'right-full mr-2 flex-row-reverse' : 'left-full ml-2'}">
                <button class="msg-action-btn reply-btn w-6 h-6 rounded-full bg-white dark:bg-gray-800 shadow-sm border border-gray-100 dark:border-gray-700 flex items-center justify-center text-gray-500 hover:text-indigo-600 transition" title="Reply" data-msg-id="${msg.id}" data-sender="${escapeHTML(msg.sender)}" data-text="${escapeHTML(msg.text)}">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 14L4 9l5-5"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg>
                </button>
                <button class="msg-action-btn react-trigger-btn w-6 h-6 rounded-full bg-white dark:bg-gray-800 shadow-sm border border-gray-100 dark:border-gray-700 flex items-center justify-center text-gray-500 hover:text-amber-500 transition" title="React" data-msg-id="${msg.id}">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18z"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
                </button>
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
                <div class="max-w-[85%] md:max-w-md lg:max-w-lg relative px-3 py-1.5 md:px-3.5 md:py-2 ${msgClass} flex flex-col gap-0.5">
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
            bottomAiInput.placeholder = 'Ask AI about this chat…';
        }
        const statusEl = document.querySelector('#chat-header-name + div p');
        if (statusEl) statusEl.innerText = 'online';
    }

    if (globalChatItem) {
        globalChatItem.addEventListener('click', () => {
            if (currentChat === '__global__') return;
            
            disconnectGlobalChat();

            currentChat = '__global__';
            window.currentChat = '__global__';

            globalChatItem.classList.add('bg-indigo-50', 'border-indigo-200', 'shadow-sm');
            globalChatItem.classList.remove('hover:bg-gray-100', 'border-transparent');
            if (globalOnlineUsersList) globalOnlineUsersList.classList.remove('hidden');

            renderChatList(loadedChats, '');

            if (askAiBtn) askAiBtn.classList.add('hidden');
            if (window.__USER__ && window.__USER__.is_admin === 1) {
                if (clearGlobalChatBtn) clearGlobalChatBtn.classList.remove('hidden');
            }
            if (headerName) headerName.innerText = 'Global Chat Room';
            if (sidebarTitle) sidebarTitle.innerText = 'Global Chat';
            const statusEl = document.querySelector('#chat-header-name + div p');
            if (statusEl) statusEl.innerText = 'Connecting...';

            if (bottomAiInput) {
                bottomAiInput.placeholder = 'Send a message to everyone...';
            }

            const aiChatContainer = document.getElementById('ai-chat-container');
            if (aiChatContainer) aiChatContainer.innerHTML = '';

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
    btnTop.addEventListener('click', () => {
        displayedMessages = allMessages; // Reset filter if active
        renderChats(0, Math.min(CHUNK_SIZE, displayedMessages.length));
        setTimeout(() => scrollArea.scrollTop = 0, 10);
        toggleSidebar(false);
    });

    btnBottom.addEventListener('click', () => {
        displayedMessages = allMessages;
        const end = displayedMessages.length;
        renderChats(Math.max(0, end - CHUNK_SIZE), end);
        setTimeout(() => scrollArea.scrollTop = scrollArea.scrollHeight, 10);
        toggleSidebar(false);
    });

    btnMedia.addEventListener('click', () => {
        displayedMessages = allMessages.filter(msg => msg.attachment && msg.type !== 'system');
        renderChats(0, Math.min(CHUNK_SIZE, displayedMessages.length));
        statsInfo.innerHTML = `Showing <span class="font-bold text-indigo-700">${displayedMessages.length}</span> media attachments.`;
        setTimeout(() => scrollArea.scrollTop = 0, 10);
        toggleSidebar(false);
    });

    const closeAnModal = () => {
        analyticsModal.classList.remove('opacity-100');
        analyticsModal.classList.add('opacity-0');
        setTimeout(() => analyticsModal.classList.add('hidden'), 300);
    };

    closeAnalytics.addEventListener('click', closeAnModal);
    analyticsModal.addEventListener('click', (e) => {
        if(e.target === analyticsModal) closeAnModal();
    });

    btnAnalytics.addEventListener('click', () => {
        const totalMsgs = allMessages.filter(m => m.type !== 'system').length;
        const totalMedia = allMessages.filter(m => m.attachment && m.type !== 'system').length;
        const totalLinks = allMessages.filter(m => m.text && m.text.includes('http')).length;
        const firstDate = allMessages.find(m => m.date)?.date || '-';

        document.getElementById('stat-total-msgs').innerText = totalMsgs.toLocaleString();
        document.getElementById('stat-total-media').innerText = totalMedia.toLocaleString();
        document.getElementById('stat-total-links').innerText = totalLinks.toLocaleString();
        document.getElementById('stat-first-date').innerText = firstDate;

        const senderCounts = {};
        allMessages.forEach(msg => {
            if (msg.sender && msg.type !== 'system') senderCounts[msg.sender] = (senderCounts[msg.sender] || 0) + 1;
        });
        
        let contributorsHtml = '';
        Object.entries(senderCounts).sort((a,b) => b[1] - a[1]).slice(0, 4).forEach(([sName, count]) => {
            const pct = Math.round((count / totalMsgs) * 100);
            contributorsHtml += `
                <div class="flex items-center justify-between text-sm mb-1.5 p-2 bg-white rounded-xl shadow-sm border border-gray-100 hover:border-indigo-100 hover:shadow transition">
                    <span class="font-bold flex items-center gap-2 text-gray-700" style="color: ${getStringColor(sName)}"><span class="w-2.5 h-2.5 rounded-full" style="background: ${getStringColor(sName)}"></span>${sName}</span>
                    <span class="font-extrabold text-indigo-500 bg-indigo-50 px-2.5 py-1 rounded-md text-[11px]">${count.toLocaleString()} <span class="font-semibold opacity-60">(${pct}%)</span></span>
                </div>
            `;
        });
        document.getElementById('stat-contributors').innerHTML = contributorsHtml;

        toggleSidebar(false);
        analyticsModal.classList.remove('hidden');
        void analyticsModal.offsetWidth;
        analyticsModal.classList.remove('opacity-0');
        analyticsModal.classList.add('opacity-100');
    });

    // Explicit Button-Triggered Search Logic
    searchBox.addEventListener('input', (e) => {
        const val = e.target.value.trim();
        if (val.length > 0) {
            searchClearBtn.classList.remove('hidden');
        } else {
            searchClearBtn.classList.add('hidden');
        }

        if (val.length >= 3) {
            searchActionBtn.disabled = false;
        } else {
            searchActionBtn.disabled = true;
        }
    });

    searchBox.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !searchActionBtn.disabled) {
            searchActionBtn.click();
        }
    });

    searchClearBtn.addEventListener('click', () => {
        searchBox.value = '';
        searchClearBtn.classList.add('hidden');
        searchActionBtn.disabled = true;
        resultsList.innerHTML = '';
        statsInfo.innerHTML = `Loaded <span class="font-bold text-blue-700">${allMessages.length.toLocaleString()}</span> messages dynamically.`;
        if (displayedMessages.length !== allMessages.length) {
            displayedMessages = allMessages;
            const end = displayedMessages.length;
            renderChats(Math.max(0, end - CHUNK_SIZE), end);
            setTimeout(() => scrollArea.scrollTop = scrollArea.scrollHeight, 10);
        }
    });

    searchActionBtn.addEventListener('click', () => {
        const query = searchBox.value.toLowerCase().trim();
        if (query.length < 3) return;

        searchActionBtn.innerHTML = `<svg class="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>`;
        searchActionBtn.disabled = true;

        // Yield to browser context to render spinner, then execute heavy search loop
        setTimeout(() => {
            const filtered = [];
            for (let i = 0; i < allMessages.length; i++) {
                if (allMessages[i].text && allMessages[i].text.toLowerCase().includes(query)) {
                    filtered.push(allMessages[i]);
                }
            }
            statsInfo.innerHTML = `Found <span class="font-bold text-indigo-700">${filtered.length.toLocaleString()}</span> matches for "${query}".`;

            let resultsHtml = '';
            const limitRes = filtered.slice(-100);
            const regex = new RegExp(`(${query})`, 'gi');
            limitRes.forEach(msg => {
                const highlightedText = msg.text.replace(regex, `<span class="bg-indigo-200 text-indigo-900 font-bold px-1 rounded">$1</span>`);
                
                resultsHtml += `
                    <div class="p-4 bg-white/60 hover:bg-white/90 backdrop-blur shadow-sm cursor-pointer border border-white/50 transition-all rounded-2xl mb-2 hover:shadow-md transform hover:-translate-y-0.5" onclick="jumpToMsg(${msg.id})">
                        <div class="flex justify-between items-center mb-1">
                            <span class="text-xs font-bold uppercase tracking-wide" style="color:${getStringColor(msg.sender)}">${msg.sender}</span> 
                            <span class="text-[10px] text-gray-500 font-semibold">${msg.date} ${msg.time}</span>
                        </div>
                        <p class="text-[13px] text-gray-800 font-medium line-clamp-2 leading-relaxed">${highlightedText}</p>
                    </div>
                `;
            });
            resultsList.innerHTML = resultsHtml;
            
            searchActionBtn.innerHTML = 'Find';
            searchActionBtn.disabled = false;
        }, 15);
    });

    // ── Dark Mode Toggle ──
    const darkBtn = document.getElementById('dark-mode-btn');
    const dmIcon = document.getElementById('dm-icon');
    function updateDmIcon() {
        if (!dmIcon) return;
        const isDark = document.documentElement.classList.contains('dark');
        dmIcon.innerHTML = isDark
            ? '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>'
            : '<path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>';
        // Update theme-color meta
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.content = isDark ? '#111b21' : '#6366f1';
    }
    if (darkBtn) {
        updateDmIcon(); // Set initial icon
        darkBtn.addEventListener('click', () => {
            document.documentElement.classList.toggle('dark');
            const isDark = document.documentElement.classList.contains('dark');
            localStorage.setItem('kotha_dark', isDark ? '1' : '0');
            updateDmIcon();
        });
    }

    window.jumpToMsg = (id) => {
        displayedMessages = allMessages; // Make sure we are in main view
        const idx = displayedMessages.findIndex(m => m.id === id);
        if (idx !== -1) {
            const start = Math.max(0, idx - 50);
            const end = Math.min(displayedMessages.length, idx + 100);
            renderChats(start, end);

            toggleSidebar(false);

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
                        const query = searchBox.value.trim();
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
            }, 100);
        }
    };
});
