# Phase 16 — Track H4 Remediation Log: Tests, Dependencies & Repository Documentation

## 1. 개요
Track H4는 프로젝트의 테스트 커버리지 강화, 의존성 누락 해소, 그리고 프로젝트 문서의 최신화 및 정합성을 확보하는 P2 정비 과제(F-18, F-17, F-12)의 조치 내역을 기록한다.

---

## 2. 결함별 상세 조치 내역

### 1) F-18: 누락된 의존성(`jszip`) 명시적 추가
- **증상**: `src/canvas/parser/docxCanvasParser.ts` 및 렌더러가 `JSZip`을 임포트하여 사용하고 있었으나, 루트 `package.json` 및 `apps/web/package.json`의 `dependencies` 목록에 `jszip`이 명시되지 않아 다른 의존성의 호이스팅(Hoisting)에 취약했음.
- **조치**:
  - `package.json`: `"dependencies"`에 `"jszip": "^3.10.1"` 추가.
  - `apps/web/package.json`: `"dependencies"`에 `"jszip": "^3.10.1"` 추가.
- **검증**: `npm install` 정합성 및 의존성 트리 검증 통과.

### 2) F-17: Canvas IR 전용 단위/통합 테스트 스위트 확충
- **증상**: 기존 49개 테스트 스위트가 대부분 Flow 엔진(`layoutEngine`, `docxRenderer`) 위주로 구성되어 있어, Phase 13~16에서 구축된 Canvas 듀얼 엔진의 세부 엣지 케이스를 충분히 커버하지 못함.
- **조치**:
  - `tests/phase16-h1-remediation.test.ts`:
    - F-01: 브라우저 Buffer 독립 디코딩 검증
    - F-02: DOCX `<w:br/>` 및 HWPX `<hp:p>` 다중 줄바꿈 보존 및 라운드트립 검증
    - F-03: VML 소문자 좌표의 절대좌표 파싱 및 왜곡 방지 검증
    - F-06: S3 원격 이미지 URL 해석 및 파서 연동 검증
  - `tests/phase16-h2-remediation.test.ts`:
    - F-08: 밀집 아크 플래그(`A ... 0 11 ...`) 파싱 및 3차 베지에 극점 바운딩 박스 검증
    - F-05: DOCX `w:orient="landscape"` 및 HWPX `landscape="WIDELY"` 동적 크기 검증
    - F-07: HWPX JPEG 확장자(`.jpg`) 및 MIME(`image/jpeg`) 보존 검증
    - F-11: Figma `STAR`, `POLYGON`, `BOOLEAN_OPERATION` 벡터 변환 검증
  - `tests/phase16-h3-remediation.test.ts`:
    - F-16: Null 바이트 경로 차단 및 100MB 초과 입력 거부 검증
    - F-14: DOCX 네이티브 테이블, 차트, OLE 감지 시 `[SCOPE_NOTICE]` 경고 방출 검증
    - F-15: `CanvasPipeline.convertFigmaUrl` API 메서드 존재 및 시그니처 검증
  - 총 3개 전용 테스트 파일에 16개 정밀 테스트를 추가하여 Canvas IR 커버리지를 대폭 상향.
- **검증**: 신규 16개 테스트 전수 PASS 확인.

### 3) F-12: README.md 전면 개정 및 MVP 성숙도 명시
- **증상**: 저장소 루트의 `README.md`가 Phase 4.2 시점에 멈추어 있어, 신규 Canvas IR 엔진, HWPX(KS X 6101) 지원, DOCX → HWPX 역변환, CLI 옵션 및 현재 아키텍처가 누락되어 있었음.
- **조치**:
  - `README.md`를 전면 개정:
    - 듀얼 엔진 아키텍처 다이어그램(Canvas IR vs Flow 엔진) 수록.
    - 지원 포맷 및 CLI 사용법(스냅샷 변환, 실시간 URL 변환, DOCX → HWPX 변환).
    - Web UI 실행 가이드.
    - 보안 및 안정성 가드(브라우저 격리, ZIP 폭탄 방어, 경로 검증).
    - 엔진별/포맷별 지원 기능 및 한계점 비교 매트릭스 수록.
    - 현재 상태를 **Internally Usable MVP (Phase 16 Hardened)**로 공식 명시.
- **검증**: `README.md` 렌더링 확인 완료.
