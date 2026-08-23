import { Student, Subject, Result, SystemSettings } from '../types';

export function exportStudentsToCSV(
  students: Student[],
  subjects: Subject[],
  results: Result[],
  settings: SystemSettings
): void {
  if (students.length === 0) return;

  // Gather all unique dynamic field keys across all students
  const dynamicKeysSet = new Set<string>();
  for (const s of students) {
    if (s.dynamicFields) {
      for (const k of Object.keys(s.dynamicFields)) {
        dynamicKeysSet.add(k);
      }
    }
  }
  const dynamicKeys = Array.from(dynamicKeysSet).sort();
  const dynamicHeaders = dynamicKeys.map(k => `"{${k}}"`);

  // Header row
  const subjectHeaders = subjects.map(s => `"${s.name.replace(/"/g, '""')}"`);
  const headers = [
    'Roll Number',
    'Student ID',
    'Student Name',
    ...dynamicHeaders,
    ...subjectHeaders,
    'Total Marks',
    'Max Marks',
    'Percentage (%)',
    'Overall Grade',
    'Subjects Count'
  ];

  const rows: string[] = [headers.join(',')];

  // Map results by studentId -> subjectId -> Result
  const resultMap = new Map<string, Map<string, Result>>();
  for (const r of results) {
    if (!resultMap.has(r.studentId)) {
      resultMap.set(r.studentId, new Map());
    }
    resultMap.get(r.studentId)!.set(r.subjectId, r);
  }

  for (const student of students) {
    const studentResults = resultMap.get(student.id) || new Map();
    let totalScore = 0;
    let totalMax = 0;
    let subjectCount = 0;

    const dynamicCells = dynamicKeys.map(k => {
      const val = student.dynamicFields?.[k] || '';
      return `"${val.replace(/"/g, '""')}"`;
    });

    const subjectCells = subjects.map(subject => {
      const res = studentResults.get(subject.id);
      if (!res) return '""';
      subjectCount++;
      if (typeof res.marks === 'number') {
        totalScore += res.marks;
        totalMax += res.maxMarks || subject.maxMarks || 100;
      }
      return `"${String(res.marks).replace(/"/g, '""')}"`;
    });

    const percentage = totalMax > 0 ? (Math.round((totalScore / totalMax) * 1000) / 10) : 0;
    let grade = 'N/A';
    if (percentage >= 90) grade = 'A+';
    else if (percentage >= 80) grade = 'A';
    else if (percentage >= 70) grade = 'B+';
    else if (percentage >= 60) grade = 'B';
    else if (percentage >= 50) grade = 'C';
    else if (percentage >= (settings.passPercentage || 40)) grade = 'D';
    else if (subjectCount > 0) grade = 'F';

    const row = [
      `"${student.rollNumber}"`,
      `"${student.studentId}"`,
      `"${student.name.replace(/"/g, '""')}"`,
      ...dynamicCells,
      ...subjectCells,
      totalScore,
      totalMax,
      percentage,
      `"${grade}"`,
      subjectCount
    ];

    rows.push(row.join(','));
  }

  const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + encodeURIComponent(rows.join('\n'));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute('href', csvContent);
  downloadAnchor.setAttribute(
    'download',
    `Student_Marks_Master_${new Date().toISOString().slice(0, 10)}.csv`
  );
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  document.body.removeChild(downloadAnchor);
}

export function exportSubjectMarksToCSV(
  subject: Subject,
  students: Student[],
  results: Result[]
): void {
  const subjectResults = results.filter(r => r.subjectId === subject.id);
  const studentMap = new Map(students.map(s => [s.id, s]));

  const headers = ['Roll No', 'Student ID', 'Student Name', 'Marks Obtained', 'Max Marks', 'Percentage', 'Grade', 'Source PDF', 'Import Date'];
  const rows = [headers.join(',')];

  for (const res of subjectResults) {
    const student = studentMap.get(res.studentId);
    const name = student ? student.name : 'Unknown Student';
    const roll = student ? student.rollNumber : 'N/A';
    const id = student ? student.studentId : 'N/A';
    const max = res.maxMarks || subject.maxMarks || 100;
    const pct = typeof res.marks === 'number' ? Math.round((res.marks / max) * 1000) / 10 : 'N/A';

    rows.push([
      `"${roll}"`,
      `"${id}"`,
      `"${name.replace(/"/g, '""')}"`,
      `"${String(res.marks).replace(/"/g, '""')}"`,
      max,
      pct,
      `"${res.grade || ''}"`,
      `"${res.sourceFile.replace(/"/g, '""')}"`,
      `"${new Date(res.importedAt).toLocaleDateString()}"`
    ].join(','));
  }

  const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + encodeURIComponent(rows.join('\n'));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute('href', csvContent);
  downloadAnchor.setAttribute(
    'download',
    `${subject.name.replace(/\s+/g, '_')}_Marks_${new Date().toISOString().slice(0, 10)}.csv`
  );
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  document.body.removeChild(downloadAnchor);
}

