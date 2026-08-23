const fs = require('fs');
const file = 'src/ui/appRenderer.ts';
let code = fs.readFileSync(file, 'utf8');

const oldModalHtml = `      <form id="form_create_student" class="p-4 md:p-6 space-y-4">
        <div>
          <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Full Student Name *</label>
          <input type="text" id="manual_stu_name" required placeholder="e.g. Ahmad Dar" class="w-full text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2"/>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Roll Number *</label>
            <input type="text" id="manual_stu_roll" required placeholder="e.g. 101" class="w-full text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2"/>
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Student / Registration ID *</label>
            <input type="text" id="manual_stu_id" required placeholder="e.g. REG202601" class="w-full text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2"/>
          </div>
        </div>
        <div class="pt-4 flex justify-end gap-2">
          <button type="button" onclick="document.getElementById('add-student-modal').remove()" class="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl">Cancel</button>
          <button type="submit" class="px-4 py-2 text-xs font-bold bg-sky-600 hover:bg-sky-500 text-white rounded-xl">Create Record</button>
        </div>
      </form>`;

const newModalHtml = `      <form id="form_create_student" class="p-4 md:p-6 space-y-4 flex flex-col h-[60vh]">
        <div class="bg-sky-50 dark:bg-sky-900/20 p-3 rounded-xl border border-sky-100 dark:border-sky-800 text-xs text-sky-800 dark:text-sky-300 mb-2 shrink-0">
          <p class="font-bold flex items-center gap-1">\${icons.sparkles} Quick Batch Entry</p>
          <p class="mt-1">Enter multiple students quickly. You can add extra attributes like Pass/Fail, Percentage, Parent Name, etc.</p>
        </div>
        
        <div class="flex-1 overflow-y-auto space-y-4 pr-2" id="student_rows_container">
          <!-- Row template will be inserted here -->
        </div>

        <div class="pt-2 shrink-0">
          <button type="button" id="btn_add_another_student_row" class="w-full py-2 border-2 border-dashed border-slate-300 dark:border-slate-700 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:border-slate-400 dark:hover:border-slate-500 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors">
            \${icons.plus} Add Another Student Row
          </button>
        </div>

        <div class="pt-4 mt-auto border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2 shrink-0">
          <button type="button" onclick="document.getElementById('add-student-modal').remove()" class="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl">Cancel</button>
          <button type="submit" class="px-4 py-2 text-xs font-bold bg-sky-600 hover:bg-sky-500 text-white rounded-xl">Save All Records</button>
        </div>
      </form>`;

code = code.replace(oldModalHtml, newModalHtml);


const oldModalLogic = `    const form = backdrop.querySelector('#form_create_student') as HTMLFormElement;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = (backdrop.querySelector('#manual_stu_name') as HTMLInputElement).value.trim();
      const roll = (backdrop.querySelector('#manual_stu_roll') as HTMLInputElement).value.trim();
      const sId = (backdrop.querySelector('#manual_stu_id') as HTMLInputElement).value.trim();
      const newStudent: Student = {
        id: \`stu_\${Date.now()}\`,
        name,
        normalizedName: normalizeName(name),
        rollNumber: roll,
        normalizedRollNumber: normalizeRollNumber(roll),
        studentId: sId,
        aliases: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      await dbService.saveStudent(newStudent);
      showToast(\`Student \${name} created.\`, 'success');
      backdrop.remove();
      this.render();
    });
  }`;

