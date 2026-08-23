import { CustomAliases } from '../types';

export const DEFAULT_FIELD_ALIASES: Record<string, string[]> = {
  name: [
    'name',
    'names',
    'student',
    'students',
    'student name',
    'student names',
    'candidate name',
    'candidate names',
    'candidate',
    'candidates',
    "student's name",
    'name of student',
    'names of students',
    'full name',
    'full names',
    'applicant name',
    'examinee name',
    'pupil name',
    'pupil names',
    'student_name',
    'candidate_name',
    'student full name'
  ],

  rollNumber: [
    'roll',
    'rolls',
    'roll no',
    'roll nos',
    'roll no.',
    'roll nos.',
    'roll number',
    'roll numbers',
    'roll#',
    'roll_no',
    'exam roll',
    'exam roll no',
    'exam roll nos',
    'exam roll number',
    'exam roll numbers',
    'examination roll no',
    'examination roll number',
    'seat no',
    'seat nos',
    'seat number',
    'seat numbers',
    'roll num',
    'roll nums',
    'r no',
    'r.no'
  ],

  studentId: [
    'id',
    'ids',
    'student id',
    'student ids',
    'student id no',
    'registration no',
    'registration nos',
    'registration number',
    'registration numbers',
    'regd no',
    'regd nos',
    'regd. no.',
    'regd. nos.',
    'reg no',
    'reg nos',
    'reg. no.',
    'reg. nos.',
    'reg#',
    'enrollment no',
    'enrollment nos',
    'enrollment number',
    'enrollment numbers',
    'enrolment no',
    'enrolment nos',
    'enrolment number',
    'enrolment numbers',
    'registration id',
    'university registration no',
    'univ reg no',
    'admission no',
    'admission nos',
    'admission number',
    'admission numbers',
    'regd_no',
    'reg_no',
    'student_id',
    'candidate id'
  ],

  marks: [
    'marks',
    'mark',
    'score',
    'scores',
    'obtained marks',
    'marks obtained',
    'score obtained',
    'marks obt',
    'obt marks',
    'secured marks',
    'theory marks',
    'exam marks',
    'final marks',
    'grade marks',
    'result'
  ],

  totalMarks: [
    'total marks',
    'total mark',
    'total marks obt',
    'grand total',
    'total score',
    'total',
    'tot',
    'aggregate',
    'tot marks'
  ],

  maxMarks: [
    'marks out of',
    'out of',
    'max marks',
    'maximum marks',
    'max mark',
    'total out of'
  ],

  percentage: [
    'percentage',
    'percentages',
    '%age',
    'percent',
    '%',
    'pct',
    'perc',
    'aggregate %'
  ],

  class: [
    'class',
    'cls',
    'standard',
    'std',
    'grade level',
    'form',
    'semester',
    'sem',
    'class / semester',
    'class/semester',
    'class / sec',
    'class/sec'
  ],

  section: [
    'section',
    'sec',
    'division',
    'div',
    'group',
    'grp',
    'batch',
    'stream',
    'academic session',
    'session'
  ],

  fatherName: [
    "father's name",
    'father name',
    'fathers name',
    'parent name',
    "guardian's name",
    'guardian name',
    'father/guardian',
    'parent/guardian',
    'father',
    'parent'
  ],

  dob: [
    'dob',
    'date of birth',
    'birth date',
    'birthdate',
    'd.o.b',
    'd.o.b.',
    'd-o-b',
    'birth'
  ],

  gender: [
    'gender',
    'sex',
    'male/female',
    'm/f'
  ],

  rank: [
    'rank',
    'standing',
    'merit',
    'merit rank',
    'class rank'
  ],

  remarks: [
    'remarks',
    'remark',
    'result status',
    'status',
    'comments',
    'comment',
    'notes',
    'feedback'
  ]
};

