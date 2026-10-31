# 03. Failure Injection & Integrated Scenarios Results

## 1. 개요
HOTFIX-01과 HOTFIX-02의 상호작용 및 복합적인 오류 상황에서의 견고성을 검증하기 위해 3가지 대표 시나리오를 설계하고 모의 환경(Mock HTTP, 임시 파일시스템 격리)에서 전수 검증했습니다.

---

## 2. 시나리오 A: 크래시 후 재실행 (Crash Recovery & Re-execution)

### 초기 조건
- **프레임 1:A**: 이전 실행에서 정상적으로 다운로드되어 매니페스트에 등록된 VERIFIED 캐시
- **프레임 1:B**: 이전 프로세스 강제 종료(크래시)로 인해 디스크 파일과 트랜잭션 저널(`.journal_1_B.json`)만 남아있는 상태
- **프레임 1:C**: 아직 수집되지 않은 신규 타겟 프레임

### 실행 과정 및 관찰
1. `executeOneShotCapture()` 시작 시 `outputDir`에서 stale temp 파일 정리 및 pending journal 검사 실행.
2. 프레임 1:B의 파일 존재, 크기, SHA-256 해시, PNG 바이너리 유효성(`validatePngBuffer`) 검증 통과.
3. 1:B가 매니페스트에 공식 등록되고 저널 파일(`.journal_1_B.json`) 정상 삭제.
4. 최신 매니페스트를 기반으로 `planOneShotCapture` 재계산 수행:
   - `plan.toFetchNodeIds` = `["1:C"]` (1:A와 1:B는 캐시 적중으로 완벽 제외!)
5. Figma API 호출: `ids=1%3AC`만 단독 요청 (1:A, 1:B 미포함 검증 완료).
6. CDN 다운로드: 1:C 단 1장만 수행.
7. 최종 매니페스트: 1:A, 1:B, 1:C 3개 프레임 모두 무결성 보존.

### 검증 결과
- `result.status`: `COMPLETED`
- `result.plan.toFetchNodeIds`: `["1:C"]`
- `result.plan.cachedFramesCount`: 2 (A, B)
- `result.actualFigmaApiCalls`: 1
- `result.actualCdnDownloads`: 1
- `result.totalHttpRequests`: 2
- **판정: PASS**

---

## 3. 시나리오 B: 리다이렉트 예산 소진 (Redirect Budget Exhaustion)

### 초기 조건
- `maxApiCallLimit`: 1
- `maxCdnCallLimit`: 2
- `maxTotalHttpLimit`: 3
- 단일 타겟 노드 `1:1` 수집 시도
- CDN 다운로드 시 연속 리다이렉트(302) 발생 설정:
  - Hop 1: `redir_a.png` (302 -> Location: `redir_b.png`)
  - Hop 2: `redir_b.png` (302 -> Location: `redir_c.png`)
  - Hop 3: `redir_c.png` (미도달 대상)

### 실행 과정 및 관찰
1. Figma API 호출 1회 실행 (`apiHttpRequestsAttempted` = 1, 총 시도 = 1).
2. CDN Hop 1 호출 1회 실행 -> 302 응답 (`cdnHttpRequestsAttempted` = 1, 총 시도 = 2).
3. CDN Hop 2 호출 1회 실행 -> 302 응답 (`cdnHttpRequestsAttempted` = 2, 총 시도 = 3).
4. CDN Hop 3 직전 예산 검증:
   - `canMakeCdnRequest()` 검사: `cdnHttpRequestsAttempted(2) >= maxCdn(2)` 및 `total(3) >= maxTotal(3)` 감지!
   - 즉시 차단되고 Hop 3 네트워크 호출은 일체 발생하지 않음!
5. 함수는 `budgetExceeded: true` 및 `FAILED` 상태로 즉시 종료.

### 검증 결과
- `result.status`: `FAILED`
- `result.budgetExceeded`: `true`
- `result.apiHttpRequestsAttempted`: 1
- `result.cdnHttpRequestsAttempted`: 2
- `result.totalHttpRequestsAttempted`: 3
- `result.cdnRedirectHops`: 1
- `actual mockFetch calls`: 정확히 3회 (예산 상한 3회와 100% 일치)
- **판정: PASS**

---

## 4. 시나리오 C: 부분 성공과 중단 (Partial Success with Budget Limit)

### 초기 조건
- `maxApiCallLimit`: 1, `maxCdnCallLimit`: 2, `maxTotalHttpLimit`: 3
- 3개 타겟 노드: `1:1`, `1:2`, `1:3`
- 노드 1:1은 단일 200 OK
- 노드 1:2는 302 리다이렉트 발생
- 노드 1:3은 미수집 대상

### 실행 과정 및 관찰
1. Figma API 1회 호출 (`apiHttpRequestsAttempted` = 1).
2. 노드 1:1 CDN 다운로드 성공 -> PNG 검증 통과 -> 매니페스트 즉시 커밋 완료 (`cdnHttpRequestsAttempted` = 1, 누적 2회).
3. 노드 1:2 CDN 다운로드 시도 -> 302 수신 (`cdnHttpRequestsAttempted` = 2, 누적 3회).
4. 노드 1:2의 2번째 홉 시도 전 예산 검사에서 차단 -> 다운로드 루프 중단.
5. 노드 1:3은 요청조차 시도되지 않음.
6. 조기 중단되었으나, 노드 1:1은 프레임별 즉시 커밋(Frame-by-frame Commit) 원칙에 의해 매니페스트에 영구 보존됨.
7. 후속 Dry Run 실행 시: 노드 1:1은 캐시된 것으로 정확히 인식되고, 미완료된 `["1:2", "1:3"]`만 `toFetchNodeIds`로 정확히 분류됨.

### 검증 결과
- `result.status`: `PARTIAL_SUCCESS`
- `result.budgetExceeded`: `true`
- `result.imagesDownloadedSuccessfully`: 1 (노드 1:1)
- `result.capturedEntries[0].nodeId`: `"1:1"`
- `후속 Dry Run cachedFramesCount`: 1
- `후속 Dry Run toFetchNodeIds`: `["1:2", "1:3"]`
- **판정: PASS**
