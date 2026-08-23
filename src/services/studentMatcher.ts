import { Student, Result, ColumnMapping, MatchEvaluation, UnresolvedRecord } from '../types';
import {
  normalizeName,
  normalizeRollNumber,
  normalizeStudentId,
  parseMarksValue,
  stringSimilarity,
  unwrapToken,
  separateRollAndName,
  cleanAndFormatName,
  isSubjectField
} from './fieldNormalizer';

export function evaluateStudentRow(
  rawRow: Record<string, string>,
  columnMappings: ColumnMapping[],
  existingStudents: Student[],
  existingResults: Result[],
  targetSubjectId?: string,
  defaultMaxMarks: number = 100
): MatchEvaluation {
  // Extract values according to columnMappings
  let rawName = '';
  let rawRollNumber = '';
  let rawStudentId = '';
  let rawMarks = '';
  const dynamicFields: Record<string, string> = {};

  for (const mapping of columnMappings) {
    const val = (rawRow[mapping.originalHeader] || '').trim();
    if (!val) continue;

    const target = unwrapToken(mapping.targetField);

    if (target === 'name') {
      rawName = rawName ? `${rawName} ${val}` : val;
    } else if (target === 'rollNumber' || target === 'roll_no' || target === 'roll') {
      rawRollNumber = val;
    } else if (target === 'studentId' || target === 'student_id' || target === 'reg_no') {
      rawStudentId = val;
    } else if (target === 'marks' || target === 'score') {
      rawMarks = val;
    } else if (target !== 'ignore' && !isSubjectField(mapping.targetField).isSubject) {
      // Any other dynamic profile field (class, section, fatherName, dob, gender, remarks, totalMarks, percentage)
      dynamicFields[target] = val;
    }
  }

  // Intelligently separate roll and name if combined in one column
  const separated = separateRollAndName(rawRollNumber, rawName);
  rawRollNumber = separated.rollNumber;
  rawName = separated.name;

  const normName = normalizeName(rawName);
  const normRoll = normalizeRollNumber(rawRollNumber);
  const normStudentId = normalizeStudentId(rawStudentId);
  const parsedMarks = parseMarksValue(rawMarks, defaultMaxMarks);

  const extractedData = {
    name: rawName,
    rollNumber: rawRollNumber,
    studentId: rawStudentId,
    marks: parsedMarks.marks,
    rawMarks,
    dynamicFields
  };

  // Check if critical fields are completely missing (e.g. neither name nor roll number)
  if (!normName && !normRoll && !normStudentId) {
    return {
      matchType: 'unresolved',
      confidence: 0,
      reason: 'Row does not contain student name, roll number, or ID',
      rawRow,
      extractedData
    };
  }

  // Level 1: Exact Student ID match (Registration / Enrollment Number)
  if (normStudentId) {
    const matchedById = existingStudents.find(
      s => normalizeStudentId(s.studentId) === normStudentId
    );
    if (matchedById) {
      const hasExistingSubject = targetSubjectId
        ? existingResults.find(r => r.studentId === matchedById.id && r.subjectId === targetSubjectId)
        : undefined;

      return {
        matchType: 'exact_id',
        confidence: 100,
        matchedStudent: matchedById,
        reason: `Exact Student ID / Registration match: ${matchedById.studentId}`,
        rawRow,
        extractedData,
        hasExistingSubjectResult: !!hasExistingSubject,
        existingResult: hasExistingSubject
      };
    }
  }

  // Level 2: Exact Roll Number + Exact Name match
  if (rawRollNumber && rawName) {
    const matchedByExactRollAndName = existingStudents.find(
      s => s.rollNumber.trim().toLowerCase() === rawRollNumber.trim().toLowerCase() &&
           s.name.trim().toLowerCase() === rawName.trim().toLowerCase()
    );
    if (matchedByExactRollAndName) {
      const hasExistingSubject = targetSubjectId
        ? existingResults.find(r => r.studentId === matchedByExactRollAndName.id && r.subjectId === targetSubjectId)
        : undefined;

      return {
        matchType: 'exact_roll_name',
        confidence: 99,
        matchedStudent: matchedByExactRollAndName,
        reason: `Exact Roll Number (${rawRollNumber}) & Name match`,
        rawRow,
        extractedData,
        hasExistingSubjectResult: !!hasExistingSubject,
        existingResult: hasExistingSubject
      };
    }
  }

  // Level 3: Normalized Name + Normalized Roll Number match
  if (normName && normRoll) {
    const matchedByNormRollAndName = existingStudents.find(
      s => s.normalizedRollNumber === normRoll && s.normalizedName === normName
    );
    if (matchedByNormRollAndName) {
      const hasExistingSubject = targetSubjectId
        ? existingResults.find(r => r.studentId === matchedByNormRollAndName.id && r.subjectId === targetSubjectId)
        : undefined;

      return {
        matchType: 'normalized_name_roll',
        confidence: 98,
        matchedStudent: matchedByNormRollAndName,
        reason: `Normalized Name & Roll Number match`,
        rawRow,
        extractedData,
        hasExistingSubjectResult: !!hasExistingSubject,
        existingResult: hasExistingSubject
      };
    }

    // Roll number match with same normalized roll
    const matchedByRollOnly = existingStudents.find(s => s.normalizedRollNumber === normRoll);
    if (matchedByRollOnly) {
      // Check name similarity
      const sim = stringSimilarity(normName, matchedByRollOnly.normalizedName);
      if (sim > 0.7) {
        const hasExistingSubject = targetSubjectId
          ? existingResults.find(r => r.studentId === matchedByRollOnly.id && r.subjectId === targetSubjectId)
          : undefined;

        return {
          matchType: 'normalized_name_roll',
          confidence: Math.round(sim * 100),
          matchedStudent: matchedByRollOnly,
          reason: `Matching Roll Number (${normRoll}) with similar Name (${matchedByRollOnly.name})`,
          rawRow,
          extractedData,
          hasExistingSubjectResult: !!hasExistingSubject,
          existingResult: hasExistingSubject
        };
      }
    }
  }

  // Level 4: Normalized Name + Normalized Student ID
  if (normName && normStudentId) {
    const matchedByNormNameAndId = existingStudents.find(
      s => s.normalizedName === normName && normalizeStudentId(s.studentId) === normStudentId
    );
    if (matchedByNormNameAndId) {
      const hasExistingSubject = targetSubjectId
        ? existingResults.find(r => r.studentId === matchedByNormNameAndId.id && r.subjectId === targetSubjectId)
        : undefined;

      return {
        matchType: 'normalized_name_id',
        confidence: 96,
        matchedStudent: matchedByNormNameAndId,
        reason: `Normalized Name & Registration ID match`,
        rawRow,
        extractedData,
        hasExistingSubjectResult: !!hasExistingSubject,
        existingResult: hasExistingSubject
      };
    }
  }

  // Level 5: Fuzzy Name matching
  if (normName && !normRoll && !normStudentId) {
    // Only name was found; search for high confidence fuzzy matches
    let bestMatch: Student | null = null;
    let bestSim = 0;
    for (const student of existingStudents) {
      const sim = stringSimilarity(normName, student.normalizedName);
      if (sim > bestSim) {
        bestSim = sim;
        bestMatch = student;
      }
    }

    if (bestMatch && bestSim >= 0.88) {
      const hasExistingSubject = targetSubjectId
        ? existingResults.find(r => r.studentId === bestMatch!.id && r.subjectId === targetSubjectId)
        : undefined;

      return {
        matchType: 'fuzzy_name',
        confidence: Math.round(bestSim * 100),
        matchedStudent: bestMatch,
        reason: `High fuzzy name match (${Math.round(bestSim * 100)}%) with ${bestMatch.name}`,
        rawRow,
        extractedData,
        hasExistingSubjectResult: !!hasExistingSubject,
        existingResult: hasExistingSubject
      };
    }

    // Missing identifiers (no roll number and no student id)
    return {
      matchType: 'unresolved',
      confidence: 40,
      reason: 'Missing both Roll Number and Student ID for confident identification',
      rawRow,
      extractedData
    };
  }

  // Brand new student record
  if (rawName || rawRollNumber || rawStudentId) {
    return {
      matchType: 'new_student',
      confidence: 100,
      reason: 'No existing matching student record found; will create new Student Master Record',
      rawRow,
      extractedData
    };
  }

  return {
    matchType: 'unresolved',
    confidence: 0,
    reason: 'Insufficient student data extracted',
    rawRow,
    extractedData
  };
}

export function createUnresolvedRecordFromEvaluation(
  evaluation: MatchEvaluation,
  importId: string,
  fileName: string,
  pageNumber: number = 1
): UnresolvedRecord {
  const missing: string[] = [];
  if (!evaluation.extractedData.name) missing.push('Student Name');
  if (!evaluation.extractedData.rollNumber) missing.push('Roll Number');
  if (!evaluation.extractedData.studentId) missing.push('Student ID');
  if (evaluation.extractedData.marks === '' || evaluation.extractedData.marks === undefined) {
    missing.push('Marks');
  }

  return {
    id: `unres_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    importId,
    fileName,
    pageNumber,
    rawRowData: evaluation.rawRow,
    detectedFields: {
      name: evaluation.extractedData.name,
      rollNumber: evaluation.extractedData.rollNumber,
      studentId: evaluation.extractedData.studentId,
      marks: String(evaluation.extractedData.marks || ''),
      dynamicFields: evaluation.extractedData.dynamicFields
    },
    missingFields: missing,
    reason: evaluation.reason,
    status: 'pending',
    createdAt: new Date().toISOString()
  };
}
