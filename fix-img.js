const fs = require('fs');
const path = require('path');

function replaceInDir(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            if (file === 'img' || file === 'assets') continue; // skip
            replaceInDir(fullPath);
        } else if (file.endsWith('.html') || file.endsWith('.js') || file.endsWith('.css') || file.endsWith('.json')) {
            let content = fs.readFileSync(fullPath, 'utf8');
            let original = content;
            
            // Replacing combinations
            content = content.replace(/\.\/assets\//g, './img/');
            content = content.replace(/\.\.\/assets\//g, '../img/');
            content = content.replace(/"\/assets\//g, '"/img/');
            content = content.replace(/'\/assets\//g, "'/img/");
            content = content.replace(/url\(\/assets\//g, "url(/img/");
            
            if (content !== original) {
                fs.writeFileSync(fullPath, content);
                console.log(`Updated paths in ${fullPath}`);
            }
        }
    }
}

replaceInDir(path.join(__dirname, 'public'));
