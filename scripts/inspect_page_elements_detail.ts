import * as fs from 'fs';
import * as path from 'path';
import { FigmaCanvasParser } from '../src/canvas/parser/figmaCanvasParser.js';

async function main() {
  const jsonPath = path.resolve('debug/phase25-web-ui-fidelity/pentech_v3_original.json');
  const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const parser = new FigmaCanvasParser({ imageMap: raw.imageMap, scalePolicy: 'fit-a4' });
  const doc = parser.parse(raw);

  // Inspect Page 4 (Dashboard view) and Page 8 (Business list)
  for (const pageIdx of [3, 7, 9, 14]) {
    const page = doc.pages[pageIdx];
    console.log(`\n========================================`);
    console.log(`Page ${pageIdx + 1}: "${page.name}" (${page.bounds.width} x ${page.bounds.height} pt, ${page.elements.length} elems)`);

    const textElems = page.elements.filter(e => e.type === 'text');
    console.log(`Text elements count: ${textElems.length}`);

    // Check texts with long content or autoResize
    const autoTexts = textElems.filter(e => e.textAutoResize === 'WIDTH_AND_HEIGHT');
    const heightTexts = textElems.filter(e => e.textAutoResize === 'HEIGHT');
    const fixedTexts = textElems.filter(e => e.textAutoResize === 'NONE' || !e.textAutoResize);
    console.log(`  Auto W&H: ${autoTexts.length}, Auto H: ${heightTexts.length}, Fixed: ${fixedTexts.length}`);

    // Check multi-line or long texts
    for (const t of textElems.slice(0, 10)) {
      const fullText = (t.textRuns || []).map(r => r.text).join('');
      const font = t.textRuns?.[0]?.fontFamily;
      const size = t.textRuns?.[0]?.fontSizePt;
      const lh = t.textRuns?.[0]?.lineHeightPt;
      const ls = t.textRuns?.[0]?.letterSpacingPt;
      console.log(`  - [${t.name}] (${t.bounds.width.toFixed(1)} x ${t.bounds.height.toFixed(1)} pt, font:${font} ${size}pt, lh:${lh}pt, ls:${ls}pt, auto:${t.textAutoResize}, vAlign:${t.verticalAlign}): "${fullText.slice(0, 30)}"`);
    }

    // Check cards with shadows
    const cards = page.elements.filter(e => e.type === 'card');
    const shadowedCards = cards.filter(c => !!c.style?.shadow);
    console.log(`Cards count: ${cards.length} (with shadow: ${shadowedCards.length})`);
    for (const sc of shadowedCards.slice(0, 5)) {
      console.log(`  - Card [${sc.name}] shadow: color=${sc.style.shadow?.color}, offX=${sc.style.shadow?.offsetX}, offY=${sc.style.shadow?.offsetY}, blur=${sc.style.shadow?.blur}`);
    }
  }
}

main().catch(console.error);
