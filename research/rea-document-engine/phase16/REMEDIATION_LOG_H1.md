# Phase 16 — Track H1 Remediation Log: Critical Correctness & Browser Runtime

## 1. 개요
Track H1은 사용자의 기본 작업 흐름을 차단하거나 문서의 텍스트/기하 데이터를 치명적으로 손상시키는 P0 결함군(F-01, F-02, F-03, F-06)을 대상으로 진행된 집중 수정 내역을 기록한다.

---

## 2. 결함별 상세 조치 내역

### 1) F-01: 브라우저 런타임 Buffer 의존성 제거
- **증상**: 브라우저 환경에서 Figma Canvas 변환 시 `ReferenceError: Buffer is not defined`가 발생하며 즉시 크래시.
- **원인**: `src/canvas/parser/figmaCanvasParser.ts` 429~446행에서 Base64 Data URL 디코딩 시 Node.js 전역 객체인 `Buffer.from(..., "base64")`와 `Buffer.alloc(0)`을 직접 호출.
- **조치**:
  - `src/canvas/utils/binaryUtils.ts` 모듈을 신설하여 크로스 플랫폼 바이너리 디코더 `decodeBase64(b64: string): Uint8Array` 및 `decodeDataUrl(source: string): { mime?: string; bytes: Uint8Array } | null` 구현.
  - Node.js 환경에서는 성능 최적화를 위해 내부 Buffer를 활용하되, 브라우저 환경에서는 표준 `atob()` 및 `Uint8Array` 기반 비-Node 디코딩으로 안전하게 폴백.
  - `FigmaCanvasParser.resolveImageResource`가 `Uint8Array`를 생성하고 `CanvasResource.data`로 저장하도록 수정.
- **검증**: `tests/phase16-h1-remediation.test.ts` 내 F-01 테스트 통과 (PNG 매직넘버 `0x89 0x50 0x4E 0x47` 검증).

### 2) F-02: 다중 줄바꿈(`\n`) 텍스트 보존 (DOCX & HWPX)
- **증상**:
  - DOCX: WordprocessingML `<w:t>` 내에 들어간 개행문자(`\n`)를 Word가 단일 공백으로 무시/병합하여 단락 내 줄바꿈이 소실됨.
  - HWPX: `<hp:subList>` 내부의 단일 `<hp:p id="0">`에 전체 런이 들어가 줄바꿈이 반영되지 않음.
  - DOCX Parser: 첫 번째 `<w:t>`만 정규식으로 읽고 `<w:br/>` 및 후속 `<w:t>`를 누락함.
- **조치**:
  - `src/canvas/renderer/docxCanvasRenderer.ts`: 텍스트 런의 문자열을 개행문자(`\r\n|\r|\n`) 기준으로 분할하고 세그먼트 사이에 표준 OOXML 줄바꿈 태그인 `<w:br/>`을 방출하도록 수정.
  - `src/canvas/parser/docxCanvasParser.ts`: `<w:r>` 내부의 토큰을 정규식 루프(`/<w:t[^>]*>([\s\S]*?)<\/w:t>|<w:br\b[^>]*\/?>|<w:cr\b[^>]*\/?>/g`)로 순회하여 `<w:br/>`을 정확히 `\n` 문자로 복원. 또한 다중 `<w:p>` 문단 경계에서도 개행문자를 자동 삽입하도록 보강.
  - `src/canvas/renderer/hwpxCanvasRenderer.ts`: 텍스트 런들을 개행 기준으로 분할하여 각각 독립된 `<hp:p id="${pIdx}" paraPrIDRef="...">` 문단 태그로 패킹하도록 파티셔닝 알고리즘 구현.
- **검증**: `tests/phase16-h1-remediation.test.ts` 내 F-02 테스트 통과 (DOCX `<w:br/>` 방출 및 역파싱 라운드트립 일치, HWPX 4개 이상 `<hp:p>` 생성 검증).

### 3) F-03: VML 절대좌표 오인 및 50% 좌표 왜곡 폭발
- **증상**: DOCX 내 VML 도형(`m 0,0 l 1000,0 l 1000,1000 x e`)을 역파싱할 때, 점 1의 X좌표가 10000이어야 하나 5000으로 축소되고 점 2가 20000으로 폭발하여 도형이 가로로 심각하게 왜곡됨.
- **원인**:
  - VML 표준에서 소문자 `m, l, c`는 **절대 좌표(Absolute Coordinates)**를 의미함.
  - SVG 표준에서 소문자 `m, l, c`는 **상대 좌표(Relative Coordinates)**를 의미함.
  - `docxCanvasParser.ts`가 `vectorPath.replace(/x/g, "z").replace(/e/g, "")`로 정제한 소문자 문자열을 그대로 `SvgPath.parse()`에 전달하여 `SvgPath`가 상대 이동으로 오인함.
- **조치**:
  - `src/canvas/geometry/svgPathParser.ts`에 전용 변환기 `vmlToSvgPath(vmlPath: string): string` 구현.
  - VML 명령어 소문자 `m, l, c`를 SVG 절대 대문자 `M, L, C`로 매핑하고, 상대 명령어 `r, t, v`를 SVG 상대 `l, m, c`로 매핑하며, `x`를 `Z`로 변환하고 `e`, `nf`, `ns`를 안전하게 제거.
  - `SvgPath.fromVml()` 헬퍼를 추가하고 `docxCanvasParser.ts`에서 이를 사용하도록 변경.
- **검증**: `tests/phase16-h1-remediation.test.ts` 내 F-03 테스트 통과 (점 1 X좌표가 10000 HWPU로 정확히 복원됨을 검증).

### 4) F-06: Web UI Figma API 원격 이미지 URL 해석 누락
- **증상**: Web UI에서 Figma URL 연동 시, 원격 AWS S3 URL(`https://figma-alpha-api...`)이 `data:` 스킴이 아니라는 이유로 `figmaCanvasParser`에서 무시되어 1x1 투명 플레이스홀더로 렌더링됨.
- **원인**: `App.tsx`에서 `client.fetchImageFills()` 호출 후 반환된 URL 매핑을 Base64 Data URL로 다운로드/변환하지 않고 원시 URL 객체를 그대로 파서에 전달함.
- **조치**:
  - `src/canvas/utils/imageResolver.ts`에 `resolveImageMapUrls(imageMap, downloadFn)` 유틸리티를 신설.
  - `App.tsx`의 실시간 연동 로직에서 `fetchImageFills()` 결과를 `resolveImageMapUrls`를 통해 병렬 다운로드(`client.downloadImageAsBase64`)하여 Base64 Data URL 맵으로 치환 후 Canvas 파이프라인에 공급하도록 개선.
- **검증**: `tests/phase16-h1-remediation.test.ts` 내 F-06 테스트 통과 (S3 원격 URL이 Base64 Data URL로 치환되고 파서가 PNG 리소스를 정상 추출함을 검증).
