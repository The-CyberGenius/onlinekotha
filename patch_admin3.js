const fs = require('fs');
let code = fs.readFileSync('public/admin.html', 'utf8');

code = code.replace(
    /\$\{e\.page \? \`\<div style="font-size:12px; color:var\(--text-secondary\);"\>Page: \$\{e\.page\}\<\/div>\` : ''\}/,
    `\${e.page ? \`<div style="font-size:12px; color:var(--text-secondary);">Page: \${e.page}</div>\` : ''}
                                \${e.metadata ? \`<div style="font-size:11px; color:var(--text-muted); margin-top:4px; font-family:monospace; background:rgba(0,0,0,0.2); padding:4px; border-radius:4px;">\${e.metadata}</div>\` : ''}`
);

fs.writeFileSync('public/admin.html', code);
