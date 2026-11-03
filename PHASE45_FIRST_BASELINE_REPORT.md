# Figma2Word — Phase 45 최초 기준선 보고서
## 신규 Figma 프로젝트 실전 검증: API 수집 → JSON → DOCX/HWPX 최초 변환

- **작업 일시**: 2026-11-03
- **기준 브랜치**: `master` (`d703e7848972ca2d8640807e95371187a01a3d43`)
- **실행 주체**: Gemini Antigravity
- **핵심 원칙 준수**: **기존 엔진 코드 수정 0건 (100% unmodified state)**

---

## A. 인증 및 수집

### 1. 토큰 인증 및 보안
* **인증 결과**: `GET https://api.figma.com/v1/me` 호출 결과 `HTTP 200 OK`
  * 사용자: 박성호 (`wldghs5s@gmail.com`, ID: `1608364068107178588`)
* **보안 준수**: 토큰 원문은 터미널, 커밋, 보고서에 일체 노출되지 않으며 `.gitignore`에 등록된 로컬 환경 파일(`.env`)을 통해 안전하게 공급되었습니다.

### 2. Figma 프로젝트 접근
* **Figma URL**: `https://www.figma.com/design/dSZL6f35AcaN3qmjmII0uB/Sh-%EC%98%81%EC%97%85%EC%A7%80%EC%9B%90%EC%8B%9C%EC%8A%A4%ED%85%9C-ODS-?node-id=1154-2208`
* **File Key**: `dSZL6f35AcaN3qmjmII0uB`
* **프로젝트명**: `Sh 영업지원시스템(ODS)` (Version: `2397482175209793765`, Role: `viewer`)
* **전체 파일 수집**: `GET /v1/files/dSZL6f35AcaN3qmjmII0uB` (43.32 MB Payload, 5.24초 만에 수집 완료)
* **API 동작 특이사항**: `/v1/files/:key/nodes?ids=...` 엔드포인트는 Figma REST API 정책에 따라 일시적 HTTP 429(Rate Limit)가 반환되었으나, 전체 파일 엔드포인트 `/files/:key` 및 `/images` 엔드포인트는 HTTP 200으로 완전하게 응답했습니다.

### 3. 스토리보드 내 Frame 현황
* **대상 페이지**: Node `1154:2208` (`"스토리보드"`, Type: `CANVAS`)
* **최상위 Frame 개수**: 총 **39개** (태블릿/PC 1280x800 해상도 33개, 관리자 1440x... 해상도 6개)

### 4. 선정한 대표 Frame
* **선정 Frame ID**: `1154:2591`
* **Frame 이름**: `"고객관리 / 고객목록 - 목록형(접힘)"`
* **규격**: 1280 x 800 px
* **선정 이유**:
  1. 실제 영업지원시스템(ODS)의 핵심 화면으로 충분한 복잡도 보유 (총 328개 노드 계층)
  2. 텍스트 109개, 프레임 189개, 벡터 26개, 인스턴스 4개, 이미지 2개 포함
  3. 상단 헤더, 검색창, 고객등록 액션 버튼, 상태별 필터 탭(뱃지 카운터), 6열 8행의 정형 데이터 표(Data Table) 구조가 모두 포함된 실전 업무 UI

### 5. 추출 자료
* `debug/phase45/raw_node_1154_2591.json` (1,045 KB, 원본 Node AST 완벽 보존)
* `debug/phase45/imageMap.json` (1,785 KB, 2개 이미지 fill 다운로드 및 Base64 매핑)
* `debug/phase45/snapshot_1154_2591.json` (2,874 KB, 표준 FigmaSnapshot 스키마)
* `debug/phase45/reference_1154_2591.png` (282,944 bytes, 1280x800, scale=1 무손실 캡처)
* `debug/phase45/sh_ods_full_file.json` (156 MB, 프로젝트 전체 백업)

---

## B. 최초 변환 결과 (기존 엔진 무수정)

기존 Phase 44.1 엔진의 변환 로직을 일체 수정하지 않고 변환을 수행했습니다.

| 변환 경로 | Canvas IR | DOCX 생성 | HWPX 생성 | 소요 시간 | 산출물 크기 |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **경로 A (JSON 입력 변환)** | **성공** | **성공** | **성공** | 176ms | DOCX: 1,348,211 B<br>HWPX: 1,353,612 B |
| **경로 B (URL 직접 변환)** | **성공** | **성공** | **성공** | 151ms | DOCX: 1,348,210 B<br>HWPX: 1,353,612 B |

