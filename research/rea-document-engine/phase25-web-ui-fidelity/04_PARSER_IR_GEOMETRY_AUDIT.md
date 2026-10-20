# Figma2Word — Phase 25: 작업 D — Parser 및 Canvas IR 기하학 정밀 감사 보고서

**문서 번호**: P25-DELIV-04  
**작성 일자**: 2026-10-20  
**대상 프로젝트**: `펜테크 3차 디자인` (Figma Node `756-2`)  
**분석 대상**: `src/canvas/parser/figmaCanvasParser.ts` 및 Canvas IR  

---

## 1. 개요

본 감사는 Figma REST API로부터 수집된 원본 데이터(Figma Node)가 `FigmaCanvasParser`를 거쳐 `CanvasDocument` IR(Intermediate Representation)로 변환되는 전 과정의 기하학적 정밀도와 속성 보존 여부를 추적하고 검증하기 위해 수행되었다.

추적 파이프라인:
```
Figma JSON Node → FigmaCanvasParser → CanvasDocument IR → DocxCanvasRenderer → OOXML Word ML
```

---

## 2. 탑레벨 노드 탐색 및 페이지 프레임 선별 감사

### 2.1 Figma Canvas 노드 구조
- 원본 JSON: `디자인 보완` (`CANVAS`, Node `756:2`)
- 자식 노드 총 수: 30개
- 노드 유형 분포:
  - `FRAME`: 17개
  - `GROUP`: 1개 (`📏 Container`, Node `763:5084`)
  - `RECTANGLE`: 8개 (스크린샷 참조 이미지 등)
  - `TEXT`: 4개 (작업자 메모, 피드백 코멘트 등)

### 2.2 `discoverPageFrames()` 결함 발견

기존 `figmaCanvasParser.ts`의 탑레벨 프레임 탐색 코드:
```typescript
if (
  child.type === "FRAME" ||
  child.type === "COMPONENT" ||
  child.type === "GROUP"
) {
  candidateFrames.push(child);
}
```

#### 심각한 결함 진단:
1. **Redline 플러그인 가이드 오버레이 오인식**:
   - Node `763:5084` (`📏 Container`)는 Figma 디자이너가 간격 및 패딩 측정을 위해 실행한 플러그인 생성 그룹이다.
   - 내부 자식 노드: `OUTER_SPACING-OUTER_SPACING`, `INNER_PADDING-TOP`, `INNER_PADDING-RIGHT` 등 45개의 치수선/오버레이 도형들로 구성됨.
   - 바운딩 박스 크기: **1920 × 3361 px**.
   - 파서가 이를 독립적인 문서 페이지(Page 5)로 인식하여, Word 문서에 2520pt(35인치) 높이의 검은색 치수선 페이지를 생성함.
2. **해결 방안**:
   - `discoverPageFrames()`에서 `child.type === "GROUP"`인 경우, 측정 도구/플러그인 명명 규칙(`📏`, `Container`, `Redline`, `Measure`, `INNER_PADDING`, `OUTER_SPACING` 등)을 검사하여 화면 디자인이 아닌 보조 가이드 그룹은 자동 제외해야 함.

---

## 3. 좌표 변환 및 Auto Layout 계층 기하학 감사

### 3.1 부모-자식 상대 좌표 계산의 정확성
- Figma API는 Auto Layout 프레임 내부의 모든 중첩 자식 노드에 대해서도 전역 좌표계인 `absoluteBoundingBox`를 사전에 계산하여 제공함.
- `FigmaCanvasParser`는 자식 노드의 좌표를 다음과 같이 계산함:
  ```typescript
  const relX = childBox.x - frameBox.x;
  const relY = childBox.y - frameBox.y;
  const xPt = relX * scaleX;
  const yPt = relY * scaleY;
  ```
- **감사 결과**:
  - 중첩 Auto Layout 구조에서도 Figma가 제공하는 `absoluteBoundingBox`를 기준으로 최상위 아트보드 프레임(`frameBox`)의 원점을 차감하므로, 중첩 계층에 따른 좌표 누적 왜곡이나 Double-Offsetting 버그는 발생하지 않음.
  - 회전(`rotation`)이 0인 일반 UI 요소에 대해 좌표 변환의 기하학적 정합성은 100% 유지됨.

### 3.2 Stage 7 `isCenteredInParent` 수직 정렬 검증
- Stage 7에서 도입된 수직 중앙 정렬 감지 로직:
  - 부모 높이 대비 자식 텍스트의 상하 여백 대칭성을 검사(`Math.abs(topGap - bottomGap) <= 2.5`)하여 버튼/배지 텍스트를 `verticalAlign: "center"`로 정규화함.
- **감사 결과**:
  - `펜테크 3차 디자인`의 버튼(`검색`, `초기화`, `적용`, `신규등록`) 및 필터 태그에서 수직 중앙 정렬이 정상 작동함.
  - `isVerticalStack` 가드(`layoutMode === "VERTICAL" && children.length > 1`) 및 `parentBox.height < 600` 조건이 유효하게 작동하여, 다단 카드나 복합 목록 컨테이너가 잘못 중앙 정렬되는 왜곡은 전혀 발생하지 않음.

