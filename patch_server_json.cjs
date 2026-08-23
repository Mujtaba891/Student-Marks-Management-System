const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

code = code.replace(
  /parsedData = JSON\.parse\(extractedText\);/g,
  "parsedData = JSON.parse(extractedText.replace(/^```json\\s*/i, '').replace(/```$/, '').trim());"
);

code = code.replace(
  /return res\.json\(JSON\.parse\(extractedText\)\);/g,
  "return res.json(JSON.parse(extractedText.replace(/^```json\\s*/i, '').replace(/```$/, '').trim()));"
);

fs.writeFileSync('server.ts', code);
