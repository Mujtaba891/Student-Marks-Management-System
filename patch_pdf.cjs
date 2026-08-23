const fs = require('fs');
let content = fs.readFileSync('src/services/reportCardService.ts', 'utf-8');

content = content.replace(/GDC-logo.png/g, 'GDC-LOGO.png');
content = content.replace(/doc.text\('Roll Number:', 125, startY \+ 2\);/g, 'doc.text(\'Roll Number:\', 115, startY + 2);');
content = content.replace(/doc.text\('Academic Session:', 125, startY \+ 12\);/g, 'doc.text(\'Academic Session:\', 115, startY + 12);');

fs.writeFileSync('src/services/reportCardService.ts', content);
