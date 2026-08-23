const fs = require('fs');
const file = 'src/ui/appRenderer.ts';
let code = fs.readFileSync(file, 'utf8');

if (!code.includes("case 'menu':")) {
  code = code.replace(
    "case 'settings':",
    "case 'menu':\n        return this.renderMenuView();\n      case 'settings':"
  );
}

if (!code.includes("private renderMenuView(): string")) {
  const menuCode = `
  private renderMenuView(): string {
    return \`
      <div class="max-w-md mx-auto space-y-4">
        <h2 class="text-xl font-bold text-slate-900 dark:text-white px-2">Menu</h2>
        
        <div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
          <button data-nav="subjects" class="w-full flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
            <div class="flex items-center gap-3 text-slate-700 dark:text-slate-300">
              <div class="text-sky-500">\${icons.subjects}</div>
              <span class="font-semibold text-sm">Subjects Master</span>
            </div>
            <div class="text-slate-400">&rarr;</div>
          </button>
          
          <button data-nav="unresolved" class="w-full flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
            <div class="flex items-center gap-3 text-slate-700 dark:text-slate-300">
              <div class="text-amber-500">\${icons.unresolved}</div>
              <span class="font-semibold text-sm">Unresolved Records</span>
            </div>
            <div class="text-slate-400">&rarr;</div>
          </button>
          
          <button data-nav="history" class="w-full flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
            <div class="flex items-center gap-3 text-slate-700 dark:text-slate-300">
              <div class="text-emerald-500">\${icons.history}</div>
              <span class="font-semibold text-sm">Import History</span>
            </div>
            <div class="text-slate-400">&rarr;</div>
          </button>
          
          <button data-nav="settings" class="w-full flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
            <div class="flex items-center gap-3 text-slate-700 dark:text-slate-300">
              <div class="text-slate-500">\${icons.settings}</div>
              <span class="font-semibold text-sm">App Settings</span>
            </div>
            <div class="text-slate-400">&rarr;</div>
          </button>
        </div>
      </div>
    \`;
  }
  `;
  
  code = code.replace(
    "private renderDashboardView(",
    menuCode + "\n  private renderDashboardView("
  );
}

fs.writeFileSync(file, code);
