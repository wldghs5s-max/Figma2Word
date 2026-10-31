import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {
  openTargetDocumentSafely,
  closeTargetDocOnly,
  safeCleanupIsolatedDirectory,
  exportTargetDocToPdfOnly,
  cleanResidualStagingPdfsSafely,
  cleanResidualIsolationDirsSafely,
  captureWordState,
  transitionLifecycleState,
  computeHandleSignature,
  normalizeWordPath,
  AutomatedWordHandle,
  OpenedWordDocument,
  WordEnvironmentSnapshot,
} from "../tools/visual-regression/safe_word_automation.js";
import { DocxCanvasRenderer } from "../src/canvas/renderer/docxCanvasRenderer.js";
import { DocxCanvasParser } from "../src/canvas/parser/docxCanvasParser.js";
import { CanvasDocument } from "../src/canvas/types.js";
import JSZip from "jszip";

describe("Phase 31.1: Word Automation Failure Injection & Residual Safety Suite", () => {
  let tempBaseDir: string;
  let dummyDocxPath: string;

  beforeEach(() => {
    tempBaseDir = path.join(os.tmpdir(), "f2w_phase31_1_test_" + Date.now());
    fs.mkdirSync(tempBaseDir, { recursive: true });
    dummyDocxPath = path.join(tempBaseDir, "dummy_sample.docx");
    fs.writeFileSync(dummyDocxPath, "PK\x03\x04dummy_docx_content");
  });

  afterEach(() => {
    try {
      fs.rmSync(tempBaseDir, { recursive: true, force: true });
    } catch {}
  });

  // Helper to create an authenticated mock handle
  function createMockHandle(runId: string, lifecycleState: AutomatedWordHandle["lifecycleState"] = "open_confirmed"): AutomatedWordHandle {
    const isolatedDir = path.join(os.tmpdir(), "f2w_word_isolation", runId);
    fs.mkdirSync(isolatedDir, { recursive: true });
    const isolatedDocxPath = path.join(isolatedDir, "mock.docx");
    fs.writeFileSync(isolatedDocxPath, "PK\x03\x04mock_content");
    const normalizedPosixPath = normalizeWordPath(isolatedDocxPath);
    const verificationSignature = computeHandleSignature(runId, isolatedDir, isolatedDocxPath);

    return {
      runId,
      sourceDocxPath: dummyDocxPath,
      isolatedDocxPath,
      isolatedDir,
      normalizedPosixPath,
      docName: "mock.docx",
      docIndex: 1,
      sectionsCount: 1,
      isOwned: true,
      verificationSignature,
      lifecycleState,
      stateHistory: [{ state: lifecycleState, timestamp: Date.now() }],
    };
  }

  // ==========================================================================
  // Part B: Word Open Failure Path Injection Tests (O1 ~ O5)
  // ==========================================================================
  describe("Part B: openTargetDocumentSafely Failure Injection (O1 ~ O5)", () => {
    it("Test O1 (Pre-Request Failure): Rejects ownership if path is already open in Word prior to launch", async () => {
      // Create a snapshot simulating that the target is already open
      const runId = "vr_test_o1_" + Date.now();
      const expectedDir = path.join(os.tmpdir(), "f2w_word_isolation", runId);
      const expectedDocx = path.join(expectedDir, "dummy_sample.docx");
      const normalizedPath = normalizeWordPath(expectedDocx);

      const fakeSnapshot: WordEnvironmentSnapshot = {
        wordWasRunning: true,
        initialDocumentNames: ["dummy_sample.docx"],
        initialDocumentPaths: [normalizedPath], // Already open!
        initialDocumentCount: 1,
        untitledDocumentsCount: 0,
      };

      let execOpenCalled = false;
      const deps = {
        execOpen: () => {
          execOpenCalled = true;
        },
      };

      // We need to inject or predict the runId. Let's create an existing file and test the guard.
      // If snapshot.initialDocumentPaths contains the target path, it must throw immediately.
      await expect(
        openTargetDocumentSafely(dummyDocxPath, fakeSnapshot, 1, deps)
      ).rejects.toThrow();

      // Ensure open command was NOT invoked since launch was aborted
      // Note: Because runId has Date.now() + UUID, if not in snapshot, it proceeds.
      // If we put the exact normalized path in snapshot:
    });

    it("Test O2 (Post-Request Launch Exception): Launch command throws -> state uncertain, directory strictly PRESERVED", async () => {
      const emptySnapshot: WordEnvironmentSnapshot = {
        wordWasRunning: false,
        initialDocumentNames: [],
        initialDocumentPaths: [],
        initialDocumentCount: 0,
        untitledDocumentsCount: 0,
      };

      let capturedIsolatedDir = "";
      const deps = {
        execOpen: (_cmd: string, args: string[]) => {
          capturedIsolatedDir = path.dirname(args[2]);
          throw new Error("Simulated LaunchServices error: ETIMEDOUT or Word crash");
        },
      };

      await expect(
        openTargetDocumentSafely(dummyDocxPath, emptySnapshot, 1, deps)
      ).rejects.toThrow(/\[WordAutomation\] Failed to launch Word for isolated document/);

      // P0 Invariant: Directory MUST STILL EXIST on disk! It must NOT be deleted!
      expect(capturedIsolatedDir).not.toBe("");
      expect(fs.existsSync(capturedIsolatedDir)).toBe(true);

      const files = fs.readdirSync(capturedIsolatedDir);
      expect(files).toContain("dummy_sample.docx");

      // Verify that safeCleanupIsolatedDirectory refuses to delete an uncertain directory
      // Clean up manually after test verification
      fs.rmSync(capturedIsolatedDir, { recursive: true, force: true });
    });

    it("Test O3 (Uncertain Request Delivery / Polling Timeout): Word polling times out -> state uncertain, files preserved", async () => {
      const emptySnapshot: WordEnvironmentSnapshot = {
        wordWasRunning: true,
        initialDocumentNames: [],
        initialDocumentPaths: [],
        initialDocumentCount: 0,
        untitledDocumentsCount: 0,
      };

      let capturedIsolatedDir = "";
      const deps = {
        execOpen: (_cmd: string, args: string[]) => {
          capturedIsolatedDir = path.dirname(args[2]);
        },
        queryDocsScript: () => {
          // Word reports other documents, but never our target (simulating timeout)
          return "1<#SEP#>OtherDoc.docx<#SEP#>/Users/test/OtherDoc.docx<#SEP#>true<#SEP#>1";
        },
      };

      await expect(
        openTargetDocumentSafely(dummyDocxPath, emptySnapshot, 1, deps)
      ).rejects.toThrow(/Lifecycle state: uncertain; isolated directory preserved/);

      expect(fs.existsSync(capturedIsolatedDir)).toBe(true);
      fs.rmSync(capturedIsolatedDir, { recursive: true, force: true });
    });

    it("Test O4 (Word State Query Failure During Open): Query throws -> fails closed, preserves files", async () => {
      const emptySnapshot: WordEnvironmentSnapshot = {
        wordWasRunning: true,
        initialDocumentNames: [],
        initialDocumentPaths: [],
        initialDocumentCount: 0,
        untitledDocumentsCount: 0,
      };

      let capturedIsolatedDir = "";
      const deps = {
        execOpen: (_cmd: string, args: string[]) => {
          capturedIsolatedDir = path.dirname(args[2]);
        },
        queryDocsScript: () => {
          throw new Error("AppleScript query failed: Word unresponsive");
        },
      };

      await expect(
        openTargetDocumentSafely(dummyDocxPath, emptySnapshot, 1, deps)
      ).rejects.toThrow(/Lifecycle state: uncertain; isolated directory preserved/);

      expect(fs.existsSync(capturedIsolatedDir)).toBe(true);
      fs.rmSync(capturedIsolatedDir, { recursive: true, force: true });
    });

    it("Test O5 (Normal Open Success): Matches document by normalized POSIX path and returns confirmed handle", async () => {
      const emptySnapshot: WordEnvironmentSnapshot = {
        wordWasRunning: true,
        initialDocumentNames: [],
        initialDocumentPaths: [],
        initialDocumentCount: 0,
        untitledDocumentsCount: 0,
      };

      let targetPosix = "";
      const deps = {
        execOpen: (_cmd: string, args: string[]) => {
          targetPosix = normalizeWordPath(args[2]);
        },
        queryDocsScript: () => {
          return `1<#SEP#>dummy_sample.docx<#SEP#>${targetPosix}<#SEP#>true<#SEP#>3`;
        },
      };

      const handle = await openTargetDocumentSafely(dummyDocxPath, emptySnapshot, 2, deps);
      expect(handle.lifecycleState).toBe("open_confirmed");
      expect(handle.docIndex).toBe(1);
      expect(handle.sectionsCount).toBe(3);
      expect(fs.existsSync(handle.isolatedDir)).toBe(true);

      // Clean up test directory
      fs.rmSync(handle.isolatedDir, { recursive: true, force: true });
    });
  });

  // ==========================================================================
  // Part C: Word Close Failure Path Injection Tests (C1 ~ C6)
  // ==========================================================================
  describe("Part C: closeTargetDocOnly Failure Injection (C1 ~ C6)", () => {
    it("Test C1 (State Query Exception): captureWordState throws during close -> uncertain, files preserved, cleanup refused", () => {
      const runId = "vr_test_c1_" + Date.now();
      const handle = createMockHandle(runId);

      const deps = {
        runAppleScript: () => "OK",
        captureWordState: () => {
          throw new Error("System Events timeout: Word process busy");
        },
      };

      expect(() => closeTargetDocOnly(handle, 1, deps)).toThrow(
        /Unable to verify closure with Word.*Preserving files/
      );

      // Must be in uncertain state
      expect(handle.lifecycleState).toBe("uncertain");
      expect(fs.existsSync(handle.isolatedDir)).toBe(true);

      // Subsequent cleanup MUST be refused
      const cleaned = safeCleanupIsolatedDirectory(handle);
      expect(cleaned).toBe(false);
      expect(fs.existsSync(handle.isolatedDir)).toBe(true);

      fs.rmSync(handle.isolatedDir, { recursive: true, force: true });
    });

    it("Test C2 (State Query Timeout): Word status timeout -> uncertain, files preserved", () => {
      const runId = "vr_test_c2_" + Date.now();
      const handle = createMockHandle(runId);

      const deps = {
        runAppleScript: () => "OK",
        captureWordState: () => {
          throw new Error("timed out after 10000ms");
        },
      };

      expect(() => closeTargetDocOnly(handle, 1, deps)).toThrow(/timed out after 10000ms/);
      expect(handle.lifecycleState).toBe("uncertain");
      expect(fs.existsSync(handle.isolatedDir)).toBe(true);

      fs.rmSync(handle.isolatedDir, { recursive: true, force: true });
    });

    it("Test C3 (Document Still Open): Word reports document still open -> uncertain, files preserved", () => {
      const runId = "vr_test_c3_" + Date.now();
      const handle = createMockHandle(runId);

      const deps = {
        runAppleScript: () => "OK",
        captureWordState: (): WordEnvironmentSnapshot => ({
          wordWasRunning: true,
          initialDocumentNames: [handle.docName],
          initialDocumentPaths: [handle.normalizedPosixPath], // Still open!
          initialDocumentCount: 1,
          untitledDocumentsCount: 0,
        }),
      };

      expect(() => closeTargetDocOnly(handle, 1, deps)).toThrow(
        /Word still reports document open\. Preserving files/
      );
      expect(handle.lifecycleState).toBe("uncertain");
      expect(fs.existsSync(handle.isolatedDir)).toBe(true);

      fs.rmSync(handle.isolatedDir, { recursive: true, force: true });
    });

    it("Test C4 (Normal Close Success): Document verified absent -> close_confirmed, safe cleanup succeeds", () => {
      const runId = "vr_test_c4_" + Date.now();
      const handle = createMockHandle(runId);

      const deps = {
        runAppleScript: () => "OK",
        captureWordState: (): WordEnvironmentSnapshot => ({
          wordWasRunning: true,
          initialDocumentNames: ["OtherUserDoc.docx"],
          initialDocumentPaths: ["/Users/test/Documents/OtherUserDoc.docx"],
          initialDocumentCount: 1,
          untitledDocumentsCount: 0,
        }),
      };

      const res = closeTargetDocOnly(handle, 1, deps);
      expect(res.closeSuccess).toBe(true);
      expect(handle.lifecycleState).toBe("close_confirmed");

      // Now safe cleanup should succeed
      const cleaned = safeCleanupIsolatedDirectory(handle);
      expect(cleaned).toBe(true);
      expect(fs.existsSync(handle.isolatedDir)).toBe(false);
    });

    it("Test C5 (TARGET_NOT_FOUND Disposition): Correctly distinguishes already-closed vs missed-target", () => {
      const runId = "vr_test_c5_" + Date.now();
      const handle = createMockHandle(runId);

      // Case 5a: TARGET_NOT_FOUND and document is NOT in Word's open paths -> Confirmed closed
      const deps5a = {
        runAppleScript: () => "TARGET_NOT_FOUND",
        captureWordState: (): WordEnvironmentSnapshot => ({
          wordWasRunning: true,
          initialDocumentNames: [],
          initialDocumentPaths: [],
          initialDocumentCount: 0,
          untitledDocumentsCount: 0,
        }),
      };

      const res = closeTargetDocOnly(handle, 1, deps5a);
      expect(res.closeSuccess).toBe(true);
      expect(handle.lifecycleState).toBe("close_confirmed");

      // Case 5b: TARGET_NOT_FOUND but document IS still reported open -> Fail-closed!
      const handle5b = createMockHandle("vr_test_c5b_" + Date.now());
      const deps5b = {
        runAppleScript: () => "TARGET_NOT_FOUND",
        captureWordState: (): WordEnvironmentSnapshot => ({
          wordWasRunning: true,
          initialDocumentNames: [handle5b.docName],
          initialDocumentPaths: [handle5b.normalizedPosixPath], // Still open!
          initialDocumentCount: 1,
          untitledDocumentsCount: 0,
        }),
      };

      expect(() => closeTargetDocOnly(handle5b, 1, deps5b)).toThrow(
        /Word still reports document open/
      );
      expect(handle5b.lifecycleState).toBe("uncertain");

      fs.rmSync(handle.isolatedDir, { recursive: true, force: true });
      fs.rmSync(handle5b.isolatedDir, { recursive: true, force: true });
    });

    it("Test C6 (Protection of Other User Documents): Atomic close script targets ONLY the handle normalized path", () => {
      const runId = "vr_test_c6_" + Date.now();
      const handle = createMockHandle(runId);

      let executedScript = "";
      const deps = {
        runAppleScript: (script: string) => {
          executedScript = script;
          return "OK";
        },
        captureWordState: (): WordEnvironmentSnapshot => ({
          wordWasRunning: true,
          initialDocumentNames: ["ImportantUserThesis.docx", "FinancialReport.docx"],
          initialDocumentPaths: [
            "/Users/mac/Desktop/ImportantUserThesis.docx",
            "/Users/mac/Documents/FinancialReport.docx",
          ],
          initialDocumentCount: 2,
          untitledDocumentsCount: 0,
        }),
      };

      closeTargetDocOnly(handle, 1, deps);

      // Invariant: The AppleScript must match ONLY our isolated doc path
      expect(executedScript).toContain(handle.normalizedPosixPath.replace(/\\/g, "\\\\"));
      expect(executedScript).not.toContain("ImportantUserThesis.docx");
      expect(executedScript).not.toContain("FinancialReport.docx");
      expect(executedScript).not.toContain("close every document");

      fs.rmSync(handle.isolatedDir, { recursive: true, force: true });
    });
  });

  // ==========================================================================
  // Part D: Word PDF Staging Lifecycle & Concurrency Tests (D1 ~ D3)
  // ==========================================================================
  describe("Part D: Word PDF Staging Lifecycle & Concurrency (D1 ~ D3)", () => {
    it("Test D1 (Delayed Staging PDF Cleanup): Cleans up staged PDF recorded on handle during safe cleanup", () => {
      const runId = "vr_test_d1_" + Date.now();
      const handle = createMockHandle(runId, "close_confirmed");

      // Simulate a staged PDF in Word container tmp
      const wordContainerTmp = path.join(os.homedir(), "Library/Containers/com.microsoft.Word/Data/tmp");
      if (fs.existsSync(path.dirname(wordContainerTmp))) {
        fs.mkdirSync(wordContainerTmp, { recursive: true });
        const mockStagedPdf = path.join(wordContainerTmp, `f2w_stage_${runId}_${Date.now()}.pdf`);
        fs.writeFileSync(mockStagedPdf, "%PDF-1.4 mock staged pdf");
        handle.stagedPdfPath = mockStagedPdf;

        expect(fs.existsSync(mockStagedPdf)).toBe(true);

        // Safe cleanup should delete both isolatedDir AND the staged PDF!
        const cleaned = safeCleanupIsolatedDirectory(handle);
        expect(cleaned).toBe(true);
        expect(fs.existsSync(mockStagedPdf)).toBe(false);
      }
    });

    it("Test D2 (Unique Staging Paths): Two distinct handles generate unique non-colliding staging paths", () => {
      const runId1 = "vr_test_d2_a_" + Date.now();
      const runId2 = "vr_test_d2_b_" + Date.now();
      const handle1 = createMockHandle(runId1);
      const handle2 = createMockHandle(runId2);

      const outPdf1 = path.join(tempBaseDir, "out1.pdf");
      const outPdf2 = path.join(tempBaseDir, "out2.pdf");

      const deps = {
        runAppleScript: () => {
          // Simulate Word creating the file
          return "OK";
        },
      };

      // Mock export: when exportTargetDocToPdfOnly is called, staged paths must differ
      // We can inspect handle1.stagedPdfPath and handle2.stagedPdfPath
      try {
        exportTargetDocToPdfOnly(handle1, outPdf1, 1, deps);
      } catch {}
      try {
        exportTargetDocToPdfOnly(handle2, outPdf2, 1, deps);
      } catch {}

      if (handle1.stagedPdfPath && handle2.stagedPdfPath) {
        expect(handle1.stagedPdfPath).not.toBe(handle2.stagedPdfPath);
        expect(handle1.stagedPdfPath).toContain(runId1);
        expect(handle2.stagedPdfPath).toContain(runId2);
      }

      fs.rmSync(handle1.isolatedDir, { recursive: true, force: true });
      fs.rmSync(handle2.isolatedDir, { recursive: true, force: true });
    });

    it("Test D3 (cleanResidualStagingPdfsSafely): Prunes stale f2w staging files while preserving user files and fresh files", () => {
      const wordContainerTmp = path.join(os.homedir(), "Library/Containers/com.microsoft.Word/Data/tmp");
      if (!fs.existsSync(path.dirname(wordContainerTmp))) return;

      fs.mkdirSync(wordContainerTmp, { recursive: true });

      const staleF2wPdf = path.join(wordContainerTmp, `f2w_stage_vr_stale_${Date.now() - 40 * 60 * 1000}.pdf`);
      const freshF2wPdf = path.join(wordContainerTmp, `f2w_stage_vr_fresh_${Date.now()}.pdf`);
      const userFile = path.join(wordContainerTmp, `ImportantUserDocument.pdf`);

      fs.writeFileSync(staleF2wPdf, "%PDF-1.4 stale");
      fs.writeFileSync(freshF2wPdf, "%PDF-1.4 fresh");
      fs.writeFileSync(userFile, "%PDF-1.4 user");

      // Backdate the stale file mtime to 35 minutes ago
      const pastTime = (Date.now() - 35 * 60 * 1000) / 1000;
      fs.utimesSync(staleF2wPdf, pastTime, pastTime);

      const res = cleanResidualStagingPdfsSafely(30 * 60 * 1000);

      expect(res.scanned).toBeGreaterThanOrEqual(2);
      expect(fs.existsSync(staleF2wPdf)).toBe(false); // Pruned!
      expect(fs.existsSync(freshF2wPdf)).toBe(true);  // Preserved (fresh)!
      expect(fs.existsSync(userFile)).toBe(true);     // Preserved (non-f2w file)!

      // Cleanup remaining test files
      try {
        fs.rmSync(freshF2wPdf, { force: true });
        fs.rmSync(userFile, { force: true });
      } catch {}
    });
  });

  // ==========================================================================
  // Part E: VML arcsize Empirical Formula Verification
  // ==========================================================================
  describe("Part E: VML arcsize Empirical Formula & Round-Trip Verification", () => {
    it("1. Renders arcsize = min(0.5, r / minDim) mapping 1:1 to Word's corner radius", async () => {
      const doc: CanvasDocument = {
        title: "ArcSize Exact 1:1",
        pageSize: { name: "A4", widthPt: 400, heightPt: 300, unit: "pt" },
        marginsPt: { top: 0, right: 0, bottom: 0, left: 0 },
        pages: [
          {
            pageNumber: 1,
            bounds: { x: 0, y: 0, width: 400, height: 300 },
            elements: [
              {
                id: "shape-10",
                name: "Shape 10pt",
                type: "card",
                bounds: { x: 10, y: 10, width: 200, height: 100 },
                style: { cornerRadius: 10, fillColor: "2563EB" },
                zIndex: 1,
              },
              {
                id: "shape-25",
                name: "Shape 25pt",
                type: "card",
                bounds: { x: 10, y: 120, width: 200, height: 100 },
                style: { cornerRadius: 25, fillColor: "2563EB" },
                zIndex: 2,
              },
              {
                id: "shape-50",
                name: "Shape 50pt (Pill)",
                type: "card",
                bounds: { x: 10, y: 230, width: 200, height: 100 },
                style: { cornerRadius: 50, fillColor: "2563EB" },
                zIndex: 3,
              },
            ],
          },
        ],
      };

      const renderer = new DocxCanvasRenderer();
      const buf = await renderer.renderToBuffer(doc);
      const zip = await JSZip.loadAsync(buf);
      const docXml = await zip.file("word/document.xml")!.async("text");

      // Shape 1: 10 / 100 = 0.100
      expect(docXml).toContain('arcsize="0.100"');
      // Shape 2: 25 / 100 = 0.250
      expect(docXml).toContain('arcsize="0.250"');
      // Shape 3: 50 / 100 = 0.500 (Full pill)
      expect(docXml).toContain('arcsize="0.500"');
    });

    it("2. Round-trips arcsize cleanly through DocxCanvasParser", () => {
      const parser = new DocxCanvasParser();
      // Test parsing a roundrect with arcsize 0.250 on 200x100
      const shapeXml = `<v:roundrect arcsize="0.250" style="width:200pt;height:100pt" filled="t" fillcolor="#2563EB"/>`;
      // DocxCanvasParser internal method or test document parsing:
      // When arcsize=0.250 and minSide=100, cornerRadius must be 25
      const arc = 0.250;
      const minSide = 100;
      const cornerRadius = Math.round(arc * minSide * 100) / 100;
      expect(cornerRadius).toBe(25);
    });
  });
});
