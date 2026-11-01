import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import { FigmaCanvasParser } from "../src/canvas/parser/figmaCanvasParser.js";
import { HwpxCanvasRenderer } from "../src/canvas/renderer/hwpxCanvasRenderer.js";
import { CanvasDocument, CanvasTableData } from "../src/canvas/types.js";
import JSZip from "jszip";

async function main() {
  console.log("============================================================");
  console.log("Phase 42: HWPX Production Expansion & End-to-End Export Verification");
  console.log("============================================================");

  const outDir = path.resolve(process.cwd(), "debug/hwpx-phase42");
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const hwpxRenderer = new HwpxCanvasRenderer({ creator: "Figma2Word Phase 42 Production" });

  // 1. Synthetic Table Document (2x2 + merged cells)
  console.log("\n[1/4] Building Synthetic Native Table HWPX...");
  const tableData1: CanvasTableData = {
    rowCount: 3,
    colCount: 3,
    colWidthsPt: [150, 150, 150],
    rowHeightsPt: [35, 35, 35],
    cells: [
      [
        {
          row: 0,
          col: 0,
          colSpan: 2,
          rowSpan: 1,
          widthPt: 300,
          heightPt: 35,
          backgroundColor: "#1E3A8A",
          borderColor: "#1E40AF",
          borderWidth: 1.5,
          align: "center",
          verticalAlign: "center",
          textRuns: [
            {
              text: "통합 진단 분류 (가로 2열 병합 헤더)",
              fontFamily: "맑은 고딕",
              fontSizePt: 11,
              fontWeight: 700,
              color: "#FFFFFF",
            },
          ],
        },
        {
          row: 0,
          col: 2,
          widthPt: 150,
          heightPt: 35,
          backgroundColor: "#1E3A8A",
          borderColor: "#1E40AF",
          borderWidth: 1.5,
          align: "center",
          verticalAlign: "center",
          textRuns: [
            {
              text: "상태 등급",
              fontFamily: "맑은 고딕",
              fontSizePt: 11,
              fontWeight: 700,
              color: "#FFFFFF",
            },
          ],
        },
      ],
      [
        {
          row: 1,
          col: 0,
          widthPt: 150,
          heightPt: 35,
          backgroundColor: "#F8FAFC",
          borderColor: "#E2E8F0",
          borderWidth: 1,
          align: "left",
          verticalAlign: "center",
          textRuns: [
            {
              text: "기둥/보 균열 및 처짐",
              fontFamily: "맑은 고딕",
              fontSizePt: 10,
              color: "#1E293B",
            },
          ],
        },
        {
          row: 1,
          col: 1,
          widthPt: 150,
          heightPt: 35,
          backgroundColor: "#FFFFFF",
          borderColor: "#E2E8F0",
          borderWidth: 1,
          align: "center",
          verticalAlign: "center",
          textRuns: [
            {
              text: "허용치 이내 (0.15mm)",
              fontFamily: "맑은 고딕",
              fontSizePt: 10,
              color: "#334155",
            },
          ],
        },
        {
          row: 1,
          col: 2,
          widthPt: 150,
          heightPt: 35,
          backgroundColor: "#ECFDF5",
          borderColor: "#A7F3D0",
          borderWidth: 1,
          align: "center",
          verticalAlign: "center",
          textRuns: [
            {
              text: "양호 (A)",
              fontFamily: "맑은 고딕",
              fontSizePt: 10,
              fontWeight: 700,
              color: "#059669",
            },
          ],
        },
      ],
      [
        {
          row: 2,
          col: 0,
          widthPt: 150,
          heightPt: 35,
          backgroundColor: "#F8FAFC",
          borderColor: "#E2E8F0",
          borderWidth: 1,
          align: "left",
          verticalAlign: "center",
          textRuns: [
            {
              text: "철근 부식 및 피복 두께",
              fontFamily: "맑은 고딕",
              fontSizePt: 10,
              color: "#1E293B",
            },
          ],
        },
        {
          row: 2,
          col: 1,
          widthPt: 150,
          heightPt: 35,
          backgroundColor: "#FFFFFF",
          borderColor: "#E2E8F0",
          borderWidth: 1,
          align: "center",
          verticalAlign: "center",
          textRuns: [
            {
              text: "피복 두께 42mm 확보",
              fontFamily: "맑은 고딕",
              fontSizePt: 10,
              color: "#334155",
            },
          ],
        },
        {
          row: 2,
          col: 2,
          widthPt: 150,
          heightPt: 35,
          backgroundColor: "#ECFDF5",
          borderColor: "#A7F3D0",
          borderWidth: 1,
          align: "center",
          verticalAlign: "center",
          textRuns: [
            {
              text: "양호 (A)",
              fontFamily: "맑은 고딕",
              fontSizePt: 10,
              fontWeight: 700,
              color: "#059669",
            },
          ],
        },
      ],
    ],
  };

    const tableDoc: CanvasDocument = {
      version: "1.0",
      title: "Phase 42 Synthetic Native Table HWPX",
      pageSize: { name: "A4", widthPt: 595.28, heightPt: 841.89, orientation: "portrait", unit: "pt" },
      marginsPt: { top: 36, right: 36, bottom: 36, left: 36 },
      pages: [
        {
          pageNumber: 1,
          id: "p1",
          name: "Page 1 - Native Table",
          bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
          backgroundColor: "#FFFFFF",
          elements: [
            {
              id: "t_title",
              name: "Document Title",
              type: "text",
              bounds: { x: 50, y: 50, width: 495, height: 40 },
              zIndex: 1,
              style: {},
              paragraphAlign: "center",
              textRuns: [
                {
                  text: "한컴 HWPX 네이티브 표 (<hp:tbl>) 실증 결과",
                  fontFamily: "맑은 고딕",
                  fontSizePt: 18,
                  fontWeight: 700,
                  color: "#0F172A",
                },
              ],
            },
            {
              id: "t_desc",
              name: "Description",
              type: "text",
              bounds: { x: 50, y: 100, width: 495, height: 40 },
              zIndex: 2,
              style: {},
              textRuns: [
                {
                  text: "아래의 표는 도형의 조합이 아닌 KS X 6101 OWPML 표준의 순수 네이티브 <hp:tbl> 및 셀 병합(<hp:cellSpan>)으로 생성되었습니다.",
                  fontFamily: "맑은 고딕",
                  fontSizePt: 10,
                  color: "#475569",
                },
              ],
            },
            {
              id: "elem_table",
              name: "Native Inspection Table",
              type: "table",
              bounds: { x: 50, y: 150, width: 450, height: 105 },
              zIndex: 3,
              style: {},
              tableData: tableData1,
            },
          ],
        },
      ],
    };

    const tableBuf = await hwpxRenderer.renderToBuffer(tableDoc);
    const tablePath = path.join(outDir, "phase42-synthetic-table.hwpx");
    fs.writeFileSync(tablePath, tableBuf);
    console.log(`  -> Generated: ${tablePath} (${tableBuf.length} bytes)`);

    // 2. Synthetic Multi-Page Document
    console.log("\n[2/4] Building Synthetic Multi-Page HWPX (3 Pages)...");
    const multiPageDoc: CanvasDocument = {
      version: "1.0",
      title: "Phase 42 Synthetic Multi-Page HWPX",
      pageSize: { name: "A4", widthPt: 595.28, heightPt: 841.89, orientation: "portrait", unit: "pt" },
      marginsPt: { top: 36, right: 36, bottom: 36, left: 36 },
      pages: [
        {
          pageNumber: 1,
          id: "m_p1",
          name: "Cover (Portrait)",
          bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
          backgroundColor: "#F8FAFC",
          elements: [
            {
              id: "m_p1_title",
              name: "Cover Title",
              type: "text",
              bounds: { x: 50, y: 200, width: 495, height: 60 },
              zIndex: 1,
              style: {},
              paragraphAlign: "center",
              textRuns: [
                {
                  text: "Figma2Word HWPX 다중 페이지 통합 보고서",
                  fontFamily: "맑은 고딕",
                  fontSizePt: 22,
                  fontWeight: 700,
                  color: "#1E3A8A",
                },
              ],
            },
            {
              id: "m_p1_sub",
              name: "Cover Subtitle",
              type: "text",
              bounds: { x: 50, y: 270, width: 495, height: 30 },
              zIndex: 2,
              style: {},
              paragraphAlign: "center",
              textRuns: [
                {
                  text: "Page 1 of 3: 표지 섹션 (세로형 A4)",
                  fontFamily: "맑은 고딕",
                  fontSizePt: 12,
                  color: "#64748B",
                },
              ],
            },
          ],
        },
        {
          pageNumber: 2,
          id: "m_p2",
          name: "Summary Table (Landscape)",
          bounds: { x: 0, y: 0, width: 841.89, height: 595.28 },
          backgroundColor: "#FFFFFF",
          elements: [
            {
              id: "m_p2_title",
              name: "Landscape Title",
              type: "text",
              bounds: { x: 40, y: 40, width: 760, height: 30 },
              zIndex: 1,
              style: {},
              textRuns: [
                {
                  text: "Page 2 of 3: 가로형(Landscape) 페이지 및 상세 데이터 표",
                  fontFamily: "맑은 고딕",
                  fontSizePt: 16,
                  fontWeight: 700,
                  color: "#0F172A",
                },
              ],
            },
            {
              id: "m_p2_tbl",
              name: "Landscape Table",
              type: "table",
              bounds: { x: 40, y: 80, width: 760, height: 105 },
              zIndex: 2,
              style: {},
              tableData: tableData1,
            },
          ],
        },
        {
          pageNumber: 3,
          id: "m_p3",
          name: "Conclusion (Portrait)",
          bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
          backgroundColor: "#F8FAFC",
          elements: [
            {
              id: "m_p3_title",
              name: "Conclusion Title",
              type: "text",
              bounds: { x: 50, y: 60, width: 495, height: 30 },
              zIndex: 1,
              style: {},
              textRuns: [
                {
                  text: "Page 3 of 3: 최종 종합 의견 및 승인",
                  fontFamily: "맑은 고딕",
                  fontSizePt: 16,
                  fontWeight: 700,
                  color: "#0F172A",
                },
              ],
            },
            {
              id: "m_p3_card",
              name: "Approval Box",
              type: "card",
              bounds: { x: 50, y: 110, width: 495, height: 100 },
              zIndex: 2,
              style: {
                fillColor: "#EFF6FF",
                strokeColor: "#3B82F6",
                strokeWidth: 1.5,
                cornerRadius: 8,
              },
              textRuns: [
                {
                  text: "본 문서는 Figma2Word Phase 42 HWPX 변환 엔진을 통해 다중 페이지, 표, 배경색, 단락 정렬을 모두 완벽히 통합하여 생성되었습니다.",
                  fontFamily: "맑은 고딕",
                  fontSizePt: 11,
                  color: "#1E40AF",
                },
              ],
            },
          ],
        },
      ],
    };

    const multiBuf = await hwpxRenderer.renderToBuffer(multiPageDoc);
    const multiPath = path.join(outDir, "phase42-synthetic-multipage.hwpx");
    fs.writeFileSync(multiPath, multiBuf);
    console.log(`  -> Generated: ${multiPath} (${multiBuf.length} bytes)`);

    // 3. Customer 17-Frame Full HWPX Document
    console.log("\n[3/4] Parsing & Rendering Customer 17 Frames (펜테크 3차 디자인.json)...");
    const jsonPath = path.resolve(process.cwd(), "펜테크 3차 디자인.json");
    let customer17Path = "";
    if (fs.existsSync(jsonPath)) {
      const rawCustomer = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
      const fullParser = new FigmaCanvasParser({
        imageMap: rawCustomer.imageMap,
        scalePolicy: "fit-a4",
        titleOverride: "펜테크 3차 디자인 17개 전 페이지 통합 (Phase 42)",
      });
      const customerDoc = fullParser.parse(rawCustomer);
      console.log(`  -> Canvas IR generated: ${customerDoc.pages.length} pages, total elements: ${customerDoc.pages.reduce((acc, p) => acc + p.elements.length, 0)}`);

      const custBuf = await hwpxRenderer.renderToBuffer(customerDoc);
      customer17Path = path.join(outDir, "phase42-customer-17-pages.hwpx");
      fs.writeFileSync(customer17Path, custBuf);
      console.log(`  -> Generated: ${customer17Path} (${custBuf.length} bytes)`);
    } else {
      console.log("  -> Customer json not found, skipping customer frame test.");
    }

    // 4. Hancom Office 2024 Viewer (HwpViewer.exe) Verification
    console.log("\n[4/4] Verifying all generated HWPX files in HwpViewer.exe...");
    const filesToTest = [tablePath, multiPath, customer17Path].filter(Boolean);
    for (const filePath of filesToTest) {
      try {
        const pyCmd = `python -c "import sys; sys.path.append('scripts'); from test_viewer_suite import test_hwpx_file; res = test_hwpx_file(r'${filePath}'); print(f'{res[0]}|{res[1]}')"`;
        const out = execSync(pyCmd, { encoding: "utf-8", timeout: 30000 }).trim();
        const [status, title] = out.split("|");
        console.log(`  -> [${status}] ${path.basename(filePath)} => Window: "${title}"`);
        if (status !== "PASS") {
          console.error(`FAILED: ${filePath} did not pass HwpViewer check! Result: ${out}`);
          process.exit(1);
        }
      } catch (err: any) {
        console.error(`  -> Viewer check failed for ${filePath}:`, err.message);
        process.exit(1);
      }
    }

    console.log("\n============================================================");
    console.log("Phase 42 HWPX Verification PASSED (All files VERIFIED in HwpViewer.exe)!");
    console.log("============================================================");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
