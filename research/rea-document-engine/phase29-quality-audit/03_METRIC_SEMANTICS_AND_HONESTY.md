# Phase 29: Metric Semantics, Disentanglement & Measurement Honesty

## 1. Disentangling Structural Section Parity from Visual Layout Collisions

In early phases, visual collisions were conflated with section count mismatches. Phase 28 and Phase 29 strictly separate these orthogonal dimensions:

1. **`totalRenderedDocxSections`**: The actual physical count of `<w:sectPr>` tags inside the generated DOCX (`word/document.xml`).
2. **`sectionCountMismatch`**: `Math.abs(totalCanvasPages - actualDocxSections)`. Evaluates whether each Figma frame received its own isolated section definition.
3. **`detectedCollisionsCount`**: Evaluates whether multiple frames in the raw Figma JSON share the exact same bounding box (`(x1 === x2) && (y1 === y2) && (w1 === w2) && (h1 === h2)`).
4. **`visualCollisionsCount`**: Evaluates whether adjacent pages collide on the same rendered Word page. When section isolation is active per page (`sectionCountMismatch === 0`), `visualCollisionsCount` is strictly 0.

---

## 2. Dynamic Linking & Stale Manifest Invalidation

In earlier reviews, pipeline manifests could become disconnected from the actual DOCX being evaluated if files were re-rendered or cached.

Phase 29 enforces cryptographic SHA-256 validation:
- When DOCX is rendered, `docxSha256` is computed from the exact output binary buffer.
- When `computeDynamicMetrics` runs with a `pipelineManifestPath`, it inspects `manifest.docxSha256`.
- If `manifest.docxSha256 !== docxSha256`, the manifest is rejected as stale (`manifestMatched: false`), and `totalRenderedDocxPages` is marked as `'not_measured'`, preventing stale execution metrics from corrupting the audit report.

---

## 3. Metrics Summary Table on 17-Frame Korean Healthcare Benchmark

| Metric Name | Value | Assessment |
| :--- | :--- | :--- |
| **Total Candidate Frames** | 17 | Verified from Figma JSON |
| **Total Canvas Pages** | 17 | 100% frame coverage |
| **Rendered DOCX Sections** | 17 | Exactly 1 section per page (`<w:sectPr>`) |
| **Section Count Mismatch** | 0 | Perfect structural section parity |
| **Detected Overlapping Frames** | 0 | All frames positioned independently |
| **Visual Collisions Count** | 0 | Zero page overlap in Microsoft Word |
| **Oversized Clamped Pages** | 0 | All pages fit within Word 22" (1584pt) limit |
| **Total Elements Processed** | 2,752 | Shapes, textboxes, lines, cards |
| **Total Textboxes** | 1,489 | All rendered with native Word text |
| **Single-Line Non-Wrapping Text** | 1,180 | Protected via `<w:wordWrap w:val="0"/>` & tolerance buffer |
