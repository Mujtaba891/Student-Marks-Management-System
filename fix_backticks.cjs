const fs = require('fs');
let content = fs.readFileSync('src/ui/appRenderer.ts', 'utf-8');

content = content.replace(/return \\`/g, 'return `');
content = content.replace(/\\\$\{/g, '${');
content = content.replace(/\\`/g, '`');

fs.writeFileSync('src/ui/appRenderer.ts', content);
