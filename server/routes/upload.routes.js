const express = require('express');
const router = express.Router();
const {
    upload,
    handleUpload,
    uploadChunk,
    handleChunk,
    handleChunkComplete,
    uploadIndividualFile,
    handleIndividualFile,
    handleCompleteMultiFiles
} = require('../upload');

// Standard monolithic upload (legacy & small single uploads up to 2GB)
router.post('/', (req, res, next) => {
    upload.array('files')(req, res, err => {
        if (err) {
            if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'File too large — max 2 GB' });
            return res.status(400).json({ error: err.message || 'Upload error' });
        }
        next();
    });
}, handleUpload);

// Chunk upload (for large files, iOS WebKit safe, chunked transfer)
router.post('/chunk', (req, res, next) => {
    uploadChunk.single('chunk')(req, res, err => {
        if (err) {
            return res.status(400).json({ error: err.message || 'Chunk upload error' });
        }
        next();
    });
}, handleChunk);

// Chunk completion & assembly
router.post('/chunk-complete', express.json(), handleChunkComplete);

// Individual file upload (for folder / multi-file drops)
router.post('/file', (req, res, next) => {
    uploadIndividualFile.single('file')(req, res, err => {
        if (err) {
            return res.status(400).json({ error: err.message || 'File upload error' });
        }
        next();
    });
}, handleIndividualFile);

// Multi-file completion & assembly
router.post('/files-complete', express.json(), handleCompleteMultiFiles);

module.exports = router;
