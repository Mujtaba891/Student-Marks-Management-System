export interface Student {
  aiMagicFields?: Record<string, string>;
  normalizedStudentId?: string;
  id: string;
  name: string;
  normalizedName: string;
  rollNumber: string;
  normalizedRollNumber: string;
  studentId: string; // Registration / ID
  aliases?: string[];
  dynamicFields?: Record<string, string>; // Dynamic {} map for custom/arbitrary attributes (class, section, father_name, dob, gender, etc.)
  createdAt: string;
  updatedAt: string;
  notes?: string;
}

export interface Subject {
  id: string;
  name: string;
  normalizedName: string;
  code?: string;
  maxMarks: number;
  passMarks: number;
  createdAt: string;
}

export interface Result {
  id: string;
  studentId: string; // references Student.id
  subjectId: string; // references Subject.id
  subjectName: string;
  marks: number | string; // 78, 85.5, or 'AB', 'Absent', 'F'
  numericMarks?: number;
  maxMarks: number;
  percentage?: number;
  grade?: string;
  dynamicFields?: Record<string, string>; // Dynamic {} per-result attributes (theory, practical, remarks, etc.)
  sourceFile: string;
  importId: string;
  importedAt: string;
  version: number;
}

export interface ImportRecord {
  id: string;
  fileName: string;
  fileSize?: number;
  subject: string;
  importedAt: string;
  recordsDetected: number;
  recordsImported: number;
  recordsUpdated: number;
  duplicates: number;
  warnings: number;
  errors: number;
  status: 'completed' | 'partial' | 'failed';
  details?: string[];
}

export interface UnresolvedRecord {
  id: string;
  importId: string;
  fileName: string;
  pageNumber: number;
  rawRowData: Record<string, string>;
  detectedFields: {
    name?: string;
    rollNumber?: string;
    studentId?: string;
    marks?: string;
    dynamicFields?: Record<string, string>;
  };
  dynamicFields?: Record<string, string>;
  missingFields: string[];
  reason: string;
  status: 'pending' | 'resolved' | 'discarded';
  createdAt: string;
}

export type CustomAliases = Record<string, string[]>;

export interface SystemSettings {
  institutionName: string;
  academicSession: string;
  defaultMaxMarks: number;
  passPercentage: number;
  theme: 'light' | 'dark' | 'system';
  customAliases: CustomAliases;
}

export interface ColumnMapping {
  columnIndex: number;
  originalHeader: string;
  normalizedHeader: string;
  targetField: string; // 'name' | 'rollNumber' | 'studentId' | 'marks' | 'ignore' or any dynamic field '{key}'
  confidence: number; // 0 - 100
  sampleValues: string[];
}

export interface ParsedPDFData {
  fileName: string;
  fileSize?: number;
  pageCount: number;
  detectedSubject: string;
  rawRows: Array<Record<string, string>>;
  headers: string[];
  columnMappings: ColumnMapping[];
  isScannedOrImageOnly: boolean;
  warnings: string[];
}

export interface MatchEvaluation {
  matchType: 'exact_id' | 'exact_roll_name' | 'normalized_name_roll' | 'normalized_name_id' | 'fuzzy_name' | 'new_student' | 'unresolved';
  confidence: number;
  matchedStudent?: Student;
  reason: string;
  rawRow: Record<string, string>;
  extractedData: {
    name: string;
    rollNumber: string;
    studentId: string;
    marks: string | number;
    rawMarks: string;
    dynamicFields: Record<string, string>;
  };
  hasExistingSubjectResult?: boolean;
  existingResult?: Result;
}
