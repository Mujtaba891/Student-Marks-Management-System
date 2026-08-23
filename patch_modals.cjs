const fs = require('fs');
let code = fs.readFileSync('src/ui/modals.ts', 'utf8');

code = code.replace(
  /let workingMappings = JSON\.parse\(JSON\.stringify\(parsedData\.columnMappings\)\) as ColumnMapping\[\];/g,
  "let workingMappings = JSON.parse(JSON.stringify(parsedData.columnMappings || [])) as ColumnMapping[];"
);

fs.writeFileSync('src/ui/modals.ts', code);
