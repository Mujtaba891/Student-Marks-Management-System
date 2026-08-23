import { Student, Subject, Result, ImportRecord, UnresolvedRecord, SystemSettings } from '../types';

const DB_NAME = 'StudentMarksMasterDB';
const DB_VERSION = 1;

export const DEFAULT_SETTINGS: SystemSettings = {
  institutionName: 'Govt. SHMM Degree College Anantnag',
  academicSession: '2025-2026',
  defaultMaxMarks: 100,
  passPercentage: 40,
  theme: 'light',
  customAliases: {
    name: [],
    rollNumber: [],
    studentId: [],
    marks: []
  }
};

class DatabaseService {
  private dbPromise: Promise<IDBDatabase> | null = null;

  public getDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Students Store
        if (!db.objectStoreNames.contains('students')) {
          const studentStore = db.createObjectStore('students', { keyPath: 'id' });
          studentStore.createIndex('name', 'name', { unique: false });
          studentStore.createIndex('normalizedName', 'normalizedName', { unique: false });
          studentStore.createIndex('rollNumber', 'rollNumber', { unique: false });
          studentStore.createIndex('normalizedRollNumber', 'normalizedRollNumber', { unique: false });
          studentStore.createIndex('studentId', 'studentId', { unique: false });
        }

        // Subjects Store
        if (!db.objectStoreNames.contains('subjects')) {
          const subjectStore = db.createObjectStore('subjects', { keyPath: 'id' });
          subjectStore.createIndex('name', 'name', { unique: false });
          subjectStore.createIndex('normalizedName', 'normalizedName', { unique: true });
        }

        // Results Store
        if (!db.objectStoreNames.contains('results')) {
          const resultStore = db.createObjectStore('results', { keyPath: 'id' });
          resultStore.createIndex('studentId', 'studentId', { unique: false });
          resultStore.createIndex('subjectId', 'subjectId', { unique: false });
          resultStore.createIndex('student_subject', ['studentId', 'subjectId'], { unique: false });
          resultStore.createIndex('sourceFile', 'sourceFile', { unique: false });
        }

        // Import History Store
        if (!db.objectStoreNames.contains('imports')) {
          const importStore = db.createObjectStore('imports', { keyPath: 'id' });
          importStore.createIndex('importedAt', 'importedAt', { unique: false });
          importStore.createIndex('subject', 'subject', { unique: false });
        }

        // Unresolved Records Store
        if (!db.objectStoreNames.contains('unresolvedRecords')) {
          const unresolvedStore = db.createObjectStore('unresolvedRecords', { keyPath: 'id' });
          unresolvedStore.createIndex('status', 'status', { unique: false });
          unresolvedStore.createIndex('importId', 'importId', { unique: false });
          unresolvedStore.createIndex('fileName', 'fileName', { unique: false });
        }

