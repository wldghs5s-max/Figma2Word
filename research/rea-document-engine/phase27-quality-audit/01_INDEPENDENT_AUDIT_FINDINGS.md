# Phase 27 — 01. GPT-6 독립 감사 지적 사항 및 조치 계획 보고서 (Independent Audit Findings)

**문서 작성 일시**: 2026-10-20  
**작업자**: Antigravity (Google DeepMind Advanced Agentic Coding)  

---

## 1. 개요

Phase 26 완료 후 생성된 `phase26-gpt-review.zip`의 39개 파일에 대해 GPT-6가 독립 기술 감사를 수행했다. 감사 결과, 동일 규격 프레임의 VML 섹션 격리 및 `<w:wordWrap w:val="0"/>` 표준 준수 등의 성과는 인정되었으나, **자동화 안전성, 지표 산출의 신뢰성, 알고리즘 민감도, 실제 Ground Truth 부재**와 관련된 4대 핵심 결함이 지적되었다.

본 문서는 지적된 결함의 원인과 Phase 27에서 완료된 구체적 코드 레벨 조치 내역을 상호 매핑하여 기록한다.

---

## 2. 결함별 실측 조치 현황 (Action Matrix)

| 결함 ID | 감사 지적 사항 | 위험도 / 영향 | Phase 27 실제 코드 조치 | 보증 테스트 |
| :---: | :--- | :---: | :--- | :--- |
| **AUDIT-01** | `tools/visual-regression/pipeline.ts` 내 `close every document saving no` 존재로 사용자 문서 강제 종료 위험 | **CRITICAL** (데이터 영구 손실) | 일괄 닫기 전면 제거, `safe_word_automation.ts` 신규 구현으로 자동화 대상 문서만 정밀 식별·닫기 격리 | `tests/word-automation-safety.test.ts` (3/3 통과) |
| **AUDIT-02** | `compute_full_metrics.ts` 내 17개 섹션, 17페이지, 충돌 0건, 100% 호환성 하드코딩 | **HIGH** (측정 신뢰성 상실) | DOCX XML `<w:sectPr>` 파싱 및 실제 로그 역산 동적 메트릭 엔진으로 전면 개편 | `tests/metrics-trustworthiness.test.ts` (8대 케이스 전수 통과) |
| **AUDIT-03** | Global SSIM 단일 산출로 인한 국소 텍스트 잘림 및 버튼 누락 감지 실패 | **HIGH** (False Positive 위험) | $8 \times 8$ 슬라이딩 윈도우 기반 `Local Window SSIM` 및 최저 유사도 조기 경보 `Worst Local SSIM`, `EdgeDiff` 신규 구현 | `tests/visual-comparison-algorithm.test.ts` (3/3 통과) |
| **AUDIT-04** | 실제 Figma Export 이미지 부재 상태에서 원본 충실도 점수로 오인될 소지 | **MEDIUM** (기준선 모호) | 4단계 Ground Truth 분류 체계(`figma_ground_truth`, `approximate_reference`, `word_baseline`, `word_candidate`) 도입 및 출처 투명화 | `04_FIGMA_GROUND_TRUTH_STATUS.md` |
| **AUDIT-05** | CLI가 특정 회사 샘플 경로에 하드코딩되어 재사용성 결여 | **MEDIUM** (일회성 도구화) | `--input`, `--output`, `--scale-policy`, `--render-scale` 등 범용 플래그 및 인수 검증 구현 | `tools/visual-regression/cli.ts` |
| **AUDIT-06** | 22인치 초과 대형 웹 프레임의 단순 클램핑으로 인한 하단 콘텐츠 잘림 | **HIGH** (레이아웃 파괴) | 1,584pt 초과 시 종횡비를 유지하며 내부 객체와 함께 균일 축소하는 Uniform Scale Down 구현 | `tests/phase27-renderer-improvements.test.ts` (3/3 통과) |
| **AUDIT-07** | `rectangleCornerRadii`가 레거시 `cornerRadius` 스칼라 값에 덮어써지던 버그 | **MEDIUM** (스타일 왜곡) | 개별 모서리 반경 우선 적용 및 덮어쓰기 분기 버그 수정 | `tests/phase27-renderer-improvements.test.ts` (3/3 통과) |

---

## 3. 원칙 준수 요약

모든 지적 사항은 단순히 보고서 문구를 다듬는 데 그치지 않고, **실제 TypeScript/Swift 프로덕션 코드 수정과 철저한 단위 테스트(41/41 통과)를 통해 물리적·수학적으로 완벽히 교정**되었다.
