const fs = require('fs');
let code = fs.readFileSync('public/js/story.js', 'utf8');

code = code.replace(
    /\.anim-fade-up \{ opacity: 0; transform: translateY\(40px\); animation: fadeUp 0\.8s cubic-bezier\(0\.16, 1, 0\.3, 1\) forwards; \}/,
    '.anim-fade-up { animation: fadeUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) both; }'
);

code = code.replace(
    /@keyframes fadeUp \{ to \{ opacity: 1; transform: translateY\(0\); \} \}/,
    '@keyframes fadeUp { 0% { opacity: 0; transform: translateY(40px); } 100% { opacity: 1; transform: translateY(0); } }'
);

fs.writeFileSync('public/js/story.js', code);
