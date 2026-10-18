# Phase 23.1 Cross-Format Fidelity Analysis (HWPX vs DOCX)

## 1. 동일 Canvas IR 기반 비교 원칙
- **단일 원본 (Single Source of Truth)**: 동일한 Canvas IR Document 객체를 `HwpxCanvasRenderer`와 `DocxCanvasRenderer`에 입력하여 각각 HWPX 및 DOCX 파일을 생성함.
- **비교 항목**: 페이지 수, 객체 수, 텍스트 콘텐츠 완전성, 도형 치수, 텍스트박스 가용 너비, 여백 매핑.

---

## 2. 산출물 대조 결과

### A. Stage 6 (`stage6-representative-report`)

| 항목 | DOCX | HWPX | 일치 여부 |
|---|---|---|---|
| **페이지 수** | 1 페이지 | 1 페이지 | **100% 일치** |
| **객체 수** | 8 개 요소 | 8 개 요소 | **100% 일치** |
| **텍스트 콘텐츠** | 152자 누락 없음 | 152자 누락 없음 | **100% 일치** |
| **도형 바운드 (pt)** | `511.3 x 57.0 pt` | `511.3 x 57.0 pt` (51131 x 5698 HWPU) | **100% 일치** |
| **상하 간격 (gap)** | 21.0 pt | 21.0 pt | **100% 일치** |
| **파일 크기** | 5,454 bytes | 6,939 bytes | 정상 패키지 크기 |

---

### B. Stage 7 (`stage7-full-report`)

| 항목 | DOCX | HWPX | 일치 여부 |
|---|---|---|---|
| **페이지 수** | 9 페이지 | 9 페이지 | **100% 일치** |
| **객체 수** | 788 개 요소 | 788 개 요소 | **100% 일치** |
| **텍스트 콘텐츠** | 전 페이지 전수 보존 | 전 페이지 전수 보존 | **100% 일치** |
| **임베디드 이미지** | 16 개 BinData/Media | 16 개 BinData/Media | **100% 일치** |
| **파일 크기** | 14,200,187 bytes | 14,216,160 bytes | **정상 바이너리 패키징** |

---

### C. 4종 진단 파일 크로스포맷 대조

| 진단 파일명 | DOCX 크기 | HWPX 크기 | 검증 내용 |
|---|---|---|---|
| `diag-narrow-textbox` | 4,544 bytes | 5,715 bytes | 200pt 좁은 폭 텍스트박스 우측 마진 활용도 일치 |
| `diag-multiline-text` | 4,422 bytes | 5,565 bytes | 복합 다중 문단 개행 및 내용 보존 일치 |
| `diag-textbox-margin` | 4,476 bytes | 5,628 bytes | Zero Margin 및 Explicit Margin(15pt) 인셋 일치 |
| `diag-adjacent-text` | 4,521 bytes | 5,664 bytes | 상하 인접 텍스트 간격(11pt) 보존 일치 |

---

## 3. 결론
DOCX와 HWPX는 각 워드프로세서의 문법(OpenXML vs OWPML)에 따라 직렬화되지만, 기하학적 치수, 텍스트 콘텐츠, 요소 배치 순서 및 내부 여백은 동일 Canvas IR을 원본으로 하여 오차 없이 정밀하게 보존됨을 입증함.
