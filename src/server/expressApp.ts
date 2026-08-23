import express from 'express';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

export const app = express();

// Body parser with 50mb limit for large high-res camera photos and scanned PDF data
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Helper to lazily initialize Gemini SDK client
const getAiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is not configured in Vercel. Please go to Vercel Project Settings -> Environment Variables, add GEMINI_API_KEY, and then click REDEPLOY under the Deployments tab.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
};

// Vercel Serverless Function URL Normalization Middleware
app.use((req, res, next) => {
  const pathCandidate = (req.headers['x-matched-path'] as string) || req.originalUrl || req.url || '';
  console.log(`[Express Middleware] Method: ${req.method}, Path Candidate: "${pathCandidate}", Raw URL: "${req.url}"`);

  if (pathCandidate.includes('extract-marksheet')) {
    req.url = '/api/gemini/extract-marksheet';
  } else if (pathCandidate.includes('insights')) {
    req.url = '/api/gemini/insights';
  } else if (pathCandidate.includes('chat')) {
    req.url = '/api/gemini/chat';
  } else if (pathCandidate.includes('parse-students')) {
    req.url = '/api/gemini/parse-students';
  } else if (pathCandidate.includes('health')) {
    req.url = '/api/health';
  }
  next();
});

// Health check endpoint
app.get(['/api/health', '/health'], (req, res) => {
  res.json({
    status: 'ok',
    hasApiKey: Boolean(process.env.GEMINI_API_KEY),
    timestamp: new Date().toISOString()
  });
});

// AI Vision & Table Extraction endpoint for Captured Photos, Scanned Documents & Complex Marksheets
app.post(['/api/gemini/extract-marksheet', '/gemini/extract-marksheet', '/extract-marksheet'], async (req, res) => {
  try {
    const { mimeType, base64Data, fileName } = req.body;

    if (!base64Data) {
      return res.status(400).json({ error: 'Missing base64Data image/document payload.' });
    }

    const ai = getAiClient();
    const effectiveMime = mimeType || 'image/jpeg';

    const promptText = `You are an expert academic OCR and marksheet extraction engine specialized in college result gazettes, handwritten marks sheets, multi-subject matrix reports, and single-student scorecard/dossier PDFs.

CRITICAL INSTRUCTIONS:
1. Identify the document structure:
   - STRUCTURE A: Horizontal Multi-Student Table/Matrix (e.g. S.No, Names, Roll Numbers, Regd Nos, English, IT, Applied IT, Geology, Comunication, Total Marks, Percentage).
     * Extract every single student row in the table completely.
     * Keep columns in exact left-to-right order.
   - STRUCTURE B: Single-Student Report Card / Scorecard / Dossier (e.g. Roll Number, Student Name, Class / Semester, Academic Session, followed by a vertical list of subjects: IT, Applied IT, Geology, English, Documentary and Film Making, Communication, TOTAL, PERCENTAGE).
     * Flatten this student into 1 row where headers include the student attributes and each subject name, and the row contains the student's values and subject marks.

2. Return column headers as a clean 1D array of strings in "headers".
3. Return all student rows as a 2D array of string values in "rows", where each row's items match the exact order of "headers".
4. Do not drop or omit any marks, numbers, or student names.
5. Return strictly valid JSON following the schema.`;

    const MODEL_CANDIDATES = ['gemini-3.6-flash', 'gemini-2.5-flash', 'gemini-3.5-flash'];
    let extractedText: string | null = null;
    let lastError: any = null;

    for (const modelName of MODEL_CANDIDATES) {
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          console.log(`[Gemini Vision] Attempting extraction with model "${modelName}" (attempt ${attempt}/2)...`);
          const response = await ai.models.generateContent({
            model: modelName,
            contents: {
              parts: [
                {
                  inlineData: {
                    data: base64Data,
                    mimeType: effectiveMime,
                  },
                },
                {
                  text: promptText,
                },
              ],
            },
            config: {
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING, description: 'Document header, institute name, or exam title' },
                  detectedSubject: { type: Type.STRING, description: 'Semester, class, or primary discipline title' },
                  headers: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: 'List of column header titles in exact left-to-right order'
                  },
                  rows: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                      description: 'List of cell values for a student row matching the exact order of headers'
                    },
                    description: 'All extracted student data rows (each row is a list of string values matching headers)'
                  },
                  confidenceNotes: { type: Type.STRING, description: 'Brief observation on image quality and extraction reliability' }
                },
                required: ['headers', 'rows']
              },
            },
          });

          if (response.text) {
            extractedText = response.text;
            console.log(`[Gemini Vision] Successfully extracted data using model "${modelName}".`);
            break;
          }
        } catch (modelErr: any) {
          lastError = modelErr;
          const errMsg = String(modelErr?.message || modelErr);
          console.warn(`[Gemini Vision] Error with ${modelName} on attempt ${attempt}: ${errMsg}`);

          const isRetryable =
            errMsg.includes('503') ||
            errMsg.includes('UNAVAILABLE') ||
            errMsg.includes('429') ||
            errMsg.includes('RESOURCE_EXHAUSTED') ||
            errMsg.includes('high demand');

          if (isRetryable && attempt < 2) {
            const delay = 1200 * attempt + Math.floor(Math.random() * 400);
            await new Promise(r => setTimeout(r, delay));
          } else if (!isRetryable) {
            break;
          }
        }
      }

      if (extractedText) break;
    }

    if (!extractedText) {
      const errorDetail = lastError?.message || 'Model service temporarily busy. Please try again.';
      return res.status(503).json({
        error: `AI Vision OCR is experiencing high demand (${errorDetail}). Please retry in a few moments.`
      });
    }

    let parsedData;
    try {
      parsedData = JSON.parse(extractedText.replace(/^```json\s*/i, '').replace(/```$/, '').trim());
    } catch (parseErr) {
      console.error('Failed to parse Gemini JSON output:', extractedText);
      return res.status(500).json({ error: 'Failed to parse structured JSON from vision model.' });
    }

    return res.json({
      success: true,
      fileName: fileName || 'marksheet_capture',
      data: parsedJsonClean(parsedData)
    });
  } catch (err: any) {
    console.error('Server error during Gemini marksheet extraction:', err);
    return res.status(500).json({
      error: err.message || 'Internal server error processing marksheet with Gemini AI.'
    });
  }
});

