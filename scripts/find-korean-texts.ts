import * as fs from 'fs';

const xml = fs.readFileSync('scratch/word/document.xml', 'utf-8');

// Find all occurrences of <w:t> in the document
const allTexts = [...xml.matchAll(/<w:t[^>]*>([^<]+)<\/w:t>/g)];
console.log('Total text nodes:', allTexts.length);
allTexts.slice(45).forEach((t, i) => {
  console.log(`[${45 + i}] ${t[1]}`);
});

// Search for partial matches of '암', '부족', '이유', '설명'
allTexts.forEach((t, i) => {
  if (t[1].includes('암') || t[1].includes('부족') || t[1].includes('설명')) {
    console.log(`Match at [${i}]: "${t[1]}"`);
  }
});

