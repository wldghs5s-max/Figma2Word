# 02. HOTFIX-02: Exact HTTP Request Budget Accounting

## 1. 결함 발생 원인 (Root Cause Analysis)

Phase 34A.1에서 SSRF 방어 및 리다이렉트 공격 방어를 위해 `fetchCdnImageWithSecureRedirects`를 구현하여 301, 302, 303, 307, 308 응답을 수동 추적하도록 했습니다.
그러나 `executeOneShotCapture()` 루프에서는 다음과 같이 처리되었습니다:

```ts
// AS-IS: 이미지 1개당 외부 카운터만 증가
cdnDownloadsCount++;
const dlResult = await fetchCdnImageWithSecureRedirects(imgUrl, fetchImpl);
```

이 방식은 다음과 같은 불일치를 발생시켰습니다:
```text
CDN 이미지 A 다운로드 시:
  Hop 1: GET https://.../imgA.png -> 302 Location: hop2.png (1st HTTP call)
  Hop 2: GET https://.../hop2.png -> 302 Location: hop3.png (2nd HTTP call)
  Hop 3: GET https://.../hop3.png -> 200 OK (3rd HTTP call)

실제 발생한 HTTP 요청: 3회
기존 보고된 cdnDownloadsCount: 1회
```

결과:
- 실제 외부로 전송된 HTTP 요청 수가 보고서 및 예산 한도와 일치하지 않음.
- 예산이 1회 남아있는 상태에서 리다이렉트가 발생할 경우, 예산 한도를 초과하여 후속 홉을 무단 전송할 위험 존재.

---

## 2. 해결 아키텍처 및 구현 내용

### A. 메트릭스 명확화 (Disentanglement of Metrics)
이미지 파일 개수와 실제 HTTP 요청 시도 횟수를 완전히 분리했습니다:

```ts
export interface HttpRequestMetrics {
  apiHttpRequestsAttempted: number;      // Figma REST API 호출 시도 횟수
  cdnHttpRequestsAttempted: number;      // CDN 이미지 HTTP 요청 시도 횟수 (최초 + 모든 리다이렉트 홉)
  totalHttpRequestsAttempted: number;    // 총 HTTP 요청 시도 횟수
  cdnRedirectHops: number;               // 총 리다이렉트 홉 발생 횟수
  imagesDownloadedSuccessfully: number;  // 정상 다운로드 및 검증 완료된 이미지 수
  imagesFailed: number;                  // 다운로드/검증 실패 이미지 수
  imagesReusedFromCache: number;         // 캐시 적중으로 재사용된 이미지 수
}
```

기존 호출자와의 하위 호환성을 위해 `actualFigmaApiCalls`, `actualCdnDownloads`, `totalHttpRequests`는 각각 `apiHttpRequestsAttempted`, `cdnHttpRequestsAttempted`, `totalHttpRequestsAttempted`의 alias로 동작합니다.

---

### B. `HttpRequestBudgetManager` 도입
```ts
export class HttpRequestBudgetManager {
  public apiHttpRequestsAttempted = 0;
  public cdnHttpRequestsAttempted = 0;
  public cdnRedirectHops = 0;

  constructor(
    public readonly maxApi: number,
    public readonly maxCdn: number,
    public readonly maxTotal: number
  ) {}

  get totalHttpRequestsAttempted(): number {
    return this.apiHttpRequestsAttempted + this.cdnHttpRequestsAttempted;
  }

  canMakeApiRequest(): { allowed: boolean; reason?: string } { ... }
  canMakeCdnRequest(): { allowed: boolean; reason?: string } { ... }
  consumeApiRequest(): void { this.apiHttpRequestsAttempted++; }
  consumeCdnRequest(isRedirectHop = false): void {
    this.cdnHttpRequestsAttempted++;
    if (isRedirectHop) this.cdnRedirectHops++;
  }
}
```

---

### C. 리다이렉트 홉 직전 예산 검증 및 차감 (Hop-by-Hop Pre-flight Enforcement)
`fetchCdnImageWithSecureRedirects` 내부의 while 루프에서:

1. **SSRF 및 도메인 보안 검사**: URL 검증 실패 시 즉시 리턴하며 HTTP 요청 및 예산 차감 0회 유지.
2. **사전 예산 검증 및 즉각 차감**:
   ```ts
   if (budgetManager) {
     const check = budgetManager.canMakeCdnRequest();
     if (!check.allowed) {
       return {
         ok: false,
         status: 0,
         error: check.reason,
         isBudgetExceeded: true,
         ...
       };
     }
     budgetManager.consumeCdnRequest(isHop);
   }
   ```
3. **네트워크 호출 실행**: `fetchImpl(currentUrl, ...)`
   - 401, 403, 429, 500 응답, AbortError(타임아웃), 네트워크 에러 발생 시에도 이미 시도된 요청이므로 카운트에 정확히 반영.
4. **리다이렉트 발생 시**:
   - 301/302 등 수신 시 Location 헤더, 프로토콜, 루프, SSRF 검증 완료 후 루프의 시작으로 이동(`continue`).
   - 다음 홉 직전에 다시 2번의 예산 검사를 수행하여, 만약 잔여 예산이 0이면 **다음 HTTP 요청을 아예 전송하지 않고 즉시 차단**합니다!

---

## 3. 단위 테스트 검증 결과

`tests/phase34a1-hotfix.test.ts` 내 9개 전용 테스트 케이스 통과:
- `2.1 counts exactly 1 CDN request when download has zero redirects`: **PASSED**
- `2.2 counts exactly 2 CDN requests when download follows 1 redirect (302)`: **PASSED**
- `2.3 counts exactly 3 CDN requests when download follows 2 redirects`: **PASSED**
- `2.4 blocks next hop and reports error when redirect exceeds maxRedirects limit`: **PASSED**
- `2.5 blocks redirect hop when CDN request budget is exhausted`: **PASSED**
- `2.6 blocks redirect hop when Total HTTP request budget is exhausted`: **PASSED**
- `2.7 accurately records attempted requests on HTTP 401, 403, and 429`: **PASSED**
- `2.8 accurately records attempted request on timeout (AbortError)`: **PASSED**
- `2.9 does not count requests blocked by SSRF policy before network dispatch`: **PASSED**
