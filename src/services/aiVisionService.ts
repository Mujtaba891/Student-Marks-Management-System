import * as pdfjsLib from 'pdfjs-dist';
import { ParsedPDFData, ColumnMapping, CustomAliases } from '../types';
import { detectFieldForHeader } from './fieldNormalizer';

export interface VisionExtractionResult {
  title: string;
  detectedSubject: string;
  headers: string[];
  rows: Array<Record<string, string>>;
  confidenceNotes?: string;
}

/**
 * Converts a File object (image or scanned file) to a base64 string without data URL prefix
 */
export async function fileToBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        const MAX_DIMENSION = 2000;
        if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
          if (width > height) {
            height *= MAX_DIMENSION / width;
            width = MAX_DIMENSION;
          } else {
            width *= MAX_DIMENSION / height;
            height = MAX_DIMENSION;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          const match = result.match(/^data:([^;]+);base64,(.*)$/);
          if (match) {
            return resolve({ mimeType: match[1], base64: match[2] });
          }
          return resolve({ mimeType: file.type || 'image/jpeg', base64: result });
        }
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.80);
        const match = dataUrl.match(/^data:([^;]+);base64,(.*)$/);
        if (match) {
          resolve({ mimeType: match[1], base64: match[2] });
        } else {
          resolve({ mimeType: 'image/jpeg', base64: dataUrl });
        }
      };
      img.onerror = () => {
        const match = result.match(/^data:([^;]+);base64,(.*)$/);
        if (match) {
          resolve({ mimeType: match[1], base64: match[2] });
        } else {
          resolve({ mimeType: file.type || 'image/jpeg', base64: result });
        }
      };
      img.src = result;
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

/**
 * Renders a PDF page to a high-DPI canvas and returns its base64 JPEG representation
 */
export async function renderPdfPageToBase64(
  pdfDocument: any,
  pageNum: number,
  scale: number = 1.5
): Promise<string> {
  const page = await pdfDocument.getPage(pageNum);
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  canvas.height = viewport.height;
  canvas.width = viewport.width;

  if (!context) {
    throw new Error('Canvas 2D context not available.');
  }

  // Draw white background
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);

  const renderContext = {
    canvasContext: context,
    viewport: viewport
  };

  await page.render(renderContext).promise;

  const dataUrl = canvas.toDataURL('image/jpeg', 0.70);
  return dataUrl.replace(/^data:image\/jpeg;base64,/, '');
}

/**
 * Calls the backend Gemini AI Vision endpoint to extract structured marksheet data
 */
export async function extractMarksheetWithGemini(
  base64Data: string,
  mimeType: string,
  fileName: string,
  isMultiPage: boolean = false
): Promise<VisionExtractionResult> {
  const response = await fetch('/api/gemini/extract-marksheet', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      base64Data,
      mimeType,
      fileName,
      isMultiPage
    })
  });

  if (!response.ok) {
    const errorJson = await response.json().catch(() => ({}));
    throw new Error(
      errorJson.error || `Server responded with status ${response.status} during AI vision extraction.`
    );
  }

  const result = await response.json();
  if (!result.success || !result.data) {
    throw new Error(result.error || 'Invalid response format from Gemini extraction service.');
  }

  return result.data as VisionExtractionResult;
}

/**
 * High-level service function to process an image file (camera capture, PNG, JPG, WEBP)
 * or a scanned PDF using Gemini AI Vision, returning a standard ParsedPDFData object.
 */
export async function processFileWithAiVision(
  file: File,
  customAliases?: CustomAliases,
  onProgress?: (msg: string, progressPct: number) => void
): Promise<ParsedPDFData> {
  const isPdf = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf';

  let allRows: Array<Record<string, string>> = [];
  let detectedHeaders: string[] = [];
  let docTitle = file.name.replace(/\.[^/.]+$/, '');
  let detectedSubject = 'Academic Examination';
  let totalPages = 1;

  if (isPdf) {
    onProgress?.('Loading PDF document for high-resolution visual analysis...', 20);
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(arrayBuffer),
      useSystemFonts: true
    });
    const pdfDocument = await loadingTask.promise;
    totalPages = pdfDocument.numPages;

    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      onProgress?.(
        `Rendering & analyzing Page ${pageNum} of ${totalPages} with Gemini Vision AI...`,
        Math.round(25 + (pageNum / totalPages) * 55)
      );

      const pageBase64 = await renderPdfPageToBase64(pdfDocument, pageNum, 1.5);
      const pageResult = await extractMarksheetWithGemini(
        pageBase64,
        'image/jpeg',
        `${file.name}_page_${pageNum}`,
        totalPages > 1
      );

      if (pageNum === 1) {
        docTitle = pageResult.title || docTitle;
        detectedSubject = pageResult.detectedSubject || detectedSubject;
        detectedHeaders = pageResult.headers || [];
      }

      if (pageResult.headers && pageResult.headers.length > 0) {
        // Ensure headers are unified
        for (const h of pageResult.headers) {
          if (!detectedHeaders.includes(h)) {
            detectedHeaders.push(h);
          }
        }
      }

      if (pageResult.rows && pageResult.rows.length > 0) {
        allRows.push(...pageResult.rows);
      }
    }
  } else {
    // Image file (camera photo, screenshot, PNG, JPG, WEBP)
    onProgress?.('Preparing image and transmitting to Gemini Vision OCR...', 35);
    const { base64, mimeType } = await fileToBase64(file);

    onProgress?.('Gemini Vision AI is detecting tabular marks & student records...', 65);
    const visionResult = await extractMarksheetWithGemini(base64, mimeType, file.name, false);

    docTitle = visionResult.title || docTitle;
    detectedSubject = visionResult.detectedSubject || detectedSubject;
    detectedHeaders = visionResult.headers || [];
    allRows = visionResult.rows || [];
  }

  onProgress?.('Formatting columns and building academic attribute mappings...', 92);

  // If no headers were returned, synthesize headers from row keys
  if (detectedHeaders.length === 0 && allRows.length > 0) {
    const keySet = new Set<string>();
    allRows.forEach(r => Object.keys(r).forEach(k => keySet.add(k)));
    detectedHeaders = Array.from(keySet);
  }

  // Generate column mappings with detection
  const columnMappings: ColumnMapping[] = detectedHeaders.map((header, idx) => {
    const sampleValues = allRows.slice(0, 10).map(r => r[header] || '').filter(Boolean);
    const detection = detectFieldForHeader(header, sampleValues, customAliases);

    return {
      columnIndex: idx,
      originalHeader: header,
      normalizedHeader: header.toLowerCase().trim(),
      targetField: detection.targetField,
      confidence: Math.max(detection.confidence, 90), // High confidence for AI Vision
      sampleValues: sampleValues.slice(0, 4)
    };
  });

  return {
    fileName: file.name,
    fileSize: file.size,
    pageCount: totalPages,
    detectedSubject,
    rawRows: allRows,
    headers: detectedHeaders,
    columnMappings,
    isScannedOrImageOnly: false,
    warnings: allRows.length === 0 ? ['AI Vision could not detect any tabular rows in this document.'] : []
  };
}
