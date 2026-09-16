function errorHandler(err, req, res, next) {
    console.error(`[Error] ${req.method} ${req.url}:`, err.message);
    if (err.stack) console.error(err.stack);
    
    // Customize error responses if needed based on err.name or err.code
    const status = err.status || err.statusCode || 500;
    const message = err.message || 'Internal Server Error';
    
    res.status(status).json({
        ok: false,
        error: message
    });
}

module.exports = {
    errorHandler
};
