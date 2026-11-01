import { describe, it, expect } from "vitest";
import { buildObjectTraceability } from "../src/fidelity/objectTraceability.js";
import { CanvasDocument } from "../src/canvas/types.js";

describe("Phase 41 Track A: Critical Fixes Verification", () => {
  const dummySha = "dummy_sha_phase41_track_a";

  describe("A-01: Stress Korean Full String Verification Logic", () => {
    function normalizeWordText(rawText: string): string {
      if (!rawText) return "";
      const t = rawText
        .replace(/[\x00\x07\x0c]/g, "")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .replace(/\v/g, "\n");
      const lines = t
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
      return lines.join("\n");
    }

    function verifyPreservedText(
      actualText: string,
      expectedLines: string[]
    ): { persisted: boolean; errorMsg?: string } {
      const normActual = normalizeWordText(actualText);
      const normExpected = normalizeWordText(expectedLines.join("\n"));
      const actualLines = normActual ? normActual.split("\n") : [];
      const expLines = normExpected ? normExpected.split("\n") : [];

      const hasCorruptedChars =
        actualText.includes("\uFFFD") || /\?\?\?/.test(actualText);

      const isExactMatch = normActual === normExpected;

      if (isExactMatch && !hasCorruptedChars) {
        return { persisted: true };
      }

      if (hasCorruptedChars) {
        return {
          persisted: false,
          errorMsg: "Korean encoding corruption detected in reopened text",
        };
      }
      if (actualLines.length !== expLines.length) {
        return {
          persisted: false,
          errorMsg: `Line count mismatch: expected ${expLines.length}, received ${actualLines.length}`,
        };
      }
      for (let k = 0; k < expLines.length; k++) {
        if (actualLines[k] !== expLines[k]) {
          return {
            persisted: false,
            errorMsg: `Content/order mismatch at line ${k + 1}: expected '${expLines[k]}', received '${actualLines[k]}'`,
          };
        }
      }
      return { persisted: false, errorMsg: "Text mismatch" };
    }

    it("verifies exact multi-line Korean text with Word COM carriage return normalization", () => {
      const expectedLines = [
        "[STRESS_1]",
        "첫 번째 한국어 스트레스 문단입니다.",
        "두 번째 단락은 다양한 특수문자와 공백을 포함합니다.",
        "세 번째 최종 확인 단락입니다.",
      ];
      // Simulated Word COM output with trailing \r on each paragraph
      const wordComText =
        "[STRESS_1]\r\n첫 번째 한국어 스트레스 문단입니다.\r두 번째 단락은 다양한 특수문자와 공백을 포함합니다.\r세 번째 최종 확인 단락입니다.\r\x07";

      const res = verifyPreservedText(wordComText, expectedLines);
      expect(res.persisted).toBe(true);
    });

    it("strictly rejects sentence/paragraph order swap", () => {
      const expectedLines = [
        "[STRESS_1]",
        "첫 번째 줄",
        "두 번째 줄",
        "세 번째 줄",
      ];
      // Swapped line 2 and line 3
      const wordComText = "[STRESS_1]\r첫 번째 줄\r세 번째 줄\r두 번째 줄\r";

      const res = verifyPreservedText(wordComText, expectedLines);
      expect(res.persisted).toBe(false);
      expect(res.errorMsg).toContain("Content/order mismatch at line 3");
    });

    it("strictly rejects duplicated lines", () => {
      const expectedLines = ["[STRESS_1]", "첫 번째 줄", "두 번째 줄"];
      // Duplicated line
      const wordComText =
        "[STRESS_1]\r첫 번째 줄\r두 번째 줄\r두 번째 줄\r";

      const res = verifyPreservedText(wordComText, expectedLines);
      expect(res.persisted).toBe(false);
      expect(res.errorMsg).toContain("Line count mismatch");
    });

    it("strictly rejects partial match containing only the first line marker", () => {
      const expectedLines = [
        "[STRESS_1]",
        "누락되어서는 안 되는 본문 내용입니다.",
      ];
      // Contains first line marker, but second line is missing
      const wordComText = "[STRESS_1]\r";

      const res = verifyPreservedText(wordComText, expectedLines);
      expect(res.persisted).toBe(false);
      expect(res.errorMsg).toContain("Line count mismatch");
    });

    it("strictly detects Korean encoding corruption", () => {
      const expectedLines = ["[STRESS_1]", "정상 한국어 문장"];
      const wordComText = "[STRESS_1]\r정상 \uFFFD\uFFFD 문장\r";

      const res = verifyPreservedText(wordComText, expectedLines);
      expect(res.persisted).toBe(false);
      expect(res.errorMsg).toContain("Korean encoding corruption detected");
    });
  });

  describe("A-02: Empty VML Path False Success Rejection", () => {
    it("rejects empty <v:path/> and accepts valid VML path or primitive", () => {
      const rawFigma = {
        figmaNode: {
          id: "root:1",
          name: "Test Frame",
          type: "FRAME",
          children: [
            { id: "vec:1", name: "Empty Path Vector", type: "VECTOR", visible: true },
            { id: "vec:2", name: "Valid Vector", type: "VECTOR", visible: true },
            { id: "prim:1", name: "Normal Rect", type: "RECTANGLE", visible: true },
          ],
        },
      };

      const canvasDoc: CanvasDocument = {
        version: "1.0",
        metadata: { title: "Test", created: new Date().toISOString() },
        pages: [
          {
            id: "p1",
            name: "Page 1",
            elements: [
              {
                id: "vec:1",
                sourceNodeId: "vec:1",
                type: "vector",
                bounds: { x: 0, y: 0, width: 20, height: 20 },
                zIndex: 1,
                style: {},
              },
              {
                id: "vec:2",
                sourceNodeId: "vec:2",
                type: "vector",
                bounds: { x: 30, y: 0, width: 20, height: 20 },
                zIndex: 2,
                style: {},
              },
              {
                id: "prim:1",
                sourceNodeId: "prim:1",
                type: "card",
                bounds: { x: 60, y: 0, width: 100, height: 50 },
                zIndex: 3,
                style: {},
              },
            ],
          },
        ],
        resources: {},
      };

      // DOCX XML with:
      // - vec:1 having empty <v:path/> and only fillcolor (should FAIL)
      // - vec:2 having valid path "m 0 0 l 200 200 e" (should PASS)
      // - prim:1 being <v:rect> primitive (should PASS)
      const docxXml = `
<w:document>
  <w:body>
    <w:p>
      <w:r>
        <w:pict>
          <v:shape id="s_empty" alt="vec:1" fillcolor="#ff0000"><v:path/></v:shape>
          <v:shape id="s_valid" alt="vec:2" path="m 0 0 l 200 200 e" strokecolor="#000000"/>
          <v:rect id="s_rect" alt="prim:1" style="position:absolute;width:100pt;height:50pt"/>
        </w:pict>
      </w:r>
    </w:p>
  </w:body>
</w:document>
      `;

      const report = buildObjectTraceability(
        rawFigma,
        ["root:1"],
        canvasDoc,
        docxXml,
        dummySha
      );

      const mEmpty = report.mappings.find((m) => m.sourceNodeId === "vec:1");
      const mValid = report.mappings.find((m) => m.sourceNodeId === "vec:2");
      const mPrim = report.mappings.find((m) => m.sourceNodeId === "prim:1");

      // Empty path must be rejected
      expect(mEmpty?.contentVerified).toBe(false);
      expect(mEmpty?.contentState).toBe("CONTENT_UNVERIFIED");

      // Valid path must be verified
      expect(mValid?.contentVerified).toBe(true);
      expect(mValid?.contentState).toBe("CONTENT_VERIFIED");

      // Valid primitive must be verified
      expect(mPrim?.contentVerified).toBe(true);
      expect(mPrim?.contentState).toBe("CONTENT_VERIFIED");

      expect(report.summary.preservedShapesCount).toBe(2);
    });
  });

  describe("A-03: Large Foreground Selection Logic", () => {
    it("distinguishes empty page backdrop from large foreground card with content", () => {
      // Logic test replicating the PowerShell filter
      function isExcludedBackground(shape: {
        name?: string;
        title?: string;
        altText?: string;
        widthPt: number;
        heightPt: number;
        leftPt: number;
        topPt: number;
        hasText: boolean;
      }): boolean {
        const shapeName = shape.name || "";
        const shapeTitle = shape.title || "";
        const altText = shape.altText || "";
        const isExplicitBg =
          shapeName.startsWith("bg_") ||
          shapeTitle.startsWith("bg_") ||
          altText.startsWith("bg_") ||
          shapeName.toLowerCase().includes("background") ||
          shapeTitle.toLowerCase().includes("background");

        const isCanvasBackdrop =
          !shape.hasText &&
          shape.widthPt >= 550 &&
          shape.heightPt >= 750 &&
          shape.leftPt <= 15 &&
          shape.topPt <= 15;

        return isExplicitBg || isCanvasBackdrop;
      }

      // Case 1: Empty full-page canvas background rectangle (should be excluded)
      const pageBackdrop = {
        name: "Rectangle 1",
        widthPt: 595.28,
        heightPt: 841.89,
        leftPt: 0,
        topPt: 0,
        hasText: false,
      };
      expect(isExcludedBackground(pageBackdrop)).toBe(true);

      // Case 2: Large foreground modal or card (e.g. 520x600) with text (must NOT be excluded!)
      const largeForegroundModal = {
        name: "Modal Container",
        widthPt: 520,
        heightPt: 600,
        leftPt: 30,
        topPt: 50,
        hasText: true,
      };
      expect(isExcludedBackground(largeForegroundModal)).toBe(false);

      // Case 3: Explicitly named bg (should be excluded regardless of dimensions)
      const explicitBg = {
        name: "bg_header",
        widthPt: 400,
        heightPt: 100,
        leftPt: 0,
        topPt: 0,
        hasText: false,
      };
      expect(isExcludedBackground(explicitBg)).toBe(true);
    });
  });
});
