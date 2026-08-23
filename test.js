const fs = require('fs');
console.log(fs.readFileSync('src/ui/appRenderer.ts', 'utf8').match(/setTab\(tab: ActiveTab\) \{[\s\S]*?\}/)[0]);
