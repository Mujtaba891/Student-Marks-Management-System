const fs = require('fs');
let content = fs.readFileSync('src/ui/appRenderer.ts', 'utf-8');

const target = `<div class="p-3 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div class="flex items-center gap-2 flex-1">
            <select id="filter_student_subject"`;

const replacement = `<div class="p-3 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div class="flex flex-wrap items-center gap-2 flex-1">
            <input type="text" id="filter_student_search" placeholder="Filter by roll no, percentage, grade..." class="text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 focus:ring-2 focus:ring-sky-500 focus:outline-none w-full max-w-[220px]" value="\${this.studentLocalSearch || ''}" />
            <select id="filter_student_subject"`;

content = content.replace(target, replacement);

const targetOptions = `<option value="studentId" \${this.studentSortField === 'studentId' ? 'selected' : ''}>Student ID</option>
            </select>`;
            
const replacementOptions = `<option value="studentId" \${this.studentSortField === 'studentId' ? 'selected' : ''}>Student ID</option>
              <option value="percentage" \${this.studentSortField === 'percentage' ? 'selected' : ''}>Percentage</option>
              <option value="grade" \${this.studentSortField === 'grade' ? 'selected' : ''}>Grade</option>
            </select>`;

content = content.replace(targetOptions, replacementOptions);

fs.writeFileSync('src/ui/appRenderer.ts', content);
