import * as fs from 'fs';
import * as path from 'path';
import JSZip from 'jszip';

async function main() {
  const debugDir = path.resolve(process.cwd(), 'debug/phase25-web-ui-fidelity');
  const docxPath = path.join(debugDir, 'pentech_v3_original.docx');
  const data = fs.readFileSync(docxPath);
  const zip = await JSZip.loadAsync(data);
  const docXml = await zip.file('word/document.xml')!.async('text');

  // Split by section properties
  // Each section ends with <w:sectPr> (either inside <w:pPr> or at the end of the document)
  const sections = docXml.split(/<w:sectPr[\s>]/);
  console.log(`Split into ${sections.length} chunks (representing ${sections.length - 1} sections)`);

  for (let i = 0; i < sections.length - 1; i++) {
    const secChunk = sections[i];
    // Find page size
    const nextChunk = sections[i + 1];
    const sectPrMatch = nextChunk.match(/^([^>]*>.*?<\/w:sectPr>)/s) || ['', nextChunk.slice(0, 300)];
    const pgSzMatch = sectPrMatch[0].match(/<w:pgSz\s+([^>]+)\/>/);
    const pgSzStr = pgSzMatch ? pgSzMatch[1] : 'no pgSz';

    // Count textboxes, shapes, text runs in this section
    const shapes = (secChunk.match(/<v:(shape|rect|roundrect|oval)/g) || []).length;
    const textboxes = (secChunk.match(/<v:textbox/g) || []).length;
    const images = (secChunk.match(/<v:imagedata/g) || []).length;

    // Extract text content
    const textMatches = [...secChunk.matchAll(/<w:t[^>]*>([^<]+)<\/w:t>/g)].map((m) => m[1]);
    const firstFewTexts = textMatches.slice(0, 4).join(' | ');

    console.log(`\n--- Section ${i + 1} ---`);
    console.log(`Page Size: ${pgSzStr}`);
    console.log(`Counts: Shapes=${shapes}, Textboxes=${textboxes}, Images=${images}, Texts=${textMatches.length}`);
    console.log(`Text preview: ${firstFewTexts.slice(0, 80)}`);
  }
}

main().catch(console.error);
