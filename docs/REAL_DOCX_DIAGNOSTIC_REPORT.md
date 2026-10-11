# Figma2Word — 실제 산출물 기반 자가진단 및 레이아웃 오류 추적 보고서

## A. 조사 환경

- **Git 브랜치**: `master`
- **Git HEAD 커밋**: `a66a42b9c49a3ac60554e2ed73d6671eb6d9fa48` (`test(parser): cover nested mobile mockups in desktop sections`)
- **작업 트리 상태**: Clean (제품 코드 및 테스트 변경 사항 없음)
- **입력 Figma 디자인 URL**:
  - `https://www.figma.com/design/hXyhZuxCAaNH0BoRHLKSHg/Final-Prj-%EB%AA%A8%EB%9E%98%EC%96%B4%EC%A9%8C%EA%B3%A0-?node-id=0-1&t=H6dzqjOLPvw4p392-1`
  - 대상 파일 키: `hXyhZuxCAaNH0BoRHLKSHg`, 노드 ID: `0-1` (`Final-Prj-모래어쩌고-`)
- **분석 대상 실제 DOCX 파일**:
  - 경로: `debug/customer/Final-Prj.docx`
  - 파일 크기: `12,955,698 bytes` (~12.95 MB)
  - 변환 타임스탬프: `2026-10-10T13:03:10.817Z` (DOCX `docProps/core.xml`에 기록된 생성 정보)
- **Figma API 접근 상태**:
  - 로컬 환경 변수(`FIGMA_ACCESS_TOKEN`, `FIGMA_TOKEN`) 미설정 상태 확인 (`false`).
  - 보호 조건에 따라 불필요한 원격 재시도 루프를 방지하고, 기생성된 실제 산출물 DOCX(12.95MB)의 패키지 압축 해제(`debug/unpacked-customer`) 및 OpenXML 구조 전수 진단부터 수행함.
- **문서 렌더링 도구 및 시각적 검증 환경**:
  - **Microsoft Word 16.0 COM 자동화**: DOCX 무결성 확인 및 실물 99페이지 PDF 내보내기 성공 (`debug/customer/Final-Prj.pdf`, 8,074,386 bytes).
  - **Windows WinRT (`Windows.Data.Pdf.PdfDocument`) 래스터라이저**: Word 렌더링 PDF의 개별 페이지를 무손실 PNG로 직접 렌더링하여 실물 시각적 배치 전수 검사 (`debug/rendered-customer/page-*.png`).
  - **검증 한계**: 원본 Figma 클라우드 API 실시간 조회가 인증 부재로 생략되었으므로, Figma 노드 원본 배치는 DOCX에 보존된 텍스트, 이미지 및 컨테이너 계층, 그리고 기존 파서/레이아웃 로직의 역추적을 통해 교차 검증함.

---

## B. 산출물 요약

| 지표 | 측정 수치 | 비고 |
|---|---|---|
| **Microsoft Word 계산 페이지 수** | **99 페이지** | A4 Portrait (595.3pt × 841.9pt) 기준 |
| **OpenXML 명시적 PageBreak (`<w:br w:type="page"/>`)** | **17 개** | 캔버스 상의 18개 독립 화면/아트보드 경계 |
| **문서 세그먼트 (화면 수)** | **18 개** | 메인 랜딩, 가입, 마이페이지, 예약, 상세, 어드민 등 |
| **총 단락 (`<w:p>`)** | **2,610 개** | 단락 단위 텍스트 및 빈 스페이서 |
| **총 표 (`<w:tbl>`)** | **1,597 개** | 모든 가로행, 카드, 배경 컨테이너가 표로 변환됨 |
| **표 중첩 최대 깊이 (Max Nesting Depth)** | **8 단계** | 깊이 4~8단계에 1,096개(68.6%) 집중 |
| **총 표 셀 (`<w:tc>`)** | **3,119 개** | |
| **임베드 이미지 (`<w:drawing>`)** | **112 개** | 미디어 파일 87개 (`word/media/`) |
| **기본 본문 가용 너비** | **9,026 dxa (451.3 pt)** | A4(11,906 dxa) - 좌우 여백(2,880 dxa) |

### 주요 레이아웃 이상 유형 및 발견 페이지

