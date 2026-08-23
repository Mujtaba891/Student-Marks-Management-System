const fs = require('fs');
let code = fs.readFileSync('src/types.ts', 'utf8');

code = code.replace(/export interface Student \{/, 
  'export interface Student {\n  aiMagicFields?: Record<string, string>;\n  normalizedStudentId?: string;');
fs.writeFileSync('src/types.ts', code);
