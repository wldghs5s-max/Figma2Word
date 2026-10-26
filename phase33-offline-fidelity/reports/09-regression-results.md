# Phase 33 — Report 09: Full Test Suite Regression Results

## 1. 테스트 실행 요약

Vitest (v5.0.3) 기반의 전체 테스트 스위트를 실행하여, Phase 33 변경 사항이 기존 기능에 일체의 회귀(Regression)를 일으키지 않았음을 입증했습니다.

```bash
Test Files  73 passed (73)
     Tests  482 passed | 2 skipped (484)
  Duration  6.32s
```

## 2. Phase 32 vs Phase 33 메트릭 비교

| 메트릭 지표 | Phase 32 기준 | Phase 33 결과 | 변화량 및 개선 효과 |
| :--- | :--- | :--- | :--- |
| **전체 테스트 스위트 파일** | 72개 | **73개** | +1개 전용 스위트 (`phase33-offline-fidelity.test.ts`) |
| **통과 테스트 케이스** | 469개 통과 | **482개 통과** | **+13개 신규 검증 통과 (100% 무회귀)** |
| **스킵 테스트 케이스** | 2개 | 2개 | 불변 (Windows 전용 COM 테스트 2건) |
| **실패 테스트 케이스** | 0개 | **0개** | **Zero Failures 유지** |
| **네트워크 모드 기본 정책** | 미지정 (온라인 가능) | **강제 오프라인 (`FIGMA_NETWORK_MODE=offline`)** | 토큰 존재 시에도 무단 호출 0회 보장 |
| **캐시 매니페스트 시스템** | 미구현 | **구현 완료 (`cacheManifest.ts`)** | 소스 타입별 위장 방지 및 SHA-256 무결성 |
| **One-Shot Reference Capture** | 미구현 | **구현 완료 (`oneShotCapture.ts`)** | Dry Run 기본, 429 Fail-Fast, 토큰 마스킹 |
| **Word 자동화 디렉터리 검사** | 접두사 비교 (`startsWith`) | **엄격 디렉터리 경계 (`isPathInsideDirectory`)** | `vr_123` vs `vr_1234` 오탐 방지 |
| **계단식 투명도 전파** | 미지원 (단일 레벨) | **다층 계단식 곱연산 전파 지원** | VML `<v:fill opacity>`, HWPX `alpha` 지원 |

## 3. 신규 추가된 13개 검증 항목 (`tests/phase33-offline-fidelity.test.ts`)

1. `1.1 defaults to offline mode when FIGMA_NETWORK_MODE is unset`
2. `1.2 throws structured REFERENCE_NOT_CACHED error on assertOnlineAllowed in offline mode`
3. `1.3 blocks FigmaClient network fetchFile even when accessToken is provided in offline mode`
4. `1.4 blocks remote image downloads in offline mode with zero fetch calls`
5. `1.5 resolveImages in offline mode returns only cached images and makes 0 API requests`
6. `2.1 correctly registers entries and computes SHA-256 integrity`
7. `2.2 strictly rejects WORD_RENDERED images when querying for FIGMA_REFERENCE`
8. `3.1 safely masks access tokens for diagnostic logs`
9. `3.2 calculates batched request counts and produces dry-run plan with 0 HTTP calls`
10. `3.3 immediately aborts with Fail-Fast upon encountering HTTP 429 without retry loops`
11. `4.1 accurately distinguishes strict subdirectories from prefix collisions`
12. `5.1 propagates parent group/frame opacity down to nested child elements in Canvas IR`
13. `5.2 renders VML fill opacity and HWPX alpha when element opacity is < 1.0`
