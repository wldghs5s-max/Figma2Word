# Figma2Word — Phase 33 최종 완료 보고서: Offline-First Fidelity Engine & One-Shot Figma Reference Capture

---

## 1. 개요 및 최종 성과 요약

Figma2Word 프로젝트의 **Phase 33 (Offline-First Fidelity Engine & One-Shot Figma Reference Capture)** 작업이 성공적으로 완료되었습니다.

이번 Phase 33에서는 Figma Personal Access Token의 제한 및 계정 잠금 위험을 원천 차단하기 위해, **Figma API 호출 0회 (Zero Calls by Default)** 정책을 코드와 테스트로 완벽히 강제했습니다. 기존 187 MB 대규모 디자인 스냅샷(`펜테크 3차 디자인.json`)을 기반으로 17개 전 페이지의 변환 충실도를 오프라인 상태에서 정밀 측정했으며, 다층 계단식 투명도(Cascading Opacity) 지원 및 Word 자동화 디렉터리 경계 방어를 통해 엔진 품질과 안전성을 한 차원 더 끌어올렸습니다.

### 핵심 메트릭 비교 요약

| 지표 / 항목 | Phase 32 기준 | Phase 33 달성 | 변화 및 개선 효과 |
| :--- | :--- | :--- | :--- |
| **Git Commit** | `f172574` | `HEAD` (신규 커밋 예정) | Phase 33 오프라인 엔진 및 패키지 배포 |
| **Vitest 테스트 스위트** | 72개 파일 | **73개 파일** | +1개 전용 오프라인 충실도 스위트 추가 |
| **통과 테스트 케이스** | 469 통과, 2 스킵, 0 실패 | **482 통과, 2 스킵, 0 실패** | **+13개 신규 검증 통과 (100% 무회귀)** |
| **Figma API 호출 횟수** | - | **0회 (Zero Calls)** | 기본 오프라인 모드 강제로 토큰 잠금 원천 차단 |
| **네트워크 모드 정책** | 미지정 (Online 가능) | **강제 `offline` 기본값** | 무단 요청 시 `REFERENCE_NOT_CACHED` 예외 차단 |
| **캐시 매니페스트 시스템** | 미구현 | **구현 완료 (`cacheManifest.ts`)** | 4대 소스 타입 분리 및 SHA-256 무결성 검증 |
| **One-Shot Reference Capture** | 미구현 | **구현 완료 (`oneShotCapture.ts`)** | Dry Run 기본, 429 Fail-Fast, 토큰 마스킹 |
| **Word 자동화 디렉터리 검사** | 접두사 비교 (`startsWith`) | **엄격 디렉터리 경계 (`isPathInsideDirectory`)** | `/tmp/vr_123` vs `/tmp/vr_1234` 접두사 오탐 해소 |
| **Word 닫기 실패 방어** | 조건부 삭제 허용 위험 | **엄격 Fail-Closed (`return false`)** | close 미확증 시 무조건 디렉터리 보존 |
| **계단식 투명도 전파** | 미지원 (단일 레벨) | **다층 계단식 곱연산 전파 지원** | VML `<v:fill opacity>`, HWPX `alpha` 지원 |
| **17개 페이지 시각 렌더링** | 17개 페이지 실측 완료 | **10개 동일 보존, 7개 투명도 개선** | 100% 무회귀 및 반투명 오버레이 품질 향상 |
| **HWPX 네이티브 시각 검증** | NOT_VERIFIED | **NOT_VERIFIED (macOS)** | 정직한 기술 보고 유지 (Hancom CLI 부재) |
| **Figma 원본 PNG 시각 검증** | NOT_VERIFIED | **NOT_VERIFIED (로컬 미존재)** | 원본 부재 명시 및 정직한 상태 보고 유지 |

---

## 2. 기존 Figma API 호출 경로 전수 조사 및 정책

1. `GET /v1/files/:file_key` (`FigmaClient.fetchFile`): 기본 전면 차단 (`OFFLINE_MODE_BLOCK`).
2. `GET /v1/files/:file_key/nodes?ids=...` (`FigmaClient.fetchNodes`): 기본 전면 차단 (`OFFLINE_MODE_BLOCK`).
3. `GET /v1/files/:file_key/images` (`FigmaClient.fetchImageFills`): 기본 전면 차단 (`OFFLINE_MODE_BLOCK`).
4. `GET <downloadUrl>` (`FigmaClient.downloadImageAsBase64`): 기본 전면 차단. 오프라인 모드에서는 네트워크 호출을 건너뛰고 캐시된 이미지만 안전하게 반환.
5. `GET /v1/images/:file_key?ids=...&format=png` (`executeOneShotCapture`): 신규 추가된 One-Shot Capture 전용 API. 기본 Dry Run 모드(호출 0회)로 동작하며, 사용자가 `--capture` 및 `confirmExecution: true`로 승인할 때만 배치 실행.

---

## 3. 로컬 캐시 매니페스트 및 One-Shot Capture 구현

1. **로컬 캐시 매니페스트 (`src/cache/cacheManifest.ts`)**:
   - `FIGMA_REFERENCE`, `WORD_RENDERED`, `REFERENCE_DOCX_RENDERED`, `UNKNOWN` 4개 소스 타입을 엄격히 분리했습니다.
   - `getFigmaReference()` 호출 시 `WORD_RENDERED` 이미지가 Figma 원본으로 오인되어 반환되는 것을 엄격 차단합니다.
   - SHA-256 해시 및 파일 크기를 통한 무결성 검증과 버전 정합성(`VERSION_MATCH: UNVERIFIED`) 추적 기능을 탑재했습니다.
