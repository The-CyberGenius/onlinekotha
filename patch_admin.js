const fs = require('fs');
let code = fs.readFileSync('server/admin.js', 'utf8');
const route = fs.readFileSync('playground_route.js', 'utf8');
code = code.replace('// ---------- Routes (feature → model) ----------', `// ---------- Playground ----------\n${route}\n// ---------- Routes (feature → model) ----------`);
fs.writeFileSync('server/admin.js', code);
