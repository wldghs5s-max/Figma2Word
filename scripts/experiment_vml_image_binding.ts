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

const CORRUPT_PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mNk+M/AwMDEwMDAwAAAAAUAAXeN9fQAAAAASUVORK5CYII=", "base64");
const VALID_BLUE_PNG = createSolidPng(10, 10, 37, 99, 235, 255); // #2563EB

async function runExperiments() {
  const rootDir = fs.existsSync(path.join(process.cwd(), 'src'))
    ? process.cwd()
    : path.join(process.cwd(), 'Figma2Word');
  const expDir = path.resolve(rootDir, 'phase31-quality-validation/evidence/vml-experiments');
  fs.mkdirSync(expDir, { recursive: true });

  const variants = [
    {
      id: 'var_A_corrupt_png_filled_f',
      name: 'Experiment A: Corrupt PNG + filled="f"',
      pngBuffer: CORRUPT_PNG,
      modifyXml: (xml: string) => xml, // default Phase 30
    },
    {
      id: 'var_B_valid_png_filled_f',
      name: 'Experiment B: Valid Blue PNG + filled="f"',
      pngBuffer: VALID_BLUE_PNG,
      modifyXml: (xml: string) => xml, // keep filled="f"
    },
    {
      id: 'var_C1_valid_png_filled_t',
      name: 'Experiment C1: Valid Blue PNG + filled="t"',
      pngBuffer: VALID_BLUE_PNG,
      modifyXml: (xml: string) => xml.replace(/filled="f"/g, 'filled="t"'),
    },
    {
      id: 'var_C2_valid_png_fill_type_frame',
      name: 'Experiment C2: Valid Blue PNG + <v:fill type="frame">',
      pngBuffer: VALID_BLUE_PNG,
      modifyXml: (xml: string) => xml.replace(
        /<v:imagedata r:id="rId2"([^>]*)\/>/g,
        '<v:fill type="frame" r:id="rId2"/>'
      ).replace(/filled="f"/g, 'filled="t"'),
    },
  ];

  const results: any[] = [];

  for (const v of variants) {
    console.log(`\n========================================`);
    console.log(`[Testing ${v.name}]`);

    // Build base CanvasDocument
    const doc: CanvasDocument = {
      id: 'exp-doc',
      title: v.name,
      pageSize: { widthPt: 600, heightPt: 400 },
      pages: [
        {
          id: 'p1',
          name: 'Page 1',
          bounds: { x: 0, y: 0, width: 600, height: 400 },
          backgroundColor: '#F5F7FA',
          elements: [
            // Image card
            {
              id: 'card-img',
              name: 'Image Card',
              type: 'image',
              bounds: { x: 100, y: 80, width: 400, height: 200 },
              zIndex: 1,
              imageRef: 'image1.png',
              style: {
                cornerRadius: 16,
                strokeColor: '#BFD9FA',
                strokeWidth: 2,
                shadow: {
                  color: '#1A3366',
                  offsetX: 0,
                  offsetY: 6,
                  radius: 12,
                  opacity: 0.15,
                },
              },
            },
            // White overlay text on top
            {
              id: 'text-overlay',
              name: 'Overlay Text',
              type: 'text',
              bounds: { x: 120, y: 220, width: 360, height: 30 },
              zIndex: 2,
              textRuns: [
                {
                  text: '오버레이 텍스트 가시성 테스트 (White #FFFFFF)',
                  fontSizePt: 14,
                  fontWeight: 700,
                  color: '#FFFFFF',
                  fontFamily: 'Pretendard',
                },
              ],
            },
          ],
        },
      ],
      resources: {
        'image1.png': {
          id: 'image1.png',
          name: 'image1.png',
          mimeType: 'image/png',
          data: new Uint8Array(v.pngBuffer),
        },
      },
    };

    const renderer = new DocxCanvasRenderer();
    const zip = await (renderer as any).buildZip(doc);

    // Apply XML modification if any
    let docXml = await zip.file("word/document.xml").async("text");
    docXml = v.modifyXml(docXml);
    zip.file("word/document.xml", docXml);

    const docxBuf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    const docxPath = path.join(expDir, `${v.id}.docx`);
    const pdfPath = path.join(expDir, `${v.id}.pdf`);
    const pngDir = path.join(expDir, `${v.id}_pages`);
    fs.mkdirSync(pngDir, { recursive: true });
    fs.writeFileSync(docxPath, docxBuf);

    console.log(`[SafeWord] Rendering ${v.id} in Word for Mac...`);
    const snapshot = captureWordState();
    const handle = await openTargetDocumentSafely(docxPath, snapshot, 25);
    exportAndCloseTargetDocOnly(handle, pdfPath, 30);

    // Swift PDFKit render
    const swiftScript = path.resolve(rootDir, 'tools/visual-regression/pdf_to_images.swift');
    execSync(`swift "${swiftScript}" "${pdfPath}" "${pngDir}" 1.5`, { encoding: 'utf8' });

    const pngPath = path.join(pngDir, 'page-001.png');

    // Sample color in the center of the image card (in pt: x=300, y=180 -> in 1.5x px: x=450, y=270)
    const sampleScript = `
import AppKit
guard let img = NSImage(contentsOfFile: "${pngPath}"),
      let rep = img.representations.first as? NSBitmapImageRep else {
    print("ERR")
    exit(1)
}
let c = rep.colorAt(x: 450, y: 270)!
let r = Int(c.redComponent * 255.0)
let g = Int(c.greenComponent * 255.0)
let b = Int(c.blueComponent * 255.0)
print(String(format: "#%02X%02X%02X", r, g, b))
`;
    const centerHex = execSync(`swift -e '${sampleScript}'`, { encoding: 'utf8' }).trim();
    console.log(`[Result ${v.id}] Center Color: ${centerHex}`);

    results.push({
      variant: v.id,
      name: v.name,
      centerHex,
      isBlue: centerHex.startsWith('#25') || centerHex.startsWith('#24') || centerHex.startsWith('#23') || centerHex.startsWith('#1') || centerHex.startsWith('#3'),
    });
  }

  console.log('\n========================================');
  console.log('[EXPERIMENT SUMMARY]');
  console.table(results);
}

runExperiments().catch(console.error);
