const fs = require('fs');
let dm = fs.readFileSync('public/js/dm.js', 'utf8');

dm = dm.replace(
    /if \(\!activeConvId\) return;\n\s*try \{/g,
    `if (!activeConvId) return;
            if (socket && socket.connected) return; // Skip polling if real-time socket is active
            try {`
);

dm = dm.replace(
    /if \(activeConvId\) return; \/\/ don't disrupt while reading a chat\n\s*loadConvs\(\);/g,
    `if (activeConvId) return; // don't disrupt while reading a chat
            if (socket && socket.connected) return; // Skip polling if real-time socket is active
            loadConvs();`
);

fs.writeFileSync('public/js/dm.js', dm);
