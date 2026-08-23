const fs = require('fs');

function patchFile(filename) {
  let content = fs.readFileSync(filename, 'utf-8');
  
  const customSelectClasses = 'appearance-none bg-no-repeat bg-right pr-8 ';
  const customSelectStyle = ` style="background-image: url('data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' fill=\\'none\\' viewBox=\\'0 0 24 24\\' stroke=\\'%236b7280\\'><path stroke-linecap=\\'round\\' stroke-linejoin=\\'round\\' stroke-width=\\'2\\' d=\\'M19 9l-7 7-7-7\\'/></svg>'); background-size: 16px; background-position-x: calc(100% - 12px);"`;

  content = content.replace(/<select([^>]*)class="([^"]*)"([^>]*)>/g, (match, p1, p2, p3) => {
    if (p2.includes('appearance-none')) return match; // already patched
    return `<select${p1}class="${customSelectClasses}${p2}"${p3}${customSelectStyle}>`;
  });

  fs.writeFileSync(filename, content);
}

patchFile('src/ui/appRenderer.ts');
patchFile('src/ui/modals.ts');
