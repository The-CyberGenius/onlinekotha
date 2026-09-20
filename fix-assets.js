const fs = require('fs');
const path = require('path');

function replaceInDir(dir, level = 0) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            if (file === 'assets') continue; // Don't modify assets themselves
            replaceInDir(fullPath, level + 1);
        } else if (file.endsWith('.html') || file.endsWith('.js') || file.endsWith('.css')) {
            let content = fs.readFileSync(fullPath, 'utf8');
            let original = content;
            
            // For root (level 0), replace /assets/ with ./assets/
            // For level 1 (e.g. blog/), replace /assets/ with ../assets/
            // For level 2 (e.g. js/components/), replace /assets/ with ../../assets/ etc.
            
            let relativePrefix = './';
            if (level > 0) {
                relativePrefix = '../'.repeat(level);
            }
            
            content = content.replace(/"\/assets\//g, `"${relativePrefix}assets/`);
            content = content.replace(/'\/assets\//g, `'${relativePrefix}assets/`);
            content = content.replace(/url\(\/assets\//g, `url(${relativePrefix}assets/`);
            
            if (content !== original) {
                fs.writeFileSync(fullPath, content);
                console.log(`Updated paths in ${fullPath}`);
            }
        }
    }
}

replaceInDir(path.join(__dirname, 'public'));

// Inject openUpgradeModal and closeUpgradeModal into script.js if missing
const scriptJsPath = path.join(__dirname, 'public', 'js', 'script.js');
let scriptJs = fs.readFileSync(scriptJsPath, 'utf8');

if (!scriptJs.includes('window.openUpgradeModal')) {
    const modalCode = `
window.openUpgradeModal = function() {
    const modal = document.getElementById('upgrade-modal');
    if (modal) {
        modal.classList.remove('hidden');
        setTimeout(() => {
            modal.classList.remove('opacity-0');
            const card = modal.querySelector('.glass-upgrade-card');
            if(card) {
                card.classList.remove('scale-95');
                card.classList.add('scale-100');
            }
        }, 10);
    }
};

window.closeUpgradeModal = function() {
    const modal = document.getElementById('upgrade-modal');
    if (modal) {
        modal.classList.add('opacity-0');
        const card = modal.querySelector('.glass-upgrade-card');
        if(card) {
            card.classList.remove('scale-100');
            card.classList.add('scale-95');
        }
        setTimeout(() => {
            modal.classList.add('hidden');
        }, 400);
    }
};
`;
    // Prepend to script.js
    scriptJs = modalCode + '\n' + scriptJs;
    fs.writeFileSync(scriptJsPath, scriptJs);
    console.log('Added openUpgradeModal and closeUpgradeModal to script.js');
}

