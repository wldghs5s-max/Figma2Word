import { test, expect } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";
import JSZip from "jszip";
import { DocxCanvasRenderer } from "../src/canvas/renderer/docxCanvasRenderer.js";
import { CanvasDocument } from "../src/canvas/types.js";

test.describe("Figma2Word Web UI End-to-End Automation Suite (Phase 18)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1")).toContainText("Figma2Word");
  });

  test("E2E-1: loads preset fixture and executes dual conversion (DOCX + HWPX)", async ({ page }) => {
    const briefBtn = page.getByRole("button", { name: "1. 단일 메모 (Brief)" });
    await briefBtn.click();

    const dualBtn = page.getByRole("button", { name: "듀얼 (DOCX + HWPX)" });
    await dualBtn.click();

    const convertBtn = page.getByRole("button", { name: "변환 실행" });
    await convertBtn.click();

    await expect(page.locator("text=상태: 변환 성공")).toBeVisible({ timeout: 20000 });

    const docxDownloadBtn = page.getByRole("button", { name: "📥 Word 문서 (.docx) 다운로드" });
    const hwpxDownloadBtn = page.getByRole("button", { name: "📥 한컴 한글 문서 (.hwpx) 다운로드" });
    await expect(docxDownloadBtn).toBeVisible();
    await expect(hwpxDownloadBtn).toBeVisible();
    await expect(page.locator("text=Canvas IR 정밀 구조 통계")).toBeVisible();
  });

  test("E2E-2: verifies format filtering for HWPX only and DOCX only", async ({ page }) => {
    await page.getByRole("button", { name: "1. 단일 메모 (Brief)" }).click();

    const hwpxFormatBtn = page.getByRole("button", { name: "HWPX (한글)" });
    await hwpxFormatBtn.click();

    const convertBtn = page.getByRole("button", { name: "변환 실행" });
    await convertBtn.click();
    await expect(page.locator("text=상태: 변환 성공")).toBeVisible({ timeout: 20000 });

    await expect(page.getByRole("button", { name: "📥 한컴 한글 문서 (.hwpx) 다운로드" })).toBeVisible();
    await expect(page.getByRole("button", { name: "📥 Word 문서 (.docx) 다운로드" })).not.toBeVisible();

    const docxFormatBtn = page.getByRole("button", { name: "DOCX (Word)" });
    await docxFormatBtn.click();

    await convertBtn.click();
    await expect(page.locator("text=상태: 변환 성공")).toBeVisible({ timeout: 20000 });

    await expect(page.getByRole("button", { name: "📥 Word 문서 (.docx) 다운로드" })).toBeVisible();
    await expect(page.getByRole("button", { name: "📥 한컴 한글 문서 (.hwpx) 다운로드" })).not.toBeVisible();
  });

  test("E2E-3: converts complex landscape dashboard and validates downloaded DOCX & HWPX XML semantics", async ({ page }) => {
    const dashBtn = page.getByRole("button", { name: "6. 중첩 대시보드 (Dashboard)" });
    await dashBtn.click();

    await page.getByRole("button", { name: "듀얼 (DOCX + HWPX)" }).click();
    await page.getByRole("button", { name: "변환 실행" }).click();
    await expect(page.locator("text=상태: 변환 성공")).toBeVisible({ timeout: 25000 });

    // Intercept DOCX download
    const docxDownloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "📥 Word 문서 (.docx) 다운로드" }).click();
    const docxDownload = await docxDownloadPromise;
    const docxStream = await docxDownload.createReadStream();
    const docxChunks: Buffer[] = [];
    for await (const chunk of docxStream) {
      docxChunks.push(Buffer.from(chunk));
    }
    const docxBuf = Buffer.concat(docxChunks);
    expect(docxBuf.length).toBeGreaterThan(1000);

    // Validate DOCX ZIP & landscape page setup
    const docxZip = await JSZip.loadAsync(docxBuf);
    expect(docxZip.file("word/document.xml")).toBeDefined();
    const docXml = await docxZip.file("word/document.xml")!.async("string");
    expect(docXml).toContain("w:document");
    expect(docXml).toContain('w:orient="landscape"');

    // Intercept HWPX download
    const hwpxDownloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "📥 한컴 한글 문서 (.hwpx) 다운로드" }).click();
    const hwpxDownload = await hwpxDownloadPromise;
    const hwpxStream = await hwpxDownload.createReadStream();
    const hwpxChunks: Buffer[] = [];
    for await (const chunk of hwpxStream) {
      hwpxChunks.push(Buffer.from(chunk));
    }
    const hwpxBuf = Buffer.concat(hwpxChunks);
    expect(hwpxBuf.length).toBeGreaterThan(1000);

    // Validate HWPX ZIP & WIDELY landscape attribute
    const hwpxZip = await JSZip.loadAsync(hwpxBuf);
    expect(hwpxZip.file("Contents/section0.xml")).toBeDefined();
    const secXml = await hwpxZip.file("Contents/section0.xml")!.async("string");
    expect(secXml).toContain("hs:sec");
    expect(secXml).toContain('landscape="WIDELY"');
  });

  test("E2E-4: uploads multi-page JSON, toggles frame selection, and exports only selected page", async ({ page }) => {
    const uploadFilePath = path.resolve(process.cwd(), "samples/synthetic-figma/multi-page-report.json");
    expect(fs.existsSync(uploadFilePath)).toBe(true);

    const fileInput = page.locator('input[type="file"][accept=".json"]');
    await fileInput.setInputFiles(uploadFilePath);

    await expect(page.locator("text=multi-page-report.json").first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator("text=변환 대상 프레임 (3 / 3개 선택됨)")).toBeVisible();

    // Deselect all frames, then select only the first frame checkbox
    await page.getByRole("button", { name: "선택 해제" }).click();
    await expect(page.locator("text=변환 대상 프레임 (0 / 3개 선택됨)")).toBeVisible();

    const firstFrameCheckbox = page.locator('section input[type="checkbox"]').first();
    await firstFrameCheckbox.check();
    await expect(page.locator("text=변환 대상 프레임 (1 / 3개 선택됨)")).toBeVisible();

    // Run conversion
    await page.getByRole("button", { name: "변환 실행" }).click();
    await expect(page.locator("text=상태: 변환 성공")).toBeVisible({ timeout: 20000 });

    // Download HWPX and verify it has only 1 top-level page paragraph
    const hwpxDownloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "📥 한컴 한글 문서 (.hwpx) 다운로드" }).click();
    const hwpxDownload = await hwpxDownloadPromise;
    const hwpxStream = await hwpxDownload.createReadStream();
    const hwpxChunks: Buffer[] = [];
    for await (const chunk of hwpxStream) {
      hwpxChunks.push(Buffer.from(chunk));
    }
    const hwpxBuf = Buffer.concat(hwpxChunks);
    const hwpxZip = await JSZip.loadAsync(hwpxBuf);
    const secXml = await hwpxZip.file("Contents/section0.xml")!.async("string");
    expect(secXml).not.toContain('pageBreak="1"');
  });

  test("E2E-5: displays clear user-facing error alert when invalid JSON is uploaded", async ({ page }) => {
    const fileInput = page.locator('input[type="file"][accept=".json"]');

    // 1. Upload syntax-corrupt JSON
    await fileInput.setInputFiles({
      name: "corrupt-syntax.json",
      mimeType: "application/json",
      buffer: Buffer.from("{ invalid json ", "utf-8"),
    });
    await expect(page.locator("text=JSON 파일 읽기 실패:")).toBeVisible({ timeout: 10000 });

    // 2. Upload valid JSON without Figma structure
    await fileInput.setInputFiles({
      name: "not-figma.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify({ hello: "world" }), "utf-8"),
    });
    await expect(page.locator("text=유효한 Figma 노드 구조")).toBeVisible({ timeout: 10000 });
  });

  test("E2E-6: converts uploaded DOCX directly into HWPX via DOCX -> HWPX tab", async ({ page }) => {
    // Generate a sample DOCX buffer in-memory
    const sampleDoc: CanvasDocument = {
      title: "Browser Roundtrip Test",
      pageSize: { name: "A4", widthPt: 595.28, heightPt: 841.89, orientation: "portrait", unit: "pt" },
      marginsPt: { top: 0, right: 0, bottom: 0, left: 0 },
      pages: [
        {
          pageNumber: 1,
          bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
          backgroundColor: "#FFFFFF",
          elements: [
            {
              id: "card_e2e_6",
              name: "Browser DOCX Card",
              type: "text",
              bounds: { x: 40, y: 40, width: 250, height: 60 },
              zIndex: 1,
              style: { fillColor: "#EFF6FF", strokeColor: "#2563EB", strokeWidth: 1 },
              textRuns: [{ text: "DOCX to HWPX Browser E2E", fontFamily: "맑은 고딕", fontSizePt: 14, fontWeight: 700, color: "#1E40AF" }],
            },
          ],
        },
      ],
      resources: {},
      diagnostics: { notices: [], warnings: [] },
    };

    const docxRenderer = new DocxCanvasRenderer();
    const docxBuffer = await docxRenderer.renderToBuffer(sampleDoc);

    // Switch to DOCX -> HWPX tab
    await page.getByRole("button", { name: "🔄 DOCX → HWPX 직접 변환" }).click();

    const docxInput = page.locator('input[type="file"][accept=".docx"]');
    await docxInput.setInputFiles({
      name: "browser-roundtrip.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      buffer: docxBuffer,
    });

    await expect(page.locator("text=DOCX → HWPX 직접 변환 성공")).toBeVisible({ timeout: 20000 });

    const hwpxDownloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "📥 한컴 한글 문서 (.hwpx) 다운로드" }).click();
    const hwpxDownload = await hwpxDownloadPromise;
    const hwpxStream = await hwpxDownload.createReadStream();
    const hwpxChunks: Buffer[] = [];
    for await (const chunk of hwpxStream) {
      hwpxChunks.push(Buffer.from(chunk));
    }
    const hwpxBuf = Buffer.concat(hwpxChunks);
    const hwpxZip = await JSZip.loadAsync(hwpxBuf);
    const secXml = await hwpxZip.file("Contents/section0.xml")!.async("string");
    expect(secXml).toContain("DOCX to HWPX Browser E2E");
  });
});
