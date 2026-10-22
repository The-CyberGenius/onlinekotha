(function () {
    const modal = document.getElementById('upload-modal');
    const openBtn = document.getElementById('open-upload-btn');
    const closeBtn = document.getElementById('close-upload');
    const dropZone = document.getElementById('drop-zone');
    const pickZipBtn = document.getElementById('pick-zip-btn');
    const pickFolderBtn = document.getElementById('pick-folder-btn');
    const fileInputZip = document.getElementById('file-input-zip');
    const fileInputFolder = document.getElementById('file-input-folder');
    const progressWrap = document.getElementById('upload-progress');
    const progressBar = document.getElementById('upload-bar');
    const progressPercent = document.getElementById('upload-percent');
    const progressStatus = document.getElementById('upload-status-text');
    const errorEl = document.getElementById('upload-error');

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
        modal.classList.add('opacity-0');
        setTimeout(() => modal.classList.add('hidden'), 200);
    }

    function resetUI() {
        progressWrap.classList.add('hidden');
        errorEl.classList.add('hidden');
        errorEl.textContent = '';
        progressBar.style.width = '0%';
        progressPercent.textContent = '0%';
        progressStatus.textContent = 'Uploading...';
    }

    function showError(msg) {
        errorEl.textContent = msg;
        errorEl.classList.remove('hidden');
        progressWrap.classList.add('hidden');
    }

    openBtn.addEventListener('click', openModal);
    closeBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', e => {
        if (e.target === modal) closeModal();
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
                    const pct = Math.min(99, Math.round((loadedBytes / totalSize) * 100));
                    progressBar.style.width = pct + '%';
                    progressPercent.textContent = pct + '%';
                    const mbUploaded = (loadedBytes / (1024 * 1024)).toFixed(1);
                    const mbTotal = (totalSize / (1024 * 1024)).toFixed(1);
                    progressStatus.textContent = `Uploading ${mbUploaded} / ${mbTotal} MB (${pct}%)...`;
                }
            });
        }

        // All chunks uploaded: assemble & process on server
        progressStatus.textContent = 'Processing chat (extracting & analyzing)...';
        progressBar.style.width = '100%';
        progressPercent.textContent = '100%';

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
                        const pct = Math.min(99, Math.round((totalLoaded / totalBytes) * 100));
                        progressBar.style.width = pct + '%';
                        progressPercent.textContent = pct + '%';
                        progressStatus.textContent = `Uploading files ${i + 1}/${files.length} (${pct}%)...`;
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

        progressStatus.textContent = 'Processing chat (analyzing)...';
        progressBar.style.width = '100%';
        progressPercent.textContent = '100%';

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
        progressStatus.textContent = 'Done!';
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
        }, 400);
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
        progressWrap.classList.remove('hidden');
        progressStatus.textContent = 'Preparing upload...';

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
                if (window.showProModal) {
                    window.showProModal();
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
