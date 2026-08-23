const fs = require('fs');
let content = fs.readFileSync('src/ui/appRenderer.ts', 'utf-8');

// 1. Add import
if (!content.includes('generateBulkReportCardPDF')) {
  content = content.replace(
    /import \{ exportStudentsToCSV \} from '\.\.\/services\/exportService';/,
    "import { exportStudentsToCSV } from '../services/exportService';\nimport { generateBulkReportCardPDF } from '../services/reportCardService';"
  );
}

// 2. Add button
const targetButtonArea = `          <div class="flex items-center gap-2">
            <button id="btn_export_csv_master" class="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-xl hover:bg-slate-50 transition-colors shadow-sm">
              \${icons.download}
              <span>Export CSV Matrix</span>
            </button>
            <button id="btn_add_student_manual"`;
const replacementButtonArea = `          <div class="flex items-center gap-2">
            <button id="btn_export_bulk_pdf" class="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sky-600 dark:text-sky-400 rounded-xl hover:bg-slate-50 transition-colors shadow-sm">
              \${icons.fileText}
              <span>Export Bulk PDF</span>
            </button>
            <button id="btn_export_csv_master" class="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-xl hover:bg-slate-50 transition-colors shadow-sm">
              \${icons.download}
              <span>Export CSV Matrix</span>
            </button>
            <button id="btn_add_student_manual"`;
content = content.replace(targetButtonArea, replacementButtonArea);

// 3. Add Event Listener
const targetListener = `    document.getElementById('btn_export_csv_master')?.addEventListener('click', () => {
      exportStudentsToCSV(students, subjects, results, this.settings);
    });`;
const replacementListener = `    document.getElementById('btn_export_csv_master')?.addEventListener('click', () => {
      exportStudentsToCSV(students, subjects, results, this.settings);
    });

    document.getElementById('btn_export_bulk_pdf')?.addEventListener('click', async () => {
      const btn = document.getElementById('btn_export_bulk_pdf');
      if (btn) btn.innerHTML = \`\${icons.loader} Generating...\`;
      await generateBulkReportCardPDF(pagedStudents, results);
      this.render(); // reset button text
    });`;
content = content.replace(targetListener, replacementListener);

fs.writeFileSync('src/ui/appRenderer.ts', content);
