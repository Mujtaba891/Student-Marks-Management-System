const fs = require('fs');
const file = 'src/ui/appRenderer.ts';
let code = fs.readFileSync(file, 'utf8');

const oldStudentBtns = `          <div class="flex items-center gap-2">
            <button id="btn_export_csv_master" class="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-xl hover:bg-slate-50 transition-colors shadow-sm">
              \${icons.download}
              <span>Export CSV Matrix</span>
            </button>
            <button id="btn_add_student_manual" class="flex items-center gap-1.5 px-3 py-2 text-xs font-bold bg-sky-600 hover:bg-sky-500 text-white rounded-xl shadow-md transition-all">
              \${icons.userPlus}
              <span>Add Student</span>
            </button>
          </div>`;

const newStudentBtns = `          <div class="flex items-center gap-2">
            <button id="btn_export_csv_master" class="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-xl hover:bg-slate-50 transition-colors shadow-sm">
              \${icons.download}
              <span>Export CSV Matrix</span>
            </button>
            <button id="btn_ai_magic_import" class="flex items-center gap-1.5 px-3 py-2 text-xs font-bold bg-amber-500 hover:bg-amber-400 text-white rounded-xl shadow-md transition-all animate-pulse">
              \${icons.sparkles}
              <span>AI Smart Import</span>
            </button>
            <button id="btn_add_student_manual" class="flex items-center gap-1.5 px-3 py-2 text-xs font-bold bg-sky-600 hover:bg-sky-500 text-white rounded-xl shadow-md transition-all">
              \${icons.userPlus}
              <span>Batch Add</span>
            </button>
          </div>`;

code = code.replace(oldStudentBtns, newStudentBtns);


const oldStudentEvents = `    document.getElementById('btn_export_csv_master')?.addEventListener('click', () => {
      this.exportStudentMasterCSV();
    });
    
    document.getElementById('btn_add_student_manual')?.addEventListener('click', () => {
      this.openAddStudentManualModal();
    });`;

const newStudentEvents = `    document.getElementById('btn_export_csv_master')?.addEventListener('click', () => {
      this.exportStudentMasterCSV();
    });
    
    document.getElementById('btn_ai_magic_import')?.addEventListener('click', () => {
      this.openAiMagicImportModal();
    });
    
    document.getElementById('btn_add_student_manual')?.addEventListener('click', () => {
      this.openAddStudentManualModal();
    });`;

code = code.replace(oldStudentEvents, newStudentEvents);

fs.writeFileSync(file, code);
