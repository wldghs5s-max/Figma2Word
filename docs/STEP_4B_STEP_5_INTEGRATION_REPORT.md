# Figma2Word — Step 4B + Step 5 통합 구현 및 검증 보고서

## 1. 개요 및 작업 배경

- **기준 체크포인트**: `69b25e9`
- **목적**:
  1. **Step 4B (FAQ 폭 고갈 해결)**: Word 렌더러에서 연속 테이블이 단일 복합 테이블로 비정상 병합되는 현상을 방지하고, 1×1 카드 테이블 셀 폭(`w:tcW`)을 명시하여 FAQ 답변 텍스트 폭을 복구 (46.35pt → 342.35pt, **7.4배 확장**).
  2. **Step 5 (용지 방향 선택 지원)**: Figma 원본 와이드/데스크톱 디자인(1440px 등)에 맞춰 사용자가 A4 가로형(Landscape) 또는 세로형(Portrait)을 명시적으로 선택할 수 있도록 Web UI, CLI, Pipeline, Renderer 전 계층 구현.

---

## 2. 수정된 파일 및 구체적 변경 내용

| 파일 경로 | 수정 목적 | 구체적 변경 내용 |
|---|---|---|
| `src/renderer/docxRenderer.ts` | Step 4B 인접 테이블 분리 & 1×1 셀 폭 지정 & Step 5 용지 크기 | - `renderSequence`: 테이블 연속 시 `gap <= 0`인 경우에도 격리용 무여백 문단(`<w:p><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr></w:p>`) 삽입<br>- `renderElements`: 인접 테이블 사이에 격리용 무여백 문단 삽입<br>- `renderContainerBody` & `renderShape`: 1×1 카드 TableCell에 명시적 `width: { size: 100, type: WidthType.PERCENTAGE }` 부여(`<w:tcW w:type="pct" w:w="5000"/>` 생성)<br>- `createDocument`: `docx` 라이브러리의 landscape 자동 반전문맥에 맞춰 표준 규격(A4 210×297mm) 전달 및 `secPageConfig?.orientation === "landscape"` 안전 처리 |
| `src/pipeline/index.ts` | Step 5 파이프라인 옵션 전파 | - `PipelineOptions`에 `pageOrientation?: "portrait" \| "landscape"` 추가<br>- `convert()`: `internalDoc.pageConfig.orientation` 및 모든 섹션(`internalDoc.sections`)의 `pageConfig.orientation`에 선택값 적용<br>- `convertFile()`: `PipelineOptions` 인자 추가 및 전달 |
| `src/cli.ts` | Step 5 CLI 플래그 지원 | - `--orientation` 및 `-r` 플래그 파싱(`portrait` \| `landscape`)<br>- `convertFigmaUrl` 및 `convertFile` 호출 시 `pageOrientation` 옵션 전달 |
| `apps/web/src/App.tsx` | Step 5 웹 UI 선택 지원 | - `pageOrientation` 상태(`portrait` \| `landscape`, 기본값: `portrait`) 추가<br>- 변환 모드 하단에 **"용지 방향 (Page Orientation)"** 라디오 버튼 UI 컴포넌트 추가<br>- Figma 실시간 API 변환(`handleFetchAndConvert`) 및 JSON 수동 변환(`handleConvert`) 시 문서 및 섹션 pageConfig에 사용자 선택 방향 반영 |
| `tests/faq-table-isolation.test.ts` (신규) | Step 4B 단위/회귀 테스트 (6개) | - `renderSequence` 인접 테이블 격리 문단 삽입 검증<br>- 1×1 컨테이너 셀 폭 100% 명시 검증<br>- 1×1 단일 shape 카드 셀 폭 100% 명시 검증<br>- FAQ 실무 패턴 (2열 질문 테이블 + 1열 답변 테이블 분리) 검증<br>- 다열 카드 그리드 및 비테이블 요소 혼합 간격 보존 검증 |
| `tests/page-orientation-selection.test.ts` (신규) | Step 5 단위/회귀 테스트 (6개) | - A4 세로형(Portrait) 기본 규격 (11906×16838 dxa) 검증<br>- A4 가로형(Landscape) 규격 (16838×11906 dxa, `w:orient="landscape"`) 검증<br>- 섹션별 pageConfig orientation 오버라이드 지원 검증<br>- `ConversionPipeline.convert()` 옵션 전파 및 docxBuffer 생성 검증<br>- 본문 가용 폭 산출 계산 (세로 602px vs 가로 931px, +54.6% 확장) 검증<br>- 버퍼/Blob 무결성 렌더링 검증 |

