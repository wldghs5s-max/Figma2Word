# 01. HOTFIX-01: Crash Recovery Ordering & Cache Synchronization

## 1. 결함 발생 원인 (Root Cause Analysis)

기존 `executeOneShotCapture(options)`는 다음과 같은 순서로 실행되었습니다:

```text
[AS-IS Flow]
1. manifest = loadCacheManifest()
2. plan = planOneShotCapture(options, manifest)  <-- toFetchNodeIds 결정!
3. dryRun 검사
4. confirmExecution 검사
5. assertFigmaNetworkAllowed() 검사
6. accessToken 검사
7. if (plan.toFetchNodeIds.length === 0) return COMPLETED
8. outputDir 생성
9. cleanupStaleTempFiles(outputDir)
10. recoverPendingJournals(outputDir, manifest, manifestPath)  <-- 저널 복구 수행!
11. batches = chunk(plan.toFetchNodeIds)  <-- 2번의 구버전 계획 그대로 사용!
12. Figma API 및 CDN 다운로드 실행
```

### 치명적 문제점
- 저널 복구(`recoverPendingJournals`)가 실행되기 전에 이미 `planOneShotCapture`가 완료되어 `plan.toFetchNodeIds`가 고정되었습니다.
- 이전 크래시로 인해 디스크에 정상 생성된 PNG와 트랜잭션 저널(`.journal_*.json`)이 있어도, 복구 후 매니페스트에 등록된 내용이 `plan.toFetchNodeIds`에 전혀 반영되지 않았습니다.
- 그 결과, 이미 완벽히 복원된 이미지 프레임을 다시 Figma API 요청 대상과 CDN 다운로드 대상에 포함시켜 불필요한 네트워크 트래픽을 유발하고 캐시를 덮어쓰는 위험이 있었습니다.

---

## 2. 해결 아키텍처 및 구현 내용

`src/api/oneShotCapture.ts` 내의 실행 순서를 다음과 같이 재구성했습니다:

```text
[TO-BE Hardened Flow]
1. manifestPath, outputDir 경로 해석
2. initialManifest = loadCacheManifest()
3. initialPlan = planOneShotCapture(options, initialManifest)

[Dry-Run Invariant (불변 원칙)]
4. if (options.dryRun !== false) -> 디스크 수정(저널복구/임시파일정리) 일체 없이 즉시 DRY_RUN 반환

[Approval & Policy Gates]
5. if (options.confirmExecution !== true) -> BLOCKED_NO_APPROVAL 반환
6. assertFigmaNetworkAllowed() 검사
7. accessToken 존재 및 포맷 검사

[Crash Recovery & State Synchronization (HOTFIX-01 핵심)]
8. outputDir 디렉터리 준비
9. cleanupStaleTempFiles(outputDir)  <-- 오래된 .tmp_ 파일 정리
10. recoverPendingJournals(outputDir, initialManifest, manifestPath)  <-- 트랜잭션 저널 복구
11. activeManifest = loadCacheManifest(manifestPath)  <-- 복구된 최신 매니페스트 재로드

[Plan Re-calculation with Fresh State]
12. freshPlan = planOneShotCapture(options, activeManifest)  <-- 복구된 프레임이 isCached로 반영!
13. if (freshPlan.toFetchNodeIds.length === 0) -> 네트워크 요청 0회로 COMPLETED 즉시 반환!

[Network Dispatch Execution]
14. batches = chunk(freshPlan.toFetchNodeIds)  <-- 최신 미수집 노드만 배치 구성!
15. HttpRequestBudgetManager를 통한 요청 단위 예산 제어 및 다운로드 실행
```

---

## 3. 세부 안전 보장 규칙

1. **Dry Run Disk Immutability**:
   - `options.dryRun !== false`일 때는 어떠한 디스크 파일 쓰기/삭제도 수행하지 않습니다.
   - `countPendingJournals(outputDir)`를 활용하여 디스크를 수정하지 않고도 저널 복구 가능 대상을 읽기 전용으로 계측합니다.
2. **Strict Verification on Journal Recovery**:
   - 저널 파일이 존재하더라도, 대상 PNG 파일이 없거나, SHA-256 해시가 불일치하거나, `validatePngBuffer`에서 손상된 PNG로 판정되면 복구하지 않고 폐기(`discardedCount++`)합니다.
3. **No Unproven Orphan Promotion**:
   - 유효한 저널이 없는 임의의 고아 파일은 절대 `FIGMA_REFERENCE`로 자동 승격하지 않습니다.
4. **Zero Network Calls on Full Recovery**:
   - 모든 타겟 프레임이 저널 복구로 채워질 경우 `freshPlan.toFetchNodeIds.length === 0`이 되어 Figma API와 CDN HTTP 요청 횟수가 정확히 0회로 조기 종료됩니다.

---

## 4. 단위 테스트 검증 결과

`tests/phase34a1-hotfix.test.ts` 내 6개 전용 테스트 케이스 통과:
- `1.1 excludes recovered frame from download targets after journal reconciliation`: **PASSED**
- `1.2 makes ZERO network calls when all frames are recovered from journals`: **PASSED**
- `1.3 does NOT recover corrupted PNG and keeps frame in download targets`: **PASSED**
- `1.4 does NOT recover journal if file hash does not match expected hash`: **PASSED**
- `1.5 Dry Run does NOT modify disk: journals, manifest and files remain untouched`: **PASSED**
- `1.6 re-execution does not re-download already cached frames`: **PASSED**
