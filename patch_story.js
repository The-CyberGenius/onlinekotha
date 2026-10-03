const fs = require('fs');
let code = fs.readFileSync('public/js/story.js', 'utf8');

// 1. Fix the logo
code = code.replace(
    '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" stroke-width="2.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
    '<img src="/img/logo.svg" style="width:24px; height:24px; filter: brightness(0) invert(1);" />'
);

// 2. Fix the action buttons styling (Make them normal sized for mobile overlay)
code = code.replace(
    /position: absolute; bottom: 120px; left: 0; right: 0;[\s\S]*?z-index: 300;/m,
    'position: absolute; bottom: 40px; left: 0; right: 0;\n            display: flex; justify-content: center; gap: 16px; z-index: 300;'
);

code = code.replace(
    /color: #fff; padding: 20px 40px; border-radius: 40px; font-size: 28px; font-weight: 700;/m,
    'color: #fff; padding: 12px 24px; border-radius: 40px; font-size: 15px; font-weight: 600;'
);

code = code.replace(
    /display: flex; align-items: center; gap: 16px; box-shadow: 0 10px 30px rgba\(0,0,0,0\.3\);/m,
    'display: flex; align-items: center; gap: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.3);'
);

// 3. Fix the blank cards problem (remove buggy background-clip text)
code = code.replace(
    /background: #fff; -webkit-background-clip: text;/g,
    'color: #ffffff;'
);

// 4. In cardEmojis, map emojis correctly if there are undefined ones causing blank spots
code = code.replace(
    /const emojis = this\.getTopEmojis\(m\);/,
    'const emojis = this.getTopEmojis(m).filter(e => e && e.emoji);'
);

// 5. Ensure the SVG icons inside the buttons are slightly smaller to match 15px font
code = code.replace(
    /<svg width="24" height="24"/g,
    '<svg width="18" height="18"'
);

fs.writeFileSync('public/js/story.js', code);
