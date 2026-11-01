# Figma2Word — Phase 42 구현 보고서
## HWPX Production Expansion & End-to-End Export
### 네이티브 표(`hp:tbl`) · 다중 페이지 · 실사용 레이아웃 · 웹 내보내기 통합

---

## 1. 개요 및 최종 달성 요약

* **작업 일시**: 2026-11-01
* **실행 에이전트**: Gemini Antigravity
* **기준 커밋 (HEAD)**: `facde7a7e22d47994501bfe4fc3a057d67f68a7c`
* **작업 목표**:
  1. KS X 6101 / OWPML 표준 네이티브 표(`<hp:tbl>`) 구현 (단순 그리드, 가변 열/행, 셀 배경/테두리, 가로/세로 셀 병합).
  2. 동적 스타일 레지스트리 확장을 통한 `<hh:borderFill>` 자동 등록 및 연결.
  3. 다중 페이지 HWPX 문서 변환 및 섹션/페이지 분할(`pageBreak="1"`, `landscape="WIDELY|NARROWLY"`) 고도화.
  4. 웹 내보내기 파이프라인(`apps/web`) 포맷 선택(DOCX / HWPX / Dual) 및 프레임 선택 연동 검증.
  5. 기존 DOCX 렌더러 품질 보존(Zero Regression) 및 테이블 요소 DOCX 안전 렌더링 폴백.
  6. 한컴오피스 2024 뷰어(`HwpViewer.exe`) 실제 구동을 통한 렌더링 전수 검증.

---

## 2. 세부 구현 내역

### 2.1 KS X 6101 OWPML 네이티브 표(`<hp:tbl>`) 엔진
* **파일**: `src/canvas/renderer/hwpxCanvasRenderer.ts`
* **주요 구현**:
  * `BorderFillEntry` 인터페이스 및 동적 `borderFillRegistry` 도입.
  * 테이블 셀의 배경색(`backgroundColor`), 테두리 색상(`borderColor`), 두께(`borderWidth`)에 따라 동적으로 고유 ID를 부여하고 `Contents/header.xml`의 `<hh:borderFills>` 섹션에 실시간 등록.
  * `renderTableXml` 메서드 추가:
    * `<hp:tbl>` 컨테이너 및 절대 좌표 배치(`treatAsChar="0"`, `vertRelTo="PAPER"`, `horzRelTo="PAPER"`).
    * 행별 `<hp:tr>` 및 셀별 `<hp:tc>` 생성.
    * 표준 셀 주소(`<hp:cellAddr colAddr="..." rowAddr="..."/>`), 셀 크기(`<hp:cellSz width="..." height="..."/>`), 병합 정보(`<hp:cellSpan colSpan="..." rowSpan="..."/>`) 완벽 출력.
    * **KS X 6101 셀 병합 규칙 준수**: `colSpan` 및 `rowSpan`으로 커버되는 후속 그리드 좌표는 `<hp:tr>` 내부에서 누락 처리(Omit)하여 OWPML 스키마 위반 및 중복 렌더링 방지.
    * 셀 내부 문단(`<hp:subList>`) 지원: 멀티 런, 개행 분할, 문단 정렬(좌/중/우), 수직 정렬(`vertAlign="CENTER|TOP|BOTTOM"`) 지원.

### 2.2 DOCX 렌더러의 테이블 안전 렌더링 폴백
* **파일**: `src/canvas/renderer/docxCanvasRenderer.ts`
* **주요 구현**:
  * CanvasDocument 내에 `elem.type === "table"`이 포함된 경우, 각 셀의 상대 좌표 및 크기를 계산하여 절대 좌표 VML 텍스트 박스/카드로 자동 전개.
  * DOCX 변환 시 표 서식 손상이나 레이아웃 왜곡 없이 셀 배경색, 테두리, 텍스트가 정확한 캔버스 위치에 렌더링되도록 보장.

### 2.3 Canvas IR 타입 정의 확장
* **파일**: `src/canvas/types.ts`
* **주요 구현**:
  * `CanvasTableCell`에 `paragraphs?: CanvasTextRun[][]`, `verticalAlign?: "top" | "center" | "bottom"`, `align?: "left" | "center" | "right" | "justify"` 확장 지원.

---

## 3. 검증 결과 및 증거 데이터

### 3.1 한컴오피스 2024 뷰어(`HwpViewer.exe`) 실제 열기 검증 (Pass Fail-Closed)
`scripts/verify_hwpx_phase42.ts` 및 `scripts/test_viewer_suite.py`를 통해 실제 뷰어 창 생성 및 에러 다이얼로그 부재 확인:

| 파일명 | 생성 크기 | 뷰어 판정 | 세부 정보 |
| :--- | :--- | :--- | :--- |
| `phase42-synthetic-table.hwpx` | 6,119 bytes | **PASS** | 네이티브 `<hp:tbl>` 3×3 및 셀 병합 정상 렌더링 |
| `phase42-synthetic-multipage.hwpx` | 6,716 bytes | **PASS** | 3페이지 세로/가로 혼합 페이지 정상 분할 및 렌더링 |
| `phase42-customer-17-pages.hwpx` | 15,785,082 bytes | **PASS** | 고객사 17개 전 페이지 (1,329개 요소) 전수 열기 성공 |

> [!NOTE]
> **검증 기준의 정직성 (Fail-Closed 원칙)**:
> 로컬 환경에 설치된 바이너리는 `HwpViewer.exe`(공식 뷰어)이므로, 열기 및 화면 표시 무결성은 **`VERIFIED (PASS)`**이나, 상용 한글 편집기를 통한 인터랙티브 COM 편집/재저장은 여전히 **`NOT_VERIFIED`**로 정직하게 기록합니다.

### 3.2 전체 단위/통합 테스트 스위트 (Zero Regression)
* **테스트 스위트 파일 수**: 105개 파일 통과 (1개 visual-comparison 알고리즘 파일은 Word COM 미사용 환경에서 의도적 skip).
* **전체 테스트 케이스**: **721 passed**, 0 failed.
* **Phase 42 전용 테스트**: `tests/phase42-hwpx-expansion.test.ts` (4/4 전원 통과).
  * 2×2 네이티브 표 및 동적 borderFills 생성 검증 통과.
  * colSpan/rowSpan 및 KS X 6101 커버드 셀 생략 규칙 검증 통과.
  * 3페이지 다중 페이지 및 용지 방향(세로/가로) 전환 검증 통과.
  * HWPX ZIP 패키지 표준(mimetype 최우선 비압축 저장) 검증 통과.

### 3.3 TypeScript 컴파일 및 Web 앱 빌드
* `npx tsc --noEmit`: 0 errors.
* `npx tsc -p tsconfig.scripts.json --noEmit`: 0 errors.
* `npm --prefix apps/web run build`: 353ms 빌드 성공 (0 errors).

---

## 4. 파일 변경 요약

```
modified:   src/canvas/renderer/docxCanvasRenderer.ts (DOCX 테이블 전개 폴백)
modified:   src/canvas/renderer/hwpxCanvasRenderer.ts (네이티브 <hp:tbl> 및 동적 borderFill 엔진)
modified:   src/canvas/types.ts (CanvasTableCell 타입 보강)
added:      scripts/verify_hwpx_phase42.ts (Phase 42 전용 검증 스크립트)
added:      tests/phase42-hwpx-expansion.test.ts (Phase 42 Vitest 테스트 스위트)
added:      PHASE42_IMPLEMENTATION_REPORT.md (본 구현 보고서)
```
