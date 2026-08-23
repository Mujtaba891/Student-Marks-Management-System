const fs = require('fs');
let code = fs.readFileSync('src/ui/modals.ts', 'utf8');

code = code.replace(
  /generateReportCardPDF\(student, results\);/g,
  "generateReportCardPDF(student, results).catch(e => console.error('PDF Error:', e));"
);

fs.writeFileSync('src/ui/modals.ts', code);
