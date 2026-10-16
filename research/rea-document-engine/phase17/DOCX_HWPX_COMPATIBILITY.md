# Phase 17 — DOCX & HWPX Document Compatibility & Editability Audit

## 1. 개요

이 보고서는 Figma2Word가 생성한 Microsoft Word(`.docx`) 및 한컴오피스 한글(`.hwpx`) 파일이 실제 데스크톱 오피스 프로그램에서 손상 경고 없이 정상 열람되고, 프로그램 방식으로 텍스트를 수정·저장·재열람했을 때 데이터가 영속적으로 유지되는지(Editability Roundtrip) 검증한 실증 자료이다.

---

## 2. Microsoft Word COM (v16.0) 자동화 검증

Windows 호스트에 정식 설치된 Microsoft Word 2016/365(버전 16.0) COM 인터페이스(`Word.Application`)를 통해 다음 3개 실무 문서를 검증하였다.

- **테스트 스크립트**: [`research/rea-document-engine/phase17/scripts/test_word_com_phase17.ps1`](file:///c:/Users/77/Documents/Figma2Word/research/rea-document-engine/phase17/scripts/test_word_com_phase17.ps1)
- **검증 절차**:
  1. `Documents.Open($filePath)`: 손상 경고 및 복구 모달 발생 여부 감시.
  2. `ComputeStatistics(wdStatisticPages)`: 페이지 수 계산.
  3. `Shapes.Count`: 드로잉 캔버스 셰이프 개수 측정.
  4. 텍스트 프레임(`TextFrame.TextRange.Text`) 탐색 및 프로그램 방식 텍스트 편집 (`[Phase 17 Verified COM Edit]` 토큰 주입).
  5. `Save()` 및 `Close()`: 디스크 파일 저장.
  6. `Documents.Open($filePath)` 재열람: 저장된 파일에서 편집된 문자열이 온전히 영속되었는지 재검증.

### Word COM 실행 결과

```text
=== Phase 17: Microsoft Word COM Editability Audit ===
Target Directory: C:\Users\77\Documents\Figma2Word\debug\phase17-com
Word COM Instance initialized successfully. Version: 16.0

--- Testing: brief.docx ---
Opened cleanly: 1 pages, 19 shapes
Edited Shape #3: '단일 기획서 메모' -> '단일 기획서 메모 [Phase 17 Verified COM Edit]'
Saved and closed.
Re-opened check: Persisted=True
Verified persisted string: '단일 기획서 메모 [Phase 17 Verified COM Edit]'

--- Testing: dashboard.docx ---
Opened cleanly: 1 pages, 41 shapes
Edited Shape #3: 'Enterprise Office Analytics' -> 'Enterprise Office Analytics [Phase 17 Verified COM Edit]'
Saved and closed.
Re-opened check: Persisted=True
Verified persisted string: 'Enterprise Office Analytics [Phase 17 Verified COM Edit]'

--- Testing: report.docx ---
Opened cleanly: 3 pages, 37 shapes
Edited Shape #5: 'Executive Summary' -> 'Executive Summary [Phase 17 Verified COM Edit]'
Saved and closed.
Re-opened check: Persisted=True
Verified persisted string: 'Executive Summary [Phase 17 Verified COM Edit]'

Word COM closed and released cleanly.

=== SUMMARY RESULTS ===
Document       Pages Shapes Edited Persisted Status
--------       ----- ------ ------ --------- ------
brief.docx         1     19   True      True PASS  
dashboard.docx     1     41   True      True PASS  
report.docx        3     37   True      True PASS  

>>> ALL DOCX FILES PASSED REAL WORD COM EDITABILITY & PERSISTENCE VERIFICATION! <<<
```

---

## 3. 한컴오피스 HWPX Level 1 & Level 2 시맨틱 정밀 감사

한컴오피스 표준(KS X 6101 OWPML) 규격에 따라 합성 및 실제 Figma 피스처 9종에 대한 전수 감사를 수행하였다.

- **감사 스크립트**: [`research/rea-document-engine/phase17/scripts/validate_hwpx_semantics.ts`](file:///c:/Users/77/Documents/Figma2Word/research/rea-document-engine/phase17/scripts/validate_hwpx_semantics.ts)
- **검증 항목**:
  - **L1_Zip**: ZIP 컨테이너 유효성 및 `mimetype`(`application/hwp+zip`), `manifest.xml`, `content.hpf`, `header.xml`, `section0.xml` 존재 여부.
  - **L1_Xml**: XML Well-formedness 및 최외곽 루트 태그 일치 여부.
  - **L2_CharPr**: `section0.xml`의 모든 `charPrIDRef`가 `header.xml`의 `<hh:charPr id="...">`에 실존하는지 여부 (Dangling Reference 0건).
  - **L2_BinRef**: `section0.xml`의 모든 `binaryItemIDRef`가 ZIP 내부 `BinData/`에 실제 파일로 존재하는지 여부.
  - **L2_Ratio**: 모든 사각형의 모서리 곡률(`ratio`)이 표준 범위 [0, 50]을 엄격히 준수하는지 여부.
  - **L2_ImgDim**: 이미지의 intrinsic dimensions(`hp:imgDim`, `hp:inImgDim`)가 75 HWPU/px 비율로 정확히 선언되었는지 여부.

### HWPX 전수 검증 결과 표

| Index | Fixture | Pages | Elements | L1_Zip | L1_Xml | L2_CharPr | L2_BinRef | L2_Ratio | L2_ImgDim |
|:---:|:---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| 0 | `single-page-brief` | 1 | 18 | **PASS** | **PASS** | **PASS** | **PASS** | **PASS** | **PASS** |
| 1 | `multi-page-report` | 3 | 34 | **PASS** | **PASS** | **PASS** | **PASS** | **PASS** | **PASS** |
| 2 | `image-centric-portfolio` | 1 | 16 | **PASS** | **PASS** | **PASS** | **PASS** | **PASS** | **PASS** |
| 3 | `text-centric-article` | 1 | 16 | **PASS** | **PASS** | **PASS** | **PASS** | **PASS** | **PASS** |
| 4 | `vector-centric-infographic` | 1 | 27 | **PASS** | **PASS** | **PASS** | **PASS** | **PASS** | **PASS** |
| 5 | `complex-nested-dashboard` | 1 | 40 | **PASS** | **PASS** | **PASS** | **PASS** | **PASS** | **PASS** |
| 6 | `table-card-hybrid` | 1 | 47 | **PASS** | **PASS** | **PASS** | **PASS** | **PASS** | **PASS** |
| 7 | `sample-a-proposal-doc` | 1 | 2 | **PASS** | **PASS** | **PASS** | **PASS** | **PASS** | **PASS** |
| 8 | `sample-e2e-card-grid` | 1 | 3 | **PASS** | **PASS** | **PASS** | **PASS** | **PASS** | **PASS** |

전체 9개 피스처에 대해 결함 및 위반 사항 0건으로 검증이 완료되었다.
