import * as fs from 'fs';

const xml = fs.readFileSync('scratch/word/document.xml', 'utf-8');

const pos = xml.indexOf('암 부족 이유 설명하기');
console.log('Position of "암 부족 이유 설명하기":', pos);

if (pos >= 0) {
  const slice = xml.slice(pos - 200, pos + 8000);
  console.log('=== XML FOR BOTTOM BAR ===');
  console.log(slice);
}

