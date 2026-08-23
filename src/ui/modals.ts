import {
  Student,
  Subject,
  Result,
  UnresolvedRecord,
  ParsedPDFData,
  ColumnMapping,
  SystemSettings
} from '../types';
import { dbService } from '../db/indexedDB';
import { icons } from './icons';
import { showToast } from './toast';
import { fetchAiInsights } from '../services/aiInsightsService';
import { exportSubjectMarksToCSV } from '../services/exportService';
import { generateReportCardPDF } from '../services/reportCardService';
import {
  normalizeName,
  normalizeRollNumber,
  normalizeStudentId,
  parseMarksValue,
  isSubjectField,
  detectFieldForHeader,
  formatFieldLabel,
  KNOWN_ACADEMIC_SUBJECTS
} from '../services/fieldNormalizer';

export function openModal(contentHtml: string, modalId: string = 'app-modal'): HTMLElement {
  closeModal(modalId);

  const backdrop = document.createElement('div');
  backdrop.id = modalId;
  backdrop.className = 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm overflow-y-auto animate-fade-in';
  
  backdrop.innerHTML = `
    <div class="relative w-full max-w-4xl max-h-[90vh] flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden my-auto text-slate-900 dark:text-slate-100" onclick="event.stopPropagation()">
      ${contentHtml}
    </div>
  `;

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) {
      closeModal(modalId);
    }
  });

  document.body.appendChild(backdrop);
  return backdrop;
}

export function closeModal(modalId: string = 'app-modal') {
  const existing = document.getElementById(modalId);
  if (existing) {
    existing.remove();
  }
}

/**
 * Universal Confirmation Modal (Safe for iframe and sandbox environments)
 */
export function openConfirmDeleteModal({
  title,
  message,
  confirmText = 'Delete',
  onConfirm
}: {
  title: string;
  message: string;
  confirmText?: string;
  onConfirm: () => void;
}) {
  const modalHtml = `
    <div class="p-4 md:p-6 space-y-4">
      <div class="flex items-center gap-3 text-rose-600 dark:text-rose-400">
        <div class="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-950 flex items-center justify-center font-bold">
          ${icons.trash}
        </div>
        <div>
          <h3 class="text-base font-bold text-slate-900 dark:text-white">${title}</h3>
          <p class="text-xs text-slate-500 dark:text-slate-400">This action cannot be undone.</p>
        </div>
      </div>
      <p class="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">${message}</p>
      <div class="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
        <button id="btn_cancel_confirm_del" class="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors">
          Cancel
        </button>
        <button id="btn_execute_confirm_del" class="px-4 py-2 text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white rounded-xl shadow transition-colors">
          ${confirmText}
        </button>
      </div>
    </div>
  `;

  const modalEl = openModal(modalHtml, 'confirm-del-modal');
  modalEl.querySelector('#btn_cancel_confirm_del')?.addEventListener('click', () => closeModal('confirm-del-modal'));
  modalEl.querySelector('#btn_execute_confirm_del')?.addEventListener('click', () => {
    closeModal('confirm-del-modal');
    onConfirm();
  });
}

/**
 * In-App Prompt Input Modal (Safe alternative to window.prompt)
 */
