# Phase 33 — Report 10: Final Assessment & Roadmap

## 1. 종합 평가

Phase 33은 **"Figma API 호출 0회 (Zero Calls)"**라는 엄격한 제약 하에서, 기존 로컬에 확보된 187 MB Figma JSON 스냅샷의 가치를 극대화하고 오프라인 검증 인프라를 완성한 단계입니다.

1. **완전한 오프라인 전환 달성**:
   - `FIGMA_NETWORK_MODE=offline` 기본 정책을 강제하여, 개발 및 테스트 도중 발생할 수 있는 우발적인 Figma API 호출 및 토큰 잠금 위험을 100% 제거했습니다.
2. **신뢰할 수 있는 데이터 분류 체계 수립**:
   - `FIGMA_REFERENCE`, `WORD_RENDERED`, `REFERENCE_DOCX_RENDERED`, `UNKNOWN`으로 데이터를 명확히 분리하고, 원본 이미지가 부재한 현 상황을 `FIGMA_VISUAL_FIDELITY: NOT_VERIFIED`로 정직하게 기록했습니다.
3. **일회성 원본 확보 대비 완료**:
   - 향후 사용자가 명시적으로 승인할 때 단 한 번의 배치 요청으로 원본 PNG를 수집할 수 있는 One-Shot Capture 엔진을 모킹 테스트와 함께 완벽히 구축했습니다.
4. **시각 및 구조 충실도 향상**:
   - 다층 그룹 투명도(Cascading Opacity) 지원으로 7개 복합 페이지의 렌더링 품질을 추가 개선했으며, 10개 페이지는 무회귀 동일성을 유지했습니다.
5. **무결점 테스트 통과**:
   - 73개 테스트 스위트, 482개 테스트 전원 통과 (0개 실패).

---

## 2. 잔여 위험 및 한계 (Unresolved Risks)

1. **Figma 원본 PNG 부재**:
   - 현재 로컬에는 Figma가 직접 렌더링한 원본 PNG가 없으므로, Figma vs Word 간의 절대적인 픽셀 수준 SSIM 측정은 아직 수행되지 않았습니다.
2. **HWPX 네이티브 시각 렌더링 미검증 (`NOT_VERIFIED`)**:
   - macOS 환경에는 한컴오피스 데스크톱 뷰어가 없으므로, 생성된 HWPX의 실제 픽셀 출력은 여전히 `NOT_VERIFIED` 상태입니다 (OWPML 스키마 및 XML 구문 무결성만 검증됨).
3. **Figma API 토큰 만료 위험**:
   - 향후 One-Shot Capture 실행 시 사용될 Personal Access Token의 유효성 및 권한 상태는 사용자가 직접 확인해야 합니다.

---

## 3. Phase 34 로드맵 및 권장 사항

1. **사용자 승인 기반 One-Shot Capture 실행**:
   - 사용자가 Figma 토큰을 제공하고 `--capture` 플래그로 승인할 때, 17개 프레임의 원본 PNG를 1회 안전하게 수집하여 `debug/cache/figma_references/`에 영구 캐싱.
2. **Figma vs Word 픽셀 레벨 SSIM / MAE 벤치마크**:
   - 확보된 원본 PNG와 현재의 Word 렌더링 PNG 간의 Local Window SSIM, Worst Window SSIM, MAE를 전수 측정하여 정량 충실도 리포트 발행.
3. **Windows CI 연동 또는 HWPX 렌더링 자동화 검토**:
   - Windows 환경 또는 가상 머신을 활용한 한컴오피스 CLI 네이티브 렌더링 파이프라인 검토.
