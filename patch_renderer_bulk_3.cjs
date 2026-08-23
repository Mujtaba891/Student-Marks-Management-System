const fs = require('fs');
let content = fs.readFileSync('src/ui/appRenderer.ts', 'utf-8');

// Replace loader with text or spinner
content = content.replace(/\$\{icons\.loader\} Generating\.\.\./g, 'Generating PDF...');

fs.writeFileSync('src/ui/appRenderer.ts', content);