export function openPromptInputModal({
  title,
  subtitle,
  placeholder,
  defaultValue = '',
  onConfirm
}: {
  title: string;
  subtitle?: string;
  placeholder: string;
  defaultValue?: string;
  onConfirm: (val: string) => void;
}) {
  const modalHtml = `
    <div class="p-4 md:p-6 space-y-4">
      <div>
        <h3 class="text-base font-bold text-slate-900 dark:text-white">${title}</h3>
        ${subtitle ? `<p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">${subtitle}</p>` : ''}
      </div>
      <div>
        <input
          type="text"
          id="prompt_input_field"
          value="${defaultValue}"
          placeholder="${placeholder}"
          class="w-full text-sm font-medium bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 focus:ring-2 focus:ring-sky-500 focus:outline-none"
        />
      </div>
      <div class="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
        <button id="btn_cancel_prompt_inp" class="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors">
          Cancel
        </button>
        <button id="btn_confirm_prompt_inp" class="px-4 py-2 text-xs font-bold bg-sky-600 hover:bg-sky-500 text-white rounded-xl shadow transition-colors">
          Confirm
        </button>
      </div>
    </div>
  `;

  const modalEl = openModal(modalHtml, 'prompt-input-modal');
  const inputEl = modalEl.querySelector('#prompt_input_field') as HTMLInputElement;
  setTimeout(() => inputEl?.focus(), 50);

  modalEl.querySelector('#btn_cancel_prompt_inp')?.addEventListener('click', () => closeModal('prompt-input-modal'));
  
  const submitVal = () => {
    const val = inputEl?.value.trim();
    if (val) {
      closeModal('prompt-input-modal');
      onConfirm(val);
    } else {
      showToast('Please enter a value.', 'warning');
    }
  };

  inputEl?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitVal();
  });

  modalEl.querySelector('#btn_confirm_prompt_inp')?.addEventListener('click', submitVal);
}

/**
 * Interactive Import Review & Column Mapper Modal
 */
export function openImportReviewModal(
  parsedData: ParsedPDFData,
  onConfirm: (
    mappings: ColumnMapping[],
    subjectName: string,
    maxMarks: number,
    duplicateStrategy: 'replace' | 'keep_old' | 'version'
  ) => void,
  onCancel: () => void
) {
  let workingMappings = JSON.parse(JSON.stringify(parsedData.columnMappings || [])) as ColumnMapping[];
  let subjectName = parsedData.detectedSubject || 'General Subject';
  let maxMarks = 100;
  let duplicateStrategy: 'replace' | 'keep_old' | 'version' = 'replace';

  // Build clean comprehensive subject options
  const POPULAR_SUBJECTS = [
    'Physics', 'Chemistry', 'Mathematics', 'Biology', 'Computer Science',
    'English', 'Urdu', 'Geology', 'Applied IT', 'IT',
    'Documentary & Film Making', 'Communication', 'Botany', 'Zoology', 'History',
    'Geography', 'Islamiat', 'Pakistan Studies', 'Economics', 'Accounting',
    'Political Science', 'Sociology', 'Psychology', 'Biochemistry',
    'Environmental Science', 'Information Technology', 'Statistics',
    'Business Studies', 'Civics', 'Philosophy', 'Law'
  ];

  const renderContent = () => {
    const previewRows = parsedData.rawRows.slice(0, 6);

    // Calculate matrix statistics
    let detectedSubjectCount = 0;
    let detectedAttrCount = 0;
    let detectedIdentityCount = 0;

    for (const m of workingMappings) {
      if (!m.targetField || m.targetField === 'ignore') continue;
      if (m.targetField === 'name' || m.targetField === 'rollNumber' || m.targetField === 'studentId') {
        detectedIdentityCount++;
      } else if (isSubjectField(m.targetField).isSubject || m.targetField === 'marks') {
        detectedSubjectCount++;
      } else {
        detectedAttrCount++;
      }
    }

    const mappingRowsHtml = workingMappings
      .map((col, idx) => {
        const subCheck = isSubjectField(col.targetField);
        const isSubject = subCheck.isSubject || col.targetField === 'marks';
        const isIdentity = col.targetField === 'name' || col.targetField === 'rollNumber' || col.targetField === 'studentId';
        const isIgnored = col.targetField === 'ignore' || !col.targetField;

        const confColor =
          col.confidence >= 90
            ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
            : col.confidence >= 70
            ? 'bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border-sky-300 dark:border-sky-800'
            : col.confidence >= 50
            ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-800'
            : 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-800';

        const currentVal = col.targetField || 'ignore';
        const cleanLabel = formatFieldLabel(currentVal);

        const categoryBadge = isSubject
          ? `<span class="px-2.5 py-0.5 text-xs font-bold rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-800">Subject: ${subCheck.subjectName || subjectName}</span>`
          : isIdentity
          ? `<span class="px-2.5 py-0.5 text-xs font-bold rounded-full bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-300 border border-sky-300 dark:border-sky-800">Master Identity</span>`
          : isIgnored
          ? `<span class="px-2.5 py-0.5 text-xs font-medium rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700">Ignored</span>`
          : `<span class="px-2.5 py-0.5 text-xs font-bold rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">Attribute: ${cleanLabel}</span>`;

        // Check if current value matches custom subject
        const isCustomSubjectSelected =
          subCheck.isSubject &&
          !POPULAR_SUBJECTS.some(s => s.toLowerCase() === subCheck.subjectName.toLowerCase());

        const selectOptionsHtml = `
          <optgroup label="Student Identifiers">
            <option value="name" ${currentVal === 'name' ? 'selected' : ''}>Student Name</option>
            <option value="rollNumber" ${currentVal === 'rollNumber' ? 'selected' : ''}>Roll Number</option>
            <option value="studentId" ${currentVal === 'studentId' ? 'selected' : ''}>Student ID / Reg No</option>
          </optgroup>

          <optgroup label="Academic Subjects (Marks)">
            <option value="marks" ${currentVal === 'marks' ? 'selected' : ''}>General Marks / Score</option>
            ${POPULAR_SUBJECTS.map(s => {
              const isSel = subCheck.isSubject && subCheck.subjectName.toLowerCase() === s.toLowerCase();
              return `<option value="{subject: ${s}}" ${isSel ? 'selected' : ''}>${s}</option>`;
            }).join('')}
            ${isCustomSubjectSelected ? `<option value="{subject: ${subCheck.subjectName}}" selected>${subCheck.subjectName}</option>` : ''}
            <option value="__subject_custom__">+ Map to Custom Subject...</option>
          </optgroup>

          <optgroup label="Overall Performance Metrics">
            <option value="totalMarks" ${currentVal === 'totalMarks' ? 'selected' : ''}>Total Marks / Grand Total</option>
            <option value="maxMarks" ${currentVal === 'maxMarks' ? 'selected' : ''}>Max Marks (Out Of)</option>
            <option value="percentage" ${currentVal === 'percentage' ? 'selected' : ''}>Percentage (%)</option>
          </optgroup>

          <optgroup label="Student Profile Details">
            <option value="{class}" ${currentVal === '{class}' ? 'selected' : ''}>Class / Standard / Semester</option>
            <option value="{section}" ${currentVal === '{section}' ? 'selected' : ''}>Section / Batch / Session</option>
            <option value="{father_name}" ${currentVal === '{father_name}' ? 'selected' : ''}>Father's / Guardian Name</option>
            <option value="{dob}" ${currentVal === '{dob}' ? 'selected' : ''}>Date of Birth</option>
            <option value="{gender}" ${currentVal === '{gender}' ? 'selected' : ''}>Gender</option>
            <option value="{rank}" ${currentVal === '{rank}' ? 'selected' : ''}>Rank / Position</option>
            <option value="{remarks}" ${currentVal === '{remarks}' ? 'selected' : ''}>Remarks / Result Status</option>
            ${!isSubject && !isIdentity && !isIgnored && !['totalMarks', 'maxMarks', 'percentage', '{class}', '{section}', '{father_name}', '{dob}', '{gender}', '{rank}', '{remarks}'].includes(currentVal) ? `<option value="${currentVal}" selected>${cleanLabel}</option>` : ''}
            <option value="__custom__">+ Enter Custom Profile Field...</option>
          </optgroup>

          <optgroup label="Action">
            <option value="ignore" ${currentVal === 'ignore' ? 'selected' : ''}>🚫 Ignore This Column</option>
          </optgroup>
        `;

        return `
          <div class="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div class="flex-1 min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <span class="font-bold text-sm text-slate-800 dark:text-slate-200">${col.originalHeader}</span>
                ${categoryBadge}
                <span class="px-2 py-0.5 text-xs font-semibold rounded-full border ${confColor}">
                  ${col.confidence}% Confidence
                </span>
                <span class="text-xs font-medium px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                  ${cleanLabel}
                </span>
              </div>
              <div class="text-xs text-slate-500 dark:text-slate-400 mt-1.5 truncate">
                Samples: <strong class="text-slate-700 dark:text-slate-300">${col.sampleValues.slice(0, 3).join(', ') || 'No preview values'}</strong>
              </div>
            </div>

            <div class="flex items-center gap-2 shrink-0">
              <label class="text-xs font-semibold text-slate-500 dark:text-slate-400">Map To:</label>
              <select id="map_select_${idx}" data-idx="${idx}" class="appearance-none bg-no-repeat bg-right pr-8 mapping-select text-xs font-semibold bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 focus:ring-2 focus:ring-sky-500 focus:outline-none min-w-[200px]" style="background-image: url('data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 24 24\' stroke=\'%236b7280\'><path stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'2\' d=\'M19 9l-7 7-7-7\'/></svg>'); background-size: 16px; background-position-x: calc(100% - 12px);">
                ${selectOptionsHtml}
              </select>
            </div>
          </div>
        `;
      })
      .join('');

    const previewTableHeaders = parsedData.headers
      .map((h, i) => {
        const mapped = workingMappings[i]?.targetField || 'ignore';
        const isSub = isSubjectField(mapped).isSubject || mapped === 'marks';
        const displayLabel = mapped === 'ignore' ? 'Ignored' : formatFieldLabel(mapped);
        return `
          <th class="px-3 py-2 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800">
            <div class="flex items-center justify-between gap-2">
              <span>${h}</span>
              <span class="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${mapped === 'ignore' ? 'bg-slate-200 dark:bg-slate-700 text-slate-500' : isSub ? 'bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300' : 'bg-sky-100 dark:bg-sky-900 text-sky-700 dark:text-sky-300'}">${displayLabel}</span>
            </div>
          </th>
        `;
      })
      .join('');

    const previewTableRows = previewRows
      .map(row => `
        <tr class="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 text-xs">
          ${parsedData.headers.map(h => `<td class="px-3 py-2 text-slate-700 dark:text-slate-300 truncate max-w-[150px]">${row[h] || '-'}</td>`).join('')}
        </tr>
      `)
      .join('');

    return `
      <!-- Header -->
      <div class="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-sky-100 dark:bg-sky-900/60 text-sky-600 dark:text-sky-400 flex items-center justify-center font-bold">
            ${icons.filePdf}
          </div>
          <div>
            <h2 class="text-lg font-bold text-slate-900 dark:text-slate-100">Review PDF Extraction & Multi-Column Mapping</h2>
            <p class="text-xs text-slate-500 dark:text-slate-400">
              ${parsedData.fileName} • ${parsedData.pageCount} page(s) • ${parsedData.rawRows.length} rows • ${parsedData.headers.length} columns detected
            </p>
          </div>
        </div>
        <button id="btn_close_review" class="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
          ${icons.x}
        </button>
      </div>

      <!-- Body -->
      <div class="p-4 md:p-6 overflow-y-auto space-y-6 max-h-[70vh]">
        <!-- Multi-Subject Recognition Banner -->
        <div class="p-4 bg-gradient-to-r from-indigo-900/20 via-sky-900/20 to-purple-900/20 border border-indigo-200 dark:border-indigo-800 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div class="text-xs font-bold text-indigo-700 dark:text-indigo-300 uppercase tracking-wider flex items-center gap-1.5">
              <span>Academic Marks Matrix Engine</span>
            </div>
            <div class="text-sm font-semibold text-slate-900 dark:text-white mt-0.5">
              Detected <strong>${detectedSubjectCount} Subject Marks Columns</strong>, <strong>${detectedIdentityCount} Identifiers</strong>, and <strong>${detectedAttrCount} Student Attributes</strong>.
            </div>
            <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Supports 50+ college subjects and 20+ columns per row with zero manual entry.
            </p>
          </div>
          <button id="btn_auto_distribute_matrix" class="px-4 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl shadow transition-all hover:scale-105 active:scale-95 shrink-0 flex items-center gap-1.5">
            ${icons.sparkles}
            <span>Auto-Map All Columns</span>
          </button>
        </div>

        <!-- Subject & Max Marks Configuration -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 bg-sky-50/60 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800/50 rounded-xl p-4">
          <div>
            <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Primary / Fallback Subject Name:
            </label>
            <input
              type="text"
              id="input_review_subject"
              value="${subjectName}"
              class="w-full text-sm font-medium bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 focus:ring-2 focus:ring-sky-500 focus:outline-none"
              placeholder="e.g. Geology, English, Computer Science"
            />
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Default Maximum Marks:
            </label>
            <input
              type="number"
              id="input_review_maxmarks"
              value="${maxMarks}"
              min="1"
              max="1000"
              class="w-full text-sm font-medium bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 focus:ring-2 focus:ring-sky-500 focus:outline-none"
            />
          </div>
        </div>

        <!-- Column Mappings Section -->
        <div>
          <div class="flex items-center justify-between mb-2">
            <h3 class="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <span>Column Mappings</span>
            </h3>
            <span class="text-xs text-slate-500 dark:text-slate-400">Map student identifiers, individual subjects, and attributes</span>
          </div>
          <div class="space-y-2">
            ${mappingRowsHtml}
          </div>
        </div>

        <!-- Parsed Data Preview -->
        <div>
          <h3 class="text-sm font-bold text-slate-900 dark:text-slate-100 mb-2">Extracted Data Preview (First 6 Rows)</h3>
          <div class="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-xl">
            <table class="w-full border-collapse">
              <thead>
                <tr>${previewTableHeaders}</tr>
              </thead>
              <tbody>
                ${previewTableRows}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Duplicate Handling Strategy -->
        <div class="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-700">
          <label class="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-2">
            Duplicate Subject Marks Handling:
          </label>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label class="flex items-center gap-2 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 cursor-pointer text-xs">
              <input type="radio" name="dup_strategy" value="replace" ${duplicateStrategy === 'replace' ? 'checked' : ''} class="text-sky-600 focus:ring-sky-500"/>
              <div>
                <div class="font-semibold">Replace Old Marks</div>
                <div class="text-[11px] text-slate-500">Update existing student's score</div>
              </div>
            </label>
            <label class="flex items-center gap-2 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 cursor-pointer text-xs">
              <input type="radio" name="dup_strategy" value="keep_old" ${duplicateStrategy === 'keep_old' ? 'checked' : ''} class="text-sky-600 focus:ring-sky-500"/>
              <div>
                <div class="font-semibold">Keep Old Marks</div>
                <div class="text-[11px] text-slate-500">Ignore newer uploaded score</div>
              </div>
            </label>
            <label class="flex items-center gap-2 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 cursor-pointer text-xs">
              <input type="radio" name="dup_strategy" value="version" ${duplicateStrategy === 'version' ? 'checked' : ''} class="text-sky-600 focus:ring-sky-500"/>
              <div>
                <div class="font-semibold">Create New Version</div>
                <div class="text-[11px] text-slate-500">Append as version record</div>
              </div>
            </label>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div class="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex items-center justify-between">
        <button id="btn_cancel_review" class="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition-colors">
          Cancel
        </button>
        <button id="btn_confirm_review" class="flex items-center gap-2 px-5 py-2.5 text-xs font-bold bg-sky-600 hover:bg-sky-500 text-white rounded-xl shadow-md shadow-sky-600/20 transition-all hover:scale-[1.02] active:scale-[0.98]">
          ${icons.check}
          <span>Confirm & Import Records (${parsedData.rawRows.length})</span>
        </button>
      </div>
    `;
  };

  const modalEl = openModal(renderContent(), 'review-modal');

  const attachEvents = () => {
    modalEl.querySelectorAll('.mapping-select').forEach(select => {
      select.addEventListener('change', (e) => {
        const target = e.target as HTMLSelectElement;
        const idx = parseInt(target.dataset.idx || '0', 10);
        
        if (target.value === '__subject_custom__') {
          openPromptInputModal({
            title: 'Add Academic Subject',
            subtitle: 'Enter course name (e.g. Differential Equations, Organic Chemistry, Data Structures)',
            placeholder: 'Subject name...',
            onConfirm: (subInput) => {
              const formatted = `{subject:${subInput.trim()}}`;
              workingMappings[idx].targetField = formatted as any;
              workingMappings[idx].confidence = 100;
              modalEl.innerHTML = `<div class="relative w-full max-w-4xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden" onclick="event.stopPropagation()">${renderContent()}</div>`;
              attachEvents();
            }
          });
          return;
        }

        if (target.value === '__custom__') {
          openPromptInputModal({
            title: 'Add Custom Profile Field',
            subtitle: 'Enter attribute key (e.g. guardian_phone, semester, stream, batch)',
            placeholder: 'Attribute key...',
            onConfirm: (customKey) => {
              const formattedKey = `{${customKey.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_')}}`;
              workingMappings[idx].targetField = formattedKey as any;
              workingMappings[idx].confidence = 100;
              modalEl.innerHTML = `<div class="relative w-full max-w-4xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden" onclick="event.stopPropagation()">${renderContent()}</div>`;
              attachEvents();
            }
          });
          return;
        }
        workingMappings[idx].targetField = target.value as any;
        workingMappings[idx].confidence = 100; // Manual confirmation
        modalEl.innerHTML = `<div class="relative w-full max-w-4xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden" onclick="event.stopPropagation()">${renderContent()}</div>`;
        attachEvents();
      });
    });

    modalEl.querySelector('#btn_auto_distribute_matrix')?.addEventListener('click', () => {
      // Auto-detect and map all columns
      for (const col of workingMappings) {
        const detected = detectFieldForHeader(col.originalHeader, col.sampleValues, {
          name: [],
          rollNumber: [],
          studentId: [],
          marks: []
        });
        col.targetField = detected.targetField;
        col.confidence = 100;
      }
      showToast('All columns auto-categorized successfully!', 'success');
      modalEl.innerHTML = `<div class="relative w-full max-w-4xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden" onclick="event.stopPropagation()">${renderContent()}</div>`;
      attachEvents();
    });

    const subInput = modalEl.querySelector('#input_review_subject') as HTMLInputElement;
    if (subInput) {
      subInput.addEventListener('input', (e) => {
        subjectName = (e.target as HTMLInputElement).value;
      });
    }

    const maxInput = modalEl.querySelector('#input_review_maxmarks') as HTMLInputElement;
    if (maxInput) {
      maxInput.addEventListener('input', (e) => {
        maxMarks = parseInt((e.target as HTMLInputElement).value, 10) || 100;
      });
    }

    modalEl.querySelectorAll('input[name="dup_strategy"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        duplicateStrategy = (e.target as HTMLInputElement).value as any;
      });
    });

    modalEl.querySelector('#btn_close_review')?.addEventListener('click', () => {
      closeModal('review-modal');
      onCancel();
    });

    modalEl.querySelector('#btn_cancel_review')?.addEventListener('click', () => {
      closeModal('review-modal');
      onCancel();
    });

    modalEl.querySelector('#btn_confirm_review')?.addEventListener('click', () => {
      closeModal('review-modal');
      onConfirm(workingMappings, subjectName, maxMarks, duplicateStrategy);
    });
  };

  attachEvents();
}


