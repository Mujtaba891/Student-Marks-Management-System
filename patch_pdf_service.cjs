const fs = require('fs');
let content = fs.readFileSync('src/services/reportCardService.ts', 'utf-8');

// Replace export async function generateReportCardPDF
const newCode = `
export async function generateBulkReportCardPDF(students: Student[], allResults: Result[]) {
  if (!students || students.length === 0) return;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  let logoBase64 = await getBase64ImageFromUrl('/GDC-LOGO.png');
  if (!logoBase64) logoBase64 = await getBase64ImageFromUrl('/src/public/GDC-LOGO.png');
  if (!logoBase64) logoBase64 = await getBase64ImageFromUrl('/public/GDC-LOGO.png');

  for (let i = 0; i < students.length; i++) {
    if (i > 0) {
      doc.addPage();
    }
    const student = students[i];
    const results = allResults.filter(r => r.studentId === student.id);
    drawReportCardPage(doc, student, results, logoBase64);
  }

  doc.save('Bulk_ReportCards.pdf');
}

function drawReportCardPage(doc: any, student: Student, results: Result[], logoBase64: string | null) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Draw Page Border
  doc.setDrawColor(30, 58, 138); // blue-900
  doc.setLineWidth(1);
  doc.rect(10, 10, pageWidth - 20, pageHeight - 20);
  doc.setLineWidth(0.3);
  doc.rect(12, 12, pageWidth - 24, pageHeight - 24);

  // Header Background
  doc.setFillColor(30, 58, 138); // blue-900
  doc.rect(12, 12, pageWidth - 24, 35, 'F');

  let textStartX = 105;
  if (logoBase64) {
    // Add Logo
    doc.addImage(logoBase64, 'PNG', 20, 15, 25, 25);
    textStartX = 122; // Shift text slightly to the right if logo exists, or center it anyway
    
    // Watermark
    doc.setGState(new (doc as any).GState({ opacity: 0.05 }));
    doc.addImage(logoBase64, 'PNG', 50, 100, 110, 110);
    doc.setGState(new (doc as any).GState({ opacity: 1.0 }));
  }

  // College Header
  doc.setFontSize(24); // slightly larger for times
  doc.setTextColor(255, 215, 0); // golden colored
  doc.setFont('times', 'bolditalic'); // curvy font
  doc.text('Govt. SHMM Degree College Anantnag', textStartX, 28, { align: 'center' });
  
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(219, 234, 254); // blue-100
  doc.text('Official Academic Performance Report', textStartX, 36, { align: 'center' });

  // Student Details Section (Card-like look)
  const startY = 60;
  
  doc.setDrawColor(203, 213, 225); // slate-300
  doc.setFillColor(248, 250, 252); // slate-50
  doc.roundedRect(20, startY - 5, pageWidth - 40, 25, 3, 3, 'FD');

  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42); // slate-900
  doc.setFont('helvetica', 'bold');
  
  doc.text('Student Name:', 25, startY + 2);
  doc.setFont('helvetica', 'normal');
  doc.text(\`\${student.name || 'N/A'}\`, 60, startY + 2);
  
  doc.setFont('helvetica', 'bold');
  doc.text('Roll Number:', 115, startY + 2);
  doc.setFont('helvetica', 'normal');
  doc.text(\`\${student.rollNumber || 'N/A'}\`, 160, startY + 2);

  doc.setFont('helvetica', 'bold');
  doc.text('Student ID:', 25, startY + 12);
  doc.setFont('helvetica', 'normal');
  doc.text(\`\${student.studentId || 'N/A'}\`, 60, startY + 12);
  
  doc.setFont('helvetica', 'bold');
  doc.text('Academic Session:', 115, startY + 12);
  doc.setFont('helvetica', 'normal');
  doc.text(\`2023-2024\`, 160, startY + 12); // Fallback to current year or static

  // Marks Table
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 58, 138); // blue-900
  doc.text('Academic Record', 20, startY + 35);

  const tableData: string[][] = [];
  let totalMarks = 0;
  let totalMaxMarks = 0;
  let passedSubjects = 0;
  const attemptedSubjects = results.length;

  results.forEach(m => {
    const subName = m.subjectName || m.subjectId;
    const maxMarks = m.maxMarks || 100;
    
    // Check if absent or invalid
    let valStr = String(m.marks).toUpperCase();
    let isNumeric = !isNaN(Number(m.marks));
    
    if (isNumeric) {
      totalMarks += Number(m.marks);
      totalMaxMarks += maxMarks;
      // Basic passing criteria (assuming 35%)
      if (Number(m.marks) >= (maxMarks * 0.35)) {
        passedSubjects++;
      }
    } else {
      totalMaxMarks += maxMarks; // still add to max marks even if absent
    }

    tableData.push([
      subName,
      maxMarks.toString(),
      valStr
    ]);
  });

  autoTable(doc, {
    startY: startY + 40,
    head: [['Subject / Course Title', 'Maximum Marks', 'Marks Obtained']],
    body: tableData,
    theme: 'grid',
    headStyles: { fillColor: [30, 58, 138], textColor: 255, fontStyle: 'bold', halign: 'center' },
    bodyStyles: { halign: 'center' },
    columnStyles: {
      0: { halign: 'left' }
    },
    styles: { font: 'helvetica', fontSize: 11, cellPadding: 6, lineColor: [203, 213, 225], lineWidth: 0.1 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: 20, right: 20 }
  });

  // Summary & Performance
  const finalY = (doc as any).lastAutoTable.finalY + 15;
  
  // Draw summary box
  doc.setDrawColor(30, 58, 138);
  doc.setFillColor(239, 246, 255); // blue-50
  doc.roundedRect(20, finalY, pageWidth - 40, 35, 3, 3, 'FD');

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 58, 138); // blue-900
  doc.text('Performance Summary', 25, finalY + 8);
  
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(15, 23, 42);
  
  const percentage = totalMaxMarks > 0 ? ((totalMarks / totalMaxMarks) * 100).toFixed(2) : '0.00';
  let grade = 'F';
  const pct = Number(percentage);
  if (pct >= 90) grade = 'O';
  else if (pct >= 80) grade = 'A+';
  else if (pct >= 70) grade = 'A';
  else if (pct >= 60) grade = 'B+';
  else if (pct >= 50) grade = 'B';
  else if (pct >= 40) grade = 'C';
  else if (pct >= 35) grade = 'P';

  const isPass = attemptedSubjects > 0 && passedSubjects === attemptedSubjects;
  const statusStr = isPass ? 'PASS' : 'FAIL';

  doc.text(\`Total Marks:\`, 25, finalY + 18);
  doc.setFont('helvetica', 'bold');
  doc.text(\`\${totalMarks} / \${totalMaxMarks}\`, 60, finalY + 18);
  
  doc.setFont('helvetica', 'normal');
  doc.text(\`Percentage:\`, 110, finalY + 18);
  doc.setFont('helvetica', 'bold');
  doc.text(\`\${percentage}%\`, 140, finalY + 18);

  doc.setFont('helvetica', 'normal');
  doc.text(\`Overall Grade:\`, 25, finalY + 28);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 58, 138);
  doc.text(\`\${grade}\`, 60, finalY + 28);
  
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(15, 23, 42);
  doc.text(\`Result Status:\`, 110, finalY + 28);
  doc.setFont('helvetica', 'bold');
  if (isPass) {
    doc.setTextColor(22, 163, 74); // green-600
  } else {
    doc.setTextColor(220, 38, 38); // red-600
  }
  doc.text(\`\${statusStr}\`, 140, finalY + 28);

  // Footer Signatures
  doc.setTextColor(15, 23, 42);
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.3);
  
  const footerY = pageHeight - 40;
  
  doc.line(30, footerY, 80, footerY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Prepared By', 55, footerY + 6, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text('Class Teacher / Controller', 55, footerY + 11, { align: 'center' });

  doc.setDrawColor(15, 23, 42);
  doc.setTextColor(15, 23, 42);
  doc.line(130, footerY, 180, footerY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Principal', 155, footerY + 6, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text('Govt. SHMM Degree College Anantnag', 155, footerY + 11, { align: 'center' });
  
  // Date of Issue
  const today = new Date().toLocaleDateString('en-GB');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(\`Date of Issue: \${today}\`, 20, pageHeight - 15);
  doc.text(\`Generated via MarksMaster System\`, pageWidth - 20, pageHeight - 15, { align: 'right' });
}

export async function generateReportCardPDF(student: Student, results: Result[]) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  let logoBase64 = await getBase64ImageFromUrl('/GDC-LOGO.png');
  if (!logoBase64) logoBase64 = await getBase64ImageFromUrl('/src/public/GDC-LOGO.png');
  if (!logoBase64) logoBase64 = await getBase64ImageFromUrl('/public/GDC-LOGO.png');

  drawReportCardPage(doc, student, results, logoBase64);

  // Save the PDF
  const safeName = student.name ? student.name.replace(/[^a-z0-9]/gi, '_').toLowerCase() : student.id;
  doc.save(\`ReportCard_\${safeName}.pdf\`);
}
`

const matchStart = 'export async function generateReportCardPDF(student: Student, results: Result[]) {';
const startIndex = content.indexOf(matchStart);

content = content.substring(0, startIndex) + newCode;

fs.writeFileSync('src/services/reportCardService.ts', content);
