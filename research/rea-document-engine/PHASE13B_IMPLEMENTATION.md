# Phase 13B: Canvas 듀얼 엔진 호환성·무손실성·시각적 품질 개선 구현 보고서

## 1. 개요 (Executive Summary)

Phase 13B에서는 Phase 13A에서 구축된 Canvas IR 기반 DOCX/HWPX 듀얼 렌더링 엔진의 코드 리뷰 지적 사항을 집중 개선하였다.
주요 개선 사항은 다음과 같다:

1. **DOCX 이미지 관계 및 XML 속성 파싱 취약성 해결**: 속성 순서 무관 XML 속성 파서(`parseXmlAttributes`) 구축, 외부 관계 배제 및 경로 순회 방지 적용.
2. **라운드트립 요소 무손실성 달성 (100.0% 복원)**:
   - `<v:line>` 자가 닫힘 태그 파싱 오류를 수정하여 누락되던 6~10개의 라인 요소를 전수 복구.
   - `o:title`, `alt` 속성을 활용한 Figma 원본 노드 ID 및 요소 이름 보존.
   - 요소 보존율: 1차(760/760), 2차(802/802), 3차(784/784) 전원 100% 달성.
3. **폰트 정보 손실 수정 및 한글/동아시아 서체 정밀 매핑**:
   - `docxCanvasRenderer.ts`: 고정 `Calibri`/`맑은 고딕`을 탈피하고, `resolveEastAsiaFont`를 통해 `Pretendard`, `맑은 고딕`, `Noto Sans KR` 등 한글 서체를 Latin과 EastAsia 양쪽에 정밀 보존.
   - `hwpxCanvasRenderer.ts`: KS X 6101 표준 7개 언어군(`hangul`, `latin`, `hanja`, `japanese`, `other`, `symbol`, `user`) 전체에 걸친 동적 폰트 레지스트리 구축 및 각 런의 `charPr`에 정확한 `fontId` 매핑.
4. **VML Textbox 내부 여백(`inset`) 및 줄 간격(`lineHeight`) 반영**:
   - `innerPaddingPt`를 VML `<v:textbox inset="left,top,right,bottom">`으로 직렬화 및 역추출.
   - `lineHeightPt`를 `<w:spacing w:line="..." w:lineRule="exact"/>`로 반영.
5. **입력 스코프 및 진단 경고 강화**:
   - VML Canvas 전용 스코프를 명시하고, 비지원 요소(DrawingML `<w:drawing>`, 네이티브 표 `<w:tbl>`, 본문 직접 텍스트) 발견 시 `diagnostics.warnings`에 명확히 기록.

---

## 2. 수정한 파일 목록

1. `src/canvas/parser/docxCanvasParser.ts`:
   - `parseXmlAttributes(tagStr: string)` 함수 추가 (속성 순서 독립 파싱)
   - `<v:line>` 자가 닫힘 태그 및 `from`/`to` 좌표 기반 bounds 역계산 구현
   - 자가 닫힘 태그와 쌍 태그 분리 정규식 적용으로 내부 `<w:jc/>`로 인한 조기 종료 버그 수정
   - `alt` 속성을 통한 `elem.id`, `o:title` 속성을 통한 `elem.name` 복원
   - `inset` 속성을 통한 `innerPaddingPt` 복원
   - DrawingML(`<w:drawing>`), 네이티브 표(`<w:tbl>`), 본문 텍스트 진단 경고 추가
2. `src/canvas/renderer/docxCanvasRenderer.ts`:
   - `resolveEastAsiaFont(fontFamily)` 함수 추가 및 `<w:rFonts>`의 `w:ascii`, `w:hAnsi`, `w:eastAsia`, `w:cs` 동적 매핑
   - 모든 VML 도형에 `alt="${elem.id}"`, `o:title="${elem.name}"` 메타데이터 부여
   - `<v:textbox>`에 `inset="${left}pt,${top}pt,${right}pt,${bottom}pt"` 인라인 여백 적용
   - `lineHeightPt` 기반 `<w:spacing>` 줄 간격 적용
