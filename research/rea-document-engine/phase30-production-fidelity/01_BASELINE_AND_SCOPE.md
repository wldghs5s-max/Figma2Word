# 01. Baseline and Scope — Phase 30 Production Fidelity

## 1. Executive Summary & Project Baseline

**Project**: `Figma2Word` (Local Figma-to-Document Engine)  
**Parent Commit**: `cb97378df6439a9bf8c847c320c341615ca6840a` (Phase 29 completion)  
**Current Phase**: Phase 30 — Production Visual Fidelity & Automation Lifecycle Safety  
**Evaluation Environment**: macOS 15.6 (Darwin 25.6.0 arm64), Microsoft Word for Mac 16.114, Node.js v26.7.0, Swift 6.4

### Background & Motivation
In Phase 29, the Word automation safety architecture achieved significant milestones: isolation copying, HMAC-SHA256 signature verification, and atomic export/close scripts. However, an independent audit of Phase 29 identified key vulnerabilities and fidelity gaps:
1. **Word Lifecycle Uncertainty Under Timeout**: When polling for Word document readiness timed out, earlier logic risked leaving Word in an undefined state and cleaning up isolation files prematurely.
2. **Partial Automation Failures**: While AppleScript grouped export and close into one block, if export succeeded but close encountered an OS interruption, state tracking became desynchronized.
3. **Sandbox Write Constraints in macOS Word**: Word for Mac operates inside an Apple sandbox container (`~/Library/Containers/com.microsoft.Word/Data`). Direct export to arbitrary workspace paths triggered native OS modal access prompts (`파일 액세스 부여`), resulting in AppleScript error `-1708` or timeouts.
4. **Rendering Fidelity Gaps**:
   - Images with rounded corners lacked clipping inside Word VML, rendering as unclipped sharp rectangles.
   - Drop shadows were parsed in IR but lacked image-level VML rendering and HWPX `<hp:pic>` drop shadow support.
   - Korean typography suffered from Word's default CJK-Latin auto-spacing (`autoSpaceDE`/`autoSpaceDN`).
   - Button text labels with tight padding were susceptible to unwanted line wrapping.
5. **HWPX Compatibility & Truth Labeling**: HWPX required schema conformance to KS X 6101 with explicit HWPU coordinates, and metric reporting needed complete honesty regarding missing cloud tokens.

---

## 2. Phase 30 Scope & Deliverables

### P0: Word Automation Lifecycle & Partial Success Safety
- Implement a formal finite state machine (`DocumentLifecycleState`) tracking:
  `created` $\to$ `open_requested` $\to$ `open_confirmed` $\to$ `export_requested` $\to$ `exported` $\to$ `close_requested` $\to$ `close_confirmed`.
- On any polling timeout or unconfirmed state, transition explicitly to `uncertain` and **strictly preserve** the isolated directory on disk.
- Separate PDF export (`exportTargetDocToPdfOnly`) from document closure (`closeTargetDocOnly`), maintaining a backward-compatible wrapper.
- Introduce `cleanResidualIsolationDirsSafely` to safely prune orphaned runs older than a configurable threshold while strictly preserving directories associated with any currently open Word document.
- Resolve macOS sandboxing by staging PDF export through Word's native container directory (`~/Library/Containers/com.microsoft.Word/Data/tmp/`) and immediately moving the output to the target destination in Node.

### P1: Production Visual Fidelity (DOCX & HWPX)
- **Rounded Images**: Output `<v:roundrect arcsize="...">` containing `<v:imagedata>` so that Word natively clips images to rounded corners.
- **Image Borders & Shadows**: Support borders (`stroked="t"`, `strokecolor`, `strokeweight`) and drop shadows (`<v:shadow>`) on VML images and `<hp:pic>` in HWPX.
- **Typography Polish**: Enforce `<w:autoSpaceDE w:val="0"/>` and `<w:autoSpaceDN w:val="0"/>` across all Word paragraphs to prevent artificial character expansion in mixed CJK/Latin copy.
- **Line Height Defense**: Enforce `w:lineRule="atLeast"` to prevent clipping of ascenders/descenders on Korean web fonts (Pretendard).
- **Asymmetric Corners & Pill Buttons**: Maintain path-based VML geometry for asymmetric borders and `arcsize=0.500` for pill shapes.
- **HWPX KS X 6101 Compliance**: Full unit conversion ($1\text{ pt} = 100\text{ HWPU}$) and valid OWPML package generation.

### P2: Comprehensive Synthetic Fixture & E2E Verification
- Create `samples/phase30_comprehensive_synthetic_fixture.json` exercising all visual components: multi-column dashboard, Korean copy, pill badges, image cards with borders and shadows, dashed boxes, and oversized 22-inch frames.
- Execute the real native Word pipeline to generate authentic DOCX, Word PDF, and high-resolution PNGs via Swift PDFKit.
- Run complete regression testing across all 69 test files.

---

## 3. Explicit Non-Goals
- **No Cloud Figma API Mocking**: In the absence of `FIGMA_ACCESS_TOKEN`, no synthetic network calls or fabricated ground-truth scores are generated.
- **No SaaS or Cloud Deployment**: The project remains strictly a local toolchain optimized for macOS and Windows developer environments.
- **No Raster Replacement for Editable Word Elements**: Text and vector shapes remain 100% native Word OpenXML/VML elements rather than rasterized images.
