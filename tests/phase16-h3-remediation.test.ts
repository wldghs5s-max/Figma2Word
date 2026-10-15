import { describe, it, expect } from "vitest";
import { DocxCanvasParser } from "../src/canvas/parser/docxCanvasParser.js";
import { CanvasPipeline } from "../src/canvas/pipeline/canvasPipeline.js";
import JSZip from "jszip";

describe("Phase 16 H3 Security, CLI & E2E Remediation Tests", () => {
  // =========================================================================
  // F-16: Input Size & Path Traversal / ZIP Bomb Protection
  // =========================================================================
  describe("F-16: Security Validation & ZIP Bomb Protection", () => {
    it("should reject input file paths containing null bytes", async () => {
      const parser = new DocxCanvasParser();
      await expect(parser.parse("malicious\0file.docx")).rejects.toThrow("Null byte detected");
    });

    it("should reject oversized buffer input (> 100MB)", async () => {
      const parser = new DocxCanvasParser();
      // Create a dummy object mimicking a 101MB buffer
      const fakeHugeBuffer = {
        byteLength: 101 * 1024 * 1024,
        length: 101 * 1024 * 1024,
      } as any;
      await expect(parser.parse(fakeHugeBuffer)).rejects.toThrow("exceeds maximum allowed size");
    });
  });

  // =========================================================================
  // F-14: DOCX -> HWPX Scope Clarification & Diagnostic Warnings
  // =========================================================================
  describe("F-14: Honest Scope Diagnostics for Complex Word Elements", () => {
    it("should emit explicit [SCOPE_NOTICE] warnings when native tables, charts, or OLE objects are detected", async () => {
      const complexDocxXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"
            xmlns:v="urn:schemas-microsoft-com:vml">
  <w:body>
    <w:tbl>
      <w:tr><w:tc><w:p><w:r><w:t>Cell 1</w:t></w:r></w:p></w:tc></w:tr>
    </w:tbl>
    <w:p>
      <w:r>
        <w:drawing>
          <c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="rId1"/>
        </w:drawing>
      </w:r>
    </w:p>
    <w:p>
      <w:object>
        <w:shape id="ole1"/>
      </w:object>
    </w:p>
  </w:body>
</w:document>`;

      const zip = new JSZip();
      zip.file("word/document.xml", complexDocxXml);
      const buf = await zip.generateAsync({ type: "nodebuffer" });

      const parser = new DocxCanvasParser();
      const doc = await parser.parse(buf);

      expect(doc.diagnostics.warnings.length).toBeGreaterThanOrEqual(3);
      const warningsText = doc.diagnostics.warnings.join("\n");
      expect(warningsText).toContain("[SCOPE_NOTICE]");
      expect(warningsText).toContain("native Word tables");
      expect(warningsText).toContain("ChartML");
      expect(warningsText).toContain("OLE objects");
    });
  });

  // =========================================================================
  // F-15: Unified CLI & CanvasPipeline convertFigmaUrl Method
  // =========================================================================
  describe("F-15: CanvasPipeline convertFigmaUrl Integration", () => {
    it("should have convertFigmaUrl method on CanvasPipeline", () => {
      const pipeline = new CanvasPipeline();
      expect(typeof pipeline.convertFigmaUrl).toBe("function");
    });
  });
});
