import { jsPDF } from 'jspdf';

export interface SamplePdfConfig {
  fileName: string;
  subjectName: string;
  headers: {
    name: string;
    roll: string;
    id: string;
    marks: string;
  };
  students: Array<{
    name: string;
    roll: string;
    id: string;
    marks: number | string;
  }>;
}

export const PRESET_SAMPLE_PDFS: SamplePdfConfig[] = [
  {
    fileName: 'Geology.pdf',
    subjectName: 'Geology',
    headers: {
      name: 'Student',
      roll: 'Roll No',
      id: 'Regd No',
      marks: 'Marks'
    },
    students: [
      { name: 'Ahmad Dar', roll: '101', id: 'REG202601', marks: 78 },
      { name: 'Bilal Khan', roll: '102', id: 'REG202602', marks: 82 },
      { name: 'Zoya Fatima', roll: '103', id: 'REG202603', marks: 91 },
      { name: 'Tariq Mehmood', roll: '104', id: 'REG202604', marks: 68 },
      { name: 'Sana Malik', roll: '105', id: 'REG202605', marks: 88 },
      { name: 'Farhan Ali', roll: '106', id: 'REG202606', marks: 74 },
      { name: 'Ayesha Siddiqua', roll: '107', id: 'REG202607', marks: 95 },
      { name: 'Hamza Sheikh', roll: '108', id: 'REG202608', marks: 63 },
      { name: 'Mariam Noor', roll: '109', id: 'REG202609', marks: 85 },
      { name: 'Usman Ghani', roll: '110', id: 'REG202610', marks: 79 }
    ]
  },
  {
    fileName: 'English.pdf',
    subjectName: 'English',
    headers: {
      name: 'Candidate Name',
      roll: 'Examination Roll Number',
      id: 'Registration Number',
      marks: 'Total'
    },
    students: [
      { name: 'Ahmad Dar', roll: '101', id: 'REG202601', marks: 71 },
      { name: 'Bilal Khan', roll: '102', id: 'REG202602', marks: 75 },
      { name: 'Zoya Fatima', roll: '103', id: 'REG202603', marks: 84 },
      { name: 'Tariq Mehmood', roll: '104', id: 'REG202604', marks: 70 },
      { name: 'Sana Malik', roll: '105', id: 'REG202605', marks: 92 },
      { name: 'Farhan Ali', roll: '106', id: 'REG202606', marks: 69 },
      { name: 'Ayesha Siddiqua', roll: '107', id: 'REG202607', marks: 89 },
      { name: 'Hamza Sheikh', roll: '108', id: 'REG202608', marks: 58 },
      { name: 'Mariam Noor', roll: '109', id: 'REG202609', marks: 90 },
      { name: 'Usman Ghani', roll: '110', id: 'REG202610', marks: 81 }
    ]
  },
  {
    fileName: 'Computer_Science.pdf',
    subjectName: 'Computer Science',
    headers: {
      name: "Student's Name",
      roll: 'Roll#',
      id: 'Enrollment No',
      marks: 'Marks Obtained'
    },
    students: [
      { name: 'Ahmad Dar', roll: '101', id: 'REG202601', marks: 84 },
      { name: 'Bilal Khan', roll: '102', id: 'REG202602', marks: 89 },
      { name: 'Zoya Fatima', roll: '103', id: 'REG202603', marks: 96 },
      { name: 'Tariq Mehmood', roll: '104', id: 'REG202604', marks: 75 },
      { name: 'Sana Malik', roll: '105', id: 'REG202605', marks: 94 },
      { name: 'Farhan Ali', roll: '106', id: 'REG202606', marks: 80 },
      { name: 'Ayesha Siddiqua', roll: '107', id: 'REG202607', marks: 98 },
      { name: 'Hamza Sheikh', roll: '108', id: 'REG202608', marks: 66 },
      { name: 'Mariam Noor', roll: '109', id: 'REG202609', marks: 88 },
      { name: 'Usman Ghani', roll: '110', id: 'REG202610', marks: 86 }
    ]
  },
  {
    fileName: 'Environmental_Science.pdf',
    subjectName: 'Environmental Science',
    headers: {
      name: 'Name of Student',
      roll: 'Exam Roll No',
      id: 'Registration ID',
      marks: 'Score'
    },
    students: [
      { name: 'Ahmad Dar', roll: '101', id: 'REG202601', marks: 76 },
      { name: 'Bilal Khan', roll: '102', id: 'REG202602', marks: 80 },
      { name: 'Zoya Fatima', roll: '103', id: 'REG202603', marks: 89 },
      { name: 'Tariq Mehmood', roll: '104', id: 'REG202604', marks: 72 },
      { name: 'Sana Malik', roll: '105', id: 'REG202605', marks: 87 },
      { name: 'Farhan Ali', roll: '106', id: 'REG202606', marks: 78 },
      { name: 'Ayesha Siddiqua', roll: '107', id: 'REG202607', marks: 93 },
      { name: 'Hamza Sheikh', roll: '108', id: 'REG202608', marks: 61 },
      { name: 'Mariam Noor', roll: '109', id: 'REG202609', marks: 84 },
      { name: 'Usman Ghani', roll: '110', id: 'REG202610', marks: 77 }
    ]
  }
];

export function generateSamplePdfFile(config: SamplePdfConfig): File {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4'
  });

  // Header Banner
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(30, 41, 59);
  doc.text('DEPARTMENT OF ACADEMIC EXAMINATIONS', 40, 50);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  doc.setTextColor(71, 85, 105);
  doc.text(`Subject: ${config.subjectName} (Session 2025-2026)`, 40, 70);
  doc.text(`Official Tabulation Sheet - ${config.fileName}`, 40, 88);

  // Divider Line
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(1);
  doc.line(40, 100, 555, 100);

  // Table Headers
  const startY = 125;
  const colX = {
    name: 40,
    roll: 210,
    id: 340,
    marks: 480
  };

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);

  doc.text(config.headers.name, colX.name, startY);
  doc.text(config.headers.roll, colX.roll, startY);
  doc.text(config.headers.id, colX.id, startY);
  doc.text(config.headers.marks, colX.marks, startY);

  // Header underline
  doc.setDrawColor(148, 163, 184);
  doc.line(40, startY + 6, 555, startY + 6);

  // Table Rows
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(51, 65, 85);

  let currentY = startY + 24;
  for (const student of config.students) {
    doc.text(student.name, colX.name, currentY);
    doc.text(String(student.roll), colX.roll, currentY);
    doc.text(student.id, colX.id, currentY);
    doc.text(String(student.marks), colX.marks, currentY);

    // subtle row divider
    doc.setDrawColor(241, 245, 249);
    doc.line(40, currentY + 4, 555, currentY + 4);

    currentY += 20;
  }

  // Footer
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text('Authorized Signature: _______________________', 40, currentY + 40);
  doc.text('Controller of Examination', 400, currentY + 40);

  const pdfBlob = doc.output('blob');
  return new File([pdfBlob], config.fileName, { type: 'application/pdf' });
}