---

## 4. 텍스트 박스 기하학과 줄바꿈(Typography Wrap) 감사

### 4.1 Auto-Resize 텍스트 박스 너비 분석
대표적인 줄바꿈 파손 사례인 Node `759:1538` 추적:
- **Node ID**: `759:1538`
- **Node Type**: `TEXT`
- **텍스트 내용**: `"대시보드 / 사업장 관리 / 사업 관리"` (22자)
- **Figma 스타일**:
  - `fontFamily`: `"Pretendard"`
  - `fontSize`: 14 px
  - `textAutoResize`: `"WIDTH_AND_HEIGHT"`
  - `absoluteBoundingBox`: `{ width: 188 px, height: 17 px }`

### 4.2 변환 파이프라인 상의 치수 추적:
1. **Parser 산출물**:
   - `scale = 0.75`
   - `wPt = 188 * 0.75 = 141.0 pt`
   - `hPt = 17 * 0.75 = 12.75 pt`
   - `fontSizePt = 14 * 0.75 = 10.5 pt`
   - `textAutoResize: "WIDTH_AND_HEIGHT"`
2. **Word OOXML 렌더링 결과**:
   - `<v:shape style="width:141pt;height:12.75pt;...">`
   - `<v:textbox inset="0pt,0pt,0pt,0pt">`
3. **Word 렌더링 엔진 내부 동작**:
   - Microsoft Word의 텍스트 렌더링 엔진(DirectWrite / GDI)은 Pretendard 웹폰트 메트릭 대신 시스템에 설치된 글꼴 메트릭(또는 대체 글꼴)을 사용함.
   - 글꼴의 자간, 여백 차이로 인해 `"대시보드 / 사업장 관리 / 사업 관리"`의 실제 렌더링 너비는 **약 145~147 pt**로 계산됨.
   - 텍스트 박스의 너비가 정확히 `141 pt`로 고정되어 있고 내부 줄바꿈 방지 플래그가 없으므로, Word는 너비 부족으로 판정하여 마지막 단어인 `"사업 관리"`를 2행으로 강제 개행함.
   - 박스 높이가 12.75pt로 고정되어 있어 2행으로 떨어진 텍스트가 아래쪽으로 겹치거나 잘려 보임.

### 4.3 결론 및 개선 방안
- `textAutoResize === "WIDTH_AND_HEIGHT"`인 한 줄 레이블/브레드크럼/버튼 텍스트는:
  1. 디자이너가 명시적으로 박스 너비를 제한한 것이 아니라 **텍스트 길이에 맞춰 자동으로 늘어나는 박스**이다.
  2. Word 폰트 렌더링 메트릭의 오차(2~4%)를 수용할 수 있도록 렌더러 단계에서 미세한 우측 완충 여백(Horizontal Buffer: 약 4~6pt 또는 +3%)을 부여하거나, OOXML 문단 속성에 `<w:noWrap/>`을 적용하여 단어 단위의 불필요한 줄바꿈을 완벽히 방지해야 한다.

---

## 5. 스타일 및 비주얼 속성 보존 감사

| Figma 속성 | Parser 변환 대상 | Canvas IR 속성 | DOCX 직렬화 결과 | 판정 |
| :--- | :--- | :--- | :--- | :--- |
| `fills` (SOLID) | 컨테이너 배경색 | `style.fillColor`, `fillOpacity` | `<v:fill color="..." opacity="..."/>` |  우수 |
| `fills` (TEXT) | 글자 색상 | `textRuns[i].fontColor` | `<w:rPr><w:color w:val="..."/></w:rPr>` |  우수 |
| `strokes` (SOLID) | 테두리 색상 및 두께 | `style.strokeColor`, `strokeWidth` | `<v:stroke color="..." weight="...pt"/>` |  우수 |
| `strokes` (DASH) | 점선 테두리 | `style.strokeDashed` | `<v:stroke dashstyle="dash"/>` |  우수 |
| `cornerRadius` | 둥근 모서리 | `style.cornerRadiusPt` | `<v:roundrect arcsize="..."/>` |  우수 |
| `effects` (DROP_SHADOW) | 그림자 효과 | `style.shadow` | `<v:shadow on="t" .../>` |  우수 |
| `imageMap` (HASH) | 이미지 리소스 매핑 | `resources.images` | `word/media/imageN.png` + `v:imagedata` |  우수 |

---

## 6. 감사 총평

1. **Parser의 기하학적 좌표 계산은 매우 견고함**:
   - Figma 전역 좌표계(`absoluteBoundingBox`) 기반의 상대 오프셋 산출은 Auto Layout 다단계 중첩 환경에서도 오차 없이 완벽히 동작함.
2. **개선 필요 지점 2가지 확인**:
   - **지점 1**: `discoverPageFrames()`에서 비화면 플러그인 가이드(`📏 Container`) 오인식 배제 필터링 필요.
   - **지점 2**: `textAutoResize === "WIDTH_AND_HEIGHT"` 텍스트 박스에 대해 렌더러 수준의 글꼴 메트릭 완충 여백 및 줄바꿈 방지 적용 필요.
