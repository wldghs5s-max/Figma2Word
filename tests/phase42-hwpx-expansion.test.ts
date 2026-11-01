import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { HwpxCanvasRenderer } from "../src/canvas/renderer/hwpxCanvasRenderer.js";
import { DocxCanvasRenderer } from "../src/canvas/renderer/docxCanvasRenderer.js";
import {
  CanvasDocument,
  CanvasPage,
  CanvasElement,
  CanvasTableData,
  CanvasTableCell,
} from "../src/canvas/types.js";

describe("Phase 42: HWPX Production Expansion & Native Table Implementation", () => {
  const hwpxRenderer = new HwpxCanvasRenderer();
  const docxRenderer = new DocxCanvasRenderer();

  it("1. Renders a native 2x2 table (<hp:tbl>) with dynamic borderFills and proper cell layout", async () => {
    const tableData: CanvasTableData = {
      rowCount: 2,
      colCount: 2,
      colWidthsPt: [200, 200],
      rowHeightsPt: [40, 40],
      cells: [
        [
          {
            row: 0,
            col: 0,
            widthPt: 200,
            heightPt: 40,
            backgroundColor: "#F1F5F9",
            borderColor: "#CBD5E1",
            borderWidth: 1,
            align: "center",
            verticalAlign: "center",
            textRuns: [
              {
                text: "구분 (Header A)",
                fontFamily: "맑은 고딕",
                fontSizePt: 11,
                fontWeight: 700,
                color: "#1E293B",
              },
            ],
          },
          {
            row: 0,
            col: 1,
            widthPt: 200,
            heightPt: 40,
            backgroundColor: "#F1F5F9",
            borderColor: "#CBD5E1",
            borderWidth: 1,
            align: "center",
            verticalAlign: "center",
            textRuns: [
              {
                text: "결과 (Header B)",
                fontFamily: "맑은 고딕",
                fontSizePt: 11,
                fontWeight: 700,
                color: "#1E293B",
              },
            ],
          },
        ],
        [
          {
            row: 1,
            col: 0,
            widthPt: 200,
            heightPt: 40,
            backgroundColor: "#FFFFFF",
            borderColor: "#E2E8F0",
            borderWidth: 1,
            align: "left",
            verticalAlign: "center",
            textRuns: [
              {
                text: "구조체 정밀 진단",
                fontFamily: "맑은 고딕",
                fontSizePt: 10,
                color: "#334155",
              },
            ],
          },
          {
            row: 1,
            col: 1,
            widthPt: 200,
            heightPt: 40,
            backgroundColor: "#FFFFFF",
            borderColor: "#E2E8F0",
            borderWidth: 1,
            align: "center",
            verticalAlign: "center",
            textRuns: [
              {
                text: "적합 (Grade A)",
                fontFamily: "맑은 고딕",
                fontSizePt: 10,
                color: "#059669",
              },
            ],
          },
        ],
      ],
    };

    const doc: CanvasDocument = {
      version: "1.0",
      title: "Phase 42 2x2 Table Document",
      pageSize: { name: "A4", widthPt: 595.28, heightPt: 841.89, orientation: "portrait", unit: "pt" },
      marginsPt: { top: 36, right: 36, bottom: 36, left: 36 },
      pages: [
        {
          pageNumber: 1,
          id: "p1",
          name: "Page 1",
          bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
          elements: [
            {
              id: "elem_table_1",
              name: "Inspection Table",
              type: "table",
              bounds: { x: 50, y: 100, width: 400, height: 80 },
              zIndex: 10,
              style: {},
              tableData,
            },
          ],
        },
      ],
    };

    const zip = await hwpxRenderer.buildZip(doc);
    const sec0Xml = await zip.file("Contents/section0.xml")!.async("string");
    const headerXml = await zip.file("Contents/header.xml")!.async("string");

    // 1. Verify <hp:tbl> element
    expect(sec0Xml).toContain("<hp:tbl");
    expect(sec0Xml).toContain('rowCnt="2" colCnt="2"');
    expect(sec0Xml).toContain('borderFillIDRef="');
    expect(sec0Xml).toContain("구분 (Header A)");
    expect(sec0Xml).toContain("결과 (Header B)");
    expect(sec0Xml).toContain("구조체 정밀 진단");
    expect(sec0Xml).toContain("적합 (Grade A)");

    // 2. Verify table cells and addresses
    expect(sec0Xml).toContain('<hp:cellAddr colAddr="0" rowAddr="0"/>');
    expect(sec0Xml).toContain('<hp:cellAddr colAddr="1" rowAddr="0"/>');
    expect(sec0Xml).toContain('<hp:cellAddr colAddr="0" rowAddr="1"/>');
    expect(sec0Xml).toContain('<hp:cellAddr colAddr="1" rowAddr="1"/>');

    // 3. Verify dynamic borderFills in header.xml
    expect(headerXml).toContain("<hh:borderFills");
    // Must contain borderFill entries for #F1F5F9 and #FFFFFF
    expect(headerXml).toContain("F1F5F9");
    expect(headerXml).toContain("FFFFFF");

    // 4. DOCX fallback verification
    const docxZip = await docxRenderer.buildZip(doc);
    const docxXml = await docxZip.file("word/document.xml")!.async("string");
    expect(docxXml).toContain("구분 (Header A)");
    expect(docxXml).toContain("적합 (Grade A)");
  });

  it("2. Correctly handles merged cells with colSpan and rowSpan, omitting covered grid cells per KS X 6101", async () => {
    // 3x3 table with:
    // (0,0): colSpan=2, rowSpan=1 -> (0,1) omitted
    // (1,0): colSpan=1, rowSpan=2 -> (2,0) omitted
    // (1,1): colSpan=2, rowSpan=2 -> (1,2), (2,1), (2,2) omitted
    const tableData: CanvasTableData = {
      rowCount: 3,
      colCount: 3,
      colWidthsPt: [100, 150, 150],
      rowHeightsPt: [30, 40, 40],
      cells: [
        [
          {
            row: 0,
            col: 0,
            colSpan: 2,
            rowSpan: 1,
            widthPt: 250,
            heightPt: 30,
            backgroundColor: "#E2E8F0",
            textRuns: [{ text: "Merged Header (2 cols)" }],
          },
          {
            row: 0,
            col: 2,
            colSpan: 1,
            rowSpan: 1,
            widthPt: 150,
            heightPt: 30,
            textRuns: [{ text: "Header Col 3" }],
          },
        ],
        [
          {
            row: 1,
            col: 0,
            colSpan: 1,
            rowSpan: 2,
            widthPt: 100,
            heightPt: 80,
            textRuns: [{ text: "Merged Row (2 rows)" }],
          },
          {
            row: 1,
            col: 1,
            colSpan: 2,
            rowSpan: 2,
            widthPt: 300,
            heightPt: 80,
            textRuns: [{ text: "Merged 2x2 Block" }],
          },
        ],
        [
          // Row 2 is completely covered by cells from Row 1!
          // (2,0) covered by (1,0) rowSpan=2
          // (2,1) and (2,2) covered by (1,1) colSpan=2 rowSpan=2
        ],
      ],
    };

    const doc: CanvasDocument = {
      version: "1.0",
      title: "Phase 42 Merged Table Document",
      pageSize: { name: "A4", widthPt: 595.28, heightPt: 841.89, orientation: "portrait", unit: "pt" },
      marginsPt: { top: 36, right: 36, bottom: 36, left: 36 },
      pages: [
        {
          pageNumber: 1,
          id: "p1",
          bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
          elements: [
            {
              id: "elem_merged_table",
              type: "table",
              bounds: { x: 50, y: 100, width: 400, height: 110 },
              zIndex: 1,
              style: {},
              tableData,
            },
          ],
        },
      ],
    };

    const zip = await hwpxRenderer.buildZip(doc);
    const sec0Xml = await zip.file("Contents/section0.xml")!.async("string");

    // Verify cell spans
    expect(sec0Xml).toContain('<hp:cellSpan colSpan="2" rowSpan="1"/>');
    expect(sec0Xml).toContain('<hp:cellSpan colSpan="1" rowSpan="2"/>');
    expect(sec0Xml).toContain('<hp:cellSpan colSpan="2" rowSpan="2"/>');

    // Count total <hp:tc> tags
    const tcMatches = sec0Xml.match(/<hp:tc\b/g);
    // In row 0: 2 cells
    // In row 1: 2 cells
    // In row 2: 0 cells (both columns occupied)
    // Total should be exactly 4 cells! (9 grid cells minus 5 covered cells = 4 cells)
    expect(tcMatches).not.toBeNull();
    expect(tcMatches!.length).toBe(4);

    // Verify width calculation for colSpan=2 (100pt + 150pt = 250pt = 25000 HWP units)
    expect(sec0Xml).toContain('<hp:cellSz width="25000" height="3000"/>');
  });

  it("3. Generates a multi-page HWPX with pageBreak, mixed orientation, and element positions", async () => {
    const multiPageDoc: CanvasDocument = {
      version: "1.0",
      title: "Phase 42 Multi-Page HWPX Document",
      pageSize: { name: "A4", widthPt: 595.28, heightPt: 841.89, orientation: "portrait", unit: "pt" },
      marginsPt: { top: 36, right: 36, bottom: 36, left: 36 },
      pages: [
        {
          pageNumber: 1,
          id: "page_1",
          name: "Cover Page",
          bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
          backgroundColor: "#F8FAFC",
          elements: [
            {
              id: "p1_title",
              name: "Title",
              type: "text",
              bounds: { x: 50, y: 150, width: 495, height: 60 },
              zIndex: 1,
              style: {},
              paragraphAlign: "center",
              textRuns: [
                {
                  text: "안전진단 종합 보고서",
                  fontFamily: "맑은 고딕",
                  fontSizePt: 24,
                  fontWeight: 700,
                  color: "#0F172A",
                },
              ],
            },
          ],
        },
        {
          pageNumber: 2,
          id: "page_2",
          name: "Inspection Overview (Landscape)",
          bounds: { x: 0, y: 0, width: 841.89, height: 595.28 },
          backgroundColor: "#FFFFFF",
          elements: [
            {
              id: "p2_header",
              name: "Page 2 Header",
              type: "text",
              bounds: { x: 40, y: 40, width: 760, height: 30 },
              zIndex: 1,
              style: {},
              textRuns: [
                {
                  text: "제 2 장 : 대상 시설물 현황 및 점검 결과 요약",
                  fontFamily: "맑은 고딕",
                  fontSizePt: 16,
                  fontWeight: 700,
                  color: "#1E3A8A",
                },
              ],
            },
            {
              id: "p2_table",
              name: "Overview Table",
              type: "table",
              bounds: { x: 40, y: 90, width: 760, height: 120 },
              zIndex: 2,
              style: {},
              tableData: {
                rowCount: 3,
                colCount: 4,
                colWidthsPt: [190, 190, 190, 190],
                rowHeightsPt: [40, 40, 40],
                cells: [
                  [
                    { row: 0, col: 0, widthPt: 190, heightPt: 40, textRuns: [{ text: "점검부위" }] },
                    { row: 0, col: 1, widthPt: 190, heightPt: 40, textRuns: [{ text: "진단기준" }] },
                    { row: 0, col: 2, widthPt: 190, heightPt: 40, textRuns: [{ text: "측정치" }] },
                    { row: 0, col: 3, widthPt: 190, heightPt: 40, textRuns: [{ text: "판정" }] },
                  ],
                  [
                    { row: 1, col: 0, widthPt: 190, heightPt: 40, textRuns: [{ text: "기둥 (C-1)" }] },
                    { row: 1, col: 1, widthPt: 190, heightPt: 40, textRuns: [{ text: "균열폭 <= 0.3mm" }] },
                    { row: 1, col: 2, widthPt: 190, heightPt: 40, textRuns: [{ text: "0.12mm" }] },
                    { row: 1, col: 3, widthPt: 190, heightPt: 40, textRuns: [{ text: "양호" }] },
                  ],
                  [
                    { row: 2, col: 0, widthPt: 190, heightPt: 40, textRuns: [{ text: "슬래브 (S-3)" }] },
                    { row: 2, col: 1, widthPt: 190, heightPt: 40, textRuns: [{ text: "처짐 <= L/250" }] },
                    { row: 2, col: 2, widthPt: 190, heightPt: 40, textRuns: [{ text: "1.2mm" }] },
                    { row: 2, col: 3, widthPt: 190, heightPt: 40, textRuns: [{ text: "양호" }] },
                  ],
                ],
              },
            },
          ],
        },
        {
          pageNumber: 3,
          id: "page_3",
          name: "Conclusion (Portrait)",
          bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
          backgroundColor: "#F8FAFC",
          elements: [
            {
              id: "p3_text",
              name: "Conclusion Text",
              type: "text",
              bounds: { x: 50, y: 100, width: 495, height: 80 },
              zIndex: 1,
              style: {},
              textRuns: [
                {
                  text: "종합 평가 결과: 전 항목 기준치를 만족하며 지속적인 유지관리를 권고함.",
                  fontFamily: "맑은 고딕",
                  fontSizePt: 12,
                  color: "#1F2937",
                },
              ],
            },
          ],
        },
      ],
    };

    const zip = await hwpxRenderer.buildZip(multiPageDoc);
    const sec0Xml = await zip.file("Contents/section0.xml")!.async("string");

    // 1. Verify page break attributes
    // Page 1 has pageBreak="0", Page 2 has pageBreak="1", Page 3 has pageBreak="1"
    expect(sec0Xml).toContain('<hp:p id="0" paraPrIDRef="0" styleIDRef="0" pageBreak="0"');
    expect(sec0Xml).toContain('<hp:p id="1" paraPrIDRef="0" styleIDRef="0" pageBreak="1"');
    expect(sec0Xml).toContain('<hp:p id="2" paraPrIDRef="0" styleIDRef="0" pageBreak="1"');

    // 2. Verify orientation changes in secPr
    // In KS X 6101: WIDELY = Portrait, NARROWLY = Landscape
    expect(sec0Xml).toContain('landscape="WIDELY"');
    expect(sec0Xml).toContain('landscape="NARROWLY"');

    // 3. Verify content from all 3 pages
    expect(sec0Xml).toContain("안전진단 종합 보고서");
    expect(sec0Xml).toContain("제 2 장 : 대상 시설물 현황 및 점검 결과 요약");
    expect(sec0Xml).toContain("기둥 (C-1)");
    expect(sec0Xml).toContain("종합 평가 결과: 전 항목 기준치를 만족하며 지속적인 유지관리를 권고함.");
  });

  it("4. Validates full HWPX package integrity and OWPML conformance", async () => {
    const doc: CanvasDocument = {
      version: "1.0",
      title: "Package Integrity Test",
      pageSize: { name: "A4", widthPt: 595.28, heightPt: 841.89, orientation: "portrait", unit: "pt" },
      marginsPt: { top: 36, right: 36, bottom: 36, left: 36 },
      pages: [
        {
          pageNumber: 1,
          id: "p1",
          bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
          elements: [
            {
              id: "t1",
              type: "text",
              bounds: { x: 50, y: 50, width: 200, height: 30 },
              zIndex: 1,
              style: {},
              textRuns: [{ text: "Integrity Test" }],
            },
          ],
        },
      ],
    };

    const zip = await hwpxRenderer.buildZip(doc);
    const filenames = Object.keys(zip.files);

    // Strict KS X 6101 package requirement:
    // mimetype MUST be the very first entry in the zip package
    expect(filenames[0]).toBe("mimetype");

    // Verify all required OWPML xml parts
    expect(filenames).toContain("version.xml");
    expect(filenames).toContain("settings.xml");
    expect(filenames).toContain("META-INF/container.xml");
    expect(filenames).toContain("META-INF/manifest.xml");
    expect(filenames).toContain("Contents/content.hpf");
    expect(filenames).toContain("Contents/header.xml");
    expect(filenames).toContain("Contents/section0.xml");
  });
});

