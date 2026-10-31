# Visual Fidelity Benchmark Evidence Archive Policy

## 1. 목적
본 디렉터리는 Phase 34B Stage 3에서 생성될 프레임별 시각 비교 증빙(Figma 원본 PNG, Word 렌더링 PNG, 차이 맵, 알파 오버레이 이미지 등)의 저장 및 기밀 보호 정책을 정의합니다.

## 2. 기밀 보호 및 Git 제외 정책
- 고객사 실제 디자인 및 렌더링 결과물은 기밀 정보이므로 **절대 Git 리포지토리에 커밋하거나 푸시하지 않습니다**.
- `.gitignore` 설정에 따라 이미지 바이너리(`*.png`, `*.jpg`) 및 대용량 결과물은 로컬에만 보관됩니다.
- 독립 감사용 ZIP 생성 시에도 고객사 원본 디자인 이미지는 엄격히 제외되며, 수치 지표(SSIM, MAE, BBox 오차 등) 및 익명화된 레이아웃 데이터만 포함됩니다.

