import {
  Student,
  Subject,
  Result,
  ImportRecord,
  UnresolvedRecord,
  SystemSettings,
  ParsedPDFData
} from '../types';
import { dbService, DEFAULT_SETTINGS } from '../db/indexedDB';
import { icons } from './icons';
import { fetchAiInsights } from '../services/aiInsightsService';
import { showToast } from './toast';
import { parsePDFFile } from '../services/pdfParser';
import { processFileWithAiVision } from '../services/aiVisionService';
import { commitPDFImport } from '../services/importManager';
import {
  openImportReviewModal,
  openStudentProfileModal,
  openAiInsightsModal,
  openSubjectDetailsModal,
  openResolveRecordModal,
  openConfirmDeleteModal
} from './modals';
import { exportStudentsToCSV } from '../services/exportService';
import { generateBulkReportCardPDF } from '../services/reportCardService';
import { normalizeName, normalizeRollNumber, normalizeStudentId } from '../services/fieldNormalizer';

export type ActiveTab = 'dashboard' | 'classes' | 'students' | 'subjects' | 'upload' | 'unresolved' | 'history' | 'settings' | 'insights' | 'menu';

export class AppRenderer {
  private activeTab: ActiveTab = 'dashboard';
  private settings: SystemSettings = DEFAULT_SETTINGS;
  private studentsCache: any[] = [];
  private resultsCache: any[] = [];
  private currentSearchQuery: string = '';
  private studentSortField: string = 'rollNumber';
  private studentLocalSearch: string = '';
  private studentSortAsc: boolean = true;
  private studentPage: number = 1;
  private studentPageSize: number = 15;
  private subjectFilter: string = '';
  private selectedStudentForDossier: string | null = null;
  private isProcessingPdf: boolean = false;
  private uploadQueue: File[] = [];
  private selectedStudentIds: Set<string> = new Set<string>();
  private uploadProgress = {
    isUploading: false,
    fileName: '',
    progress: 0,
    currentStep: ''
  };

  private cheetahController = {
    active: false,
    currentPct: 0,
    targetPct: 0,
    stepMessage: '',
    fileName: '',
    fileSizeStr: '',
    isAiVision: false,
    intervalId: null as number | null
  };

  async init() {
    this.settings = await dbService.getSettings();
    this.applyTheme(this.settings.theme);
    this.render();
    this.attachGlobalListeners();
  }

  async setTab(tab: ActiveTab) {
    this.activeTab = tab;
    await this.render();
    if (tab === 'insights') {
      this.loadInsightsData();
    }
  }

  applyTheme(theme: 'light' | 'dark' | 'system') {
    const isDark =
      theme === 'dark' ||
      (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }

    // Direct DOM sync for theme toggle button
    const themeBtn = document.getElementById('btn_toggle_theme');
    if (themeBtn) {
      themeBtn.innerHTML = isDark ? icons.sun : icons.moon;
      themeBtn.setAttribute(
        'title',
        isDark ? 'Switch to Light Theme' : 'Switch to Dark Theme'
      );
    }

    const themeSelect = document.getElementById('setting_theme_select') as HTMLSelectElement;
    if (themeSelect) {
      themeSelect.value = theme;
    }
  }

  async toggleTheme() {
    const isCurrentlyDark = document.documentElement.classList.contains('dark');
    const nextTheme: 'light' | 'dark' = isCurrentlyDark ? 'light' : 'dark';
    this.settings.theme = nextTheme;
    await dbService.saveSettings(this.settings);
    this.applyTheme(nextTheme);
    showToast(`Switched to ${nextTheme === 'dark' ? 'Dark' : 'Light'} Mode`, 'info');
  }

  // --- CHEETAH SMOOTH CONTINUOUS NUMBER-BY-NUMBER RUNNER ---
  private startCheetahProgress(file: File, isImage: boolean) {
    if (this.cheetahController.intervalId) {
      clearInterval(this.cheetahController.intervalId);
    }

    const kb = (file.size / 1024).toFixed(1);
    this.cheetahController = {
      active: true,
      currentPct: 1,
      targetPct: 15,
      stepMessage: isImage
        ? 'Preparing marksheet photo for Gemini AI Vision OCR...'
        : 'Reading binary stream & extracting document metadata...',
      fileName: file.name,
      fileSizeStr: `${kb} KB`,
      isAiVision: isImage,
      intervalId: null
    };

    this.uploadProgress = {
      isUploading: true,
      fileName: file.name,
      progress: 1,
      currentStep: this.cheetahController.stepMessage
    };

    if (this.activeTab !== 'upload') {
      this.activeTab = 'upload';
    }
    this.render();

    // Constant-speed smooth cheetah ticker:
    // Ticks smoothly number-by-number (1%, 2%, 3%, 4%...) at a steady velocity
    const tickIntervalMs = isImage ? 35 : Math.max(16, Math.min(38, Math.round(16 + (file.size / 1024) * 0.04)));

    this.cheetahController.intervalId = window.setInterval(() => {
      if (!this.cheetahController.active) return;

      if (this.cheetahController.currentPct < this.cheetahController.targetPct) {
        this.cheetahController.currentPct += 1;
        this.syncCheetahDOM();
      } else if (this.cheetahController.currentPct < 94) {
        // Continuous steady cheetah progression while background async task executes
        this.cheetahController.currentPct += 1;
        this.cheetahController.targetPct = Math.max(this.cheetahController.targetPct, this.cheetahController.currentPct);
        this.syncCheetahDOM();
      }
    }, tickIntervalMs);
  }

  private updateCheetahProgress(stepMessage: string, targetPercent: number) {
    if (!this.cheetahController.active) return;
    this.cheetahController.stepMessage = stepMessage;
    this.cheetahController.targetPct = Math.max(this.cheetahController.targetPct, Math.min(95, targetPercent));
    this.cheetahController.isAiVision = this.cheetahController.isAiVision || /gemini|vision|ocr/i.test(stepMessage);
    this.syncCheetahDOM();
  }

  private async finishCheetahProgress(): Promise<void> {
    if (!this.cheetahController.active) return;

    this.cheetahController.targetPct = 100;
    this.cheetahController.stepMessage = 'Extraction complete! Normalizing master student records...';
    this.syncCheetahDOM();

    if (this.cheetahController.intervalId) {
      clearInterval(this.cheetahController.intervalId);
    }

    return new Promise<void>((resolve) => {
      this.cheetahController.intervalId = window.setInterval(() => {
        if (this.cheetahController.currentPct < 100) {
          this.cheetahController.currentPct += 1;
          this.syncCheetahDOM();
        } else {
          if (this.cheetahController.intervalId) {
            clearInterval(this.cheetahController.intervalId);
            this.cheetahController.intervalId = null;
          }
          this.cheetahController.active = false;
          // Clean finish pause at 100%
          setTimeout(() => {
            this.uploadProgress.isUploading = false;
            this.render();
            resolve();
          }, 150);
        }
      }, 7); // Super-fast rush to 100%
    });
  }

  private stopCheetahProgress() {
    this.cheetahController.active = false;
    if (this.cheetahController.intervalId) {
      clearInterval(this.cheetahController.intervalId);
      this.cheetahController.intervalId = null;
    }
    this.uploadProgress.isUploading = false;
    this.render();
  }

  private syncCheetahDOM() {
    const pct = Math.min(100, Math.max(0, Math.round(this.cheetahController.currentPct)));
    const bar = document.getElementById('cheetah_progress_bar');
    const pctLabel = document.getElementById('cheetah_pct_label');
    const stepLabel = document.getElementById('cheetah_step_label');
    const modeBadge = document.getElementById('cheetah_mode_badge');

    if (bar) {
      bar.style.width = `${pct}%`;
    }
    if (pctLabel) {
      pctLabel.textContent = `${pct}%`;
    }
    if (stepLabel) {
      stepLabel.textContent = this.cheetahController.stepMessage;
    }
    if (modeBadge) {
      modeBadge.innerHTML = `
        ${icons.zap}
        <span>${this.cheetahController.isAiVision ? 'Gemini Vision AI OCR Stream' : 'Cheetah Matrix Engine Active'}</span>
      `;
    }
  }

