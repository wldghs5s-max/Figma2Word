# Phase 35.1 — 05. 17개 프레임 시각 충실도 진단 및 기준선 실측 현황 보고서
**문서 번호**: P35_1-REP-05  
**작성 일시**: 2026-10-31  
**대상**: 펜테크 3차 디자인 17개 프레임 (`PQADsFQSbkiVHFWeJQavEf`)  
**상태**: **`PROVENANCE_GATE_BLOCKED`**

---

## 1. 개요 및 정직한 상태 보고

본 보고서는 펜테크 3차 디자인 17개 프레임에 대한 시각 충실도 측정 현황을 과학적 정직성의 원칙에 입각하여 보고합니다.

Phase 35.1에서는 **"실측하지 않은 수치는 절대 생성하지 않는다"**는 대원칙(Part A 금지 규칙)에 따라, 로컬 호스트에 186.52MB Figma 원본 JSON(`펜테크 3차 디자인.json`)이 부재하고 외부 네트워크 호출이 금지된 상황에서 임의의 합성 점수를 일절 산출하지 않았습니다.

---

## 2. 17개 프레임 참조 캐시 현황

로컬 `debug/cache/figma_references/PQADsFQSbkiVHFWeJQavEf/`에 안전하게 보관된 Figma 공식 API 캡처 참조 PNG(Phase 34B 수집) 현황은 다음과 같습니다:

| # | Node ID | Frame Name | 원본 Figma 해상도 | 참조 PNG 캐시 상태 | 비고 |
|---|---|---|:---:|:---:|---|
| 1 | `763:5068` | 디자인 시스템 1 | 1920 × 1080 | **VALID (87 KB)** | SHA-256 검증 완료 |
| 2 | `766:256` | 디자인 시스템 2 | 1920 × 1080 | **VALID (60 KB)** | SHA-256 검증 완료 |
| 3 | `757:88` | Desktop - 1 | 1440 × 1024 | **VALID (668 KB)** | SHA-256 검증 완료 |
| 4 | `759:759` | Desktop - 대시보드 (지도뷰) | 1920 × 1170 | **VALID (1,018 KB)** | SHA-256 검증 완료 |
| 5 | `757:92` | Desktop - 2 | 1449 × 1580 | **VALID (306 KB)** | SHA-256 검증 완료 |
| 6 | `757:142` | 촬영계획 | 1449 × 1083 | **VALID (803 KB)** | SHA-256 검증 완료 |
| 7 | `757:158` | 촬영계획 - 건물을 선택시 | 1449 × 1083 | **VALID (266 KB)** | SHA-256 검증 완료 |
| 8 | `759:911` | 사업목록 선택된 화면 | 1920 × 1170 | **VALID (601 KB)** | SHA-256 검증 완료 |
| 9 | `757:124` | 필터 팝업 | 1178 × 1291 | **VALID (343 KB)** | SHA-256 검증 완료 |
| 10 | `759:1076` | 신규등록 - 1 | 1920 × 1170 | **VALID (371 KB)** | SHA-256 검증 완료 |
| 11 | `766:2289` | 필터 | 504 × 613 | **VALID (22 KB)** | SHA-256 검증 완료 |
| 12 | `757:118` | Frame 1 | 1178 × 1291 | **VALID (127 KB)** | SHA-256 검증 완료 |
| 13 | `766:2942` | 사업정보 수정 | 504 × 935 | **VALID (48 KB)** | SHA-256 검증 완료 |
| 14 | `759:1314` | 신규등록 - 2 | 1920 × 1170 | **VALID (400 KB)** | SHA-256 검증 완료 |
| 15 | `759:1858` | 사업목록 클릭 시 | 1920 × 1170 | **VALID (129 KB)** | SHA-256 검증 완료 |
| 16 | `759:1533` | 사업목록 클릭 시 - 탭디자인1 | 1920 × 1221 | **MISSING** | `REFERENCE_MISSING_VERSION_UNVERIFIED` |
| 17 | `768:3434` | 사업목록 클릭 시 | 1920 × 1170 | **VALID (719 KB)** | SHA-256 검증 완료 |

- **유효 참조 이미지**: **16 / 17 프레임 정상 확보**
- **결측 노드**: `759:1533` (Figma 클라우드에서 삭제 또는 변형되어 404/Null을 반환한 노드로 영구 격리)

---

## 3. Provenance Gate에 의한 벤치마크 판정

- **원인**: 186.52MB Figma 원본 JSON 스냅샷이 로컬에 부재함.
- **오프라인 불변식**: `EXTERNAL_FIGMA_HTTP_REQUESTS: 0` (추가 네트워크 다운로드 금지).
- **판정 결과**:
  ```text
  REAL_FIGMA_JSON_INPUT: BLOCKED
  REAL_FIDELITY_BENCHMARK: INVALID (Awaiting authentic JSON input)
  MEASURED_BASELINE_SSIM: N/A
  MEASURED_IMPROVED_SSIM: N/A
  MEASURED_DELTA: N/A
  READY_FOR_PHASE36: NO
  ```

사용자가 원본 JSON 파일을 워크스테이션에 배치하거나 입력 경로를 지정할 때, 단 1회의 CLI 명령(`npx tsx scripts/run_phase35_1_real_recovery.ts --json <path>`)으로 16개 프레임의 실측 벤치마크가 즉시 완벽하게 가동됩니다.
