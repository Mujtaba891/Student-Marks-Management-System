const fs = require('fs');
const file = 'server.ts';
let code = fs.readFileSync(file, 'utf8');

const newEndpoints = `
  // Chat / Ask AI endpoint
  app.post('/api/gemini/chat', async (req, res) => {
    try {
      const { prompt, classData } = req.body;
      const ai = getAiClient();
      const MODEL_CANDIDATES = ['gemini-2.5-flash', 'gemini-3.7-flash'];
      let extractedText = null;
      let lastError = null;

      const fullPrompt = \`You are an AI Assistant for a teacher. Here is the academic class data:\n\n\${JSON.stringify(classData)}\n\nTeacher asks: \${prompt}\n\nPlease provide a helpful, accurate, and professional response.\`;

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
        } catch (modelErr) {
          lastError = modelErr;
          console.warn(\`[Gemini Chat] Error with \${modelName}: \${modelErr.message}\`);
        }
      }

      if (!extractedText) {
        return res.status(503).json({ error: 'AI Chat service temporarily busy.' });
      }
      return res.json({ text: extractedText });
    } catch (err) {
      console.error('Server error during Gemini chat:', err);
      return res.status(500).json({ error: err.message || 'Internal server error processing chat with Gemini AI.' });
    }
  });

  // AI Magic Import endpoint
  app.post('/api/gemini/parse-students', async (req, res) => {
    try {
      const { text } = req.body;
      const ai = getAiClient();
      const MODEL_CANDIDATES = ['gemini-2.5-flash', 'gemini-3.7-flash'];
      let extractedText = null;
      let lastError = null;

      const fullPrompt = \`Extract all student records from the following messy text. Return strictly valid JSON array of objects with these keys: name (string), rollNumber (string), studentId (string, invent one if not present, e.g. "REG"+rollNumber), and dynamicFields (an object with any extra attributes like Percentage, Pass/Fail, Parent Name, etc.).\n\nText: \${text}\`;

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
        } catch (modelErr) {
          lastError = modelErr;
          console.warn(\`[Gemini Parse] Error with \${modelName}: \${modelErr.message}\`);
        }
      }

      if (!extractedText) {
        return res.status(503).json({ error: 'AI Parse service temporarily busy.' });
      }
      return res.json(JSON.parse(extractedText));
    } catch (err) {
      console.error('Server error during Gemini parse:', err);
      return res.status(500).json({ error: err.message || 'Internal server error processing parsing with Gemini AI.' });
    }
  });

  // Vite development middleware vs production static bundle serving
`;

code = code.replace('  // Vite development middleware vs production static bundle serving', newEndpoints);

fs.writeFileSync(file, code);