/**
 * Student Master Profile Dossier Modal
 */
export async function openStudentProfileModal(
  studentId: string,
  settings: SystemSettings,
  onRefreshNeeded: () => void
) {
  const [student, results, allSubjects] = await Promise.all([
    dbService.getStudentById(studentId),
    dbService.getResultsByStudentId(studentId),
    dbService.getAllSubjects()
  ]);

  if (!student) {
    showToast('Student record not found.', 'error');
    return;
  }

  let totalScore = 0;
  let totalMax = 0;
  let numericCount = 0;

  const rowsHtml = results.map(r => {
    if (typeof r.marks === 'number') {
      totalScore += r.marks;
      totalMax += r.maxMarks;
      numericCount++;
    }

    const pct = r.percentage !== undefined ? `${r.percentage}%` : '-';
    const gradeColor =
      r.grade === 'A+' || r.grade === 'A' ? 'text-emerald-600 dark:text-emerald-400 font-bold' :
      r.grade === 'B+' || r.grade === 'B' ? 'text-sky-600 dark:text-sky-400 font-bold' :
      r.grade === 'C' || r.grade === 'D' ? 'text-amber-600 dark:text-amber-400 font-bold' :
      'text-rose-600 dark:text-rose-400 font-bold';

    return `
      <tr class="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50/60 dark:hover:bg-slate-800/40 text-xs">
        <td class="px-4 py-3 font-semibold text-slate-800 dark:text-slate-200">${r.subjectName}</td>
        <td class="px-4 py-3 font-bold text-center text-slate-900 dark:text-white">${r.marks}</td>
        <td class="px-4 py-3 text-center text-slate-500">${r.maxMarks}</td>
        <td class="px-4 py-3 text-center font-medium">${pct}</td>
        <td class="px-4 py-3 text-center ${gradeColor}">${r.grade || '-'}</td>
        <td class="px-4 py-3 text-slate-500">
          <span class="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-[11px] text-slate-600 dark:text-slate-300 truncate max-w-[140px]">
            ${icons.fileText}
            ${r.sourceFile}
          </span>
        </td>
        <td class="px-4 py-3 text-right">
          <button data-action="delete-result" data-id="${r.id}" class="p-1 text-slate-400 hover:text-rose-600 transition-colors" title="Delete result">
            ${icons.trash}
          </button>
        </td>
      </tr>
    `;
  }).join('');

  const overallPct = totalMax > 0 ? Math.round((totalScore / totalMax) * 1000) / 10 : 0;
  let overallGrade = 'N/A';
  if (overallPct >= 90) overallGrade = 'A+';
  else if (overallPct >= 80) overallGrade = 'A';
  else if (overallPct >= 70) overallGrade = 'B+';
  else if (overallPct >= 60) overallGrade = 'B';
  else if (overallPct >= 50) overallGrade = 'C';
  else if (overallPct >= (settings.passPercentage || 40)) overallGrade = 'D';
  else if (numericCount > 0) overallGrade = 'F';

  // Dynamic attributes entries
  const dynamicEntries = Object.entries(student.dynamicFields || {});
  const dynamicTagsHtml = dynamicEntries.length > 0
    ? dynamicEntries.map(([k, v]) => `
      <div class="flex items-center justify-between p-2.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
        <div>
          <span class="text-xs font-bold text-sky-600 dark:text-sky-400">${formatFieldLabel(k)}:</span>
          <span class="font-semibold text-slate-800 dark:text-slate-200 ml-2">${v}</span>
        </div>
        <button data-action="remove-dynamic-attr" data-key="${k}" class="text-slate-400 hover:text-rose-600 p-1 transition-colors" title="Remove field">
          ${icons.x}
        </button>
      </div>
    `).join('')
    : '<div class="text-xs text-slate-400 italic">No additional profile attributes recorded yet. Add any field below (e.g. Class, Father\'s Name, Section).</div>';

  const modalHtml = `
    <div class="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50">
      <div class="flex items-center gap-3">
        <div class="w-12 h-12 rounded-2xl bg-gradient-to-tr from-sky-500 to-indigo-600 text-white font-bold text-lg flex items-center justify-center shadow-md">
          ${student.name.charAt(0).toUpperCase()}
        </div>
        <div>
          <h2 class="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <span>${student.name}</span>
          </h2>
          <div class="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            <span>Roll No: <strong class="text-slate-700 dark:text-slate-300">${student.rollNumber}</strong></span>
            <span>•</span>
            <span>ID: <strong class="text-slate-700 dark:text-slate-300">${student.studentId}</strong></span>
          </div>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <button id="btn_print_student" class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-sm">
          ${icons.download}
          <span>Download PDF</span>
        </button>
        <button id="btn_close_profile" class="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800">
          ${icons.x}
        </button>
      </div>
    </div>

    <div class="p-4 md:p-6 overflow-y-auto space-y-6 max-h-[70vh]">
      <!-- Stats KPI Header -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div class="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700">
          <div class="text-[11px] font-semibold text-slate-500 uppercase">Total Marks</div>
          <div class="text-xl font-black text-slate-900 dark:text-white mt-1">${totalScore} / ${totalMax}</div>
        </div>
        <div class="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700">
          <div class="text-[11px] font-semibold text-slate-500 uppercase">Subjects Evaluated</div>
          <div class="text-xl font-black text-slate-900 dark:text-white mt-1">${results.length}</div>
        </div>
        <div class="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700">
          <div class="text-[11px] font-semibold text-slate-500 uppercase">Overall Average</div>
          <div class="text-xl font-black text-sky-600 dark:text-sky-400 mt-1">${overallPct}%</div>
        </div>
        <div class="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700">
          <div class="text-[11px] font-semibold text-slate-500 uppercase">Overall Grade</div>
          <div class="text-xl font-black ${overallGrade === 'F' ? 'text-rose-600' : 'text-emerald-600 dark:text-emerald-400'} mt-1">${overallGrade}</div>
        </div>
      </div>

      <!-- Student Profile Attributes Section -->
      <div class="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <h3 class="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
              Student Profile Attributes
            </h3>
          </div>
          <span class="text-[11px] text-slate-500">${dynamicEntries.length} field(s)</span>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
          ${dynamicTagsHtml}
        </div>

        <!-- Add Attribute Input -->
        <div class="pt-2 border-t border-slate-200 dark:border-slate-700 flex flex-wrap sm:flex-nowrap items-center gap-2">
          <input
            type="text"
            id="input_new_dynamic_key"
            placeholder="Field key (e.g. class, father_name, section)"
            class="flex-1 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-sky-500 focus:outline-none"
          />
          <input
            type="text"
            id="input_new_dynamic_val"
            placeholder="Value (e.g. 10th-A, Tariq Dar)"
            class="flex-1 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-sky-500 focus:outline-none"
          />
          <button id="btn_add_dynamic_attr" class="px-3 py-1.5 text-xs font-bold bg-sky-600 hover:bg-sky-500 text-white rounded-lg transition-colors shrink-0">
            + Add Field
          </button>
        </div>
      </div>

      <!-- Subject Marks Table -->
      <div>
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            ${icons.subjects}
            <span>Subject Marks Master Sheet</span>
          </h3>
          <button id="btn_add_mark_manual" class="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/60 border border-sky-200 dark:border-sky-800 rounded-lg hover:bg-sky-100 dark:hover:bg-sky-900 transition-colors">
            ${icons.plus}
            <span>Add Marks</span>
          </button>
        </div>

        <div class="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-xl">
          <table class="w-full border-collapse">
            <thead>
              <tr class="bg-slate-50 dark:bg-slate-800 text-[11px] uppercase tracking-wider text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                <th class="px-4 py-2.5 text-left font-semibold">Subject</th>
                <th class="px-4 py-2.5 text-center font-semibold">Marks</th>
                <th class="px-4 py-2.5 text-center font-semibold">Max</th>
                <th class="px-4 py-2.5 text-center font-semibold">%</th>
                <th class="px-4 py-2.5 text-center font-semibold">Grade</th>
                <th class="px-4 py-2.5 text-left font-semibold">Source PDF</th>
                <th class="px-4 py-2.5 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml || `<tr><td colspan="7" class="px-4 py-8 text-center text-xs text-slate-400">No subject marks recorded yet. Upload a marksheet PDF or add manually.</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Master Record Metadata -->
      <div class="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-700/60 text-xs space-y-2">
        <div class="font-bold text-slate-800 dark:text-slate-200">System Master Record Info:</div>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 text-slate-600 dark:text-slate-400">
          <div>Internal ID: <code class="text-[11px] bg-slate-200 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-700 dark:text-slate-300">${student.id}</code></div>
          <div>Created: ${new Date(student.createdAt).toLocaleDateString()}</div>
          <div>Last Updated: ${new Date(student.updatedAt || student.createdAt).toLocaleDateString()}</div>
        </div>
      </div>
    </div>

    <div class="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex items-center justify-between">
      <button id="btn_delete_student" class="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition-colors">
        ${icons.trash}
        <span>Delete Student</span>
      </button>
      <button id="btn_close_dossier" class="px-4 py-2 text-xs font-semibold bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl transition-colors">
        Close
      </button>
    </div>
  `;

  const modalEl = openModal(modalHtml, 'profile-modal');

  modalEl.querySelector('#btn_close_profile')?.addEventListener('click', () => closeModal('profile-modal'));
  modalEl.querySelector('#btn_close_dossier')?.addEventListener('click', () => closeModal('profile-modal'));

  modalEl.querySelector('#btn_print_student')?.addEventListener('click', () => {
    generateReportCardPDF(student, results).catch(e => console.error('PDF Error:', e));
  });

  // Dynamic Attribute Addition
  modalEl.querySelector('#btn_add_dynamic_attr')?.addEventListener('click', async () => {
    const keyInput = modalEl.querySelector('#input_new_dynamic_key') as HTMLInputElement;
    const valInput = modalEl.querySelector('#input_new_dynamic_val') as HTMLInputElement;
    const rawKey = keyInput?.value.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const val = valInput?.value.trim();

    if (!rawKey || !val) {
      showToast('Please enter both field name and value.', 'warning');
      return;
    }

    if (!student.dynamicFields) student.dynamicFields = {};
    student.dynamicFields[rawKey] = val;
    student.updatedAt = new Date().toISOString();

    await dbService.saveStudent(student);
    showToast(`Added attribute ${formatFieldLabel(rawKey)} = "${val}"`, 'success');
    openStudentProfileModal(studentId, settings, onRefreshNeeded);
    onRefreshNeeded();
  });

  // Dynamic Attribute Removal
  modalEl.querySelectorAll('[data-action="remove-dynamic-attr"]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const key = (e.currentTarget as HTMLElement).dataset.key;
      if (key && student.dynamicFields && student.dynamicFields[key]) {
        delete student.dynamicFields[key];
        student.updatedAt = new Date().toISOString();
        await dbService.saveStudent(student);
        showToast(`Removed attribute ${formatFieldLabel(key)}`, 'info');
        openStudentProfileModal(studentId, settings, onRefreshNeeded);
        onRefreshNeeded();
      }
    });
  });

  modalEl.querySelector('#btn_delete_student')?.addEventListener('click', () => {
    openConfirmDeleteModal({
      title: `Delete Student Record`,
      message: `Are you sure you want to permanently delete student "${student.name}" and all their associated subject marks?`,
      confirmText: 'Delete Record',
      onConfirm: async () => {
        await dbService.deleteStudent(student.id);
        showToast(`Student ${student.name} deleted successfully.`, 'success');
        closeModal('profile-modal');
        onRefreshNeeded();
      }
    });
  });

  modalEl.querySelectorAll('[data-action="delete-result"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const resId = (e.currentTarget as HTMLElement).dataset.id;
      if (resId) {
        openConfirmDeleteModal({
          title: 'Delete Subject Mark',
          message: 'Are you sure you want to delete this subject mark entry from the student dossier?',
          confirmText: 'Delete Mark',
          onConfirm: async () => {
            await dbService.deleteResult(resId);
            showToast('Subject mark deleted.', 'success');
            openStudentProfileModal(studentId, settings, onRefreshNeeded);
            onRefreshNeeded();
          }
        });
      }
    });
  });

  modalEl.querySelector('#btn_add_mark_manual')?.addEventListener('click', () => {
    openAddResultModal(student, allSubjects, settings, () => {
      openStudentProfileModal(studentId, settings, onRefreshNeeded);
      onRefreshNeeded();
    });
  });
}

/**
 * Add Subject Result Modal
 */
export function openAddResultModal(
  student: Student,
  subjects: Subject[],
  settings: SystemSettings,
  onComplete: () => void
) {
  const subjectOptions = subjects
    .map(s => `<option value="${s.id}">${s.name} (Max: ${s.maxMarks})</option>`)
    .join('');

  const modalHtml = `
    <div class="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
      <h3 class="text-base font-bold text-slate-900 dark:text-white">Record Marks for ${student.name}</h3>
      <button onclick="document.getElementById('add-result-modal').remove()" class="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
        ${icons.x}
      </button>
    </div>

    <form id="form_add_result" class="p-4 md:p-6 space-y-4">
      <div>
        <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Subject:</label>
        <select id="sel_subject" required class="appearance-none bg-no-repeat bg-right pr-8 w-full text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2" style="background-image: url('data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 24 24\' stroke=\'%236b7280\'><path stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'2\' d=\'M19 9l-7 7-7-7\'/></svg>'); background-size: 16px; background-position-x: calc(100% - 12px);">
          ${subjectOptions}
          <option value="__new__">+ Create New Subject...</option>
        </select>
      </div>

      <div id="new_subject_field" class="hidden">
        <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">New Subject Name:</label>
        <input type="text" id="input_new_subject_name" class="w-full text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2" placeholder="e.g. Mathematics"/>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Marks Obtained:</label>
          <input type="text" id="input_marks_val" required placeholder="e.g. 85 or AB" class="w-full text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2"/>
        </div>
        <div>
          <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Maximum Marks:</label>
          <input type="number" id="input_max_val" value="${settings.defaultMaxMarks || 100}" class="w-full text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2"/>
        </div>
      </div>

      <div class="pt-4 flex justify-end gap-2">
        <button type="button" onclick="document.getElementById('add-result-modal').remove()" class="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl">Cancel</button>
        <button type="submit" class="px-4 py-2 text-xs font-bold bg-sky-600 hover:bg-sky-500 text-white rounded-xl">Save Mark</button>
      </div>
    </form>
  `;

  const modalEl = openModal(modalHtml, 'add-result-modal');

  const selSub = modalEl.querySelector('#sel_subject') as HTMLSelectElement;
  const newSubDiv = modalEl.querySelector('#new_subject_field') as HTMLElement;

  selSub.addEventListener('change', () => {
    if (selSub.value === '__new__') {
      newSubDiv.classList.remove('hidden');
    } else {
      newSubDiv.classList.add('hidden');
    }
  });

  const form = modalEl.querySelector('#form_add_result') as HTMLFormElement;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    let targetSubjectId = selSub.value;
    let targetSubjectName = '';
    const maxVal = parseInt((modalEl.querySelector('#input_max_val') as HTMLInputElement).value, 10) || 100;

    if (targetSubjectId === '__new__') {
      const newName = (modalEl.querySelector('#input_new_subject_name') as HTMLInputElement).value.trim();
      if (!newName) {
        showToast('Please enter a subject name.', 'error');
        return;
      }
      const newSub: Subject = {
        id: `subj_${Date.now()}`,
        name: newName,
        normalizedName: newName.toLowerCase(),
        maxMarks: maxVal,
        passMarks: Math.round(maxVal * 0.4),
        createdAt: new Date().toISOString()
      };
      await dbService.saveSubject(newSub);
      targetSubjectId = newSub.id;
      targetSubjectName = newSub.name;
    } else {
      const existing = subjects.find(s => s.id === targetSubjectId);
      targetSubjectName = existing ? existing.name : 'General Subject';
    }

    const marksStr = (modalEl.querySelector('#input_marks_val') as HTMLInputElement).value.trim();
    const parsed = parseMarksValue(marksStr, maxVal);

    const result: Result = {
      id: `res_${Date.now()}`,
      studentId: student.id,
      subjectId: targetSubjectId,
      subjectName: targetSubjectName,
      marks: parsed.marks,
      numericMarks: parsed.numericMarks,
      maxMarks: parsed.maxMarks,
      percentage: parsed.percentage,
      grade: parsed.grade,
      sourceFile: 'Manual Entry',
      importId: 'manual',
      importedAt: new Date().toISOString(),
      version: 1
    };

    await dbService.saveResult(result);
    showToast('Marks saved successfully.', 'success');
    closeModal('add-result-modal');
    onComplete();
  });
}

/**
 * Subject Details Sheet Modal
 */
export async function openSubjectDetailsModal(
  subject: Subject,
  settings: SystemSettings,
  onRefreshNeeded: () => void
) {
  const [allStudents, allResults] = await Promise.all([
    dbService.getAllStudents(),
    dbService.getResultsBySubjectId(subject.id)
  ]);

  const studentMap = new Map(allStudents.map(s => [s.id, s]));

  // Sort by marks desc
  const sortedResults = [...allResults].sort((a, b) => {
    const numA = typeof a.marks === 'number' ? a.marks : -1;
    const numB = typeof b.marks === 'number' ? b.marks : -1;
    return numB - numA;
  });

  let totalScore = 0;
  let numericCount = 0;
  let highest = 0;
  let lowest = Infinity;
  let passCount = 0;

  const rowsHtml = sortedResults.map((r, idx) => {
    const student = studentMap.get(r.studentId);
    if (typeof r.marks === 'number') {
      totalScore += r.marks;
      numericCount++;
      if (r.marks > highest) highest = r.marks;
      if (r.marks < lowest) lowest = r.marks;
      if ((r.percentage || 0) >= (settings.passPercentage || 40)) passCount++;
    }

    return `
      <tr class="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 text-xs">
        <td class="px-4 py-2.5 text-center font-bold text-slate-400">${idx + 1}</td>
        <td class="px-4 py-2.5 font-bold text-slate-800 dark:text-slate-200 cursor-pointer hover:text-sky-600" data-student-id="${student?.id || ''}">
          ${student ? student.name : 'Unknown Student'}
        </td>
        <td class="px-4 py-2.5 text-slate-600 dark:text-slate-400 font-mono">${student?.rollNumber || '-'}</td>
        <td class="px-4 py-2.5 text-slate-600 dark:text-slate-400 font-mono">${student?.studentId || '-'}</td>
        <td class="px-4 py-2.5 text-center font-bold text-slate-900 dark:text-white">${r.marks}</td>
        <td class="px-4 py-2.5 text-center">${r.percentage !== undefined ? `${r.percentage}%` : '-'}</td>
        <td class="px-4 py-2.5 text-center font-bold text-sky-600">${r.grade || '-'}</td>
        <td class="px-4 py-2.5 text-slate-500 text-[11px]">${r.sourceFile}</td>
      </tr>
    `;
  }).join('');

  const classAvg = numericCount > 0 ? Math.round((totalScore / numericCount) * 10) / 10 : 0;
  const passRate = numericCount > 0 ? Math.round((passCount / numericCount) * 100) : 0;

  const modalHtml = `
    <div class="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-900/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold">
          ${icons.subjects}
        </div>
        <div>
          <h2 class="text-lg font-bold text-slate-900 dark:text-white">${subject.name} - Marksheet</h2>
          <p class="text-xs text-slate-500 dark:text-slate-400">
            ${allResults.length} Enrolled Students • Max Marks: ${subject.maxMarks}
          </p>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <button id="btn_export_subject_csv" class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-xl hover:bg-slate-50 transition-colors shadow-sm">
          ${icons.download}
          <span>Export CSV</span>
        </button>
        <button onclick="document.getElementById('subject-modal').remove()" class="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg">
          ${icons.x}
        </button>
      </div>
    </div>

    <div class="p-4 md:p-6 overflow-y-auto space-y-5 max-h-[70vh]">
      <!-- Stats -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div class="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700">
          <div class="text-[11px] font-semibold text-slate-500">Class Average</div>
          <div class="text-lg font-black text-slate-900 dark:text-white mt-0.5">${classAvg} / ${subject.maxMarks}</div>
        </div>
        <div class="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700">
          <div class="text-[11px] font-semibold text-slate-500">Highest Score</div>
          <div class="text-lg font-black text-emerald-600 mt-0.5">${highest > 0 ? highest : '-'}</div>
        </div>
        <div class="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700">
          <div class="text-[11px] font-semibold text-slate-500">Lowest Score</div>
          <div class="text-lg font-black text-amber-600 mt-0.5">${lowest !== Infinity ? lowest : '-'}</div>
        </div>
        <div class="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700">
          <div class="text-[11px] font-semibold text-slate-500">Pass Rate</div>
          <div class="text-lg font-black text-sky-600 mt-0.5">${passRate}%</div>
        </div>
      </div>

      <!-- Student Marks Table -->
      <div class="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-xl">
        <table class="w-full border-collapse">
          <thead>
            <tr class="bg-slate-50 dark:bg-slate-800 text-[11px] uppercase tracking-wider text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
              <th class="px-4 py-2.5 text-center font-semibold">Rank</th>
              <th class="px-4 py-2.5 text-left font-semibold">Student Name</th>
              <th class="px-4 py-2.5 text-left font-semibold">Roll No</th>
              <th class="px-4 py-2.5 text-left font-semibold">Student ID</th>
              <th class="px-4 py-2.5 text-center font-semibold">Marks</th>
              <th class="px-4 py-2.5 text-center font-semibold">%</th>
              <th class="px-4 py-2.5 text-center font-semibold">Grade</th>
              <th class="px-4 py-2.5 text-left font-semibold">Source PDF</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml || `<tr><td colspan="8" class="px-4 py-8 text-center text-xs text-slate-400">No results found for this subject.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>

    <div class="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex justify-end">
      <button onclick="document.getElementById('subject-modal').remove()" class="px-4 py-2 text-xs font-semibold bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-xl">
        Close
      </button>
    </div>
  `;

  const modalEl = openModal(modalHtml, 'subject-modal');

  modalEl.querySelector('#btn_export_subject_csv')?.addEventListener('click', () => {
    exportSubjectMarksToCSV(subject, allStudents, allResults);
  });

  modalEl.querySelectorAll('[data-student-id]').forEach(td => {
    td.addEventListener('click', (e) => {
      const sId = (e.currentTarget as HTMLElement).dataset.studentId;
      if (sId) {
        closeModal('subject-modal');
        openStudentProfileModal(sId, settings, onRefreshNeeded);
      }
    });
  });
}

