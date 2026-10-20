import * as fs from 'fs';
import * as path from 'path';
import { FigmaCanvasParser } from '../src/canvas/parser/figmaCanvasParser.js';

const jsonPath = path.resolve(process.cwd(), 'debug/phase25-web-ui-fidelity/pentech_v3_original.json');
const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

const parser = new FigmaCanvasParser({
  imageMap: raw.imageMap,
  scalePolicy: 'fit-a4',
});

const doc = parser.parse(raw);
console.log(`Parsed total doc pages: ${doc.pages.length}`);

// Let's get the candidate frames that parser actually discovered:
// We can access private discoverPageFrames via casting
const discoveredFrames: any[] = (parser as any).discoverPageFrames(raw.figmaNode || raw.document || raw);

console.log(`Discovered ${discoveredFrames.length} candidate page frames:`);
const manifest = discoveredFrames.map((f: any, idx: number) => {
  const box = f.absoluteBoundingBox || { x: 0, y: 0, width: 0, height: 0 };
  const page = doc.pages[idx];
  return {
    pageNumber: idx + 1,
    frameId: f.id,
    frameName: f.name,
    type: f.type,
    figmaBox: {
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
    },
    canvasBounds: page ? page.bounds : null,
    elementCount: page ? page.elements.length : 0,
  };
});

console.table(manifest.map(m => ({
  page: m.pageNumber,
  frameId: m.frameId,
  name: m.frameName,
  figmaW: m.figmaBox.width,
  figmaH: m.figmaBox.height,
  canvasW: m.canvasBounds ? Math.round(m.canvasBounds.width) : null,
  canvasH: m.canvasBounds ? Math.round(m.canvasBounds.height) : null,
  elements: m.elementCount
})));

const outPath = path.resolve(process.cwd(), 'research/rea-document-engine/phase26-visual-fidelity/exact-17-frames.json');
fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2));
console.log('Saved exact frame manifest to:', outPath);