// AI Student Performance Predictor & Alert System endpoint
app.post(['/api/gemini/insights', '/gemini/insights', '/insights'], async (req, res) => {
  try {
    const { classData } = req.body;

    if (!classData) {
      return res.status(400).json({ error: 'Missing classData payload.' });
    }

    const ai = getAiClient();

    const promptText = `You are an expert Academic Advisor AI. Analyze this class's academic performance data.
    
CRITICAL INSTRUCTIONS:
1. Identify the Top Performers (max 3) based on highest percentage/marks.
2. Identify the At-Risk Students (max 3) based on low scores, missing marks, or failing grades.
3. Generate a very brief (1-line) personalized feedback/action plan for each identified student.
4. Give a brief 2-sentence summary of the overall class performance.

Return strictly valid JSON following the schema.

Class Data (JSON):
${JSON.stringify(classData)}
`;

    const MODEL_CANDIDATES = ['gemini-3.6-flash', 'gemini-3.1-pro-preview'];
    let extractedText: string | null = null;

    for (const modelName of MODEL_CANDIDATES) {
      try {
        console.log(`[Gemini Insights] Attempting with model "${modelName}"...`);
        const response = await ai.models.generateContent({
          model: modelName,
          contents: promptText,
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                classSummary: { type: Type.STRING, description: 'Brief 2-sentence summary of overall class performance.' },
                topPerformers: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      studentId: { type: Type.STRING },
                      name: { type: Type.STRING },
                      feedback: { type: Type.STRING }
                    }
                  }
                },
                atRiskStudents: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      studentId: { type: Type.STRING },
                      name: { type: Type.STRING },
                      feedback: { type: Type.STRING }
                    }
                  }
                }
              },
              required: ['classSummary', 'topPerformers', 'atRiskStudents']
            },
          },
        });

        if (response.text) {
          extractedText = response.text;
          break;
        }
      } catch (modelErr: any) {
        console.warn(`[Gemini Insights] Error with ${modelName}: ${modelErr.message}`);
      }
    }

    if (!extractedText) {
      return res.status(503).json({ error: 'AI Insights service temporarily busy.' });
    }

    return res.json(JSON.parse(extractedText.replace(/^```json\s*/i, '').replace(/```$/, '').trim()));
  } catch (err: any) {
    console.error('Server error during Gemini insights extraction:', err);
    return res.status(500).json({
      error: err.message || 'Internal server error processing insights with Gemini AI.'
    });
  }
});