export const KNOWN_ACADEMIC_SUBJECTS: string[] = [
  'Physics',
  'Chemistry',
  'Mathematics',
  'Biology',
  'English',
  'Urdu',
  'Islamiat',
  'Islamic Studies',
  'Pakistan Studies',
  'Pak Studies',
  'Geology',
  'Botany',
  'Zoology',
  'History',
  'World History',
  'Geography',
  'Computer Science',
  'Information Technology',
  'IT',
  'Applied IT',
  'Documentary & Film Making',
  'Documentary and Film Making',
  'Documentry and Film Making',
  'Documentry & Film Making',
  'Film Making',
  'Communication',
  'Comunication',
  'Data Structures',
  'Algorithms',
  'Database Management',
  'Operating Systems',
  'Software Engineering',
  'Artificial Intelligence',
  'Machine Learning',
  'Web Engineering',
  'Computer Networks',
  'Discrete Mathematics',
  'Linear Algebra',
  'Calculus',
  'Statistics',
  'Business Mathematics',
  'Financial Accounting',
  'Cost Accounting',
  'Accounting',
  'Economics',
  'Microeconomics',
  'Macroeconomics',
  'Management',
  'Marketing',
  'Finance',
  'Business Law',
  'Banking',
  'Commerce',
  'Political Science',
  'Sociology',
  'Psychology',
  'Philosophy',
  'Civics',
  'Education',
  'Biochemistry',
  'Biotechnology',
  'Microbiology',
  'Physiology',
  'Anatomy',
  'Pharmacology',
  'Pathology',
  'General Science',
  'Environmental Science',
  'Arabic',
  'Persian',
  'Hindi',
  'Sanskrit',
  'French',
  'German',
  'Spanish',
  'Art & Design',
  'Physical Education',
  'Ethics'
];

/**
 * Checks if a targetField represents a subject mark column
 */
export function isSubjectField(targetField: string): { isSubject: boolean; subjectName: string } {
  if (!targetField || targetField === 'ignore') return { isSubject: false, subjectName: '' };

  const unwrapped = unwrapToken(targetField);

  // Explicit subject prefix: {subject: Physics} or subject:Physics or subject_physics
  if (unwrapped.toLowerCase().startsWith('subject:')) {
    const sub = unwrapped.replace(/^subject:\s*/i, '').trim();
    return { isSubject: true, subjectName: formatSubjectName(sub) };
  }
  if (unwrapped.toLowerCase().startsWith('subject_')) {
    const sub = unwrapped.replace(/^subject_/i, '').trim();
    return { isSubject: true, subjectName: formatSubjectName(sub) };
  }

  // Check against known academic subjects
  const cleanSlug = slugifyFieldKey(unwrapped);
  const matched = KNOWN_ACADEMIC_SUBJECTS.find(s => {
    const sSlug = slugifyFieldKey(s);
    return sSlug === cleanSlug || (cleanSlug.length >= 4 && (sSlug.includes(cleanSlug) || cleanSlug.includes(sSlug)));
  });
  if (matched) {
    return { isSubject: true, subjectName: formatSubjectName(matched) };
  }

  return { isSubject: false, subjectName: '' };
}

/**
 * Format subject title properly (e.g. "GEOLOGY" -> "Geology", "comunication" -> "Communication")
 */