1. **극심한 문자 단위 세로 줄바꿈 (Vertical Text Squeeze)**:
   - 셀 너비가 100~350 dxa(5~17pt, 1.7~6mm)로 수축되어 단어나 문장이 1~3자씩 세로로 꺾임.
   - 대표 페이지: **Page 1** (헤더 내비게이션), **Page 3** (3열 특장점), **Page 14** (예약 상세 카드 및 버튼), **Page 20** (회원 탈퇴 버튼), **Page 30** (FAQ 답변).
2. **콘텐츠 좌측/우측 쏠림 및 비정상적 대형 공백 (Empty Sidebar / Blank Margin Collapse)**:
   - 좌측에 50~65%의 광활한 빈 공간이 발생하고, 모든 텍스트/카드가 우측 35% 영역에 빽빽하게 뭉개짐.
   - 대표 페이지: **Page 14, Page 20, Page 30**.
3. **가로 카드/비교 섹션의 세로 분할 및 페이지 낭비 (Card Grid Split & Empty Page Space)**:
   - Figma에서 가로 3열~4열로 배치된 카드가 가로 행으로 묶이지 못하고 세로로 쪼개져 한 페이지에 카드 1개만 남고 70% 이상 빈 페이지가 발생함.
   - 대표 페이지: **Page 4, Page 5, Page 16~18**.
4. **테이블 그리드 열 수와 셀 수의 불일치 (Table Grid Column Mismatch)**:
   - `tblGrid`는 3열(또는 1열)인데 `w:tr` 내부는 2셀만 정의되어 잔여 너비 배분 오류 발생.
   - 대표 페이지: **Page 2** (제주/발리/양양 추천 카드), **Page 14** (체크아웃 폼).

---

## C. 심각도별 문제 목록

### [P0 - 작업 차단급 레이아웃 붕괴]
- **ISSUE-1: 1440px 데스크톱 레이아웃의 A4 Portrait(451pt) 강제 적용 및 중첩 표 8단계 누적에 따른 가용 너비 고갈**
  - **영향**: 1,597개 표가 최대 8단계까지 중첩되면서 하위 셀 너비가 50~250 dxa(2.5~12.5pt)까지 수축, 텍스트가 1글자 단위로 세로 낙하.
  - **근거**: `measure-nesting-depth.ts` (깊이 4: 502개, 깊이 5: 330개, 깊이 6: 187개), `find-narrow-cells.ts` (25개 핵심 셀에서 3%~7% 너비 압축).

### [P1 - 주요 콘텐츠 판독 불가 및 시각 왜곡]
- **ISSUE-2: Figma 데스크톱 고정 패딩(256px 등)이 Word 셀 여백(3,840 dxa)으로 1:1 직결되어 60% 이상 공백 유발**
  - **영향**: Figma 1440px 화면 중앙 정렬용 여백(256px)이 A4 가용 너비(451pt)에 무조건 적용되어 페이지 절반 이상을 빈 공간으로 낭비하고 본문은 오른쪽 구석으로 밀림.
  - **근거**: `trace-faq-ancestors.ts` (Level 6 셀 여백 `w:left="3840"`이 7221 dxa 열 내부에서 53% 점유, `page-30.png`).
- **ISSUE-3: 360×460px 데스크톱 카드에 대한 화면 분리 휴리스틱 오탐으로 가로 카드 그룹 해체**
  - **영향**: `LayoutEngine.canFormHorizontalRow`의 방어 가드(`width >= 240 && height >= 450`)가 데스크톱 카드를 '독립 모바일 화면'으로 오인하여 가로 행 클러스터링을 거부, 카드가 낱장으로 찢어짐.
  - **근거**: `page-4.png`, `page-5.png` (각각 카드 1개만 출력되고 75% 공백).

### [P2 - 눈에 띄는 레이아웃 결함]
- **ISSUE-4: Table Grid (`w:gridCol`)와 Table Row (`w:tc`)의 열 수 및 비율 불일치**
  - **영향**: OpenXML 명세 위반 패턴으로 인해 Word 렌더러가 임의로 셀 너비를 재계산하면서 버튼이나 텍스트가 찌그러짐.
  - **근거**: `inspect-jeju-table.ts` (`tblGrid` 3열 vs 행 2셀), `inspect-confirm-pay.ts` (`tblGrid` 1열 9026 dxa vs 행 2셀).

