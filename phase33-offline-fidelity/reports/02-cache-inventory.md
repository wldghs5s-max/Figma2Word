# Phase 33 — Report 02: Local Data & Cache Inventory

## 1. 개요

로컬 작업 공간 내의 모든 디자인 스냅샷, 참조 문서, 변환 생성물 및 렌더링 이미지의 출처를 조사하고 체계적으로 인벤토리화했습니다.

## 2. 4대 출처 타입 분류 원칙

1. **`FIGMA_REFERENCE`**: Figma REST API 또는 Figma 클라이언트 자체 렌더링을 통해 내보내진 원본 프레임 이미지 (기준 진실값).
2. **`WORD_RENDERED`**: Figma2Word가 생성한 DOCX를 Microsoft Word for Mac을 통해 렌더링한 PDF에서 추출한 이미지.
3. **`REFERENCE_DOCX_RENDERED`**: 사람이 직접 작성하거나 제공한 참고 DOCX를 Word로 렌더링한 이미지.
4. **`UNKNOWN`**: 출처가 불명확하거나 검증되지 않은 이미지.

> **중요 공지**: Word 출력 PNG(`WORD_RENDERED`)를 Figma 원본 PNG(`FIGMA_REFERENCE`)로 등록하거나 오인하지 않도록 엄격히 분리 관리합니다.

## 3. 로컬 파일 전수 인벤토리

| 파일 / 디렉토리 경로 | 크기 | 데이터 종류 | 소스 타입 분류 | 보존 및 Git 상태 |
| :--- | :--- | :--- | :--- | :--- |
| `펜테크 3차 디자인.json` | 195.58 MB | 원본 Figma 17개 프레임 AST 및 base64 imageMap | `FIGMA_JSON_SNAPSHOT` | Git 제외 (`.gitignore: 펜테크*`), 로컬 보존 |
| `펜테크 3차 디자인.docx` | 15.73 MB | 제공된 참고 DOCX 파일 | `REFERENCE_DOCX` | Git 제외 (`.gitignore: 펜테크*`), 로컬 보존 |
| `debug/phase32-benchmark/phase32_rendered.docx` | 15.00 MB | Phase 32 생성 DOCX | `GENERATED_DOCX` | 로컬 디버그 보존 |
| `debug/phase32-benchmark/phase32_rendered.hwpx` | 15.04 MB | Phase 32 생성 HWPX | `GENERATED_HWPX` | 로컬 디버그 보존 |
| `debug/phase32-benchmark/phase32_rendered.pdf` | 15.54 MB | Word for Mac PDF 내보내기 | `WORD_RENDERED_PDF` | 로컬 디버그 보존 |
| `debug/phase32-benchmark/pages/page-001~017.png` | 총 10.1 MB | Word PDF CoreGraphics 렌더링 이미지 | `WORD_RENDERED` | 로컬 디버그 보존 |
| `debug/phase33-benchmark/phase33_rendered.docx` | 15.00 MB | Phase 33 생성 DOCX (투명도 개선) | `GENERATED_DOCX` | 로컬 디버그 보존 |
| `debug/phase33-benchmark/phase33_rendered.hwpx` | 15.04 MB | Phase 33 생성 HWPX (알파 개선) | `GENERATED_HWPX` | 로컬 디버그 보존 |
| `debug/phase33-benchmark/phase33_rendered.pdf` | 15.54 MB | Word for Mac PDF 내보내기 | `WORD_RENDERED_PDF` | 로컬 디버그 보존 |
| `debug/phase33-benchmark/pages/page-001~017.png` | 총 10.1 MB | Word PDF CoreGraphics 렌더링 이미지 | `WORD_RENDERED` | 로컬 디버그 보존 |
| Figma 원본 프레임 PNG | **0개** | **로컬 저장소에 미존재** | `FIGMA_REFERENCE` | **`NOT_CACHED` (0건)** |

## 4. FIGMA_REFERENCE 부재에 따른 기술 상태 정직 보고

현재 로컬 환경에는 실제 Figma 서버에서 렌더링된 원본 프레임 PNG가 존재하지 않습니다.
따라서 시각적 비교 상태는 다음과 같이 정직하게 기록합니다:

> **`FIGMA_VISUAL_FIDELITY: NOT_VERIFIED`**
>
> 원본 PNG가 없으므로 Figma와 Word 출력 이미지 간의 직접적인 SSIM/MAE 측정은 수행하지 않으며, 임의의 참고 DOCX나 Word 출력을 Figma 원본이라고 위장하지 않습니다.
> 대신 Figma JSON 기하학과 Canvas IR 기하학 정합성, Canvas IR과 DOCX/HWPX XML 구조 정합성, 그리고 Phase 32 vs Phase 33 출력 비교를 통해 충실도를 측정합니다.
