# Phase 33 — Report 03: Offline Mode Enforcement & Zero API Policy

## 1. 정책 개요

Figma REST API는 Personal Access Token(PAT)으로 1~2회 대규모 파일을 조회하는 것만으로도 비정상 트래픽으로 간주되어 계정 잠금 또는 HTTP 429 제한이 발생한 전례가 있습니다.
따라서 Phase 33에서는 **코드와 테스트 수준에서 네트워크 호출을 원천 차단**하는 오프라인 전용 정책을 도입했습니다.

## 2. 불변 원칙 (Offline Invariants)

1. **기본 차단 원칙**: `process.env.FIGMA_NETWORK_MODE`의 기본값은 무조건 `'offline'`입니다.
2. **토큰 무력화**: `accessToken`이 설정되어 있거나 파라미터로 명시 전달되더라도, 모드가 `offline`이면 어떤 HTTP 요청도 나가지 않습니다.
3. **자동 다운로드 금지**: `resolveImages()` 호출 시 이미지 캐시 누락이 발생하더라도 Figma API를 호출하지 않고 로컬에 존재하는 이미지만 반환합니다.
4. **무한 재시도 금지**: 재시도 루프나 백그라운드 폴링을 일체 금지하며, 네트워크 오류나 429 감지 시 즉시 Fail-Fast로 중단합니다.
5. **구조화된 예외 반환**:
   ```ts
   throw new FigmaApiError(
     `[OfflinePolicy] Blocked Figma network call (${operationName}): System is running in OFFLINE mode (FIGMA_NETWORK_MODE=offline). Zero Figma API calls allowed by default.`,
     403,
     { code: "REFERENCE_NOT_CACHED", operation: operationName }
   );
   ```

## 3. 검증 완료된 테스트 케이스 (`tests/phase33-offline-fidelity.test.ts`)

- `1.1 defaults to offline mode when FIGMA_NETWORK_MODE is unset` (통과)
- `1.2 throws structured REFERENCE_NOT_CACHED error on assertOnlineAllowed in offline mode` (통과)
- `1.3 blocks FigmaClient network fetchFile even when accessToken is provided in offline mode` (통과)
- `1.4 blocks remote image downloads in offline mode with zero fetch calls` (통과)
- `1.5 resolveImages in offline mode returns only cached images and makes 0 API requests` (통과)
