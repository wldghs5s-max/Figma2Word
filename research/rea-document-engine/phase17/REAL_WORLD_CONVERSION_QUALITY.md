# Phase 17 — Real-World Document Conversion Quality & Layout Fidelity

## 1. 개요 및 설계 철학

Figma 디자인 문서를 Microsoft Word(`.docx`)와 한컴오피스 한글(`.hwpx`)로 변환할 때 가장 빈번하게 발생하는 품질 저하는 다음과 같다:
1. **다중 프레임 페이지 매핑 유실**: 여러 대지(Frame)로 분리된 페이지들이 하나의 세로 캔버스에 비정상적으로 누적되거나 잘리는 현상.
2. **혼합 오리엔테이션 미지원**: 1페이지는 표지(세로), 2페이지는 와이드 대시보드(가로)일 때 문서 전체가 세로로 강제되어 우측 콘텐츠가 잘리는 현상.
3. **폰트 메트릭 및 줄바꿈 불일치**: Figma의 줄바꿈과 텍스트 박스 높이 차이로 인해 텍스트가 박스 밖으로 넘치거나 줄간격이 벌어지는 현상.
4. **도형 및 이미지 왜곡**: 둥근 모서리가 한컴오피스에서 사각형으로 렌더링되거나, 이미지의 `COVER` 크롭 비율이 무시되어 상하좌우가 왜곡되는 현상.

Phase 17에서는 이러한 실무 환경의 품질 저하 요소를 근본적으로 해결하였다.

---

## 2. 레이아웃 매핑 개선 사항

### 2.1. 다중 프레임 페이지 매핑 (Multi-Frame Page Mapping)
- Figma Canvas의 `discoverPageFrames()`는 최상위 FRAME 및 COMPONENT 노드들을 읽기 순서(위에서 아래, 왼쪽에서 오른쪽)로 정렬하여 개별 `CanvasPage` 객체로 분할한다.
- 각 `CanvasPage`는 독립적인 `bounds` (`{ x: 0, y: 0, width, height }`)와 `backgroundColor`를 보유하며, 개별 페이지 단위로 스케일링 정책(`fit-a4` 등)이 적용된다.

### 2.2. 혼합 오리엔테이션 (Mixed Orientation Sections)
실제 비즈니스 제안서나 기술 보고서는 세로 본문 페이지와 가로 데이터 테이블/다이어그램 페이지가 혼재되어 있다.

#### Microsoft Word (DOCX) 처리
- 이전: 문서 끝의 `<w:sectPr>` 단일 태그로 문서 전체의 가로/세로를 통일하여 혼합 페이지에서 잘림 발생.
- 개선: 연속된 페이지 간 가로/세로 오리엔테이션 또는 크기(`widthPt`, `heightPt`) 변경이 감지되면, 해당 페이지 단락의 `<w:pPr>` 내에 `<w:sectPr><w:type w:val="nextPage"/><w:pgSz w:orient="..."/></w:sectPr>`을 주입하여 Word 네이티브 구획 분할을 자동으로 형성한다.

#### 한컴오피스 (HWPX) 처리
- 이전: 첫 번째 페이지에만 `<hp:secPr id="0">`을 생성하여 두 번째 페이지의 가로 전환이 무시됨.
- 개선: 이전 페이지와 치수 및 방향 차이가 발생하는 페이지 단락에 새로운 `<hp:secPr id="${pIdx}">`를 방출하여 `landscape="WIDELY"` 또는 `landscape="NARROWLY"` 구획을 개설한다.

---

## 3. 타이포그래피 및 텍스트 렌더링 품질

1. **줄바꿈 보존**:
   - Word: 런 내 개행문자(`\n`)를 `<w:br/>`로 방출.
   - HWPX: 개행 발생 시 `<hp:subList>` 내에 독립된 문단 `<hp:p id="${pIdx}">`를 생성하여 줄바꿈을 완벽 보존.
2. **동적 폰트 패밀리 매핑**:
   - `resolveEastAsiaFont()`를 통해 `Pretendard`, `맑은 고딕`, `Noto Sans KR`, `Nanum` 등 한국어 글꼴을 식별하고, Word의 `<w:rFonts w:ascii="..." w:eastAsia="..."/>` 및 HWPX의 7개 언어군(`<hh:fontRef hangul="..." latin="..." ...>`)에 동적 매핑.
3. **수직 정렬 (Vertical Alignment)**:
   - 버튼, 배지, 테이블 셀 텍스트의 수직 편차를 방지하기 위해 Word VML의 `v-text-anchor: top|middle|bottom` 및 HWPX의 `<hp:subList vertAlign="TOP|CENTER|BOTTOM">` 매핑 완비.

---

## 4. 이미지 및 벡터 도형 품질

1. **이미지 Cover 크롭 정밀도**:
   - 96 DPI CSS Pixel 기준 1 px = 0.75 pt = 75 HWPU의 엄밀한 변환비율 적용.
   - 원본 이미지 가로세로비(`arImg`)와 컨테이너 가로세로비(`arBox`)의 편차를 계산하여, 이미지가 가로로 넓은 경우 좌우 대칭 클리핑, 세로로 긴 경우 상하 대칭 클리핑(`hp:imgClip`)을 수행.
   - `<hp:imgDim>`과 `<hp:inImgDim>`을 모두 선언하여 구버전 및 최신 한컴오피스 뷰어 모두에서 100% 정상 비율 유지.
2. **네이티브 라인 및 둥근 사각형**:
   - 구분선(Line)을 사각형 폴백 대신 KS X 6101 네이티브 `<hp:line>`으로 직렬화.
   - 모서리 곡률(`ratio`)을 0–50 범위로 엄격 클램핑하여 Hancom XML 파서 경고 및 왜곡 방지.
