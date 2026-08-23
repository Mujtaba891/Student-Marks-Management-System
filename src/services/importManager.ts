import {
  ParsedPDFData,
  ColumnMapping,
  Student,
  Subject,
  Result,
  ImportRecord,
  UnresolvedRecord,
  SystemSettings
} from '../types';
import { dbService } from '../db/indexedDB';
import { evaluateStudentRow, createUnresolvedRecordFromEvaluation } from './studentMatcher';
import {
  normalizeName,
  normalizeRollNumber,
  parseMarksValue,
  isSubjectField,
  cleanAndFormatName,
  separateRollAndName
} from './fieldNormalizer';

export interface ImportCommitOptions {
  parsedData: ParsedPDFData;
  columnMappings: ColumnMapping[];
  confirmedSubjectName: string;
  maxMarks: number;
  duplicateResolutionStrategy: 'replace' | 'keep_old' | 'version';
  onProgress?: (step: string, progress: number) => void;
}

export interface ImportCommitResult {
  importRecord: ImportRecord;
  newStudentsCount: number;
  matchedStudentsCount: number;
  resultsImportedCount: number;
  resultsUpdatedCount: number;
  unresolvedCount: number;
}

interface ActiveSubjectColumn {
  mapping: ColumnMapping;
  subjectName: string;
  subject: Subject;
}

