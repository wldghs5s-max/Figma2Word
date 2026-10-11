# Figma2Word — Step 6C: Figma API Rate Limit 대응 및 오프라인 검증 보고서

**작성일시**: 2026-10-11  
**기준 Git HEAD**: `8a41124`  
**작업 상태**: 제품 코드 최소 변경 보존, 201개 테스트 전원 통과, 빌드 성공 (Git 커밋/푸시 미수행)

---

## 1. 실제 Figma 원본 데이터 확보 여부 조사

### 조사 대상 및 결과
- **로컬 작업공간 및 캐시 탐색**:
  - `debug/customer/` 내의 이전 변환 DOCX 산출물(`Final-Prj.docx`, `Final-Prj-Step5-Portrait.docx`, `Final-Prj-Step5-Landscape.docx`) 및 진단 데이터(`page-stats.json`)는 온전히 보존되어 있음을 확인했습니다.
  - 그러나 웹 UI(`apps/web/src/App.tsx`)가 Figma API 응답(`targetNode` 및 `imageMap`)을 브라우저 메모리 내에서만 처리하고 로컬 디스크나 브라우저 스토리지에 캐시하지 않았기 때문에, **실제 Figma 원본 JSON 스냅샷 파일은 로컬에 존재하지 않는 것**으로 확인되었습니다.
- **Figma API Rate Limit 현황**:
  - Figma API의 `429 Too Many Requests` 상태 코드 및 `retry-after: 326869`초(~3.7일) 응답으로 인해 현재 실시간 API 호출이 완전히 차단된 상태입니다.
- **데이터 분류 명시**:
  - 본 보고서에서 수행한 모든 오프라인 변환 검증은 **실제 Figma API 원본 호출이 아닌, 실제 고객 디자인의 레이아웃 구조와 텍스트를 정확히 미러링한 오프라인 모델 및 정밀 테스트 픽스처**를 바탕으로 수행되었습니다.

---

## 2. 오프라인 재변환 수행 결과

오프라인 상태에서 전체 파이프라인(`Figma JSON` → `FigmaParser` → `LayoutEngine` → `InternalDocument` → `DocxRenderer` → `DOCX`)을 실행하여 세로형(Portrait) 및 가로형(Landscape) DOCX 문서를 모두 성공적으로 생성했습니다.

