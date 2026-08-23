const fs = require('fs');
let content = fs.readFileSync('src/ui/appRenderer.ts', 'utf-8');

const target = `<div class="flex items-center gap-2 flex-1">
            <select id="filter_student_subject" class="text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 focus:ring-2 focus:ring-sky-500 focus:outline-none">
              <option value="">All Subjects (\${subjects.length})</option>
              \${subjects.map(sub => \`<option value="\${sub.id}" \${this.subjectFilter === sub.id ? 'selected' : ''}>\${sub.name}</option>\`).join('')}
            </select>
            <span class="text-xs text-slate-500">Showing <strong>\${totalCount}</strong> students</span>
          </div>
          <div class="flex items-center gap-2">
            <label class="text-xs text-slate-500">Sort By:</label>
            <select id="sort_student_field" class="text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2">
              <option value="rollNumber" \${this.studentSortField === 'rollNumber' ? 'selected' : ''}>Roll Number</option>
              <option value="name" \${this.studentSortField === 'name' ? 'selected' : ''}>Student Name</option>
              <option value="studentId" \${this.studentSortField === 'studentId' ? 'selected' : ''}>Student ID</option>
            </select>
          </div>`;

const replacement = `<div class="flex flex-wrap items-center gap-2 flex-1">
            <input type="text" id="filter_student_search" placeholder="Filter by roll no, regd no, grade..." class="text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 focus:ring-2 focus:ring-sky-500 focus:outline-none w-full max-w-[220px]" value="\${this.studentLocalSearch || ''}" />
            <select id="filter_student_subject" class="text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 focus:ring-2 focus:ring-sky-500 focus:outline-none appearance-none bg-no-repeat bg-right pr-8" style="background-image: url('data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' fill=\\'none\\' viewBox=\\'0 0 24 24\\' stroke=\\'%236b7280\\'><path stroke-linecap=\\'round\\' stroke-linejoin=\\'round\\' stroke-width=\\'2\\' d=\\'M19 9l-7 7-7-7\\'/></svg>'); background-size: 16px;">
              <option value="">All Subjects (\${subjects.length})</option>
              \${subjects.map(sub => \`<option value="\${sub.id}" \${this.subjectFilter === sub.id ? 'selected' : ''}>\${sub.name}</option>\`).join('')}
            </select>
            <span class="text-xs text-slate-500">Showing <strong>\${totalCount}</strong> students</span>
          </div>
          <div class="flex items-center gap-2">
            <label class="text-xs text-slate-500">Sort By:</label>
            <select id="sort_student_field" class="text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 focus:ring-2 focus:ring-sky-500 focus:outline-none appearance-none bg-no-repeat bg-right pr-8" style="background-image: url('data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' fill=\\'none\\' viewBox=\\'0 0 24 24\\' stroke=\\'%236b7280\\'><path stroke-linecap=\\'round\\' stroke-linejoin=\\'round\\' stroke-width=\\'2\\' d=\\'M19 9l-7 7-7-7\\'/></svg>'); background-size: 16px;">
              <option value="rollNumber" \${this.studentSortField === 'rollNumber' ? 'selected' : ''}>Roll Number</option>
              <option value="name" \${this.studentSortField === 'name' ? 'selected' : ''}>Student Name</option>
              <option value="studentId" \${this.studentSortField === 'studentId' ? 'selected' : ''}>Student ID</option>
              <option value="percentage" \${this.studentSortField === 'percentage' ? 'selected' : ''}>Percentage</option>
              <option value="grade" \${this.studentSortField === 'grade' ? 'selected' : ''}>Grade</option>
            </select>
          </div>`;

content = content.replace(target, replacement);
fs.writeFileSync('src/ui/appRenderer.ts', content);
