import { describe, it, expect } from "vitest";
import { FigmaCanvasParser } from "../src/canvas/parser/figmaCanvasParser.js";
import { HwpxCanvasRenderer } from "../src/canvas/renderer/hwpxCanvasRenderer.js";
import { DocxCanvasRenderer } from "../src/canvas/renderer/docxCanvasRenderer.js";
import {
  createTableWithIconsFixture,
  createTableWithImagesFixture,
  createTableWithCheckboxesFixture,
  createTableWithRowColSpanFixture,
  createMobileTableFixture,
  createTallRowsDesktopTableFixture,
  createNameMutatedTableFixture,
} from "./fixtures/generalization/figmaFixtures.js";

describe("Phase 44: Universal Content Preservation & Semantic Recognition Hardening", () => {
  const parser = new FigmaCanvasParser({ scalePolicy: "fit-a4" });
  const hwpxRenderer = new HwpxCanvasRenderer();
  const docxRenderer = new DocxCanvasRenderer();

  it("1. Track A: Atomic Fallback on Table with Vector Icons prevents icon loss", async () => {
    const fixture = createTableWithIconsFixture();
    const doc = parser.parse(fixture);

    expect(doc.pages.length).toBe(1);
    const elements = doc.pages[0].elements;

    // Because Cell (1, 1) contains a Vector icon, native table conversion MUST atomically fall back
    // so that the vector icon and surrounding cells are rendered as editable individual elements!
    const tableElem = elements.find((e) => e.type === "table");
    expect(tableElem).toBeUndefined();

    // Verify vector icon element is 100% PRESERVED!
    const vectorElems = elements.filter((e) => e.type === "vector");
    expect(vectorElems.length).toBeGreaterThanOrEqual(1);

    // Verify all text content is 100% PRESERVED!
    const allTexts = elements.flatMap((e) => e.textRuns?.map((r) => r.text) || []);
    expect(allTexts).toContain("API Gateway");
    expect(allTexts).toContain("99.9%");
    expect(allTexts).toContain("DB Cluster");
    expect(allTexts).toContain("정상 가동");

    // Verify both DOCX and HWPX serialize cleanly
    const hwpx = await hwpxRenderer.renderToUint8Array(doc);
    expect(hwpx.length).toBeGreaterThan(1000);
    const docx = await docxRenderer.renderToUint8Array(doc);
    expect(docx.length).toBeGreaterThan(1000);
  });

  it("2. Track A: Atomic Fallback on Table with Images prevents image loss", async () => {
    const fixture = createTableWithImagesFixture();
    const doc = parser.parse(fixture);

    expect(doc.pages.length).toBe(1);
    const elements = doc.pages[0].elements;

    // Must not be swallowed by a native table without image rendering
    const tableElem = elements.find((e) => e.type === "table");
    expect(tableElem).toBeUndefined();

    // Verify Image element is 100% PRESERVED!
    const imageElems = elements.filter((e) => e.type === "image");
    expect(imageElems.length).toBeGreaterThanOrEqual(1);

    // Verify text content is 100% PRESERVED!
    const allTexts = elements.flatMap((e) => e.textRuns?.map((r) => r.text) || []);
    expect(allTexts).toContain("홍길동 수석");
    expect(allTexts).toContain("인공지능 연구소");
    expect(allTexts).toContain("이순신 책임");
  });

  it("3. Track A: Atomic Fallback on Table with Checkbox controls preserves interactive shapes", async () => {
    const fixture = createTableWithCheckboxesFixture();
    const doc = parser.parse(fixture);

    expect(doc.pages.length).toBe(1);
    const elements = doc.pages[0].elements;

    // Native table must fall back
    const tableElem = elements.find((e) => e.type === "table");
    expect(tableElem).toBeUndefined();

    // Verify checkbox card shapes are preserved
    const cardElems = elements.filter((e) => e.type === "card");
    expect(cardElems.length).toBeGreaterThanOrEqual(2);

    const allTexts = elements.flatMap((e) => e.textRuns?.map((r) => r.text) || []);
    expect(allTexts).toContain("문서 레이아웃 검수 완료");
    expect(allTexts).toContain("최종 산출물 검토");
  });

  it("4. Track D: Multi-axis Span Detection accurately identifies rowSpan and colSpan", async () => {
    const fixture = createTableWithRowColSpanFixture();
    const doc = parser.parse(fixture);

    expect(doc.pages.length).toBe(1);
    const elements = doc.pages[0].elements;

    // Pure text table with row and col spans MUST be recognized as native table
    const tableElem = elements.find((e) => e.type === "table");
    expect(tableElem).toBeDefined();
    expect(tableElem!.tableData).toBeDefined();

    const td = tableElem!.tableData!;
    expect(td.rowCount).toBe(3);
    expect(td.colCount).toBe(3);

    // Check Row 0 cells:
    // Cell (0, 0) spans 2 rows!
    const row0 = td.cells[0];
    const verticalCell = row0.find((c) => c.col === 0);
    expect(verticalCell).toBeDefined();
    expect(verticalCell!.rowSpan).toBe(2);
    expect(verticalCell!.textRuns[0]?.text).toContain("2행 병합");

    // Cell (0, 1) spans 2 cols!
    const horizontalCell = row0.find((c) => c.col === 1);
    expect(horizontalCell).toBeDefined();
    expect(horizontalCell!.colSpan).toBe(2);
    expect(horizontalCell!.textRuns[0]?.text).toContain("2열 병합");

    // Check Row 1 cells: Col 0 was covered by Row 0, so Row 1 cells start at Col 1!
    const row1 = td.cells[1];
    expect(row1.some((c) => c.col === 0)).toBe(false);
    expect(row1.some((c) => c.col === 1)).toBe(true);

    // Verify HWPX KS X 6101 XML contains both colSpan and rowSpan
    const hwpxZip = await hwpxRenderer.buildZip(doc);
    const sec0Xml = await hwpxZip.file("Contents/section0.xml")!.async("string");
    expect(sec0Xml).toContain('<hp:cellSpan colSpan="2"');
    expect(sec0Xml).toContain('rowSpan="2"');
  });

  it("5. Track C: Relative Geometry accurately recognizes compact Mobile Table", async () => {
    const fixture = createMobileTableFixture();
    const doc = parser.parse(fixture);

    expect(doc.pages.length).toBe(1);
    const elements = doc.pages[0].elements;

    // Mobile table (W=300px, 3 rows of 40px) MUST be recognized as a table
    const tableElem = elements.find((e) => e.type === "table");
    expect(tableElem).toBeDefined();
    expect(tableElem!.tableData).toBeDefined();
    expect(tableElem!.tableData!.rowCount).toBe(3);
    expect(tableElem!.tableData!.colCount).toBe(3);

    const firstRowTexts = tableElem!.tableData!.cells[0].map((c) => c.textRuns[0]?.text);
    expect(firstRowTexts).toContain("종목");
    expect(firstRowTexts).toContain("수량");
    expect(firstRowTexts).toContain("단가");
  });

  it("6. Track C: Relative Geometry accurately recognizes Tall Rows Desktop Table", async () => {
    const fixture = createTallRowsDesktopTableFixture();
    const doc = parser.parse(fixture);

    expect(doc.pages.length).toBe(1);
    const elements = doc.pages[0].elements;

    // Desktop table with 105px tall rows MUST be recognized as a table
    const tableElem = elements.find((e) => e.type === "table");
    expect(tableElem).toBeDefined();
    expect(tableElem!.tableData).toBeDefined();
    expect(tableElem!.tableData!.rowCount).toBe(3);
    expect(tableElem!.tableData!.colCount).toBe(2);

    const headerTexts = tableElem!.tableData!.cells[0].map((c) => c.textRuns[0]?.text);
    expect(headerTexts).toContain("진단 구역 명칭");
    expect(headerTexts).toContain("상세 진단 종합 소견 및 조치 권고사항");
  });

  it("7. Track B: Structural Table Recognition succeeds without table/표 keywords (Name Invariance)", async () => {
    const fixture = createNameMutatedTableFixture();
    const doc = parser.parse(fixture);

    expect(doc.pages.length).toBe(1);
    const elements = doc.pages[0].elements;

    // Named "Summary_Panel_Wrapper_12" with NO "table" or "표" keyword
    // Pure structural grid alignment must recognize it as a table!
    const tableElem = elements.find((e) => e.type === "table");
    expect(tableElem).toBeDefined();
    expect(tableElem!.tableData).toBeDefined();
    expect(tableElem!.tableData!.rowCount).toBe(3);
    expect(tableElem!.tableData!.colCount).toBe(2);

    const cellTexts = tableElem!.tableData!.cells[0].map((c) => c.textRuns[0]?.text);
    expect(cellTexts).toContain("구분 코드");
    expect(cellTexts).toContain("기준값");
  });
});