3. `src/canvas/renderer/hwpxCanvasRenderer.ts`:
   - `CharPrKey`에 `fontId` 추가
   - 문서 전체에서 사용된 고유 서체를 수집하여 동적 `fontRegistry` 생성
   - KS X 6101 표준 7개 언어군(`<hh:fontface lang="...">`) 전수 등록
   - `<hh:charPr>`의 `<hh:fontRef>`에 해당 `fontId` 매핑
   - `<hp:drawText name="...">`에 요소 메타데이터 보존 및 `<hp:rect>` 최소 라인 크기 보정
4. `src/canvas/index.ts`:
   - 신규 유틸리티 `resolveEastAsiaFont`, `parseXmlAttributes` 공개 export
5. `tests/canvas-engine.test.ts`:
   - XML 속성 순서 무관성 테스트 추가
   - 라운드트립 무손실성(ID, Name, Type, Bounds, Text, Padding, Typography) 엄밀 검증 추가
   - DrawingML/Table 비지원 요소 감지 경고 테스트 추가
   - 자체 완결형(self-contained) E2E 파이프라인 테스트 구축

---

## 3. 핵심 문제 해결 상세

### 3.1 라운드트립 요소 누락 원인 규명 및 수정
- **원인 1**: `<v:line id="..." from="x1,y1" to="x2,y2"/>`는 자가 닫힘 태그(`/>`)이다. 이전의 정규식 `/<v:(...)\b[\s\S]*?<\/v:\1>/g`는 닫는 태그 `</v:line>`를 요구하여 모든 라인 요소를 건너뛰었다.
- **원인 2**: `<v:roundrect>` 내부의 텍스트박스 단락 속성 `<w:jc w:val="left"/>`가 자가 닫힘 슬래시(`/>`)를 포함하고 있어, 비탐욕적 매칭 `(?:\/>|<\/v:\1>)`이 텍스트 런을 읽기 전에 조기 종료되었다.
- **해결책**:
  ```typescript
  const shapeRegex =
    /<v:(rect|roundrect|shape|line|oval|polyline)\b[^>]*\/>|<v:(rect|roundrect|shape|line|oval|polyline)\b[\s\S]*?<\/v:\2>/g;
  ```
  자가 닫힘 태그(속성 내부에 `>`가 없음)와 쌍 태그를 명확히 분기하고, 속성 파싱 시 여는 태그(`<v:rect ...>`)만을 대상으로 한정하여 내부 태그의 `style` 속성에 의한 덮어쓰기 현상을 원천 방지함.

### 3.2 폰트 및 한국어 타이포그래피 보존
- **기존 문제**: DOCX 렌더러가 모든 런에 대해 `w:eastAsia="맑은 고딕"`, `w:ascii="Calibri"`로 하드코딩되어 `Pretendard`, `Noto Sans KR` 등의 디자인 서체가 유실됨.
- **해결책**:
  - `resolveEastAsiaFont` 유틸리티를 구현하여, 한글 지원 폰트(Pretendard, 맑은 고딕, Noto Sans KR 등)는 Latin과 EastAsia 양쪽에 일치시켜 Word가 동일 서체로 렌더링하도록 유도.
  - 영문 전용 폰트(Inter, Roboto 등)인 경우에만 EastAsia 폴백으로 맑은 고딕을 지정.
  - HWPX에서는 7개 OWPML 표준 언어군 전체에 해당 폰트를 등록하고 `fontRef`로 정확히 연결.

---

## 4. 빌드 및 테스트 상태
- TypeScript 빌드: `npm run build` (`tsc`) 무오류 0 경고
- 전체 테스트: 48개 테스트 스위트, 292개 테스트 100% 통과 (Flow 및 Canvas 회귀 0건)
