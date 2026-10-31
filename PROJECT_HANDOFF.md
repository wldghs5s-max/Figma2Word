# Project Handoff Document
## Figma2Word Verification & Engineering Architecture

**Version**: Phase 39.1 Stabilization  
**Repository**: `wldghs5s-max/Figma2Word`  
**Git Branch**: `master`  
**Target Git Head**: Post-Phase 39.1 commit  
**Audience**: AI Engineering Collaborators (ChatGPT, Codex, Gemini)

---

## 1. Architecture Overview

Figma2Word is a TypeScript tool designed to convert Figma designs into editable Microsoft Word (`.docx`) documents with high visual fidelity and native editability.

The conversion pipeline consists of three core layers:
1. **Source Parser (`src/canvas/parser/figmaCanvasParser.ts`)**:
   - Parses Figma JSON AST into an intermediate representation (`CanvasDocument`).
   - Normalizes page frames, geometry coordinates, autolayout, vector shapes, text runs, and image fills.
2. **Document Renderer (`src/renderer/docxRenderer.ts` & `src/canvas/renderer/docxCanvasRenderer.ts`)**:
   - Emits WordprocessingML (OpenXML) and VML/DrawingML shapes.
   - Generates editable paragraphs, textboxes, shapes, lines, and media relationships.
3. **Fidelity & Verification Engine (`src/fidelity/`)**:
   - `verificationVerdict.ts`: Canonical single approval gate contract with fail-closed policy and OS process exit code enforcement.
   - `objectTraceability.ts`: Item-level source-to-Word object mapping and content verification.
   - `layoutStabilityAuditor.ts`: Masked layout stability testing ensuring edits to document elements cause zero collateral alteration to unedited regions.
   - `integrityGate.ts`: Provenance, disk file byte SHA-256 validation, and mathematical sanity checks.
   - `sectionPageMapper.ts`: Unified section-to-rendered page mapping.

---

## 2. Operational Features & Current Capabilities

### Fully Operational Features
- **Figma JSON to Canvas IR**: Multi-page and multi-screen isolation, autolayout calculation, text style run extraction.
- **DOCX Generation**: Native OpenXML packaging via JSZip, paragraph styling, shape/textbox rendering, media inclusion.
- **Web Canvas UI (`apps/web`)**: Client-side preview and conversion without external server dependencies.
- **Fail-Closed Verification Engine**: Single approval contract (`evaluateFinalVerdict`) where any missing gate, unverified state, or corrupted hash terminates the process with OS exit code 1.
- **Child Process Exit Code Enforcement**: Guaranteed fail-closed exit codes tested via real child process execution.
- **Exact Text Content Matching**: Strips XML entities, concatenates multiple text runs, normalizes whitespace, and verifies exact string containment.
- **Precision Layout Stability Taxonomy**: Distinguishes between visual regressions, uninspected coverage, dimension mismatches, and stable regions.

### Unverified / In-Progress Features
- **HWPX Output Engine**: Out of scope for this stabilization phase; architecture supports future IR-to-HWPX mapping.
- **Word Native Table Generation**: Layouts currently emit structured VML/DrawingML card groups rather than native Word tables.

---

## 3. Defect Remediation Status

### Remediated in Phase 39 & 39.1
- **P0-01 (Process Exit Code)**: Process exit code 0 on failed verdict eliminated. OS exit code 1 strictly enforced via `process.exitCode = finalVerdict.exitCode;`. Required gate set completeness validated.
- **P0-02 (Object Traceability Content Check)**: Permissive `<w:t` fallback removed. Exact text extraction, multi-run unescaping, and real OOXML relationship validation implemented. 238 unresolved objects classified.
- **P1-01 (Layout Stability Taxonomy)**: Masked layout stability explicitly categorizes `INSUFFICIENT_INSPECTION_COVERAGE` (<5% inspected pixels) separate from `LAYOUT_REGRESSION_DETECTED`. Page 11 isolated as adjacent inline overflow (`ROOT_CAUSE_UNVERIFIED`).
- **P1-02 (Provenance & Measurement Separation)**: PNG byte SHA-256 byte validation enforced. `ABSOLUTE_FIGMA_TO_WORD` mode explicitly separated from comparative baseline benchmarks; artificial deltas prohibited.
- **P1-03 (Gate Summary Contradictions)**: Fixed summary generation so failed gates never report "Zero regressions".

### Remaining Issues for Future Phases
- **Renderer Geometry Resolution for 238 Unresolved Objects**:
  - 206 vector shapes in complex icons/lines need either grouping support or direct DrawingML path conversion.
  - 32 transparent container wrappers should be formally consolidated into parent layout frames.
