# 06. Final Readiness Assessment & Established Invariants

## 1. Fulfillment of Phase 31.1 Core Requirements

| Requirement | Implementation & Proof | Status |
| :--- | :--- | :--- |
| **1. Prevent early deletion on Word open failure** | Removed `fs.rmSync` in `openTargetDocumentSafely` catch block. Preserves files when state is `'uncertain'`. Verified by Test O2. | **RESOLVED & VERIFIED** |
| **2. Full-lifecycle close failure injection** | Verified `closeTargetDocOnly` transitions to `'uncertain'`, throws, and preserves files when `captureWordState` throws. Verified by Tests C1~C6. | **RESOLVED & VERIFIED** |
| **3. PDF staging race condition & cleanup** | Unique `f2w_stage_${runId}` naming, staging path tracked on handle for cleanup, and `cleanResidualStagingPdfsSafely` garbage collector. Verified by Tests D1~D3. | **RESOLVED & VERIFIED** |
| **4. VML arcsize formula empirical proof** | Measured Word for Mac rendering with Swift PDFKit across 3 radii ($0.1, 0.25, 0.5$). Proved Word renders $R = \text{arcsize} \times \min$. Corrected formula to $\min(0.5, r/\min)$. | **RESOLVED & VERIFIED** |
| **5. Zero regression in existing test suite** | All 71 test files passed (463 passed, 2 skipped, 0 failed). | **RESOLVED & VERIFIED** |
| **6. Word native smoke test** | Word for Mac opened, exported PDF, closed target, and protected existing user documents. Card and overlay text visible. | **RESOLVED & VERIFIED** |

---

## 2. Established Lifecycle & Safety Invariants

1. **Strict Fail-Closed Rule**:
   - In Word automation, an unverified state is NEVER treated as success.
   - If document closure cannot be confirmed through Word's process query, the handle transitions to `'uncertain'` and file deletion on disk is unconditionally refused.
2. **Launch Dispatched = Files Preserved**:
   - Once a LaunchServices `open` request has been dispatched, the isolated directory is never deleted immediately if an error occurs. Word may asynchronously pick up the file; the files remain intact on disk.
3. **No Collision in Staging**:
   - Every staged PDF contains the unique `runId` with random UUID slice. Staged files never overwrite each other.
4. **Exact Geometric Mapping**:
   - VML `arcsize` now matches Word's actual geometric rendering 1:1 without $2\times$ distortion.

---

## 3. Remaining Opportunities for Future Phases (Phase 32+)

1. **Windows CI Hancom Headless Automation**:
   - Windows runner with Hancom Automation API (`HwpCtrl`) to enable native HWPX visual regression similar to Word for Mac.
2. **Cloud SSIM Pipeline**:
   - Automated Local Window SSIM comparison against Figma Cloud when `FIGMA_ACCESS_TOKEN` is supplied.
3. **Complex Gradient Fills**:
   - Advanced multi-stop linear and radial gradient fills in Word VML.
