# 05. Regression Test Suite & Verification Results

## 1. 테스트 실행 요약

Phase 34A.1 Hotfix 구현 후 신규 핫픽스 테스트, 직전 릴리스 게이트 테스트, 하드닝 테스트, 오프라인 피델리티 테스트 및 전체 Vitest 테스트를 수행했습니다.

- **TypeScript 타입 검사 (`npx tsc --noEmit`)**: **0 Errors (PASS)**
- **Web App Production Build (`npm run build:web`)**: **SUCCESS (414ms)**
- **신규 핫픽스 테스트 (`tests/phase34a1-hotfix.test.ts`)**: **18/18 Passed (100%)**
- **릴리스 게이트 테스트 (`tests/phase34a1-release-gate.test.ts`)**: **29/29 Passed (100%)**
- **하드닝 테스트 (`tests/phase34a-capture-hardening.test.ts`)**: **23/23 Passed (100%)**
- **오프라인 피델리티 테스트 (`tests/phase33-offline-fidelity.test.ts`)**: **13/13 Passed (100%)**

---

## 2. 신규 핫픽스 테스트 명세 (`tests/phase34a1-hotfix.test.ts`)

| 번호 | 테스트 명칭 | 목적 | 결과 |
|---|---|---|---|
| 1.1 | excludes recovered frame from download targets after journal reconciliation | 저널 복구된 프레임이 toFetchNodeIds에서 즉시 제외되는지 검증 | PASS |
| 1.2 | makes ZERO network calls when all frames are recovered from journals | 전 프레임 복구 시 네트워크 요청 0회로 COMPLETED 종료 검증 | PASS |
| 1.3 | does NOT recover corrupted PNG and keeps frame in download targets | 손상된 PNG 저널은 미복구 처리되고 다운로드 대상에 유지되는지 검증 | PASS |
| 1.4 | does NOT recover journal if file hash does not match expected hash | 해시 불일치 시 저널 미복구 검증 | PASS |
| 1.5 | Dry Run does NOT modify disk: journals, manifest and files remain untouched | Dry-run에서 디스크 불변성(저널/매니페스트/파일 수정 0) 검증 | PASS |
| 1.6 | re-execution does not re-download already cached frames | 정상 캐시 존재 시 중복 다운로드 방지 검증 | PASS |
| 2.1 | counts exactly 1 CDN request when download has zero redirects | 리다이렉트 없는 경우 CDN 카운터 1회 검증 | PASS |
| 2.2 | counts exactly 2 CDN requests when download follows 1 redirect (302) | 302 1회 시 CDN 카운터 정확히 2회 검증 | PASS |
| 2.3 | counts exactly 3 CDN requests when download follows 2 redirects | 302 2회 시 CDN 카운터 정확히 3회 검증 | PASS |
| 2.4 | blocks next hop and reports error when redirect exceeds maxRedirects limit | maxRedirects 초과 시 다음 홉 차단 및 에러 검증 | PASS |
| 2.5 | blocks redirect hop when CDN request budget is exhausted | CDN 예산 소진 시 다음 홉 미전송 차단 검증 | PASS |
| 2.6 | blocks redirect hop when Total HTTP request budget is exhausted | Total 예산 소진 시 다음 홉 미전송 차단 검증 | PASS |
| 2.7 | accurately records attempted requests on HTTP 401, 403, and 429 | 4xx 응답 시도 횟수 정확 반영 검증 | PASS |
| 2.8 | accurately records attempted request on timeout (AbortError) | 타임아웃 AbortError 시도 횟수 정확 반영 검증 | PASS |
| 2.9 | does not count requests blocked by SSRF policy before network dispatch | 정책 차단 시 HTTP 요청 카운트 0 유지 검증 | PASS |
| S-A | Scenario A: Crash Recovery & Re-execution | A(캐시), B(저널), C(신규) 복합 복구 및 C만 단독 요청 검증 | PASS |
| S-B | Scenario B: Redirect budget exhaustion blocks subsequent requests safely | 302 홉에 의한 예산 소진 시 안전 중단 및 Mock 카운트 일치 검증 | PASS |
| S-C | Scenario C: Partial success with budget limit preserves committed frame | 부분 성공 시 완료 프레임 매니페스트 보존 및 후속 계획 정상성 검증 | PASS |

---

## 3. 플랫폼 격리 테스트 참고사항 (Platform Boundary Note)

전체 Vitest(76개 파일, 554개 테스트) 중 Windows 로컬 환경에서 3개 파일(2개 실패, 1개 스위트 실패)이 관찰되었습니다:
- `tests/visual-comparison-algorithm.test.ts`: macOS CoreGraphics/Swift 전용 바이너리 (`swift` 명령)
- `tests/word-automation-safety.test.ts`: macOS AppleScript 전용 바이너리 (`osascript` 명령)
- `tests/phase31-1-word-safety.test.ts`: AppleScript 내부 POSIX 경로 이스케이프 포맷 검사

이 파일들은 macOS 환경 전용으로 작성된 테스트로, 이번 핫픽스 대상 코드(`src/api/oneShotCapture.ts`, `src/cache/cacheManifest.ts`)와 무관하며, 관련 크로스 플랫폼 및 코어 렌더링/API 엔진 테스트 549개는 100% 정상 통과했습니다.