### [P3 - 경미한 시각적 불일치]
- **ISSUE-5: 벡터/아이콘 드롭에 따른 빈 셀 잔존**
  - **영향**: Chevron, 구분선 등의 SVG 벡터가 변환 과정에서 제외되면서 너비 100~200 dxa의 빈 셀(`w:p/`)이 테이블 열 한 칸을 점유.
  - **근거**: `inspect-faq-table.ts` (Chevron 아이콘 위치에 `w:type="pct" w:w="200"`의 빈 셀 잔존).

---

## D. 원인 분석

### 1. 세부 분석: ISSUE-1 (중첩 테이블 과다 및 가용 너비 고갈)

- **관찰된 현상**:
  - `page-3.png`의 "생산성 향상 / 정신적 재충전 / 글로벌 네트워킹" 3열 텍스트가 각 열당 폭 3.7cm 수준에 갇혀 9줄에 걸쳐 3~4글자씩 세로로 꺾임.
  - `page-14.png`의 "예약 상세 확인" 버튼 텍스트가 4줄로 세로 줄바꿈됨.
- **관련 코드 및 OpenXML 구조**:
  - `src/renderer/docxRenderer.ts` lines 420-434, 457-485, 620-635, 662-685.
  - OpenXML: `<w:tbl><w:tblPr><w:tblW w:type="pct" w:w="5000"/></w:tblPr>...`
- **확인된 수치와 증거**:
  - `A4 Portrait`의 본문 가용 너비 = `9,026 dxa` (451.3 pt).
  - 3개 열 배분 시 열당 이론적 최대 폭 = `3,008 dxa` (150.4 pt).
  - 셀 패딩(상하좌우 480 dxa = 24 pt) 적용 후 실제 텍스트 가용 폭 = `2,109 dxa` (105.4 pt).
  - 12pt 한글 폰트(글자당 ~12pt) 기준 한 줄에 최대 8자, 공백/마진 고려 시 4~6자만 수용 가능.
- **가장 가능성 높은 원인**:
  - `FigmaParser`가 캔버스 단위 변환 시 디자인 해상도(1440px 데스크톱)를 고려하지 않고 무조건 `A4 portrait`를 기본 문서 규격으로 고정함.
  - `docxRenderer`가 배경색, 테두리, 가로/세로 레이아웃이 있는 모든 컨테이너를 무차별적으로 `new Table(...)`로 포장하여 최대 8단계까지 중첩시킴으로써 부모-자식 셀 마진이 연쇄 누적됨.
- **확신 수준**: **높음 (High)**
- **아직 확인하지 못한 부분**: Figma 원본에서 개별 텍스트 박스에 수동 줄바꿈(`\n`)이 일부 섞여 있었는지 여부(XML 상에 실제 `\n` 문자가 일부 확인됨).

---

### 2. 세부 분석: ISSUE-2 (데스크톱 고정 패딩의 직결로 인한 공백 쏠림)

- **관찰된 현상**:
  - `page-30.png`에서 문서 좌측의 62%가 텅 비어 있고, FAQ 아코디언 본문이 우측 38% 영역에 몰려 극심한 세로 줄바꿈 발생.
  - `page-14.png`, `page-20.png`에서도 좌측에 거대한 빈 열(사이드바 잔재)이 남음.
- **관련 코드 및 OpenXML 구조**:
  - `src/renderer/docxRenderer.ts` lines 567-578:
    ```ts
    const childPad = spacingToCellMargin(childContainer?.padding);
    ...
    margins: {
      left: pad.left + ...,
      right: pad.right + ...
    }
    ```
  - `src/renderer/utils.ts` line 76:
    ```ts
    left: spacing.left !== undefined ? ptToDxa(pxToPt(spacing.left)) : 0
    ```
  - OpenXML Level 6 Cell:
    `<w:tcMar><w:left w:type="dxa" w:w="3840"/></w:tcMar>`
