# Phase 19: Known Limitations & Structural Boundary Notes

## 1. Scope Boundaries of Phase 19

In strict accordance with the user's directive, Phase 19 prioritized **Figma to DOCX text fidelity** (fixing runaway text overflow and bottom glyph clipping) while stabilizing the existing architecture.

The following areas were intentionally bounded or deferred:

---

## 2. HWPX Engine Status (Deferred by User Decision)
- **Status**: Deferred. `src/canvas/renderer/hwpxCanvasRenderer.ts` was not modified in Phase 19.
- **Known Issue**: In recent Hangul (Hancom Office) Viewer versions, certain generated HWPX files may report a repair prompt due to strict schema validation differences in `<hh:charPr>` / `<hp:t>` element ordering and namespace attributes.
- **User Strategy**: Stabilize DOCX as production-grade first, preserve it as a baseline, and then execute a dedicated HWPX remediation phase.

---

## 3. Font Metric Variations across Client Environments
- **Local Font Availability**:
  - The document references Korean typography (`Pretendard`, `맑은 고딕`, `Malgun Gothic`).
  - If a user opens the DOCX on a system lacking these fonts, Microsoft Word applies font substitution (typically to `Arial` or `SimSun`), which can slightly alter letter tracking and line wraps.
  - Mitigated by embedding standard fallback definitions in `w:rFonts` (`w:ascii`, `w:hAnsi`, `w:eastAsia`, `w:cs`).
- **Word DirectWrite Sub-Pixel Grid Alignment**:
  - Minor rendering discrepancies (1–2 pixels) may exist between Word's print layout view and draft view due to DirectWrite GDI compatibility modes.

---

## 4. Complex Nested Tables in Flow vs Canvas Mode
- **Canvas 2D Engine**:
  - The Canvas engine represents table cells as structured 2D coordinate cards (`colWidthsPt`, `rowHeightsPt`).
  - Text inside these cells wraps cleanly and does not push adjacent cells out of position.
  - However, because they are rendered as absolutely positioned VML shapes, dragging an upper row in Word does not automatically reflow lower rows (by design of absolute 2D canvas layouts).
- **Legacy Flow Engine**:
  - Native Word tables (`<w:tbl>`) are supported in the legacy flow pipeline for standard flowing documents.

---

## 5. Items Resolved vs. Remaining for Future Phases

| Item | Status | Verification Status | Next Action |
|---|---|---|---|
| **Text stretching off right page margin** | **FULLY RESOLVED** | 0/1315 overflows (100% wrapped) | None (Closed) |
| **Korean glyph descender bottom clipping** | **FULLY RESOLVED** | Verified via Word COM & PDF | None (Closed) |
| **Pure text height auto-expansion** | **FULLY RESOLVED** | Verified via Word COM & PDF | None (Closed) |
| **Card / Button background shape preservation** | **FULLY RESOLVED** | Verified via Word COM & PDF | None (Closed) |
| **HWPX Hancom Viewer Compatibility** | Deferred | Intentionally untouched in P19 | Dedicated HWPX Mission |
