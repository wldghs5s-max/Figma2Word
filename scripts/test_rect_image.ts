import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { execSync } from 'child_process';
import { DocxCanvasRenderer } from '../src/canvas/renderer/docxCanvasRenderer';
import { CanvasDocument } from '../src/canvas/types';
import {
  captureWordState,
  openTargetDocumentSafely,
  exportAndCloseTargetDocOnly,
} from '../tools/visual-regression/safe_word_automation';

function createSolidPng(width: number, height: number, r: number, g: number, b: number, a: number = 255): Buffer {
  const rowBytes = 1 + width * 4;
  const rawData = Buffer.alloc(rowBytes * height);
  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowBytes;
    rawData[rowOffset] = 0;
    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 4;
      rawData[pxOffset] = r;
      rawData[pxOffset + 1] = g;
      rawData[pxOffset + 2] = b;
      rawData[pxOffset + 3] = a;
    }
  }

  const compressed = zlib.deflateSync(rawData);
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const crcTable = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    crcTable[i] = c;
  }
  function calcCrc(buf: Buffer): number {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
  }

  function makeChunk(typeStr: string, dataBuf: Buffer): Buffer {
    const typeBuf = Buffer.from(typeStr, "ascii");
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32BE(dataBuf.length, 0);

    const crcBuf = Buffer.alloc(4);
    const toCrc = Buffer.concat([typeBuf, dataBuf]);
    const crcVal = calcCrc(toCrc);
    crcBuf.writeUInt32BE(crcVal, 0);

    return Buffer.concat([lenBuf, typeBuf, dataBuf, crcBuf]);
  }

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;
  ihdrData[9] = 6;
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;

  return Buffer.concat([
    sig,
    makeChunk("IHDR", ihdrData),
    makeChunk("IDAT", compressed),
    makeChunk("IEND", Buffer.alloc(0))
  ]);
}

async function testRect() {
  const rootDir = fs.existsSync(path.join(process.cwd(), 'src'))
    ? process.cwd()
    : path.join(process.cwd(), 'Figma2Word');
  const expDir = path.resolve(rootDir, 'phase31-quality-validation/evidence/vml-experiments');
  const validBluePng = createSolidPng(10, 10, 37, 99, 235, 255);

  // Document with cornerRadius = 0 (triggers imgTag = "v:shape")
  const doc: CanvasDocument = {
    id: "rect-test",
    title: "Rect Test",
    pageSize: { widthPt: 400, heightPt: 300 },
    pages: [{
      id: "p1", bounds: { x: 0, y: 0, width: 400, height: 300 },
      backgroundColor: '#F5F7FA',
      elements: [{
        id: "img-rect", type: "image",
        bounds: { x: 50, y: 50, width: 200, height: 150 },
        zIndex: 1, imageRef: "image1.png",
        style: { cornerRadius: 0 }
      }]
    }],
    resources: {
      "image1.png": { id: "image1.png", name: "image1.png", mimeType: "image/png", data: new Uint8Array(validBluePng) }
    }
  };

  const renderer = new DocxCanvasRenderer();
  const zip = await (renderer as any).buildZip(doc);
  const docxBuf = await zip.generateAsync({ type: "nodebuffer" });
  const docxPath = path.join(expDir, "test_rect_v_shape.docx");
  const pdfPath = path.join(expDir, "test_rect_v_shape.pdf");
  const pngDir = path.join(expDir, "test_rect_v_shape_pages");
  fs.mkdirSync(pngDir, { recursive: true });
  fs.writeFileSync(docxPath, docxBuf);

  console.log("Rendering test_rect_v_shape.docx in Word...");
  const snapshot = captureWordState();
  const handle = await openTargetDocumentSafely(docxPath, snapshot, 25);
  exportAndCloseTargetDocOnly(handle, pdfPath, 30);

  const swiftScript = path.resolve(rootDir, "tools/visual-regression/pdf_to_images.swift");
  execSync(`swift "${swiftScript}" "${pdfPath}" "${pngDir}" 1.5`, { encoding: "utf8" });

  const pngPath = path.join(pngDir, "page-001.png");
  // Sample center at (150pt * 1.5 = 225px, 125pt * 1.5 = 187px)
  const sampleScript = `
import AppKit
let img = NSImage(contentsOfFile: "${pngPath}")!
let rep = (img.representations.first as! NSBitmapImageRep)
let c = rep.colorAt(x: 225, y: 187)!
print(String(format: "#%02X%02X%02X", Int(c.redComponent*255), Int(c.greenComponent*255), Int(c.blueComponent*255)))
`;
  const hex = execSync(`swift -e '${sampleScript}'`, { encoding: "utf8" }).trim();
  console.log("Center color of rect image (v:shape):", hex);
}

testRect().catch(console.error);
