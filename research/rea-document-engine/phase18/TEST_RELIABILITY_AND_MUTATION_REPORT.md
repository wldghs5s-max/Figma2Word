# Phase 18: Test Reliability & Mutation Report (`TEST_RELIABILITY_AND_MUTATION_REPORT.md`)

**Mission**: Figma2Word — Phase 18 Argon Deep Engineering Mission  
**Scope**: Audit of Weak/Superficial Tests, New Semantic & DOM-Level Assertions (`tests/phase18-architecture-fidelity.test.ts`), and Counter-Example / Mutation Sensitivity Proofs.

---

## 1. Weak Tests Identified & Strengthened in Phase 18

During our audit of existing tests (`tests/phase16-*.test.ts` and `tests/phase17-quality-integration.test.ts`), we found several tests that checked only file existence or `elements.length > 0` without verifying semantic correctness:

| Test File | Prior Weak Assertion | Defect That Previously Escaped | Phase 18 Strengthened Assertion |
| :--- | :--- | :--- | :--- |
| [`tests/phase17-quality-integration.test.ts`](file:///c:/Users/77/Documents/Figma2Word/tests/phase17-quality-integration.test.ts) | Checked only `doc.pages.length > 0` and `doc.pages[0].elements.length > 0` on `sample-a-proposal-doc.json` | Passed when `elements.length === 2` even though **all 4 Korean text elements and the cropped illustration were dropped** due to missing child `absoluteBoundingBox` in Auto-Layout! | Asserts `elements.length >= 6`, `textElements.length >= 4`, and verifies Korean title (`"2026 차세대 엔터프라이즈 AI 자동화 구축 제안서"`) & subtitle (`"1. 핵심 기대 효과 및 도입 타당성"`) inside both `word/document.xml` and `Contents/section0.xml` |
| [`tests/phase16-1-remediation.test.ts`](file:///c:/Users/77/Documents/Figma2Word/tests/phase16-1-remediation.test.ts) | Expected open subpath `M 0 0 L 50 50 L 100 0` to emit `<hp:polygon>` in HWPX | `<hp:polygon>` in KS X 6101 is always closed by Hancom Office, drawing a spurious closing line from `(100,0)` to `(0,0)` | Updated to assert native `<hp:line>` segments for open subpaths (`!sp.closed`) and `<hp:polygon>` only for closed subpaths (`sp.closed === true`), plus `filled="f"` in DOCX VML |
| [`e2e/web-ui.spec.ts`](file:///c:/Users/77/Documents/Figma2Word/e2e/web-ui.spec.ts) | Checked only that downloaded buffer length `> 1000` and contained `"w:document"` | Missed that `extractSelectableFrames` in `src/pipeline/index.ts` failed on `DOCUMENT -> FRAME` fixtures (`complex-nested-dashboard.json`), causing the Web UI to export a Landscape dashboard as Portrait! | Inspects downloaded DOCX XML for `w:orient="landscape"` and HWPX XML for `landscape="WIDELY"`, and tests multi-page frame selection (`E2E-4`), corrupt JSON error alerts (`E2E-5`), and `DOCX -> HWPX` browser roundtrip (`E2E-6`) |

---

## 2. New Phase 18 Test Suite (`tests/phase18-architecture-fidelity.test.ts`)

We created [`tests/phase18-architecture-fidelity.test.ts`](file:///c:/Users/77/Documents/Figma2Word/tests/phase18-architecture-fidelity.test.ts) with 9 deep end-to-end architectural and mutation tests:

1. **Mixed Orientation Background Geometry & Roundtrip (`B-1`, `B-6`)**:
   - Verifies Portrait Page 1 (`width:595.28pt;height:841.89pt`) and Landscape Page 2 (`width:841.89pt;height:595.28pt`) background rects in DOCX (`id="bg_1"`, `id="bg_2"`) and HWPX (`59528 × 84189` and `84189 × 59528`).
   - Roundtrips the generated DOCX through `DocxCanvasParser` → `HwpxCanvasRenderer` and verifies 2 pages, exact orientations, background colors, and text survival.
2. **Typography & Textbox Fidelity (`B-4`)**:
   - Verifies explicit `lineHeightPx` (`w:line="432" w:lineRule="exact"` in DOCX; `<hh:lineSpacing type="FIXED" value="2160" unit="HWPUNIT"/>` in HWPX), `letterSpacing` (`<w:spacing w:val="30"/>` in DOCX; `<hh:spacing hangul="8" latin="8"/>` in HWPX), `underline`, `strikethrough`, `innerPaddingPt` (`inset` and `<hp:textMargin>`), CJK auto-space suppression (`<w:autoSpaceDE w:val="0"/>`), and `INTRINSIC_%` auto line-height handling.
3. **Image Scale Modes (`FILL`, `FIT`, `CROP`) (`B-2`)**:
   - Verifies `CROP` `imageTransform` matrix extraction and emission (`cropleft="16384f" croptop="6554f" cropright="16384f" cropbottom="19661f"` in DOCX; `<hp:imgClip left="3750" right="11250" top="750" bottom="5250"/>` in HWPX) and `FIT` aspect-ratio letterboxing (`height=100pt`, `margin-top=50pt`).
4. **Donut Chart `ELLIPSE` `arcData` & Vector Geometry (`B-3`)**:
   - Verifies `ELLIPSE` with `arcData` converts into a cubic Bezier `vector` element (`c` commands in VML, `<hp:polygon>` with `>= 16` sampled points in HWPX).
   - Verifies multi-subpath VML vectors do not emit premature `e` commands (`!vml.includes("x e m")`).
   - Verifies all 4 KPI Donut Chart segments on Page 4 of `Report1-Live-Snapshot.json` (`1:320..1:323`) are converted into `vector` elements with cubic Bezier curves.
5. **Corrupt Input Handling, Auto-Layout Synthesis & Mutation Sensitivity (`E-1`, `E-3`)**:
   - Verifies descriptive errors on `null` or invalid Figma JSON and corrupt DOCX archives.
   - Verifies `synthesizeMissingChildBounds` and single-page section `CANVAS` aggregation on `sample-b-nested-autolayout.json` and `sample-e2e-card-grid.json`.
   - Explicitly proves that mutated/broken outputs (`"x e m"` in VML, `<hp:polygon>` on open path, `<v:oval>` on donut chart) fail the validation predicates.
