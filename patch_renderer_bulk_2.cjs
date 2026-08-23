const fs = require('fs');
let content = fs.readFileSync('src/ui/appRenderer.ts', 'utf-8');

const targetListener = `    document.getElementById('btn_export_bulk_pdf')?.addEventListener('click', async () => {
      const btn = document.getElementById('btn_export_bulk_pdf');
      if (btn) btn.innerHTML = \`\${icons.loader} Generating...\`;
      await generateBulkReportCardPDF(pagedStudents, results);
      this.render(); // reset button text
    });`;
const replacementListener = `    document.getElementById('btn_export_bulk_pdf')?.addEventListener('click', async () => {
      const btn = document.getElementById('btn_export_bulk_pdf');
      const originalText = btn?.innerHTML;
      if (btn) btn.innerHTML = \`<span class="flex items-center justify-center gap-2">\${icons.loader} Generating...</span>\`;
      
      // If some students are selected, export only them. Otherwise export all currently filtered/passed students.
      let toExport = students;
      if (this.selectedStudentIds.size > 0) {
        toExport = students.filter(s => this.selectedStudentIds.has(s.id));
      }
      
      try {
        await generateBulkReportCardPDF(toExport, results);
      } catch (err) {
        console.error(err);
      } finally {
        this.render();
      }
    });`;
content = content.replace(targetListener, replacementListener);

fs.writeFileSync('src/ui/appRenderer.ts', content);
