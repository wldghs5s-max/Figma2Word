import * as fs from 'fs';
import * as path from 'path';
import { FigmaCanvasParser } from '../src/canvas/parser/figmaCanvasParser.js';

async function main() {
  const jsonPath = path.resolve('debug/phase25-web-ui-fidelity/pentech_v3_original.json');
  const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const parser = new FigmaCanvasParser({ imageMap: raw.imageMap, scalePolicy: 'fit-a4' });
  const doc = parser.parse(raw);

  console.log('=== Detailed Page Element Inventory ===');
  for (let i = 0; i < doc.pages.length; i++) {
    const page = doc.pages[i];
    console.log(`\n--------------------------------------------------`);
    console.log(`Page ${i + 1}: "${page.name}" (${page.bounds.width.toFixed(1)} x ${page.bounds.height.toFixed(1)} pt, ${page.elements.length} elements)`);

    const images = page.elements.filter(e => e.type === 'image');
    if (images.length > 0) {
      console.log(`  Images (${images.length}):`);
      for (const img of images) {
        console.log(`    - [${img.name}] (${img.bounds.x.toFixed(1)}, ${img.bounds.y.toFixed(1)}, ${img.bounds.width.toFixed(1)} x ${img.bounds.height.toFixed(1)}), ref=${img.imageRef}, mode=${img.imageScaleMode}`);
      }
    }

    const vectors = page.elements.filter(e => e.type === 'vector');
    if (vectors.length > 0) {
      console.log(`  Vectors (${vectors.length}): sample 3:`);
      for (const v of vectors.slice(0, 3)) {
        console.log(`    - [${v.name}] (${v.bounds.x.toFixed(1)}, ${v.bounds.y.toFixed(1)}, ${v.bounds.width.toFixed(1)} x ${v.bounds.height.toFixed(1)}), fill=${v.style?.fillColor}, stroke=${v.style?.strokeColor}`);
      }
    }

    // Check for negative coordinates or out-of-bounds elements
    const oob = page.elements.filter(e => e.bounds.x < -1 || e.bounds.y < -1 || e.bounds.x + e.bounds.width > page.bounds.width + 10 || e.bounds.y + e.bounds.height > page.bounds.height + 10);
    if (oob.length > 0) {
      console.log(`  Out-of-bounds elements (${oob.length}):`);
      for (const o of oob.slice(0, 5)) {
        console.log(`    - [${o.name}] at (${o.bounds.x.toFixed(1)}, ${o.bounds.y.toFixed(1)}, ${o.bounds.width.toFixed(1)} x ${o.bounds.height.toFixed(1)})`);
      }
    }
  }
}

main().catch(console.error);
