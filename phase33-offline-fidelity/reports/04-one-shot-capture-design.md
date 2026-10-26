# Phase 33 — Report 04: One-Shot Reference Capture Architecture & Plan

## 1. 개요 및 설계 배경

향후 사용자가 필요 시 단 1회의 요청만으로 대상 프레임들의 원본 PNG를 안전하게 확보할 수 있도록, **명시적 승인 기반 One-Shot Capture 엔진 (`src/api/oneShotCapture.ts`)**을 설계 및 구현했습니다.
이번 Phase 33 개발 및 검증 과정에서는 실제 Figma API를 일체 호출하지 않았으며(0회), 모킹 및 시뮬레이션을 통해 모든 로직을 검증했습니다.

## 2. 핵심 동작 파이프라인

```text
[Figma URL / FileKey & Target NodeIds]
                 │
                 ▼
[캐시 매니페스트 조회 (cacheManifest.ts)]
                 │
                 ├─► 이미 FIGMA_REFERENCE로 캐시된 프레임 제외
                 │
                 ▼
[미수집 대상 선별 및 배치(Batch) 분할]
                 │
                 ▼
[Dry Run 수집 계획(Plan) 생성 및 출력]
  - 대상 프레임 수, 캐시된 수, 미수집 수
  - 예상 Figma API 호출 수 (최대 20개씩 묶음)
  - 예상 이미지 다운로드 수, 총 HTTP 요청 수
                 │
                 ├─► dryRun: true 또는 confirmExecution !== true
                 │     └──> HTTP 요청 0회로 즉시 종료 (Default)
                 │
                 ▼ (사용자 명시적 실행 승인 시에만 진입)
[Figma Images API 배치 요청 (GET /v1/images/:key?ids=...&format=png)]
                 │
                 ├─► HTTP 429 감지 -> 즉시 Fail-Fast 중단 (재시도 금지)
                 ├─► HTTP 401/403 감지 -> 즉시 중단
                 │
                 ▼
[반환된 S3 CDN 이미지 바이너리 다운로드]
                 │
                 ▼
[SHA-256 해시 계산, 크기 검증, 로컬 저장]
                 │
                 ▼
[Cache Manifest 원자적 갱신 (VERSION_MATCH: UNVERIFIED)]
```

## 3. 필수 보안 및 안전 정책

1. **Dry Run 기본 모드**: 별도 명시(`confirmExecution: true`, `dryRun: false`)가 없는 한 네트워크 요청을 1회도 발생시키지 않습니다.
2. **토큰 마스킹 (Zero Leakage)**:
   - 로그, 리포트, 에러 메시지 어디에도 토큰 원문이 노출되지 않도록 `maskToken()`을 적용 (`figd_***...`).
3. **HTTP 429 즉각 중단**:
   - Rate limit 응답을 수신하는 즉시 추가 요청을 완전히 중단하며 재시도 루프를 돌지 않습니다.
4. **부분 성공 파일 보존**:
   - 중단 시점까지 정상 다운로드된 파일은 손실 없이 보존되고 매니페스트에 등록됩니다.
5. **버전 정합성 관리**:
   - 향후 수집될 PNG는 기존 JSON과 시점이 다를 수 있으므로, 동일 버전임이 확증되기 전까지 `VERSION_MATCH: UNVERIFIED` 상태로 등록됩니다.
