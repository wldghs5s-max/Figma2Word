# Figma2Word — Project Handoff & Technical Status

## 1. 프로젝트 정체성 및 비전

**Figma2Word**는 Figma 디자인 데이터를 실무 환경에서 바로 활용 가능한 **Microsoft Word(.docx)** 및 **한컴오피스 한글(.hwpx)** 문서로 정밀 변환하는 단일 캔버스 기반 로컬 변환 엔진입니다.

* **최종 목표**:
  1. Figma 디자인 레이아웃 및 스타일의 고충실도 시각 재현.
  2. 생성된 Word 및 한글 문서의 네이티브 객체 수준 실사용 편집성 보장.
  3. 동일한 중간 표현(Canvas IR)을 기반으로 DOCX 및 HWPX를 완벽하게 생성하는 이중 문서 렌더링 파이프라인 완성.

---

## 2. 핵심 아키텍처 개요

```
[ Figma Node Tree / JSON ]
          │
          ▼
┌───────────────────────────┐
│   FigmaCanvasParser       │ (2D 절대 좌표계 정규화, 스케일링, 인셋 계산)
└─────────┬─────────────────┘
          │
          ▼
┌───────────────────────────┐
│       Canvas IR           │ (CanvasDocument, CanvasPage, CanvasElement)
└─────┬───────────────┬─────┘
      │               │
      ▼               ▼
┌─────────────┐ ┌─────────────┐
│    DOCX     │ │    HWPX     │
│  Renderer   │ │  Renderer   │
└─────┬───────┘ └─────┬───────┘
      │               │
      ▼               ▼
[.docx (Word)]  [.hwpx (한글)]
```

---

## 3. 구현 현황 및 핵심 성과 (Phase 42 완료)

### 3.1 Phase 42: HWPX Production Expansion & End-to-End Export
1. **KS X 6101 / OWPML 표준 네이티브 표(`<hp:tbl>`) 완성**:
   - `<hp:tbl>`, `<hp:tr>`, `<hp:tc>`, `<hp:cellAddr>`, `<hp:cellSpan>`, `<hp:cellSz>`, `<hp:subList>` 완전 준수.
   - 단락 서식(`paraPr`), 문자 속성(`charPr`), 셀 정렬(좌/중/우, 상/중/하) 지원.
   - 가로/세로 셀 병합(`colSpan`, `rowSpan`) 및 OWPML 스키마에 맞춘 커버드 셀 생략 규칙 완벽 적용.
   - 동적 `<hh:borderFill>` 레지스트리 구축으로 셀별 배경색 및 테두리 색상/두께 실시간 매핑.
2. **다중 페이지 HWPX 및 고객사 17개 전 프레임 통합 변환**:
   - `pageBreak="1"` 및 섹션 속성(`secPr`)을 통한 가로(Landscape) 및 세로(Portrait) 혼합 문서 지원.
   - 고객사 디자인(`펜테크 3차 디자인.json`) 17개 프레임 전수(1,329개 요소)를 단일 HWPX 문서로 완전 변환.
3. **한컴오피스 2024 뷰어(`HwpViewer.exe`) 실제 열기 전수 검증**:
   - `phase42-synthetic-table.hwpx` -> **PASS**
   - `phase42-synthetic-multipage.hwpx` -> **PASS**
   - `phase42-customer-17-pages.hwpx` -> **PASS**
   - *뷰어 특성에 따라 인터랙티브 편집/저장은 Fail-Closed 원칙에 의거 `NOT_VERIFIED`로 엄격 구분.*
4. **DOCX 테이블 안전 전개 폴백 및 무회귀(Zero Regression)**:
   - `elem.type === "table"`에 대한 DOCX 절대좌표 카드 전개 폴백 지원.
   - 105개 테스트 파일, **721개 전체 Vitest 전수 통과 (100%)**.
   - 웹 애플리케이션(`apps/web`) 빌드 무결성 유지 (353ms 성공).

### 3.2 핵심 벤치마크 지표

| 지표 항목 | Phase 41 | Phase 42 (Current) | 판정 기준 | 최종 상태 |
|---|:---:|:---:|:---:|:---:|
| **네이티브 표 (`<hp:tbl>`)** | 미지원 | **완전 지원** | OWPML 표준 준수 | **VERIFIED** |
| **셀 병합 (`colSpan`/`rowSpan`)** | 미지원 | **완전 지원** | 커버드 셀 정상 생략 | **VERIFIED** |
| **HWPX 다중 페이지 변환** | 1개 프레임 | **17개 전 페이지 통합** | 1,329개 요소 렌더링 | **VERIFIED** |
| **HWPX 뷰어 실제 열기** | PASS | **PASS (3종 전수 통과)** | HwpViewer.exe 창 열림 확인 | **VERIFIED** |
| **평균 SSIM (16개 프레임)** | 0.9502 | **0.9502** | >= 0.9400 | **PASSED (보존)** |
| **Normal Edit Persistence** | 25 / 25 (100%) | **25 / 25 (100%)** | 100% 지속 (한글 일치) | **PASSED** |
| **Stress Edit Persistence** | 25 / 25 (100%) | **25 / 25 (100%)** | 100% 지속 (전체 일치) | **HARDENED** |
| **전체 단위/통합 테스트** | 717 passed | **721 passed (100%)** | 105개 파일 전원 통과 | **PASSED** |
| **TypeScript / Web 빌드** | 0 errors | **0 errors (353ms)** | 컴파일/빌드 성공 | **PASSED** |

---

## 4. 알려진 한계 및 다음 Phase 개발 계획

1. **HWPX 편집기 인터랙티브 편집 검증 (상용 한글 라이선스 필요)**:
   * 로컬에 설치된 환경이 `HwpViewer.exe`(공식 뷰어)이므로, 열기 및 화면 표시 무결성은 확인되었으나 상용 한글 프로그램의 COM/자동화 인터랙티브 편집/저장 검증은 `NOT_VERIFIED` 상태입니다.
2. **향후 권장 개발 항목**:
   * Figma AutoLayout 표 컴포넌트 자동 감지 및 Canvas IR Table 변환 휴리스틱 고도화.
   * DOCX 폼 입력란 및 텍스트박스 내부 여백(inset) 미세 조정.
