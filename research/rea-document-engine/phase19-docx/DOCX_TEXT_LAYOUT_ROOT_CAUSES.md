# Phase 19: DOCX Text Layout Root Causes Analysis

## 1. Executive Summary

During real-world customer document benchmarking (`제목 없음.docx`, 30-page exterior wall crack inspection report based on Figma file `kp9cU6u8sPo6ui5RYEi57a`), users reported two severe visual layout defects:
1. **Problem A (Horizontal Overflow)**: Text elements extending beyond the right page margin without wrapping, stretching off into blank canvas space.
2. **Problem B (Bottom Clipping / Truncation)**: Glyph bottoms (descenders such as Korean 받침 '흥', '항', '끋', '흗' and Latin descenders 'g', 'j', 'p', 'q', 'y') clipped or buried under adjacent containers/borders.

Through systematic Word COM programmatic inspection and OOXML/VML reverse engineering on the actual 30-page document, the exact root causes were identified and proved with mathematical precision.

---

## 2. Problem A: Horizontal Overflow & Failure to Wrap

### 2.1 The Observation
In `benchmark-30p-original.docx`, multiple long Korean paragraphs (e.g. node `7:868` with 338 characters, node `7:540` with 122 characters, node `7:911` with 110 characters) appeared on a single continuous horizontal line extending past the right edge of the page (RightEdge up to 785.7 pt, compared to the A4 page width of 595.28 pt).

### 2.2 Deep Root Cause Analysis
- **VML Shape Style Specification**:
  In `src/canvas/renderer/docxCanvasRenderer.ts`, line 387:
  ```ts
  const baseStyle = `position:absolute;left:0;top:0;margin-left:${x.toFixed(3)}pt;margin-top:${y.toFixed(3)}pt;width:${width.toFixed(3)}pt;height:${height.toFixed(3)}pt;z-index:${z};mso-position-horizontal-relative:page;mso-position-vertical-relative:page;mso-wrap-style:none${rotStyle}`;
  ```
- **Microsoft Word VML Engine Behavior**:
  When Microsoft Word encounters `mso-wrap-style:none` on the parent `<v:rect>`, `<v:roundrect>`, or `<v:shape>` containing a `<v:textbox>`:
  1. Word interprets `mso-wrap-style:none` as an explicit instruction **NOT to wrap text to the shape width**.
  2. Word COM directly reports `$shape.TextFrame.WordWrap = 0` (`msoFalse`).
  3. Instead of wrapping at `width: 482.8pt`, Word dynamically expands the effective text frame width to 595.3pt (page width) and lets the text overflow off the right edge.
  4. Across all 424 text shapes in Report 1, **100% of shapes had WordWrap = 0**.

### 2.3 The Solution
By dynamically checking `elem.textRuns && elem.textRuns.length > 0`:
- Text-bearing shapes emit `mso-wrap-style:square`.
- Non-text shapes (background panels, lines, images, icons) retain `mso-wrap-style:none`.
- When Word loads `mso-wrap-style:square`, it sets `$shape.TextFrame.WordWrap = -1` (`msoTrue`), rigidly bounding text within the calculated Canvas IR width and naturally wrapping long lines.

---

## 3. Problem B: Glyph Bottom Clipping & Descender Truncation

### 3.1 The Observation
Single-line labels and multi-line body paragraphs exhibited bottom clipping where the lowest pixels of descenders were cut off by the shape boundary or fixed line height.

### 3.2 Deep Root Cause Analysis

#### Factor 1: Rigid Line Spacing (`w:lineRule="exact"`)
- In `src/canvas/renderer/docxCanvasRenderer.ts`, line 658:
  ```ts
  const spacingXml = firstLineHeight
    ? `<w:spacing w:before="0" w:after="0" w:line="${Math.round(firstLineHeight * 20)}" w:lineRule="exact"/>`
    : `<w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/>`;
  ```
- In OpenXML, `w:lineRule="exact"` forces Word's text rendering engine to restrict the line box to **exactly** `w:line` twips.
- For Korean typography (e.g. `맑은 고딕`, `Pretendard`, `Malgun Gothic`), glyph bounds with complex bottom consonants (받침) typically span 1.25x to 1.35x of `fontSize`.
- In Figma, designers frequently set tight line heights (e.g., fontSize 12 with lineHeight 14.64px $\to$ ratio 1.22x, or fontSize 10 with lineHeight 11px $\to$ ratio 1.10x).
- With `w:lineRule="exact"`, Word physically clips any glyph portion extending below the specified line height slot.

#### Factor 2: Textbox Auto-Fit Mode (`mso-fit-shape-to-text:f`)
- Line 663:
  ```xml
  <v:textbox style="mso-fit-shape-to-text:f;mso-next-textbox:none;${vAnchor}" ${insetAttr}>
  ```
- `mso-fit-shape-to-text:f` prevents Word from expanding the vertical height of the shape to accommodate text that wraps or requires descender breathing room.
- In Word COM testing on a 10pt bold Korean text element with height 11pt:
  - With `mso-fit-shape-to-text:f`: Word maintains Height = 11pt (descenders clipped).
  - With `mso-fit-shape-to-text:t` and `atLeast`: Word naturally expands the shape height to 18.3pt (complete glyphs visible, zero clipping).

#### Factor 3: Textbox Inset Zeroing
- Line 654:
  `inset="0.00pt,0.00pt,0.00pt,0.00pt"`
- When padding is 0 and textbox height is tight, the text baseline places descenders directly against the bottom clipping boundary of the VML shape.

### 3.3 The Solution
1. **Adaptive Line Rule Policy**:
   - Calculate `maxFontSize` across runs.
   - If `firstLineHeight < maxFontSize * 1.25` (tight line height), emit `w:lineRule="atLeast"` so Word provides descender clearance.
   - If `firstLineHeight >= maxFontSize * 1.25` (generous line height, e.g. headings with 1.5x), emit `w:lineRule="exact"` to maintain exact design vertical rhythm.
2. **Selective Auto-Fit (`mso-fit-shape-to-text`)**:
   - For pure text elements (`elem.type === "text" && !hasFill && !hasStroke`) or elements with Figma `textAutoResize === "HEIGHT"` / `"WIDTH_AND_HEIGHT"`, emit `mso-fit-shape-to-text:t`.
   - For container cards, buttons, table cells (`hasFill || hasStroke`), keep `mso-fit-shape-to-text:f` so background boxes and buttons maintain their exact design geometry without shrinking.

---

## 4. Verification Evidence Matrix

| Defect | Root Cause File & Line | Mechanism | Fix Applied | Word COM Verified Result |
|---|---|---|---|---|
| Horizontal Text Runaway | `docxCanvasRenderer.ts:387` | `mso-wrap-style:none` disabled text wrapping (`WordWrap = 0`) | Set `mso-wrap-style:square` for all text shapes | WordWrap = -1 (100%), Overflows: 12 $\to$ 0 |
| Descender Bottom Clipping | `docxCanvasRenderer.ts:658` | `w:lineRule="exact"` on tight line-heights (< 1.25x) | Adaptive `lineRule`: `atLeast` for tight lines | Full Korean & Latin descender visibility |
| Multi-line Height Truncation | `docxCanvasRenderer.ts:663` | `mso-fit-shape-to-text:f` prevented height expansion | `mso-fit-shape-to-text:t` for pure text elements | Shape height adjusts to wrapped lines |
| Card Geometry Collapse | `docxCanvasRenderer.ts:663` | Unconditional `mso-fit-shape-to-text:t` would shrink cards | Guard `!hasFill && !hasStroke` for `fit:t` | Container cards maintain exact design dimensions |
