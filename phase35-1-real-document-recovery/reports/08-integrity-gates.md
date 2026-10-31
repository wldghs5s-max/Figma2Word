# Phase 35.1 — 08. 허위 성공 방지 자동화: Provenance & Measurement Integrity Gates
**문서 번호**: P35_1-REP-08  
**작성 일시**: 2026-10-31  
**대상 모듈**: `src/fidelity/integrityGate.ts`  
**상태**: **`DUAL_GATES_ACTIVE`**

---

## 1. 개요 및 목적

향후 어떠한 개발 단계에서도 실측되지 않은 가짜 수치, 합성 Fixture의 생산 결과 위장, 역산 조작, 프로세스 실패 은폐가 프로젝트에 유입되지 않도록 **2중 불변식 게이트(Provenance Gate & Measurement Integrity Gate)**를 구축했습니다.

---

## 2. 제1게이트: Provenance Gate (출처 계통 검증)

지표 데이터를 파일에 영구 저장하기 전에 데이터 파이프라인의 전 단계 출처가 명확한지 검증합니다:

```typescript
export function evaluateProvenanceGate(record: ProvenanceRecord): ProvenanceGateResult
```

### 필수 통과 요건 (8대 검사)
1. `isSyntheticDocument === false`: 합성 Fixture의 실제 모드 진입 원천 차단.
2. `jsonSha256` 64자리 16진수 해시 존재.
3. `jsonSizeBytes > 0`: 실제 디스크 파일 존재 증명.
4. `nodeTreeExtracted === true`: 실제 노드 트리 파싱 성공.
5. `canvasIrCreated === true`: 정규 Canvas IR 생성 확인.
6. `docxCreated === true` 및 `docxSha256` 존재.
7. `pdfCreated === true` 및 `pdfSha256` 존재.
8. `wordPngCount > 0` 및 전 페이지 SHA-256 목록 일치.

---

## 3. 제2게이트: Measurement Integrity Gate (측정 무결성 검증)

실측 수치의 수학적·물리적 무결성을 12개 항목에 걸쳐 자동 검증합니다:

```typescript
export function evaluateMeasurementIntegrity(bundle: MeasurementBundle): IntegrityGateResult
```

### 12대 이상 징후 탐지 사양
1. **INTEGRITY_FAIL_01**: 합성 모드(`mode !== "real"`)가 벤치마크 검증에 투입된 경우.
2. **INTEGRITY_FAIL_02**: Word COM 자동화가 실패했거나 0이 아닌 종료 코드를 반환한 경우.
3. **INTEGRITY_FAIL_03**: 입력 JSON 해시 누락 또는 변조.
4. **INTEGRITY_FAIL_04**: Baseline/Improved DOCX 해시 누락.
5. **INTEGRITY_FAIL_05**: Baseline/Improved PDF 해시 누락.
6. **INTEGRITY_FAIL_06**: 측정 페이지 목록 누락.
7. **INTEGRITY_FAIL_07A**: 결측 노드(`REFERENCE_MISSING_VERSION_UNVERIFIED`)에 임의의 숫자 점수가 부여된 경우.
8. **INTEGRITY_FAIL_07B**: 유효 벤치마크 페이지의 PNG 경로 누락.
9. **INTEGRITY_FAIL_07C**: Baseline과 Improved가 동일한 PNG 경로를 공유(재사용)한 경우.
10. **INTEGRITY_FAIL_07D**: 유효 벤치마크 프레임에 SSIM이 null인 경우.
11. **INTEGRITY_FAIL_08**: 모든 프레임에서 동일한 0이 아닌 델타가 관측되는 경우 (역산 조작 패턴 탐지).
12. **INTEGRITY_FAIL_09**: 요약 평균과 개별 페이지 산술 평균 간의 불일치 ($> 0.001$).

---

## 4. 부정 테스트(Negative Tests) 검증 결과

`tests/phase35-1-integrity-gate.test.ts`를 통해 위반 상황을 의도적으로 주입한 10개 부정 테스트를 실행한 결과, **10개 항목 모두 100% 탐지 및 차단에 성공**했습니다:
- [x] 정상 실측 번들 통과
- [x] 합성 Fixture 유입 차단
- [x] JSON 해시 누락 차단
- [x] 산출물 해시 누락 차단
- [x] 상수 델타(`0.0080`) 역산 조작 탐지 차단
- [x] 동일 이미지 재사용 탐지 차단
- [x] 결측 노드 임의 점수 부여 차단
- [x] Word 자동화 실패 은폐 차단
- [x] 요약 평균 불일치 차단