        // Settings Store
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    return this.dbPromise;
  }

  // Generic helper for single-store transactions
  private async withStore<T>(
    storeName: string,
    mode: IDBTransactionMode,
    callback: (store: IDBObjectStore) => Promise<T> | T
  ): Promise<T> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, mode);
      const store = transaction.objectStore(storeName);

      let result: any;
      try {
        result = callback(store);
      } catch (err) {
        reject(err);
        return;
      }

      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(transaction.error);
    });
  }

  // --- Students CRUD ---
  async getAllStudents(): Promise<Student[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('students', 'readonly');
      const store = transaction.objectStore('students');
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async getStudentById(id: string): Promise<Student | undefined> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('students', 'readonly');
      const store = transaction.objectStore('students');
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async saveStudent(student: Student): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('students', 'readwrite');
      const store = transaction.objectStore('students');
      const request = store.put(student);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async saveStudentsBatch(students: Student[]): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('students', 'readwrite');
      const store = transaction.objectStore('students');
      for (const s of students) {
        store.put(s);
      }
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async deleteStudent(id: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['students', 'results'], 'readwrite');
      const studentStore = transaction.objectStore('students');
      const resultStore = transaction.objectStore('results');

      studentStore.delete(id);

      // Also clean up all student results
      const index = resultStore.index('studentId');
      const request = index.getAllKeys(id);
      request.onsuccess = () => {
        const keys = request.result || [];
        for (const k of keys) {
          resultStore.delete(k);
        }
      };

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async deleteStudentsBatch(ids: string[]): Promise<void> {
    if (!ids || ids.length === 0) return;
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['students', 'results'], 'readwrite');
      const studentStore = transaction.objectStore('students');
      const resultStore = transaction.objectStore('results');

      for (const id of ids) {
        studentStore.delete(id);
        const index = resultStore.index('studentId');
        const req = index.getAllKeys(id);
        req.onsuccess = () => {
          const keys = req.result || [];
          for (const k of keys) {
            resultStore.delete(k);
          }
        };
      }

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  // --- Subjects CRUD ---
  async getAllSubjects(): Promise<Subject[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('subjects', 'readonly');
      const store = transaction.objectStore('subjects');
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async getSubjectByName(name: string): Promise<Subject | undefined> {
    const normalized = name.trim().toLowerCase();
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('subjects', 'readonly');
      const store = transaction.objectStore('subjects');
      const index = store.index('normalizedName');
      const request = index.get(normalized);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async saveSubject(subject: Subject): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('subjects', 'readwrite');
      const store = transaction.objectStore('subjects');
      const request = store.put(subject);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async deleteSubject(id: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['subjects', 'results'], 'readwrite');
      const subjectStore = transaction.objectStore('subjects');
      const resultStore = transaction.objectStore('results');

      subjectStore.delete(id);

      const index = resultStore.index('subjectId');
      const request = index.getAllKeys(id);
      request.onsuccess = () => {
        const keys = request.result;
        for (const k of keys) {
          resultStore.delete(k);
        }
      };

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  // --- Results CRUD ---
  async getAllResults(): Promise<Result[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('results', 'readonly');
      const store = transaction.objectStore('results');
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async getResultsByStudentId(studentId: string): Promise<Result[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('results', 'readonly');
      const store = transaction.objectStore('results');
      const index = store.index('studentId');
      const request = index.getAll(studentId);
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async getResultsBySubjectId(subjectId: string): Promise<Result[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('results', 'readonly');
      const store = transaction.objectStore('results');
      const index = store.index('subjectId');
      const request = index.getAll(subjectId);
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async saveResult(result: Result): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('results', 'readwrite');
      const store = transaction.objectStore('results');
      const request = store.put(result);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async saveResultsBatch(results: Result[]): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('results', 'readwrite');
      const store = transaction.objectStore('results');
      for (const r of results) {
        store.put(r);
      }
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async deleteResult(id: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('results', 'readwrite');
      const store = transaction.objectStore('results');
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // --- Imports CRUD ---
  async getAllImports(): Promise<ImportRecord[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('imports', 'readonly');
      const store = transaction.objectStore('imports');
      const request = store.getAll();
      request.onsuccess = () => {
        const records = request.result || [];
        records.sort((a, b) => new Date(b.importedAt).getTime() - new Date(a.importedAt).getTime());
        resolve(records);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async saveImportRecord(record: ImportRecord): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('imports', 'readwrite');
      const store = transaction.objectStore('imports');
      const request = store.put(record);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async deleteImportRecord(id: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('imports', 'readwrite');
      const store = transaction.objectStore('imports');
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // --- Unresolved Records CRUD ---
  async getAllUnresolvedRecords(): Promise<UnresolvedRecord[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('unresolvedRecords', 'readonly');
      const store = transaction.objectStore('unresolvedRecords');
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async saveUnresolvedRecord(record: UnresolvedRecord): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('unresolvedRecords', 'readwrite');
      const store = transaction.objectStore('unresolvedRecords');
      const request = store.put(record);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async saveUnresolvedBatch(records: UnresolvedRecord[]): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('unresolvedRecords', 'readwrite');
      const store = transaction.objectStore('unresolvedRecords');
      for (const rec of records) {
        store.put(rec);
      }
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async deleteUnresolvedRecord(id: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('unresolvedRecords', 'readwrite');
      const store = transaction.objectStore('unresolvedRecords');
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // --- Settings & Custom Aliases ---
  async getSettings(): Promise<SystemSettings> {
    const db = await this.getDB();
    return new Promise((resolve) => {
      const transaction = db.transaction('settings', 'readonly');
      const store = transaction.objectStore('settings');
      const request = store.get('app_settings');
      request.onsuccess = () => {
        if (request.result && request.result.value) {
          const settings = { ...DEFAULT_SETTINGS, ...request.result.value };
          if (settings.institutionName === 'Apex University & Academic Institute') {
            settings.institutionName = 'Govt. SHMM Degree College Anantnag';
          }
          resolve(settings);
        } else {
          resolve(DEFAULT_SETTINGS);
        }
      };
      request.onerror = () => resolve(DEFAULT_SETTINGS);
    });
  }

  async saveSettings(settings: SystemSettings): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('settings', 'readwrite');
      const store = transaction.objectStore('settings');
      const request = store.put({ key: 'app_settings', value: settings });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // --- Full Database Export & Restore ---
  async exportFullDatabase(): Promise<string> {
    const [students, subjects, results, imports, unresolvedRecords, settings] = await Promise.all([
      this.getAllStudents(),
      this.getAllSubjects(),
      this.getAllResults(),
      this.getAllImports(),
      this.getAllUnresolvedRecords(),
      this.getSettings()
    ]);

    const backupData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      system: 'Student PDF Marks Management System',
      data: {
        students,
        subjects,
        results,
        imports,
        unresolvedRecords,
        settings
      }
    };

    return JSON.stringify(backupData, null, 2);
  }

  async restoreFullDatabase(jsonString: string): Promise<{ success: boolean; message: string }> {
    try {
      const parsed = JSON.parse(jsonString);
      if (!parsed.data || !Array.isArray(parsed.data.students)) {
        return { success: false, message: 'Invalid backup file format: missing students data.' };
      }

      const { students, subjects, results, imports, unresolvedRecords, settings } = parsed.data;

      const db = await this.getDB();
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(
          ['students', 'subjects', 'results', 'imports', 'unresolvedRecords', 'settings'],
          'readwrite'
        );

        // Clear existing
        transaction.objectStore('students').clear();
        transaction.objectStore('subjects').clear();
        transaction.objectStore('results').clear();
        transaction.objectStore('imports').clear();
        transaction.objectStore('unresolvedRecords').clear();

        // Restore
        const studentStore = transaction.objectStore('students');
        (students || []).forEach((s: Student) => studentStore.put(s));

        const subjectStore = transaction.objectStore('subjects');
        (subjects || []).forEach((sub: Subject) => subjectStore.put(sub));

        const resultStore = transaction.objectStore('results');
        (results || []).forEach((r: Result) => resultStore.put(r));

        const importStore = transaction.objectStore('imports');
        (imports || []).forEach((imp: ImportRecord) => importStore.put(imp));

        const unresolvedStore = transaction.objectStore('unresolvedRecords');
        (unresolvedRecords || []).forEach((u: UnresolvedRecord) => unresolvedStore.put(u));

        if (settings) {
          transaction.objectStore('settings').put({ key: 'app_settings', value: settings });
        }

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });

      return { success: true, message: `Successfully restored ${students.length} students, ${subjects.length} subjects, and ${results.length} results.` };
    } catch (e: any) {
      return { success: false, message: `Failed to restore database: ${e.message}` };
    }
  }

  async clearAllData(): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(
        ['students', 'subjects', 'results', 'imports', 'unresolvedRecords'],
        'readwrite'
      );

      transaction.objectStore('students').clear();
      transaction.objectStore('subjects').clear();
      transaction.objectStore('results').clear();
      transaction.objectStore('imports').clear();
      transaction.objectStore('unresolvedRecords').clear();

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  // --- Dashboard Statistics Aggregator ---
  async getDashboardStats() {
    const [students, subjects, results, imports, unresolved] = await Promise.all([
      this.getAllStudents(),
      this.getAllSubjects(),
      this.getAllResults(),
      this.getAllImports(),
      this.getAllUnresolvedRecords()
    ]);

    const activeUnresolved = unresolved.filter(u => u.status === 'pending');

    // Calculate class average across all numeric results
    const numericResults = results.filter(r => typeof r.marks === 'number' && !isNaN(r.marks as number));
    let overallAverage = 0;
    if (numericResults.length > 0) {
      const totalPct = numericResults.reduce((acc, curr) => {
        const pct = curr.maxMarks > 0 ? ((curr.marks as number) / curr.maxMarks) * 100 : 0;
        return acc + pct;
      }, 0);
      overallAverage = Math.round((totalPct / numericResults.length) * 10) / 10;
    }

    return {
      totalStudents: students.length,
      totalSubjects: subjects.length,
      totalPdfs: imports.length,
      totalResults: results.length,
      unresolvedCount: activeUnresolved.length,
      overallAverage,
      recentImports: imports.slice(0, 5),
      subjects
    };
  }
}

export const dbService = new DatabaseService();