---

## 3. Step 4B 테이블 분리 메커니즘과 단일 셀 폭 보존 방식

### 3.1 원인 분석 (Step 4A 결론)
1. **Word 엔진의 연속 테이블 병합 규칙**:
   - OpenXML에서 두 개의 `<w:tbl>` 태그가 중간 문단(`<w:p>`) 없이 인접하면 Microsoft Word 엔진은 이를 단일 테이블로 간주하고 합병(compound table)합니다.
   - FAQ 질문(2열: 96% + 4%) 뒤에 답변(1열)이 바로 이어지면, Word는 답변 행을 질문 테이블의 2열 구조(또는 4% 열)에 억지로 끼워 맞추어 폭을 82.35pt로 압축했습니다.
2. **TableCell `<w:tcW>` 누락**:
   - `docx` 라이브러리의 `TableCell`에 `width`를 지정하지 않으면 `<w:tcW>` XML 엘리먼트가 아예 출력되지 않아, Word의 자동 레이아웃 알고리즘에 의해 여백을 제외한 유효 폭이 46.35pt(~4글자)로 붕괴되었습니다.

### 3.2 해결 메커니즘
1. **격리 분리 문단 자동 삽입**:
   ```ts
   if (result.length > 0 && result[result.length - 1] instanceof Table && piece instanceof Table) {
     result.push(
       new Paragraph({
         spacing: { before: 0, after: 0 },
       })
     );
   }
   ```
   - 시각적 레이아웃 공간은 0pt로 유지되면서, Word 엔진이 두 테이블을 별개의 블록으로 인식합니다.
2. **단일 셀 100% 폭 명시**:
   ```ts
   new TableCell({
     width: {
       size: 100,
       type: WidthType.PERCENTAGE,
     },
     ...
   })
   ```
   - `<w:tcW w:type="pct" w:w="5000"/>`가 명시되어 부모 테이블 폭 전체를 확보합니다.

### 3.3 실제 산출물 Word COM 실측 검증
- **검증 대상**: `debug/customer/Final-Prj.docx` (Before) vs `debug/customer/test-both-verified.docx` (After)
- **Word COM 측정 수치**:
  - **Before (Step 4A)**: 셀 폭 **82.35 pt**, 좌우 셀 패딩 각 18 pt → **순 가용 폭 46.35 pt** (줄당 약 4.2자)
  - **After (Step 4B)**: 셀 폭 **378.35 pt**, 좌우 셀 패딩 각 18 pt → **순 가용 폭 342.35 pt** (줄당 약 31.1자)
  - **결과**: **순 가용 텍스트 폭 7.39배(739%) 확장 달성**, 어색한 글자 단위 강제 개행 완전 해소.

---

## 4. Step 5 세로형/가로형 선택 기능의 구현 범위

| 계층 | 구현 내용 및 동작 방식 |
|---|---|
| **Web UI** (`apps/web`) | - `App.tsx`에 `pageOrientation` (`portrait` \| `landscape`) 라디오 선택 UI 제공<br>- Figma Live URL 변환 및 로컬 JSON 변환 실행 시 IR 문서 모델에 사용자의 선택 방향 주입 |
| **CLI** (`src/cli.ts`) | - `--orientation [portrait\|landscape]` 및 축약 플래그 `-r [portrait\|landscape]` 지원<br>- 단일 JSON, 디렉터리 일괄 변환, Figma 라이브 URL 변환 모두에 방향 옵션 전달 |
| **Pipeline** (`src/pipeline`) | - `PipelineOptions`에 `pageOrientation` 필드 추가<br>- 파싱 후 렌더링 직전 `internalDoc.pageConfig.orientation` 및 모든 section `pageConfig`에 방향 동기화 |
| **Renderer** (`src/renderer`) | - `updateContentWidth()`: 가로형 선택 시 본문 폭 자동 재계산 (602px → 931px)<br>- `createDocument()`: Word OpenXML `<w:pgSz>` 규격과 일치하는 치수 전달 |

---

## 5. 본문 폭 수치 비교 (세로형 vs 가로형)

