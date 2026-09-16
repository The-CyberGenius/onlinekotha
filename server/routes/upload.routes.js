const express = require('express');
const router = express.Router();
const { upload, handleUpload } = require('../upload');

router.post('/', (req, res, next) => {
    upload.array('files')(req, res, err => {
        if (err) {
            if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'File too large — max 500 MB' });
            return res.status(400).json({ error: err.message || 'Upload error' });
        }
        next();
    });
}, handleUpload);

module.exports = router;
