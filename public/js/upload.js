(function () {
    const modal = document.getElementById('upload-modal');
    const openBtn = document.getElementById('open-upload-btn');
    const closeBtn = document.getElementById('close-upload');
    const dropZone = document.getElementById('drop-zone');
    const pickZipBtn = document.getElementById('pick-zip-btn');
    const pickFolderBtn = document.getElementById('pick-folder-btn');
    const fileInputZip = document.getElementById('file-input-zip');
    const fileInputFolder = document.getElementById('file-input-folder');
    const errorEl = document.getElementById('upload-error');

    // Modern active upload & processing section elements
    const uploadInputSection = document.getElementById('upload-input-section');
    const uploadActiveSection = document.getElementById('upload-active-section');
    const iconPulse = document.getElementById('upload-icon-pulse');
    const iconUploading = document.getElementById('upload-icon-uploading');
    const iconProcessing = document.getElementById('upload-icon-processing');
    const iconSuccess = document.getElementById('upload-icon-success');
    const uploadPhaseBadge = document.getElementById('upload-phase-badge');
    const uploadStatusTitle = document.getElementById('upload-status-title');
    const uploadStatusSubtitle = document.getElementById('upload-status-subtitle');
    const uploadProgressBar = document.getElementById('upload-progress-bar');
    const uploadMbCounter = document.getElementById('upload-mb-counter');
    const uploadPercentCounter = document.getElementById('upload-percent-counter');

    // Legacy fallbacks
    const progressWrap = document.getElementById('upload-progress');
    const progressBar = document.getElementById('upload-bar');
    const progressPercent = document.getElementById('upload-percent');
    const progressStatus = document.getElementById('upload-status-text');

    let processingTicker = null;
    const PROCESSING_MESSAGES = [
        { title: 'Extracting chat archive...', sub: 'Unpacking messages, photos, videos and audio notes...' },
        { title: 'Reading conversation history...', sub: 'Parsing timestamps, senders, replies and emojis...' },
        { title: 'Computing chat analytics...', sub: 'Calculating activity streaks, response times and top words...' },
        { title: 'Indexing media files...', sub: 'Organizing voice recordings, photos and shared links...' },
        { title: 'Generating AI intelligence...', sub: 'Building relationship insights and conversation memory...' },
        { title: 'Finalizing dashboard...', sub: 'Almost ready! Saving everything to your private space...' }
    ];

    if (!modal || !openBtn) return;

    function openModal() {
        if (window.__IS_GUEST__) {
            const guestStatus = window.__GUEST_STATUS__ || {};
            if ((guestStatus.chatsRemaining ?? 1) <= 0) {
                if (window.openAuthModal) {
                    window.openAuthModal('Guest limit reached (1/1 free chat imported). Please sign in with Google to import more chats!');
                }
                return;
            }
        }
        modal.classList.remove('hidden');
        requestAnimationFrame(() => modal.classList.remove('opacity-0'));
        resetUI();
    }

    function closeModal() {
        if (processingTicker) {
            clearInterval(processingTicker);
            processingTicker = null;
        }
        modal.classList.add('opacity-0');
        setTimeout(() => modal.classList.add('hidden'), 200);
    }

    function resetUI() {
        if (processingTicker) {
            clearInterval(processingTicker);
            processingTicker = null;
        }
        if (uploadInputSection) uploadInputSection.classList.remove('hidden');
        if (uploadActiveSection) uploadActiveSection.classList.add('hidden');
        if (closeBtn) closeBtn.classList.remove('hidden');
        if (errorEl) {
            errorEl.classList.add('hidden');
            errorEl.textContent = '';
        }
        if (uploadProgressBar) uploadProgressBar.style.width = '0%';
        if (uploadPercentCounter) uploadPercentCounter.textContent = '0%';
        if (uploadMbCounter) uploadMbCounter.textContent = '0 MB / 0 MB';
        if (iconUploading) iconUploading.classList.remove('hidden');
        if (iconProcessing) iconProcessing.classList.add('hidden');
        if (iconSuccess) iconSuccess.classList.add('hidden');
        if (iconPulse) iconPulse.classList.remove('hidden');

        // Legacy compatibility
        if (progressWrap) progressWrap.classList.add('hidden');
        if (progressBar) progressBar.style.width = '0%';
        if (progressPercent) progressPercent.textContent = '0%';
        if (progressStatus) progressStatus.textContent = 'Uploading...';
    }

    function showError(msg) {
        if (processingTicker) {
            clearInterval(processingTicker);
            processingTicker = null;
        }
        if (uploadInputSection) uploadInputSection.classList.remove('hidden');
        if (uploadActiveSection) uploadActiveSection.classList.add('hidden');
        if (closeBtn) closeBtn.classList.remove('hidden');
        if (errorEl) {
            errorEl.textContent = msg;
            errorEl.classList.remove('hidden');
        }
        if (progressWrap) progressWrap.classList.add('hidden');
    }

    function startUploadingUI(totalSize) {
        if (processingTicker) {
            clearInterval(processingTicker);
            processingTicker = null;
        }
        if (uploadInputSection) uploadInputSection.classList.add('hidden');
        if (uploadActiveSection) uploadActiveSection.classList.remove('hidden');
        if (closeBtn) closeBtn.classList.add('hidden'); // Protect against accidental dismiss
        if (errorEl) errorEl.classList.add('hidden');

        if (uploadPhaseBadge) {
            uploadPhaseBadge.textContent = 'Phase 1 of 2: Uploading Chat';
            uploadPhaseBadge.className = 'inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[10.5px] font-bold uppercase tracking-wider bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 border border-indigo-200/50 dark:border-indigo-800/40 mb-2';
        }
        if (iconUploading) iconUploading.classList.remove('hidden');
        if (iconProcessing) iconProcessing.classList.add('hidden');
        if (iconSuccess) iconSuccess.classList.add('hidden');
        if (iconPulse) iconPulse.classList.remove('hidden');

        if (uploadStatusTitle) uploadStatusTitle.textContent = 'Uploading chat data...';
        if (uploadStatusSubtitle) uploadStatusSubtitle.textContent = 'Transferring file chunks safely to server...';
        if (uploadProgressBar) uploadProgressBar.style.width = '0%';
        if (uploadPercentCounter) uploadPercentCounter.textContent = '0%';
        const mbTotal = (totalSize / (1024 * 1024)).toFixed(1);
        if (uploadMbCounter) uploadMbCounter.textContent = `0.0 / ${mbTotal} MB`;
    }

    function updateUploadProgress(loadedBytes, totalSize, chunkText = '') {
        const pct = Math.min(99, Math.round((loadedBytes / totalSize) * 100));
        if (uploadProgressBar) uploadProgressBar.style.width = pct + '%';
        if (uploadPercentCounter) uploadPercentCounter.textContent = pct + '%';
        const mbUploaded = (loadedBytes / (1024 * 1024)).toFixed(1);
        const mbTotal = (totalSize / (1024 * 1024)).toFixed(1);
        if (uploadMbCounter) uploadMbCounter.textContent = `${mbUploaded} / ${mbTotal} MB`;
        if (uploadStatusSubtitle && chunkText) uploadStatusSubtitle.textContent = chunkText;

        // Legacy compatibility
        if (progressBar) progressBar.style.width = pct + '%';
        if (progressPercent) progressPercent.textContent = pct + '%';
        if (progressStatus) progressStatus.textContent = `Uploading ${mbUploaded} / ${mbTotal} MB (${pct}%)...`;
    }

    function startProcessingUI() {
        if (uploadPhaseBadge) {
            uploadPhaseBadge.textContent = 'Phase 2 of 2: Processing & Indexing';
            uploadPhaseBadge.className = 'inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[10.5px] font-bold uppercase tracking-wider bg-purple-50 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 border border-purple-200/50 dark:border-purple-800/40 mb-2';
        }
        if (iconUploading) iconUploading.classList.add('hidden');
        if (iconProcessing) iconProcessing.classList.remove('hidden');
        if (iconSuccess) iconSuccess.classList.add('hidden');
        if (iconPulse) iconPulse.classList.remove('hidden');

        let msgIndex = 0;
        function renderStep(idx) {
            const step = PROCESSING_MESSAGES[idx % PROCESSING_MESSAGES.length];
            if (uploadStatusTitle) uploadStatusTitle.textContent = step.title;
            if (uploadStatusSubtitle) {
                uploadStatusSubtitle.style.opacity = '0';
                setTimeout(() => {
                    uploadStatusSubtitle.textContent = step.sub;
                    uploadStatusSubtitle.style.opacity = '1';
                }, 180);
            }
        }
        renderStep(0);

        let fakePct = 85;
        if (uploadProgressBar) uploadProgressBar.style.width = fakePct + '%';
        if (uploadPercentCounter) uploadPercentCounter.textContent = fakePct + '%';
        if (uploadMbCounter) uploadMbCounter.textContent = 'Processing files...';

        if (processingTicker) clearInterval(processingTicker);
        processingTicker = setInterval(() => {
            msgIndex++;
            renderStep(msgIndex);
            if (fakePct < 98) {
                fakePct += 1;
                if (uploadProgressBar) uploadProgressBar.style.width = fakePct + '%';
                if (uploadPercentCounter) uploadPercentCounter.textContent = fakePct + '%';
            }
        }, 2500);

        // Legacy compatibility
        if (progressStatus) progressStatus.textContent = 'Processing chat (extracting & analyzing)...';
        if (progressBar) progressBar.style.width = '100%';
        if (progressPercent) progressPercent.textContent = '100%';
    }

    function finishProcessingUI() {
        if (processingTicker) {
            clearInterval(processingTicker);
            processingTicker = null;
        }
        if (uploadPhaseBadge) {
            uploadPhaseBadge.textContent = 'Complete!';
            uploadPhaseBadge.className = 'inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[10.5px] font-bold uppercase tracking-wider bg-emerald-50 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200/50 dark:border-emerald-800/40 mb-2';
        }
        if (iconUploading) iconUploading.classList.add('hidden');
        if (iconProcessing) iconProcessing.classList.add('hidden');
        if (iconSuccess) iconSuccess.classList.remove('hidden');
        if (iconPulse) iconPulse.classList.add('hidden');

        if (uploadStatusTitle) uploadStatusTitle.textContent = 'Chat Imported Successfully! ✨';
        if (uploadStatusSubtitle) uploadStatusSubtitle.textContent = 'Opening your conversation dashboard...';
        if (uploadProgressBar) uploadProgressBar.style.width = '100%';
        if (uploadPercentCounter) uploadPercentCounter.textContent = '100%';
        if (uploadMbCounter) uploadMbCounter.textContent = 'Ready!';

        // Legacy compatibility
        if (progressStatus) progressStatus.textContent = 'Done!';
    }

    openBtn.addEventListener('click', openModal);
    closeBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', e => {
        if (e.target === modal) {
            if (uploadActiveSection && !uploadActiveSection.classList.contains('hidden')) {
                return;
            }
            closeModal();
        }
    });

    pickZipBtn.addEventListener('click', () => fileInputZip.click());
    pickFolderBtn.addEventListener('click', () => fileInputFolder.click());

    fileInputZip.addEventListener('change', e => {
        if (e.target.files.length) uploadFiles(Array.from(e.target.files));
    });
    fileInputFolder.addEventListener('change', e => {
        if (e.target.files.length) uploadFiles(Array.from(e.target.files));
    });

    ['dragenter', 'dragover'].forEach(evt => {
        dropZone.addEventListener(evt, e => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.add('bg-indigo-100/80', 'border-indigo-500');
        });
    });

    ['dragleave', 'drop'].forEach(evt => {
        dropZone.addEventListener(evt, e => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.remove('bg-indigo-100/80', 'border-indigo-500');
        });
    });

    dropZone.addEventListener('drop', async e => {
        const items = e.dataTransfer.items;
        const files = [];

        if (items && items.length && items[0].webkitGetAsEntry) {
            const entries = [];
            for (let i = 0; i < items.length; i++) {
                const entry = items[i].webkitGetAsEntry();
                if (entry) entries.push(entry);
            }
            for (const entry of entries) {
                await walkEntry(entry, '', files);
            }
        } else {
            for (const f of e.dataTransfer.files) files.push(f);
        }

        if (files.length) uploadFiles(files);
    });

    function walkEntry(entry, pathPrefix, out) {
        return new Promise(resolve => {
            if (entry.isFile) {
                entry.file(file => {
                    const wrapped = new File([file], pathPrefix + file.name, { type: file.type });
                    Object.defineProperty(wrapped, 'webkitRelativePath', {
                        value: pathPrefix + file.name,
                    });
                    out.push(wrapped);
                    resolve();
                }, resolve);
            } else if (entry.isDirectory) {
                const reader = entry.createReader();
                const readAll = (collected = []) => {
                    reader.readEntries(async batch => {
                        if (!batch.length) {
                            for (const child of collected) {
                                await walkEntry(child, pathPrefix + entry.name + '/', out);
                            }
                            resolve();
                        } else {
                            readAll(collected.concat(Array.from(batch)));
                        }
                    }, resolve);
                };
                readAll();
            } else {
                resolve();
            }
        });
    }

    // ── Paste chat text ──────────────────────────────────────
    const togglePasteBtn = document.getElementById('toggle-paste-btn');
    const pasteArea      = document.getElementById('paste-area');
    const pasteText      = document.getElementById('paste-text');
    const pasteImportBtn = document.getElementById('paste-import-btn');

    if (togglePasteBtn && pasteArea) {
        togglePasteBtn.addEventListener('click', () => {
            pasteArea.classList.toggle('hidden');
            if (!pasteArea.classList.contains('hidden')) pasteText?.focus();
        });
    }
    if (pasteImportBtn) {
        pasteImportBtn.addEventListener('click', () => {
            const text = (pasteText?.value || '').trim();
            if (!text) { showError('Paste some chat text first.'); return; }
            const file = new File([text], '_chat.txt', { type: 'text/plain' });
            uploadFiles([file]);
        });
    }

    // ── Chunked Upload Constants & Helpers ──────────────────
    const CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB per chunk

    function uploadSingleChunk({ uploadId, chunkIndex, totalChunks, fileName, originalName, totalSize, chunkBlob, onProgress }) {
        return new Promise((resolve, reject) => {
            const formData = new FormData();
            formData.append('uploadId', uploadId);
            formData.append('chunkIndex', String(chunkIndex));
            formData.append('totalChunks', String(totalChunks));
            formData.append('fileName', fileName);
            formData.append('originalName', originalName);
            formData.append('totalSize', String(totalSize));
            formData.append('chunk', chunkBlob, `chunk_${chunkIndex}`);

            const xhr = new XMLHttpRequest();
            const query = `uploadId=${encodeURIComponent(uploadId)}&chunkIndex=${chunkIndex}&totalChunks=${totalChunks}`;
            xhr.open('POST', `/api/upload/chunk?${query}`);
            xhr.timeout = 120000; // 2 minutes per 5MB chunk

            if (onProgress) {
                xhr.upload.addEventListener('progress', e => {
                    if (e.lengthComputable) onProgress(e.loaded);
                });
            }

            xhr.onload = () => {
                let resp = {};
                try { resp = JSON.parse(xhr.responseText); } catch {}
                if (xhr.status >= 200 && xhr.status < 300 && resp.ok) {
                    resolve(resp);
                } else {
                    const err = new Error(resp.error || `Chunk upload failed (${xhr.status})`);
                    if (resp.requireAuth || xhr.status === 403) err.requireAuth = true;
                    if (resp.upgrade) err.upgrade = true;
                    reject(err);
                }
            };

            xhr.onerror = () => reject(new Error('Network error during upload'));
            xhr.ontimeout = () => reject(new Error('Upload connection timed out'));
            xhr.send(formData);
        });
    }

    async function uploadChunkWithRetry(opts, maxRetries = 3) {
        let lastErr;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await uploadSingleChunk(opts);
            } catch (err) {
                lastErr = err;
                if (err.requireAuth || err.upgrade) throw err;
                console.warn(`Chunk ${opts.chunkIndex} attempt ${attempt} failed:`, err.message);
                if (attempt < maxRetries) {
                    await new Promise(r => setTimeout(r, attempt * 1200));
                }
            }
        }
        throw lastErr;
    }

    // Upload single file (ZIP or TXT) via 5MB Chunks
    async function uploadSingleFileChunked(file) {
        const totalSize = file.size;
        const totalChunks = Math.max(1, Math.ceil(totalSize / CHUNK_SIZE));
        const uploadId = 'up_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);

        let fileName = file.name.replace(/[^\x20-\x7E]/g, '').trim() || 'whatsapp_chat.zip';
        if (file.name.toLowerCase().endsWith('.zip')) {
            fileName = 'whatsapp_chat.zip';
        }
        const originalName = file.name;

        for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
            const start = chunkIndex * CHUNK_SIZE;
            const end = Math.min(totalSize, start + CHUNK_SIZE);
            const chunkSlice = file.slice(start, end);

            // Read into in-memory ArrayBuffer to eliminate iOS Safari WebKit sliced-blob bug
            const buffer = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = e => resolve(e.target.result);
                reader.onerror = () => reject(new Error('Could not read file slice'));
                reader.readAsArrayBuffer(chunkSlice);
            });

            const safeChunkBlob = new Blob([buffer], { type: 'application/octet-stream' });

            await uploadChunkWithRetry({
                uploadId,
                chunkIndex,
                totalChunks,
                fileName,
                originalName,
                totalSize,
                chunkBlob: safeChunkBlob,
                onProgress: (loadedInChunk) => {
                    const loadedBytes = start + loadedInChunk;
                    updateUploadProgress(loadedBytes, totalSize, `Uploading chunk ${chunkIndex + 1} of ${totalChunks}...`);
                }
            });
        }

        // All chunks uploaded: assemble & process on server
        startProcessingUI();

        const completeResp = await fetch('/api/upload/chunk-complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                uploadId,
                totalChunks,
                fileName,
                originalName,
                totalSize
            })
        });

        const data = await completeResp.json().catch(() => ({}));
        if (!completeResp.ok || !data.ok) {
            const err = new Error(data.error || `Processing failed (${completeResp.status})`);
            if (data.requireAuth || completeResp.status === 403) err.requireAuth = true;
            if (data.upgrade) err.upgrade = true;
            throw err;
        }

        return data;
    }

    // Upload folder / multiple individual files
    async function uploadMultipleFiles(files) {
        const uploadId = 'up_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
        let totalBytes = 0;
        for (const f of files) totalBytes += f.size;
        let uploadedBytes = 0;

        let firstFolder = 'whatsapp_chat';
        for (let i = 0; i < files.length; i++) {
            const f = files[i];
            const relPath = f.webkitRelativePath || f.name;
            if (relPath.includes('/') && firstFolder === 'whatsapp_chat') {
                firstFolder = relPath.split('/')[0];
            }

            let safeBlob;
            if (f.size <= 10 * 1024 * 1024) {
                const buffer = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = e => resolve(e.target.result);
                    reader.onerror = reject;
                    reader.readAsArrayBuffer(f);
                });
                safeBlob = new Blob([buffer], { type: f.type || 'application/octet-stream' });
            } else {
                safeBlob = f;
            }

            const query = `uploadId=${encodeURIComponent(uploadId)}&fileIndex=${i}&totalFiles=${files.length}&relPath=${encodeURIComponent(relPath)}`;
            const formData = new FormData();
            formData.append('file', safeBlob, pathBasename(relPath));

            await new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.open('POST', `/api/upload/file?${query}`);
                xhr.timeout = 120000;

                xhr.upload.addEventListener('progress', e => {
                    if (e.lengthComputable) {
                        const totalLoaded = uploadedBytes + e.loaded;
                        updateUploadProgress(totalLoaded, totalBytes, `Uploading file ${i + 1} of ${files.length}...`);
                    }
                });

                xhr.onload = () => {
                    let resp = {};
                    try { resp = JSON.parse(xhr.responseText); } catch {}
                    if (xhr.status >= 200 && xhr.status < 300 && resp.ok) resolve(resp);
                    else {
                        const err = new Error(resp.error || `Upload failed (${xhr.status})`);
                        if (resp.requireAuth || xhr.status === 403) err.requireAuth = true;
                        if (resp.upgrade) err.upgrade = true;
                        reject(err);
                    }
                };
                xhr.onerror = () => reject(new Error('Network error uploading file'));
                xhr.ontimeout = () => reject(new Error('Upload connection timed out'));
                xhr.send(formData);
            });

            uploadedBytes += f.size;
        }

        startProcessingUI();

        const completeResp = await fetch('/api/upload/files-complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uploadId, folderName: firstFolder })
        });

        const data = await completeResp.json().catch(() => ({}));
        if (!completeResp.ok || !data.ok) {
            const err = new Error(data.error || `Processing failed (${completeResp.status})`);
            if (data.requireAuth || completeResp.status === 403) err.requireAuth = true;
            if (data.upgrade) err.upgrade = true;
            throw err;
        }

        return data;
    }

    function pathBasename(p) {
        return (p || '').split(/[\\/]/).pop() || 'file';
    }

    function handleUploadSuccess(resp) {
        finishProcessingUI();
        if (window.__IS_GUEST__ && window.__GUEST_STATUS__) {
            window.__GUEST_STATUS__.chatsRemaining = Math.max(0, (window.__GUEST_STATUS__.chatsRemaining || 1) - 1);
            window.__GUEST_STATUS__.chatsImported = (window.__GUEST_STATUS__.chatsImported || 0) + 1;
            const remEl = document.getElementById('guest-chat-rem');
            if (remEl) remEl.textContent = window.__GUEST_STATUS__.chatsRemaining;
        }
        setTimeout(() => {
            closeModal();
            if (window.refreshChats) window.refreshChats(resp.chat);
            else window.location.reload();
        }, 700);
    }

    async function uploadFiles(files) {
        if (!files || !files.length) return;

        if (window.__IS_GUEST__) {
            const guestStatus = window.__GUEST_STATUS__ || {};
            if ((guestStatus.chatsRemaining ?? 1) <= 0) {
                closeModal();
                if (window.openAuthModal) {
                    window.openAuthModal('Guest limit reached (1/1 free chat imported). Please sign in with Google to import more chats!');
                }
                return;
            }
        }

        let totalSize = 0;
        for (const f of files) totalSize += f.size;

        // Allow up to 2 GB uploads
        if (totalSize > 2048 * 1024 * 1024) {
            showError("Chat file exceeds 2 GB limit. Please export a smaller date range in WhatsApp and try again.");
            return;
        }

        resetUI();
        startUploadingUI(totalSize);

        try {
            let resp;
            if (files.length === 1) {
                // Single file (ZIP or TXT) -> Chunked Upload (100% resilient for 200MB, 500MB, 1GB+)
                resp = await uploadSingleFileChunked(files[0]);
            } else {
                // Multiple files / folder drop
                resp = await uploadMultipleFiles(files);
            }
            handleUploadSuccess(resp);
        } catch (err) {
            console.error('Upload error:', err);
            if (err.requireAuth) {
                closeModal();
                if (window.openAuthModal) {
                    window.openAuthModal(err.message || 'Guest limit reached (1/1 free chat imported). Please sign in with Google to import more chats!');
                }
            } else if (err.upgrade) {
                closeModal();
                if (window.openUpgradeModal) {
                    window.openUpgradeModal();
                } else {
                    showError(err.message || 'Free plan limit reached. Upgrade to Pro for unlimited chats!');
                }
            } else {
                showError(err.message || 'Upload failed. Please check your connection and try again.');
            }
        }
    }

    // ── Share Target: file shared from WhatsApp → PWA ────────
    async function handleSharedFile() {
        if (!new URLSearchParams(location.search).has('shared')) return;
        try {
            const cache = await caches.open('kotha-share');
            const res = await cache.match('/__shared_chat');
            if (res) {
                const blob = await res.blob();
                const name = res.headers.get('x-filename') || 'shared_chat.zip';
                const file = new File([blob], name, { type: blob.type || 'application/zip' });
                await cache.delete('/__shared_chat');
                openModal();
                uploadFiles([file]);
            }
        } catch (e) { /* no shared file */ }
        history.replaceState({}, '', '/app');
    }
    handleSharedFile();
})();
