const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

code = code.replace(
    "const { db } = require('./server/db');",
    "const { db, updateLastActive } = require('./server/db');"
);

code = code.replace(
    "onlineUsers.get(uid).add(socket.id);",
    "onlineUsers.get(uid).add(socket.id);\n    updateLastActive(uid);"
);

code = code.replace(
    "socket.on('dm:typing', ({ conv_id, typing }) => {",
    "socket.on('dm:typing', ({ conv_id, typing }) => {\n        updateLastActive(uid);"
);

code = code.replace(
    "socket.on('dm:message', (data) => {",
    "socket.on('dm:message', (data) => {\n        updateLastActive(uid);"
);

fs.writeFileSync('server.js', code);
