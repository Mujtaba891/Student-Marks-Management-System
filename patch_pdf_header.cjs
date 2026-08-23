const fs = require('fs');
let content = fs.readFileSync('src/services/reportCardService.ts', 'utf-8');

const targetHeader = `  // College Header
  doc.setFontSize(22);
  doc.setTextColor(255, 255, 255); // white
  doc.setFont('helvetica', 'bold');
  doc.text('Govt. SHMM Degree College Anantnag', 105, 28, { align: 'center' });
  
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(219, 234, 254); // blue-100
  doc.text('Official Academic Performance Report', 105, 36, { align: 'center' });`;

const replacementHeader = `  // College Header
  doc.setFontSize(24); // slightly larger for times
  doc.setTextColor(255, 215, 0); // golden colored
  doc.setFont('times', 'bolditalic'); // curvy font
  doc.text('Govt. SHMM Degree College Anantnag', textStartX, 28, { align: 'center' });
  
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(219, 234, 254); // blue-100
  doc.text('Official Academic Performance Report', textStartX, 36, { align: 'center' });`;

content = content.replace(targetHeader, replacementHeader);

const targetLogoShift = `textStartX = 120;`;
const replacementLogoShift = `textStartX = 122;`;
content = content.replace(targetLogoShift, replacementLogoShift);

fs.writeFileSync('src/services/reportCardService.ts', content);
