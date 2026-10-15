# Phase 16 — Track H3 Remediation Log: Security, CLI & E2E Verification

## 1. 개요
Track H3는 로컬 환경 및 CLI 도구의 파일 보안, 입력 유효성 검증, DOCX 압축 해제 안전성(ZIP Bomb 방어), CLI 캔버스 엔진 통합, 그리고 E2E 검증 정직성을 보장하는 P1 결함군(F-10, F-14, F-15, F-16, F-09)의 조치 내역을 기록한다.

---

## 2. 결함별 상세 조치 내역

### 1) F-10 & F-16: 파일 경로 조작(Path Traversal) 방지 및 ZIP 폭탄 보안 가드
- **증상**:
  - 파일 경로에 Null 바이트(`\0`) 또는 비정상적인 탐색 경로가 삽입될 경우 시스템 취약점 발생 가능.
  - 악의적으로 조작된 거대 DOCX 또는 수만 개의 엔트리를 가진 압축 파일 처리 시 메모리 고갈 및 서비스 거부(DoS) 유발 가능.
- **조치**:
  - `src/cli.ts`:
    - `validateSafePath(targetPath: string): string` 함수를 추가하여 Null 바이트(`\0`) 감지 시 즉각 예외 발생 및 `path.resolve` 정규화.
    - 입력 파일의 물리적 크기를 100MB로 엄격히 제한 (`MAX_FILE_SIZE = 100MB`).
  - `src/canvas/parser/docxCanvasParser.ts`:
    - 입력 파일/버퍼 크기 100MB 제한 적용.
    - `JSZip.loadAsync()` 직후 패키지 엔트리 수 검사 (`MAX_ZIP_ENTRIES = 5,000`).
    - 각 엔트리의 압축 해제 예정 누적 바이트를 검사하여 안전 한도(250MB) 초과 시 `SecurityError`를 발생시켜 ZIP 폭탄을 사전 차단.
- **검증**: `tests/phase16-h3-remediation.test.ts` 내 F-16 테스트 통과 (Null 바이트 경로 거부 및 100MB 초과 버퍼 거부 검증).

### 2) F-14: DOCX → HWPX 스코프 명확화 및 정직한 진단 경고 (Scope Diagnostics)
- **증상**: DOCX 내에 Word 네이티브 테이블(`<w:tbl>`), ChartML 차트(`<c:chart>`), OLE 개체(`<w:object>`) 등이 포함되어 있을 때, 캔버스 엔진이 이를 아무런 알림 없이 누락하여 사용자가 데이터가 완벽히 변환된 것으로 오인.
- **조치**:
  - `src/canvas/parser/docxCanvasParser.ts`:
    - 문서 XML 내에 `<w:tbl>`, `<c:chart>`, `<w:object>` 등의 비-캔버스 복합 요소가 존재할 경우, 침묵하지 않고 `doc.diagnostics.warnings`에 명시적인 `[SCOPE_NOTICE]` 경고 메시지를 기록하도록 구현.
    - 변환된 Canvas IR 및 CLI 출력에서 스코프 경고를 확인할 수 있도록 정보 투명성 확보.
- **검증**: `tests/phase16-h3-remediation.test.ts` 내 F-14 테스트 통과 (테이블, 차트, OLE 개체 감지 시 각각 `[SCOPE_NOTICE]` 경고 생성 확인).

### 3) F-15: CLI `--engine canvas`와 `--url` 통합 연동
- **증상**: CLI에서 `--url <Figma URL>`을 지정할 때 `--engine canvas` 옵션이 무시되고 기존 Flow `ConversionPipeline`으로 강제 분기됨.
- **조치**:
  - `src/canvas/pipeline/canvasPipeline.ts`:
    - `convertFigmaUrl(figmaUrl, accessToken, options): Promise<CanvasPipelineResult>` 메서드를 구현.
    - `FigmaClient`를 통해 파일 메타데이터 및 노드를 가져오고, `resolveImageMapUrls`를 통해 S3 이미지를 Base64로 일괄 다운로드한 후 `convertFigma`에 전달하여 DOCX/HWPX를 동시 생성할 수 있도록 구축.
  - `src/cli.ts`:
    - `parsedArgs.url` 처리 블록에서 `parsedArgs.engine === "canvas"` 분기를 추가하여 `CanvasPipeline.convertFigmaUrl`을 호출하고 포맷(`--format docx|hwpx|both`) 및 스케일 옵션을 정상 전달.
- **검증**: `tests/phase16-h3-remediation.test.ts` 내 F-15 테스트 통과 및 `src/cli.ts` 통합 확인.

### 4) F-09: `run_e2e_scenarios.ts` Word COM 검증의 정직한 실행 및 상태 보고
- **증상**: `run_e2e_scenarios.ts` 시나리오 7에서 `test_word_editability_comprehensive.ps1` 스크립트 파일이 디스크에 존재하는지(`fs.existsSync`)만 확인하고 "PASSED" 및 "0 page shifts"를 거짓 보고함.
- **조치**:
  - `research/rea-document-engine/phase15/scripts/run_e2e_scenarios.ts`:
    - `ScenarioResult.status`에 `"SKIPPED"` 상태를 추가.
    - `child_process.spawnSync`를 통해 실제 호스트에 Word COM 애플리케이션(`Word.Application`)이 설치 및 초기화 가능한지 사전 프로빙.
    - Word COM이 사용 가능한 경우에만 실제 PowerShell 스크립트를 실행하여 종료 코드(Exit Code)를 검증하고 `PASSED` 또는 `FAILED` 판정.
    - Word COM을 사용할 수 없는 헤드리스/CI 환경에서는 거짓 합격을 보고하지 않고 정직하게 `"SKIPPED: Word COM application not available on this host"`로 표기.
- **검증**: `research/rea-document-engine/phase15/scripts/run_e2e_scenarios.ts` 코드 개정 및 검증 완료.
