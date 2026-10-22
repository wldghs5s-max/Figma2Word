import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { DocxCanvasRenderer } from '../src/canvas/renderer/docxCanvasRenderer';
import { CanvasDocument } from '../src/canvas/types';
import {
  captureWordState,
  openTargetDocumentSafely,
  exportAndCloseTargetDocOnly,
} from '../tools/visual-regression/safe_word_automation';

async function testArcsize() {
  const rootDir = fs.existsSync(path.join(process.cwd(), 'src'))
    ? process.cwd()
    : path.join(process.cwd(), 'Figma2Word');
  const expDir = path.resolve(rootDir, 'phase31-quality-validation/evidence/vml-experiments');

  const doc: CanvasDocument = {
    id: "arc-test",
    title: "Arcsize Test",
    pageSize: { widthPt: 600, heightPt: 400 },
    pages: [{
      id: "p1", bounds: { x: 0, y: 0, width: 600, height: 400 },
      backgroundColor: "#FFFFFF",
      elements: [
        {
          id: "card-arc-025", type: "rectangle",
          bounds: { x: 50, y: 50, width: 200, height: 100 },
          zIndex: 1,
          style: { fillColor: "#FF0000", cornerRadius: 25 }
        },
        {
          id: "card-arc-050", type: "rectangle",
          bounds: { x: 300, y: 50, width: 200, height: 100 },
          zIndex: 1,
          style: { fillColor: "#0000FF", cornerRadius: 50 }
        }
      ]
    }]
  };

  const renderer = new DocxCanvasRenderer();
  const zip = await (renderer as any).buildZip(doc);

  const docXml = await zip.file("word/document.xml").async("text");
  console.log("Generated XML for card-arc-025:\n", docXml.match(/<v:roundrect[^>]*card-arc-025[^>]*>/)?.[0]);
  console.log("Generated XML for card-arc-050:\n", docXml.match(/<v:roundrect[^>]*card-arc-050[^>]*>/)?.[0]);

  // Set explicit arcsize values: Card 1 = 0.250, Card 2 = 0.500
  const customXml = docXml
    .replace(/(id="s_0_0"[^>]*arcsize=")[^"]*(")/, "$10.250$2")
    .replace(/(id="s_0_1"[^>]*arcsize=")[^"]*(")/, "$10.500$2");
  zip.file("word/document.xml", customXml);

  const docxBuf = await zip.generateAsync({ type: "nodebuffer" });
  const docxPath = path.join(expDir, "test_arcsize_measurement.docx");
  const pdfPath = path.join(expDir, "test_arcsize_measurement.pdf");
  const pngDir = path.join(expDir, "test_arcsize_pages");
  fs.mkdirSync(pngDir, { recursive: true });
  fs.writeFileSync(docxPath, docxBuf);

  console.log("Rendering test_arcsize_measurement.docx in Word...");
  const snapshot = captureWordState();
  const handle = await openTargetDocumentSafely(docxPath, snapshot, 25);
  exportAndCloseTargetDocOnly(handle, pdfPath, 30);

  const swiftScript = path.resolve(rootDir, "tools/visual-regression/pdf_to_images.swift");
  execSync(`swift "${swiftScript}" "${pdfPath}" "${pngDir}" 1.5`, { encoding: "utf8" });

  const pngPath = path.join(pngDir, "page-001.png");
  const measureScript = `
import AppKit
let img = NSImage(contentsOfFile: "${pngPath}")!
let rep = (img.representations.first as! NSBitmapImageRep)

// Card 1 right edge is at 50 + 200 = 250 pt -> 375 px.
// Card 1 top is 50 pt -> 75 px, bottom is 150 pt -> 225 px. Height = 150 px.
var redYCount = 0
for y in 75...225 {
    let c = rep.colorAt(x: 373, y: y)!
    if c.redComponent > 0.8 && c.blueComponent < 0.2 {
        redYCount += 1
    }
}
print("Card 1 (arcsize=0.250) vertical edge red span:", redYCount, "pixels (total height = 150 px)")

// Card 2 right edge is at 300 + 200 = 500 pt -> 750 px.
var blueYCount = 0
for y in 75...225 {
    let c = rep.colorAt(x: 748, y: y)!
    if c.blueComponent > 0.8 && c.redComponent < 0.2 {
        blueYCount += 1
    }
}
print("Card 2 (arcsize=0.500) vertical edge blue span:", blueYCount, "pixels (total height = 150 px)")
`;
  const out = execSync(`swift -e '${measureScript}'`, { encoding: "utf8" });
  console.log("Measurement output:\n", out);
}

testArcsize().catch(console.error);
