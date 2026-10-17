# Phase 18: Browser & CLI E2E Report (`BROWSER_AND_CLI_E2E_REPORT.md`)

**Mission**: Figma2Word — Phase 18 Argon Deep Engineering Mission  
**Scope**: Real Chromium Browser Playwright E2E Verification (`e2e/web-ui.spec.ts`) and Node.js CLI End-to-End Verification (`src/cli.ts`).

---

## 1. Playwright Real-Browser E2E Suite (`6 / 6 PASS`)

We expanded [`e2e/web-ui.spec.ts`](file:///c:/Users/77/Documents/Figma2Word/e2e/web-ui.spec.ts) from 4 basic tests to **6 comprehensive real-Chromium scenarios** testing preset conversion, format filtering, landscape XML verification, multi-page frame selection, invalid/corrupt JSON error alerts, and browser `DOCX → HWPX` direct conversion.

### 1.1 Playwright Execution Summary

- **Command**: `npx playwright test`
- **Browser Engine**: Chromium (`Desktop Chrome`, `1280 × 800`)
- **Web Server**: `npm --prefix apps/web run preview -- --port 4173 --host 127.0.0.1`
- **Result**: **6 / 6 PASS (`4.5s`)**

| Test ID | Scenario Description | Key Verifications Performed | Duration | Status |
| :--- | :--- | :--- | :---: | :---: |
| **E2E-1** | Preset fixture load & dual conversion (`DOCX + HWPX`) | Clicks `"1. 단일 메모 (Brief)"`, runs dual conversion, verifies `"상태: 변환 성공 (Canvas 듀얼 엔진, BOTH)"` and all 3 download buttons visible | `495 ms` | **PASS** |
| **E2E-2** | Format filtering (`HWPX only` and `DOCX only`) | Toggles `"HWPX (한글)"` and `"DOCX (Word)"` format buttons, verifies only the requested format download button is rendered | `527 ms` | **PASS** |
| **E2E-3** | Complex landscape dashboard conversion & downloaded XML inspection | Selects `"6. 중첩 대시보드 (Dashboard)"`, intercepts both `.docx` and `.hwpx` downloads, unzips in-memory, and asserts `w:orient="landscape"` in `word/document.xml` and `landscape="WIDELY"` in `Contents/section0.xml` | `590 ms` | **PASS** |
| **E2E-4** | Multi-page JSON upload & selective frame export | Uploads `multi-page-report.json`, verifies `"변환 대상 프레임 (3 / 3개 선택됨)"`, clicks `"선택 해제"` (`0 / 3`), checks only Frame 1 (`1 / 3`), converts, downloads `.hwpx`, and verifies `Contents/section0.xml` contains 1 page (`!secXml.includes('pageBreak="1"')`) | `502 ms` | **PASS** |
| **E2E-5** | Corrupt & non-Figma JSON error handling | Uploads malformed JSON (`{ invalid json `) and verifies `"JSON 파일 읽기 실패:"` alert; uploads non-Figma JSON (`{ "hello": "world" }`) and verifies `"유효한 Figma 노드 구조"` alert | `279 ms` | **PASS** |
| **E2E-6** | Direct `DOCX → HWPX` conversion in browser | Switches to `"🔄 DOCX → HWPX 직접 변환"` tab, uploads an in-memory `.docx` buffer, verifies `"DOCX → HWPX 직접 변환 성공"`, downloads `.hwpx`, and verifies text survival (`"DOCX to HWPX Browser E2E"`) in `Contents/section0.xml` | `398 ms` | **PASS** |

> [!TIP]
> Real Defect Caught by `E2E-3` and `E2E-4`:
> Prior to Phase 18, `extractSelectableFrames()` and `filterFigmaNodeByFrames()` in [`src/pipeline/index.ts`](file:///c:/Users/77/Documents/Figma2Word/src/pipeline/index.ts) assumed `DOCUMENT` nodes always had intermediate `CANVAS` children (`DOCUMENT -> CANVAS -> FRAME`). For synthetic fixtures structured as `DOCUMENT -> FRAME` (`complex-nested-dashboard.json`, `multi-page-report.json`), `extractSelectableFrames()` mistakenly extracted the inner shapes of the first frame as selectable frames, causing `FigmaCanvasParser` in the Web UI to fall back to a default Portrait page! Fixing `extractSelectableFrames()` and `filterFigmaNodeByFrames()` to handle both `DOCUMENT -> CANVAS -> FRAME` and `DOCUMENT -> FRAME` hierarchies resolved both `E2E-3` and `E2E-4`.

---

## 2. Node.js CLI End-to-End Verification (`src/cli.ts`)

- **Command**:
  ```powershell
  npx tsx src/cli.ts samples/real-world/sample-a-proposal-doc.json --output debug/phase18-com/cli-proposal.docx --engine canvas --format both
  ```
- **Verified Behavior**:
  - Generates both `cli-proposal.docx` and `cli-proposal.hwpx` via `CanvasPipeline` in `27ms` (`Pages=1 | Elements=8 | Resources=1`).
  - Preserves all 8 elements (including synthesized Auto-Layout Korean text boxes and cropped image).
  - Tested alongside existing CLI integration tests (`tests/phase16-e2e-scenarios.test.ts`).
