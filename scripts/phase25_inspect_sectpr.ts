import * as fs from 'fs';
import * as path from 'path';
import JSZip from 'jszip';

async function main() {
  const debugDir = path.resolve(process.cwd(), 'debug/phase25-web-ui-fidelity');
  const docxPath = path.join(debugDir, 'pentech_v3_original.docx');
  const data = fs.readFileSync(docxPath);
  const zip = await JSZip.loadAsync(data);
  const docXml = await zip.file('word/document.xml')!.async('text');

  // Let's find the first sectPr and the XML around it
  const sectPrIdx = docXml.indexOf('<w:sectPr');
  console.log('--- XML around first <w:sectPr> (end of section 1) ---');
  console.log(docXml.slice(Math.max(0, sectPrIdx - 300), sectPrIdx + 300));

  const secondSectPrIdx = docXml.indexOf('<w:sectPr', sectPrIdx + 10);
  console.log('\n--- XML around second <w:sectPr> (end of section 2) ---');
  console.log(docXml.slice(Math.max(0, secondSectPrIdx - 300), secondSectPrIdx + 300));
}

main().catch(console.error);
