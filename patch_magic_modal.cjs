const fs = require('fs');
const file = 'src/ui/appRenderer.ts';
let code = fs.readFileSync(file, 'utf8');

const newMethod = `  // AI Magic Import Modal
  private openAiMagicImportModal() {
    const modalHtml = \`
      <div class="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-amber-50 dark:bg-amber-900/20">
        <h3 class="text-base font-bold text-amber-900 dark:text-amber-400 flex items-center gap-2">
          \${icons.sparkles} AI Smart Student Import
        </h3>
        <button onclick="document.getElementById('ai-magic-modal').remove()" class="p-1 text-slate-400 hover:text-slate-600">
          \${icons.x}
        </button>
      </div>
      <div class="p-6">
        <p class="text-sm text-slate-600 dark:text-slate-400 mb-4">
          Paste any messy text (e.g. emails, Whatsapp messages, unstructured lists) containing student information. Our AI will instantly extract names, roll numbers, percentages, pass/fail status, and other dynamic attributes.
        </p>
        <textarea id="ai_magic_input" class="w-full h-40 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl p-3 text-sm focus:ring-2 focus:ring-amber-500 outline-none mb-4" placeholder="e.g. 'John Doe got 85% and passed, his roll is 12. Jane Smith failed with 34%, roll 13.'"></textarea>
        
        <div id="ai_magic_loading" class="hidden text-amber-600 text-sm font-bold flex items-center gap-2 mb-4 animate-pulse">
          <div class="w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
          AI is extracting records...
        </div>

        <div class="flex justify-end gap-2">
          <button type="button" onclick="document.getElementById('ai-magic-modal').remove()" class="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl">Cancel</button>
          <button id="btn_process_magic" class="px-5 py-2 text-xs font-bold bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white rounded-xl shadow-lg transition-transform active:scale-95 flex items-center gap-2">
            \${icons.sparkles} Extract & Add Students
          </button>
        </div>
      </div>
    \`;

    const backdrop = document.createElement('div');
    backdrop.id = 'ai-magic-modal';
    backdrop.className = 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm';
    backdrop.innerHTML = \`
      <div class="relative w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden" onclick="event.stopPropagation()">
        \${modalHtml}
      </div>
    \`;

    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) backdrop.remove();
    });
    document.body.appendChild(backdrop);

    const btnProcess = backdrop.querySelector('#btn_process_magic') as HTMLButtonElement;
    const inputArea = backdrop.querySelector('#ai_magic_input') as HTMLTextAreaElement;
    const loader = backdrop.querySelector('#ai_magic_loading') as HTMLDivElement;

    btnProcess.addEventListener('click', async () => {
      const text = inputArea.value.trim();
      if (!text) {
        showToast('Please paste some text first.', 'warning');
        return;
      }

      btnProcess.disabled = true;
      btnProcess.classList.add('opacity-50');
      loader.classList.remove('hidden');

      try {
        const response = await fetch('/api/gemini/parse-students', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text })
        });
        
        if (!response.ok) throw new Error('AI extraction failed');
        const students = await response.json();
        
        if (!Array.isArray(students) || students.length === 0) {
          showToast('No students could be extracted from the text.', 'warning');
          btnProcess.disabled = false;
          btnProcess.classList.remove('opacity-50');
          loader.classList.add('hidden');
          return;
        }

        const timestamp = new Date().toISOString();
        let successCount = 0;

        for (const s of students) {
          const newStudent: Student = {
            id: \`stu_ai_\${Date.now()}_\${Math.random().toString(36).substring(2, 9)}\`,
            name: s.name || 'Unknown',
            normalizedName: normalizeName(s.name || 'Unknown'),
            rollNumber: s.rollNumber || 'TBD',
            normalizedRollNumber: normalizeRollNumber(s.rollNumber || 'TBD'),
            studentId: s.studentId || \`REG\${Date.now()}\`,
            normalizedStudentId: normalizeStudentId(s.studentId || \`REG\${Date.now()}\`),
            dynamicFields: s.dynamicFields || {},
            createdAt: timestamp,
            updatedAt: timestamp
          };
          await dbService.saveStudent(newStudent);
          successCount++;
        }

        showToast(\`\${icons.sparkles} Magic Success! Added \${successCount} students.\`, 'success');
        backdrop.remove();
        this.render();
      } catch (err: any) {
        showToast(err.message, 'error');
        btnProcess.disabled = false;
        btnProcess.classList.remove('opacity-50');
        loader.classList.add('hidden');
      }
    });
  }

  // Create Student Manual Modal
`;

code = code.replace('  // Create Student Manual Modal', newMethod);
fs.writeFileSync(file, code);