  private attachGlobalListeners() {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (this.settings.theme === 'system') {
        this.applyTheme('system');
      }
    });

    window.addEventListener('keydown', (e) => {
      // Global shortcut: '/' to focus quick search
      if (e.key === '/' && (e.target as HTMLElement).tagName !== 'INPUT') {
        e.preventDefault();
        const searchInput = document.getElementById('global_search_input');
        if (searchInput) {
          searchInput.focus();
        }
      }
    });
  }

  async render() {
    const appRoot = document.getElementById('root');
    if (!appRoot) return;

    const [students, subjects, results, imports, unresolved, stats] = await Promise.all([
      dbService.getAllStudents(),
      dbService.getAllSubjects(),
      dbService.getAllResults(),
      dbService.getAllImports(),
      dbService.getAllUnresolvedRecords(),
      dbService.getDashboardStats()
    ]);

    this.studentsCache = students;
    this.resultsCache = results;

    const activeUnresolvedCount = unresolved.filter(u => u.status === 'pending').length;

    appRoot.innerHTML = `
      <div class="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col md:flex-row transition-colors duration-200">
        
        <!-- SIDEBAR -->
        <aside class="hidden md:flex w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex-col shrink-0 z-20">
          <!-- Logo & Brand Header -->
          <div class="p-4 md:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div class="flex items-center gap-3">
              <img src="/GDC-LOGO.png" alt="Logo" class="w-9 h-9 object-contain rounded-xl shadow-sm bg-white p-0.5 border border-slate-200 dark:border-slate-700" onerror="this.onerror=null; this.src='/src/public/GDC-LOGO.png';" />
              <div>
                <h1 class="font-extrabold text-xs tracking-tight text-slate-900 dark:text-white leading-tight">Govt. SHMM</h1>
                <div class="text-[10px] uppercase font-bold text-sky-600 dark:text-sky-400 tracking-wider">Degree College Anantnag</div>
              </div>
            </div>
          </div>

          <!-- Navigation Links -->
          <nav class="flex-1 p-3 space-y-1 overflow-y-auto">
            <button data-nav="dashboard" class="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
              this.activeTab === 'dashboard'
                ? 'bg-sky-600 text-white shadow-md shadow-sky-600/20'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-white'
            }">
              <div class="flex items-center gap-3">
                ${icons.dashboard}
                <span>Dashboard</span>
              </div>
            </button>

            <button data-nav="classes" class="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
              this.activeTab === 'classes'
                ? 'bg-sky-600 text-white shadow-md shadow-sky-600/20'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-white'
            }">
              <div class="flex items-center gap-3">
                ${icons.classes}
                <span>Classes</span>
              </div>
            </button>

            <button data-nav="insights" class="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
              this.activeTab === 'insights'
                ? 'bg-sky-600 text-white shadow-md shadow-sky-600/20'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-white'
            }">
              <div class="flex items-center gap-3">
                ${icons.sparkles}
                <span>AI Insights</span>
              </div>
            </button>
            
            <button data-nav="students" class="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
              this.activeTab === 'students'
                ? 'bg-sky-600 text-white shadow-md shadow-sky-600/20'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-white'
            }">
              <div class="flex items-center gap-3">
                ${icons.students}
                <span>Students Master</span>
              </div>
              <span class="text-[11px] px-2 py-0.5 rounded-full ${this.activeTab === 'students' ? 'bg-sky-700 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}">
                ${students.length}
              </span>
            </button>

            <button data-nav="subjects" class="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
              this.activeTab === 'subjects'
                ? 'bg-sky-600 text-white shadow-md shadow-sky-600/20'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-white'
            }">
              <div class="flex items-center gap-3">
                ${icons.subjects}
                <span>Subjects</span>
              </div>
              <span class="text-[11px] px-2 py-0.5 rounded-full ${this.activeTab === 'subjects' ? 'bg-sky-700 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}">
                ${subjects.length}
              </span>
            </button>

            <button data-nav="upload" class="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
              this.activeTab === 'upload'
                ? 'bg-sky-600 text-white shadow-md shadow-sky-600/20'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-white'
            }">
              <div class="flex items-center gap-3">
                ${icons.upload}
                <span>Upload Marks PDF</span>
              </div>
              <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
            </button>

            <button data-nav="unresolved" class="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
              this.activeTab === 'unresolved'
                ? 'bg-sky-600 text-white shadow-md shadow-sky-600/20'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-white'
            }">
              <div class="flex items-center gap-3">
                ${icons.unresolved}
                <span>Unresolved Records</span>
              </div>
              ${
                activeUnresolvedCount > 0
                  ? `<span class="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-500 text-white">${activeUnresolvedCount}</span>`
                  : `<span class="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500">0</span>`
              }
            </button>

            <button data-nav="history" class="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
              this.activeTab === 'history'
                ? 'bg-sky-600 text-white shadow-md shadow-sky-600/20'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-white'
            }">
              <div class="flex items-center gap-3">
                ${icons.history}
                <span>Import History</span>
              </div>
              <span class="text-[11px] px-2 py-0.5 rounded-full ${this.activeTab === 'history' ? 'bg-sky-700 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}">
                ${imports.length}
              </span>
            </button>
          </nav>

          <!-- Sidebar Footer Settings -->
          <div class="p-3 border-t border-slate-200 dark:border-slate-800 space-y-1">
            <button data-nav="settings" class="w-full flex items-center justify-between px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
              this.activeTab === 'settings'
                ? 'bg-sky-600 text-white'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60'
            }">
              <div class="flex items-center gap-3">
                ${icons.settings}
                <span>Settings & Aliases</span>
              </div>
            </button>

            <div class="px-3 pt-2 text-[10px] text-slate-400 dark:text-slate-500 flex items-center gap-1.5">
              ${icons.shield}
              <span>100% Local IndexedDB • No AI</span>
            </div>
          </div>
        </aside>

        <!-- MAIN CONTENT AREA -->
        <main class="flex-1 flex flex-col min-w-0 overflow-y-auto">
          <!-- Top App Bar -->
          <header class="h-16 px-6 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between sticky top-0 z-10">
            <!-- Global Search -->
            <div class="flex-1 max-w-lg relative">
              <div class="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                ${icons.search}
              </div>
              <input
                type="text"
                id="global_search_input"
                value="${this.currentSearchQuery}"
                placeholder="Search students by name, roll number, or ID... (Press '/')"
                class="w-full pl-10 pr-12 py-2 text-xs bg-slate-100 dark:bg-slate-800 border-none rounded-xl text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-sky-500 focus:outline-none transition-all"
              />
              <kbd class="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-slate-400 bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-600 pointer-events-none">/</kbd>
            </div>

            <!-- Top Actions -->
            <div class="flex items-center gap-2 pl-4">
              <!-- Quick Upload CTA -->
              <button id="top_btn_upload" class="hidden sm:flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold bg-sky-600 hover:bg-sky-500 text-white rounded-xl shadow-md shadow-sky-600/20 transition-all hover:scale-[1.02] active:scale-[0.98]">
                ${icons.plus}
                <span>Upload PDF</span>
              </button>

              <!-- Theme Toggle -->
              <button id="btn_toggle_theme" class="p-2 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors" title="Toggle Light/Dark Theme">
                ${this.settings.theme === 'dark' ? icons.sun : icons.moon}
              </button>
            </div>
          </header>

          <!-- Dynamic View Container -->
          <div class="p-3 md:p-4 md:p-6 flex-1 space-y-4 md:space-y-6 pb-24 md:pb-6 overflow-x-hidden">
            ${this.renderActiveTab(students, subjects, results, imports, unresolved, stats)}
          </div>
        </main>

        <!-- MOBILE BOTTOM NAV -->
        <nav class="md:hidden fixed bottom-5 left-4 right-4 z-50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border border-slate-200/50 dark:border-slate-700/50 rounded-2xl shadow-2xl flex items-center justify-between px-1 py-1">
          <button data-nav="dashboard" class="flex-1 flex flex-col items-center justify-center h-14 transition-all ${this.activeTab === 'dashboard' ? 'text-sky-600' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'}">
            <div class="${this.activeTab === 'dashboard' ? 'scale-110' : ''} transition-transform">${icons.dashboard}</div>
            <span class="text-[9px] font-bold mt-1">Dash</span>
          </button>
          <button data-nav="classes" class="flex-1 flex flex-col items-center justify-center h-14 transition-all ${this.activeTab === 'classes' ? 'text-sky-600' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'}">
            <div class="${this.activeTab === 'classes' ? 'scale-110' : ''} transition-transform">${icons.classes}</div>
            <span class="text-[9px] font-bold mt-1">Classes</span>
          </button>
          
          <button data-nav="upload" class="flex-1 relative flex flex-col items-center justify-end h-14 pb-1.5 transition-all ${this.activeTab === 'upload' ? 'text-sky-600' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'}">
            <div class="bg-sky-600 text-white w-12 h-12 rounded-full shadow-lg shadow-sky-600/30 absolute -top-5 left-1/2 -translate-x-1/2 border-[4px] border-white dark:border-slate-900 flex items-center justify-center transition-transform active:scale-95">
              ${icons.upload}
            </div>
            <span class="text-[9px] font-bold mt-1">Upload</span>
          </button>
          
          <button data-nav="students" class="flex-1 flex flex-col items-center justify-center h-14 transition-all ${this.activeTab === 'students' ? 'text-sky-600' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'}">
            <div class="${this.activeTab === 'students' ? 'scale-110' : ''} transition-transform">${icons.students}</div>
            <span class="text-[9px] font-bold mt-1">Students</span>
          </button>
          <button data-nav="menu" class="flex-1 flex flex-col items-center justify-center h-14 transition-all ${this.activeTab === 'menu' ? 'text-sky-600' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'}">
            <div class="${this.activeTab === 'menu' ? 'scale-110' : ''} transition-transform">${icons.menu}</div>
            <span class="text-[9px] font-bold mt-1">Menu</span>
          </button>
        </nav>
      </div>
    `;

    this.bindViewEvents(students, subjects, results, imports, unresolved);
  }

  private renderActiveTab(
    students: Student[],
    subjects: Subject[],
    results: Result[],
    imports: ImportRecord[],
    unresolved: UnresolvedRecord[],
    stats: any
  ): string {
    switch (this.activeTab) {
      case 'dashboard':
        return this.renderDashboardView(students, subjects, results, imports, unresolved, stats);
      case 'classes':
        return `<div class="text-center py-20 text-slate-400">Classes view is under construction.</div>`;
      case 'students':
        return this.renderStudentsView(students, subjects, results);
      case 'subjects':
        return this.renderSubjectsView(subjects, students, results);
      case 'upload':
        return this.renderUploadView();
      case 'unresolved':
        return this.renderUnresolvedView(unresolved);
      case 'history':
        return this.renderHistoryView(imports);
      case 'insights':
        return this.renderInsightsView();
      case 'menu':
        return this.renderMenuView();
      case 'settings':
        return this.renderSettingsView();
      default:
        return `<div class="text-center py-20 text-slate-400">Section not found.</div>`;
    }
  }

  // 1. DASHBOARD VIEW
  
  private renderMenuView(): string {
    return `
      <div class="max-w-md mx-auto space-y-4">
        <h2 class="text-xl font-bold text-slate-900 dark:text-white px-2">Menu</h2>
        
        <div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
          <button data-nav="subjects" class="w-full flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
            <div class="flex items-center gap-3 text-slate-700 dark:text-slate-300">
              <div class="text-sky-500">${icons.subjects}</div>
              <span class="font-semibold text-sm">Subjects Master</span>
            </div>
            <div class="text-slate-400">&rarr;</div>
          </button>
          
          <button data-nav="unresolved" class="w-full flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
            <div class="flex items-center gap-3 text-slate-700 dark:text-slate-300">
              <div class="text-amber-500">${icons.unresolved}</div>
              <span class="font-semibold text-sm">Unresolved Records</span>
            </div>
            <div class="text-slate-400">&rarr;</div>
          </button>
          
          <button data-nav="history" class="w-full flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
            <div class="flex items-center gap-3 text-slate-700 dark:text-slate-300">
              <div class="text-emerald-500">${icons.history}</div>
              <span class="font-semibold text-sm">Import History</span>
            </div>
            <div class="text-slate-400">&rarr;</div>
          </button>
          
          <button data-nav="settings" class="w-full flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
            <div class="flex items-center gap-3 text-slate-700 dark:text-slate-300">
              <div class="text-slate-500">${icons.settings}</div>
              <span class="font-semibold text-sm">App Settings</span>
            </div>
            <div class="text-slate-400">&rarr;</div>
          </button>
        </div>
      </div>
    `;
  }
  

  private renderInsightsView(): string {
    return `
      <div class="max-w-5xl mx-auto space-y-6">
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-amber-500 to-orange-600 p-6 rounded-3xl text-white shadow-lg">
          <div class="flex items-center gap-4">
            <div class="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-md">
              ${icons.sparkles}
            </div>
            <div>
              <h1 class="text-2xl font-bold">AI Performance Predictor</h1>
              <p class="text-amber-100 text-sm mt-1">Smart insights powered by Gemini 2.5 Flash</p>
            </div>
          </div>
          <button id="btn_refresh_insights" class="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-xl font-semibold text-sm transition-colors backdrop-blur-md flex items-center gap-2">
            ${icons.history} Refresh
          </button>
        </div>
        
        <div id="insights_page_content" class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 min-h-[400px]">
          <div class="w-full space-y-6">
            <div class="h-8 bg-slate-200 dark:bg-slate-800 rounded-lg w-1/3 animate-pulse"></div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div class="h-32 bg-slate-200 dark:bg-slate-800 rounded-2xl animate-pulse"></div>
              <div class="h-32 bg-slate-200 dark:bg-slate-800 rounded-2xl animate-pulse"></div>
            </div>
            <div class="h-64 bg-slate-200 dark:bg-slate-800 rounded-2xl animate-pulse w-full"></div>
            <div class="text-center text-slate-500 text-sm mt-4 animate-pulse">Analyzing class performance...</div>
          </div>
        </div>
      </div>
    `;
  }

  private async loadInsightsData() {
    const container = document.getElementById('insights_page_content');
    if (!container) return;

    try {
      const data = await fetchAiInsights(this.studentsCache, this.resultsCache);
      
      const topPerformersHtml = (data.topPerformers || []).map((p: any, idx: number) => `
        <div class="flex items-start gap-4 p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl border border-emerald-100 dark:border-emerald-800/50 hover:shadow-md transition-shadow">
          <div class="w-10 h-10 shrink-0 rounded-full bg-emerald-500 text-white flex items-center justify-center font-bold shadow-sm">
            #${idx + 1}
          </div>
          <div>
            <div class="font-bold text-slate-900 dark:text-white">${p.name}</div>
            <div class="text-sm text-slate-600 dark:text-slate-300 mt-1">${p.feedback}</div>
          </div>
        </div>
      `).join('');

      const atRiskHtml = (data.atRiskStudents || []).map((p: any) => `
        <div class="flex items-start gap-4 p-4 bg-rose-50 dark:bg-rose-900/20 rounded-2xl border border-rose-100 dark:border-rose-800/50 hover:shadow-md transition-shadow">
          <div class="w-10 h-10 shrink-0 rounded-full bg-rose-500 text-white flex items-center justify-center shadow-sm">
            ${icons.alert}
          </div>
          <div>
            <div class="font-bold text-slate-900 dark:text-white">${p.name}</div>
            <div class="text-sm text-slate-600 dark:text-slate-300 mt-1">${p.feedback}</div>
          </div>
        </div>
      `).join('');

      // Calculate grade distribution for chart
      const gradeCounts = { 'A+': 0, 'A': 0, 'B+': 0, 'B': 0, 'C': 0, 'D': 0, 'F': 0 };
      this.studentsCache.forEach(s => {
        const sResults = this.resultsCache.filter(r => r.studentId === s.id);
        let tMarks = 0, tMax = 0, nCount = 0;
        sResults.forEach(r => {
          if (typeof r.marks === 'number') { tMarks += r.marks; tMax += r.maxMarks; nCount++; }
        });
        if (nCount > 0) {
          const pct = tMax > 0 ? (tMarks / tMax) * 100 : 0;
          if (pct >= 90) gradeCounts['A+']++;
          else if (pct >= 80) gradeCounts['A']++;
          else if (pct >= 70) gradeCounts['B+']++;
          else if (pct >= 60) gradeCounts['B']++;
          else if (pct >= 50) gradeCounts['C']++;
          else if (pct >= (this.settings.passPercentage || 40)) gradeCounts['D']++;
          else gradeCounts['F']++;
        }
      });
      const maxCount = Math.max(...Object.values(gradeCounts), 1);
      
      const chartHtml = Object.entries(gradeCounts).map(([grade, count]) => {
        const heightPct = count > 0 ? Math.max((count / maxCount) * 100, 5) : 0; // min 5% for visibility if count > 0
        return `
          <div class="flex flex-col items-center justify-end h-full gap-2 group flex-1">
            <div class="text-xs font-bold text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity">${count}</div>
            <div class="w-full max-w-[48px] bg-sky-500 hover:bg-sky-400 rounded-t-lg transition-all duration-500 ease-out" style="height: ${heightPct}%;"></div>
            <div class="text-sm font-bold text-slate-700 dark:text-slate-300">${grade}</div>
          </div>
        `;
      }).join('');

      container.innerHTML = `
        <div class="w-full space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          
          <!-- Summary and Grade Distribution Chart -->
          <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div class="lg:col-span-1 p-6 bg-amber-50 dark:bg-amber-900/20 rounded-3xl border border-amber-200 dark:border-amber-800/50 flex flex-col justify-center">
              <div class="flex items-start gap-4">
                <div class="text-amber-500 mt-1 scale-125">${icons.sparkles}</div>
                <div>
                  <h3 class="text-lg font-bold text-amber-900 dark:text-amber-300 mb-2">Class Summary</h3>
                  <p class="text-sm text-amber-800 dark:text-amber-200 leading-relaxed">${data.classSummary}</p>
                </div>
              </div>
            </div>
            
            <div class="lg:col-span-2 p-6 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 flex flex-col">
              <h3 class="text-lg font-bold text-slate-900 dark:text-white mb-6">Grade Distribution (Actual)</h3>
              <div class="flex-1 flex items-end justify-between h-48 border-b border-slate-200 dark:border-slate-700 pb-2 gap-2">
                ${chartHtml}
              </div>
            </div>
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div class="space-y-4">
              <div class="flex items-center gap-2 mb-6">
                <div class="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  ${icons.check}
                </div>
                <h3 class="text-lg font-bold text-slate-900 dark:text-white">Top Performers</h3>
              </div>
              <div class="space-y-4">
                ${topPerformersHtml || '<div class="text-slate-500 text-center py-8">Not enough data.</div>'}
              </div>
            </div>

            <div class="space-y-4">
              <div class="flex items-center gap-2 mb-6">
                <div class="w-8 h-8 rounded-full bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400 flex items-center justify-center">
                  ${icons.alert}
                </div>
                <h3 class="text-lg font-bold text-slate-900 dark:text-white">At-Risk Students</h3>
              </div>
              <div class="space-y-4">
                ${atRiskHtml || '<div class="text-slate-500 text-center py-8">No at-risk students identified.</div>'}
              </div>
            </div>
          </div>
        </div>
      `;
      
      const refreshBtn = document.getElementById('btn_refresh_insights');
      if (refreshBtn) {
        refreshBtn.onclick = () => {
          this.render(); // reset to loading
          this.loadInsightsData(); // fetch again
        };
      }
      
      const chatForm = document.getElementById('ai_chat_form') as HTMLFormElement;
      const chatInput = document.getElementById('ai_chat_input') as HTMLInputElement;
      const chatHistory = document.getElementById('ai_chat_history') as HTMLDivElement;
      
      if (chatForm && chatInput && chatHistory) {
        chatForm.onsubmit = async (e) => {
          e.preventDefault();
          const question = chatInput.value.trim();
          if (!question) return;
          
          // Add User Message
          const userDiv = document.createElement('div');
          userDiv.className = 'flex items-start gap-3 flex-row-reverse';
          userDiv.innerHTML = `
            <div class="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 flex flex-shrink-0 items-center justify-center font-bold text-xs">${icons.user}</div>
            <div class="bg-sky-500 text-white p-3 rounded-2xl rounded-tr-sm text-sm shadow-sm max-w-[80%]">${question}</div>
          `;
          chatHistory.appendChild(userDiv);
          chatInput.value = '';
          chatHistory.scrollTop = chatHistory.scrollHeight;
          
          // Add AI Loading Message
          const aiLoadingDiv = document.createElement('div');
          aiLoadingDiv.className = 'flex items-start gap-3';
          aiLoadingDiv.innerHTML = `
            <div class="w-8 h-8 rounded-full bg-amber-500 text-white flex flex-shrink-0 items-center justify-center font-bold text-xs">${icons.sparkles}</div>
            <div class="bg-white dark:bg-slate-700 p-3 rounded-2xl rounded-tl-sm text-sm shadow-sm border border-slate-200 dark:border-slate-600 text-slate-500 animate-pulse flex items-center gap-2">
              <div class="w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin"></div> Thinking...
            </div>
          `;
          chatHistory.appendChild(aiLoadingDiv);
          chatHistory.scrollTop = chatHistory.scrollHeight;
          
          try {
            // Provide context for AI
            const summaryData = {
              students: this.studentsCache.map(s => ({ name: s.name, roll: s.rollNumber, dynamicFields: s.dynamicFields, status: s.dynamicFields?.Status || 'N/A' })),
              classPerformanceSummary: data.classSummary
            };
            const res = await fetch('/api/gemini/chat', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ prompt: question, classData: summaryData })
            });
            const answer = await res.json();
            
            aiLoadingDiv.innerHTML = `
              <div class="w-8 h-8 rounded-full bg-amber-500 text-white flex flex-shrink-0 items-center justify-center font-bold text-xs">${icons.sparkles}</div>
              <div class="bg-white dark:bg-slate-700 p-3 rounded-2xl rounded-tl-sm text-sm shadow-sm border border-slate-200 dark:border-slate-600 text-slate-800 dark:text-slate-100 markdown-body prose prose-sm dark:prose-invert">
                ${answer.text ? answer.text.replace(/\n/g, '<br/>') : 'Sorry, I could not process that.'}
              </div>
            `;
            chatHistory.scrollTop = chatHistory.scrollHeight;
          } catch (err: any) {
             aiLoadingDiv.innerHTML = `
              <div class="w-8 h-8 rounded-full bg-rose-500 text-white flex flex-shrink-0 items-center justify-center font-bold text-xs">${icons.alert}</div>
              <div class="bg-rose-50 text-rose-700 p-3 rounded-2xl rounded-tl-sm text-sm shadow-sm border border-rose-200">
                Failed to connect to AI Analyst: ${err.message}
              </div>
            `;
          }
        };
      }

    } catch (error: any) {
      container.innerHTML = `
        <div class="flex flex-col items-center justify-center text-center py-12">
          <div class="w-16 h-16 rounded-full bg-rose-100 dark:bg-rose-900/30 text-rose-500 flex items-center justify-center mb-4">
            ${icons.alert}
          </div>
          <div class="text-xl font-bold text-slate-900 dark:text-white mb-2">Failed to load insights</div>
          <div class="text-slate-500 dark:text-slate-400 max-w-md">${error.message || 'An unknown error occurred while communicating with the AI service.'}</div>
          <button onclick="document.getElementById('btn_refresh_insights').click()" class="mt-6 px-6 py-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold rounded-xl hover:opacity-90 transition-opacity">
            Try Again
          </button>
        </div>
      `;
    }
  }

  private renderDashboardView(

    students: Student[],
    subjects: Subject[],
    results: Result[],
    imports: ImportRecord[],
    unresolved: UnresolvedRecord[],
    stats: any
  ): string {
    const activeUnresolved = unresolved.filter(u => u.status === 'pending');

    const recentImportsHtml = imports.slice(0, 4).map(imp => `
      <div class="p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-sky-100 dark:bg-sky-900/40 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
            ${icons.filePdf}
          </div>
          <div>
            <div class="font-bold text-xs text-slate-900 dark:text-white">${imp.fileName}</div>
            <div class="text-[11px] text-slate-500">Subject: <strong class="text-slate-700 dark:text-slate-300">${imp.subject}</strong> • ${new Date(imp.importedAt).toLocaleDateString()}</div>
          </div>
        </div>
        <div class="text-right">
          <span class="px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
            +${imp.recordsImported} results
          </span>
        </div>
      </div>
    `).join('');

    return `
      <div class="space-y-6">
        <!-- Institution Banner -->
        <div class="p-4 md:p-6 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div class="flex items-center gap-4">
            <img src="/GDC-LOGO.png" alt="College Logo" class="w-14 h-14 md:w-16 md:h-16 object-contain rounded-2xl bg-white/10 p-1.5 backdrop-blur-md border border-white/20 shadow-lg shrink-0" onerror="this.onerror=null; this.src='/src/public/GDC-LOGO.png';" />
            <div>
              <div class="text-xs uppercase tracking-widest text-sky-400 font-bold mb-1">Academic Session ${this.settings.academicSession}</div>
              <h2 class="text-xl md:text-2xl font-black text-amber-300 drop-shadow-sm">${this.settings.institutionName}</h2>
              <p class="text-xs text-slate-300 mt-1 max-w-xl">
                Local PDF Marks Normalization & Student Identity Master Registry. Automatic rule-based alias detection with zero external AI requirements.
              </p>
            </div>
          </div>
          <div class="flex flex-col sm:flex-row items-start sm:items-center gap-2 mt-4 md:mt-0">
            <button id="dash_btn_ai_insights" class="flex items-center gap-2 px-4 py-2.5 text-xs font-bold bg-amber-500 hover:bg-amber-400 text-white rounded-xl shadow-lg transition-transform active:scale-95 whitespace-nowrap">
              ${icons.sparkles}
              <span>AI Insights Predictor</span>
            </button>
            <button id="dash_btn_upload" class="flex items-center gap-2 px-4 py-2.5 text-xs font-bold bg-sky-500 hover:bg-sky-400 text-white rounded-xl shadow-lg transition-transform active:scale-95 whitespace-nowrap">
              ${icons.upload}
              <span>Upload Marks PDF</span>
            </button>
          </div>
        </div>

        <!-- Metric KPI Cards -->
        <div class="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <div class="p-4 md:p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div class="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Total Students</div>
            <div class="text-2xl font-black text-slate-900 dark:text-white mt-1">${stats.totalStudents}</div>
            <div class="text-[10px] text-slate-400 mt-1">Master student dossiers</div>
          </div>

          <div class="p-4 md:p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div class="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Total Subjects</div>
            <div class="text-2xl font-black text-slate-900 dark:text-white mt-1">${stats.totalSubjects}</div>
            <div class="text-[10px] text-slate-400 mt-1">Normalized courses</div>
          </div>

          <div class="p-4 md:p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div class="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">PDF Files Uploaded</div>
            <div class="text-2xl font-black text-slate-900 dark:text-white mt-1">${stats.totalPdfs}</div>
            <div class="text-[10px] text-slate-400 mt-1">Parsed & source-tracked</div>
          </div>

          <div class="p-4 md:p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div class="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Total Results</div>
            <div class="text-2xl font-black text-sky-600 dark:text-sky-400 mt-1">${stats.totalResults}</div>
            <div class="text-[10px] text-slate-400 mt-1">Avg Score: ${stats.overallAverage}%</div>
          </div>

          <div class="p-4 md:p-5 bg-white dark:bg-slate-900 rounded-2xl border ${activeUnresolved.length > 0 ? 'border-amber-400 dark:border-amber-700 bg-amber-50/20' : 'border-slate-200 dark:border-slate-800'} shadow-sm">
            <div class="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Unresolved Records</div>
            <div class="text-2xl font-black ${activeUnresolved.length > 0 ? 'text-amber-600' : 'text-slate-900 dark:text-white'} mt-1">${activeUnresolved.length}</div>
            <div class="text-[10px] text-slate-400 mt-1">${activeUnresolved.length > 0 ? 'Action required' : 'All clear'}</div>
          </div>
        </div>

        <!-- Unresolved Alert Banner (if any) -->
        ${
          activeUnresolved.length > 0
            ? `
            <div class="p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 rounded-2xl flex items-center justify-between">
              <div class="flex items-center gap-3">
                <div class="p-2 bg-amber-200 dark:bg-amber-900 text-amber-800 dark:text-amber-200 rounded-xl">
                  ${icons.alert}
                </div>
                <div>
                  <h4 class="text-xs font-bold text-amber-900 dark:text-amber-200">${activeUnresolved.length} Unresolved Student Record(s) Pending</h4>
                  <p class="text-[11px] text-amber-700 dark:text-amber-400">Certain uploaded PDF entries were missing roll numbers or names. Review and manually map them safely.</p>
                </div>
              </div>
              <button id="banner_btn_resolve" class="px-3 py-1.5 text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white rounded-xl shadow">
                Resolve Records
              </button>
            </div>
            `
            : ''
        }

        <!-- Quick Summary Grids -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 md:p-6">
          <!-- Recent Imports -->
          <div class="p-4 md:p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
            <div class="flex items-center justify-between">
              <h3 class="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 flex items-center gap-2">
                ${icons.history}
                <span>Recent PDF Marksheet Imports</span>
              </h3>
              <button data-nav="history" class="text-xs text-sky-600 hover:underline font-semibold">View All (${imports.length})</button>
            </div>

            <div class="space-y-2">
              ${recentImportsHtml || '<div class="text-center py-8 text-xs text-slate-400">No PDF files uploaded yet. Click "Upload PDF" to get started!</div>'}
            </div>
          </div>

          <!-- Subject Breakdown -->
          <div class="p-4 md:p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
            <div class="flex items-center justify-between">
              <h3 class="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 flex items-center gap-2">
                ${icons.subjects}
                <span>Active Subjects Registry</span>
              </h3>
              <button data-nav="subjects" class="text-xs text-sky-600 hover:underline font-semibold">View All (${subjects.length})</button>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
              ${
                subjects.length > 0
                  ? subjects.map(sub => {
                      const count = results.filter(r => r.subjectId === sub.id).length;
                      return `
                        <div class="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700/60 flex items-center justify-between cursor-pointer hover:border-sky-400 transition-colors" data-subject-id="${sub.id}">
                          <div>
                            <div class="font-bold text-xs text-slate-900 dark:text-white truncate">${sub.name}</div>
                            <div class="text-[10px] text-slate-500">${count} Students Enrolled</div>
                          </div>
                          <div class="text-xs font-bold text-sky-600 dark:text-sky-400">
                            Max ${sub.maxMarks}
                          </div>
                        </div>
                      `;
                    }).join('')
                  : '<div class="col-span-2 text-center py-8 text-xs text-slate-400">No subjects registered yet.</div>'
              }
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // 2. STUDENTS VIEW
  private renderStudentsView(
    students: Student[],
    subjects: Subject[],
    results: Result[]
  ): string {
    let filteredStudents = [...students];

    // Filter by search query
    if (this.currentSearchQuery.trim()) {
      const q = this.currentSearchQuery.toLowerCase().trim();
      filteredStudents = filteredStudents.filter(s =>
        s.name.toLowerCase().includes(q) ||
        s.rollNumber.toLowerCase().includes(q) ||
        s.studentId.toLowerCase().includes(q)
      );
    }

    // Filter by subject
    if (this.subjectFilter) {
      const enrolledStudentIds = new Set(
        results.filter(r => r.subjectId === this.subjectFilter).map(r => r.studentId)
      );
      filteredStudents = filteredStudents.filter(s => enrolledStudentIds.has(s.id));
    }

    // Sort
    filteredStudents.sort((a, b) => {
      let valA: any = a.name;
      let valB: any = b.name;

      if (this.studentSortField === 'rollNumber') {
        valA = parseFloat(a.normalizedRollNumber) || a.rollNumber;
        valB = parseFloat(b.normalizedRollNumber) || b.rollNumber;
      } else if (this.studentSortField === 'studentId') {
        valA = a.studentId;
        valB = b.studentId;
      } else if (this.studentSortField === 'name') {
        valA = a.name.toLowerCase();
        valB = b.name.toLowerCase();
      }

      if (valA < valB) return this.studentSortAsc ? -1 : 1;
      if (valA > valB) return this.studentSortAsc ? 1 : -1;
      return 0;
    });

    // Pagination
    const totalCount = filteredStudents.length;
    const totalPages = Math.ceil(totalCount / this.studentPageSize) || 1;
    const currentPage = Math.min(this.studentPage, totalPages);
    const startIndex = (currentPage - 1) * this.studentPageSize;
    const pagedStudents = filteredStudents.slice(startIndex, startIndex + this.studentPageSize);

    // Check if all on current page are selected
    const allSelected = pagedStudents.length > 0 && pagedStudents.every(s => this.selectedStudentIds.has(s.id));

    // Build Results Map for fast lookup
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
    const dynamicColumns = Array.from(dynamicFieldsSet).filter(col => {
      const lower = col.toLowerCase();
      return !['total marks', 'max marks', 'percentage', 'grade', 'average', 'subjects', 'average %', 'total'].includes(lower);
    });


    const tableRows = pagedStudents.map((s, idx) => {
      const sResults = resultMap.get(s.id) || [];
      const isSelected = this.selectedStudentIds.has(s.id);
      let totalMarks = 0;
      let totalMax = 0;
      let numCount = 0;

      for (const r of sResults) {
        if (typeof r.marks === 'number') {
          totalMarks += r.marks;
          totalMax += r.maxMarks;
          numCount++;
        }
      }

      const avgPct = totalMax > 0 ? Math.round((totalMarks / totalMax) * 1000) / 10 : 0;
      let grade = '-';
      if (numCount > 0) {
        if (avgPct >= 90) grade = 'A+';
        else if (avgPct >= 80) grade = 'A';
        else if (avgPct >= 70) grade = 'B+';
        else if (avgPct >= 60) grade = 'B';
        else if (avgPct >= 50) grade = 'C';
        else if (avgPct >= (this.settings.passPercentage || 40)) grade = 'D';
        else grade = 'F';
      }

      const gradeColor =
        grade === 'A+' || grade === 'A' ? 'text-emerald-600 dark:text-emerald-400 font-bold' :
        grade === 'B+' || grade === 'B' ? 'text-sky-600 dark:text-sky-400 font-bold' :
        grade === 'C' || grade === 'D' ? 'text-amber-600 dark:text-amber-400 font-bold' :
        grade === 'F' ? 'text-rose-600 dark:text-rose-400 font-bold' : 'text-slate-400';

      const aiTag = s.aiMagicFields ? `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300 flex items-center gap-1">${icons.wand} AI</span>` : '';
      const aiDesc = s.aiMagicFields ? 'Imported via AI Magic' : 'Manual / UI Entry';

      return `
        <tr class="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 text-xs transition-colors cursor-pointer ${isSelected ? 'bg-sky-50/70 dark:bg-sky-950/40' : ''}" data-student-row="${s.id}">
          <td class="w-10 px-3 py-2 md:py-3 text-center" onclick="event.stopPropagation()">
            <input type="checkbox" class="student-select-chk w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-sky-600 focus:ring-sky-500 cursor-pointer" data-id="${s.id}" ${isSelected ? 'checked' : ''} />
          </td>
          <td class="px-3 py-2 md:py-3 text-center text-slate-400 font-mono">${startIndex + idx + 1}</td>
          <td class="px-4 py-2 md:py-3 font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <div class="w-7 h-7 rounded-lg bg-sky-100 dark:bg-sky-950 text-sky-600 dark:text-sky-300 font-bold text-xs flex items-center justify-center shrink-0">
              ${s.name.charAt(0).toUpperCase()}
            </div>
            <span>${s.name}</span>
          </td>
          <td class="px-4 py-2 md:py-3 font-mono font-semibold text-slate-700 dark:text-slate-300">${s.rollNumber}</td>
          <td class="px-4 py-2 md:py-3 font-mono text-slate-600 dark:text-slate-400">${s.studentId}</td>
          ${dynamicColumns.map(col => `<td class="px-4 py-2 md:py-3 text-center font-medium text-amber-700 dark:text-amber-300">${s.dynamicFields?.[col] || '-'}</td>`).join('')}
          <td class="px-4 py-2 md:py-3 text-center">
            <span class="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 font-semibold text-slate-700 dark:text-slate-300">
              ${sResults.length}
            </span>
          </td>
          <td class="px-4 py-2 md:py-3 text-center font-bold text-slate-900 dark:text-white">${totalMarks} <span class="text-slate-400 text-[10px]">/ ${totalMax}</span></td>
          <td class="px-4 py-2 md:py-3 text-center font-bold text-sky-600 dark:text-sky-400">${avgPct > 0 ? `${avgPct}%` : '-'}</td>
          <td class="px-4 py-2 md:py-3 text-center ${gradeColor}">${grade}</td>
          <td class="px-4 py-2 md:py-3">
            <div class="flex flex-col gap-1 items-start justify-center">
              ${aiTag}
              <span class="text-[10px] text-slate-500 max-w-[150px] truncate" title="${aiDesc}">${aiDesc}</span>
            </div>
          </td>
          <td class="px-4 py-2 md:py-3 text-right" onclick="event.stopPropagation()">
            <div class="flex items-center justify-end gap-1.5">
              <button data-action="view-dossier" data-id="${s.id}" class="px-2.5 py-1 text-xs font-semibold bg-sky-50 dark:bg-sky-950 text-sky-600 dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-900 rounded-lg transition-colors">
                View Dossier
              </button>
              <button data-action="delete-student" data-id="${s.id}" class="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/60 rounded-lg transition-colors" title="Delete Student Record">
                ${icons.trash}
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    return `
      <div class="space-y-4">
        <!-- Students Header -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 class="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              ${icons.students}
              <span>Student Master Records</span>
            </h2>
            <p class="text-xs text-slate-500">
              Unified dossiers with merged marks from multi-format PDFs.
            </p>
          </div>

          <div class="flex items-center gap-2">
            <button id="btn_export_bulk_pdf" class="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sky-600 dark:text-sky-400 rounded-xl hover:bg-slate-50 transition-colors shadow-sm">
              ${icons.fileText}
              <span>Export Bulk PDF</span>
            </button>
            <button id="btn_export_csv_master" class="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-xl hover:bg-slate-50 transition-colors shadow-sm">
              ${icons.download}
              <span>Export CSV Matrix</span>
            </button>
            <button id="btn_add_student_manual" class="flex items-center gap-1.5 px-3 py-2 text-xs font-bold bg-sky-600 hover:bg-sky-500 text-white rounded-xl shadow-md transition-all">
              ${icons.userPlus}
              <span>Batch Add</span>
            </button>
          </div>
        </div>

        <!-- Floating / Sticky Bulk Action Toolbar -->
        ${
          this.selectedStudentIds.size > 0
            ? `
            <div class="p-3.5 bg-slate-900 text-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-700 flex flex-wrap items-center justify-between gap-3 animate-fade-in sticky top-4 z-20">
              <div class="flex items-center gap-3">
                <span class="w-7 h-7 rounded-xl bg-sky-500/20 text-sky-400 font-bold text-xs flex items-center justify-center">${this.selectedStudentIds.size}</span>
                <span class="text-xs font-semibold"><strong>${this.selectedStudentIds.size}</strong> student(s) selected</span>
              </div>
              <div class="flex items-center gap-2">
                <button id="btn_bulk_delete_students" class="flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white rounded-xl shadow transition-transform active:scale-95">
                  ${icons.trash}
                  <span>Delete Selected (${this.selectedStudentIds.size})</span>
                </button>
                <button id="btn_bulk_export_students" class="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-white/10 hover:bg-white/20 text-white rounded-xl transition-colors">
                  ${icons.download}
                  <span>Export Selected</span>
                </button>
                <button id="btn_bulk_deselect_students" class="px-3 py-2 text-xs font-medium text-slate-400 hover:text-white rounded-xl">
                  Deselect All
                </button>
              </div>
            </div>
            `
            : ''
        }

        <!-- Filter and Search Bar -->
        <div class="p-3 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div class="flex flex-wrap items-center gap-2 flex-1">
            <input type="text" id="filter_student_search" placeholder="Filter by roll no, percentage, grade..." class="text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 focus:ring-2 focus:ring-sky-500 focus:outline-none w-full max-w-[220px]" value="${this.studentLocalSearch || ''}" />
            <select id="filter_student_subject" class="appearance-none bg-no-repeat bg-right pr-8 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 focus:ring-2 focus:ring-sky-500 focus:outline-none" style="background-image: url('data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 24 24\' stroke=\'%236b7280\'><path stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'2\' d=\'M19 9l-7 7-7-7\'/></svg>'); background-size: 16px; background-position-x: calc(100% - 12px);">
              <option value="">All Subjects (${subjects.length})</option>
              ${subjects.map(sub => `<option value="${sub.id}" ${this.subjectFilter === sub.id ? 'selected' : ''}>${sub.name}</option>`).join('')}
            </select>

            <span class="text-xs text-slate-500">Showing <strong>${totalCount}</strong> students</span>
          </div>

          <div class="flex items-center gap-2">
            <label class="text-xs text-slate-500">Sort By:</label>
            <select id="sort_student_field" class="appearance-none bg-no-repeat bg-right pr-8 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2" style="background-image: url('data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 24 24\' stroke=\'%236b7280\'><path stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'2\' d=\'M19 9l-7 7-7-7\'/></svg>'); background-size: 16px; background-position-x: calc(100% - 12px);">
              <option value="rollNumber" ${this.studentSortField === 'rollNumber' ? 'selected' : ''}>Roll Number</option>
              <option value="name" ${this.studentSortField === 'name' ? 'selected' : ''}>Student Name</option>
              <option value="studentId" ${this.studentSortField === 'studentId' ? 'selected' : ''}>Student ID</option>
              <option value="percentage" ${this.studentSortField === 'percentage' ? 'selected' : ''}>Percentage</option>
              <option value="grade" ${this.studentSortField === 'grade' ? 'selected' : ''}>Grade</option>
            </select>
          </div>
        </div>

        
\n\n        <!-- Students Table -->
        <div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full border-collapse">
              <thead>
                <tr class="bg-slate-50 dark:bg-slate-800/80 text-[11px] uppercase tracking-wider text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                  <th class="w-10 px-3 py-2 md:py-3 text-center">
                    <input type="checkbox" id="chk_select_all_students" class="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-sky-600 focus:ring-sky-500 cursor-pointer" ${allSelected ? 'checked' : ''} />
                  </th>
                  <th class="px-3 py-2 md:py-3 text-center font-semibold">#</th>
                  <th class="px-4 py-2 md:py-3 text-left font-semibold">Student Name</th>
                  <th class="px-4 py-2 md:py-3 text-left font-semibold">Roll No</th>
                  <th class="px-4 py-2 md:py-3 text-left font-semibold">Student ID</th>
                  ${dynamicColumns.map(col => `<th class="px-4 py-2 md:py-3 text-center font-semibold text-amber-600 dark:text-amber-500">${col}</th>`).join('')}
                  <th class="px-4 py-2 md:py-3 text-center font-semibold">Subjects</th>
                  <th class="px-4 py-2 md:py-3 text-center font-semibold">Total Marks</th>
                  <th class="px-4 py-2 md:py-3 text-center font-semibold">Average %</th>
                  <th class="px-4 py-2 md:py-3 text-center font-semibold">Grade</th>
                  <th class="px-4 py-2 md:py-3 text-left font-semibold">AI Action</th>
                  <th class="px-4 py-2 md:py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                ${tableRows || `<tr><td colspan="10" class="px-4 py-12 text-center text-xs text-slate-400">No students matching criteria. Upload a PDF or add a student to begin.</td></tr>`}
              </tbody>
            </table>
          </div>

          <!-- Pagination -->
          ${
            totalPages > 1
              ? `
              <div class="px-4 py-2 md:py-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
                <span class="text-slate-500">Page ${currentPage} of ${totalPages}</span>
                <div class="flex items-center gap-1">
                  <button id="btn_prev_page" ${currentPage <= 1 ? 'disabled' : ''} class="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-800">
                    Previous
                  </button>
                  <button id="btn_next_page" ${currentPage >= totalPages ? 'disabled' : ''} class="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-800">
                    Next
                  </button>
                </div>
              </div>
              `
              : ''
          }
        </div>
      </div>
    `;
  }

  // 3. SUBJECTS VIEW
  private renderSubjectsView(
    subjects: Subject[],
    students: Student[],
    results: Result[]
  ): string {
    const cardsHtml = subjects.map(sub => {
      const subResults = results.filter(r => r.subjectId === sub.id);
      let totalMarks = 0;
      let numericCount = 0;
      let highest = 0;
      let passCount = 0;

      for (const r of subResults) {
        if (typeof r.marks === 'number') {
          totalMarks += r.marks;
          numericCount++;
          if (r.marks > highest) highest = r.marks;
          if ((r.percentage || 0) >= (this.settings.passPercentage || 40)) passCount++;
        }
      }

      const avg = numericCount > 0 ? Math.round((totalMarks / numericCount) * 10) / 10 : 0;
      const passRate = numericCount > 0 ? Math.round((passCount / numericCount) * 100) : 0;

      return `
        <div class="p-4 md:p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between hover:border-sky-400 dark:hover:border-sky-600 transition-all cursor-pointer" data-subject-card="${sub.id}">
          <div>
            <div class="flex items-center justify-between mb-3">
              <div class="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 font-bold flex items-center justify-center">
                ${icons.subjects}
              </div>
              <span class="px-2 py-0.5 text-xs font-semibold rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                Max ${sub.maxMarks}
              </span>
            </div>

            <h3 class="text-base font-bold text-slate-900 dark:text-white mb-1">${sub.name}</h3>
            <p class="text-xs text-slate-500">${subResults.length} Students Evaluated</p>

            <div class="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-center">
              <div>
                <div class="text-[10px] uppercase font-semibold text-slate-400">Average</div>
                <div class="text-xs font-bold text-sky-600 mt-0.5">${avg}</div>
              </div>
              <div>
                <div class="text-[10px] uppercase font-semibold text-slate-400">Highest</div>
                <div class="text-xs font-bold text-emerald-600 mt-0.5">${highest > 0 ? highest : '-'}</div>
              </div>
              <div>
                <div class="text-[10px] uppercase font-semibold text-slate-400">Pass Rate</div>
                <div class="text-xs font-bold text-slate-800 dark:text-slate-200 mt-0.5">${passRate}%</div>
              </div>
            </div>
          </div>

          <div class="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <span class="text-xs font-semibold text-sky-600 flex items-center gap-1">
              View Marksheet ${icons.externalLink}
            </span>
            <button data-action="delete-subject" data-id="${sub.id}" class="p-1 text-slate-400 hover:text-rose-600 transition-colors" title="Delete subject">
              ${icons.trash}
            </button>
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="space-y-6">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 class="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              ${icons.subjects}
              <span>Academic Subjects Directory</span>
            </h2>
            <p class="text-xs text-slate-500">
              Courses populated dynamically from uploaded PDF marksheets.
            </p>
          </div>
          <button id="btn_create_subject" class="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold bg-sky-600 hover:bg-sky-500 text-white rounded-xl shadow-md">
            ${icons.plus}
            <span>Add Subject</span>
          </button>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          ${cardsHtml || '<div class="col-span-3 text-center py-16 text-xs text-slate-400">No subjects created yet. Upload a PDF marksheet to automatically register subjects.</div>'}
        </div>
      </div>
    `;
  }

  // 4. PDF UPLOAD & PARSER VIEW
  private renderUploadView(): string {
    // Dynamic Upload Zone (Cheetah Animated vs Default)
    const uploadZoneHtml = this.uploadProgress.isUploading
      ? `
        <div
          id="pdf_drop_zone"
          class="relative overflow-hidden border-2 border-sky-400/80 dark:border-sky-500/80 bg-gradient-to-b from-sky-50/90 via-white to-sky-50/50 dark:from-slate-900 dark:via-slate-900 dark:to-slate-950 rounded-3xl p-8 sm:p-12 text-center transition-all shadow-xl shadow-sky-500/5"
        >
          <!-- Dynamic High-Velocity Cheetah Scanner Pulse -->
          <div class="absolute inset-0 bg-gradient-to-r from-transparent via-sky-400/15 dark:via-sky-400/10 to-transparent pointer-events-none animate-pulse"></div>

          <div class="relative z-10 max-w-lg mx-auto space-y-5">
            <!-- Header Badges -->
            <div class="flex items-center justify-center gap-2">
              <span id="cheetah_mode_badge" class="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-extrabold rounded-full bg-sky-100 dark:bg-sky-950/80 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800 tracking-wide uppercase">
                ${icons.zap}
                <span>${this.cheetahController.isAiVision ? 'Gemini Vision AI OCR Stream' : 'Cheetah Matrix Engine Active'}</span>
              </span>
              <span class="inline-flex items-center px-2.5 py-1 text-xs font-mono font-semibold rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                ${this.cheetahController.fileSizeStr || 'Active'}
              </span>
            </div>

            <!-- Big Live Number-by-Number Percentage & Spinning Glow Icon -->
            <div class="flex flex-col items-center justify-center gap-2">
              <div class="relative w-20 h-20 flex items-center justify-center">
                <div class="absolute inset-0 rounded-full border-4 border-sky-200 dark:border-sky-800/80 border-t-sky-500 dark:border-t-sky-400 animate-spin"></div>
                <div class="w-14 h-14 rounded-2xl bg-gradient-to-tr from-sky-600 via-indigo-600 to-sky-500 text-white flex items-center justify-center shadow-lg shadow-sky-500/25">
                  ${icons.filePdf}
                </div>
              </div>
              <div class="text-3xl sm:text-4xl font-extrabold font-mono tracking-tight text-slate-900 dark:text-white" id="cheetah_pct_label">
                ${Math.round(this.cheetahController.currentPct || 1)}%
              </div>
            </div>

            <div>
              <h3 class="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate max-w-md mx-auto">
                Processing "${this.cheetahController.fileName || this.uploadProgress.fileName || 'Marksheet Document'}"
              </h3>
              <div class="text-xs text-sky-600 dark:text-sky-400 font-medium mt-1.5 flex items-center justify-center gap-2">
                <span class="w-2 h-2 rounded-full bg-sky-500 animate-ping"></span>
                <span id="cheetah_step_label">${this.cheetahController.stepMessage || this.uploadProgress.currentStep || 'Extracting tabular records and subjects...'}</span>
              </div>
            </div>

            <!-- Glowing Smooth Progress Bar -->
            <div class="w-full bg-slate-200/90 dark:bg-slate-800 h-3 rounded-full overflow-hidden p-0.5 shadow-inner">
              <div
                id="cheetah_progress_bar"
                class="bg-gradient-to-r from-amber-500 via-sky-500 to-indigo-600 h-full rounded-full transition-all duration-75 ease-linear shadow-md shadow-sky-500/30"
                style="width: ${Math.round(this.cheetahController.currentPct || 1)}%"
              ></div>
            </div>

            <!-- Footer Stats -->
            <div class="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 pt-1">
              <span class="flex items-center gap-1 font-medium">⚡ Ultra-Smooth Linear Ticker</span>
              <span class="font-medium">Continuous Cadence • No Stalls</span>
            </div>
          </div>
        </div>
      `
      : `
        <!-- Default Drag & Drop Zone -->
        <div
          id="pdf_drop_zone"
          class="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-sky-500 dark:hover:border-sky-500 bg-white dark:bg-slate-900/60 rounded-3xl p-8 sm:p-12 text-center transition-all cursor-pointer group"
        >
          <input type="file" id="pdf_file_input" accept=".pdf,image/*,.png,.jpg,.jpeg,.webp" multiple class="hidden" />

          <div class="flex items-center justify-center gap-3 mb-4">
            <div class="w-14 h-14 rounded-2xl bg-sky-50 dark:bg-sky-950 text-sky-600 dark:text-sky-400 flex items-center justify-center group-hover:scale-110 transition-transform">
              ${icons.filePdf}
            </div>
            <div class="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 flex items-center justify-center group-hover:scale-110 transition-transform">
              ${icons.camera}
            </div>
          </div>

          <h3 class="text-base font-bold text-slate-900 dark:text-white">
            Drop your Marks PDFs, Scanned Marksheets or Camera Photos here
          </h3>
          <p class="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            Drag & drop PDF files or photos directly, or click to browse. Standard digital PDFs parse locally in milliseconds; scanned documents and camera captures are automatically extracted with high-accuracy Gemini AI Vision OCR.
          </p>

          <button id="btn_browse_pdf" class="mt-5 px-6 py-2.5 text-xs font-bold bg-sky-600 hover:bg-sky-500 text-white rounded-xl shadow-lg shadow-sky-600/20 transition-all hover:scale-[1.02] active:scale-[0.98]">
            Browse Files (PDF or Image)
          </button>

          <div class="mt-4 text-[11px] text-slate-400 flex flex-wrap items-center justify-center gap-3">
            <span>✓ Multi-Subject Matrix</span>
            <span>•</span>
            <span>✓ Scanned & Digital PDFs</span>
            <span>•</span>
            <span>✓ Camera Photos & Snaps (OCR)</span>
            <span>•</span>
            <span>✓ 50+ Dynamic Subjects</span>
          </div>
        </div>
      `;

    return `
      <div class="space-y-6 max-w-4xl mx-auto">
        <!-- Title -->
        <div>
          <h2 class="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            ${icons.upload}
            <span>Upload Marks PDF Documents</span>
          </h2>
          <p class="text-xs text-slate-500">
            Upload single or multi-subject college marksheets. Different column headers and subjects are automatically recognized and distributed using dynamic {} tokens.
          </p>
        </div>

        <!-- Drag & Drop Zone with Live Animation -->
        ${uploadZoneHtml}
      </div>
    `;
  }

  // 5. UNRESOLVED RECORDS VIEW
  private renderUnresolvedView(unresolved: UnresolvedRecord[]): string {
    const pendingRecords = unresolved.filter(u => u.status === 'pending');
    const resolvedRecords = unresolved.filter(u => u.status !== 'pending');

    const rowsHtml = pendingRecords.map((rec, idx) => `
      <tr class="border-b border-slate-100 dark:border-slate-800 hover:bg-amber-50/30 dark:hover:bg-amber-950/20 text-xs">
        <td class="px-4 py-2 md:py-3 text-center text-slate-400 font-mono">${idx + 1}</td>
        <td class="px-4 py-2 md:py-3 font-semibold text-slate-800 dark:text-slate-200">${rec.fileName}</td>
        <td class="px-4 py-2 md:py-3 text-center text-slate-500">Page ${rec.pageNumber}</td>
        <td class="px-4 py-2 md:py-3">
          <div class="text-xs font-medium text-slate-700 dark:text-slate-300">
            Name: <strong>${rec.detectedFields.name || '<missing>'}</strong> • Roll: <strong>${rec.detectedFields.rollNumber || '<missing>'}</strong> • Marks: <strong>${rec.detectedFields.marks || '<missing>'}</strong>
          </div>
        </td>
        <td class="px-4 py-2 md:py-3 text-rose-600 dark:text-rose-400 font-medium">${rec.missingFields.join(', ') || 'Conflicting Record'}</td>
        <td class="px-4 py-2 md:py-3 text-right">
          <button data-action="resolve-unresolved" data-id="${rec.id}" class="px-3 py-1.5 text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white rounded-lg shadow-sm transition-colors">
            Resolve Manually
          </button>
        </td>
      </tr>
    `).join('');

    return `
      <div class="space-y-4">
        <div>
          <h2 class="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            ${icons.unresolved}
            <span>Unresolved PDF Records (${pendingRecords.length})</span>
          </h2>
          <p class="text-xs text-slate-500">
            Extracted rows with missing identification or ambiguous student identities. Manually map them to existing students without guessing.
          </p>
        </div>

        <div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full border-collapse">
              <thead>
                <tr class="bg-slate-50 dark:bg-slate-800 text-[11px] uppercase tracking-wider text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                  <th class="px-4 py-2 md:py-3 text-center font-semibold">#</th>
                  <th class="px-4 py-2 md:py-3 text-left font-semibold">PDF File</th>
                  <th class="px-4 py-2 md:py-3 text-center font-semibold">Page</th>
                  <th class="px-4 py-2 md:py-3 text-left font-semibold">Extracted Raw Values</th>
                  <th class="px-4 py-2 md:py-3 text-left font-semibold">Missing Identifier</th>
                  <th class="px-4 py-2 md:py-3 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml || `<tr><td colspan="6" class="px-4 py-12 text-center text-xs text-slate-400">No unresolved records! All parsed marks have matched master students cleanly.</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  // 6. IMPORT HISTORY VIEW
  private renderHistoryView(imports: ImportRecord[]): string {
    const rowsHtml = imports.map((imp, idx) => `
      <tr class="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 text-xs">
        <td class="px-4 py-2 md:py-3 text-center text-slate-400 font-mono">${idx + 1}</td>
        <td class="px-4 py-2 md:py-3 font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <span class="text-sky-600">${icons.filePdf}</span>
          <span>${imp.fileName}</span>
        </td>
        <td class="px-4 py-2 md:py-3 font-semibold text-slate-700 dark:text-slate-300">${imp.subject}</td>
        <td class="px-4 py-2 md:py-3 text-slate-500">${new Date(imp.importedAt).toLocaleString()}</td>
        <td class="px-4 py-2 md:py-3 text-center font-bold text-slate-900 dark:text-white">${imp.recordsDetected}</td>
        <td class="px-4 py-2 md:py-3 text-center text-emerald-600 font-bold">+${imp.recordsImported}</td>
        <td class="px-4 py-2 md:py-3 text-center text-sky-600 font-bold">${imp.recordsUpdated}</td>
        <td class="px-4 py-2 md:py-3 text-center font-semibold">
          <span class="px-2 py-0.5 rounded-full ${imp.status === 'completed' ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300' : 'bg-amber-100 text-amber-700'}">
            ${imp.status}
          </span>
        </td>
        <td class="px-4 py-2 md:py-3 text-right">
          <button data-action="delete-import" data-id="${imp.id}" class="p-1 text-slate-400 hover:text-rose-600 transition-colors" title="Delete record log">
            ${icons.trash}
          </button>
        </td>
      </tr>
    `).join('');

    return `
      <div class="space-y-4">
        <div>
          <h2 class="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            ${icons.history}
            <span>PDF Marksheet Import History</span>
          </h2>
          <p class="text-xs text-slate-500">
            Chronological audit trail of all uploaded files and processing results.
          </p>
        </div>

        <div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full border-collapse">
              <thead>
                <tr class="bg-slate-50 dark:bg-slate-800 text-[11px] uppercase tracking-wider text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                  <th class="px-4 py-2 md:py-3 text-center font-semibold">#</th>
                  <th class="px-4 py-2 md:py-3 text-left font-semibold">PDF File Name</th>
                  <th class="px-4 py-2 md:py-3 text-left font-semibold">Subject</th>
                  <th class="px-4 py-2 md:py-3 text-left font-semibold">Import Date & Time</th>
                  <th class="px-4 py-2 md:py-3 text-center font-semibold">Detected</th>
                  <th class="px-4 py-2 md:py-3 text-center font-semibold">Imported</th>
                  <th class="px-4 py-2 md:py-3 text-center font-semibold">Updated</th>
                  <th class="px-4 py-2 md:py-3 text-center font-semibold">Status</th>
                  <th class="px-4 py-2 md:py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml || `<tr><td colspan="9" class="px-4 py-12 text-center text-xs text-slate-400">No import history found.</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  // 7. SETTINGS & ALIASES VIEW
  private renderSettingsView(): string {
    const aliases = this.settings.customAliases;

    const renderAliasTags = (list: string[], category: string) => {
      return (
        list
          .map(
            (alias, idx) => `
          <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
            <span>${alias}</span>
            <button data-action="remove-alias" data-cat="${category}" data-idx="${idx}" class="text-slate-400 hover:text-rose-600 ml-1">
              &times;
            </button>
          </span>
        `
          )
          .join('') || '<span class="text-xs text-slate-400">No custom aliases added</span>'
      );
    };

    return `
      <div class="space-y-6 max-w-4xl">
        <div>
          <h2 class="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            ${icons.settings}
            <span>System Settings & Field Aliases</span>
          </h2>
          <p class="text-xs text-slate-500">
            Configure academic institution details, custom field aliases for normalization, and local database backups.
          </p>
        </div>

        <!-- General Settings Form -->
        <div class="p-4 md:p-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <h3 class="text-sm font-bold text-slate-900 dark:text-white">Academic Details & Appearance</h3>
          
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Color Theme & Appearance</label>
              <select id="setting_theme_select" class="appearance-none bg-no-repeat bg-right pr-8 w-full text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-900 dark:text-white" style="background-image: url('data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 24 24\' stroke=\'%236b7280\'><path stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'2\' d=\'M19 9l-7 7-7-7\'/></svg>'); background-size: 16px; background-position-x: calc(100% - 12px);">
                <option value="light" ${this.settings.theme === 'light' ? 'selected' : ''}>☀️ Light Theme</option>
                <option value="dark" ${this.settings.theme === 'dark' ? 'selected' : ''}>🌙 Dark Theme</option>
                <option value="system" ${this.settings.theme === 'system' ? 'selected' : ''}>💻 Follow System Preference</option>
              </select>
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Institution Name</label>
              <input type="text" id="setting_inst_name" value="${this.settings.institutionName}" class="w-full text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2"/>
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Academic Session</label>
              <input type="text" id="setting_academic_session" value="${this.settings.academicSession}" class="w-full text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2"/>
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Default Max Marks</label>
              <input type="number" id="setting_default_max" value="${this.settings.defaultMaxMarks}" class="w-full text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2"/>
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Passing Percentage (%)</label>
              <input type="number" id="setting_pass_pct" value="${this.settings.passPercentage}" class="w-full text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2"/>
            </div>
          </div>

          <div class="pt-2 flex justify-end">
            <button id="btn_save_settings" class="px-4 py-2 text-xs font-bold bg-sky-600 hover:bg-sky-500 text-white rounded-xl shadow-md">
              Save Preferences
            </button>
          </div>
        </div>

        <!-- Custom Field Aliases Manager -->
        <div class="p-4 md:p-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div>
            <h3 class="text-sm font-bold text-slate-900 dark:text-white">Custom Header Aliases</h3>
            <p class="text-xs text-slate-500">
              Add unique institution column names. Next time a PDF with this header is uploaded, it maps automatically.
            </p>
          </div>

          <div class="space-y-4">
            <!-- Name Aliases -->
            <div class="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-700">
              <div class="flex items-center justify-between mb-2">
                <span class="text-xs font-bold text-slate-800 dark:text-slate-200">Student Name Custom Aliases</span>
              </div>
              <div class="flex flex-wrap gap-1.5 mb-3">
                ${renderAliasTags(aliases.name, 'name')}
              </div>
              <div class="flex gap-2">
                <input type="text" id="input_alias_name" placeholder="e.g. Student Title, Examinee" class="flex-1 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5"/>
                <button data-action="add-alias" data-cat="name" class="px-3 py-1.5 text-xs font-bold bg-slate-800 dark:bg-slate-700 text-white rounded-lg hover:bg-slate-700">Add Alias</button>
              </div>
            </div>

            <!-- Roll Number Aliases -->
            <div class="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-700">
              <div class="flex items-center justify-between mb-2">
                <span class="text-xs font-bold text-slate-800 dark:text-slate-200">Roll Number Custom Aliases</span>
              </div>
              <div class="flex flex-wrap gap-1.5 mb-3">
                ${renderAliasTags(aliases.rollNumber, 'rollNumber')}
              </div>
              <div class="flex gap-2">
                <input type="text" id="input_alias_rollNumber" placeholder="e.g. Hall Ticket No, Seat ID" class="flex-1 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5"/>
                <button data-action="add-alias" data-cat="rollNumber" class="px-3 py-1.5 text-xs font-bold bg-slate-800 dark:bg-slate-700 text-white rounded-lg hover:bg-slate-700">Add Alias</button>
              </div>
            </div>

            <!-- Student ID Aliases -->
            <div class="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-700">
              <div class="flex items-center justify-between mb-2">
                <span class="text-xs font-bold text-slate-800 dark:text-slate-200">Student ID / Reg Custom Aliases</span>
              </div>
              <div class="flex flex-wrap gap-1.5 mb-3">
                ${renderAliasTags(aliases.studentId, 'studentId')}
              </div>
              <div class="flex gap-2">
                <input type="text" id="input_alias_studentId" placeholder="e.g. University No, Matriculation ID" class="flex-1 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5"/>
                <button data-action="add-alias" data-cat="studentId" class="px-3 py-1.5 text-xs font-bold bg-slate-800 dark:bg-slate-700 text-white rounded-lg hover:bg-slate-700">Add Alias</button>
              </div>
            </div>

            <!-- Marks Aliases -->
            <div class="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-700">
              <div class="flex items-center justify-between mb-2">
                <span class="text-xs font-bold text-slate-800 dark:text-slate-200">Marks / Score Custom Aliases</span>
              </div>
              <div class="flex flex-wrap gap-1.5 mb-3">
                ${renderAliasTags(aliases.marks, 'marks')}
              </div>
              <div class="flex gap-2">
                <input type="text" id="input_alias_marks" placeholder="e.g. Theory Grade, Secured Points" class="flex-1 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5"/>
                <button data-action="add-alias" data-cat="marks" class="px-3 py-1.5 text-xs font-bold bg-slate-800 dark:bg-slate-700 text-white rounded-lg hover:bg-slate-700">Add Alias</button>
              </div>
            </div>
          </div>
        </div>

        <!-- Database Backup & Restore -->
        <div class="p-4 md:p-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div>
            <h3 class="text-sm font-bold text-slate-900 dark:text-white">Local Database Management</h3>
            <p class="text-xs text-slate-500">
              Export and restore full JSON backups of all students, subjects, results, and custom settings.
            </p>
          </div>

          <div class="flex flex-wrap items-center gap-3">
            <button id="btn_export_backup" class="flex items-center gap-2 px-4 py-2.5 text-xs font-bold bg-slate-800 dark:bg-slate-700 text-white rounded-xl hover:bg-slate-700 shadow-sm">
              ${icons.download}
              <span>Export Backup (JSON)</span>
            </button>

            <label class="flex items-center gap-2 px-4 py-2.5 text-xs font-bold bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-xl hover:bg-slate-50 cursor-pointer shadow-sm">
              ${icons.refresh}
              <span>Restore Backup (JSON)</span>
              <input type="file" id="input_restore_backup" accept=".json" class="hidden" />
            </label>

            <button id="btn_clear_db" class="flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition-colors ml-auto">
              ${icons.trash}
              <span>Clear Local Database</span>
            </button>
          </div>
        </div>
      </div>
    `;
  }

  // --- EVENT BINDINGS & ACTIONS ---
  private bindViewEvents(
    students: Student[],
    subjects: Subject[],
    results: Result[],
    imports: ImportRecord[],
    unresolved: UnresolvedRecord[]
  ) {
    // Navigation
    document.querySelectorAll('[data-nav]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tab = (e.currentTarget as HTMLElement).dataset.nav as ActiveTab;
        if (tab) this.setTab(tab);
      });
    });

    // Theme Toggle
    document.getElementById('btn_toggle_theme')?.addEventListener('click', () => this.toggleTheme());

    // Quick Search Input
    const searchInput = document.getElementById('global_search_input') as HTMLInputElement;
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.currentSearchQuery = (e.target as HTMLInputElement).value;
        if (this.activeTab !== 'students') {
          this.activeTab = 'students';
          this.studentPage = 1;
        }
        this.render();
      });
    }

    // Top CTA Upload
    document.getElementById('top_btn_upload')?.addEventListener('click', () => this.setTab('upload'));
    document.getElementById('dash_btn_upload')?.addEventListener('click', () => this.setTab('upload'));
    document.getElementById('dash_btn_ai_insights')?.addEventListener('click', () => this.setTab('insights'));
    document.getElementById('banner_btn_resolve')?.addEventListener('click', () => this.setTab('unresolved'));

    // Dashboard Subject Click
    document.querySelectorAll('[data-subject-id]').forEach(el => {
      el.addEventListener('click', (e) => {
        const sId = (e.currentTarget as HTMLElement).dataset.subjectId;
        const targetSub = subjects.find(s => s.id === sId);
        if (targetSub) {
          openSubjectDetailsModal(targetSub, this.settings, () => this.render());
        }
      });
    });

    // Students Table Events
    const selectAllChk = document.getElementById('chk_select_all_students') as HTMLInputElement;
    if (selectAllChk) {
      selectAllChk.addEventListener('change', (e) => {
        const checked = (e.target as HTMLInputElement).checked;
        const totalCount = students.length;
        const totalPages = Math.ceil(totalCount / this.studentPageSize) || 1;
        const currentPage = Math.min(this.studentPage, totalPages);
        const startIndex = (currentPage - 1) * this.studentPageSize;
        const paged = students.slice(startIndex, startIndex + this.studentPageSize);

        paged.forEach(s => {
          if (checked) {
            this.selectedStudentIds.add(s.id);
          } else {
            this.selectedStudentIds.delete(s.id);
          }
        });
        this.render();
      });
    }

    document.querySelectorAll('.student-select-chk').forEach(chk => {
      chk.addEventListener('change', (e) => {
        e.stopPropagation();
        const target = e.target as HTMLInputElement;
        const id = target.dataset.id;
        if (id) {
          if (target.checked) {
            this.selectedStudentIds.add(id);
          } else {
            this.selectedStudentIds.delete(id);
          }
          this.render();
        }
      });
    });

    document.querySelectorAll('[data-student-row]').forEach(tr => {
      tr.addEventListener('click', (e) => {
        const id = (e.currentTarget as HTMLElement).dataset.studentRow;
        if (id) {
          openStudentProfileModal(id, this.settings, () => this.render());
        }
      });
    });

    document.querySelectorAll('[data-action="view-dossier"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = (e.currentTarget as HTMLElement).dataset.id;
        if (id) {
          openStudentProfileModal(id, this.settings, () => this.render());
        }
      });
    });

    document.querySelectorAll('[data-action="delete-student"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = (e.currentTarget as HTMLElement).dataset.id;
        const targetStudent = students.find(s => s.id === id);
        if (id) {
          openConfirmDeleteModal({
            title: 'Delete Student Record',
            message: `Are you sure you want to delete student "${targetStudent?.name || 'Selected'}" and all their marks records?`,
            confirmText: 'Delete Student',
            onConfirm: async () => {
              await dbService.deleteStudentsBatch([id]);
              this.selectedStudentIds.delete(id);
              showToast('Student deleted successfully.', 'success');
              this.render();
            }
          });
        }
      });
    });

    document.getElementById('btn_bulk_delete_students')?.addEventListener('click', () => {
      const count = this.selectedStudentIds.size;
      if (count > 0) {
        openConfirmDeleteModal({
          title: `Delete ${count} Students`,
          message: `Are you sure you want to permanently delete ${count} selected student(s) and all their associated marks?`,
          confirmText: `Delete ${count} Students`,
          onConfirm: async () => {
            await dbService.deleteStudentsBatch(Array.from(this.selectedStudentIds));
            this.selectedStudentIds.clear();
            showToast(`Deleted ${count} student records successfully.`, 'success');
            this.render();
          }
        });
      }
    });

    document.getElementById('btn_bulk_export_students')?.addEventListener('click', () => {
      const selectedStudents = students.filter(s => this.selectedStudentIds.has(s.id));
      if (selectedStudents.length > 0) {
        exportStudentsToCSV(selectedStudents, subjects, results, this.settings);
      }
    });

    document.getElementById('btn_bulk_deselect_students')?.addEventListener('click', () => {
      this.selectedStudentIds.clear();
      this.render();
    });

    document.getElementById('btn_export_csv_master')?.addEventListener('click', () => {
      exportStudentsToCSV(students, subjects, results, this.settings);
    });

    document.getElementById('btn_export_bulk_pdf')?.addEventListener('click', async () => {
      const btn = document.getElementById('btn_export_bulk_pdf');
      const originalText = btn?.innerHTML;
      if (btn) btn.innerHTML = `<span class="flex items-center justify-center gap-2">Generating PDF...</span>`;
      
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
    });

    document.getElementById('filter_student_subject')?.addEventListener('change', (e) => {
      this.subjectFilter = (e.target as HTMLSelectElement).value;
      this.studentPage = 1;
      this.render();
    });

    document.getElementById('sort_student_field')?.addEventListener('change', (e) => {
      this.studentSortField = (e.target as HTMLSelectElement).value as any;
      this.render();
    });

    document.getElementById('filter_student_search')?.addEventListener('input', (e) => {
      this.studentLocalSearch = (e.target as HTMLInputElement).value;
      this.render();
    });

    document.getElementById('btn_prev_page')?.addEventListener('click', () => {
      if (this.studentPage > 1) {
        this.studentPage--;
        this.render();
      }
    });

    document.getElementById('btn_next_page')?.addEventListener('click', () => {
      this.studentPage++;
      this.render();
    });

    document.getElementById('btn_add_student_manual')?.addEventListener('click', () => {
      this.openAddStudentManualModal();
    });
    

    


    // Subjects Table Events
    document.querySelectorAll('[data-subject-card]').forEach(card => {
      card.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).closest('[data-action="delete-subject"]')) return;
        const subId = (e.currentTarget as HTMLElement).dataset.subjectCard;
        const targetSub = subjects.find(s => s.id === subId);
        if (targetSub) {
          openSubjectDetailsModal(targetSub, this.settings, () => this.render());
        }
      });
    });

    document.querySelectorAll('[data-action="delete-subject"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const subId = (e.currentTarget as HTMLElement).dataset.id;
        const targetSub = subjects.find(s => s.id === subId);
        if (subId) {
          openConfirmDeleteModal({
            title: 'Delete Subject',
            message: `Are you sure you want to delete "${targetSub?.name || 'this subject'}" and all its recorded student marks?`,
            confirmText: 'Delete Subject',
            onConfirm: async () => {
              await dbService.deleteSubject(subId);
              showToast('Subject deleted.', 'success');
              this.render();
            }
          });
        }
      });
    });

    document.getElementById('btn_create_subject')?.addEventListener('click', () => {
      this.openCreateSubjectModal();
    });

    // Upload & Parser Events
    const dropZone = document.getElementById('pdf_drop_zone');
    const fileInput = document.getElementById('pdf_file_input') as HTMLInputElement;

    if (dropZone && fileInput) {
      dropZone.addEventListener('click', () => fileInput.click());

      dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('border-sky-500', 'bg-sky-50/50', 'dark:bg-sky-950/30');
      });

      dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('border-sky-500', 'bg-sky-50/50', 'dark:bg-sky-950/30');
      });

      dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('border-sky-500', 'bg-sky-50/50', 'dark:bg-sky-950/30');
        if (e.dataTransfer && e.dataTransfer.files.length > 0) {
          this.handleUploadedFiles(Array.from(e.dataTransfer.files));
        }
      });

      fileInput.addEventListener('change', (e) => {
        const files = (e.target as HTMLInputElement).files;
        if (files && files.length > 0) {
          this.handleUploadedFiles(Array.from(files));
        }
      });
    }

    // Unresolved record actions
    document.querySelectorAll('[data-action="resolve-unresolved"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const recId = (e.currentTarget as HTMLElement).dataset.id;
        const targetRec = unresolved.find(u => u.id === recId);
        if (targetRec) {
          openResolveRecordModal(targetRec, this.settings, () => this.render());
        }
      });
    });

    // Import history actions
    document.querySelectorAll('[data-action="delete-import"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const impId = (e.currentTarget as HTMLElement).dataset.id;
        if (impId) {
          openConfirmDeleteModal({
            title: 'Delete Import Record',
            message: 'Are you sure you want to remove this import history entry?',
            confirmText: 'Remove Log',
            onConfirm: async () => {
              await dbService.deleteImportRecord(impId);
              showToast('Import log removed.', 'success');
              this.render();
            }
          });
        }
      });
    });

    // Settings theme selection instant live toggle
    document.getElementById('setting_theme_select')?.addEventListener('change', async (e) => {
      const selectedTheme = (e.target as HTMLSelectElement).value as 'light' | 'dark' | 'system';
      this.settings.theme = selectedTheme;
      await dbService.saveSettings(this.settings);
      this.applyTheme(selectedTheme);
      showToast(`Appearance updated to ${selectedTheme.charAt(0).toUpperCase() + selectedTheme.slice(1)}.`, 'info');
    });

    // Settings actions
    document.getElementById('btn_save_settings')?.addEventListener('click', async () => {
      const themeVal = ((document.getElementById('setting_theme_select') as HTMLSelectElement)?.value || 'system') as 'light' | 'dark' | 'system';
      const inst = (document.getElementById('setting_inst_name') as HTMLInputElement).value;
      const sess = (document.getElementById('setting_academic_session') as HTMLInputElement).value;
      const max = parseInt((document.getElementById('setting_default_max') as HTMLInputElement).value, 10) || 100;
      const pass = parseInt((document.getElementById('setting_pass_pct') as HTMLInputElement).value, 10) || 40;

      this.settings.theme = themeVal;
      this.settings.institutionName = inst;
      this.settings.academicSession = sess;
      this.settings.defaultMaxMarks = max;
      this.settings.passPercentage = pass;

      await dbService.saveSettings(this.settings);
      this.applyTheme(themeVal);
      showToast('Settings saved successfully.', 'success');
    });

    // Add Custom Alias
    document.querySelectorAll('[data-action="add-alias"]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const cat = (e.currentTarget as HTMLElement).dataset.cat as 'name' | 'rollNumber' | 'studentId' | 'marks';
        const input = document.getElementById(`input_alias_${cat}`) as HTMLInputElement;
        if (input && input.value.trim()) {
          const val = input.value.trim();
          if (!this.settings.customAliases[cat].includes(val)) {
            this.settings.customAliases[cat].push(val);
            await dbService.saveSettings(this.settings);
            showToast(`Added alias "${val}" to ${cat}.`, 'success');
            this.render();
          }
        }
      });
    });

    // Remove Custom Alias
    document.querySelectorAll('[data-action="remove-alias"]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const cat = (e.currentTarget as HTMLElement).dataset.cat as 'name' | 'rollNumber' | 'studentId' | 'marks';
        const idx = parseInt((e.currentTarget as HTMLElement).dataset.idx || '0', 10);
        this.settings.customAliases[cat].splice(idx, 1);
        await dbService.saveSettings(this.settings);
        showToast('Alias removed.', 'info');
        this.render();
      });
    });

    // Export JSON Backup
    document.getElementById('btn_export_backup')?.addEventListener('click', async () => {
      const jsonBackup = await dbService.exportFullDatabase();
      const blob = new Blob([jsonBackup], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Student_Marks_Database_Backup_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Full database backup exported.', 'success');
    });

    // Restore JSON Backup
    const restoreInput = document.getElementById('input_restore_backup') as HTMLInputElement;
    if (restoreInput) {
      restoreInput.addEventListener('change', async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) {
          const text = await file.text();
          const result = await dbService.restoreFullDatabase(text);
          if (result.success) {
            showToast(result.message, 'success');
            this.settings = await dbService.getSettings();
            this.render();
          } else {
            showToast(result.message, 'error');
          }
        }
      });
    }

    // Clear Database
    document.getElementById('btn_clear_db')?.addEventListener('click', () => {
      openConfirmDeleteModal({
        title: 'Clear Entire Database',
        message: 'CRITICAL: This will permanently erase ALL student master records, enrolled subjects, and all recorded results. Are you sure you want to proceed?',
        confirmText: 'Erase All Data',
        onConfirm: async () => {
          await dbService.clearAllData();
          showToast('All local database records cleared.', 'info');
          this.render();
        }
      });
    });
  }

  // Handle uploaded files list (PDFs, Camera Photos, Scanned Images)
  private async handleUploadedFiles(files: File[]) {
    const validFiles = files.filter(f => {
      const name = f.name.toLowerCase();
      return (
        name.endsWith('.pdf') ||
        name.endsWith('.png') ||
        name.endsWith('.jpg') ||
        name.endsWith('.jpeg') ||
        name.endsWith('.webp') ||
        f.type.startsWith('image/')
      );
    });

    if (validFiles.length === 0) {
      showToast('Please select valid PDF documents or images (PNG, JPG, WEBP).', 'warning');
      return;
    }

    for (const file of validFiles) {
      await this.processSingleFile(file);
    }
  }

  // Process a single PDF or Image file and open Review Modal
  private async processSingleFile(file: File) {
    const isImage =
      file.type.startsWith('image/') ||
      /\.(png|jpe?g|webp)$/i.test(file.name);

    this.startCheetahProgress(file, isImage);

    try {
      let parsedData: ParsedPDFData;

      if (isImage) {
        // Image / Camera Capture: Process via Gemini Vision OCR directly
        parsedData = await processFileWithAiVision(
          file,
          this.settings.customAliases,
          (msg, pct) => {
            this.updateCheetahProgress(msg, pct);
          }
        );
      } else {
        // Standard PDF: Attempt fast local extraction first with smooth Cheetah progress
        parsedData = await parsePDFFile(
          file,
          this.settings.customAliases,
          (step, pct) => {
            this.updateCheetahProgress(step, pct);
          }
        );

        // If it's a scanned PDF without a text layer, seamlessly hand off to Gemini AI Vision
        if (parsedData.isScannedOrImageOnly || parsedData.rawRows.length === 0) {
          this.updateCheetahProgress('Scanned document detected. Engaging Gemini Vision AI OCR...', 50);

          parsedData = await processFileWithAiVision(
            file,
            this.settings.customAliases,
            (msg, pct) => {
              this.updateCheetahProgress(msg, pct);
            }
          );
        }
      }

      // Smooth sprint to 100% completion
      await this.finishCheetahProgress();

      if (parsedData.rawRows.length === 0) {
        showToast(`No structured student rows detected in "${file.name}".`, 'warning');
        return;
      }

      // Open interactive column mapping & import review screen
      openImportReviewModal(
        parsedData,
        async (confirmedMappings, subjectName, maxMarks, duplicateStrategy) => {
          showToast(`Committing ${parsedData.rawRows.length} marks to master database...`, 'info');

          const commitResult = await commitPDFImport(
            {
              parsedData,
              columnMappings: confirmedMappings,
              confirmedSubjectName: subjectName,
              maxMarks,
              duplicateResolutionStrategy: duplicateStrategy
            },
            this.settings
          );

          showToast(
            `Successfully imported ${commitResult.resultsImportedCount} marks (${commitResult.newStudentsCount} new students created, ${commitResult.matchedStudentsCount} merged).`,
            'success',
            5000
          );

          this.setTab('students');
        },
        () => {
          showToast('Import cancelled by administrator.', 'info');
        }
      );
    } catch (err: any) {
      console.error('[AppRenderer] Error during marksheet processing:', err);
      this.stopCheetahProgress();
      showToast(`Failed to parse ${file.name}: ${err?.message || 'Unknown processing error'}`, 'error');
    }
  }

  // AI Magic Import Modal
  private openAiMagicImportModal() {
    const modalHtml = `
      <div class="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-amber-50 dark:bg-amber-900/20">
        <h3 class="text-base font-bold text-amber-900 dark:text-amber-400 flex items-center gap-2">
          ${icons.sparkles} AI Smart Student Import
        </h3>
        <button onclick="document.getElementById('ai-magic-modal').remove()" class="p-1 text-slate-400 hover:text-slate-600">
          ${icons.x}
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
            ${icons.sparkles} Extract & Add Students
          </button>
        </div>
      </div>
    `;

    const backdrop = document.createElement('div');
    backdrop.id = 'ai-magic-modal';
    backdrop.className = 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm';
    backdrop.innerHTML = `
      <div class="relative w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden" onclick="event.stopPropagation()">
        ${modalHtml}
      </div>
    `;

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
            id: `stu_ai_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
            name: s.name || 'Unknown',
            normalizedName: normalizeName(s.name || 'Unknown'),
            rollNumber: s.rollNumber || 'TBD',
            normalizedRollNumber: normalizeRollNumber(s.rollNumber || 'TBD'),
            studentId: s.studentId || `REG${Date.now()}`,
            normalizedStudentId: normalizeStudentId(s.studentId || `REG${Date.now()}`),
            dynamicFields: s.dynamicFields || {},
            createdAt: timestamp,
            updatedAt: timestamp
          };
          await dbService.saveStudent(newStudent);
          successCount++;
        }

        showToast(`${icons.sparkles} Magic Success! Added ${successCount} students.`, 'success');
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

  private openAddStudentManualModal() {
    const modalHtml = `
      <div class="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
        <h3 class="text-base font-bold text-slate-900 dark:text-white">Create New Student Master Record</h3>
        <button onclick="document.getElementById('add-student-modal').remove()" class="p-1 text-slate-400 hover:text-slate-600">
          ${icons.x}
        </button>
      </div>

      <form id="form_create_student" class="p-4 md:p-6 space-y-4">
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
      </form>
    `;

    const backdrop = document.createElement('div');
    backdrop.id = 'add-student-modal';
    backdrop.className = 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm';
    backdrop.innerHTML = `
      <div class="relative w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden" onclick="event.stopPropagation()">
        ${modalHtml}
      </div>
    `;
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) backdrop.remove();
    });
    document.body.appendChild(backdrop);

    const form = backdrop.querySelector('#form_create_student') as HTMLFormElement;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = (backdrop.querySelector('#manual_stu_name') as HTMLInputElement).value.trim();
      const roll = (backdrop.querySelector('#manual_stu_roll') as HTMLInputElement).value.trim();
      const sId = (backdrop.querySelector('#manual_stu_id') as HTMLInputElement).value.trim();

      const newStudent: Student = {
        id: `stu_${Date.now()}`,
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
      showToast(`Student ${name} created.`, 'success');
      backdrop.remove();
      this.render();
    });
  }

  // Create Subject Manual Modal
  private openCreateSubjectModal() {
    const modalHtml = `
      <div class="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
        <h3 class="text-base font-bold text-slate-900 dark:text-white">Add Academic Subject</h3>
        <button onclick="document.getElementById('create-subject-modal').remove()" class="p-1 text-slate-400 hover:text-slate-600">
          ${icons.x}
        </button>
      </div>

      <form id="form_create_subject" class="p-4 md:p-6 space-y-4">
        <div>
          <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Subject Name *</label>
          <input type="text" id="manual_sub_name" required placeholder="e.g. Physics, Biochemistry" class="w-full text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2"/>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Max Marks</label>
            <input type="number" id="manual_sub_max" value="100" class="w-full text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2"/>
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Pass Marks</label>
            <input type="number" id="manual_sub_pass" value="40" class="w-full text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2"/>
          </div>
        </div>

        <div class="pt-4 flex justify-end gap-2">
          <button type="button" onclick="document.getElementById('create-subject-modal').remove()" class="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl">Cancel</button>
          <button type="submit" class="px-4 py-2 text-xs font-bold bg-sky-600 hover:bg-sky-500 text-white rounded-xl">Add Subject</button>
        </div>
      </form>
    `;

    const backdrop = document.createElement('div');
    backdrop.id = 'create-subject-modal';
    backdrop.className = 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm';
    backdrop.innerHTML = `
      <div class="relative w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden" onclick="event.stopPropagation()">
        ${modalHtml}
      </div>
    `;
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) backdrop.remove();
    });
    document.body.appendChild(backdrop);

    const form = backdrop.querySelector('#form_create_subject') as HTMLFormElement;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = (backdrop.querySelector('#manual_sub_name') as HTMLInputElement).value.trim();
      const max = parseInt((backdrop.querySelector('#manual_sub_max') as HTMLInputElement).value, 10) || 100;
      const pass = parseInt((backdrop.querySelector('#manual_sub_pass') as HTMLInputElement).value, 10) || 40;

      const newSubject: Subject = {
        id: `subj_${Date.now()}`,
        name,
        normalizedName: name.toLowerCase(),
        maxMarks: max,
        passMarks: pass,
        createdAt: new Date().toISOString()
      };

      await dbService.saveSubject(newSubject);
      showToast(`Subject ${name} created.`, 'success');
      backdrop.remove();
      this.render();
    });
  }
}
