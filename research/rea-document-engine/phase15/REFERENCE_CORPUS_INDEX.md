# Phase 15: Reference Corpus Index (기준 코퍼스 인덱스)

## 1. 개요

본 문서는 Figma2Word Phase 15에서 구축된 DOCX 및 HWPX 표준 기준 코퍼스(Reference Corpus)의 목록, SHA-256 체크섬, 파일 크기, 구조적 특성 및 포맷 간 1:1 매핑 정의를 기술한다.
모든 파일은 KS X 6101(HWPX) 및 ISO/IEC 29500(DOCX) 표준 명세 검증을 통과한 무결성 보장 아티팩트이다.

## 2. DOCX 기준 코퍼스 목록 (`reference-corpus/docx/`)

| 파일명 | 파일 크기 | SHA-256 체크섬 (전체) | 주요 검증 특성 |
| :--- | :--- | :--- | :--- |
| `single-page-brief.docx` | 6050 B | `6962ddc2c4292ccb94be4e8a3904613f0157f1dd1086e09f99a1d455716a4d2a` | VML 절대 좌표 셰이프, Word COM 100% 편집성 |
| `multi-page-report.docx` | 6781 B | `ae599e5c68b8c6816de1c13524fa2f3dfa3a0053caae7afb86f04cc7327ba0de` | VML 절대 좌표 셰이프, Word COM 100% 편집성 |
| `image-centric-portfolio.docx` | 6334 B | `5c791c20f8915a3346114f29f74f83630aeec146d16b65f1b7ad9f8d340a1739` | VML 절대 좌표 셰이프, Word COM 100% 편집성 |
| `text-centric-article.docx` | 6133 B | `d2bfd088d66bc64f13fee96d90df75195e8c211e3f5f6e5324a9b35b23521d92` | VML 절대 좌표 셰이프, Word COM 100% 편집성 |
| `vector-centric-infographic.docx` | 6016 B | `06426f0f8d603e1cba08eafcb5b118bbc32839ffdeda469443afb8a79dcc7a9a` | VML 절대 좌표 셰이프, Word COM 100% 편집성 |
| `complex-nested-dashboard.docx` | 6182 B | `015ff9f0951416b66a4c292af8ee3d513d8545d7225c12ab13f36806b0ebb237` | VML 절대 좌표 셰이프, Word COM 100% 편집성 |
| `table-card-hybrid.docx` | 6455 B | `d086e76c4e97f8bc298ebb60ff423502f94445602604050fe2e5473bf04ac87d` | VML 절대 좌표 셰이프, Word COM 100% 편집성 |

## 3. HWPX 기준 코퍼스 목록 (`reference-corpus/hwpx/`)

| 파일명 | 파일 크기 | SHA-256 체크섬 (전체) | 주요 검증 특성 |
| :--- | :--- | :--- | :--- |
| `single-page-brief.hwpx` | 6576 B | `6c10bd75f029eac07e444cff7943a9167a167712a95d786bbd283ef17d0dffaf` | KS X 6101 OCF, 7 OWPML 글꼴 블록, `<hp:polygon>` |
| `multi-page-report.hwpx` | 7440 B | `a8a99d9b6800d44a28cc766e46afe81c81a862df7a47d2482eff3201e98146ac` | KS X 6101 OCF, 7 OWPML 글꼴 블록, `<hp:polygon>` |
| `image-centric-portfolio.hwpx` | 6915 B | `a767f1009318afa5046a87e6f04ba8f751798512cd151de4f8e62c7c52913553` | KS X 6101 OCF, 7 OWPML 글꼴 블록, `<hp:polygon>` |
| `text-centric-article.hwpx` | 6608 B | `a230b4b4a9deb6ad4036a49c0d296bd7291a1269727eb1d354ea3e1f0d9a4cda` | KS X 6101 OCF, 7 OWPML 글꼴 블록, `<hp:polygon>` |
| `vector-centric-infographic.hwpx` | 6519 B | `5bc4518b50ede21c0608209cb71599d746a91a3fee701ab65bb7ba0b0201564b` | KS X 6101 OCF, 7 OWPML 글꼴 블록, `<hp:polygon>` |
| `complex-nested-dashboard.hwpx` | 6739 B | `fb674f8c6a1581b573a3da704eaaed1e4e9408e719abc4dd9de88663892dc90f` | KS X 6101 OCF, 7 OWPML 글꼴 블록, `<hp:polygon>` |
| `table-card-hybrid.hwpx` | 7195 B | `b48d6a3e95acb4c1b7da64d79f99e2cb98b96b1c87f776aa51920e38d6bb8e05` | KS X 6101 OCF, 7 OWPML 글꼴 블록, `<hp:polygon>` |

## 4. 포맷 간 1:1 대응 매핑 정의 (`reference-corpus/mappings/`)

| Figma 소스 아키타입 | 대응 DOCX 아티팩트 | 대응 HWPX 아티팩트 | 매핑 검증 항목 |
| :--- | :--- | :--- | :--- |
| `single-page-brief.json` | `single-page-brief.docx` | `single-page-brief.hwpx` | 1페이지 메모, 개요 카드, 텍스트박스 내부 런 |
| `multi-page-report.json` | `multi-page-report.docx` | `multi-page-report.hwpx` | 3페이지 보고서, 페이지 구분자, 3 KPI 요약 카드 |
| `image-centric-portfolio.json` | `image-centric-portfolio.docx` | `image-centric-portfolio.hwpx` | 다중 종횡비 이미지(16:9, 4:3, 1:1), BinData 바인딩 |
| `text-centric-article.json` | `text-centric-article.docx` | `text-centric-article.hwpx` | H1/H2/H3 계층, 불릿 목록, 인용 블록 |
| `vector-centric-infographic.json` | `vector-centric-infographic.docx` | `vector-centric-infographic.hwpx` | VML `<v:shape>` ↔ HWPX `<hp:polygon>`, 원형 배지 |
| `complex-nested-dashboard.json` | `complex-nested-dashboard.docx` | `complex-nested-dashboard.hwpx` | 가로형(Landscape), 사이드바, 막대 차트 카드 |
| `table-card-hybrid.json` | `table-card-hybrid.docx` | `table-card-hybrid.hwpx` | 상단 3 KPI 카드, 4행 그리드 표, 상태 배지 칩 |
| `Sample A (Proposal)` | `canvas-sample-a.docx` | `canvas-sample-a.hwpx` | E2E 문서형 실무 제안서 전문 레이아웃 |
| `Sample B (Nested)` | `canvas-sample-b.docx` | `canvas-sample-b.hwpx` | 중첩 오토레이아웃 및 다단계 카드 그룹핑 |

## 5. 무결성 보증
- DOCX: Windows Word COM 실시간 자동화 테스트(`test_word_editability_comprehensive.ps1`)를 통해 파일 열기, 텍스트 편집, 저장, 재열기 시 0건의 레이아웃 왜곡 확인.
- HWPX: OCF 4대 필수 파일(`mimetype`, `version.xml`, `container.xml`, `manifest.xml`) 및 XML 스키마 100% 파싱 통과 확인.