const newModalLogic = `    const form = backdrop.querySelector('#form_create_student') as HTMLFormElement;
    const container = backdrop.querySelector('#student_rows_container') as HTMLDivElement;
    const addRowBtn = backdrop.querySelector('#btn_add_another_student_row') as HTMLButtonElement;

    let rowCounter = 0;

    const createRow = () => {
      rowCounter++;
      const rowDiv = document.createElement('div');
      rowDiv.className = 'p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700 relative group animate-in fade-in zoom-in-95 duration-200';
      rowDiv.innerHTML = \`
        <button type="button" class="btn-remove-row absolute -top-2 -right-2 w-6 h-6 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm hover:bg-rose-500 hover:text-white" title="Remove row">
          \${icons.x}
        </button>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
          <div>
            <label class="block text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 mb-1">Full Name *</label>
            <input type="text" required placeholder="e.g. Ahmad" class="stu-name-input w-full text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg px-2 py-1.5 focus:ring-1 focus:ring-sky-500 outline-none"/>
          </div>
          <div>
            <label class="block text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 mb-1">Roll Number *</label>
            <input type="text" required placeholder="e.g. 101" class="stu-roll-input w-full text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg px-2 py-1.5 focus:ring-1 focus:ring-sky-500 outline-none"/>
          </div>
          <div>
            <label class="block text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 mb-1">Registration ID *</label>
            <input type="text" required placeholder="e.g. REG01" class="stu-id-input w-full text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg px-2 py-1.5 focus:ring-1 focus:ring-sky-500 outline-none"/>
          </div>
        </div>
        <div class="bg-white dark:bg-slate-900 p-2 rounded-xl border border-slate-200 dark:border-slate-700">
          <label class="block text-[10px] uppercase font-bold text-sky-600 dark:text-sky-400 mb-1 flex items-center gap-1">\${icons.plus} Optional Custom Attributes</label>
          <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
            <input type="text" placeholder="Pass/Fail" class="stu-dyn-pass w-full text-xs bg-transparent border-b border-slate-200 dark:border-slate-700 px-1 py-1 outline-none focus:border-sky-500" title="Pass/Fail Status"/>
            <input type="text" placeholder="Percentage" class="stu-dyn-pct w-full text-xs bg-transparent border-b border-slate-200 dark:border-slate-700 px-1 py-1 outline-none focus:border-sky-500" title="Overall Percentage"/>
            <input type="text" placeholder="Parent Name" class="stu-dyn-parent w-full text-xs bg-transparent border-b border-slate-200 dark:border-slate-700 px-1 py-1 outline-none focus:border-sky-500" title="Parent/Guardian Name"/>
            <input type="text" placeholder="Other Notes" class="stu-dyn-notes w-full text-xs bg-transparent border-b border-slate-200 dark:border-slate-700 px-1 py-1 outline-none focus:border-sky-500" title="Any other notes"/>
          </div>
        </div>
      \`;
      
      rowDiv.querySelector('.btn-remove-row')?.addEventListener('click', () => {
        if (container.children.length > 1) {
          rowDiv.remove();
        } else {
          showToast('You must have at least one student row.', 'warning');
        }
      });

      container.appendChild(rowDiv);
      
      setTimeout(() => {
        (rowDiv.querySelector('.stu-name-input') as HTMLInputElement)?.focus();
      }, 50);
    };

    createRow();

    addRowBtn.addEventListener('click', createRow);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const rows = Array.from(container.children);
      const timestamp = new Date().toISOString();

      let successCount = 0;

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const name = (row.querySelector('.stu-name-input') as HTMLInputElement).value.trim();
        const roll = (row.querySelector('.stu-roll-input') as HTMLInputElement).value.trim();
        const sId = (row.querySelector('.stu-id-input') as HTMLInputElement).value.trim();
        
        if (!name || !roll || !sId) continue;

        const dynPass = (row.querySelector('.stu-dyn-pass') as HTMLInputElement).value.trim();
        const dynPct = (row.querySelector('.stu-dyn-pct') as HTMLInputElement).value.trim();
        const dynParent = (row.querySelector('.stu-dyn-parent') as HTMLInputElement).value.trim();
        const dynNotes = (row.querySelector('.stu-dyn-notes') as HTMLInputElement).value.trim();

        const dynamicFields: Record<string, string> = {};
        if (dynPass) dynamicFields['Status'] = dynPass;
        if (dynPct) dynamicFields['Percentage'] = dynPct;
        if (dynParent) dynamicFields['Parent Name'] = dynParent;
        if (dynNotes) dynamicFields['Notes'] = dynNotes;

        const newStudent: Student = {
          id: \`stu_\${Date.now()}_\${i}\`,
          name,
          normalizedName: normalizeName(name),
          rollNumber: roll,
          normalizedRollNumber: normalizeRollNumber(roll),
          studentId: sId,
          normalizedStudentId: normalizeStudentId(sId),
          dynamicFields,
          createdAt: timestamp,
          updatedAt: timestamp
        };

        await dbService.saveStudent(newStudent);
        successCount++;
      }

      if (successCount > 0) {
        showToast(\`Successfully added \${successCount} student record(s).\`, 'success');
      }
      backdrop.remove();
      this.render();
    });
  }`;

code = code.replace(oldModalLogic, newModalLogic);

fs.writeFileSync(file, code);
