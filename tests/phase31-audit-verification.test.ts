import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as zlib from "zlib";
import JSZip from "jszip";
import { DocxCanvasRenderer } from "../src/canvas/renderer/docxCanvasRenderer.js";
import { HwpxCanvasRenderer } from "../src/canvas/renderer/hwpxCanvasRenderer.js";
import { CanvasDocument } from "../src/canvas/types.js";
import {
  AutomatedWordHandle,
  closeTargetDocOnly,
  safeCleanupIsolatedDirectory,
  cleanResidualIsolationDirsSafely,
  computeHandleSignature,
  normalizeWordPath,
} from "../tools/visual-regression/safe_word_automation.js";

function createValidPng(w: number, h: number, r: number, g: number, b: number, a: number = 255): Buffer {
  const rowBytes = 1 + w * 4;
  const rawData = Buffer.alloc(rowBytes * h);
  for (let y = 0; y < h; y++) {
    const rowOffset = y * rowBytes;
    rawData[rowOffset] = 0;
    for (let x = 0; x < w; x++) {
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
    for (let k = 0; k < 8; k++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[i] = c;
  }
  function calcCrc(buf: Buffer): number {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }
  function makeChunk(t: string, d: Buffer): Buffer {
    const tb = Buffer.from(t, "ascii");
    const lb = Buffer.alloc(4); lb.writeUInt32BE(d.length, 0);
    const cb = Buffer.alloc(4); cb.writeUInt32BE(calcCrc(Buffer.concat([tb, d])), 0);
    return Buffer.concat([lb, tb, d, cb]);
  }
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(w, 0); ihdrData.writeUInt32BE(h, 4);
  ihdrData[8] = 8; ihdrData[9] = 6;
  return Buffer.concat([sig, makeChunk("IHDR", ihdrData), makeChunk("IDAT", compressed), makeChunk("IEND", Buffer.alloc(0))]);
}

describe("Phase 31: External Audit Verification & Quality Stabilization", () => {
  // ==========================================================================
  // Section A: PNG Integrity Verification (A1)
  // ==========================================================================
  describe("Audit Item A1: PNG Data Integrity & Decompression Validation", () => {
    it("1. Flags corrupted PNG with invalid Adler-32 / truncated IDAT", () => {
      const corruptBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mNk+M/AwMDEwMDAwAAAAAUAAXeN9fQAAAAASUVORK5CYII=";
      const corruptBuf = Buffer.from(corruptBase64, "base64");
      
      // Extract IDAT chunk data
      let idatData: Buffer | null = null;
      let pos = 8;
      while (pos < corruptBuf.length) {
        const len = corruptBuf.readUInt32BE(pos);
        const type = corruptBuf.slice(pos + 4, pos + 8).toString("ascii");
        if (type === "IDAT") {
          idatData = corruptBuf.slice(pos + 8, pos + 8 + len);
          break;
        }
        pos += 12 + len;
      }
      expect(idatData).not.toBeNull();
      // Verifies that standard zlib inflate throws error on the corrupted data
      expect(() => zlib.inflateSync(idatData!)).toThrow();
    });

    it("2. Successfully decompresses validly generated PNG buffer with full opacity", () => {
      const validBuf = createValidPng(2, 2, 37, 99, 235, 255);
      let idatData: Buffer | null = null;
      let pos = 8;
      while (pos < validBuf.length) {
        const len = validBuf.readUInt32BE(pos);
        const type = validBuf.slice(pos + 4, pos + 8).toString("ascii");
        if (type === "IDAT") {
          idatData = validBuf.slice(pos + 8, pos + 8 + len);
          break;
        }
        pos += 12 + len;
      }
      expect(idatData).not.toBeNull();
      const decompressed = zlib.inflateSync(idatData!);
      // 2 rows * (1 filter byte + 2 pixels * 4 bytes RGBA) = 18 bytes
      expect(decompressed.length).toBe(18);
    });
  });

  // ==========================================================================
  // Section B: VML Geometry & Tag Validation (A2, A3)
  // ==========================================================================
  describe("Audit Items A2 & A3: VML Image Tags & Corner Geometry", () => {
    it("3. Uses <v:rect> for rectangular images without corner radius", async () => {
      const doc: CanvasDocument = {
        title: "Rect Image Test",
        pageSize: { name: "A4", widthPt: 400, heightPt: 300, unit: "pt" },
        marginsPt: { top: 0, right: 0, bottom: 0, left: 0 },
        pages: [{
          pageNumber: 1,
          bounds: { x: 0, y: 0, width: 400, height: 300 },
          elements: [{
            id: "img-sharp",
            name: "Sharp Image",
            type: "image",
            bounds: { x: 20, y: 20, width: 100, height: 80 },
            zIndex: 1,
            imageRef: "res-sharp",
            style: { cornerRadius: 0 },
          }],
        }],
        resources: {
          "res-sharp": {
            id: "res-sharp",
            name: "sharp.png",
            mimeType: "image/png",
            data: createValidPng(4, 4, 10, 20, 30),
          },
        },
      };

      const renderer = new DocxCanvasRenderer();
      const buf = await renderer.renderToBuffer(doc);
      const zip = await JSZip.loadAsync(buf);
      const docXml = await zip.file("word/document.xml")!.async("text");

      // Verify v:rect is used instead of v:shape for rectangular image
      expect(docXml).toContain('<v:rect id="s_0_0"');
      expect(docXml).toContain('<v:imagedata r:id="rId2"');
    });

    it("4. Uses <v:roundrect> with arcsize for rounded images", async () => {
      const doc: CanvasDocument = {
        title: "Rounded Image Test",
        pageSize: { name: "A4", widthPt: 400, heightPt: 300, unit: "pt" },
        marginsPt: { top: 0, right: 0, bottom: 0, left: 0 },
        pages: [{
          pageNumber: 1,
          bounds: { x: 0, y: 0, width: 400, height: 300 },
          elements: [{
            id: "img-rounded",
            name: "Rounded Image",
            type: "image",
            bounds: { x: 20, y: 20, width: 100, height: 80 },
            zIndex: 1,
            imageRef: "res-round",
            style: { cornerRadius: 16 },
          }],
        }],
        resources: {
          "res-round": {
            id: "res-round",
            name: "round.png",
            mimeType: "image/png",
            data: createValidPng(4, 4, 10, 20, 30),
          },
        },
      };

      const renderer = new DocxCanvasRenderer();
      const buf = await renderer.renderToBuffer(doc);
      const zip = await JSZip.loadAsync(buf);
      const docXml = await zip.file("word/document.xml")!.async("text");

      expect(docXml).toContain('<v:roundrect id="s_0_0"');
      // Phase 31.1: 16 / min(100, 80) = 0.200 (Empirically verified against Word for Mac)
      expect(docXml).toContain('arcsize="0.200"');
      expect(docXml).toContain('<v:imagedata r:id="rId2"');
    });
  });

  // ==========================================================================
  // Section C: Word Automation Fail-Closed Safety (A4)
  // ==========================================================================
  describe("Audit Item A4: Fail-Closed Close Verification & Directory Safety", () => {
    it("5. Refuses directory cleanup when lifecycleState is not 'close_confirmed'", () => {
      const runId = "vr_test_cleanup_refusal_" + Date.now();
      const isoDir = path.join(os.tmpdir(), "f2w_word_isolation", runId);
      fs.mkdirSync(isoDir, { recursive: true });
      const docxPath = path.join(isoDir, "test.docx");
      fs.writeFileSync(docxPath, Buffer.from("dummy"));

      const handle: AutomatedWordHandle = {
        runId,
        sourceDocxPath: "/tmp/dummy.docx",
        isolatedDocxPath: docxPath,
        isolatedDir: isoDir,
        normalizedPosixPath: normalizeWordPath(docxPath),
        docName: "test.docx",
        docIndex: 1,
        sectionsCount: 1,
        isOwned: true,
        verificationSignature: computeHandleSignature(runId, isoDir, docxPath),
        lifecycleState: "uncertain", // NOT close_confirmed
      };

      // safeCleanupIsolatedDirectory should return false and preserve the directory
      const cleaned = safeCleanupIsolatedDirectory(handle);
      expect(cleaned).toBe(false);
      expect(fs.existsSync(isoDir)).toBe(true);

      // Clean up manually after test
      fs.rmSync(isoDir, { recursive: true, force: true });
    });
  });

  // ==========================================================================
  // Section D: HWPX Shadow Offset Zero Value Handling (A5)
  // ==========================================================================
  describe("Audit Item A5: HWPX Drop Shadow Offset Zero Preservation", () => {
    it("6. Correctly preserves explicit offsetX=0 and offsetY=0 in HWPX <hp:shadow>", async () => {
      const doc: CanvasDocument = {
        title: "HWPX Shadow Zero Test",
        pageSize: { name: "A4", widthPt: 400, heightPt: 300, unit: "pt" },
        marginsPt: { top: 0, right: 0, bottom: 0, left: 0 },
        pages: [{
          pageNumber: 1,
          bounds: { x: 0, y: 0, width: 400, height: 300 },
          elements: [{
            id: "card-zero-shadow",
            name: "Card Zero Shadow",
            type: "rectangle",
            bounds: { x: 20, y: 20, width: 100, height: 60 },
            zIndex: 1,
            style: {
              fillColor: "#FFFFFF",
              shadow: {
                color: "#1E293B",
                offsetX: 0, // Explicit zero
                offsetY: 8,
                opacity: 0.15,
              },
            },
          }],
        }],
      };

      const renderer = new HwpxCanvasRenderer();
      const buf = await renderer.renderToBuffer(doc);
      const zip = await JSZip.loadAsync(buf);
      const sectionXml = await zip.file("Contents/section0.xml")!.async("text");

      // Verifies that offsetX="0" is emitted (NOT overridden by default 2 -> "200")
      expect(sectionXml).toContain('offsetX="0"');
      expect(sectionXml).toContain('offsetY="800"');
    });

    it("7. Correctly preserves both offsetX=0 and offsetY=0 simultaneously", async () => {
      const doc: CanvasDocument = {
        title: "HWPX Shadow Both Zero",
        pageSize: { name: "A4", widthPt: 400, heightPt: 300, unit: "pt" },
        marginsPt: { top: 0, right: 0, bottom: 0, left: 0 },
        pages: [{
          pageNumber: 1,
          bounds: { x: 0, y: 0, width: 400, height: 300 },
          elements: [{
            id: "pic-zero-shadow",
            name: "Pic Zero Shadow",
            type: "image",
            imageRef: "res-pic",
            bounds: { x: 20, y: 20, width: 80, height: 80 },
            zIndex: 1,
            style: {
              shadow: {
                color: "#000000",
                offsetX: 0,
                offsetY: 0,
                opacity: 0.2,
              },
            },
          }],
        }],
        resources: {
          "res-pic": {
            id: "res-pic",
            name: "pic.png",
            mimeType: "image/png",
            data: createValidPng(2, 2, 0, 0, 0),
          },
        },
      };

      const renderer = new HwpxCanvasRenderer();
      const buf = await renderer.renderToBuffer(doc);
      const zip = await JSZip.loadAsync(buf);
      const sectionXml = await zip.file("Contents/section0.xml")!.async("text");

      expect(sectionXml).toContain('offsetX="0"');
      expect(sectionXml).toContain('offsetY="0"');
    });
  });

  // ==========================================================================
  // Section E: DOCX OpenXML Resource Relationship Integrity (A2, A8)
  // ==========================================================================
  describe("Resource Relationship Integrity Verification", () => {
    it("8. Connects image elements to valid Relationship IDs with target files in media/", async () => {
      const doc: CanvasDocument = {
        title: "Resource Integrity",
        pageSize: { name: "A4", widthPt: 500, heightPt: 400, unit: "pt" },
        marginsPt: { top: 0, right: 0, bottom: 0, left: 0 },
        pages: [{
          pageNumber: 1,
          bounds: { x: 0, y: 0, width: 500, height: 400 },
          elements: [{
            id: "img-card",
            name: "Card",
            type: "image",
            bounds: { x: 50, y: 50, width: 200, height: 100 },
            zIndex: 1,
            imageRef: "res-1",
          }],
        }],
        resources: {
          "res-1": {
            id: "res-1",
            name: "res-1.png",
            mimeType: "image/png",
            data: createValidPng(4, 4, 30, 60, 90),
          },
        },
      };

      const renderer = new DocxCanvasRenderer();
      const buf = await renderer.renderToBuffer(doc);
      const zip = await JSZip.loadAsync(buf);

      const relsXml = await zip.file("word/_rels/document.xml.rels")!.async("text");
      const docXml = await zip.file("word/document.xml")!.async("text");

      // Check relationship exists
      const match = relsXml.match(/<Relationship Id="([^"]+)" Type="[^"]*image" Target="([^"]+)"\/>/);
      expect(match).not.toBeNull();
      const rId = match![1];
      const target = match![2];

      // Check document.xml references this exact rId
      expect(docXml).toContain(`r:id="${rId}"`);

      // Check target file exists in zip
      const mediaFile = zip.file(`word/${target}`);
      expect(mediaFile).not.toBeNull();
      const mediaBuf = await mediaFile!.async("nodebuffer");
      expect(mediaBuf.length).toBeGreaterThan(0);
    });
  });
});
