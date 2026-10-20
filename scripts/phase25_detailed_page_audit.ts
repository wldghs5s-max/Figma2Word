import * as fs from 'fs';
import * as path from 'path';
import { FigmaCanvasParser } from '../src/canvas/parser/figmaCanvasParser.js';
import { CanvasDocument, CanvasPage } from '../src/canvas/types.js';

async function main() {
  const debugDir = path.resolve(process.cwd(), 'debug/phase25-web-ui-fidelity');
  const jsonPath = path.join(debugDir, 'pentech_v3_original.json');

  console.log('Loading JSON snapshot...');
  const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

  const parser = new FigmaCanvasParser({
    imageMap: raw.imageMap,
    scalePolicy: 'fit-a4',
  });

  const canvasDoc = parser.parse(raw);

  console.log(`\nDocument Title: ${canvasDoc.title}`);
  console.log(`Page Count: ${canvasDoc.pages.length}`);
  console.log(`Default Page Size: ${canvasDoc.pageSize.widthPt} x ${canvasDoc.pageSize.heightPt} pt (${canvasDoc.pageSize.orientation})`);

  const pageReports: any[] = [];

  for (let i = 0; i < canvasDoc.pages.length; i++) {
    const page = canvasDoc.pages[i];
    const elemStats = {
      text: page.elements.filter((e) => e.type === 'text').length,
      card: page.elements.filter((e) => e.type === 'card').length,
      image: page.elements.filter((e) => e.type === 'image').length,
      vector: page.elements.filter((e) => e.type === 'vector').length,
      oval: page.elements.filter((e) => e.type === 'oval').length,
    };

    const textElements = page.elements.filter((e) => e.type === 'text');
    let sampleTexts = textElements.slice(0, 5).map((t) => {
      const textVal = (t.textRuns || []).map((r) => r.text).join('');
      return {
        id: t.id,
        name: t.name,
        box: t.bounds,
        textPreview: textVal.slice(0, 40),
        fontSize: t.textRuns?.[0]?.fontSizePt,
        wrap: t.textWrap,
      };
    });

    const rep = {
      pageIndex: page.pageIndex,
      name: page.name,
      bounds: page.bounds, // width & height in pt
      aspectRatio: Number((page.bounds.width / page.bounds.height).toFixed(3)),
      orientation: page.bounds.width > page.bounds.height ? 'landscape' : 'portrait',
      elementCounts: elemStats,
      totalElements: page.elements.length,
      sampleTexts,
    };
    pageReports.push(rep);

    console.log(`\nPage ${page.pageIndex}: "${page.name}"`);
    console.log(`  Bounds: ${page.bounds.width} x ${page.bounds.height} pt (Aspect: ${rep.aspectRatio}, ${rep.orientation})`);
    console.log(`  Elements (${rep.totalElements}): Text=${elemStats.text}, Card=${elemStats.card}, Image=${elemStats.image}, Vector=${elemStats.vector}, Oval=${elemStats.oval}`);
    if (sampleTexts.length > 0) {
      console.log(`  Sample texts:`);
      for (const st of sampleTexts) {
        console.log(`    - [${st.name}] (w:${st.box.width.toFixed(1)}, h:${st.box.height.toFixed(1)}, font:${st.fontSize}pt, wrap:${st.wrap}): "${st.textPreview}"`);
      }
    }
  }

  fs.writeFileSync(
    path.join(debugDir, 'canvas_doc_detailed_inspection.json'),
    JSON.stringify(pageReports, null, 2)
  );
  console.log(`\nSaved detailed report to ${path.join(debugDir, 'canvas_doc_detailed_inspection.json')}`);
}

main().catch(console.error);
