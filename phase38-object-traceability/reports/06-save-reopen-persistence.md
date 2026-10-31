# Report 06: Native Word Save & Reopen Edit Persistence

## 1. Persistence Verification Methodology
To ensure that changes made in Microsoft Word are not ephemeral in-memory artifacts or corrupted during file serialization, a strict two-stage process boundary test was executed by `tools/visual-regression/windows_word_edit_test.ps1`:

```text
Stage 1: Mutation Session
  1. Create working copy of Candidate DOCX
  2. Instantiate Win32 Word.Application COM process (PID A)
  3. Apply 25 multi-category DOM modifications
  4. Execute $doc.Save() and $doc.Close()
  5. Terminate Word COM Process (PID A) and release all COM handles

Stage 2: Independent Reopen Session
  6. Instantiate completely clean Word.Application COM process (PID B)
  7. Open modified DOCX from disk
  8. Query DOM for every edited shape and verify persisted values
  9. Export post-edit PDF for visual raster comparison
  10. Terminate Word COM Process (PID B)
```

## 2. Reopen Verification Results

- **Attempted Edits**: 25
- **Verified Edits After Disk Reopen**: 25
- **Persistence Rate**: **100.00%** (25 / 25)
- **Document Page Count**: 17 (Preserved 100%)
- **Document Section Count**: 17 (Preserved 100%)
- **Persistence Verdict**: **PASSED**

### Detailed Property Persistence Log

| Edit ID | Category | Target Shape | Expected Modification | Reopened Disk Value | Status |
| :---: | :--- | :---: | :--- | :--- | :---: |
| 1 | `VML_TEXTBOX_TEXT` | Shape 1 (Page 4) | Text contains `[PHASE38_EDIT_TEXTBOX_1]` | Verified | **PASS** |
| 2 | `VML_SHAPE_STROKE_COLOR` | Shape 10 (Page 4) | ForeColor = `RGB(0, 128, 255)`, Weight = `2.5pt` | Verified | **PASS** |
| 3 | `VML_SHAPE_FILL_COLOR` | Shape 20 (Page 4) | ForeColor = `RGB(255, 200, 100)` | Verified | **PASS** |
| 4 | `VML_SHAPE_DIMENSION` | Shape 30 (Page 7) | Width = Original + `4.0pt` | Verified | **PASS** |
| 5 | `VML_TEXTBOX_TEXT` | Shape 40 (Page 8) | Text contains `[PHASE38_EDIT_TEXTBOX_5]` | Verified | **PASS** |
| 6 | `VML_SHAPE_STROKE_COLOR` | Shape 50 (Page 8) | ForeColor = `RGB(0, 128, 255)`, Weight = `2.5pt` | Verified | **PASS** |
| 7 | `VML_SHAPE_FILL_COLOR` | Shape 60 (Page 8) | ForeColor = `RGB(255, 200, 100)` | Verified | **PASS** |
| 8 | `VML_SHAPE_DIMENSION` | Shape 70 (Page 10) | Width = Original + `4.0pt` | Verified | **PASS** |
| 9 | `VML_TEXTBOX_TEXT` | Shape 80 (Page 16) | Text contains `[PHASE38_EDIT_TEXTBOX_9]` | Verified | **PASS** |
| 10 | `VML_SHAPE_STROKE_COLOR` | Shape 90 (Page 16) | ForeColor = `RGB(0, 128, 255)`, Weight = `2.5pt` | Verified | **PASS** |
| 11 | `VML_SHAPE_FILL_COLOR` | Shape 100 (Page 16) | ForeColor = `RGB(255, 200, 100)` | Verified | **PASS** |
| 12 | `VML_SHAPE_DIMENSION` | Shape 110 (Page 4) | Width = Original + `4.0pt` | Verified | **PASS** |
| 13 | `VML_TEXTBOX_TEXT` | Shape 120 (Page 4) | Text contains `[PHASE38_EDIT_TEXTBOX_13]` | Verified | **PASS** |
| 14 | `VML_SHAPE_STROKE_COLOR` | Shape 130 (Page 8) | ForeColor = `RGB(0, 128, 255)`, Weight = `2.5pt` | Verified | **PASS** |
| 15 | `VML_SHAPE_FILL_COLOR` | Shape 140 (Page 8) | ForeColor = `RGB(255, 200, 100)` | Verified | **PASS** |
| 16 | `VML_SHAPE_DIMENSION` | Shape 150 (Page 10) | Width = Original + `4.0pt` | Verified | **PASS** |
| 17 | `VML_TEXTBOX_TEXT` | Shape 160 (Page 10) | Text contains `[PHASE38_EDIT_TEXTBOX_17]` | Verified | **PASS** |
| 18 | `VML_SHAPE_STROKE_COLOR` | Shape 170 (Page 10) | ForeColor = `RGB(0, 128, 255)`, Weight = `2.5pt` | Verified | **PASS** |
| 19 | `VML_SHAPE_FILL_COLOR` | Shape 180 (Page 10) | ForeColor = `RGB(255, 200, 100)` | Verified | **PASS** |
| 20 | `VML_SHAPE_DIMENSION` | Shape 190 (Page 14) | Width = Original + `4.0pt` | Verified | **PASS** |
| 21 | `VML_TEXTBOX_TEXT` | Shape 200 (Page 14) | Text contains `[PHASE38_EDIT_TEXTBOX_21]` | Verified | **PASS** |
| 22 | `VML_SHAPE_STROKE_COLOR` | Shape 210 (Page 16) | ForeColor = `RGB(0, 128, 255)`, Weight = `2.5pt` | Verified | **PASS** |
| 23 | `VML_SHAPE_FILL_COLOR` | Shape 220 (Page 16) | ForeColor = `RGB(255, 200, 100)` | Verified | **PASS** |
| 24 | `VML_SHAPE_DIMENSION` | Shape 230 (Page 4) | Width = Original + `4.0pt` | Verified | **PASS** |
| 25 | `VML_TEXTBOX_TEXT` | Shape 240 (Page 8) | Text contains `[PHASE38_EDIT_TEXTBOX_25]` | Verified | **PASS** |

## 3. Structural Integrity Findings
- Microsoft Word cleanly re-serialized the VML properties without dropping attributes or altering document structure.
- Total sections remained exactly 17.
- Rendered PDF page count remained exactly 17.
- No XML schema errors, corruption prompts, or recovery warnings occurred during document reopen.

