import * as fs from 'fs';
import * as path from 'path';
import JSZip from 'jszip';

async function main() {
  const docxPath = path.resolve('debug/phase32-benchmark/phase32_rendered.docx');
  const data = fs.readFileSync(docxPath);
  const zip = await JSZip.loadAsync(data);
  const docXml = await zip.file('word/document.xml')!.async('text');

  console.log(`=== Phase 32 Real DOCX Analysis ===`);
  console.log(`document.xml size: ${(docXml.length / 1024).toFixed(1)} KB`);

  // Count sections
  const sectPrs = docXml.match(/<w:sectPr\b[^>]*>[\s\S]*?<\/w:sectPr>/g) || [];
  console.log(`Sections count: ${sectPrs.length}`);

  sectPrs.forEach((sect, idx) => {
    const pgSzMatch = sect.match(/<w:pgSz\s+([^>]+)\/>/);
    const pgMarMatch = sect.match(/<w:pgMar\s+([^>]+)\/>/);
    console.log(`Section ${idx + 1}:`);
    if (pgSzMatch) console.log(`  pgSz: ${pgSzMatch[1]}`);
    if (pgMarMatch) console.log(`  pgMar: ${pgMarMatch[1]}`);
  });

  // Analyze shapes across all elements
  const roundrects = docXml.match(/<v:roundrect\b[^>]*>/g) || [];
  const rects = docXml.match(/<v:rect\b[^>]*>/g) || [];
  const shapes = docXml.match(/<v:shape\b[^>]*>/g) || [];
  const textboxes = docXml.match(/<v:textbox\b[^>]*>/g) || [];
  const images = docXml.match(/<v:imagedata\b[^>]*>/g) || [];
  const shadows = docXml.match(/<v:shadow\b[^>]*>/g) || [];

  console.log(`\nVML Elements:`);
  console.log(`  v:roundrect: ${roundrects.length}`);
  console.log(`  v:rect: ${rects.length}`);
  console.log(`  v:shape: ${shapes.length}`);
  console.log(`  v:textbox: ${textboxes.length}`);
  console.log(`  v:imagedata: ${images.length}`);
  console.log(`  v:shadow: ${shadows.length}`);

  // Analyze text paragraphs
  const paragraphs = docXml.match(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g) || [];
  const singleLineP = docXml.match(/<w:wordWrap w:val="0"\/>/g) || [];
  console.log(`\nParagraphs: ${paragraphs.length} (with wordWrap=0: ${singleLineP.length})`);

  // Inspect font usage
  const fonts = new Set<string>();
  const fontMatches = docXml.matchAll(/w:ascii="([^"]+)"/g);
  for (const m of fontMatches) {
    fonts.add(m[1]);
  }
  console.log(`\nFonts used in ASCII:`, Array.from(fonts));

  const eastAsiaFonts = new Set<string>();
  const eaMatches = docXml.matchAll(/w:eastAsia="([^"]+)"/g);
  for (const m of eaMatches) {
    eastAsiaFonts.add(m[1]);
  }
  console.log(`EastAsia Fonts used:`, Array.from(eastAsiaFonts));

  // Check arcsize values in roundrects
  const arcsizes = new Set<string>();
  for (const r of roundrects) {
    const m = r.match(/arcsize="([^"]+)"/);
    if (m) arcsizes.add(m[1]);
  }
  console.log(`\nUnique arcsize values in roundrects:`, Array.from(arcsizes).sort());
}

main().catch(console.error);