/**
 * Resolve Unresolved Record Modal
 */
export async function openResolveRecordModal(
  record: UnresolvedRecord,
  settings: SystemSettings,
  onResolved: () => void
) {
  const existingStudents = await dbService.getAllStudents();

  const modalHtml = `
    <div class="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-amber-50/50 dark:bg-amber-950/20">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/60 text-amber-600 dark:text-amber-400 flex items-center justify-center">
          ${icons.alert}
        </div>
        <div>
          <h2 class="text-lg font-bold text-slate-900 dark:text-white">Manual Record Resolution</h2>
          <p class="text-xs text-slate-500 dark:text-slate-400">
            Source: ${record.fileName} • Page ${record.pageNumber}
          </p>
        </div>
      </div>
      <button onclick="document.getElementById('resolve-modal').remove()" class="p-1 text-slate-400 hover:text-slate-600">
        ${icons.x}
      </button>
    </div>

    <div class="p-4 md:p-6 overflow-y-auto space-y-5 max-h-[70vh]">
      <div class="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-xl text-xs text-amber-800 dark:text-amber-300">
        <strong>Reason for Unresolved Status:</strong> ${record.reason}
        <div class="mt-1">Missing Identifiers: <strong>${record.missingFields.join(', ') || 'Ambiguous Match'}</strong></div>
      </div>

      <!-- Raw Row Key-Values -->
      <div>
        <h4 class="text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">Raw PDF Data Extracted:</h4>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
          ${Object.entries(record.rawRowData).map(([k, v]) => `
            <div>
              <span class="text-slate-400 block text-[10px] uppercase font-semibold">${k}:</span>
              <span class="font-medium text-slate-800 dark:text-slate-200">${v || '-'}</span>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Resolution Tabs -->
      <div class="space-y-4">
        <h4 class="text-xs font-bold text-slate-700 dark:text-slate-300">Choose Resolution Method:</h4>
        
        <div class="space-y-3">
          <!-- Option 1: Match Existing Student -->
          <div class="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl">
            <label class="flex items-center gap-2 font-bold text-xs text-slate-800 dark:text-slate-200 mb-2">
              <input type="radio" name="res_type" value="match_existing" checked class="text-sky-600"/>
              <span>Option A: Link to an Existing Student in Database</span>
            </label>
            <div id="opt_existing_panel" class="mt-2">
              <select id="sel_existing_student" class="appearance-none bg-no-repeat bg-right pr-8 w-full text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2" style="background-image: url('data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 24 24\' stroke=\'%236b7280\'><path stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'2\' d=\'M19 9l-7 7-7-7\'/></svg>'); background-size: 16px; background-position-x: calc(100% - 12px);">
                <option value="">-- Select Existing Student --</option>
                ${existingStudents.map(s => `<option value="${s.id}">${s.name} (Roll: ${s.rollNumber}, ID: ${s.studentId})</option>`).join('')}
              </select>
            </div>
          </div>

          <!-- Option 2: Complete and Create New Student -->
          <div class="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl">
            <label class="flex items-center gap-2 font-bold text-xs text-slate-800 dark:text-slate-200 mb-2">
              <input type="radio" name="res_type" value="create_new" class="text-sky-600"/>
              <span>Option B: Create New Student Master Profile</span>
            </label>
            <div id="opt_new_panel" class="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2">
              <div>
                <label class="block text-[10px] text-slate-500 uppercase font-semibold">Name</label>
                <input type="text" id="res_new_name" value="${record.detectedFields.name || ''}" class="w-full text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5"/>
              </div>
              <div>
                <label class="block text-[10px] text-slate-500 uppercase font-semibold">Roll Number</label>
                <input type="text" id="res_new_roll" value="${record.detectedFields.rollNumber || ''}" class="w-full text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5"/>
              </div>
              <div>
                <label class="block text-[10px] text-slate-500 uppercase font-semibold">Student / Reg ID</label>
                <input type="text" id="res_new_id" value="${record.detectedFields.studentId || ''}" class="w-full text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5"/>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex items-center justify-between">
      <button id="btn_discard_record" class="text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 px-3 py-1.5 rounded-xl transition-colors">
        Discard Record
      </button>
      <div class="flex items-center gap-2">
        <button onclick="document.getElementById('resolve-modal').remove()" class="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-xl">Cancel</button>
        <button id="btn_submit_resolution" class="px-4 py-2 text-xs font-bold bg-sky-600 hover:bg-sky-500 text-white rounded-xl shadow-md">Complete Resolution</button>
      </div>
    </div>
  `;

  const modalEl = openModal(modalHtml, 'resolve-modal');

  modalEl.querySelector('#btn_discard_record')?.addEventListener('click', () => {
    openConfirmDeleteModal({
      title: 'Discard Unresolved Record',
      message: 'Are you sure you want to discard this unresolved row from the import queue?',
      confirmText: 'Discard Record',
      onConfirm: async () => {
        record.status = 'discarded';
        await dbService.saveUnresolvedRecord(record);
        showToast('Record discarded.', 'info');
        closeModal('resolve-modal');
        onResolved();
      }
    });
  });

  modalEl.querySelector('#btn_submit_resolution')?.addEventListener('click', async () => {
    const resType = (modalEl.querySelector('input[name="res_type"]:checked') as HTMLInputElement)?.value;

    let targetStudent: Student | undefined;

    if (resType === 'match_existing') {
      const selectedId = (modalEl.querySelector('#sel_existing_student') as HTMLSelectElement).value;
      if (!selectedId) {
        showToast('Please pick an existing student to link with.', 'error');
        return;
      }
      targetStudent = existingStudents.find(s => s.id === selectedId);
      if (targetStudent && record.dynamicFields && Object.keys(record.dynamicFields).length > 0) {
        targetStudent.dynamicFields = {
          ...(targetStudent.dynamicFields || {}),
          ...record.dynamicFields
        };
        targetStudent.updatedAt = new Date().toISOString();
        await dbService.saveStudent(targetStudent);
      }
    } else {
      const name = (modalEl.querySelector('#res_new_name') as HTMLInputElement).value.trim();
      const roll = (modalEl.querySelector('#res_new_roll') as HTMLInputElement).value.trim();
      const sId = (modalEl.querySelector('#res_new_id') as HTMLInputElement).value.trim();

      if (!name) {
        showToast('Please provide a student name.', 'error');
        return;
      }

      targetStudent = {
        id: `stu_${Date.now()}`,
        name,
        normalizedName: normalizeName(name),
        rollNumber: roll || 'N/A',
        normalizedRollNumber: normalizeRollNumber(roll || 'N/A'),
        studentId: sId || 'N/A',
        aliases: [],
        dynamicFields: { ...(record.dynamicFields || {}) },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      await dbService.saveStudent(targetStudent);
    }

    if (targetStudent && record.detectedFields.marks) {
      // Create Result
      const parsed = parseMarksValue(record.detectedFields.marks, settings.defaultMaxMarks);
      const result: Result = {
        id: `res_${Date.now()}`,
        studentId: targetStudent.id,
        subjectId: `subj_${record.fileName.replace(/\.pdf$/i, '')}`,
        subjectName: record.fileName.replace(/\.pdf$/i, ''),
        marks: parsed.marks,
        numericMarks: parsed.numericMarks,
        maxMarks: parsed.maxMarks,
        percentage: parsed.percentage,
        grade: parsed.grade,
        sourceFile: record.fileName,
        importId: record.importId,
        importedAt: new Date().toISOString(),
        version: 1
      };
      await dbService.saveResult(result);
    }

    record.status = 'resolved';
    await dbService.saveUnresolvedRecord(record);
    showToast('Record resolved successfully.', 'success');
    closeModal('resolve-modal');
    onResolved();
  });
}


/**
 * AI Insights Modal
 */
export async function openAiInsightsModal(students: Student[], results: Result[]) {
  if (students.length === 0) {
    showToast('No students available for insights.', 'warning');
    return;
  }

  const modalHtml = `
    <div class="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-gradient-to-r from-amber-500 to-orange-600 text-white">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur-md">
          ${icons.sparkles}
        </div>
        <h2 class="text-xl font-bold">AI Performance Predictor</h2>
      </div>
      <button id="btn_close_insights" class="p-2 text-white/80 hover:text-white rounded-xl hover:bg-white/10 transition-colors">
        ${icons.x}
      </button>
    </div>

    <div id="insights_content" class="p-4 md:p-6 overflow-y-auto max-h-[70vh] space-y-6">
      <div class="flex flex-col items-center justify-center py-12">
        <div class="w-12 h-12 border-4 border-amber-200 border-t-amber-500 rounded-full animate-spin mb-4"></div>
        <div class="text-slate-500 dark:text-slate-400 font-semibold text-sm">Analyzing class performance...</div>
      </div>
    </div>
  `;

  const modalEl = openModal(modalHtml, 'insights-modal');
  modalEl.querySelector('#btn_close_insights')?.addEventListener('click', () => closeModal('insights-modal'));

  try {
    const data = await fetchAiInsights(students, results);
    
    const topPerformersHtml = (data.topPerformers || []).map((p: any, idx: number) => `
      <div class="flex items-start gap-4 p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-100 dark:border-emerald-800">
        <div class="w-8 h-8 shrink-0 rounded-full bg-emerald-500 text-white flex items-center justify-center font-bold text-xs shadow-md">
          #${idx + 1}
        </div>
        <div>
          <div class="font-bold text-slate-900 dark:text-white">${p.name}</div>
          <div class="text-xs text-slate-600 dark:text-slate-300 mt-1">${p.feedback}</div>
        </div>
      </div>
    `).join('');

    const atRiskHtml = (data.atRiskStudents || []).map((p: any) => `
      <div class="flex items-start gap-4 p-4 bg-rose-50 dark:bg-rose-900/20 rounded-xl border border-rose-100 dark:border-rose-800">
        <div class="w-8 h-8 shrink-0 rounded-full bg-rose-500 text-white flex items-center justify-center shadow-md">
          ${icons.alert}
        </div>
        <div>
          <div class="font-bold text-slate-900 dark:text-white">${p.name}</div>
          <div class="text-xs text-slate-600 dark:text-slate-300 mt-1">${p.feedback}</div>
        </div>
      </div>
    `).join('');

    const contentEl = modalEl.querySelector('#insights_content');
    if (contentEl) {
      contentEl.innerHTML = `
        <div class="p-5 bg-amber-50 dark:bg-amber-900/20 rounded-2xl border border-amber-200 dark:border-amber-800">
          <div class="flex gap-3">
            <div class="text-amber-500 mt-1">${icons.sparkles}</div>
            <div>
              <h3 class="font-bold text-amber-900 dark:text-amber-300 mb-1">Class Summary</h3>
              <p class="text-sm text-amber-800 dark:text-amber-200 leading-relaxed">${data.classSummary}</p>
            </div>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div class="space-y-4">
            <h3 class="font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span class="text-emerald-500">${icons.check}</span>
              Top Performers
            </h3>
            <div class="space-y-3">
              ${topPerformersHtml || '<div class="text-xs text-slate-500">Not enough data.</div>'}
            </div>
          </div>

          <div class="space-y-4">
            <h3 class="font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span class="text-rose-500">${icons.alert}</span>
              At-Risk Students
            </h3>
            <div class="space-y-3">
              ${atRiskHtml || '<div class="text-xs text-slate-500">No at-risk students identified.</div>'}
            </div>
          </div>
        </div>
      `;
    }
  } catch (error: any) {
    const contentEl = modalEl.querySelector('#insights_content');
    if (contentEl) {
      contentEl.innerHTML = `
        <div class="p-6 text-center text-rose-500 flex flex-col items-center gap-2">
          ${icons.alert}
          <div class="font-bold">Failed to load insights</div>
          <div class="text-xs">${error.message || 'Unknown error'}</div>
        </div>
      `;
    }
  }
}
