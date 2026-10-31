# Phase 35.2 Report 03: Canonical Canvas IR Production Pipeline

## Pipeline Execution

The authentic JSON was processed directly through the production `FigmaCanvasParser`.
Zero synthetic mocks, fixtures, or shortcuts were used.

- Parser: `src/canvas/parser/figmaCanvasParser.ts`
- Scale Policy: `fit-a4` with intelligent document-vs-desktop boundary detection
- Parsing Time: **28 ms**
- Output IR Pages: **17 pages**
- Total Canvas IR Elements: **1,321 elements**

## Page-by-Page Canvas IR Characteristics

| Page | Frame ID | Name | Dimensions (Pt) | Element Count |
| :---: | :--- | :--- | :--- | :---: |
| 1 | `763:5068` | 디자인 시스템 1 | 1440.00 x 810.00 | 72 |
| 2 | `766:256` | 디자인 시스템 2 | 1440.00 x 810.00 | 50 |
| 3 | `757:88` | Desktop - 1 | 1080.00 x 768.00 | 1 |
| 4 | `759:759` | Desktop - 대시보드 (지도뷰) | 1440.00 x 877.50 | 100 |
| 5 | `757:92` | Desktop - 2 | 1086.75 x 1185.00 | 9 |
| 6 | `757:142` | 촬영계획 | 1086.75 x 812.25 | 4 |
| 7 | `757:158` | 촬영계획 - 건물을 선택시 | 1086.75 x 812.25 | 1 |
| 8 | `759:911` | 사업목록 선택된 화면 | 1440.00 x 877.50 | 101 |
| 9 | `757:124` | 필터 팝업 | 883.50 x 968.25 | 4 |
| 10 | `759:1076` | 신규등록 - 1 | 1440.00 x 877.50 | 152 |
| 11 | `766:2289` | 필터 | 378.00 x 459.75 | 71 |
| 12 | `757:118` | Frame 1 | 883.50 x 968.25 | 6 |
| 13 | `766:2942` | 사업정보 수정 | 378.00 x 701.25 | 89 |
| 14 | `759:1314` | 신규등록 - 2 | 1440.00 x 877.50 | 141 |
| 15 | `759:1858` | 사업목록 클릭 시 | 1440.00 x 877.50 | 228 |
| 16 | `759:1533` | 사업목록 클릭 시 - 탭디자인1 | 1440.00 x 915.75 | 209 |
| 17 | `768:3434` | 사업목록 클릭 시 | 1440.00 x 877.50 | 83 |
