const fs = require('fs');
let content = fs.readFileSync('src/ui/appRenderer.ts', 'utf-8');

// 1. Remove AI Magic Import button
const targetAiButton = `            <button id="btn_ai_magic_import" class="flex items-center gap-1.5 px-3 py-2 text-xs font-bold bg-amber-500 hover:bg-amber-400 text-white rounded-xl shadow-md transition-all animate-pulse">
              \${icons.sparkles}
              <span>AI Smart Import</span>
            </button>\n`;
content = content.replace(targetAiButton, '');

// 2. Remove Bulk Upload Promo
const targetPromoRegex = /<!-- Bulk Upload Promo -->[\s\S]*?<\/button>\s*<\/div>/;
content = content.replace(targetPromoRegex, '');

// 3. Remove event listeners
const targetAiListener = `    document.getElementById('btn_ai_magic_import')?.addEventListener('click', () => {
      this.openAiMagicImportModal();
    });`;
content = content.replace(targetAiListener, '');

const targetManual2Listener = `    document.getElementById('btn_add_student_manual_2')?.addEventListener('click', () => {
      this.openAddStudentManualModal();
    });`;
content = content.replace(targetManual2Listener, '');

fs.writeFileSync('src/ui/appRenderer.ts', content);