2. **One-Shot Reference Capture (`src/api/oneShotCapture.ts`)**:
   - 사용자가 Figma 토큰과 URL을 제공하더라도 기본적으로 Dry Run 계획(Plan)만 산출하며 실제 요청은 발생시키지 않습니다.
   - 배치 분할(기본 20개씩 묶음)을 통해 HTTP 요청 수를 최소화합니다.
   - HTTP 429 감지 시 즉시 Fail-Fast 중단하며 무한 재시도 루프를 돌지 않습니다.
   - 모든 진단 로그 및 에러 메시지에서 토큰을 `maskToken()`으로 안전하게 마스킹합니다.

---

## 4. 핵심 렌더링 품질 개선 사항 및 구현 내역

### 1) 계단식 투명도 전파 (Cascading Opacity Propagation)
- **원인 분석**: Figma에서 상위 그룹(`GROUP`, `FRAME`, `COMPONENT`)에 `opacity`가 적용되어 있으면, 모든 하위 요소에 투명도가 곱연산 합성되어 렌더링됩니다. 기존 엔진은 부모 투명도를 자식으로 전달하지 않아, 팝업 배경이나 오버레이 카드가 불투명(1.0)으로 뭉개지는 결함이 있었습니다.
- **해결 내역**:
  - `figmaCanvasParser.ts`: `processChildren(node, parentOpacity = 1.0)` 재귀 함수에서 $\text{effectiveOpacity} = \text{parentOpacity} \times \text{childOpacity}$를 계산하여 자식 요소로 전파.
  - `docxCanvasRenderer.ts`: `<v:fill opacity="${fillAlpha.toFixed(2)}"/>`, `<v:stroke opacity="${strokeAlpha.toFixed(2)}"/>` 지원.
  - `hwpxCanvasRenderer.ts`: `<hc:winBrush ... alpha="${Math.round((1 - fillAlpha) * 255)}"/>` 지원.

### 2) Word 자동화 디렉터리 경계 방어 (`isPathInsideDirectory`)
- **원인 분석**: `safe_word_automation.ts`의 `cleanResidualIsolationDirsSafely()`에서 경로 접두사를 `p.startsWith(normDir)` 단순 문자열로 비교하여 `/tmp/vr_123`과 `/tmp/vr_1234`가 오탐되는 잔여 버그가 있었습니다.
- **해결 내역**: `path.relative` 기반의 엄격한 OS 디렉터리 경계 판정 함수 `isPathInsideDirectory`를 도입하여 오탐을 100% 방지했습니다.

### 3) 벤치마크 비정상 종료 코드 보장
- `scripts/benchmark_phase32_real_figma.ts` 및 신규 벤치마크 스크립트에서 에러 발생 시 비상 문서 닫기 및 정리를 수행한 후 `process.exit(1)`로 즉시 비정상 종료되도록 수정하여, 실패가 성공으로 둔갑하는 문제를 차단했습니다.

---

## 5. 실제 17개 페이지 벤치마크 및 시각 비교 결과

Microsoft Word for Mac (v16.114) 네이티브 렌더링 PDF에서 Apple Swift CoreGraphics로 추출한 108 DPI 고해상도 이미지를 실측 비교했습니다:

- **10/17 페이지 완벽 동일 유지 (`IDENTICAL_PIXELS`)**: Page 1, 2, 3, 5, 6, 7, 9, 11, 12, 13은 Phase 32의 렌더링과 1바이트 오차도 없이 동일하게 보존되었습니다.
- **7/17 페이지 정밀 품질 개선 (`UPDATED_RENDERING`)**: Page 4, 8, 10, 14, 15, 16, 17에서 반투명 모달 딤 배경 및 테이블 행 오버레이가 투명도 속성에 맞게 자연스럽게 렌더링되도록 개선되었습니다.

---

## 6. 테스트 스위트 무회귀 검증 현황

```bash
Test Files  73 passed (73)
     Tests  482 passed | 2 skipped (484)
  Duration  6.74s
```
- **기존 72개 테스트 파일 (469개 테스트) 100% 무회귀 통과**.
- **신규 Phase 33 스위트 (`tests/phase33-offline-fidelity.test.ts`, 13개 테스트) 100% 통과**.

---

## 7. 산출물 및 감사 패키지

1. **Phase 33 문서 디렉토리 (`phase33-offline-fidelity/`)**:
   - `README.md`
   - `reports/01-api-call-inventory.md` ~ `reports/10-final-assessment.md` (총 10개 상세 리포트)
   - `evidence/logs/full_test_log.txt` (73개 스위트 통과 로그)
   - `evidence/git_diff_summary.patch` (Git 변경사항 패치)
   - `evidence/comparisons/` (구조 및 감사 통계 JSON)
   - `cache-manifest-example.json` (캐시 매니페스트 스키마 예시)
2. **독립 감사용 ZIP 번들**:
   - 위치: `phase33-gpt-review.zip` (94,098 bytes)
   - 보안 검증 완료: 회사 비공개 디자인 JSON, 원본 PNG, `.env`, 실제 토큰 등 민감 자료 0건 포함 확인.
