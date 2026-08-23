const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

code = code.replace(
  /const MODEL_CANDIDATES = \['gemini-2\.5-flash', 'gemini-3\.7-flash', 'gemini-2\.5-pro'\];/g,
  "const MODEL_CANDIDATES = ['gemini-3.1-pro-preview', 'gemini-2.5-flash'];"
);

code = code.replace(
  /const MODEL_CANDIDATES = \['gemini-2\.5-flash', 'gemini-3\.7-flash'\];/g,
  "const MODEL_CANDIDATES = ['gemini-3.1-pro-preview', 'gemini-2.5-flash'];"
);

fs.writeFileSync('server.ts', code);
