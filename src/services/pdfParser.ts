import * as pdfjsLib from 'pdfjs-dist';
import { ParsedPDFData, ColumnMapping, CustomAliases } from '../types';
import { detectFieldForHeader } from './fieldNormalizer';

// Initialize PDF.js worker safely with matching version
if (typeof window !== 'undefined') {
  try {
    const version = (pdfjsLib as any).version || '6.2.108';
    try {
      pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.min.mjs',
        import.meta.url
      ).toString();
    } catch {
      pdfjsLib.GlobalWorkerOptions.workerSrc =
        `https://unpkg.com/pdfjs-dist@${version}/build/pdf.worker.min.mjs`;
    }
  } catch (e) {
    console.warn('PDF.js worker setup note:', e);
  }
}

export interface TextItemPos {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  page: number;
}

export interface MergedToken {
  text: string;
  startX: number;
  endX: number;
  width: number;
  y: number;
  page: number;
}

export interface ColumnBoundary {
  header: string;
  startX: number;
  endX: number;
  centerX: number;
}

/**
 * Extracts clean subject or report title from filename or document title
 */
export function extractSubjectFromFileName(fileName: string): string {
  let name = fileName.replace(/\.pdf$/i, '');
  name = name
    .replace(/[_-]+/g, ' ')
    .replace(/\b(final|result|results|marks|marksheet|sheet|exam|examination|sem|semester|session|\d{4})\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!name) return 'Academic Examination';

  return name
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Merges close horizontal text items into complete multi-word phrases (e.g. "Roll No.", "Applied IT", "Abdul Rehman Ahmad")
 */
function mergeHorizontalTokens(items: TextItemPos[], maxGap: number = 14): MergedToken[] {
  if (items.length === 0) return [];

  // Sort strictly by X coordinate
  const sorted = [...items].sort((a, b) => a.x - b.x);
  const merged: MergedToken[] = [];

  let current = {
    text: sorted[0].text,
    startX: sorted[0].x,
    endX: sorted[0].x + sorted[0].width,
    y: sorted[0].y,
    page: sorted[0].page
  };

  for (let i = 1; i < sorted.length; i++) {
    const item = sorted[i];
    const gap = item.x - current.endX;

    // If items are close enough to be part of the same phrase/word
    if (gap <= maxGap && gap >= -8) {
      current.text = `${current.text} ${item.text}`.trim();
      current.endX = Math.max(current.endX, item.x + item.width);
    } else {
      merged.push({
        text: current.text,
        startX: current.startX,
        endX: current.endX,
        width: current.endX - current.startX,
        y: current.y,
        page: current.page
      });
      current = {
        text: item.text,
        startX: item.x,
        endX: item.x + item.width,
        y: item.y,
        page: item.page
      };
    }
  }

  merged.push({
    text: current.text,
    startX: current.startX,
    endX: current.endX,
    width: current.endX - current.startX,
    y: current.y,
    page: current.page
  });

  return merged;
}

/**
 * Fast local PDF Table Extractor with multi-page table stitching, adaptive column boundary
 * intervals, and multi-word token reconstruction.
 */
export async function parsePDFFile(
  file: File,
  customAliases?: CustomAliases,
  onProgress?: (step: string, progressPct: number) => void
): Promise<ParsedPDFData> {
  onProgress?.('Reading PDF stream & extracting document metadata...', 10);
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(arrayBuffer),
    useSystemFonts: true
  });

  const pdfDocument = await loadingTask.promise;
  const pageCount = pdfDocument.numPages;

  const allItems: TextItemPos[] = [];
  let totalTextChars = 0;
  const warnings: string[] = [];

  for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
    const pagePercent = Math.round(15 + (pageNum / pageCount) * 55);
    onProgress?.(`Extracting visual text elements from Page ${pageNum} of ${pageCount}...`, pagePercent);

    const page = await pdfDocument.getPage(pageNum);
    const textContent = await page.getTextContent();
    const viewport = page.getViewport({ scale: 1.0 });

    for (const item of textContent.items as any[]) {
      if (!item.str || item.str.trim() === '') continue;
      const tx = item.transform;
      // In PDF.js viewport, tx[4] is X, tx[5] is Y from bottom. Convert Y to top-down for intuitive sorting
      const x = tx[4];
      const y = viewport.height - tx[5];
      const width = item.width || Math.max(8, item.str.length * 6);
      const height = item.height || 10;

      totalTextChars += item.str.trim().length;
      allItems.push({
        text: item.str.trim(),
        x,
        y,
        width,
        height,
        page: pageNum
      });
    }
  }

  // Check for scanned / image-only PDFs
  if (allItems.length === 0 || totalTextChars < 20) {
    onProgress?.('No digital text layer found (scanned marksheet)...', 75);
    return {
      fileName: file.name,
      fileSize: file.size,
      pageCount,
      detectedSubject: extractSubjectFromFileName(file.name),
      rawRows: [],
      headers: [],
      columnMappings: [],
      isScannedOrImageOnly: true,
      warnings: [
        'Scanned or image-only PDF detected: No selectable digital text found. Use the built-in Gemini AI Vision OCR to extract marks from this document or photo.'
      ]
    };
  }

  // 1. Check if this PDF is a Single-Student-Per-Page Scorecard / Transcript Dossier (e.g. 50 students, 1 student per page)
  onProgress?.('Analyzing multi-subject matrix & student dossier structures...', 78);
  const reportCardResult = tryParseReportCardDossier(allItems, pageCount, file.name, file.size, customAliases, onProgress);
  if (reportCardResult && reportCardResult.rawRows.length > 0) {
    onProgress?.(`Matched ${reportCardResult.rawRows.length} student records across ${pageCount} pages...`, 95);
    console.log(`[PDF Parser] Detected individual student report-card format. Extracted ${reportCardResult.rawRows.length} student records.`);
    return reportCardResult;
  }

  // Detect subject or title from top text on Page 1 if present
  let detectedSubject = extractSubjectFromFileName(file.name);
  const page1Items = allItems.filter(i => i.page === 1).slice(0, 20);
  for (const item of page1Items) {
    const text = item.text;
    const match = text.match(/\b(?:subject|course|paper|discipline|class)\s*[:=-]\s*([a-zA-Z0-9\s]{3,40})/i);
    if (match && match[1]) {
      const sub = match[1].trim();
      if (sub.length > 2) {
        detectedSubject = sub;
        break;
      }
    }
  }

  const parsedRows: Array<Record<string, string>> = [];
  let detectedColumnBounds: ColumnBoundary[] = [];
  let detectedHeaders: string[] = [];

  for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
    const pageItems = allItems.filter(i => i.page === pageNum);

    // Group text items into visual lines (tolerance: 6px)
    pageItems.sort((a, b) => {
      const yDiff = a.y - b.y;
      if (Math.abs(yDiff) > 6) {
        return yDiff;
      }
      return a.x - b.x;
    });

    const lines: Array<{ y: number; items: TextItemPos[] }> = [];
    for (const item of pageItems) {
      let line = lines.find(l => Math.abs(l.y - item.y) <= 6);
      if (!line) {
        line = { y: item.y, items: [] };
        lines.push(line);
      } else {
        // Smooth line Y
        line.y = (line.y * line.items.length + item.y) / (line.items.length + 1);
      }
      line.items.push(item);
    }

    // Sort lines from top to bottom
    lines.sort((a, b) => a.y - b.y);

    for (const line of lines) {
      // Merge close words into phrases
      const tokens = mergeHorizontalTokens(line.items, 15);
      if (tokens.length === 0) continue;

      const tokenTexts = tokens.map(t => t.text);

      // Check if this line is a table header line
      if (detectedColumnBounds.length === 0) {
        let recognizedFieldCount = 0;
        for (const token of tokens) {
          const match = detectFieldForHeader(token.text, [], customAliases);
          if (match.targetField !== 'ignore' && match.confidence >= 55) {
            recognizedFieldCount++;
          }
        }

        // A valid header line usually has at least 2 or 3 recognizable student/exam fields (Roll, Name, Class, Marks, etc.)
        // or contains 4+ columns with header keywords
        const isLikelyHeader =
          recognizedFieldCount >= 2 ||
          (tokens.length >= 4 &&
            tokens.some(t => /roll|name|student|marks|sub|class|sem|percentage|total/i.test(t.text)));

        if (isLikelyHeader) {
          detectedHeaders = tokenTexts;

          // Build continuous column boundaries across the table width
          detectedColumnBounds = tokens.map((token, idx) => {
            const prevToken = tokens[idx - 1];
            const nextToken = tokens[idx + 1];

            const startX = prevToken
              ? (prevToken.endX + token.startX) / 2
              : Math.max(0, token.startX - 20);

            const endX = nextToken
              ? (token.endX + nextToken.startX) / 2
              : token.endX + 150;

            return {
              header: token.text,
              startX,
              endX,
              centerX: (token.startX + token.endX) / 2
            };
          });

          continue; // Skip processing the header line as a student data row
        }
      }

      // Check for repeating headers on subsequent pages (e.g. Page 2 header in multi-page reports)
      if (detectedColumnBounds.length > 0) {
        const isRepeatingHeader = tokens.some(t =>
          detectedHeaders.some(h => h.toLowerCase() === t.text.toLowerCase())
        ) && tokens.length >= 3;

        if (isRepeatingHeader && tokenTexts.filter(t => /roll|name|class|marks|total/i.test(t)).length >= 2) {
          continue; // Skip repeated table header on page 2, 3, etc.
        }
      }

      // If we have detected table columns, map tokens into columns
      if (detectedColumnBounds.length > 0) {
        const rowData: Record<string, string> = {};
        detectedColumnBounds.forEach(col => {
          rowData[col.header] = '';
        });

        for (const token of tokens) {
          // Find matching column bound
          let matchedCol = detectedColumnBounds.find(
            col => token.startX >= col.startX && token.startX <= col.endX
          );

          if (!matchedCol) {
            // Find closest column by distance to center
            let closestDist = Infinity;
            for (const col of detectedColumnBounds) {
              const dist = Math.abs(token.startX - col.centerX);
              if (dist < closestDist) {
                closestDist = dist;
                matchedCol = col;
              }
            }
          }

          if (matchedCol) {
            const currentVal = rowData[matchedCol.header];
            rowData[matchedCol.header] = currentVal
              ? `${currentVal} ${token.text}`.trim()
              : token.text.trim();
          }
        }

        // Validate that this row has real student marks / data (at least 2 non-empty values)
        const filledValues = Object.values(rowData).filter(v => v.trim().length > 0);
        if (filledValues.length >= 2) {
          const rowSummary = filledValues.join(' ').toLowerCase();
          // Filter out typical non-data footnotes
          if (
            !rowSummary.includes('authorized signature') &&
            !rowSummary.includes('controller of examination') &&
            !rowSummary.includes('attend my class') &&
            !/^page \d+ of \d+$/.test(rowSummary)
          ) {
            parsedRows.push(rowData);
          }
        }
      }
    }
  }

  // Fallback if no table header was detected
  if (detectedHeaders.length === 0) {
    warnings.push('Could not auto-detect standard table headers. Consider using AI Vision Extraction.');
    detectedHeaders = ['Roll No', 'Student Name', 'Marks', 'Result'];
  }

  // Generate column mappings
  const columnMappings: ColumnMapping[] = detectedHeaders.map((header, idx) => {
    const sampleValues = parsedRows.slice(0, 10).map(r => r[header] || '').filter(Boolean);
    const detection = detectFieldForHeader(header, sampleValues, customAliases);

    return {
      columnIndex: idx,
      originalHeader: header,
      normalizedHeader: header.toLowerCase().trim(),
      targetField: detection.targetField,
      confidence: detection.confidence,
      sampleValues: sampleValues.slice(0, 4)
    };
  });

  return {
    fileName: file.name,
    fileSize: file.size,
    pageCount,
    detectedSubject,
    rawRows: parsedRows,
    headers: detectedHeaders,
    columnMappings,
    isScannedOrImageOnly: false,
    warnings
  };
}

