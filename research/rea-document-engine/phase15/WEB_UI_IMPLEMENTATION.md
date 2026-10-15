# Phase 15: Local Web UI Implementation Report (Track C)

## 1. 개요 및 목적

Phase 15 Track C에서는 사용자가 CLI 환경에 의존하지 않고 브라우저 상에서 시각적으로 Figma 디자인을 로드하고, 렌더링 엔진과 출력 포맷을 선택하여 Word(.docx) 및 한글(.hwpx) 문서를 원클릭으로 생성·다운로드할 수 있는 완전한 로컬 Web UI(`apps/web`)를 구축하였다.

---

## 2. 주요 UI/UX 컴포넌트 및 기능 설계

### 2.1 렌더링 엔진 선택 (Engine Selector)
- **Canvas IR Dual Engine (권장: 시각 충실도 0.87+)**:
  - Figma의 2차원 절대 좌표계를 보존하는 차세대 듀얼 엔진.
  - DOCX (VML 셰이프) 및 HWPX (OWPML 오브젝트)를 동시 또는 개별 출력.
- **Flow Engine (레거시: Word 전용)**:
  - 문단/표 기반의 1차원 흐름 재구성 엔진.

### 2.2 출력 포맷 선택 (Target Format Selector)
- **DOCX (Word)**: Microsoft Word 전용 오픈 오피스 문서 생성.
- **HWPX (한글)**: 한컴오피스 전용 KS X 6101 표준 문서 생성.
- **듀얼 (DOCX + HWPX)**: 동일한 Canvas IR을 기반으로 두 포맷 문서를 동시에 생성하여 일괄 다운로드 제공.

### 2.3 다각적 입력 모드 (Input Modes)
1. **Figma 샘플 프리셋 및 JSON**:
   - 7대 신규 합성 아키타입(단일 메모, 다중 보고서, 이미지 갤러리, 텍스트 아티클, 벡터 인포그래픽, 중첩 대시보드, 표/카드 하이브리드) 원클릭 프리셋 로드 지원.
   - 기존 실무 제안서 및 E2E 샘플 지원.
   - 로컬 Figma JSON/스냅샷 파일 업로드 지원 (대용량 메모리 최적화로 브라우저 동결 방지).
2. **🔄 DOCX → HWPX 직접 변환 탭 (신규)**:
   - 사용자가 기존에 생성된 `.docx` 파일을 업로드하면, `DocxCanvasParser`가 VML 및 텍스트박스를 Canvas IR로 역파싱한 뒤 `HwpxCanvasRenderer`를 통해 즉시 `.hwpx`로 재렌더링하여 다운로드 제공.
3. **Figma URL 라이브 연동**:
   - Figma 파일 키와 Personal Access Token(PAT)을 통한 원격 실시간 AST 및 이미지 가져오기 지원.

### 2.4 실시간 구조 통계 및 진단 패널 (Canvas Diagnostics)
- 페이지 수, 총 요소 수
- 세부 요소 카운터: 텍스트(Text), 카드(Card), 이미지(Image), 벡터(Vector), 원형(Oval)
- 변환 소요 시간 (ms) 실시간 표시
- 스키마 호환성 및 경고 목록 실시간 표시

---

## 3. 브라우저/Vite 번들링 호환성 확보

### 3.1 Node-only 모듈 분리 및 호환성 처리
- `DocxCanvasParser`와 `HwpxCanvasRenderer`에서 Node.js 전용 모듈(`fs`, `path`) 의존성을 제거하고 브라우저 표준 `Uint8Array`, `ArrayBuffer`, `Blob` 객체를 지원하도록 리팩토링.
- 대용량 바이너리(이미지 헤더 등) 바이트 리딩 시 `Buffer.readUInt32BE` 대신 비트 연산자 시프트 방식을 적용하여 브라우저 환경 완벽 호환 달성.

### 3.2 빌드 검증 (`npm --prefix apps/web run build`)
```
> web@0.0.0 build
> tsc -b && vite build

✓ 50 modules transformed.
dist/index.html                                       0.45 kB │ gzip:   0.28 kB
dist/assets/index-DGNrK5qb.css                        1.78 kB │ gzip:   0.81 kB
dist/assets/image-centric-portfolio-DxlIWOJV.js       5.34 kB │ gzip:   1.38 kB
dist/assets/text-centric-article-6b7Jz0bw.js          6.55 kB │ gzip:   2.26 kB
dist/assets/single-page-brief-DWQ62ho1.js             6.78 kB │ gzip:   2.18 kB
dist/assets/vector-centric-infographic-C8o9rOzy.js    7.62 kB │ gzip:   1.88 kB
dist/assets/complex-nested-dashboard-DlZXOH1P.js     12.66 kB │ gzip:   1.84 kB
dist/assets/multi-page-report-BswDfqIY.js            12.87 kB │ gzip:   2.64 kB
dist/assets/table-card-hybrid-DG6Ith3M.js            15.03 kB │ gzip:   2.14 kB
dist/assets/index-DGlwmyPe.js                       891.13 kB │ gzip: 263.85 kB
✓ built in 489ms
```
- 컴파일 에러 0건, 번들링 시간 489ms 기록.
- 각 프리셋 샘플들이 동적 import를 통해 독립 청크로 깔끔하게 코드 스플리팅됨.

