const fs = require('fs');
let content = fs.readFileSync('src/ui/appRenderer.ts', 'utf-8');

const target = `    document.getElementById('sort_student_field')?.addEventListener('change', (e) => {
      this.studentSortField = (e.target as HTMLSelectElement).value as any;
      this.render();
    });`;

const replacement = `    document.getElementById('sort_student_field')?.addEventListener('change', (e) => {
      this.studentSortField = (e.target as HTMLSelectElement).value as any;
      this.render();
    });

    document.getElementById('filter_student_search')?.addEventListener('input', (e) => {
      this.studentLocalSearch = (e.target as HTMLInputElement).value;
      this.render();
    });`;

content = content.replace(target, replacement);
fs.writeFileSync('src/ui/appRenderer.ts', content);
