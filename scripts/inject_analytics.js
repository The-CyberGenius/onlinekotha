const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, '..', 'public');
const scriptTag = '    <script src="/js/analytics.js" async></script>\n';

function inject(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            inject(fullPath);
        } else if (fullPath.endsWith('.html')) {
            let content = fs.readFileSync(fullPath, 'utf8');
            if (!content.includes('/js/analytics.js')) {
                content = content.replace('</head>', scriptTag + '</head>');
                fs.writeFileSync(fullPath, content);
                console.log('Injected into ' + fullPath);
            }
        }
    }
}

inject(publicDir);
console.log('Done injecting analytics.js');
