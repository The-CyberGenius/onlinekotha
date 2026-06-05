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

    function uploadFiles(files) {
        resetUI();
        progressWrap.classList.remove('hidden');

        const form = new FormData();
        for (const f of files) {
            const relPath = f.webkitRelativePath || f.name;
            form.append('files', f, relPath);
        }

        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/upload');

        xhr.upload.addEventListener('progress', e => {
            if (e.lengthComputable) {
                const pct = Math.round((e.loaded / e.total) * 100);
                progressBar.style.width = pct + '%';
                progressPercent.textContent = pct + '%';
                if (pct === 100) progressStatus.textContent = 'Processing on server...';
            }
        });

        xhr.onload = () => {
            try {
                const resp = JSON.parse(xhr.responseText);
                if (xhr.status >= 200 && xhr.status < 300 && resp.ok) {
                    progressStatus.textContent = 'Done!';
                    setTimeout(() => {
                        closeModal();
                        if (window.refreshChats) window.refreshChats(resp.chat);
                        else window.location.reload();
                    }, 400);
                } else {
                    showError(resp.error || 'Upload failed');
                }
            } catch (err) {
                showError('Server error');
            }
        };

        xhr.onerror = () => showError('Network error');
        xhr.send(form);
    }
})();