// Chat / Ask AI endpoint
app.post(['/api/gemini/chat', '/gemini/chat', '/chat'], async (req, res) => {
  try {
    const { prompt, classData } = req.body;
    const ai = getAiClient();
    const MODEL_CANDIDATES = ['gemini-3.6-flash', 'gemini-3.1-pro-preview'];
    let extractedText = null;

    const fullPrompt = `You are an AI Assistant for a teacher. Here is the academic class data:

${JSON.stringify(classData)}

Teacher asks: ${prompt}

Please provide a helpful, accurate, and professional response.`;

    for (const modelName of MODEL_CANDIDATES) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: fullPrompt
        });
        if (response.text) {
          extractedText = response.text;
          break;
        }
      } catch (modelErr: any) {
        console.warn(`[Gemini Chat] Error with ${modelName}: ${modelErr.message}`);
      }
    }

    if (!extractedText) {
      return res.status(503).json({ error: 'AI Chat service temporarily busy.' });
    }
    return res.json({ text: extractedText });
  } catch (err: any) {
    console.error('Server error during Gemini chat:', err);
    return res.status(500).json({ error: err.message || 'Internal server error processing chat with Gemini AI.' });
  }
});

// AI Magic Import endpoint
app.post(['/api/gemini/parse-students', '/gemini/parse-students', '/parse-students'], async (req, res) => {
  try {
    const { text } = req.body;
    const ai = getAiClient();
    const MODEL_CANDIDATES = ['gemini-3.6-flash', 'gemini-3.1-pro-preview'];
    let extractedText = null;

    const fullPrompt = `Extract all student records from the following messy text. Return strictly valid JSON array of objects with these keys: name (string), rollNumber (string), studentId (string, invent one if not present, e.g. "REG"+rollNumber), and dynamicFields (an object with any extra attributes like Parent Name, Address, Category, etc. DO NOT include Total Marks, Max Marks, Percentage, or Grade as these are calculated by the system automatically).

Text: ${text}`;

    for (const modelName of MODEL_CANDIDATES) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: fullPrompt,
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  rollNumber: { type: Type.STRING },
                  studentId: { type: Type.STRING },
                  dynamicFields: {
                    type: Type.OBJECT,
                    properties: {
                      Status: { type: Type.STRING },
                      Percentage: { type: Type.STRING },
                      Notes: { type: Type.STRING }
                    }
                  }
                },
                required: ['name', 'rollNumber', 'studentId']
              }
            }
          }
        });
        if (response.text) {
          extractedText = response.text;
          break;
        }
      } catch (modelErr: any) {
        console.warn(`[Gemini Parse] Error with ${modelName}: ${modelErr.message}`);
      }
    }

    if (!extractedText) {
      return res.status(503).json({ error: 'AI Parse service temporarily busy.' });
    }
    return res.json(JSON.parse(extractedText.replace(/^```json\s*/i, '').replace(/```$/, '').trim()));
  } catch (err: any) {
    console.error('Server error during Gemini parse:', err);
    return res.status(500).json({ error: err.message || 'Internal server error processing parsing with Gemini AI.' });
  }
});

function parsedJsonClean(data: any) {
  const headers: string[] = Array.isArray(data.headers) ? data.headers.map((h: any) => String(h).trim()).filter(Boolean) : [];
  const rows: Array<Record<string, string>> = [];

  if (Array.isArray(data.rows)) {
    for (const rawRow of data.rows) {
      if (Array.isArray(rawRow)) {
        const cleanRow: Record<string, string> = {};
        headers.forEach((h, idx) => {
          const val = rawRow[idx];
          cleanRow[h] = val !== null && val !== undefined ? String(val).trim() : '';
        });
        rows.push(cleanRow);
      } else if (rawRow && typeof rawRow === 'object') {
        const cleanRow: Record<string, string> = {};
        for (const [k, v] of Object.entries(rawRow)) {
          cleanRow[String(k).trim()] = v !== null && v !== undefined ? String(v).trim() : '';
        }
        rows.push(cleanRow);
      }
    }
  }

  return {
    title: data.title || 'Student Marks Report',
    detectedSubject: data.detectedSubject || 'Academic Examination',
    headers,
    rows,
    confidenceNotes: data.confidenceNotes || 'Extracted via Gemini Vision AI'
  };
}