- **Page 11 Inline Text Overflow**:
  - Inserting long test markers into small textboxes causes adjacent text re-flow in Word. Textbox overflow clipping or sizing policy needs refinement in Word renderer.
- **Full-Page Background Masking on Pages 6, 7, 10**:
  - Full-page background shapes cover 95-100% of the page when edited in Word edit tests. Edit testing strategy should target foreground textboxes rather than full-page background fills to allow stability inspection of the remaining page area.

---

## 4. Current Customer Benchmark Summary (Baseline Ground Truth)

- **Source File**: `펜테크 3차 디자인.json` (SHA-256: `390e774379c9ff9bdc72e0b1918c557e9ea9f3128662692456f8e84a82e0527a`)
- **Target Frames Evaluated**: 17 frames
- **Reference PNGs**: 16 frames
- **Word PDF Rendering**: 17 pages rendered via Word COM 16.0
- **Visual Fidelity**: Mean SSIM ~0.9484
- **Object Coverage**:
  - Total source nodes: 2,033
  - Intentionally omitted layout containers: 721
  - Canvas IR elements: 1,312
  - DOCX OpenXML shapes resolved: 1,074
  - Unresolved in DOCX: 238
- **Customer Production Quality Verdict**: `FAILED` (Fail-closed due to 238 unresolved objects and layout stability constraints).
- **Verification Engine Health**: 100% PASSING on all failure injection and regression test suites.

---

## 5. Known 238 Unresolved Objects Classification

| Category | Count | Description | Action Required |
| :--- | :--- | :--- | :--- |
| **ACTUAL_MISSING** | 0 | Renderable standalone elements dropped without trace | None detected |
| **MERGED_INTO_PARENT** | 0 | Formally proven as merged into parent | Requires OpenXML tag proof before claiming |
| **MULTI_OBJECT_DECOMPOSED** | 0 | Split across multiple sub-shapes | Fully traceable |
| **INTENTIONAL_OMISSION** | 0 | Structural wrappers (counted in 721 omitted) | Fully traceable |
| **MAPPING_FAILURE** | 0 | Elements with unmapped identifiers | None |
| **UNSUPPORTED_TYPE** | 0 | Unsupported Figma node types | None |
| **UNRESOLVED** | 238 | Elements present in IR but lacking matching OpenXML evidence in DOCX XML | Strict fail-closed unresolved target for future renderer optimization |
| **Total Unresolved in DOCX** | **238** | Verified gap between IR and DOCX XML | Fail-closed gate failure (Correct behavior) |

---

## 6. Layout Stability Page Diagnostics

- **Page 6**: Status `INSUFFICIENT_INSPECTION_COVERAGE` (0 inspected pixels; full-page background shape edited).
- **Page 7**: Status `INSUFFICIENT_INSPECTION_COVERAGE` (4.07% inspected pixels, below 5% minimum; large background shape edited).
- **Page 10**: Status `INSUFFICIENT_INSPECTION_COVERAGE` (0 inspected pixels; full-page background shape edited).
- **Page 11**: Status `LAYOUT_REGRESSION_DETECTED` (0.387% mismatch outside edited mask; horizontal strip at X:104-345 Y:23-34 due to inline text re-flow next to edited textbox; diagnostic: `ROOT_CAUSE_UNVERIFIED`).

---

## 7. Recommended Next Steps

1. **Phase 40 Renderer Hardening**:
   - Add `alt="<nodeId>"` to all rendered card shapes in `src/canvas/renderer/docxCanvasRenderer.ts` to resolve the 32 container mapping failures.
   - Refine vector shape rendering to emit standalone DrawingML paths for the 206 merged vector lines.
2. **Word Edit Automation Refinement**:
   - In `tools/visual-regression/windows_word_edit_test.ps1`, avoid editing full-page background fills (`VML_SHAPE_FILL_COLOR` with width > 800pt) so Pages 6, 7, and 10 retain >50% unmasked inspection area.

---

## 8. Essential Commands

```bash
# 1. Run all tests
npx vitest run

# 2. Run Phase 39.1 dedicated verification tests
npx vitest run tests/phase39-1-exit-code.test.ts tests/phase39-1-content-verification.test.ts tests/phase39-1-layout-stability.test.ts tests/phase39-1-integrity-gate.test.ts tests/phase39-1-report-consistency.test.ts

# 3. TypeScript type checks
npx tsc --noEmit
npx tsc -p tsconfig.scripts.json --noEmit

# 4. Web app build
npm --prefix apps/web run build

# 5. Production customer pipeline
npx tsx scripts/run_phase39_production_pipeline.ts
```

