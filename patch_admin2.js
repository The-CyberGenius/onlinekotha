const fs = require('fs');
let code = fs.readFileSync('public/admin.html', 'utf8');

code = code.replace(
    '<h3>Total Visitors</h3>',
    '<h3>Unique Visitors</h3>'
);

fs.writeFileSync('public/admin.html', code);
