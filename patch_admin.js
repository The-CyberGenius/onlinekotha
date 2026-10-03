const fs = require('fs');
let code = fs.readFileSync('public/admin.html', 'utf8');

code = code.replace(
    /<div style="font-size:13px; font-weight:600; color:var\(--text-primary\);">\$\{e\.event_type\}<\/div>/g,
    `
        <div style="font-size:13px; font-weight:600; color:var(--text-primary);">\${
            {
                'page_view': 'Viewed Page',
                'signup_completed': 'Signed Up',
                'login_success': 'Logged In',
                'message_sent': 'Sent Message',
                'plan_upgraded': 'Upgraded Plan'
            }[e.event_type] || e.event_type.replace(/_/g, ' ').replace(/\\b\\w/g, l => l.toUpperCase())
        }</div>
    `
);

fs.writeFileSync('public/admin.html', code);