- **확인된 수치와 증거**:
  - Figma 원본에서 1440px 기준 중앙 배치를 위해 부여된 `paddingLeft: 256px`.
  - `pxToPt(256) = 192 pt` → `ptToDxa(192) = 3,840 dxa`.
  - 부모 그리드 컬럼 폭 `7,221 dxa` 중 `3,840 dxa` (53.2%)가 좌측 마진으로 소진됨.
  - 결과적으로 텍스트에 남은 폭은 `3,381 dxa` (169 pt)에 불과함.
- **가장 가능성 높은 원인**:
  - Figma의 오토레이아웃 패딩은 고정 픽셀(px)이지만, DOCX는 반응형 100% 표 구조(`WidthType.PERCENTAGE`)를 사용함.
  - 부모 컨테이너 폭이 A4(451pt)로 2.4배 축소되었음에도 패딩 값은 원본 픽셀 그대로 dxa로 변환되어 상대적 비중이 17%에서 53%로 폭증함.
- **확신 수준**: **높음 (High)**

---

### 3. 세부 분석: ISSUE-3 (데스크톱 카드의 화면 분리 오탐 및 가로 행 클러스터링 실패)

- **관찰된 현상**:
  - `page-4.png`와 `page-5.png`에 각각 카드 1개("개발자를 위한 낙원", "몰입을 위한 은신처")만 남고 하단 75%가 백지로 비어 있음.
  - 메인 랜딩의 추천 카드 3개(제주, 발리, 양양) 중 1번 카드만 표로 묶이고 2, 3번 카드는 분리됨.
- **관련 코드 및 로직**:
  - `src/layout/layoutEngine.ts` lines 334-345 (`canFormHorizontalRow`):
    ```ts
    // Defensive Guard: Independent full-sized screens (e.g. mobile/desktop artboards)
    // must never be clustered into a single horizontal row table.
    if (cBox.width >= 240 && cBox.height >= 450) {
      return false;
    }
    ```
- **확인된 수치와 증거**:
  - 추천 여행지 카드 규격: 대략 360px 폭 × 480px 높이 (이미지 + 제목 + 태그 + 가격 + CTA).
  - 너비 360px (≥240), 높이 480px (≥450) 조건이 동시에 참이 됨.
  - `canFormHorizontalRow`가 `false`를 반환하여 3개 카드를 하나의 가로 행(`Row Cluster`)으로 결합하지 못함.
- **가장 가능성 높은 원인**:
  - 모바일 전체 화면(예: 375×812)을 보호하기 위해 도입된 단순 절대 크기 가드(`width >= 240 && height >= 450`)가 데스크톱 페이지 내부의 대형 UI 카드(360×480)와 충돌하여 클러스터링을 강제로 차단함.
- **확신 수준**: **높음 (High)**

---

## E. 기존 테스트와의 관계 및 미검출 원인

1. **합성 단위 테스트(Synthetic Unit Tests) 중심**:
   - `tests/desktop-screen-isolation.test.ts` 등은 1440×2500 페이지와 1440×900 섹션 등의 단순 박스 모델만 검증함.
   - 실제 상용 웹 디자인처럼 8단계까지 중첩되는 복잡한 카드·태그·내비게이션 트리를 검증하는 E2E 픽스처가 부재했음.
2. **시각적/OpenXML 수치 단언 부재**:
   - 기존 테스트는 `result.elements`의 개수나 배열 순서만 검증하고, 생성된 셀의 유효 폭(dxa)이나 글자 수 대비 가용 공간(문자 줄바꿈 여부)을 검사하는 assertion이 없음.
3. **용지 규격 및 패딩 왜곡 미검증**:
   - 데스크톱 프레임을 Portrait A4에 렌더링할 때 발생하는 가용 너비 압축률(2.4배 축소)과 고정 dxa 마진의 누적을 측정하는 테스트가 없었음.

---

## F. 수정 제안 및 권장 계획 (코드 미수정 상태)

> **주의**: 이번 단계에서는 사용자 요청 및 안전 원칙에 따라 제품 코드를 수정하지 않았으며, 아래는 향후 작업을 위한 구체적인 기술 제안입니다.