A4 용지 규격: 210mm × 297mm (좌우 여백 기본값: 25.4mm = 1인치 = 72pt = 1440 dxa)

| 항목 | A4 세로형 (Portrait) | A4 가로형 (Landscape) | 가로형 적용 시 변화율 |
|---|---|---|---|
| **용지 폭 (Page Width)** | 210.0 mm (595.3 pt / 11,906 dxa) | 297.0 mm (841.9 pt / 16,838 dxa) | +41.4% |
| **용지 높이 (Page Height)** | 297.0 mm (841.9 pt / 16,838 dxa) | 210.0 mm (595.3 pt / 11,906 dxa) | -29.3% |
| **좌우 여백 합계** | 50.8 mm (144.0 pt / 2,880 dxa) | 50.8 mm (144.0 pt / 2,880 dxa) | 동일 (기본 1인치 마진 유지) |
| **순 본문 가용 폭 (Net Body Width)** | **159.2 mm (451.3 pt / 9,026 dxa)** | **246.2 mm (697.9 pt / 13,958 dxa)** | **+54.6% 확장 (+246.6 pt)** |
| **Renderer 계산 기준 픽셀** | **602 px** | **931 px** | **+54.6% 확장 (+329 px)** |

---

## 6. 3열 카드 및 FAQ 영역의 폭 변화

### 6.1 3열 카드 그리드 (`sample-e2e-card-grid.json`) 실측 비교 (Word COM)
- **세로형 (Portrait)**:
  - 본문 순 가용 폭: **451.3 pt**
  - Col 1 (Basic Plan): 153.2 pt
  - Col 2 (Pro Plan): 148.65 pt
  - Col 3 (Enterprise): 148.65 pt
- **가로형 (Landscape)**:
  - 본문 순 가용 폭: **697.9 pt**
  - Col 1 (Basic Plan): **237.0 pt (+54.7%)**
  - Col 2 (Pro Plan): **230.05 pt (+54.8%)**
  - Col 3 (Enterprise): **230.05 pt (+54.8%)**
- **효과**: 3열 카드가 가로 캔버스 전체로 시원하게 펼쳐지며 카드 내부의 제목 및 긴 설명문이 줄바꿈 없이 쾌적하게 렌더링됨.

### 6.2 FAQ 영역의 폭 변화
- Step 4A 진단 시점: 46.35 pt (테이블 병합 및 폭 미지정으로 4글자마다 강제 개행)
- Step 4B 세로형: **342.35 pt** (7.4배 확장, 31글자 수준으로 자연스러운 2줄 문장 형성)
- Step 5 가로형 적용 시: **588.95 pt** (추가 246.6 pt 확장 가능, 데스크톱 원본 비율 완벽 복원)

---

## 7. 전체 테스트 및 빌드 결과

```bash
> npm test -- --run
Test Files  35 passed (35)
Tests       189 passed (189)
Duration    2.33s

> npm run build
tsc (Success, exit 0)

> npm run build:web
vite v8.3.3 building client environment for production...
dist/index.html                                       0.45 kB
dist/assets/index-DGPFwJnP.js                       716.63 kB
built in 398ms (Success, exit 0)
```

- **기존 177개 회귀 테스트 전체 100% 보존 통과**
- **Step 4B 신규 단위 테스트 6개 100% 통과**
- **Step 5 신규 단위 테스트 6개 100% 통과**
- **Node 및 Web 프로덕션 빌드 0 오류 완료**

---

## 8. 남은 과제 및 향후 제안

1. **사용자 사전 설정 저장 (Local Persistence)**:
   - Web UI에서 사용자가 선택한 용지 방향(`portrait` / `landscape`) 및 변환 모드를 `localStorage`에 자동 보관하여 재접속 시 유지하도록 개선 가능.
2. **아트보드 가로폭 기준 자동 방향 제안 (Auto-detect Orientation)**:
   - Figma 프레임 루트 폭이 1200px 이상인 경우 웹 UI에서 "A4 가로형(Landscape)"을 자동으로 기본 선택하거나 권장 배지를 표시하는 편의 기능 고려 가능.
3. **사용자 확인 및 최종 Git 체크포인트**:
   - 현재 작업 트리는 커밋/푸시하지 않고 미커밋 상태로 대기 중입니다. 사용자의 검토 승인 후 다음 작업 단계 또는 체크포인트 커밋을 진행할 수 있습니다.

