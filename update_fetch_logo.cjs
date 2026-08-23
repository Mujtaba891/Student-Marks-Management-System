const fs = require('fs');
let code = fs.readFileSync('src/services/reportCardService.ts', 'utf8');

code = code.replace(
  /const logoBase64 = await getBase64ImageFromUrl\('\/GDC-logo\.png'\);/g,
  "let logoBase64 = await getBase64ImageFromUrl('/GDC-logo.png');\n  if (!logoBase64) logoBase64 = await getBase64ImageFromUrl('/src/public/GDC-logo.png');\n  if (!logoBase64) logoBase64 = await getBase64ImageFromUrl('/public/GDC-logo.png');"
);

fs.writeFileSync('src/services/reportCardService.ts', code);