### 1. [제안 1] 가로 카드 클러스터링 방어 가드 정밀화 (`src/layout/layoutEngine.ts`)
- **대상 함수**: `LayoutEngine.canFormHorizontalRow`
- **변경 내용**:
  - 부모 노드가 명백한 데스크톱 캔버스/섹션(너비 ≥ 1000px) 내부인 경우, 단순 절대 크기(240×450) 대신 종횡비나 부모 대비 너비 비율(예: 부모 폭의 50% 미만인 카드는 가로 행 허용)로 완화.
- **예상 효과**: `page-4.png`, `page-5.png`처럼 카드 낱장이 세로로 분리되어 99페이지로 폭증하던 현상을 가로 3~4열 그리드로 정상 복원.
- **회귀 위험**: 모바일 아트보드 2개가 나란히 배치된 경우를 오판할 수 있으므로 상위 컨테이너 너비 및 Step 2-G/2-H 회귀 테스트로 검증 필요.

### 2. [제안 2] 셀 패딩 캡(Cap) 및 비례 축소 (`src/renderer/docxRenderer.ts` & `src/renderer/utils.ts`)
- **대상 함수**: `spacingToCellMargin`, `renderContainer`
- **변경 내용**:
  - A4 본문 가용 폭(451pt) 대비 과도하게 큰 데스크톱 패딩(예: 30pt / 600 dxa 초과 패딩)에 대해 상한선(Cap, 예: 최대 12~16pt)을 적용하거나, 부모 셀 가용 폭의 일정 비율(예: 15%)을 초과하지 못하도록 클램핑.
- **예상 효과**: `page-30.png`처럼 좌측에 53%의 거대 공백이 발생하고 우측으로 텍스트가 밀려 1글자 단위로 깨지던 레이아웃 즉각 정상화.
- **회귀 위험**: CTA 버튼 패딩 보존 로직(Step 2-A)과 컴팩트 칩 로직(Step 2-B)이 보호되도록 조건부 적용 필요.

### 3. [제안 3] 표 중첩 완화 및 1x1 투명 래퍼 플래트닝 (`src/renderer/docxRenderer.ts`)
- **대상 함수**: `renderContainer`, `renderShape`
- **변경 내용**:
  - 가로 분할이 필요 없는 단순 세로 흐름 컨테이너 중, 눈에 보이는 테두리/배경이 없거나 부모와 동일한 배경을 가진 컨테이너는 1x1 Table 생성을 생략하고 직속 단락/요소 시퀀스로 플래트닝.
- **예상 효과**: 8단계에 달하는 표 중첩을 2~3단계로 대폭 축소하여 하위 셀 가용 폭을 확보.

---

## G. 다음 작업 우선순위 (Top 3)

1. **우선순위 1 (P0/P1)**: **데스크톱 카드의 가로 행 클러스터링 복원 (`canFormHorizontalRow` 종횡비 및 부모 비율 기반 개선)**
   - 99페이지로 불필요하게 쪼개진 낱장 카드들을 원본 Figma 디자인과 동일한 3~4열 가로 카드로 통합.
2. **우선순위 2 (P1)**: **과도한 고정 패딩 클램핑 (`spacingToCellMargin` 최대 여백 한도 적용)**
   - 62% 좌측 빈 공간 쏠림 현상 및 1글자 단위 세로 줄바꿈을 해소하여 문서 가독성 확보.
3. **우선순위 3 (P2)**: **Table Grid 열 수와 Cell 수의 OpenXML 동기화 보정**
   - 3열 그리드에 2셀만 생성되어 테이블이 비정상적으로 찌그러지는 현상 방지.

---

## H. 검증 및 산출물 보존 확인

- 본 보고서 작성 과정에서 작성된 진단 도구:
  - `scratch/analyze-docx.ts`: OpenXML 전체 통계 및 이상 징후 전수 스캔
  - `scratch/render-pdf-pages.ps1`: Windows WinRT 네이티브 PDF 페이지 래스터라이저
  - `scratch/trace-bali-ancestors.ts` & `scratch/trace-faq-ancestors.ts`: 중첩 표 깊이 및 OpenXML 계층 역추적 도구
- **제품 코드 변경 여부**: `src/` 디렉터리 내 변경 사항 0건 유지.
- **Git 작업 트리**: 완전히 깨끗한 Clean 상태 유지.

