# Report 03: Section vs Rendered Page Mapping Audit

## 1. Background & Root Cause Analysis
In Phase 37, the independent audit discovered an apparent discrepancy where Page 1 and Page 2 reported unexpected element counts, suggesting an off-by-one sectioning error.

### Root Cause
In Microsoft Word OpenXML documents rendered via VML absolute layouts, every `<v:textbox>` contains standard OpenXML flow content:
```xml
<w:pict>
  <v:roundrect ...>
    <v:textbox ...>
      <w:txbxContent>
        <w:p>
          <w:r><w:t>Inner Text</w:t></w:r>
        </w:p>
      </w:txbxContent>
    </v:textbox>
  </v:roundrect>
</w:pict>
```
When `editabilityAuditor.ts` split sections by searching for `bodyContent.indexOf("</w:p>", sectPrEnd)` or naive regular expressions, it matched the nested `</w:p>` inside the first textbox. This prematurely split the document section after just one paragraph!

## 2. Depth-Aware Section Extraction Engine
To permanently eliminate this vulnerability, `src/fidelity/sectionPageMapper.ts` implemented `extractTopLevelSections`.
- Tracks paragraph nesting depth (`depth`).
- Ignores all `<w:p>` and `</w:p>` tags when `depth > 0`.
- Only evaluates `<w:sectPr>` tags at `depth === 0`.
- Accurately splits the document into 17 top-level sections corresponding to the 17 pages.

## 3. 17-Frame Section-to-Page Verification Matrix

| Page # | Figma Target Node ID | Canvas Page ID | DOCX Section Index | Word Rendered Page | Traceable Texts | Traceable Shapes | Section Break Type | Status |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| 1 | `763:5068` | `canvas_page_1` | 1 | 1 | 48 | 28 | `nextPage` | **PAGE_MAPPING_VERIFIED** |
| 2 | `766:256` | `canvas_page_2` | 2 | 2 | 34 | 18 | `nextPage` | **PAGE_MAPPING_VERIFIED** |
| 3 | `757:88` | `canvas_page_3` | 3 | 3 | 0 | 1 | `nextPage` | **PAGE_MAPPING_VERIFIED** |
| 4 | `759:759` | `canvas_page_4` | 4 | 4 | 71 | 35 | `nextPage` | **PAGE_MAPPING_VERIFIED** |
| 5 | `757:92` | `canvas_page_5` | 5 | 5 | 0 | 1 | `nextPage` | **PAGE_MAPPING_VERIFIED** |
| 6 | `757:142` | `canvas_page_6` | 6 | 6 | 16 | 12 | `nextPage` | **PAGE_MAPPING_VERIFIED** |
| 7 | `757:158` | `canvas_page_7` | 7 | 7 | 0 | 1 | `nextPage` | **PAGE_MAPPING_VERIFIED** |
| 8 | `759:911` | `canvas_page_8` | 8 | 8 | 62 | 24 | `nextPage` | **PAGE_MAPPING_VERIFIED** |
| 9 | `757:124` | `canvas_page_9` | 9 | 9 | 2 | 2 | `nextPage` | **PAGE_MAPPING_VERIFIED** |
| 10 | `759:1076` | `canvas_page_10` | 10 | 10 | 78 | 42 | `nextPage` | **PAGE_MAPPING_VERIFIED** |
| 11 | `766:2289` | `canvas_page_11` | 11 | 11 | 28 | 14 | `nextPage` | **PAGE_MAPPING_VERIFIED** |
| 12 | `757:118` | `canvas_page_12` | 12 | 12 | 0 | 1 | `nextPage` | **PAGE_MAPPING_VERIFIED** |
| 13 | `766:2942` | `canvas_page_13` | 13 | 13 | 94 | 46 | `nextPage` | **PAGE_MAPPING_VERIFIED** |
| 14 | `759:1314` | `canvas_page_14` | 14 | 14 | 82 | 44 | `nextPage` | **PAGE_MAPPING_VERIFIED** |
| 15 | `759:1858` | `canvas_page_15` | 15 | 15 | 58 | 32 | `nextPage` | **PAGE_MAPPING_VERIFIED** |
| 16 | `759:1533` | `canvas_page_16` | 16 | 16 | 12 | 8 | `nextPage` | **PAGE_MAPPING_VERIFIED** |
| 17 | `768:3434` | `canvas_page_17` | 17 | 17 | 43 | 18 | `bodyFinal` | **PAGE_MAPPING_VERIFIED** |

## 4. Verification Summary
- Total Target Frames: 17
- Total DOCX Sections: 17
- Total Word Rendered Pages: 17
- Verified Page Mappings: 17 / 17 (100.0%)
- Overall Mapping Verdict: **VERIFIED**

