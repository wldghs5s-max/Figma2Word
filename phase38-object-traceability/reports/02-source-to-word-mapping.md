# Report 02: Source-to-Word Object Traceability Analysis

## 1. Traceability Architecture
Phase 38 transitions Figma2Word from coarse element quantity counters to an item-level cryptographic Object Traceability Engine (`src/fidelity/objectTraceability.ts`). Every node in the Figma source tree is tracked through its lifecycle:

```text
Figma Node ID (e.g. 759:1049)
    │
    ▼
Canvas IR Element (id: 759:1049, sourceNodeId: 759:1049)
    │
    ▼
Word OpenXML Shape (tag: v:roundrect, alt: "759:1049", o:title: "...", id: "s_7_8")
    │
    ▼
Rendered Word Document Page (1..17)
```

## 2. Global Source Element Traceability Summary

- **Source Document**: `펜테크 3차 디자인.json` (SHA-256: `390e774379c9ff9bdc72e0b1918c557e9ea9f3128662692456f8e84a82e0527a`)
- **Total Source Nodes Across 17 Target Frames**: 2,033
- **Total Traceable Nodes**: 2,033 (100.00%)
- **Total DOCX Objects Mapped**: 1,312
- **Missing / Unconverted Nodes**: 0 (0.00%)
- **Traceability Verdict**: **VERIFIED**

### Element Breakdown

| Element Kind | Figma Source Count | Preserved in Word | Preservation Rate | Mapping Relations |
| :--- | :--- | :--- | :--- | :--- |
| **TEXT** | 628 | 628 | **100.00%** | 628 ONE_TO_ONE / ONE_TO_MANY |
| **SHAPE** | 327 | 327 | **100.00%** | 327 ONE_TO_ONE / ONE_TO_MANY |
| **IMAGE** | 19 | 19 | **100.00%** | 19 ONE_TO_ONE (with 8 duplicate shared usages) |
| **CONTAINER** | 1,059 | 338 Converted | **100.00% Traceable** | 721 decomposed transparent layout wrappers, 338 styled card containers |
| **TOTAL** | **2,033** | **1,312 Converted** | **100.00%** | **721 Intentionally Omitted, 0 Missing** |

## 3. Frame-by-Frame Traceability Details

| Page | Frame ID | Frame Name | Source Texts | Preserved Texts | Source Shapes | Preserved Shapes | Source Images | Preserved Images | Missing | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | `763:5068` | 디자인 시스템 1 | 48 | 48 (100%) | 28 | 28 (100%) | 0 | 0 | 0 | VERIFIED |
| 2 | `766:256` | 디자인 시스템 2 | 34 | 34 (100%) | 18 | 18 (100%) | 0 | 0 | 0 | VERIFIED |
| 3 | `757:88` | Desktop - 1 | 0 | 0 (100%) | 1 | 1 (100%) | 1 | 1 (100%) | 0 | VERIFIED |
| 4 | `759:759` | Desktop - 대시보드 (지도뷰) | 71 | 71 (100%) | 35 | 35 (100%) | 2 | 2 (100%) | 0 | VERIFIED |
| 5 | `757:92` | Desktop - 2 | 0 | 0 (100%) | 1 | 1 (100%) | 1 | 1 (100%) | 0 | VERIFIED |
| 6 | `757:142` | 촬영계획 | 16 | 16 (100%) | 12 | 12 (100%) | 1 | 1 (100%) | 0 | VERIFIED |
| 7 | `757:158` | 촬영계획 - 건물을 선택시 | 0 | 0 (100%) | 1 | 1 (100%) | 1 | 1 (100%) | 0 | VERIFIED |
| 8 | `759:911` | 사업목록 선택된 화면 | 62 | 62 (100%) | 24 | 24 (100%) | 2 | 2 (100%) | 0 | VERIFIED |
| 9 | `757:124` | 필터 팝업 | 2 | 2 (100%) | 2 | 2 (100%) | 1 | 1 (100%) | 0 | VERIFIED |
| 10 | `759:1076` | 신규등록 - 1 | 78 | 78 (100%) | 42 | 42 (100%) | 2 | 2 (100%) | 0 | VERIFIED |
| 11 | `766:2289` | 필터 | 28 | 28 (100%) | 14 | 14 (100%) | 0 | 0 | 0 | VERIFIED |
| 12 | `757:118` | Frame 1 | 0 | 0 (100%) | 1 | 1 (100%) | 1 | 1 (100%) | 0 | VERIFIED |
| 13 | `766:2942` | 사업정보 수정 | 94 | 94 (100%) | 46 | 46 (100%) | 0 | 0 | 0 | VERIFIED |
| 14 | `759:1314` | 신규등록 - 2 | 82 | 82 (100%) | 44 | 44 (100%) | 2 | 2 (100%) | 0 | VERIFIED |
| 15 | `759:1858` | 사업목록 클릭 시 | 58 | 58 (100%) | 32 | 32 (100%) | 2 | 2 (100%) | 0 | VERIFIED |
| 16 | `759:1533` | 사업정보 상세 | 12 | 12 (100%) | 8 | 8 (100%) | 1 | 1 (100%) | 0 | VERIFIED |
| 17 | `768:3434` | 사업목록 클릭 시 | 43 | 43 (100%) | 18 | 18 (100%) | 2 | 2 (100%) | 0 | VERIFIED |

## 4. Resolution of Container Children with Image Backgrounds
On Page 8 (`759:911`), eight nodes (including `Frame 15`, text `759:1049`, vectors `759:1051` and `759:1052`) reside inside `map-area` (`759:1043`). In earlier pipelines, because `map-area` contained an image fill, the parser failed to recurse into its children. Phase 38 fixed this structural flaw in `figmaCanvasParser.ts`, converting all 8 overlay elements and achieving a 100% preservation rate across all frames.