export function formatSubjectName(name: string): string {
  if (!name) return 'Subject';
  let clean = name
    .replace(/^subject[:_]\s*/i, '')
    .replace(/[{}]/g, '')
    .replace(/[_\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Normalize common marksheets spelling variations
  if (/^comunic/i.test(clean)) clean = 'Communication';
  if (/^docu.*film/i.test(clean)) clean = 'Documentary & Film Making';
  if (/^applied\s*it$/i.test(clean)) clean = 'Applied IT';
  if (/^it$/i.test(clean)) clean = 'IT';
  if (/^cs$/i.test(clean)) clean = 'Computer Science';

  return clean
    .split(' ')
    .map(w => {
      if (/^(cs|it|ai|ml|os|dbms|phy|chem|math|bio|geo)$/i.test(w)) return w.toUpperCase();
      if (w.toLowerCase() === 'and' || w.toLowerCase() === '&') return '&';
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(' ');
}

/**
 * Separates merged roll number and name if they got combined in one column (e.g. "5 Abdul Ahad Lone")
 */
export function separateRollAndName(
  rollInput: string,
  nameInput: string
): { rollNumber: string; name: string } {
  let roll = (rollInput || '').trim();
  let name = (nameInput || '').trim();

  // Case 1: Name is empty or placeholder, but rollNumber has "5 Abdul Ahad Lone" or "101 Sarah Khan"
  if ((!name || name.toLowerCase() === 'unnamed student') && roll) {
    // Pattern: Leading number/alphanumeric code + space + alphabetic name
    const numNameMatch = roll.match(/^(\d{1,6}|[a-zA-Z]{1,3}[-_]?\d{1,6})\s*[-.:)]?\s+([a-zA-Z\s.'’-]{2,})$/);
    if (numNameMatch) {
      roll = numNameMatch[1].trim();
      name = cleanAndFormatName(numNameMatch[2].trim());
    }
  }

  // Case 2: Roll number is empty, but name has "5 Abdul Ahad Lone" or "1. Aadil Bhat"
  if (!roll && name) {
    const numNameMatch = name.match(/^(\d{1,6}|[a-zA-Z]{1,3}[-_]?\d{1,6})\s*[-.:)]?\s+([a-zA-Z\s.'’-]{2,})$/);
    if (numNameMatch) {
      roll = numNameMatch[1].trim();
      name = cleanAndFormatName(numNameMatch[2].trim());
    }
  }

  // Case 3: Inverted name like "Lone, Abdul Ahad" or "Rather, Aamina"
  if (name.includes(',')) {
    const parts = name.split(',').map(p => p.trim()).filter(Boolean);
    if (parts.length === 2) {
      name = cleanAndFormatName(`${parts[1]} ${parts[0]}`);
    }
  } else {
    name = cleanAndFormatName(name);
  }

  return { rollNumber: roll, name };
}

/**
 * Cleans and formats student name in proper Title Case with correct spacing
 */
export function cleanAndFormatName(rawName: string): string {
  if (!rawName) return '';
  let cleaned = rawName
    .replace(/[0-9]+/g, ' ') // remove stray numbers in name
    .replace(/[._\-/:#()\[\]"']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return '';

  return cleaned
    .split(' ')
    .map(word => {
      const lower = word.toLowerCase();
      if (/^(al|bin|ibn|de|van|von|da)$/i.test(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

/**
 * Normalizes a header string to a clean slug identifier
 */
export function slugifyFieldKey(header: string): string {
  if (!header) return 'custom_field';
  let cleaned = header
    .toLowerCase()
    .replace(/['"’`]/g, '')
    .replace(/[._\-/:#()\[\]]/g, ' ')
    .trim()
    .replace(/\s+/g, '_');
  return cleaned || 'custom_field';
}

/**
 * Wraps a field key in {field_key} token notation for internal storage
 */
export function wrapToken(key: string): string {
  if (!key) return '{}';
  const clean = key.replace(/^\{+/, '').replace(/\}+$/, '').trim();
  return `{${clean}}`;
}

/**
 * Unwraps a {field_key} token to clean string
 */
export function unwrapToken(key: string): string {
  if (!key) return '';
  return key.replace(/^\{+/, '').replace(/\}+$/, '').trim();
}

/**
 * Formats a field key into a clean, human-readable UI label WITHOUT curly braces
 */
export function formatFieldLabel(key: string): string {
  const unwrapped = unwrapToken(key);
  if (!unwrapped || unwrapped === 'ignore') return 'Ignore Column';
  if (unwrapped === 'name') return 'Student Name';
  if (unwrapped === 'rollNumber' || unwrapped === 'roll_no' || unwrapped === 'roll') return 'Roll Number';
  if (unwrapped === 'studentId' || unwrapped === 'student_id' || unwrapped === 'reg_no') return 'Student ID / Reg No';
  if (unwrapped === 'marks' || unwrapped === 'score') return 'Marks / Score';

  const subCheck = isSubjectField(unwrapped);
  if (subCheck.isSubject) {
    return `Subject: ${subCheck.subjectName}`;
  }

  if (unwrapped.toLowerCase().startsWith('subject:')) {
    return `Subject: ${formatSubjectName(unwrapped.replace(/^subject:\s*/i, ''))}`;
  }

  if (unwrapped === 'class') return 'Class / Standard';
  if (unwrapped === 'section') return 'Section / Batch';
  if (unwrapped === 'fatherName' || unwrapped === 'father_name') return "Father's Name";
  if (unwrapped === 'dob' || unwrapped === 'date_of_birth') return 'Date of Birth';
  if (unwrapped === 'gender') return 'Gender';
  if (unwrapped === 'rank') return 'Rank / Position';
  if (unwrapped === 'remarks') return 'Remarks / Grade';

  // Capitalize snake_case or camelCase words
  return unwrapped
    .replace(/^\{+/, '')
    .replace(/\}+$/, '')
    .replace(/([A-Z])/g, ' $1')
    .replace(/[_\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Normalizes a header string for matching
 */
export function cleanHeaderString(input: string): string {
  if (!input) return '';
  let cleaned = input
    .toLowerCase()
    .replace(/['"’`]/g, '')
    .replace(/[._\-/:#()\[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Normalize common abbreviation tokens
  cleaned = cleaned
    .replace(/\bregd\b/g, 'reg')
    .replace(/\bregistration\b/g, 'reg')
    .replace(/\bnum\b/g, 'number')
    .replace(/\bno\b/g, 'number')
    .replace(/\bobt\b/g, 'obtained')
    .replace(/\btot\b/g, 'total')
    .replace(/\bcand\b/g, 'candidate')
    .replace(/\bstud\b/g, 'student');

  return cleaned.trim();
}

/**
 * Computes Levenshtein Distance between two strings
 */
export function levenshteinDistance(a: string, b: string): number {
  const an = a ? a.length : 0;
  const bn = b ? b.length : 0;
  if (an === 0) return bn;
  if (bn === 0) return an;

  const matrix: number[][] = [];
  for (let i = 0; i <= bn; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= an; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= bn; i++) {
    for (let j = 1; j <= an; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[bn][an];
}

/**
 * Calculates string similarity ratio between 0 and 1
 */
export function stringSimilarity(s1: string, s2: string): number {
  const str1 = cleanHeaderString(s1);
  const str2 = cleanHeaderString(s2);

  if (str1 === str2) return 1.0;
  if (!str1 || !str2) return 0.0;

  if (str1.includes(str2) || str2.includes(str1)) {
    const minLen = Math.min(str1.length, str2.length);
    const maxLen = Math.max(str1.length, str2.length);
    return 0.85 + (0.15 * (minLen / maxLen));
  }

  const tokens1 = new Set(str1.split(' ').filter(Boolean));
  const tokens2 = new Set(str2.split(' ').filter(Boolean));
  const intersection = new Set([...tokens1].filter(x => tokens2.has(x)));
  const union = new Set([...tokens1, ...tokens2]);

  const tokenScore = union.size > 0 ? intersection.size / union.size : 0;
  if (tokenScore >= 0.8) return Math.min(0.98, 0.75 + tokenScore * 0.25);

  const maxLen = Math.max(str1.length, str2.length);
  const distance = levenshteinDistance(str1, str2);
  const levScore = 1 - (distance / maxLen);

  return Math.max(tokenScore * 0.9, levScore);
}

export interface MatchResult {
  targetField: string;
  confidence: number;
  matchedAlias?: string;
}

/**
 * Detects the target student record field from a column header and sample data values
 */
export function detectFieldForHeader(
  originalHeader: string,
  sampleValues: string[] = [],
  customAliases?: CustomAliases
): MatchResult {
  const cleaned = cleanHeaderString(originalHeader);
  if (!cleaned) {
    return { targetField: 'ignore', confidence: 0 };
  }

  // Check for S.No / Serial index columns
  if (/^(s\.?\s*no\.?|sr\.?\s*no\.?|serial\s*no\.?|serial\s*number|sl\.?\s*no\.?|sno)$/i.test(originalHeader.trim())) {
    return {
      targetField: 'ignore',
      confidence: 95,
      matchedAlias: 'Serial Index (Row #)'
    };
  }

  // 1. Check if the header directly represents an academic subject or course code
  const subjectCheck = isSubjectField(originalHeader);
  if (subjectCheck.isSubject) {
    return {
      targetField: `{subject: ${subjectCheck.subjectName}}`,
      confidence: 96,
      matchedAlias: subjectCheck.subjectName
    };
  }

  // Check course code pattern e.g. PHY-101, CS201, BIO-101, MTH-11, GLY-201
  const courseCodeMatch = originalHeader.trim().match(/^([a-zA-Z]{2,5})[-_\s]?(\d{1,4}[a-zA-Z]?)$/);
  if (courseCodeMatch && !/^(col|column|row|page|std|reg)\d+/i.test(originalHeader.trim())) {
    const code = `${courseCodeMatch[1].toUpperCase()}-${courseCodeMatch[2].toUpperCase()}`;
    return {
      targetField: `{subject: ${code}}`,
      confidence: 90,
      matchedAlias: code
    };
  }

  // Merge default aliases with any user-supplied custom aliases
  const allAliases: Record<string, string[]> = {
    ...DEFAULT_FIELD_ALIASES
  };

  if (customAliases) {
    for (const [key, aliases] of Object.entries(customAliases)) {
      if (Array.isArray(aliases)) {
        allAliases[key] = [...(allAliases[key] || []), ...aliases];
      }
    }
  }

  let bestField = 'ignore';
  let highestScore = 0;
  let matchedAlias = '';

  for (const [field, aliases] of Object.entries(allAliases)) {
    for (const alias of aliases) {
      const cleanedAlias = cleanHeaderString(alias);
      if (cleaned === cleanedAlias) {
        return { targetField: field, confidence: 100, matchedAlias: alias };
      }

      const sim = stringSimilarity(cleaned, cleanedAlias);
      if (sim > highestScore) {
        highestScore = sim;
        bestField = field;
        matchedAlias = alias;
      }
    }
  }

  // Sample row values analysis
  let confidence = Math.round(highestScore * 100);

  const validSamples = (sampleValues || []).filter(v => v && v.trim().length > 0);
  if (validSamples.length > 0) {
    const numericCount = validSamples.filter(v => /^\d+(\.\d+)?(\s*\/\s*\d+)?%?$/.test(v.trim())).length;
    const regIdPatternCount = validSamples.filter(v => /^[a-zA-Z]{2,}[-_0-9]+$/i.test(v.trim())).length;
    const multiWordAlphaCount = validSamples.filter(v => /^[a-zA-Z\s.'’-]{3,}$/.test(v.trim()) && v.trim().includes(' ')).length;

    const numericRatio = numericCount / validSamples.length;
    const regIdRatio = regIdPatternCount / validSamples.length;
    const nameRatio = multiWordAlphaCount / validSamples.length;

    // CRITICAL: If sample values are numeric scores (e.g. 78, 85, 92) and header is NOT a standard identifier (name/roll/id):
    // In college marksheets, this is a SUBJECT MARKS column!
    if (numericRatio >= 0.7 && bestField !== 'name' && bestField !== 'rollNumber' && bestField !== 'studentId' && bestField !== 'rank') {
      const subName = formatSubjectName(originalHeader);
      return {
        targetField: `{subject: ${subName}}`,
        confidence: 90,
        matchedAlias: subName
      };
    }

    if (nameRatio > 0.6) {
      if (bestField === 'name' || bestField === 'fatherName') {
        confidence = Math.min(100, confidence + 15);
      } else if (bestField === 'marks' || bestField === 'rollNumber') {
        confidence = Math.max(10, confidence - 50);
      }
    }

    if (regIdRatio > 0.5 && bestField === 'studentId') {
      confidence = Math.min(100, confidence + 15);
    }
  }

  // If matched with confidence >= 50, return recognized field
  if (confidence >= 50 && bestField !== 'ignore') {
    return { targetField: bestField, confidence, matchedAlias };
  }

  // Fallback: Check if it should be a subject or custom attribute
  const isNumeric = validSamples.length > 0 && validSamples.every(v => /^\d+$/.test(v.trim()));
  if (isNumeric) {
    const subName = formatSubjectName(originalHeader);
    return { targetField: `{subject: ${subName}}`, confidence: 80, matchedAlias: subName };
  }

  const slug = slugifyFieldKey(originalHeader);
  if (slug && !/^column_\d+$/i.test(slug) && !/^col_\d+$/i.test(slug) && slug.length > 1) {
    return { targetField: slug, confidence: 60, matchedAlias: originalHeader };
  }

  return { targetField: 'ignore', confidence: 0, matchedAlias };
}

/**
 * Normalizes a student's full name for matching
 */
export function normalizeName(name: string): string {
  if (!name) return '';
  return cleanAndFormatName(name)
    .toLowerCase()
    .replace(/[.'’`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalizes a student's roll number
 */
export function normalizeRollNumber(rollNumber: string): string {
  if (!rollNumber) return '';
  let cleaned = rollNumber
    .trim()
    .replace(/^roll\s*[:#\s-]*/i, '')
    .replace(/^r\s*[:#\s-]*/i, '')
    .trim();

  // Strip leading zeros for numeric roll numbers (e.g. "005" -> "5")
  if (/^\d+$/.test(cleaned)) {
    return String(parseInt(cleaned, 10));
  }
  return cleaned.toLowerCase();
}

/**
 * Normalizes a student ID or registration number
 */
export function normalizeStudentId(id: string): string {
  if (!id) return '';
  return id
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

export interface ParsedMarks {
  marks: number | string;
  numericMarks: number | null;
  maxMarks: number;
  percentage: number | null;
  grade: string;
}

/**
 * Parses raw marks strings like "85", "85/100", "42.5", "AB" (Absent), "NA"
 */
export function parseMarksValue(raw: string | number, defaultMaxMarks: number = 100): ParsedMarks {
  if (typeof raw === 'number') {
    const num = Math.max(0, raw);
    const pct = defaultMaxMarks > 0 ? (num / defaultMaxMarks) * 100 : 0;
    return {
      marks: num,
      numericMarks: num,
      maxMarks: defaultMaxMarks,
      percentage: Math.round(pct * 10) / 10,
      grade: calculateGradeFromPercentage(pct)
    };
  }

  if (!raw || typeof raw !== 'string') {
    return {
      marks: 0,
      numericMarks: 0,
      maxMarks: defaultMaxMarks,
      percentage: 0,
      grade: 'F'
    };
  }

  const trimmed = raw.trim();

  // Check for Absent / Special Statuses
  if (/^(ab|absent|a|na|n\/a|null|nil)$/i.test(trimmed)) {
    return {
      marks: 'AB',
      numericMarks: null,
      maxMarks: defaultMaxMarks,
      percentage: null,
      grade: 'AB'
    };
  }

  // Fraction format e.g. "85/100" or "42 / 50"
  const fractionMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
  if (fractionMatch) {
    const obt = parseFloat(fractionMatch[1]);
    const max = parseFloat(fractionMatch[2]) || defaultMaxMarks;
    const pct = max > 0 ? (obt / max) * 100 : 0;
    return {
      marks: obt,
      numericMarks: obt,
      maxMarks: max,
      percentage: Math.round(pct * 10) / 10,
      grade: calculateGradeFromPercentage(pct)
    };
  }

  // Percentage format e.g. "85%"
  const pctMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s*%$/);
  if (pctMatch) {
    const pct = parseFloat(pctMatch[1]);
    const obt = Math.round((pct / 100) * defaultMaxMarks * 10) / 10;
    return {
      marks: obt,
      numericMarks: obt,
      maxMarks: defaultMaxMarks,
      percentage: pct,
      grade: calculateGradeFromPercentage(pct)
    };
  }

  // Plain numeric string e.g. "85" or "85.5"
  const numVal = parseFloat(trimmed);
  if (!isNaN(numVal)) {
    const pct = defaultMaxMarks > 0 ? (numVal / defaultMaxMarks) * 100 : 0;
    return {
      marks: numVal,
      numericMarks: numVal,
      maxMarks: defaultMaxMarks,
      percentage: Math.round(pct * 10) / 10,
      grade: calculateGradeFromPercentage(pct)
    };
  }

  return {
    marks: trimmed,
    numericMarks: null,
    maxMarks: defaultMaxMarks,
    percentage: null,
    grade: '-'
  };
}

export function calculateGradeFromPercentage(pct: number): string {
  if (pct >= 90) return 'A+';
  if (pct >= 80) return 'A';
  if (pct >= 70) return 'B+';
  if (pct >= 60) return 'B';
  if (pct >= 50) return 'C';
  if (pct >= 40) return 'D';
  return 'F';
}
