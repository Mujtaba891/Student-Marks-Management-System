const fs = require('fs');
let code = fs.readFileSync('src/ui/icons.ts', 'utf8');

const lastBracket = code.lastIndexOf('};');
if (lastBracket !== -1) {
  code = code.substring(0, lastBracket);
}
// Strip any trailing junk
code = code.trim().replace(/,$/, '').replace(/};$/, '').trim();

if (!code.includes('user:')) {
  code += `,\n  user: \`<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>\``;
}
if (!code.includes('wand:')) {
  code += `,\n  wand: \`<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4V2"/><path d="M15 16v-2"/><path d="M8 9h2"/><path d="M20 9h2"/><path d="M17.8 11.8l1.4 1.4"/><path d="M17.8 6.2l1.4-1.4"/><path d="M12.2 6.2l-1.4-1.4"/><path d="M12.2 11.8l-1.4 1.4"/><path d="M2 22l8-8"/></svg>\``;
}
code += '\n};\n';

fs.writeFileSync('src/ui/icons.ts', code);
