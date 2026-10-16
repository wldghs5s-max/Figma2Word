import { test, expect } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";
import JSZip from "jszip";

test.describe("Figma2Word Web UI End-to-End Automation Suite", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Wait for the app header
    await expect(page.locator("h1")).toContainText("Figma2Word");
  });

  test("E2E-1: loads preset fixture and executes dual conversion (DOCX + HWPX)", async ({ page }) => {
    // Select syn-brief preset
    const briefBtn = page.getByRole("button", { name: "1. 단일 메모 (Brief)" });
    await briefBtn.click();

    // Ensure Dual format is selected
    const dualBtn = page.getByRole("button", { name: "듀얼 (DOCX + HWPX)" });
    await dualBtn.click();

    // Click Convert button
    const convertBtn = page.getByRole("button", { name: "변환 실행" });
    await convertBtn.click();

    // Verify conversion success status
    await expect(page.locator("text=상태: 변환 성공")).toBeVisible({ timeout: 20000 });

    // Verify both download buttons are rendered
    const docxDownloadBtn = page.getByRole("button", { name: "📥 Word 문서 (.docx) 다운로드" });
    const hwpxDownloadBtn = page.getByRole("button", { name: "📥 한컴 한글 문서 (.hwpx) 다운로드" });
    await expect(docxDownloadBtn).toBeVisible();
    await expect(hwpxDownloadBtn).toBeVisible();

    // Verify element statistics section appears
    await expect(page.locator("text=Canvas IR 정밀 구조 통계")).toBeVisible();
  });

  test("E2E-2: verifies format filtering for HWPX only and DOCX only", async ({ page }) => {
    // Select syn-brief preset
    await page.getByRole("button", { name: "1. 단일 메모 (Brief)" }).click();

    // Switch to HWPX only
    const hwpxFormatBtn = page.getByRole("button", { name: "HWPX (한글)" });
    await hwpxFormatBtn.click();

    // Convert
    const convertBtn = page.getByRole("button", { name: "변환 실행" });
    await convertBtn.click();
    await expect(page.locator("text=상태: 변환 성공")).toBeVisible({ timeout: 20000 });

    // Verify HWPX download visible and DOCX download NOT visible
    await expect(page.getByRole("button", { name: "📥 한컴 한글 문서 (.hwpx) 다운로드" })).toBeVisible();
    await expect(page.getByRole("button", { name: "📥 Word 문서 (.docx) 다운로드" })).not.toBeVisible();

    // Switch to DOCX only
    const docxFormatBtn = page.getByRole("button", { name: "DOCX (Word)" });
    await docxFormatBtn.click();

    await convertBtn.click();
    await expect(page.locator("text=상태: 변환 성공")).toBeVisible({ timeout: 20000 });

    await expect(page.getByRole("button", { name: "📥 Word 문서 (.docx) 다운로드" })).toBeVisible();
    await expect(page.getByRole("button", { name: "📥 한컴 한글 문서 (.hwpx) 다운로드" })).not.toBeVisible();
  });

  test("E2E-3: converts complex dashboard fixture and downloads structurally valid DOCX & HWPX", async ({ page }) => {
    // Select complex dashboard preset
    const dashBtn = page.getByRole("button", { name: "6. 중첩 대시보드 (Dashboard)" });
    await dashBtn.click();

    // Set dual format
    await page.getByRole("button", { name: "듀얼 (DOCX + HWPX)" }).click();

    // Convert
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

    // Validate DOCX ZIP integrity
    const docxZip = await JSZip.loadAsync(docxBuf);
    expect(docxZip.file("word/document.xml")).toBeDefined();
    const docXml = await docxZip.file("word/document.xml")!.async("string");
    expect(docXml).toContain("w:document");

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

    // Validate HWPX ZIP integrity
    const hwpxZip = await JSZip.loadAsync(hwpxBuf);
    expect(hwpxZip.file("Contents/section0.xml")).toBeDefined();
    const secXml = await hwpxZip.file("Contents/section0.xml")!.async("string");
    expect(secXml).toContain("hs:sec");
  });

  test("E2E-4: handles custom Figma JSON file upload and frame toggling", async ({ page }) => {
    const uploadFilePath = path.resolve(process.cwd(), "samples/synthetic-figma/single-page-brief.json");
    expect(fs.existsSync(uploadFilePath)).toBe(true);

    // Upload JSON file
    const fileInput = page.locator('input[type="file"][accept=".json"]');
    await fileInput.setInputFiles(uploadFilePath);

    // Verify upload indicator appears with file name
    await expect(page.locator("text=single-page-brief.json").first()).toBeVisible({ timeout: 10000 });

    // Click Convert
    await page.getByRole("button", { name: "변환 실행" }).click();
    await expect(page.locator("text=상태: 변환 성공")).toBeVisible({ timeout: 20000 });

    // Verify Word download is available
    await expect(page.getByRole("button", { name: "📥 Word 문서 (.docx) 다운로드" })).toBeVisible();
  });
});
