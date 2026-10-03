const fs = require('fs');
let code = fs.readFileSync('public/admin.html', 'utf8');

// I will write a custom replace function
const newStr = `
                                \${(() => {
                                    if(!e.metadata) return '';
                                    try {
                                        const m = JSON.parse(e.metadata);
                                        const pairs = Object.entries(m).filter(([k,v]) => k !== 'user_id').map(([k,v]) => \`\${k}: \${v}\`).join(' | ');
                                        return pairs ? \`<div style="font-size:11px; color:var(--text-muted); margin-top:4px; font-family:monospace; background:rgba(0,0,0,0.05); padding:4px 6px; border-radius:4px;">\${pairs}</div>\` : '';
                                    } catch(err) { return ''; }
                                })()}
`;

code = code.replace(
    /\$\{e\.metadata \? \`\<div style="font-size:11px; color:var\(--text-muted\); margin-top:4px; font-family:monospace; background:rgba\(0,0,0,0\.2\); padding:4px; border-radius:4px;"\>\$\{e\.metadata\}\<\/div>\` : ''\}/,
    newStr
);

fs.writeFileSync('public/admin.html', code);
