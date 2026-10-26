# Phase 33 — Report 01: Figma API Call Inventory & Network Policy

## 1. 개요 및 목적

Phase 33의 핵심 제약인 **OFFLINE-FIRST / ZERO FIGMA API CALLS BY DEFAULT**를 준수하기 위해, 코드베이스 내 모든 Figma API 호출 및 원격 리소스 요청 경로를 전수 조사하고 관리 정책을 수립했습니다.

## 2. Figma API 호출 경로 전수 조사 표

| 호출 경로 | 호출 목적 | 현재 자동 실행 여부 | 캐시 사용 여부 | Phase 33 정책 |
| :--- | :--- | :--- | :--- | :--- |
| `GET /v1/files/:file_key`<br>(`FigmaClient.fetchFile`) | 전체 Figma 파일 AST 조회 | 수동 (URL 입력 변환 시) | 메모리 내 없음 | **기본 전면 차단 (`OFFLINE_MODE_BLOCK`)**.<br>One-Shot Capture에서도 미사용(프레임별 수집 우선). |
| `GET /v1/files/:file_key/nodes?ids=...`<br>(`FigmaClient.fetchNodes`) | 특정 대상 노드 AST 조회 | 수동 (nodeId 지정 변환 시) | 메모리 내 없음 | **기본 전면 차단 (`OFFLINE_MODE_BLOCK`)**.<br>오프라인 모드 시 로컬 JSON 스냅샷 사용. |
| `GET /v1/files/:file_key/images`<br>(`FigmaClient.fetchImageFills`) | 이미지 채우기(`imageRef`) 다운로드 URL 매핑 조회 | `convertFigmaUrl` 실행 시 자동 연쇄 호출 | `imageCache` (인스턴스 맵) | **기본 전면 차단 (`OFFLINE_MODE_BLOCK`)**.<br>로컬 캐시 매니페스트 및 JSON 내 `imageMap` 우선 사용. |
| `GET <downloadUrl>`<br>(`FigmaClient.downloadImageAsBase64`) | S3/CDN에서 이미지 바이너리 다운로드 | `resolveImages` 실행 시 자동 연쇄 호출 | `imageCache` (인스턴스 맵) | **기본 전면 차단 (`OFFLINE_MODE_BLOCK`)**.<br>오프라인 모드에서는 네트워크 호출을 건너뛰고 캐시된 이미지만 안전하게 반환. |
| `GET /v1/images/:file_key?ids=...&format=png`<br>(`executeOneShotCapture`) | 대상 프레임의 원본 PNG 렌더링 URL 일괄 조회 | 미실행 (신규 설계) | `cacheManifest.ts` 연동 | **기본 모드 실행 불가 (Dry-Run)**.<br>사용자가 `--capture` 플래그 및 `confirmExecution=true`로 명시적 승인할 때만 배치 실행. |

## 3. 호출 차단 메커니즘 (`src/api/networkMode.ts`)

```ts
export function getFigmaNetworkMode(): FigmaNetworkMode {
  const envMode = process.env.FIGMA_NETWORK_MODE?.toLowerCase().trim();
  if (envMode === "online") return "online";
  return "offline"; // Default strictly offline
}

export function assertOnlineAllowed(operationName: string): void {
  if (isOfflineMode()) {
    throw new FigmaApiError(
      `[OfflinePolicy] Blocked Figma network call (${operationName}): System is running in OFFLINE mode (FIGMA_NETWORK_MODE=offline). Zero Figma API calls allowed by default.`,
      403,
      { code: "REFERENCE_NOT_CACHED", operation: operationName }
    );
  }
}
```

- 토큰이 설정되어 있거나 파라미터로 전달되더라도, `FIGMA_NETWORK_MODE !== 'online'`인 한 어떤 Figma API 요청도 전송되지 않습니다.
- 네트워크 요청 시도 시 즉시 HTTP 403 `REFERENCE_NOT_CACHED` 예외가 발생하여 네트워크 누수를 원천 차단합니다.