/**
 * Detects and parses multi-page PDF files where each page contains an individual student's
 * complete report card / transcript / scorecard (e.g., 50 students across 50 pages).
 */
export function tryParseReportCardDossier(
  allItems: TextItemPos[],
  pageCount: number,
  fileName: string,
  fileSize: number,
  customAliases?: CustomAliases,
  onProgress?: (step: string, progressPct: number) => void
): ParsedPDFData | null {
  // Need at least 1 page with enough text
  if (allItems.length < 10) return null;

  // Check Page 1 to verify report card structure
  const page1Items = allItems.filter(i => i.page === 1);
  const fullPage1Text = page1Items.map(i => i.text).join(' ');

  const hasReportCardKeywords =
    /roll\s*(?:no|number|#)?/i.test(fullPage1Text) &&
    /(?:student\s*name|name\s*of\s*student|candidate\s*name|student)/i.test(fullPage1Text) &&
    /(?:marks|score|subject|obtained|percentage|result)/i.test(fullPage1Text);

  if (!hasReportCardKeywords) {
    return null;
  }

  const allStudentRows: Array<Record<string, string>> = [];
  const subjectHeadersSet = new Set<string>();
  const attributeHeadersSet = new Set<string>();
  const aggregateHeadersSet = new Set<string>();

  for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
    const pageItems = allItems.filter(i => i.page === pageNum);
    if (pageItems.length === 0) continue;

    // Group into visual lines
    pageItems.sort((a, b) => {
      const yDiff = a.y - b.y;
      if (Math.abs(yDiff) > 6) return yDiff;
      return a.x - b.x;
    });

    const lines: Array<{ y: number; items: TextItemPos[] }> = [];
    for (const item of pageItems) {
      let line = lines.find(l => Math.abs(l.y - item.y) <= 6);
      if (!line) {
        line = { y: item.y, items: [] };
        lines.push(line);
      } else {
        line.y = (line.y * line.items.length + item.y) / (line.items.length + 1);
      }
      line.items.push(item);
    }
    lines.sort((a, b) => a.y - b.y);

    const studentRecord: Record<string, string> = {};

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const mergedTokens = mergeHorizontalTokens(line.items, 18);
      const lineText = mergedTokens.map(t => t.text).join(' ').trim();

      if (!lineText) continue;

      // 1. Check for Key-Value metadata pairs on the same line or adjacent tokens
      // e.g., "Roll Number: 001", "Student Name: Aadil Bhat", "Class / Semester: 3RD Sem"
      const kvMatch = lineText.match(/^([a-zA-Z\s/&.'’-]{3,30})\s*[:=-]\s*(.+)$/);
      if (kvMatch) {
        const rawKey = kvMatch[1].trim();
        const rawVal = kvMatch[2].trim();

        if (isSubjectCandidate(rawKey)) {
          const subMarks = extractFirstNumericScore(rawVal);
          if (subMarks) {
            studentRecord[rawKey] = subMarks;
            subjectHeadersSet.add(rawKey);
            continue;
          }
        }

        if (/total|grand\s*total/i.test(rawKey)) {
          const totalVal = extractFirstNumericScore(rawVal) || rawVal;
          studentRecord['Total Marks'] = totalVal;
          aggregateHeadersSet.add('Total Marks');
        } else if (/percentage|percent|%/i.test(rawKey)) {
          studentRecord['Percentage'] = rawVal;
          aggregateHeadersSet.add('Percentage');
        } else if (/result|status/i.test(rawKey)) {
          studentRecord['Result Status'] = rawVal;
          aggregateHeadersSet.add('Result Status');
        } else {
          studentRecord[rawKey] = rawVal;
          attributeHeadersSet.add(rawKey);
        }
        continue;
      }

      // Check for multi-column KV lines e.g. "Roll Number: 001   Class: 3RD Sem"
      let foundMultiKv = false;
      if (mergedTokens.length >= 2) {
        for (let tIdx = 0; tIdx < mergedTokens.length; tIdx++) {
          const tText = mergedTokens[tIdx].text.trim();
          const singleKv = tText.match(/^([a-zA-Z\s/&.'’-]{3,25})\s*[:=-]\s*(.+)$/);
          if (singleKv) {
            const key = singleKv[1].trim();
            const val = singleKv[2].trim();
            studentRecord[key] = val;
            attributeHeadersSet.add(key);
            foundMultiKv = true;
          }
        }
      }
      if (foundMultiKv) continue;

      // 2. Check for Table Row of Subject Marks (e.g. "IT | 81 | 100", "Documentary and Film Making   97   100")
      // Check if line starts with subject and has numeric scores
      const subjectRowMatch = matchSubjectTableRow(mergedTokens);
      if (subjectRowMatch) {
        if (subjectRowMatch.isTotal) {
          studentRecord['Total Marks'] = subjectRowMatch.marks;
          aggregateHeadersSet.add('Total Marks');
        } else if (subjectRowMatch.isPercentage) {
          studentRecord['Percentage'] = subjectRowMatch.marks;
          aggregateHeadersSet.add('Percentage');
        } else if (subjectRowMatch.isResultStatus) {
          studentRecord['Result Status'] = subjectRowMatch.marks;
          aggregateHeadersSet.add('Result Status');
        } else {
          studentRecord[subjectRowMatch.subject] = subjectRowMatch.marks;
          subjectHeadersSet.add(subjectRowMatch.subject);
        }
        continue;
      }

      // 3. Check for label-above, value-below lines
      // e.g. Line 1: "Roll Number", Line 2: "001"
      if (i + 1 < lines.length && mergedTokens.length === 1) {
        const label = mergedTokens[0].text.trim();
        if (/^(roll\s*no\.?|roll\s*number|student\s*name|name|class|semester|session|regd\s*no|reg\s*no)$/i.test(label)) {
          const nextLineTokens = mergeHorizontalTokens(lines[i + 1].items, 18);
          if (nextLineTokens.length === 1) {
            const val = nextLineTokens[0].text.trim();
            if (val && !/^(roll|name|class|subject|marks)/i.test(val)) {
              studentRecord[label] = val;
              attributeHeadersSet.add(label);
              i++; // Skip the next line since we consumed it as value
            }
          }
        }
      }
    }

    // Only add student record if it has at least a Name or Roll Number or multiple subjects
    const hasIdentifier = Boolean(
      studentRecord['Roll Number'] ||
      studentRecord['Roll No'] ||
      studentRecord['rollNumber'] ||
      studentRecord['Student Name'] ||
      studentRecord['Name'] ||
      studentRecord['Student']
    );

    const hasMarks = Object.keys(studentRecord).some(k => subjectHeadersSet.has(k));

    if (hasIdentifier || hasMarks) {
      allStudentRows.push(studentRecord);
    }
  }

  // If no student rows or only 0 subjects detected, fall back to table parser
  if (allStudentRows.length === 0 || (subjectHeadersSet.size === 0 && allStudentRows.length < 2)) {
    return null;
  }

  // Construct structured headers list
  // 1. Identifiers first
  const priorityIdentifiers = [
    'Roll Number', 'Roll No', 'rollNumber',
    'Student Name', 'Name', 'Student',
    'Class / Semester', 'Class', 'Semester',
    'Academic Session', 'Session',
    'Registration No', 'Regd No', 'Student ID'
  ];

  const orderedAttributes: string[] = [];
  for (const p of priorityIdentifiers) {
    if (attributeHeadersSet.has(p)) {
      orderedAttributes.push(p);
      attributeHeadersSet.delete(p);
    }
  }
  orderedAttributes.push(...Array.from(attributeHeadersSet));

  // 2. Subjects in middle
  const orderedSubjects = Array.from(subjectHeadersSet);

  // 3. Aggregates last
  const orderedAggregates = Array.from(aggregateHeadersSet);

  const finalHeaders = [...orderedAttributes, ...orderedSubjects, ...orderedAggregates];

  // Fill empty strings for any missing keys in rows
  const standardizedRows = allStudentRows.map(row => {
    const stdRow: Record<string, string> = {};
    finalHeaders.forEach(h => {
      stdRow[h] = (row[h] || '').trim();
    });
    return stdRow;
  });

  // Generate column mappings
  const columnMappings: ColumnMapping[] = finalHeaders.map((header, idx) => {
    const sampleValues = standardizedRows.slice(0, 10).map(r => r[header] || '').filter(Boolean);
    const detection = detectFieldForHeader(header, sampleValues, customAliases);

    return {
      columnIndex: idx,
      originalHeader: header,
      normalizedHeader: header.toLowerCase().trim(),
      targetField: detection.targetField,
      confidence: detection.confidence,
      sampleValues: sampleValues.slice(0, 4)
    };
  });

  return {
    fileName,
    fileSize,
    pageCount,
    detectedSubject: extractSubjectFromFileName(fileName),
    rawRows: standardizedRows,
    headers: finalHeaders,
    columnMappings,
    isScannedOrImageOnly: false,
    warnings: []
  };
}

function isSubjectCandidate(key: string): boolean {
  return /physics|chem|math|bio|english|urdu|geology|applied\s*it|it|cs|film|communic/i.test(key);
}

function extractFirstNumericScore(text: string): string | null {
  const match = text.match(/\b\d+(\.\d+)?\b/);
  return match ? match[0] : null;
}

function matchSubjectTableRow(tokens: MergedToken[]): {
  subject: string;
  marks: string;
  isTotal?: boolean;
  isPercentage?: boolean;
  isResultStatus?: boolean;
} | null {
  if (tokens.length === 0) return null;

  const fullText = tokens.map(t => t.text).join(' ').trim();

  // Check for Total / Percentage / Result Status lines
  if (/^total\b|^grand\s*total\b/i.test(fullText)) {
    const numbers = fullText.match(/\b\d+(\.\d+)?\b/g);
    return {
      subject: 'Total Marks',
      marks: numbers ? numbers[0] : fullText,
      isTotal: true
    };
  }

  if (/^percentage\b|^aggregate\s*%/i.test(fullText)) {
    const pctMatch = fullText.match(/\b\d+(\.\d+)?%?/);
    return {
      subject: 'Percentage',
      marks: pctMatch ? pctMatch[0] : fullText,
      isPercentage: true
    };
  }

  if (/^(?:result\s*status|result|status)\b/i.test(fullText)) {
    const statusMatch = fullText.match(/\b(PASS|FAIL|PASSED|FAILED|PROMOTED|DISTINCTION)\b/i);
    return {
      subject: 'Result Status',
      marks: statusMatch ? statusMatch[1].toUpperCase() : 'PASS',
      isResultStatus: true
    };
  }

  // Check if first token or token sequence is a Subject Name and subsequent token is a numeric mark
  // e.g. ["IT", "81", "100"], ["Applied IT", "54", "100"], ["Documentary and Film Making", "97", "100"]
  if (tokens.length >= 2) {
    const firstText = tokens[0].text.trim();
    const secondText = tokens[1].text.trim();

    // If first token is a subject name and second token is numeric marks
    if (/^\d+(\.\d+)?$/.test(secondText) && !/^\d+$/.test(firstText)) {
      return {
        subject: firstText,
        marks: secondText
      };
    }

    // Check if tokens 0 and 1 are combined subject (e.g. "Applied", "IT", "54")
    if (tokens.length >= 3) {
      const combinedSub = `${tokens[0].text} ${tokens[1].text}`.trim();
      const thirdText = tokens[2].text.trim();
      if (/^\d+(\.\d+)?$/.test(thirdText) && !/^\d+$/.test(combinedSub)) {
        return {
          subject: combinedSub,
          marks: thirdText
        };
      }
    }
  }

  // Regex check for single string line with subject + number
  const regexRow = fullText.match(/^([a-zA-Z\s/&.'’-]{2,40})\s+(\d{1,3}(?:\.\d+)?)(?:\s+\d{1,3})?$/);
  if (regexRow && !/^(roll|page|serial|sno|total|percentage)/i.test(regexRow[1].trim())) {
    return {
      subject: regexRow[1].trim(),
      marks: regexRow[2].trim()
    };
  }

  return null;
}
