# Phase 27 — 09. 미해결 기술적 위험 및 차기 아키텍처 로드맵 (Unresolved Risks)

**문서 작성 일시**: 2026-10-20  
**작업자**: Antigravity (Google DeepMind Advanced Agentic Coding)  

---

## 1. 개요

Phase 27에서는 자동화 데이터 손실 위험 제거, 지표 하드코딩 제거, Local Window SSIM 도입, 22인치 초과 균일 축소 등 핵심 결함을 해결했으나, 현재 Figma2Word 아키텍처가 가진 본질적 한계로 인해 차기 Phase에서 지속적으로 다루어야 할 미해결 기술적 위험이 존재한다.

---

## 2. 4대 미해결 위험 분석 (Unresolved Risks)

### 2.1 실제 Figma 클라우드 비트맵(`figma_ground_truth`) 부재
- **현재 상태**: 로컬 환경에 유효한 Figma API 토큰이 존재하지 않아, Figma 클라우드 렌더러(Skia 엔진)에서 픽셀 단위로 직접 내보낸 원본 비트맵 이미지를 확보하지 못함.
- **영향**: 현재 시각 비교는 `word_baseline` 대비 `word_candidate`의 비회귀성 검증에 한정되며, Figma 원본 대비 절대적인 픽셀 유사도는 측정할 수 없음.
- **차기 조치**: 사용자가 토큰을 안전하게 1회성으로 주입할 수 있는 `FIGMA_PAT` 입력 CLI 환경을 지원하여 실제 원본 비트맵 17장을 영구 아카이빙할 필요가 있음.

### 2.2 VML(`urn:schemas-microsoft-com:vml`) 그래픽 모델의 장기 유지보수성
- **현재 상태**: 현재 엔진은 Word 호환성을 위해 2D 절대좌표를 VML 태그(`<v:rect>`, `<v:roundrect>`, `<v:textbox>`)로 출력하고 있음.
- **한계**: VML은 레거시 Office 포맷으로, 복잡한 그라디언트, 다중 블러 그림자(Drop Shadow), 클리핑 패스(`clipsContent`)를 온전히 표현하는 데 한계가 있음.
- **차기 과제**: ECMA-376 Part 1의 최신 그래픽 표준인 **DrawingML (`w:drawing / a:graphic`)**으로의 점진적 전환 아키텍처 연구 필요.

### 2.3 DirectWrite(Word) vs Skia(Figma) 간의 글꼴 폭 편차 (1~3%)
- **현재 상태**: 단일행 텍스트에 대해 `Math.max(3, width * 0.03)` 버퍼와 `<w:wordWrap w:val="0"/>`를 적용하여 줄바꿈을 방어하고 있음.
- **한계**: 다국어(한글/영문/숫자/특수문자) 혼용 시 긴 단어가 인접 우측 컴포넌트 경계에 미세하게 근접하는 현상이 일부 발생함.
- **차기 과제**: Canvas IR 레벨에서 문자열의 글리프 너비를 보다 정밀하게 측정하는 폰트 메트릭 캐시 도입 필요.

### 2.4 복합 테이블 컴포넌트의 순수 2D 절대좌표 배치 한계
- **현재 상태**: Page 8, 15의 데이터 목록은 표 형태의 UI이나, 현재는 개별 셀 직사각형과 텍스트박스로 파편화되어 렌더링됨.
- **한계**: DOCX 사용자가 Word에서 행을 추가하거나 텍스트를 길게 수정할 때 하단 행이 자동으로 밀리지 않고 겹치게 됨.
- **차기 과제**: 2D 바운딩 박스를 격자형 네이티브 테이블(`<w:tbl>`)로 역합성하는 Table Reconstruction 파이프라인 연계 필요.
