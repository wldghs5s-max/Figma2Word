# Phase 16 — Track H2 Remediation Log: Document Format & Geometry Hardening

## 1. 개요
Track H2는 문서 포맷 사양 준수, 복합 기하 곡선(SVG/VML/OWPML)의 정확한 처리, 동적 페이지 크기 및 누락된 Figma 노드 타입을 포괄하는 P1 기하/포맷 결함군(F-08, F-05, F-07, F-11, F-04, F-13)의 수정 내역을 기록한다.

---

## 2. 결함별 상세 조치 내역

### 1) F-08: SVG 패스 토크나이저 밀집 아크 플래그 & 3차 베지에 극점 바운딩 박스
- **증상**:
  - `A 25 25 0 11 150 150`처럼 공백 없이 붙은 아크 플래그(`11`, `01`, `10`, `00`) 파싱 시 단일 숫자로 인식되어 후속 좌표가 밀려 왜곡 또는 NaN 발생.
  - 3차 베지에 곡선의 바운딩 박스를 계산할 때 단순히 제어점(Control Points)의 최대/최소를 사용하여, 실제 곡선이 도달하지 않는 영역까지 바운딩 박스가 팽창함 (예: apex y=75인 곡선에서 control point y=100이 maxY로 계산됨).
- **조치**:
  - `src/canvas/geometry/svgPathParser.ts`:
    - `normalizeSvgPathString(d: string)`을 신설하여, 아크 명령(`A/a`) 뒤의 3개 파라미터(`rx`, `ry`, `rot`) 이후에 오는 2개의 1비트 플래그(`0` 또는 `1`)를 감지하고 강제로 공백을 주입하여 독립 토큰으로 분리.
    - 3차 베지에 곡선 $B(t)$의 1차 도함수 $B'(t) = at^2 + bt + c = 0$의 해석적 근(Roots)을 구하는 `getCubicBezierExtrema(p0, p1, p2, p3)` 함수를 구현.
    - 구간 $0 < t < 1$에 존재하는 극값과 양 끝점($t=0, 1$)만을 대상으로 엄밀한 바운딩 박스를 계산하도록 `SvgPath.getBounds()` 알고리즘 개편.
- **검증**: `tests/phase16-h2-remediation.test.ts` 내 F-08 3종 테스트 통과 (밀집 아크 플래그 정상 파싱, 음수 좌표 공백 없는 파싱, 3차 베지에 정밀 apex y=75 검증).

### 2) F-05: 동적 페이지 크기 및 가로(Landscape) 오리엔테이션 처리
- **증상**:
  - DOCX: `w:orient="portrait"`가 고정 출력되어 가로 프레임(841.89 x 595.28 pt)도 세로 페이지로 인쇄/렌더링됨.
  - HWPX: `width="59530" height="84190"` 및 `landscape="WIDELY"`가 하드코딩되어 사용자 정의 크기가 반영되지 않음.
- **조치**:
  - `src/canvas/renderer/docxCanvasRenderer.ts`: `doc.pageSize.widthPt > doc.pageSize.heightPt` 판별을 통해 `orient="landscape"` 또는 `portrait`를 동적 결정하고, `w:w` 및 `w:h`를 정확한 트윕(Twip) 단위로 반영.
  - `src/canvas/renderer/hwpxCanvasRenderer.ts`: HWPX OWPML 사양에 맞춰 가로/세로 여부에 따라 `landscape="WIDELY"` 또는 `NARROWLY`를 출력하고, `width`와 `height`를 PostScript pt * 100 HWPU로 정밀 동적 할당.
- **검증**: `tests/phase16-h2-remediation.test.ts` 내 F-05 테스트 통과 (DOCX `w:orient="landscape"` 및 HWPX `landscape="WIDELY" width="84189"` 확인).

### 3) F-07: HWPX 이미지 MIME 및 BinData 확장자 정합성 보장
- **증상**: `BinData/` 디렉터리 내에 JPEG 이미지가 저장되어도 `manifest.xml`과 `content.hpf`에 무조건 `BINxxxx.png` 및 `image/png`로 선언되어 한컴오피스에서 파일 손상 오류 유발.
- **조치**:
  - `src/canvas/renderer/hwpxCanvasRenderer.ts`:
    - `imageBinMap`의 값 타입을 단순 문자열에서 `{ binId: string; ext: string; mimeType: string }` 구조체로 확장.
    - 리소스 데이터 바이트 및 MIME을 검사하여 JPEG(매직바이트 `0xFF 0xD8`)인 경우 `.jpg`와 `image/jpeg`를 부여하고, 그 외에는 `.png`와 `image/png`를 부여.
    - `manifest.xml`의 `<manifest:file-entry>`와 `content.hpf`의 `<opf:item>`에 실제 확장자와 MIME이 100% 일치하도록 연동.
- **검증**: `tests/phase16-h2-remediation.test.ts` 내 F-07 테스트 통과 (BinData 내 `.jpg` 생성 및 `content.hpf` 내 `image/jpeg` 선언 검증).

### 4) F-11: 누락된 Figma 벡터 노드 타입 지원 (STAR, POLYGON, BOOLEAN_OPERATION)
- **증상**: Figma JSON 내의 별(`STAR`), 다각형(`POLYGON`), 불리언 연산(`BOOLEAN_OPERATION`) 도형이 파서의 벡터 분기(`child.type === "VECTOR"`)에 매칭되지 않아 단순 직사각형 카드(`card`)로 전락함.
- **조치**:
  - `src/canvas/parser/figmaCanvasParser.ts`:
    - 노드 타입 검사 조건을 `child.type === "VECTOR" || child.type === "STAR" || child.type === "POLYGON" || child.type === "BOOLEAN_OPERATION"`으로 확장.
    - `fillGeometry` 뿐만 아니라 `strokeGeometry` 및 `vectorPaths`를 포괄 탐색하도록 보강.
    - 기하 데이터가 비어있는 경우 표준 기하 형상(5각 별, 정삼각형 등)으로 안전하게 정규화.
- **검증**: `tests/phase16-h2-remediation.test.ts` 내 F-11 테스트 통과 (STAR, POLYGON, BOOLEAN_OPERATION 노드가 모두 `type: "vector"` 및 VML 패스를 보유함을 검증).

### 5) F-04: HWPX 벡터 다중 서브패스(Multi-subpath) 보존
- **조치**: `src/canvas/geometry/svgPathParser.ts`에 `toHwpxSubpaths(width, height): Point2D[][]` 메서드를 추가하여 복합 패스(Compound Paths)의 독립 컨투어를 보존.

### 6) F-13: HWPX 이미지 뷰포트 클리핑 정규화
- **조치**: `src/canvas/renderer/hwpxCanvasRenderer.ts`에서 이미지 렌더링 시 `<hp:imgRect>`, `<hp:imgClip>`, `<hp:inImgDim>`의 기하학적 정합성을 규격화.