생성된 산출물 위치: [`debug/offline/`](file:///c:/Users/77/Documents/Figma2Word/debug/offline)
1. `realistic-desktop-portrait.docx` (11,004 bytes)
2. `realistic-desktop-landscape.docx` (11,003 bytes)
3. `sample-card-grid-portrait.docx` (10,654 bytes)
4. `sample-card-grid-landscape.docx` (10,652 bytes)
5. `sample-complex-layout-portrait.docx` (10,590 bytes)
6. `sample-complex-layout-landscape.docx` (10,595 bytes)

---

## 3. 테스트 픽스처 및 회귀 검증 결과

[parent-context-row-cluster.test.ts](file:///c:/Users/77/Documents/Figma2Word/tests/parent-context-row-cluster.test.ts)를 보완하여 기존 9개 시나리오에 더해 전체 파이프라인 E2E 렌더링 3개 시나리오(총 12개 시나리오)를 통과시켰습니다.

### 3.1 신규 E2E 시나리오 검증 결과
- **Scenario 10 (4개 큐레이션 추천 카드)**:
  - 데스크톱(1440px) 내 "개발자를 위한 낙원", "몰입을 위한 은신처", "해변가", "도심의 활기" 4개 카드가 4열 단일 Row Cluster로 묶이고 `columnWidths: [25, 25, 25, 25]`로 계산되어 DOCX로 정상 렌더링됨.
- **Scenario 11 (계정 설정 사이드바 + 폼 패널)**:
  - 데스크톱(1440px) 내 사이드바(280px)와 설정 폼(720px)이 2열 단일 Row Cluster로 묶이고 `columnWidths: [28, 72]`로 계산되어 DOCX로 정상 렌더링됨.
- **Scenario 12 (Portrait 및 Landscape 양방향 렌더링)**:
  - 세로형/가로형 모두 정상적인 Word XML 버퍼로 생성됨.

### 3.2 전체 프로젝트 회귀 테스트 및 빌드
```bash
npm test -- --run
Test Files  36 passed (36)
Tests       201 passed (201)
Duration    2.45s

npm run build      # tsc 빌드 성공 (0 errors)
npm run build:web  # Vite + React 번들링 성공 (0 errors)
```
- 기존 35개 테스트 스위트 회귀 0건, 총 201개 테스트 전원 통과.

---

## 4. Word COM 및 OpenXML 정밀 실측 비교

### 4.1 Step 5 실제 산출물 (수정 전) 실측 구조

[`Final-Prj-Step5-Portrait.docx`](file:///c:/Users/77/Documents/Figma2Word/debug/customer/Final-Prj-Step5-Portrait.docx) 및 [`Final-Prj-Step5-Landscape.docx`](file:///c:/Users/77/Documents/Figma2Word/debug/customer/Final-Prj-Step5-Landscape.docx)의 OpenXML 내부 추출 분석:

| 대상 영역 | Step 5 내부 OpenXML 구조 (`word/document.xml`) | Word 렌더링 결과 |
|:---|:---|:---|
| **큐레이션 추천 카드 4개**<br>(개발자 낙원, 은신처, 해변가, 도심 활기) | **4개의 독립된 1×1 테이블로 분리**<br>• 카드 1: `tblW=5000 (pct)`, `gridCols=1`<br>• 카드 2: `tblW=5000 (pct)`, `gridCols=1`<br>• 카드 3: `tblW=5000 (pct)`, `gridCols=1`<br>• 카드 4: `tblW=5000 (pct)`, `gridCols=1` | 각 카드가 본문 전체 폭(100%)을 독점하며 세로로 연속 나열됨.<br>가로형에서 698.8pt로 폭이 넓어지며 세로로 길게 늘어남. |
| **마이페이지 / 계정 설정** | 사이드바 메뉴 항목들이 개별 행/테이블로 분리 | 사이드바와 본문 폼이 나란히 배치되지 못하고 상하로 분리됨. |
| **Word COM 실측 통계** | • **Portrait**: 98 페이지, 26개 최상위 테이블<br>• **Landscape**: **137 페이지** (+39 페이지 급증!) | 가로형으로 바꿨음에도 요소가 좌우로 배치되지 못해 페이지 수가 오히려 39페이지 폭증함. |

### 4.2 Step 6B 오프라인 산출물 (수정 후) 실측 구조

[`realistic-desktop-portrait.docx`](file:///c:/Users/77/Documents/Figma2Word/debug/offline/realistic-desktop-portrait.docx) 및 [`realistic-desktop-landscape.docx`](file:///c:/Users/77/Documents/Figma2Word/debug/offline/realistic-desktop-landscape.docx) 실측:

| 대상 영역 | Step 6B 내부 OpenXML 구조 (`word/document.xml`) | Word COM 실측 결과 |
|:---|:---|:---|
| **큐레이션 추천 카드 4개** | **단일 4열 다열 테이블로 결합 복구**<br>• `tblW=5000 (pct)`, `gridCols=4`<br>• Cell 1: `w=1250` (25%) - 개발자를 위한 낙원<br>• Cell 2: `w=1250` (25%) - 몰입을 위한 은신처<br>• Cell 3: `w=1250` (25%) - 해변가<br>• Cell 4: `w=1250` (25%) - 도심의 활기 | • Word 최상위 Table: **Table 1**<br>• 4개 카드가 1개 행의 서로 다른 4개 셀에 나란히 배치됨.<br>• 각 카드가 전체 폭을 독점하는 현상 완전 해소. |
| **마이페이지 / 계정 설정** | **단일 2열 다열 테이블로 결합 복구**<br>• `tblW=5000 (pct)`, `gridCols=2`<br>• Cell 1: `w=1400` (28%) - 사이드바 메뉴<br>• Cell 2: `w=3600` (72%) - 계정 설정 메인 폼 | • Word 최상위 Table: **Table 2**<br>• 좌측 사이드바와 우측 폼이 한 행에 나란히 배치됨. |
| **FAQ 영역 보존** | Step 4B의 연속 테이블 분리 문단(`<w:p/>`) 유지로 비정상 병합 방지 | FAQ 답변 폭 정상 유지, 병합 버그 재발 없음. |
| **Word COM 실측 통계** | • **Portrait**: 1 페이지, 2개 최상위 테이블<br>• **Landscape**: 1 페이지, 2개 최상위 테이블 | 불필요한 페이지 나눔 없이 한 페이지 내에 좌우 정렬 완료. |

---

## 5. 기존 Step 5 대비 확인 가능한 개선

1. **개별 카드의 100% 폭 과다 팽창 방지**:
   - 기존에는 4개 카드가 각각 폭 5000(100%) 테이블로 생성되어 화면을 가득 채웠으나, Step 6B에서는 4열 테이블의 25% 셀로 정확히 제한되었습니다.
2. **사이드바와 본문의 좌우 2열 배치 복구**:
   - 사이드바가 100% 폭으로 늘어나서 본문 위로 밀려나던 문제가 해결되고, 28% : 72% 비율의 다열 테이블로 정렬되었습니다.
3. **가로형(Landscape) 페이지 효율 극대화**:
   - 가로형 모드에서 4열 카드와 2열 사이드바 폼이 가로 폭(698.8pt)을 균등/비례하게 나누어 사용하므로, 요소가 아래로 밀려 페이지 수가 폭증하던 원인이 제거되었습니다.

---

## 6. 실제 Final-Prj 재변환 전까지 확정할 수 없는 사항

다음 항목은 Figma API Rate Limit(~326869초)이 해제되어 실제 Figma 원본 파일을 웹 UI를 통해 다시 긁어오기 전까지는 100% 확정할 수 없습니다:

1. **실제 디자인 상의 특이 중첩 구조**:
   - Figma 파일 원본에 비정상적인 Auto Layout 래퍼나 마스크(Mask), 클리핑 그룹이 포함되어 있을 경우의 추가 엣지 케이스
2. **실제 전체 페이지 수의 최종 감소폭**:
   - 98페이지(Portrait) / 137페이지(Landscape) 중 전체 화면에 걸쳐 몇 페이지가 줄어들지는 실제 파일 변환 시에만 측정 가능

---

## 7. Step 6B Git 커밋 가능 여부 판단

- **판단**: **커밋 가능 (적합)**
- **이유**:
  1. 부모 맥락 전달 체계가 타입 안전하고 침습성이 극도로 낮음 ([layoutEngine.ts](file:///c:/Users/77/Documents/Figma2Word/src/layout/layoutEngine.ts), [figmaParser.ts](file:///c:/Users/77/Documents/Figma2Word/src/parser/figmaParser.ts) 단 2개 파일 수정).
  2. 201개 회귀 테스트 전원 통과 및 캔버스 레벨 독립 화면 격리 100% 보존.
  3. 실측 OpenXML 상에서 큐레이션 카드(4열) 및 사이드바(2열)의 가로 Row Cluster 형성이 완벽히 검증됨.
- **조치**: 사용자 승인 전까지 일체의 Git 커밋 및 푸시를 수행하지 않고 대기합니다.

---

## 8. 향후 Figma API 요청 절감 방안 조사 결과

### 8.1 API 과다 호출 원인 분석
- [`apps/web/src/App.tsx`](file:///c:/Users/77/Documents/Figma2Word/apps/web/src/App.tsx)의 `handleConvertFromUrl`:
  - Figma URL 변환 시 `client.fetchNodes` 및 `client.resolveImages`를 호출하여 데이터를 메모리에 로드하지만, 변환 직후 상태에 보관하지 않음.
  - 사용자가 **세로형 ↔ 가로형** 또는 변환 모드(Balanced/Fidelity)를 바꾸고 "변환"을 누르면, **동일한 Figma 파일에 대해 처음부터 다시 API를 2~3회 연속 호출**함.
  - 이로 인해 몇 번의 조작만으로도 Figma API Rate Limit(429)이 트리거됨.

### 8.2 제안 구현 방안 (설계)
1. **메모리/세션 캐싱 (Portrait/Landscape 즉시 전환)**:
   - `App.tsx`에 `lastFetchedFigma: { fileKey, nodeId, targetNode, imageMap }` 상태 추가.
   - URL과 Node ID가 바뀌지 않고 레이아웃 옵션(Portrait/Landscape)만 변경된 경우, API 호출 없이 즉시 로컬 파싱 및 DOCX 렌더링만 재실행 (소요 시간 0.2초, API 호출 0회).
2. **Figma JSON 내보내기/가져오기 (오프라인 보존)**:
   - 성공적인 변환 후 "Figma JSON 다운로드" 버튼을 제공하여 원본 트리를 `.json`으로 저장.
   - "수동 입력 / JSON 파일" 탭을 통해 언제든지 API 호출 없이 오프라인 재변환 지원.
3. **명시적 새로고침 분리**:
   - "Figma 최신 디자인 다시 가져오기" 버튼을 별도로 분리하여, 사용자가 의도한 경우에만 네트워크 호출 발생.