export async function commitPDFImport(
  options: ImportCommitOptions,
  settings: SystemSettings
): Promise<ImportCommitResult> {
  const {
    parsedData,
    columnMappings,
    confirmedSubjectName,
    maxMarks,
    duplicateResolutionStrategy,
    onProgress
  } = options;

  onProgress?.('Fetching existing database records...', 10);
  const [existingStudents, existingSubjects, existingResults] = await Promise.all([
    dbService.getAllStudents(),
    dbService.getAllSubjects(),
    dbService.getAllResults()
  ]);

  // 1. Identify and provision all Subject records (single-subject or 50+ college matrix)
  onProgress?.('Detecting and provisioning course subjects catalog...', 25);
  const activeSubjectColumns: ActiveSubjectColumn[] = [];

  for (const mapping of columnMappings) {
    const target = mapping.targetField;
    if (!target || target === 'ignore') continue;

    const subCheck = isSubjectField(target);
    let subName = '';
    if (subCheck.isSubject) {
      subName = subCheck.subjectName;
    } else if (target === 'marks' || target === '{marks}' || target === 'score') {
      subName = confirmedSubjectName.trim() || 'General Subject';
    }

    if (subName) {
      const normSub = subName.trim().toLowerCase();
      let subObj = existingSubjects.find(s => s.normalizedName === normSub);
      if (!subObj) {
        subObj = {
          id: `subj_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          name: subName.trim(),
          normalizedName: normSub,
          maxMarks: maxMarks || settings.defaultMaxMarks || 100,
          passMarks: Math.round(((settings.passPercentage || 40) / 100) * (maxMarks || 100)),
          createdAt: new Date().toISOString()
        };
        existingSubjects.push(subObj);
        await dbService.saveSubject(subObj);
      }
      activeSubjectColumns.push({
        mapping,
        subjectName: subObj.name,
        subject: subObj
      });
    }
  }

  // Fallback: If no subject columns were identified, ensure at least confirmedSubjectName exists
  if (activeSubjectColumns.length === 0) {
    const normSubName = (confirmedSubjectName || 'General Subject').trim().toLowerCase();
    let fallbackSubject = existingSubjects.find(s => s.normalizedName === normSubName);
    if (!fallbackSubject) {
      fallbackSubject = {
        id: `subj_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        name: confirmedSubjectName.trim() || 'General Subject',
        normalizedName: normSubName,
        maxMarks: maxMarks || settings.defaultMaxMarks || 100,
        passMarks: Math.round(((settings.passPercentage || 40) / 100) * (maxMarks || 100)),
        createdAt: new Date().toISOString()
      };
      existingSubjects.push(fallbackSubject);
      await dbService.saveSubject(fallbackSubject);
    }
    const candidateMarksCol =
      columnMappings.find(c => c.targetField === 'marks' || c.targetField === '{marks}') ||
      columnMappings[columnMappings.length - 1];

    if (candidateMarksCol) {
      activeSubjectColumns.push({
        mapping: candidateMarksCol,
        subjectName: fallbackSubject.name,
        subject: fallbackSubject
      });
    }
  }

  const primarySubject = activeSubjectColumns[0]?.subject;
  const importId = `imp_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  let newStudentsCount = 0;
  let matchedStudentsCount = 0;
  let resultsImportedCount = 0;
  let resultsUpdatedCount = 0;
  let unresolvedCount = 0;

  const studentsToSave: Student[] = [];
  const resultsToSave: Result[] = [];
  const unresolvedToSave: UnresolvedRecord[] = [];

  // Local working copy of students so subsequent rows in same PDF can match newly created students
  const workingStudents = [...existingStudents];
  const workingResults = [...existingResults];

  onProgress?.('Processing student profiles & distributing subject marks...', 50);
  for (let rowIndex = 0; rowIndex < parsedData.rawRows.length; rowIndex++) {
    const rawRow = parsedData.rawRows[rowIndex];
    const evaluation = evaluateStudentRow(
      rawRow,
      columnMappings,
      workingStudents,
      workingResults,
      primarySubject?.id,
      maxMarks
    );

    if (evaluation.matchType === 'unresolved') {
      const unresolvedRec = createUnresolvedRecordFromEvaluation(
        evaluation,
        importId,
        parsedData.fileName,
        1
      );
      unresolvedToSave.push(unresolvedRec);
      unresolvedCount++;
      continue;
    }

    let targetStudent: Student;

    if (evaluation.matchType === 'new_student') {
      const studentIdVal = evaluation.extractedData.studentId || `STU${Date.now().toString().slice(-4)}${rowIndex}`;
      const separated = separateRollAndName(
        evaluation.extractedData.rollNumber || `${100 + workingStudents.length + 1}`,
        evaluation.extractedData.name || 'Unnamed Student'
      );
      const rollNumVal = separated.rollNumber || `${100 + workingStudents.length + 1}`;
      const nameVal = cleanAndFormatName(separated.name) || 'Unnamed Student';

      targetStudent = {
        id: `stu_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        name: nameVal,
        normalizedName: normalizeName(nameVal),
        rollNumber: rollNumVal,
        normalizedRollNumber: normalizeRollNumber(rollNumVal),
        studentId: studentIdVal,
        aliases: [],
        dynamicFields: { ...(evaluation.extractedData.dynamicFields || {}) },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      workingStudents.push(targetStudent);
      studentsToSave.push(targetStudent);
      newStudentsCount++;
    } else {
      // Existing student matched!
      targetStudent = evaluation.matchedStudent!;
      matchedStudentsCount++;

      // Merge missing attributes or dynamic fields if current row has them
      let hasUpdates = false;

      if ((!targetStudent.name || targetStudent.name === 'Unnamed Student') && evaluation.extractedData.name) {
        const cleanedName = cleanAndFormatName(evaluation.extractedData.name);
        if (cleanedName && cleanedName !== 'Unnamed Student') {
          targetStudent.name = cleanedName;
          targetStudent.normalizedName = normalizeName(cleanedName);
          hasUpdates = true;
        }
      }

      if (!targetStudent.studentId && evaluation.extractedData.studentId) {
        targetStudent.studentId = evaluation.extractedData.studentId;
        hasUpdates = true;
      }
      if (!targetStudent.rollNumber && evaluation.extractedData.rollNumber) {
        targetStudent.rollNumber = evaluation.extractedData.rollNumber;
        targetStudent.normalizedRollNumber = normalizeRollNumber(evaluation.extractedData.rollNumber);
        hasUpdates = true;
      }

      // Merge dynamic fields into student profile
      if (evaluation.extractedData.dynamicFields && Object.keys(evaluation.extractedData.dynamicFields).length > 0) {
        targetStudent.dynamicFields = {
          ...(targetStudent.dynamicFields || {}),
          ...evaluation.extractedData.dynamicFields
        };
        hasUpdates = true;
      }

      if (hasUpdates) {
        targetStudent.updatedAt = new Date().toISOString();
        studentsToSave.push(targetStudent);
      }
    }

    // Distribute marks to each active subject column in this row
    for (const subCol of activeSubjectColumns) {
      const rawVal = (rawRow[subCol.mapping.originalHeader] || '').trim();
      if (!rawVal) continue; // Student did not have an entry for this subject in this row

      const parsedMarks = parseMarksValue(rawVal, subCol.subject.maxMarks || maxMarks);

      // Check if result for this student and subject already exists
      const existingSubjectResult = workingResults.find(
        r => r.studentId === targetStudent.id && r.subjectId === subCol.subject.id
      );

      if (existingSubjectResult) {
        if (duplicateResolutionStrategy === 'replace') {
          existingSubjectResult.marks = parsedMarks.marks;
          existingSubjectResult.numericMarks = parsedMarks.numericMarks;
          existingSubjectResult.maxMarks = parsedMarks.maxMarks;
          existingSubjectResult.percentage = parsedMarks.percentage;
          existingSubjectResult.grade = parsedMarks.grade;
          existingSubjectResult.dynamicFields = {
            ...(existingSubjectResult.dynamicFields || {}),
            ...(evaluation.extractedData.dynamicFields || {})
          };
          existingSubjectResult.sourceFile = parsedData.fileName;
          existingSubjectResult.importId = importId;
          existingSubjectResult.importedAt = new Date().toISOString();
          existingSubjectResult.version = (existingSubjectResult.version || 1) + 1;

          resultsToSave.push(existingSubjectResult);
          resultsUpdatedCount++;
        } else if (duplicateResolutionStrategy === 'keep_old') {
          // Keep existing mark, do nothing
        } else if (duplicateResolutionStrategy === 'version') {
          const newVersionResult: Result = {
            id: `res_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
            studentId: targetStudent.id,
            subjectId: subCol.subject.id,
            subjectName: subCol.subject.name,
            marks: parsedMarks.marks,
            numericMarks: parsedMarks.numericMarks,
            maxMarks: parsedMarks.maxMarks,
            percentage: parsedMarks.percentage,
            grade: parsedMarks.grade,
            dynamicFields: { ...(evaluation.extractedData.dynamicFields || {}) },
            sourceFile: parsedData.fileName,
            importId,
            importedAt: new Date().toISOString(),
            version: (existingSubjectResult.version || 1) + 1
          };
          workingResults.push(newVersionResult);
          resultsToSave.push(newVersionResult);
          resultsImportedCount++;
        }
      } else {
        const newResult: Result = {
          id: `res_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
          studentId: targetStudent.id,
          subjectId: subCol.subject.id,
          subjectName: subCol.subject.name,
          marks: parsedMarks.marks,
          numericMarks: parsedMarks.numericMarks,
          maxMarks: parsedMarks.maxMarks,
          percentage: parsedMarks.percentage,
          grade: parsedMarks.grade,
          dynamicFields: { ...(evaluation.extractedData.dynamicFields || {}) },
          sourceFile: parsedData.fileName,
          importId,
          importedAt: new Date().toISOString(),
          version: 1
        };
        workingResults.push(newResult);
        resultsToSave.push(newResult);
        resultsImportedCount++;
      }
    }
  }

  onProgress?.('Persisting batch records to IndexedDB...', 80);

  // Batch save to IndexedDB
  if (studentsToSave.length > 0) {
    await dbService.saveStudentsBatch(studentsToSave);
  }
  if (resultsToSave.length > 0) {
    await dbService.saveResultsBatch(resultsToSave);
  }
  if (unresolvedToSave.length > 0) {
    await dbService.saveUnresolvedBatch(unresolvedToSave);
  }

  const distinctSubjectsCount = new Set(activeSubjectColumns.map(c => c.subject.id)).size;
  const subjectsListSummary = activeSubjectColumns.map(c => c.subjectName).slice(0, 5).join(', ') +
    (activeSubjectColumns.length > 5 ? ` +${activeSubjectColumns.length - 5} more` : '');

  // Create and save Import History Record
  const importRecord: ImportRecord = {
    id: importId,
    fileName: parsedData.fileName,
    fileSize: parsedData.fileSize,
    subject: distinctSubjectsCount > 1 ? `${distinctSubjectsCount} Subjects Matrix (${subjectsListSummary})` : (primarySubject?.name || 'General Subject'),
    importedAt: new Date().toISOString(),
    recordsDetected: parsedData.rawRows.length,
    recordsImported: resultsImportedCount,
    recordsUpdated: resultsUpdatedCount,
    duplicates: resultsUpdatedCount,
    warnings: parsedData.warnings.length + (unresolvedCount > 0 ? 1 : 0),
    errors: 0,
    status: unresolvedCount > 0 && resultsImportedCount === 0 ? 'partial' : 'completed',
    details: [
      `Distributed ${resultsImportedCount} marks across ${distinctSubjectsCount} subjects (${subjectsListSummary}).`,
      `Created ${newStudentsCount} new student master profiles.`,
      `Matched & merged with ${matchedStudentsCount} existing students.`,
      resultsUpdatedCount > 0 ? `Updated ${resultsUpdatedCount} existing marks entries.` : '',
      unresolvedCount > 0 ? `Logged ${unresolvedCount} ambiguous records for manual review.` : ''
    ].filter(Boolean)
  };

  await dbService.saveImportRecord(importRecord);
  onProgress?.('Import complete!', 100);

  return {
    importRecord,
    newStudentsCount,
    matchedStudentsCount,
    resultsImportedCount,
    resultsUpdatedCount,
    unresolvedCount
  };
}

