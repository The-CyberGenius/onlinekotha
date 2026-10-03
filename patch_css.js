const fs = require('fs');
let code = fs.readFileSync('public/js/story.js', 'utf8');

if (!code.includes('.ok-story-content')) {
    code = code.replace(
        /\.ok-story-safe \{/,
        '.ok-story-content { position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 10; }\n        .ok-story-safe {'
    );
    fs.writeFileSync('public/js/story.js', code);
}
