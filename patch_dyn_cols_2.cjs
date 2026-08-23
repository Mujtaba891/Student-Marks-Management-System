const fs = require('fs');
const file = 'src/ui/appRenderer.ts';
let code = fs.readFileSync(file, 'utf8');

const tableHeaderBlock = `        <div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full border-collapse">
              <thead>
                <tr class="bg-slate-50 dark:bg-slate-800/80 text-[11px] uppercase tracking-wider text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                  <th class="w-10 px-3 py-2 md:py-3 text-center">
                    <input type="checkbox" id="chk_select_all_students" class="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-sky-600 focus:ring-sky-500 cursor-pointer" \${allSelected ? 'checked' : ''} />
                  </th>
                  <th class="px-3 py-2 md:py-3 text-center font-semibold">#</th>
                  <th class="px-4 py-2 md:py-3 text-left font-semibold cursor-pointer group" id="sort_student_name">
                    <div class="flex items-center gap-1">
                      Name \${this.studentSortField === 'name' ? (this.studentSortAsc ? icons.chevronUp : icons.chevronDown) : ''}
                    </div>
                  </th>
                  <th class="px-4 py-2 md:py-3 text-left font-semibold cursor-pointer group" id="sort_student_roll">
                    <div class="flex items-center gap-1">
                      Roll Number \${this.studentSortField === 'rollNumber' ? (this.studentSortAsc ? icons.chevronUp : icons.chevronDown) : ''}
                    </div>
                  </th>
                  <th class="px-4 py-2 md:py-3 text-left font-semibold cursor-pointer group" id="sort_student_id">
                    <div class="flex items-center gap-1">
                      Student ID \${this.studentSortField === 'studentId' ? (this.studentSortAsc ? icons.chevronUp : icons.chevronDown) : ''}
                    </div>
                  </th>
                  <th class="px-4 py-2 md:py-3 text-center font-semibold">Subjects</th>
                  <th class="px-4 py-2 md:py-3 text-center font-semibold">Total Marks</th>
                  <th class="px-4 py-2 md:py-3 text-center font-semibold">Average %</th>
                  <th class="px-4 py-2 md:py-3 text-center font-semibold">Grade</th>
                  <th class="px-4 py-2 md:py-3 text-left font-semibold">AI Action</th>
                  <th class="px-4 py-2 md:py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>`;

const newTableHeaderBlock = `        <div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full border-collapse">
              <thead>
                <tr class="bg-slate-50 dark:bg-slate-800/80 text-[11px] uppercase tracking-wider text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                  <th class="w-10 px-3 py-2 md:py-3 text-center">
                    <input type="checkbox" id="chk_select_all_students" class="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-sky-600 focus:ring-sky-500 cursor-pointer" \${allSelected ? 'checked' : ''} />
                  </th>
                  <th class="px-3 py-2 md:py-3 text-center font-semibold">#</th>
                  <th class="px-4 py-2 md:py-3 text-left font-semibold cursor-pointer group" id="sort_student_name">
                    <div class="flex items-center gap-1">
                      Name \${this.studentSortField === 'name' ? (this.studentSortAsc ? icons.chevronUp : icons.chevronDown) : ''}
                    </div>
                  </th>
                  <th class="px-4 py-2 md:py-3 text-left font-semibold cursor-pointer group" id="sort_student_roll">
                    <div class="flex items-center gap-1">
                      Roll Number \${this.studentSortField === 'rollNumber' ? (this.studentSortAsc ? icons.chevronUp : icons.chevronDown) : ''}
                    </div>
                  </th>
                  <th class="px-4 py-2 md:py-3 text-left font-semibold cursor-pointer group" id="sort_student_id">
                    <div class="flex items-center gap-1">
                      Student ID \${this.studentSortField === 'studentId' ? (this.studentSortAsc ? icons.chevronUp : icons.chevronDown) : ''}
                    </div>
                  </th>
                  \${dynamicColumns.map(col => \`<th class="px-4 py-2 md:py-3 text-center font-semibold text-amber-600 dark:text-amber-400">\${col}</th>\`).join('')}
                  <th class="px-4 py-2 md:py-3 text-center font-semibold">Subjects</th>
                  <th class="px-4 py-2 md:py-3 text-center font-semibold">Total Marks</th>
                  <th class="px-4 py-2 md:py-3 text-center font-semibold">Average %</th>
                  <th class="px-4 py-2 md:py-3 text-center font-semibold">Grade</th>
                  <th class="px-4 py-2 md:py-3 text-left font-semibold">AI Action</th>
                  <th class="px-4 py-2 md:py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>`;


const oldRowBlock = `          <td class="px-4 py-2 md:py-3 font-mono font-semibold text-slate-700 dark:text-slate-300">\${s.rollNumber}</td>
          <td class="px-4 py-2 md:py-3 font-mono text-slate-600 dark:text-slate-400">\${s.studentId}</td>
          <td class="px-4 py-2 md:py-3 text-center">
            <span class="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 font-semibold text-slate-700 dark:text-slate-300">
              \${sResults.length}
            </span>
          </td>`;

const newRowBlock = `          <td class="px-4 py-2 md:py-3 font-mono font-semibold text-slate-700 dark:text-slate-300">\${s.rollNumber}</td>
          <td class="px-4 py-2 md:py-3 font-mono text-slate-600 dark:text-slate-400">\${s.studentId}</td>
          \${dynamicColumns.map(col => \`<td class="px-4 py-2 md:py-3 text-center font-medium text-amber-700 dark:text-amber-300">\${s.dynamicFields?.[col] || '-'}</td>\`).join('')}
          <td class="px-4 py-2 md:py-3 text-center">
            <span class="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 font-semibold text-slate-700 dark:text-slate-300">
              \${sResults.length}
            </span>
          </td>`;


const dynamicColSetup = `    // Build Results Map for fast lookup
    const resultMap = new Map<string, Result[]>();
    for (const r of results) {
      if (!resultMap.has(r.studentId)) resultMap.set(r.studentId, []);
      resultMap.get(r.studentId)!.push(r);
    }`;

const dynamicColSetupNew = `    // Build Results Map for fast lookup
    const resultMap = new Map<string, Result[]>();
    for (const r of results) {
      if (!resultMap.has(r.studentId)) resultMap.set(r.studentId, []);
      resultMap.get(r.studentId)!.push(r);
    }
    
    // Extract unique dynamic fields from all students
    const dynamicFieldsSet = new Set<string>();
    filteredStudents.forEach(s => {
      if (s.dynamicFields) {
        Object.keys(s.dynamicFields).forEach(k => dynamicFieldsSet.add(k));
      }
    });
    const dynamicColumns = Array.from(dynamicFieldsSet);
`;


code = code.replace(dynamicColSetup, dynamicColSetupNew);
code = code.replace(tableHeaderBlock, newTableHeaderBlock);
code = code.replace(oldRowBlock, newRowBlock);


fs.writeFileSync(file, code);
