# 04. 17-Frame Target Preflight Results

## 1. 개요
실제 프로젝트의 기준 데이터인 17개 타겟 프레임(`exact-17-frames.json`) 및 캐시 매니페스트를 기반으로 오프라인 사전 점검(Preflight)을 수행했습니다.

- **스크립트**: `scripts/preflight_phase34a1_hotfix.ts`
- **산출물 JSON**: `phase34a1-hotfix/preflight-summary.json`
- **실행 시간**: 2026-10-31
- **실제 외부 네트워크 호출**: **0회**

---

## 2. 오프라인 Preflight 표준 보고

```text
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

REDIRECT_OVERHEAD: UNKNOWN
VERSION_MATCH: UNVERIFIED

REAL_EXTERNAL_HTTP_REQUESTS: 0
```

---

## 3. 프레임별 전수 감사 내역 (17/17 Unique Frames)

| 번호 | Node ID | Frame Name | 크기 (Px) | 캐시 상태 | 디스크 파일 | 판정 |
|---|---|---|---|---|---|---|
| 1 | `763:5068` | Frame 763:5068 | 390x844 | MISSING | 없음 | To Fetch |
| 2 | `766:256` | Frame 766:256 | 390x844 | MISSING | 없음 | To Fetch |
| 3 | `757:88` | Frame 757:88 | 390x844 | MISSING | 없음 | To Fetch |
| 4 | `759:759` | Frame 759:759 | 390x844 | MISSING | 없음 | To Fetch |
| 5 | `757:92` | Frame 757:92 | 390x844 | MISSING | 없음 | To Fetch |
| 6 | `757:142` | Frame 757:142 | 390x844 | MISSING | 없음 | To Fetch |
| 7 | `757:158` | Frame 757:158 | 390x844 | MISSING | 없음 | To Fetch |
| 8 | `759:911` | Frame 759:911 | 390x844 | MISSING | 없음 | To Fetch |
| 9 | `757:124` | Frame 757:124 | 390x844 | MISSING | 없음 | To Fetch |
| 10 | `759:1076` | Frame 759:1076 | 390x844 | MISSING | 없음 | To Fetch |
| 11 | `766:2289` | Frame 766:2289 | 390x844 | MISSING | 없음 | To Fetch |
| 12 | `757:118` | Frame 757:118 | 390x844 | MISSING | 없음 | To Fetch |
| 13 | `766:2942` | Frame 766:2942 | 390x844 | MISSING | 없음 | To Fetch |
| 14 | `759:1314` | Frame 759:1314 | 390x844 | MISSING | 없음 | To Fetch |
| 15 | `759:1858` | Frame 759:1858 | 390x844 | MISSING | 없음 | To Fetch |
| 16 | `759:1533` | Frame 759:1533 | 390x844 | MISSING | 없음 | To Fetch |
| 17 | `768:3434` | Frame 768:3434 | 390x844 | MISSING | 없음 | To Fetch |

---

## 4. 분석 결과 및 해석

1. **Node ID 중복성 검사**: 17개 프레임 ID가 100% 상호 고유함(`nodeIdUniqueness: 100%`).
2. **배치 구성 계획**: `batchSize: 20`이므로 17개 노드는 **단 1회의 Figma API 호출**(`expectedFigmaApiRequests: 1`)로 URL 조회가 완료됩니다.
3. **HTTP 요청 기본값 (Baseline)**:
   - 리다이렉트가 전혀 발생하지 않는 이상적 환경에서의 기본 요청 수: `1 (API) + 17 (CDN) = 18회`.
   - 예산 상한선: API 최대 5회, CDN 최대 25회, 전체 최대 30회.
   - 따라서 Baseline(18회) 기준 최대 12회의 리다이렉트 여유 버퍼가 확보되어 있습니다.
4. **리다이렉트 오버헤드 주의사항**:
   - AWS CloudFront 등 CDN 엣지 라우팅에 따라 302 리다이렉트가 발생할 경우 실제 HTTP 요청 수는 18회를 초과할 수 있으며, 본 핫픽스에 의해 모든 홉이 정밀하게 차감 및 보호됩니다.
