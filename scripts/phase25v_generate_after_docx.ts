import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { FigmaCanvasParser } from '../src/canvas/parser/figmaCanvasParser.js';
import { DocxCanvasRenderer } from '../src/canvas/renderer/docxCanvasRenderer.js';

async function main() {
  const rootDir = process.cwd();
  const targetDir = path.resolve(rootDir, 'debug/phase25v-gpt-review');
  fs.mkdirSync(targetDir, { recursive: true });

  const beforeSrc = path.resolve(rootDir, 'debug/phase25-web-ui-fidelity/pentech_v3_original.docx');
  const jsonSrc = path.resolve(rootDir, 'debug/phase25-web-ui-fidelity/pentech_v3_original.json');

  const beforeDst = path.join(targetDir, 'before.docx');
  const afterDst = path.join(targetDir, 'after.docx');

  // Copy Before DOCX
  fs.copyFileSync(beforeSrc, beforeDst);
  console.log(`Copied before.docx (${(fs.statSync(beforeDst).size / 1024 / 1024).toFixed(2)} MB)`);

  // Parse JSON with current Phase 25 production code
  console.log('Reading JSON snapshot...');
  const raw = JSON.parse(fs.readFileSync(jsonSrc, 'utf8'));

  const parser = new FigmaCanvasParser({
    imageMap: raw.imageMap,
    scalePolicy: 'fit-a4',
  });

  console.log('Parsing CanvasDocument using Phase 25 production FigmaCanvasParser...');
  const doc = parser.parse(raw);
  console.log(`Parsed CanvasDocument with ${doc.pages.length} pages.`);

  console.log('Rendering DOCX using Phase 25 production DocxCanvasRenderer...');
  const renderer = new DocxCanvasRenderer();
  const buffer = await renderer.renderToBuffer(doc);

  fs.writeFileSync(afterDst, buffer);
  console.log(`Wrote after.docx (${(buffer.length / 1024 / 1024).toFixed(2)} MB)`);

  // Calculate and log SHA-256 hashes
  const sha256 = (p: string) => {
    const data = fs.readFileSync(p);
    return crypto.createHash('sha256').update(data).digest('hex');
  };

  const meta = {
    generatedAt: new Date().toISOString(),
    jsonSha256: sha256(jsonSrc),
    beforeSha256: sha256(beforeDst),
    afterSha256: sha256(afterDst),
    beforeSizeBytes: fs.statSync(beforeDst).size,
    afterSizeBytes: fs.statSync(afterDst).size,
    afterPageCount: doc.pages.length,
    scalePolicy: 'fit-a4',
  };

  fs.writeFileSync(path.join(targetDir, 'docx-metadata.json'), JSON.stringify(meta, null, 2));
  console.log('Metadata saved:', meta);
}

main().catch(console.error);
