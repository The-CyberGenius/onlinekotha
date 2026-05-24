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

    const getStringColor = (str) => {
        let hash = 0;
        for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
        let color = '#';
        for (let i = 0; i < 3; i++) {
            let value = (hash >> (i * 8)) & 0xFF;
            color += ('00' + (value % 200 + 30).toString(16)).substr(-2);
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
                    <div class="flex items-center ${isMe ? 'bg-white/20' : 'bg-gray-100/80'} p-3 rounded-xl gap-3 cursor-pointer hover:opacity-80 transition mb-1 border ${isMe ? 'border-white/30' : 'border-gray-200'}">
                        <div class="w-10 h-10 ${isMe ? 'bg-white/30' : 'bg-indigo-100'} text-${isMe ? 'white' : 'indigo-600'} rounded-lg flex items-center justify-center font-bold text-xs">DOC</div>
                        <div class="overflow-hidden">
                            <p class="text-sm font-semibold truncate ${isMe ? 'text-white' : 'text-gray-800'}">${msg.attachment}</p>
                            <a href="${fileUrl}" target="_blank" download class="text-xs font-bold uppercase hover:underline ${isMe ? 'text-green-100' : 'text-indigo-500'}">Download</a>
                        </div>
                    </div>
                `;
            }
        }

        const msgClass = isMe ? 'glass-chat-me ml-auto rounded-2xl rounded-tr-sm' : 'glass-chat-them mr-auto rounded-2xl rounded-tl-sm';
        const nameHtml = !isMe ? `<p class="text-[11px] font-bold mb-1 tracking-wide" style="color: ${getStringColor(msg.sender)}">${msg.sender}</p>` : '';
        
        let contentHtml = '';
        if (msg.text) {
            const onlyEmojis = /^[\u{1f300}-\u{1f5ff}\u{1f900}-\u{1f9ff}\u{1f600}-\u{1f64f}\u{1f680}-\u{1f6ff}\u{2600}-\u{26ff}\u{2700}-\u{27bf}\u{1f1e6}-\u{1f1ff}\u{1f191}-\u{1f251}\u{1f004}\u{1f0cf}\u{1f170}-\u{1f171}\u{1f17e}-\u{1f17f}\u{1f18e}\u{3030}\u{2b50}\u{2b55}\u{2934}-\u{2935}\u{2b05}-\u{2b07}\u{2b1b}-\u{2b1c}\u{3297}\u{3299}\u{303d}\u{00a9}\u{00ae}\u{2122}\u{23f3}\u{24c2}\u{23e9}-\u{23ef}\u{25b6}\u{23f8}-\u{23fa}\s]+$/gu;
            const isBigEmoji = msg.text.trim().length > 0 && msg.text.trim().length <= 6 && onlyEmojis.test(msg.text);
            contentHtml = `<p class="${isBigEmoji ? 'text-4xl' : 'text-[15px]'} leading-snug font-medium whitespace-pre-wrap break-words ${isMe ? 'text-white' : 'text-gray-800'}">${msg.text}</p>`;
        }
        if (msg.type === 'system') {
            return `
            <div class="flex justify-center mb-6" id="msg-${msg.id}">
                <div class="glass-panel text-gray-600 text-[11px] px-4 py-2 font-medium rounded-full shadow-sm truncate max-w-xs md:max-w-md">
                    ${msg.text || msg.attachment}
                </div>
            </div>`;
        }

        const timeColor = isMe ? 'text-green-50/80' : 'text-gray-400';
        const checkColor = isMe ? 'text-white' : 'text-blue-500';

        return `
            <div class="flex flex-col mb-4 w-full" id="msg-${msg.id}">
                <div class="max-w-[85%] md:max-w-md lg:max-w-lg relative p-3 md:p-3.5 ${msgClass} flex flex-col gap-0.5">
                    ${nameHtml}
                    ${mediaHtml}
                    ${contentHtml}
                    <div class="text-[10px] ${timeColor} flex items-center justify-end font-semibold mt-1 ml-auto select-none pt-0.5">
                        ${msg.time}
                        ${isMe ? `<svg class="w-3.5 h-3.5 ml-1 ${checkColor}" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7" /></svg>` : ''}
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

    let lastRenderedDate = '';

    const generateChatsHtml = (snippet) => {
        let html = '';
        snippet.forEach((msg, idx) => {
            if (msg.type !== 'system' && msg.date !== lastRenderedDate) {
                html += `
                <div class="flex justify-center mb-6 w-full date-separator">
                    <span class="bg-gray-800/20 backdrop-blur-md text-gray-800 text-xs px-5 py-1.5 font-bold tracking-widest rounded-full shadow-sm border border-gray-300/30 uppercase">${msg.date}</span>
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
                        const m = parseInt(parts[0]);
                        const y = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
                        const dateObj = new Date(y, m - 1);
                        const formattedDate = `${dateObj.toLocaleString('en-US', { month: 'long' })} ${y}`;
                        
                        floatingDate.innerText = formattedDate;
                        floatingDate.classList.remove('opacity-0', 'translate-y-[-10px]');
                        floatingDate.classList.add('opacity-100', 'translate-y-0');
                        
                        if (dynamicHeaderDate) {
                            dynamicHeaderDate.innerText = parts[1] + ' ' + formattedDate; // e.g. "14 March 2024"
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
                [...years].sort().forEach(y => {
                    const fullYear = y.length === 2 ? `20${y}` : y;
                    yearSelect.innerHTML += `<option value="${y}">${fullYear}</option>`;
                });
                const daySelect = document.getElementById('filter-day');
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
                            const parts = msg.date.split('/'); // Assuming MM/DD/YY
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
                        } else if (showLinks) {
                            return false; // exclude messages without text if strictly looking for links
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

    const loadChatsList = async () => {
        try {
            const resp = await fetch('/api/chats');
            const chats = await resp.json();
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
                selector.value = chats[0];
                currentChat = chats[0];
                window.currentChat = chats[0];
                loadData(chats[0]);
                removeEmptyState();
            } else {
                showEmptyState();
            }
        } catch (e) {
            console.error("Failed to load chats:", e);
            statsInfo.innerText = "Error loading chats list";
        }
    };

    function showEmptyState() {
        const container = document.getElementById('chat-container');
        if (!container) return;
        container.innerHTML = `
            <div class="h-full flex flex-col items-center justify-center px-8 text-center" id="empty-state">
                <div class="w-20 h-20 rounded-3xl bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center mb-5 shadow-inner">
                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                </div>
                <h2 class="text-2xl font-bold text-gray-900 mb-2">Bring a chat to life</h2>
                <p class="text-sm text-gray-500 max-w-sm leading-relaxed mb-6">Drop your WhatsApp export (.zip or folder) to see it beautifully — and talk to your memories with AI.</p>
                <button id="empty-upload-btn" class="bg-gray-900 hover:bg-black text-white font-bold text-sm rounded-2xl px-6 py-3 transition shadow-lg">
                    Import a chat
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
            const selector = document.getElementById('chat-selector');
            if (selector) {
                selector.value = selectName;
                currentChat = selectName;
                window.currentChat = selectName;
                loadData(selectName);
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

    // Initialize application by fetching the list of available chats
    loadChatsList();

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

    window.jumpToMsg = (id) => {
        displayedMessages = allMessages; // Make sure we are in main view
        const idx = displayedMessages.findIndex(m => m.id === id);
        if (idx !== -1) {
            const start = Math.max(0, idx - 50); // Show 50 before
            const end = Math.min(displayedMessages.length, idx + 100); // Show 100 after
            renderChats(start, end);
            
            toggleSidebar(false);

            setTimeout(() => {
                const el = document.getElementById(`msg-${id}`);
                if (el) {
                    // Optimized direct scroll offset bypassing generic scrollIntoView for reliable center anchoring
                    scrollArea.scrollTop = el.offsetTop - (scrollArea.clientHeight / 2) + 50;
                    const bubble = el.firstElementChild;
                    if(bubble) {
                        const originalBorder = bubble.style.border;
                        bubble.style.border = '2px solid #6366f1';
                        bubble.classList.add('shadow-xl', 'scale-[1.02]');
                        bubble.style.transition = 'all 0.5s ease';
                        
                        setTimeout(() => {
                            bubble.style.border = originalBorder;
                            bubble.classList.remove('shadow-xl', 'scale-[1.02]');
                        }, 2500);
                    }
                }
            }, 100);
        }
    };
});
