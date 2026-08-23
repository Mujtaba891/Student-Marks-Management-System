const fs = require('fs');
const file = 'src/ui/appRenderer.ts';
let code = fs.readFileSync(file, 'utf8');

const tableHeaderRegex = /<table class="w-full border-collapse">\s*<thead>\s*<tr[^>]*>\s*(<th[^>]*>.*?<\/th>\s*)*<\/tr>\s*<\/thead>/is;

const match = code.match(tableHeaderRegex);
if (!match) {
  console.error("Could not find table header in renderStudentsView!");
  process.exit(1);
}

const oldThead = match[0];
const newTheadCode = `    // Extract unique dynamic fields from all students to create dynamic columns
    const dynamicFieldsSet = new Set<string>();
    filteredStudents.forEach(s => {
      if (s.dynamicFields) {
        Object.keys(s.dynamicFields).forEach(k => dynamicFieldsSet.add(k));
      }
    });
    const dynamicColumns = Array.from(dynamicFieldsSet);

    const tableHeaders = \`
      <table class="w-full border-collapse">
        <thead>
          <tr class="bg-slate-50 dark:bg-slate-800/80 text-[11px] uppercase tracking-wider text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
            <th class="w-10 px-3 py-2 md:py-3 text-center">
              <input type="checkbox" id="chk_select_all_students" class="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-sky-600 focus:ring-sky-500 cursor-pointer" \${allSelected ? 'checked' : ''} />
            </th>
            <th class="px-3 py-2 md:py-3 text-center font-semibold">#</th>
            <th class="px-4 py-2 md:py-3 text-left font-semibold">Name</th>
            <th class="px-4 py-2 md:py-3 text-left font-semibold">Roll Number</th>
            <th class="px-4 py-2 md:py-3 text-left font-semibold">Student ID</th>
            \${dynamicColumns.map(col => \`<th class="px-4 py-2 md:py-3 text-center font-semibold text-amber-600 dark:text-amber-400">\${col}</th>\`).join('')}
            <th class="px-4 py-2 md:py-3 text-center font-semibold">Subjects</th>
            <th class="px-4 py-2 md:py-3 text-center font-semibold">Total Marks</th>
            <th class="px-4 py-2 md:py-3 text-center font-semibold">Average %</th>
            <th class="px-4 py-2 md:py-3 text-center font-semibold">Grade</th>
            <th class="px-4 py-2 md:py-3 text-left font-semibold">AI Action</th>
            <th class="px-4 py-2 md:py-3 text-right font-semibold">Actions</th>
          </tr>
        </thead>
    \`;`;

let replacement = code.replace(oldThead, '${tableHeaders}');
// Wait, we need to inject `const dynamicFieldsSet = ...` earlier in the function, before building the table rows.
