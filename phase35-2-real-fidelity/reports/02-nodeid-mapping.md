# Phase 35.2 Report 02: Node-ID-Centric Frame Mapping & Tree Extraction

## Problem Addressed (Audit Defect B-04)

Previous implementations relied on fragile index-based mapping (`rawFrames.find(f => f.pageNumber === pageNum)`), which was vulnerable to frame reordering or accidental page skipping.
In Phase 35.2, `src/fidelity/nodeIdMapper.ts` establishes strict, deterministic, nodeId-centric extraction and validation.

## 17 Target Frames Mapping Table

| Page | Node ID | Frame Name | Figma Box (Px) | Raw Nodes | Text | Shape | Image |
| :---: | :--- | :--- | :--- | :---: | :---: | :---: | :---: |
| 1 | `763:5068` | 디자인 시스템 1 | 1920x1080 | 107 | 44 | 11 | 0 |
| 2 | `766:256` | 디자인 시스템 2 | 1920x1080 | 71 | 30 | 2 | 0 |
| 3 | `757:88` | Desktop - 1 | 1440x1024 | 2 | 0 | 1 | 1 |
| 4 | `759:759` | Desktop - 대시보드 (지도뷰) | 1920x1170 | 152 | 50 | 16 | 2 |
| 5 | `757:92` | Desktop - 2 | 1449x1580 | 10 | 3 | 6 | 2 |
| 6 | `757:142` | 촬영계획 | 1449x1083 | 5 | 3 | 1 | 1 |
| 7 | `757:158` | 촬영계획 - 건물을 선택시 | 1449x1083 | 2 | 0 | 1 | 1 |
| 8 | `759:911` | 사업목록 선택된 화면 | 1920x1170 | 166 | 53 | 18 | 2 |
| 9 | `757:124` | 필터 팝업 | 1178x1291 | 5 | 2 | 2 | 1 |
| 10 | `759:1076` | 신규등록 - 1 | 1920x1170 | 240 | 73 | 32 | 2 |
| 11 | `766:2289` | 필터 | 504x613 | 117 | 32 | 33 | 0 |
| 12 | `757:118` | Frame 1 | 1178x1291 | 7 | 5 | 1 | 1 |
| 13 | `766:2942` | 사업정보 수정 | 504x935 | 154 | 38 | 35 | 0 |
| 14 | `759:1314` | 신규등록 - 2 | 1920x1170 | 219 | 70 | 24 | 2 |
| 15 | `759:1858` | 사업목록 클릭 시 | 1920x1170 | 343 | 93 | 76 | 1 |
| 16 | `759:1533` | 사업목록 클릭 시 - 탭디자인1 | 1920x1221 | 325 | 90 | 66 | 1 |
| 17 | `768:3434` | 사업목록 클릭 시 | 1920x1170 | 125 | 42 | 16 | 2 |
| **Total** | | | | **2,050** | **628** | **341** | **19** |

## Integrity Verification

- Duplicate Node ID Detection: PASSED (0 duplicates)
- Missing Target Node Detection: PASSED (0 missing in input JSON)
- Frame Reordering Detection: PASSED (Preserves strict target sequence 1 to 17)
- Canvas IR `page.frameId` binding: VERIFIED
