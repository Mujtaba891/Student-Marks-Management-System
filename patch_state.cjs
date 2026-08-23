const fs = require('fs');
let content = fs.readFileSync('src/ui/appRenderer.ts', 'utf-8');

content = content.replace(`private studentSortField: 'name' | 'rollNumber' | 'studentId' | 'average' | 'subjectsCount' = 'rollNumber';`, `private studentSortField: string = 'rollNumber';\n  private studentLocalSearch: string = '';`);

fs.writeFileSync('src/ui/appRenderer.ts', content);
