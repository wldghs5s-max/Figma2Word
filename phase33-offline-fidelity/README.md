# Figma2Word — Phase 33: Offline-First Fidelity Engine & One-Shot Figma Reference Capture

## 1. 개요

Phase 33은 Figma Personal Access Token의 제한(Rate Limit/Account Lock) 위험에 대응하여, **Figma API 호출 없이(0회) 기존 로컬 JSON 스냅샷을 100% 활용하는 완전한 오프라인 검증 체계**를 구축하고, 향후 필요 시 사용자 명시적 승인 하에 1회성으로 안전하게 원본 PNG를 수집하는 One-Shot Reference Capture 엔진을 완성한 단계입니다.

## 2. 주요 달성 성과

1. **기본 오프라인 정책 강제 (Zero Figma API Calls)**:
   - `FIGMA_NETWORK_MODE=offline`을 기본값으로 강제하고, 모드 확인 없이 네트워크 요청이 발생할 경우 `REFERENCE_NOT_CACHED` 구조화 예외로 즉각 차단.
2. **로컬 캐시 매니페스트 시스템 (`cacheManifest.ts`)**:
   - `FIGMA_REFERENCE`, `WORD_RENDERED`, `REFERENCE_DOCX_RENDERED`, `UNKNOWN` 4개 소스 타입을 엄격히 분리하여 Word 출력 이미지가 Figma 원본으로 오인되는 것을 방지.
   - SHA-256 파일 무결성 및 버전 정합성 추적 지원.
3. **일회성 원본 수집 엔진 (`oneShotCapture.ts`)**:
   - Dry Run 기본 모드, 사용자 승인 플래그(`confirmExecution`), 배치 요청 분할, HTTP 429 Fail-Fast 즉시 중단, 토큰 마스킹 지원.
4. **계단식 투명도 전파 (Cascading Opacity Propagation)**:
   - Figma 상위 Group/Component의 `opacity`를 자식 요소로 수학적으로 곱연산 전파.
   - Word VML `<v:fill opacity="...">`, `<v:stroke opacity="...">` 및 HWPX OWPML `<hc:winBrush alpha="...">` 투명도 표준 렌더링 지원.
5. **안전성 결함 보완**:
   - Word 임시 격리 디렉토리 정리 시 디렉토리 경계 검사(`isPathInsideDirectory`)를 적용하여 `/tmp/vr_123`과 `/tmp/vr_1234` 접두사 충돌 완전 방지.
   - 벤치마크 스크립트의 비정상 종료 코드(`process.exit(1)`) 및 안전한 에러 정리 보장.
6. **무회귀 테스트 100% 달성**:
   - 기존 72개 스위트(469개 테스트) 100% 무회귀 통과 + 신규 Phase 33 스위트(13개 테스트) 추가 = **73개 스위트 482개 테스트 통과 (2개 스킵, 0개 실패)**.

## 3. 문서 인덱스

- [01-api-call-inventory.md](reports/01-api-call-inventory.md): Figma API 호출 경로 전수 조사 및 정책 매핑
- [02-cache-inventory.md](reports/02-cache-inventory.md): 로컬 데이터, 스냅샷, 렌더링 자료 전수 인벤토리
- [03-offline-policy.md](reports/03-offline-policy.md): 오프라인 기본 정책 구현 및 네트워크 차단 코드
- [04-one-shot-capture-design.md](reports/04-one-shot-capture-design.md): One-Shot Capture 아키텍처 및 배치 수집 계획
- [05-json-ir-fidelity.md](reports/05-json-ir-fidelity.md): Figma JSON → Canvas IR 정합성 정량 분석
- [06-docx-hwpx-structural-fidelity.md](reports/06-docx-hwpx-structural-fidelity.md): Canvas IR → DOCX / HWPX XML 구조 정합성
- [07-visual-comparison.md](reports/07-visual-comparison.md): 시각 비교 체계 및 Phase 32 vs Phase 33 렌더링 비교
- [08-renderer-fixes.md](reports/08-renderer-fixes.md): 계단식 투명도 및 디렉터리 경계 버그 범용 수정 내역
- [09-regression-results.md](reports/09-regression-results.md): 73개 테스트 스위트 무회귀 검증 결과
- [10-final-assessment.md](reports/10-final-assessment.md): Phase 33 최종 평가 및 Phase 34 로드맵
