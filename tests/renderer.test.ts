import { describe, it, expect } from "vitest";
import { DocxRenderer } from "../src/renderer/docxRenderer.js";
import { InternalDocument } from "../src/model/index.js";
import * as fs from "fs";
import * as path from "path";

describe("DocxRenderer", () => {
  it("renders a comprehensive InternalDocument into a valid DOCX buffer and file", async () => {
    const sampleDoc: InternalDocument = {
      version: "1.0.0",
      metadata: {
        title: "Test Business Document",
        author: "Figma2Word Test Engine",
        convertedAt: new Date().toISOString(),
        conversionMode: "balanced",
      },
      pageConfig: {
        size: "A4",
        widthMm: 210,
        heightMm: 297,
        orientation: "portrait",
        marginsMm: {
          top: 25.4,
          right: 25.4,
          bottom: 25.4,
          left: 25.4,
        },
      },
      header: {
        elements: [
          {
            type: "paragraph",
            runs: [{ text: "Figma2Word Automated Header", style: { fontSize: 9, color: { r: 120, g: 120, b: 120, a: 1 } } }],
            alignment: "right",
          },
        ],
      },
      footer: {
        elements: [
          {
            type: "paragraph",
            runs: [{ text: "Confidential - Page 1", style: { fontSize: 9, color: { r: 150, g: 150, b: 150, a: 1 } } }],
            alignment: "center",
          },
        ],
      },
      sections: [
        {
          id: "sec-1",
          elements: [
            {
              type: "heading",
              level: 1,
              runs: [{ text: "2026 사업계획서 제안서", style: { fontWeight: "bold", fontSize: 22, color: { r: 24, g: 43, b: 73, a: 1 } } }],
              alignment: "left",
            },
            {
              type: "paragraph",
              runs: [
                { text: "본 문서는 Figma 디자인에서 " },
                { text: "Internal Document Model", style: { fontWeight: "bold", color: { r: 0, g: 102, b: 204, a: 1 } } },
                { text: "을 거쳐 Word 문서로 렌더링된 검증용 샘플입니다." },
              ],
              alignment: "left",
            },
            {
              type: "line",
              thickness: 1.5,
              color: { r: 0, g: 102, b: 204, a: 1 },
              length: "100%",
            },
            {
              type: "shape",
              shapeType: "rounded_rectangle",
              fill: { r: 240, g: 244, b: 250, a: 1 },
              stroke: {
                width: 1,
                style: "solid",
                color: { r: 180, g: 200, b: 230, a: 1 },
              },
              content: [
                {
                  type: "heading",
                  level: 3,
                  runs: [{ text: "핵심 요약 카드 (Card Box)", style: { fontWeight: "bold", fontSize: 13 } }],
                  alignment: "left",
                },
                {
                  type: "paragraph",
                  runs: [
                    {
                      text: "Figma의 Rectangle/Card 디자인 요소가 Word의 네이티브 배경 테이블(Shaded Table)로 완벽히 재현되었습니다.",
                      style: { fontSize: 10 },
                    },
                  ],
                  alignment: "left",
                },
              ],
            },
            {
              type: "table",
              alignment: "center",
              borders: {
                width: 1,
                style: "solid",
                color: { r: 200, g: 200, b: 200, a: 1 },
              },
              rows: [
                {
                  id: "row-head",
                  isHeader: true,
                  cells: [
                    {
                      id: "c1",
                      colSpan: 1,
                      rowSpan: 1,
                      background: { r: 230, g: 235, b: 245, a: 1 },
                      children: [
                        {
                          type: "paragraph",
                          runs: [{ text: "항목", style: { fontWeight: "bold" } }],
                          alignment: "center",
                        },
                      ],
                    },
                    {
                      id: "c2",
                      colSpan: 1,
                      rowSpan: 1,
                      background: { r: 230, g: 235, b: 245, a: 1 },
                      children: [
                        {
                          type: "paragraph",
                          runs: [{ text: "목표치", style: { fontWeight: "bold" } }],
                          alignment: "center",
                        },
                      ],
                    },
                    {
                      id: "c3",
                      colSpan: 1,
                      rowSpan: 1,
                      background: { r: 230, g: 235, b: 245, a: 1 },
                      children: [
                        {
                          type: "paragraph",
                          runs: [{ text: "달성 상태", style: { fontWeight: "bold" } }],
                          alignment: "center",
                        },
                      ],
                    },
                  ],
                },
                {
                  id: "row-1",
                  isHeader: false,
                  cells: [
                    {
                      id: "c4",
                      colSpan: 1,
                      rowSpan: 1,
                      children: [{ type: "paragraph", runs: [{ text: "변환 정확도" }], alignment: "left" }],
                    },
                    {
                      id: "c5",
                      colSpan: 1,
                      rowSpan: 1,
                      children: [{ type: "paragraph", runs: [{ text: "95% 이상" }], alignment: "center" }],
                    },
                    {
                      id: "c6",
                      colSpan: 1,
                      rowSpan: 1,
                      children: [{ type: "paragraph", runs: [{ text: "검증 완료", style: { color: { r: 0, g: 150, b: 0, a: 1 } } }], alignment: "center" }],
                    },
                  ],
                },
              ],
            },
            {
              type: "image",
              source: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJAD/6gh8bAAAAAElFTkSuQmCC",
              width: 100,
              height: 100,
              altText: "Test 10x10 PNG Image",
              alignment: "center",
            },
          ],
        },
      ],
    };

    const renderer = new DocxRenderer();
    const buffer = await renderer.renderToBuffer(sampleDoc);

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(1000); // Valid docx file is non-empty zip archive

    // Ensure output directory exists and write out
    const outputDir = path.resolve(process.cwd(), "samples/output");
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    const outputPath = path.join(outputDir, "renderer-test-output.docx");
    await fs.promises.writeFile(outputPath, buffer);

    expect(fs.existsSync(outputPath)).toBe(true);
    expect(fs.statSync(outputPath).size).toBeGreaterThan(1000);
  });

  it("renders identical size and structure via renderToBlob for browser compatibility", async () => {
    const sampleDoc: InternalDocument = {
      version: "1.0.0",
      metadata: { title: "Browser Blob Test", convertedAt: "2026-10-07T00:00:00Z" },
      pageConfig: { size: "A4", orientation: "portrait" },
      sections: [
        {
          elements: [
            { type: "heading", level: 1, runs: [{ text: "Blob Test Heading" }], alignment: "left" },
            { type: "paragraph", runs: [{ text: "Verifying browser blob generation parity with Node buffer." }], alignment: "left" },
          ],
        },
      ],
    };

    const renderer = new DocxRenderer();
    const buffer = await renderer.renderToBuffer(sampleDoc);
    const blob = await renderer.renderToBlob(sampleDoc);

    expect(blob).toBeDefined();
    // Zip compression of core.xml timestamp may vary by 1-2 bytes across calls
    expect(Math.abs(blob.size - buffer.length)).toBeLessThanOrEqual(5);
  });
});

