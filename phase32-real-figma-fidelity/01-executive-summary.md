# Phase 32: Real Figma Fidelity Benchmark & Conversion Quality Improvement
## 01. Executive Summary

### 1. Overview & Objectives
Figma2Word translates real-world Figma design tokens and layouts into fully editable, natively compliant Microsoft Word (`.docx`) and Hancom Word Processor (`.hwpx`) documents via a Canonical Canvas IR pipeline.

In **Phase 32**, development shifted from synthetic test models to an **empirical high-fidelity benchmark on the real corporate design snapshot** (`펜테크 3차 디자인.json`, 187 MB) across all 17 target pages. The primary goals were:
1. **End-to-End Real Fidelity Measurement**: Directly benchmark the real Figma design against native Microsoft Word for Mac (v16.114) output.
2. **Word Automation Safety Hardening**: Eliminate residual pre-unlink TOCTOU risks and preserve in-flight staging PDFs during high-volume automation runs.
3. **Universal Quality Improvements**: Fix optical alignment drift on auto-width text, VML centered stroke bleed, and baseline clipping on vertically centered elements without sacrificing text editability.
4. **Complete Regression Verification**: Ensure zero regressions across the existing test suite while adding dedicated fidelity tests.

---

### 2. Key Metrics & Status Comparison

| Metric / Attribute | Phase 31.1 Baseline | Phase 32 Achieved | Delta / Impact |
| :--- | :--- | :--- | :--- |
| **Git Commit** | `78fd3d9` | *Pending Commit* | Phase 32 production upgrade |
| **Vitest Test Suites** | 71 test files | **72 test files** | +1 dedicated fidelity suite |
| **Vitest Test Cases** | 463 passed, 2 skipped, 0 failed | **469 passed, 2 skipped, 0 failed** | **+6 new tests, 100% pass rate** |
| **Real Design Pages** | 17 pages verified | **17 pages verified** | 100% coverage, 0 section collisions |
| **Word Native Sections** | 17 sections | **17 sections** | Exact 1:1 page-to-section mapping |
| **Generated DOCX Size** | 15.00 MB | **15.00 MB** | Full asset preservation |
| **Generated HWPX Size** | 15.04 MB | **15.04 MB** | Valid KS X 6101 package structure |
| **PDF Pages Rendered** | 17 pages | **17 pages** | Zero page overflow or clipping |
| **Optical Alignment Drift** | $\pm 1.5 \sim 3.0\text{ pt}$ right drift | **$0.000\text{ pt}$ (Invariant)** | Math-compensated center & right anchor |
| **VML Stroke Boundary Bleed** | $+0.5 \sim 1.0\text{ pt}$ bleed | **$0.000\text{ pt}$ (Zero bleed)** | Automatic bounding box inset for INSIDE strokes |
| **Single-Line Text Wrap** | Protected via `wordWrap="0"` | Protected + LineRule tuned | Descender clipping eliminated |
| **Word Automation Safety** | Polling timeout protected | Pre-unlink TOCTOU + staging lock | Fail-closed guarantees |
| **HWPX Native Visual** | NOT_VERIFIED (macOS) | **NOT_VERIFIED (macOS)** | Strict honest reporting maintained |

---

### 3. Core Achievements

1. **Automation Safety Guarantee (TOCTOU & Active Run Staging)**:
   - Added immediate pre-unlink TOCTOU query against Word's open document table (`captureWordState()`) inside `cleanResidualIsolationDirsSafely`.
   - Hardened `cleanResidualStagingPdfsSafely` to extract `runId` from staging PDFs and unconditionally preserve files belonging to active runs or uncertain Word states.
2. **Optical Alignment Invariance**:
   - Solved the optical shift caused by single-line width buffer expansion. When widening single-line textboxes to prevent Word DirectWrite font variance from wrapping, the renderer dynamically adjusts `x`:
     $$\Delta x = \begin{cases} -\frac{\text{buffer}}{2} & (\text{center-aligned}) \\ -\text{buffer} & (\text{right-aligned}) \\ 0 & (\text{left-aligned}) \end{cases}$$
   - Preserves the visual center and right anchor point down to the sub-point.
3. **VML Centered Stroke Inset Compensation**:
   - In VML, strokes are centered along the shape boundary path. For shapes with `strokeAlign: "INSIDE"` (Figma's default), the shape's bounding box is inset by `strokeWidth / 2`, ensuring the outer edge aligns exactly to Figma's outer boundary.
4. **Baseline Clipping Prevention on Centered Text**:
   - For single-line vertically centered text (`verticalAlign === "center"` and `isSingleLine === true`), Word's paragraph line rule is set to `w:lineRule="atLeast"` rather than rigid `exact`, eliminating descender clipping inside `v-text-anchor:middle`.
5. **Real 17-Page Word Rendering Proof**:
   - Native Microsoft Word for Mac (v16.114) exported all 17 pages to PDF. High-resolution pixel inspection via Swift CoreGraphics confirmed button text contrast (e.g. 496 text pixels on `캘린더 보기`, 224 white text pixels on `+ 신규 등록`).
