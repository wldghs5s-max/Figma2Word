# Phase 34A.1 Hotfix: Crash Recovery Ordering & Exact HTTP Budget Accounting

## Executive Overview
Phase 34A.1 독립 감사에서 식별된 두 가지 핵심 결함(Crash Recovery Ordering 결함, CDN Redirect HTTP Budget 회계 결함)을 원천 수정하고, Phase 34B 라이브 수집을 위한 최종 기술적 준비를 완료한 핫픽스 릴리스입니다.

- **Target Phase**: Phase 34A.1 Hotfix
- **Repository**: `wldghs5s-max/Figma2Word`
- **Branch**: `master`
- **Base Commit**: `4ec2a73`
- **Audit Verification Verdict**: `READY_FOR_LIVE_CAPTURE: YES`
- **External Network Requests Executed**: **0 Calls (Strict Offline Invariant Preserved)**

---

## Resolved Defect Matrix

| ID | 결함 명칭 | 발견 원인 | 수정 내용 | 검증 결과 |
|---|---|---|---|---|
| **HOTFIX-01** | Crash Recovery Ordering & Cache Synchronization | `executeOneShotCapture()`가 계획(`plan`) 수립 후 저널 복구를 수행하여, 복구된 정상 캐시가 `toFetchNodeIds`에 미반영되던 결함 | 1) 실행 승인 및 디렉터리 준비 직후 저널 복구 선행<br>2) 복구 완료된 최신 매니페스트로 `planOneShotCapture` 재계산<br>3) 전 프레임 캐시 시 네트워크 0회 완료<br>4) Dry-run 읽기 전용 불변 보장 | 6개 전용 단위/통합 테스트 100% 통과 |
| **HOTFIX-02** | Exact HTTP Request Budget Accounting | CDN 이미지 다운로드의 리다이렉트 홉이 단일 카운터로 처리되어 실제 전송된 HTTP 요청 수와 예산 차감의 불일치 발생 | 1) `HttpRequestBudgetManager` 도입<br>2) API 및 CDN 최초 요청뿐만 아니라 모든 리다이렉트 홉 직전 예산 검증 및 차감<br>3) 4xx/5xx/타임아웃/네트워크 오류 시도 정확 집계<br>4) 예산 소진 시 다음 홉 원천 차단 | 9개 전용 단위/통합 테스트 100% 통과 |

---

## Directory Index
- `01-crash-recovery-order.md`: HOTFIX-01 크래시 복구 순환 순서 개선 및 캐시 동기화 상세 분석
- `02-http-budget-accounting.md`: HOTFIX-02 정밀 HTTP 요청 예산 관리 및 리다이렉트 홉 추적 아키텍처
- `03-failure-injection-results.md`: 결함 주입 및 시나리오 A, B, C 통합 검증 결과
- `04-preflight-results.md`: 17개 타겟 프레임 오프라인 불변성 및 사전 점검 결과
- `05-regression-results.md`: 전체 회귀 테스트 스위트 및 타입 검사 결과
- `06-final-readiness.md`: Phase 34B 실물 수집 릴리스 게이트 최종 판정 보고서
- `preflight-summary.json`: 17개 프레임 정밀 오프라인 감사 메타데이터 요약