export function printStudentReport(
  student: Student,
  results: Result[],
  settings: SystemSettings
): void {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    window.print();
    return;
  }

  let totalMarks = 0;
  let totalMax = 0;
  let validCount = 0;

  const resultRows = results.map(r => {
    if (typeof r.marks === 'number') {
      totalMarks += r.marks;
      totalMax += r.maxMarks;
      validCount++;
    }
    return `
      <tr>
        <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0; font-weight: 500;">${r.subjectName}</td>
        <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0; text-align: center;">${r.marks}</td>
        <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0; text-align: center;">${r.maxMarks}</td>
        <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0; text-align: center;">${r.percentage !== undefined ? `${r.percentage}%` : '-'}</td>
        <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0; text-align: center; font-weight: 600;">${r.grade || '-'}</td>
        <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0; font-size: 11px; color: #64748b;">${r.sourceFile}</td>
      </tr>
    `;
  }).join('');

  const overallPct = totalMax > 0 ? Math.round((totalMarks / totalMax) * 1000) / 10 : 0;
  let overallGrade = 'N/A';
  if (overallPct >= 90) overallGrade = 'A+';
  else if (overallPct >= 80) overallGrade = 'A';
  else if (overallPct >= 70) overallGrade = 'B+';
  else if (overallPct >= 60) overallGrade = 'B';
  else if (overallPct >= 50) overallGrade = 'C';
  else if (overallPct >= (settings.passPercentage || 40)) overallGrade = 'D';
  else if (validCount > 0) overallGrade = 'F';

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Student Result Sheet - ${student.name} (${student.rollNumber})</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            color: #1e293b;
            padding: 30px 40px;
            max-width: 800px;
            margin: 0 auto;
          }
          .header {
            text-align: center;
            border-bottom: 2px solid #0f172a;
            padding-bottom: 20px;
            margin-bottom: 24px;
          }
          .inst-title {
            font-size: 20px;
            font-weight: 800;
            letter-spacing: 0.5px;
            text-transform: uppercase;
            margin: 0;
            color: #0f172a;
          }
          .report-subtitle {
            font-size: 13px;
            color: #475569;
            margin-top: 4px;
          }
          .meta-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 12px 24px;
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 16px 20px;
            margin-bottom: 24px;
          }
          .meta-item {
            font-size: 13px;
          }
          .meta-label {
            font-weight: 600;
            color: #64748b;
            margin-right: 8px;
          }
          .meta-value {
            font-weight: 600;
            color: #0f172a;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 24px;
            font-size: 13px;
          }
          th {
            background-color: #f1f5f9;
            color: #334155;
            text-align: left;
            padding: 10px 14px;
            border-bottom: 2px solid #cbd5e1;
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .summary-card {
            display: flex;
            justify-content: space-between;
            background: #f8fafc;
            border: 1px solid #cbd5e1;
            border-radius: 8px;
            padding: 14px 20px;
            margin-bottom: 40px;
          }
          .summary-stat {
            text-align: center;
          }
          .stat-label {
            font-size: 11px;
            text-transform: uppercase;
            color: #64748b;
            font-weight: 600;
          }
          .stat-val {
            font-size: 18px;
            font-weight: 700;
            color: #0f172a;
            margin-top: 2px;
          }
          .signatures {
            display: flex;
            justify-content: space-between;
            margin-top: 60px;
            padding-top: 20px;
          }
          .sig-line {
            width: 200px;
            border-top: 1px solid #94a3b8;
            text-align: center;
            padding-top: 6px;
            font-size: 12px;
            color: #475569;
          }
          .footer-note {
            text-align: center;
            font-size: 10px;
            color: #94a3b8;
            margin-top: 30px;
          }
          @media print {
            body { padding: 15px; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1 class="inst-title">${settings.institutionName}</h1>
          <div class="report-subtitle">OFFICIAL ACADEMIC STATEMENT OF MARKS • SESSION: ${settings.academicSession}</div>
        </div>

        <div class="meta-grid">
          <div class="meta-item"><span class="meta-label">Student Name:</span><span class="meta-value">${student.name}</span></div>
          <div class="meta-item"><span class="meta-label">Roll Number:</span><span class="meta-value">${student.rollNumber}</span></div>
          <div class="meta-item"><span class="meta-label">Student / Reg ID:</span><span class="meta-value">${student.studentId || 'N/A'}</span></div>
          <div class="meta-item"><span class="meta-label">Issue Date:</span><span class="meta-value">${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span></div>
          ${Object.entries(student.dynamicFields || {}).map(([k, v]) => `
            <div class="meta-item"><span class="meta-label">{${k}}:</span><span class="meta-value">${v}</span></div>
          `).join('')}
        </div>

        <table>
          <thead>
            <tr>
              <th>Subject Name</th>
              <th style="text-align: center;">Marks Obtained</th>
              <th style="text-align: center;">Max Marks</th>
              <th style="text-align: center;">Percentage</th>
              <th style="text-align: center;">Grade</th>
              <th>Source Reference</th>
            </tr>
          </thead>
          <tbody>
            ${resultRows || '<tr><td colspan="6" style="text-align: center; padding: 20px; color: #94a3b8;">No subject records found.</td></tr>'}
          </tbody>
        </table>

        <div class="summary-card">
          <div class="summary-stat">
            <div class="stat-label">Total Marks</div>
            <div class="stat-val">${totalMarks} / ${totalMax}</div>
          </div>
          <div class="summary-stat">
            <div class="stat-label">Subjects Evaluated</div>
            <div class="stat-val">${results.length}</div>
          </div>
          <div class="summary-stat">
            <div class="stat-label">Overall Percentage</div>
            <div class="stat-val">${overallPct}%</div>
          </div>
          <div class="summary-stat">
            <div class="stat-label">Final Grade</div>
            <div class="stat-val" style="color: ${overallGrade === 'F' ? '#e11d48' : '#0284c7'};">${overallGrade}</div>
          </div>
        </div>

        <div class="signatures">
          <div class="sig-line">Prepared & Verified By</div>
          <div class="sig-line">Controller of Examinations</div>
        </div>

        <div class="footer-note">
          Computer generated official record • Verified locally on ${new Date().toLocaleString()} • No external AI or cloud transmission.
        </div>

        <script>
          window.onload = function() {
            window.print();
          }
        </script>
      </body>
    </html>
  `;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}
