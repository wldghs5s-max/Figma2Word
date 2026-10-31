# Phase 36 Report 04: Editability Auditor Correction & Verification

## Problem Statement (Audit Finding A-03)

In Phase 35.2, the DOCX Editability Auditor reported:
- Section 1 (Page 1): `Classification: EMPTY_PAGE, Editability Score: 0/100, Text Nodes: 0, Shapes: 0`
- However, visual verification showed Page 1 (`763:5068`) rendered with 0.9446 SSIM, and the Canvas IR contained 72 elements (texts, rectangles, and design system swatches).

---

## Root Cause Analysis

### OpenXML Section Architecture
In WordprocessingML (ECMA-376 Part 1 §17.6.17 / §17.6.18):
- Section properties (`<w:sectPr>`) define the page margins, orientation, and size of the section that *precedes* the break.
- For intermediate sections, Word requires `<w:sectPr>` to reside inside the paragraph properties (`<w:pPr>`) of the final paragraph of that section:
  ```xml
  <w:p>
    <w:pPr>
      <w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/>
      <w:sectPr>
        <w:type w:val="nextPage"/>
        <w:pgSz w:w="12240" w:h="15840" w:orient="portrait"/>
      </w:sectPr>
    </w:pPr>
    <w:r>
      <w:pict>...Page 1 Shapes and Text...</w:pict>
    </w:r>
  </w:p>
  ```
- For the final section of the document, `<w:sectPr>` resides directly under `<w:body>` as the last element:
  ```xml
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840" w:orient="portrait"/>
    </w:sectPr>
  </w:body>
  ```

### The Slicing Defect in `editabilityAuditor.ts`
The previous auditor sliced raw `bodyContent` by searching for `</w:sectPr>`:
```ts
// Flawed slicing logic:
while (true) {
  const endIdx = bodyContent.indexOf("</w:sectPr>", searchPos);
  if (endIdx === -1) break;
  const chunkEnd = endIdx + "</w:sectPr>".length;
  rawSections.push(bodyContent.substring(searchPos, chunkEnd));
  searchPos = chunkEnd;
}
```
Because `docxCanvasRenderer.ts` outputs `<w:sectPr>` inside `<w:pPr>` *before* the `<w:r>` runs:
1. `rawSections[0]` contained only `<w:p><w:pPr><w:sectPr>...</w:sectPr></w:pPr>`. It contained **ZERO** `<w:r>` tags!
2. The `<w:r>` tags of Page 1 were dumped into `rawSections[1]`, causing an off-by-one section shift.
3. Section 1 had 0 text nodes and 0 shapes -> misclassified as `EMPTY_PAGE, Score: 0`.

---

## Architectural Resolution

`auditDocxEditability` in `src/fidelity/editabilityAuditor.ts` was redesigned:
1. When encountering `<w:sectPr>`, it checks whether it is enclosed within an active paragraph `<w:p>`.
2. If enclosed, the section boundary is extended to the closing `</w:p>` tag of that paragraph, ensuring that all content runs (`<w:r>`) belonging to that page are captured inside that section chunk.
3. If `<w:sectPr>` is a direct child of `<w:body>`, the section boundary terminates at `</w:sectPr>`.

```ts
// Fixed robust paragraph-level section parser:
const lastPBeforeSectPr = bodyContent.lastIndexOf("<w:p", sectPrIdx);
const lastPCloseBeforeSectPr = bodyContent.lastIndexOf("</w:p>", sectPrIdx);
const isInsideP =
  lastPBeforeSectPr >= searchPos &&
  (lastPCloseBeforeSectPr === -1 || lastPBeforeSectPr > lastPCloseBeforeSectPr);

let chunkEnd = sectPrEnd;
if (isInsideP) {
  const pCloseIdx = bodyContent.indexOf("</w:p>", sectPrEnd);
  if (pCloseIdx !== -1) {
    chunkEnd = pCloseIdx + "</w:p>".length;
  }
}
rawSections.push(bodyContent.substring(searchPos, chunkEnd));
searchPos = chunkEnd;
```

---

## Verification & Audit Results

Running the corrected auditor on the Phase 36 Candidate DOCX yields:
- **Total Sections**: Exactly 17 sections (matching the 17 pages of the document).
- **Page 1 Section**:
  - `Classification`: **`FULLY_EDITABLE`**
  - `Editability Score`: **100 / 100**
  - `Text Nodes`: 1
  - `VML Shapes`: 3
  - `Full Page Cover Image`: **false**
- **Document Average Editability**: **100 / 100**
- **Overall Verdict**: **`PASSED`**
- Regression test added in `tests/phase35-editability-auditor.test.ts` (Test 5: "Correctly attributes elements to Page 1 when sectPr is inside pPr").
