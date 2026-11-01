import { describe, it, expect } from "vitest";
import { FigmaCanvasParser } from "../src/canvas/parser/figmaCanvasParser.js";
import { HwpxCanvasRenderer } from "../src/canvas/renderer/hwpxCanvasRenderer.js";
import { DocxCanvasRenderer } from "../src/canvas/renderer/docxCanvasRenderer.js";
import {
  createBusinessDataTableFixture,
  createManagementDashboardFixture,
  createInputFormFixture,
  createMobileUIFixture,
  createDocumentLayoutHoldoutFixture,
  createComplexDesignSystemHoldoutFixture,
} from "./fixtures/generalization/figmaFixtures.js";
import { FigmaNode } from "../src/parser/types.js";

describe("Phase 43: Universal Figma Interpretation & Cross-Design Generalization", () => {
  const parser = new FigmaCanvasParser({ scalePolicy: "fit-a4" });
  const hwpxRenderer = new HwpxCanvasRenderer();
  const docxRenderer = new DocxCanvasRenderer();

  it("1. Accurately detects business data tables into CanvasTableData without customer-specific heuristics", async () => {
    const fixture = createBusinessDataTableFixture();
    const doc = parser.parse(fixture);

    expect(doc.pages.length).toBe(1);
    const elements = doc.pages[0].elements;

    // Must find a table element
    const tableElem = elements.find((e) => e.type === "table");
    expect(tableElem).toBeDefined();
    expect(tableElem!.tableData).toBeDefined();

    const td = tableElem!.tableData!;
    expect(td.rowCount).toBe(4);
    expect(td.colCount).toBe(4);
    expect(td.colWidthsPt.length).toBe(4);
    expect(td.rowHeightsPt?.length).toBe(4);

    // Verify cell contents
    const headerRow = td.cells[0];
    expect(headerRow.length).toBe(4);
    expect(headerRow[0].textRuns[0].text).toContain("진단 항목");
    expect(headerRow[3].textRuns[0].text).toContain("판정 결과");

    // Verify merged cell in Row 2 (colSpan = 2)
    const row2 = td.cells[2];
    const mergedCell = row2.find((c) => (c.colSpan || 1) > 1);
    expect(mergedCell).toBeDefined();
    expect(mergedCell!.colSpan).toBe(2);
    expect(mergedCell!.textRuns[0].text).toContain("부등침하 및 수평변위");

    // Verify DOCX and HWPX generation
    const hwpxZip = await hwpxRenderer.buildZip(doc);
    const sec0Xml = await hwpxZip.file("Contents/section0.xml")!.async("string");
    expect(sec0Xml).toContain("<hp:tbl");
    expect(sec0Xml).toContain('rowCnt="4" colCnt="4"');
    expect(sec0Xml).toContain("진단 항목");

    const docxZip = await docxRenderer.buildZip(doc);
    const docxXml = await docxZip.file("word/document.xml")!.async("string");
    expect(docxXml).toContain("진단 항목");
  });

  it("2. Prevents false-positive table classifications on Management Dashboard (metric cards)", async () => {
    const fixture = createManagementDashboardFixture();
    const doc = parser.parse(fixture);

    const elements = doc.pages[0].elements;
    // KPI stat cards MUST NOT be misclassified as a table
    const tableElem = elements.find((e) => e.type === "table");
    expect(tableElem).toBeUndefined();

    // Verify stat cards and metrics are preserved as cards and text
    const textContents = elements.flatMap((e) => e.textRuns?.map((r) => r.text) || []);
    expect(textContents).toContain("총 활성 사용자");
    expect(textContents).toContain("128,450명");
    expect(textContents).toContain("월간 매출액");
    expect(textContents).toContain("99.98 %");
  });

  it("3. Prevents false-positive table classifications on Input Forms", async () => {
    const fixture = createInputFormFixture();
    const doc = parser.parse(fixture);

    const elements = doc.pages[0].elements;
    // Form inputs and buttons MUST NOT be misclassified as a table
    const tableElem = elements.find((e) => e.type === "table");
    expect(tableElem).toBeUndefined();

    const textContents = elements.flatMap((e) => e.textRuns?.map((r) => r.text) || []);
    expect(textContents).toContain("신규 관리자 계정 생성");
    expect(textContents).toContain("성명 (Full Name)");
    expect(textContents).toContain("업무용 이메일 주소");
    expect(textContents).toContain("계정 생성 완료");
  });

  it("4. Accurately parses Mobile UI layout with nested AutoLayout frames", async () => {
    const fixture = createMobileUIFixture();
    const doc = parser.parse(fixture);

    expect(doc.pages.length).toBe(1);
    const elements = doc.pages[0].elements;
    expect(elements.length).toBeGreaterThan(0);

    const textContents = elements.flatMap((e) => e.textRuns?.map((r) => r.text) || []);
    expect(textContents).toContain("현장 점검 목록");
    expect(textContents).toContain("시설물 명칭 검색...");
    expect(textContents).toContain("서울 마포구 제3교량");
  });

  it("5. Holdout Evaluation 1: Technical Document Layout", async () => {
    const holdout1 = createDocumentLayoutHoldoutFixture();
    const doc = parser.parse(holdout1);

    expect(doc.pages.length).toBe(1);
    const elements = doc.pages[0].elements;
    expect(elements.length).toBeGreaterThan(0);

    const textContents = elements.flatMap((e) => e.textRuns?.map((r) => r.text) || []);
    expect(textContents).toContain("초고층 건축물의 내진 안전성 평가 및 구조 해석 기법");
    expect(textContents.some((t) => t.includes("구조 감쇠장치(TMD)"))).toBe(true);

    // Verify DOCX & HWPX can serialize the holdout without error
    const hwpx = await hwpxRenderer.renderToUint8Array(doc);
    expect(hwpx.length).toBeGreaterThan(2000);
    const docx = await docxRenderer.renderToUint8Array(doc);
    expect(docx.length).toBeGreaterThan(2000);
  });

  it("6. Holdout Evaluation 2: Complex Design System Component (Embedded Table Instance)", async () => {
    const holdout2 = createComplexDesignSystemHoldoutFixture();
    const doc = parser.parse(holdout2);

    expect(doc.pages.length).toBe(1);
    const elements = doc.pages[0].elements;

    // The embedded table instance MUST be recognized as a table!
    const tableElem = elements.find((e) => e.type === "table");
    expect(tableElem).toBeDefined();
    expect(tableElem!.tableData).toBeDefined();
    expect(tableElem!.tableData!.rowCount).toBe(2);
    expect(tableElem!.tableData!.colCount).toBe(4);

    const firstRowTexts = tableElem!.tableData!.cells[0].map((c) => c.textRuns[0]?.text);
    expect(firstRowTexts).toContain("속성명 (Property)");
    expect(firstRowTexts).toContain("타입 (Type)");
  });

  it("7. Metamorphic Testing: Structural invariance under arbitrary Node ID and Name mutations", async () => {
    const originalFixture = createBusinessDataTableFixture();

    // Deep clone and mutate all IDs and names to random strings
    let counter = 0;
    const mutate = (node: FigmaNode) => {
      counter++;
      node.id = `random_uuid_${counter}_${Math.random().toString(36).substring(7)}`;
      // Overwrite all semantic names with arbitrary alphanumeric noise
      node.name = `Frame_Obj_${counter}`;
      if (node.children) {
        node.children.forEach(mutate);
      }
    };

    const mutatedFixture = JSON.parse(JSON.stringify(originalFixture));
    mutate(mutatedFixture);

    // Parse mutated fixture
    const docMutated = parser.parse(mutatedFixture);
    const elements = docMutated.pages[0].elements;

    // It MUST still recognize the table because the detection is structural, NOT name/id dependent!
    const tableElem = elements.find((e) => e.type === "table");
    expect(tableElem).toBeDefined();
    expect(tableElem!.tableData).toBeDefined();
    expect(tableElem!.tableData!.rowCount).toBe(4);
    expect(tableElem!.tableData!.colCount).toBe(4);

    // Verify that the text runs inside the table are preserved identically
    const headerRow = tableElem!.tableData!.cells[0];
    expect(headerRow[0].textRuns[0].text).toContain("진단 항목");
    expect(headerRow[3].textRuns[0].text).toContain("판정 결과");
  });
});