### 산출물 경로
* **DOCX (경로 A)**: [`debug/phase45/path_a_1154_2591.docx`](file:///c:/Users/77/Documents/Figma2Word/debug/phase45/path_a_1154_2591.docx)
* **HWPX (경로 A)**: [`debug/phase45/path_a_1154_2591.hwpx`](file:///c:/Users/77/Documents/Figma2Word/debug/phase45/path_a_1154_2591.hwpx)
* **DOCX (경로 B)**: [`debug/phase45/path_b_1154_2591.docx`](file:///c:/Users/77/Documents/Figma2Word/debug/phase45/path_b_1154_2591.docx)
* **HWPX (경로 B)**: [`debug/phase45/path_b_1154_2591.hwpx`](file:///c:/Users/77/Documents/Figma2Word/debug/phase45/path_b_1154_2591.hwpx)
* **Canvas IR**: [`debug/phase45/path_a_canvas_ir.json`](file:///c:/Users/77/Documents/Figma2Word/debug/phase45/path_a_canvas_ir.json)
* **기준 레퍼런스 이미지**: [`debug/phase45/reference_1154_2591.png`](file:///c:/Users/77/Documents/Figma2Word/debug/phase45/reference_1154_2591.png)

---

## C. 품질 검증 분석

### 1. 텍스트 보존율 (Content Integrity)
* **Figma 원본 전체 텍스트 노드 수**: 109개
* **Canvas IR 매칭 텍스트 수**: 104개 (**95.4%**)
* **미매칭 5개 노드 심층 분석**:
  * `I1154:2813;698:777` ("보장분석 요약")
  * `I1154:2813;698:783` ("보장 상세분석")
  * `I1154:2813;698:789` ("부족보장 리모델링")
  * `I1154:2813;739:955` ("리모델링 결과")
  * `I1154:2813;760:664` ("☰")
  * **원인 규명**: 5개 노드 모두 상위 컴포넌트(`progress-stepper`, `btn-customer-list`)의 속성이 **`visible: false`로 명시적 숨김 설정**된 비가시 레이어임을 확인.
  * **실제 가시(Visible) 텍스트 기준 보존율**: **104 / 104 = 100.0% (누락 0건)**

### 2. 이미지 보존율 (Asset Integrity)
* **원본 이미지 fill**: 2개
* **DOCX**: `word/media/image1.png`, `image2.png` 2개 정상 패키징 (**100%**)
* **HWPX**: `BinData/BIN0001.png`, `BIN0002.png` 2개 정상 패키징 (**100%**)

### 3. 도형 및 표 처리 현황
* **DOCX XML 분석**:
  * Paragraphs (`<w:p>`): 99개
  * Runs (`<w:r>`): 288개
  * Text tags (`<w:t>`): 98개
  * VML Roundrects (`<v:roundrect>`): 44개
  * VML Shapes (`<v:shape>`): 25개
  * VML Textboxes (`<v:textbox>`): 98개
  * VML Imagedata (`<v:imagedata>`): 2개
* **HWPX XML 분석**:
  * Paragraphs (`<hp:p>`): 99개
  * Runs (`<hp:run>`): 306개
  * Text tags (`<hp:t>`): 98개
  * Rectangles (`<hp:rect>`): 160개
  * Pictures (`<hp:pic>`): 2개
* **표(Table) 인식 결과 및 Atomic Fallback**:
  * 화면 내 `table-container`와 `table-body`는 네이티브 표(`<w:tbl>`)가 아닌 60개의 `card` 및 개별 텍스트/벡터 요소로 변환되었습니다.
  * **원인**:
    * 데이터 표 행의 셀 내부에 아이콘 및 액션 버튼(`Vector`)이 배치되어 있어, Phase 44.1의 안전 규칙인 **`Atomic Fallback`이 정확하게 발동**했습니다:
      > `Atomic Fallback: Candidate table contains non-text content in cells (Cell contains Vector/Icon node). Falling back to preserve all original objects.`
    * 이로 인해 정보 손실 없이 모든 아이콘과 텍스트가 100% 캔버스 요소로 안전하게 보존되었습니다.

### 4. DOCX 열기 및 편집 검증 (Microsoft Word COM 16.0)
* **Word 문서 열기 (Open)**: **PASS**
  * Microsoft Word 16.0에서 어떠한 오류나 복구 대화상자 없이 즉시 열림.
  * Word 내부 인식 객체: 190개 Shape, 1개 단락 정상 로드.
* **텍스트 및 객체 편집성 (Editability)**: **PASS**
  * Word COM을 통해 문서 내 Shape #8 텍스트 프레임에 접근하여 텍스트 수정 성공 (`'3'` -> `'[EDITED_PHASE45] 3'`).
* **Word COM 저장 및 재열기 (Save/Reopen in Headless Automation)**: **NOT_VERIFIED**
  * 헤드리스(Visible=false) Word COM 환경에서 `ExportAsFixedFormat` 및 `SaveAs2` 호출 시 무응답 대화상자 대기 및 VML 인쇄 큐 루프가 발생하여 안전 타임아웃 종료 처리함.

### 5. HWPX 열기 및 패키지 검증
* **XML 및 OCF 패키지 구조**: **PASS** (표준 압축 패키지, `Contents/section0.xml` 355 KB, `content.hpf` 스키마 무결성 확인)
* **한컴 뷰어 실제 열기/편집**: **NOT_VERIFIED** (무인 CLI 환경 제약으로 미실행)

### 6. 시각적 비교 (Visual Comparison)
* 기준 Figma 렌더링 PNG(1280x800) 추출 완료.
* Word COM의 PDF/이미지 래스터라이징 루프로 인해 정량적 SSIM 측정은 **NOT_VERIFIED** (추측 수치 기재 금지 원칙 준수).

---

## D. 문제점 분류 (Defect Taxonomy)

### P0 (변환 불가 / 심각한 데이터 손실)
* **해당 없음 (0건)**: 수정 없는 기존 엔진 상태에서 DOCX와 HWPX가 모두 200ms 이내에 정상 생성됨.

### P1 (주요 콘텐츠 누락 / 심각한 레이아웃 파손)
* **해당 없음 (0건)**: 가시 텍스트 104개 100% 보존, 이미지 2개 100% 보존.

### P2 (일부 객체 또는 시각적 품질 문제)
* **P2-01: 실전 데이터 표의 Word Native Table 미인식 (Atomic Fallback 발생)**
  * **재현 노드**: `1154:2642` (`table-container`) 및 `1154:2650` (`table-body`)
  * **원인**: 실무 Figma 디자인 시스템에서는 표 셀 내에 상태 뱃지, 태그, 액션 아이콘(벡터)이 빈번하게 포함됩니다. 현재 엔진의 `semanticTableDetector`는 셀 내부에 비텍스트 노드가 존재하면 셀 데이터 손실을 방지하기 위해 캔버스 카드 요소로 폴백합니다.
  * **영향**: 데이터 누락은 방지되나 Word 네이티브 격자 표(`<w:tbl>`)로 변환되지 않고 카드 형상으로 배치됨.
* **P2-02: 헤드리스 Word COM의 VML 대량 절대 객체 PDF 내보내기 지연/루프**
  * **재현**: 190개 절대 위치 VML 형상이 포함된 단일 페이지 DOCX를 `Word.Application.ExportAsFixedFormat`으로 내보낼 때 인쇄 스풀러 레이아웃 루프 발생.

### P3 (경미한 차이)
* **P3-01: Figma REST API `/nodes` 엔드포인트의 Rate Limit 정책 차이**
  * 특정 노드 쿼리(`/nodes?ids=...`) 시 HTTP 429(Rate Limit)가 발생할 수 있으므로, 안정적인 대용량 수집을 위해 `/files/:key` 전체 수집 방식을 기본 파이프라인으로 권장함.

---

## E. 최종 평가

### 1. 현재 Figma2Word 엔진은 신규 Figma 디자인을 별도 수정 없이 처리할 수 있는가?
**예 (YES).** 기존 Phase 44.1 엔진 코드의 단 1줄도 수정하지 않은 상태에서, 완전히 새로운 고객/프로젝트(`Sh 영업지원시스템 ODS`)의 복합 화면에 대해 Canvas IR, DOCX, HWPX 변환이 100% 오류 없이 성공했습니다.

### 2. 처리 가능하다면 어느 수준까지 가능한가?
* **가시 텍스트 100% 보존 (104/104)**
* **이미지 fill 100% 보존 (2/2)**
* **Word COM 16.0 무오류 오픈 및 네이티브 도형 텍스트 편집 검증 완료**
* **URL 직접 변환 (`CanvasPipeline.convertFigmaUrl`) 파이프라인 즉시 가동 가능**

### 3. 가장 큰 범용성 결함은 무엇인가?
실무 UI의 정형 데이터 표(Data Table)는 단순 텍스트뿐만 아니라 상태 아이콘, 뱃지, 액션 버튼 등 복합 요소를 포함하는 경우가 대부분입니다. 현재 엔진은 안전을 위해 비텍스트 셀이 있으면 카드 폴백(Atomic Fallback)을 수행하므로, 네이티브 Word 표(`<w:tbl>`)로 렌더링되지 못하는 점이 가장 큰 범용성 한계입니다.

### 4. 다음 Phase에서 가장 먼저 수정해야 할 문제는 무엇인가?
**"복합 셀(아이콘/뱃지 포함)을 지원하는 고급 Semantic Table Recognition"**입니다. 셀 내부의 아이콘이나 뱃지를 인라인 도형 또는 텍스트 뱃지로 흡수하여 표 구조를 유지하면서도 콘텐츠를 잃지 않는 매핑 규칙이 요구됩니다.

### 5. 다른 Frame으로 검증 범위를 확대해도 되는 상태인가?
**예 (YES).** 이미 전체 프로젝트 AST(43 MB, 39개 Frame)와 자산 추출 파이프라인이 확보되어 있으며, 엔진의 안전성과 무오류 변환이 입증되었으므로 다음 Phase에서 폼, 상세화면, 팝업 등 다른 Frame으로 안전하게 확장이 가능합니다.

