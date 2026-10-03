const fs = require('fs');
let code = fs.readFileSync('server/globalChat.js', 'utf8');

code = code.replace(
    "const { db, getSetting } = require('./db');",
    "const { db, getSetting, updateLastActive } = require('./db');"
);

code = code.replace(
    "const sender = getAnonymousName(req.user.id);",
    "const sender = getAnonymousName(req.user.id);\n    updateLastActive(req.user.id);"
);

fs.writeFileSync('server/globalChat.js', code);
