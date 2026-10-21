# 12. Unresolved Risks, Platform Constraints & Technical Mitigations

## 1. Overview of Platform Constraints

While Phase 30 resolves the critical Word automation lifecycle bugs and substantially elevates visual fidelity, certain platform constraints inherent to Microsoft Word and Hancom Office remain. This report catalogs these items transparently with their associated mitigations.

---

## 2. Risk Matrix

### Risk 1: Microsoft Word for Mac Execution Latency
- **Nature**: Word for Mac is a heavy desktop application. Launching Word and opening a document via AppleScript takes approximately 1.0 to 1.8 seconds, with an additional 0.8 seconds for PDF export.
- **Impact**: Batch conversion of hundreds of small Figma components sequentially through Word automation would be time-consuming.
- **Mitigation**:
  - Word automation is used primarily for offline regression benchmarking and visual validation rather than end-user interactive exports.
  - End-user DOCX generation remains instant (<50ms) because it operates purely in memory using JSZip and OpenXML strings without launching Word.

### Risk 2: Absence of Headless Hancom Office CLI on macOS
- **Nature**: Hancom Office (한글) does not provide a native AppleScript automation API or a headless CLI renderer on macOS. Direct programmatic export from HWPX to PDF/PNG on macOS is therefore not officially supported by Hancom.
- **Impact**: Visual pixel regression for HWPX currently relies on structural XML validation against KS X 6101 rather than automated native Hancom rendering.
- **Mitigation**:
  - HWPX packages are validated structurally via comprehensive schema and unit tests (`tests/phase30-production-fidelity.test.ts` Test 6 & 9).
  - A Windows runner with Hancom Automation API (HwpCtrl) can be plugged into the visual pipeline for Windows-based CI/CD environments.

### Risk 3: Figma Cloud Token Dependency for Live Production Assets
- **Nature**: Comparing rendered Word documents directly against Figma's cloud render engine requires a valid `FIGMA_ACCESS_TOKEN` and internet access.
- **Impact**: Without this token, pixel-by-pixel SSIM against Figma's proprietary renderer cannot be run in offline sandboxed environments.
- **Mitigation**:
  - The test framework uses synthetic vector benchmarks (`samples/phase30_comprehensive_synthetic_fixture.json`) with deterministic mathematical geometry.
  - The pipeline marks `cloudExportAvailable: false` with complete transparency rather than mocking falsified scores.

### Risk 4: Legacy VML vs Modern OpenXML DrawingML Blend Modes
- **Nature**: Word's absolute positioning of UI shapes relies on Vector Markup Language (VML). While VML supports basic drop shadows (`<v:shadow>`), rounded rectangles (`<v:roundrect>`), and image clipping, it lacks CSS `mix-blend-mode: multiply` and complex Gaussian blur filters.
- **Impact**: Extremely subtle gradient blends or layered blur effects in Figma must be flattened or approximated with solid opacity.
- **Mitigation**:
  - The parser accurately extracts layer opacity and solid shadow offsets. Complex multi-stop gradients are mapped to standard two-stop linear gradients.

---

## 3. Recommended Future Focus (Phase 31+)
1. **Parallelized Benchmarking**: Batch multiple documents in a single Word session to amortize application launch latency.
2. **Windows CI Harness**: Add a Windows GitHub Actions runner with Microsoft Office 365 and Hancom Office installed for continuous multi-platform rendering audits.
3. **DrawingML Modernization**: Investigate hybrid DrawingML/VML layouts for Office 365 builds while preserving backward compatibility.
