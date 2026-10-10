import * as fs from 'fs';

const xml = fs.readFileSync('scratch/word/document.xml', 'utf-8');

// Find the section starting around "암부족 이유 설명하기" or Table #35-#45
const pos = xml.indexOf('암부족 이유 설명하기');
console.log('Position of "암부족 이유 설명하기":', pos);

if (pos >= 0) {
  const slice = xml.slice(pos - 500, pos + 10000);
  // Print high-level outline of tags (<w:tbl>, <w:tr>, <w:tc>, <w:p>, text)
  const tagRegex = /<\/?w:(tbl|tr|tc|p)\b[^>]*>|<w:t[^>]*>([^<]+)<\/w:t>/g;
  let match;
  let indent = 0;
  let lines = 0;
  while ((match = tagRegex.exec(slice)) !== null && lines < 80) {
    const full = match[0];
    if (full.startsWith('<w:t')) {
      console.log('  '.repeat(indent) + `TEXT: "${match[2]}"`);
      lines++;
    } else if (full.startsWith('</w:')) {
      indent = Math.max(0, indent - 1);
      // console.log('  '.repeat(indent) + full);
    } else {
      const isSelfClosing = full.endsWith('/>');
      console.log('  '.repeat(indent) + full.slice(0, 40));
      if (!isSelfClosing) indent++;
      lines++;
    }
  }
}

