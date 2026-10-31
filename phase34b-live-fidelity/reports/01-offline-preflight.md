# 01. Stage 1 Offline Preflight Report & Live Capture Instructions

## 1. 개요 및 현재 상태

Phase 34B의 **Stage 1: Offline Preflight**가 성공적으로 완료되었습니다.
실제 외부 HTTP 요청은 **정확히 0회**로 유지되었으며, 시스템은 사용자의 명시적인 승인과 로컬 보안 토큰 준비를 기다리기 위해 **일시 중단(Paused)**되었습니다.

- **현재 커밋 HEAD**: `a12b2f1` (`fix: finalize capture recovery and HTTP request accounting`)
- **작업 트리 상태**: Clean (`nothing to commit, working tree clean`)
- **TypeScript 타입 검사 (`npx tsc --noEmit`)**: **0 Errors (PASS)**
- **핵심 테스트 스위트 (83개 테스트)**: **100% Passed (PASS)**

---

## 2. 오프라인 사전 점검 결과 요약

```text
================================================================================
 STAGE 1 PREFLIGHT AUDIT SUMMARY
================================================================================
TARGET_FRAMES: 17
VALID_CACHED: 0
RECOVERABLE_FROM_JOURNAL: 0
TO_FETCH: 17

FIGMA_API_REQUESTS_PLANNED: 1
CDN_HTTP_REQUESTS_BASELINE: 17
TOTAL_HTTP_REQUESTS_BASELINE: 18

API_HTTP_BUDGET: 5
CDN_HTTP_BUDGET: 25
TOTAL_HTTP_BUDGET: 30

TOKEN_CONFIGURED: NO (Awaiting user local input)
NETWORK_MODE: offline
VERSION_MATCH: UNVERIFIED

REAL_EXTERNAL_HTTP_REQUESTS: 0
STAGE_1_STATUS: AWAITING_STAGE_2_USER_APPROVAL
================================================================================
```

---

## 3. 17개 타겟 프레임 상세 점검 (`exact-17-frames.json`)

모든 타겟 프레임의 Node ID가 100% 고유하며, 일괄 1개 배치(`batchSize: 20`)로 수집 가능하도록 설계되었습니다.

| 번호 | Node ID | Frame Name | 원본 크기 (Px) | 캔버스 정규화 크기 | 수집 상태 |
|---|---|---|---|---|---|
| 1 | `763:5068` | 디자인 시스템 1 | 1920x1080 | 1440x810 | To Fetch |
| 2 | `766:256` | 디자인 시스템 2 | 1920x1080 | 1440x810 | To Fetch |
| 3 | `757:88` | Desktop - 1 | 1440x1024 | 1440x1024 | To Fetch |
| 4 | `759:759` | Desktop - 2 | 1440x1024 | 1440x1024 | To Fetch |
| 5 | `757:92` | Desktop - 3 | 1440x1024 | 1440x1024 | To Fetch |
| 6 | `757:142` | Desktop - 4 | 1440x1024 | 1440x1024 | To Fetch |
| 7 | `757:158` | Desktop - 5 | 1440x1024 | 1440x1024 | To Fetch |
| 8 | `759:911` | Desktop - 6 | 1440x1024 | 1440x1024 | To Fetch |
| 9 | `757:124` | Desktop - 7 | 1440x1024 | 1440x1024 | To Fetch |
| 10 | `759:1076` | Desktop - 8 | 1440x1024 | 1440x1024 | To Fetch |
| 11 | `766:2289` | Desktop - 9 | 1440x1024 | 1440x1024 | To Fetch |
| 12 | `757:118` | Desktop - 10 | 1440x1024 | 1440x1024 | To Fetch |
| 13 | `766:2942` | Desktop - 11 | 1440x1024 | 1440x1024 | To Fetch |
| 14 | `759:1314` | Desktop - 12 | 1440x1024 | 1440x1024 | To Fetch |
| 15 | `759:1858` | Desktop - 13 | 1440x1024 | 1440x1024 | To Fetch |
| 16 | `759:1533` | Desktop - 14 | 1440x1024 | 1440x1024 | To Fetch |
| 17 | `768:3434` | Desktop - 15 | 1440x1024 | 1440x1024 | To Fetch |

---

## 4. Stage 2 (Approved Live Capture) 진입을 위한 사용자 승인 및 토큰 준비 절차

Phase 34B의 Stage 2(실제 Figma API 및 CDN 이미지 수집)를 실행하려면 사용자의 다음 두 가지 준비가 필요합니다.

### A. 로컬 환경변수 설정 (토큰 보안 보호)
채팅창이나 코드 파일에 토큰을 절대 직접 입력하지 마시고, 작업 터미널(PowerShell 또는 CMD)에서 환경변수로 설정해 주십시오:

```powershell
# PowerShell 환경변수 설정 예시
$env:FIGMA_ACCESS_TOKEN = "your_personal_access_token_here"
$env:FIGMA_NETWORK_MODE = "online"
```

또는 프로젝트 루트의 `.env` 파일에 로컬 전용으로 설정(단, `.gitignore` 확인 필수):
```bash
FIGMA_ACCESS_TOKEN=your_personal_access_token_here
FIGMA_NETWORK_MODE=online
```

> [!SECURITY]
> - 토큰은 `redactSecretFromText` 및 `maskToken`에 의해 모든 콘솔 로그 및 진단 파일에서 완전 마스킹(`***MASKED_SECRET***`) 처리됩니다.
> - Git 커밋 및 감사 패키지(ZIP)에 절대 포함되지 않습니다.

### B. 사용자 명시적 승인 메시지 전송
준비가 완료되면 다음 승인 메시지를 에이전트에게 전송해 주십시오:

> **"Stage 2 실제 Figma 원본 PNG 수집을 승인합니다. fileKey: <실제_Figma_FileKey_또는_URL> 로 진행해 주세요."**

승인 메시지를 수신하는 즉시 다음 동작을 원자적으로 수행합니다:
1. `FIGMA_ACCESS_TOKEN` 검증 및 온라인 모드 일시 전환
2. 17개 프레임 일괄 One-Shot Capture (API 1회 + CDN 17회, 최대 30회 상한)
3. 수집 완료 직후 **즉시 OFFLINE 모드로 복귀 (`FIGMA_NETWORK_MODE=offline`)**
4. 17개 프레임 무결성 감사 및 Word 네이티브 렌더링 시각 비교(Stage 3~4) 착수

