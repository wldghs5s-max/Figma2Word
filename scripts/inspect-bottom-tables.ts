import * as fs from 'fs';

const xml = fs.readFileSync('scratch/word/document.xml', 'utf-8');

// Find the last few tables
const tblMatches = [...xml.matchAll(/<w:tbl[\s>][\s\S]*?<\/w:tbl>/g)];
console.log('Total tables in document.xml:', tblMatches.length);

// Inspect the last 5 tables
for (let i = Math.max(0, tblMatches.length - 5); i < tblMatches.length; i++) {
  const tblXml = tblMatches[i][0];
  const gridMatch = tblXml.match(/<w:tblGrid>([\s\S]*?)<\/w:tblGrid>/);
  const gridCols = gridMatch ? (gridMatch[1].match(/<w:gridCol/g) || []).length : 0;
  
  const texts = [...tblXml.matchAll(/<w:t[^>]*>([^<]+)<\/w:t>/g)].map(m => m[1]);
  console.log(`\n=== Table #${i} (GridCols: ${gridCols}, Texts: ${texts.length}) ===`);
  console.log('Texts:', texts.join(' | '));
  
  // Also check cell widths
  const cells = [...tblXml.matchAll(/<w:tc[\s>]([\s\S]*?)<\/w:tc>/g)];
  cells.forEach((c, cIdx) => {
    const w = c[1].match(/<w:tcW[^>]+w:w="([^"]+)"/)?.[1];
    const type = c[1].match(/<w:tcW[^>]+w:type="([^"]+)"/)?.[1];
    const cellTexts = [...c[1].matchAll(/<w:t[^>]*>([^<]+)<\/w:t>/g)].map(m => m[1]).join(' ');
    console.log(`  Cell [${cIdx}]: width=${w} (${type}) | text="${cellTexts}"`);
  });
}

