# Phase 15: Engineering Handoff & Operations Manual (인수인계서)

## 1. 개요

본 인수인계 문서는 Figma2Word Phase 15 MVP의 아키텍처 구조, 로컬 실행 방법, CLI 및 Web UI 사용법, 그리고 후속 개발자를 위한 트러블슈팅 가이드를 제공한다.

---

## 2. 프로젝트 디렉터리 및 아키텍처 구조

```
Figma2Word/
├── src/
│   ├── canvas/                          # [Phase 13~15] 차세대 Canvas IR 듀얼 엔진
│   │   ├── types.ts                     # CanvasDocument, CanvasPage, CanvasElement IR 정의
│   │   ├── geometry/
│   │   │   └── svgPathParser.ts         # SVG Path 파서, 베지에 정규화, HWPX 정점 샘플러
│   │   ├── parser/
│   │   │   ├── figmaCanvasParser.ts     # Figma AST -> Canvas IR 파서
│   │   │   └── docxCanvasParser.ts      # DOCX OpenXML -> Canvas IR 역파서 (DOCX->HWPX)
│   │   └── renderer/
│   │       ├── docxCanvasRenderer.ts    # Canvas IR -> Microsoft Word (.docx) VML 렌더러
│   │       └── hwpxCanvasRenderer.ts    # Canvas IR -> 한컴 한글 (.hwpx) OWPML 렌더러
│   ├── parser/                          # [Legacy] 1차원 Flow 엔진 파서
│   ├── renderer/                        # [Legacy] 1차원 Flow 엔진 DOCX 렌더러
│   ├── pipeline/                        # 프레임 필터링, 이미지 분석 유틸리티
│   └── api/                             # Figma REST API 클라이언트
├── apps/
│   └── web/                             # [Track C] React 19 + Vite 8.3 로컬 웹 인터페이스
├── samples/
│   ├── synthetic-figma/                 # [Track D] 7대 합성 Figma 아키타입
│   ├── real-world/                      # 실무 보고서 스냅샷
│   └── output/                          # 변환 결과물 아티팩트
├── research/
│   └── rea-document-engine/
│       ├── phase15/                     # Phase 15 보고서 및 검증 스크립트
│       └── reference-corpus/            # DOCX/HWPX 기준 코퍼스 (SHA-256 검증본)
└── tests/                               # Vitest 단위/통합 테스트 슈트
```

---

## 3. 로컬 실행 및 사용 가이드

### 3.1 로컬 Web UI 실행 (가장 추천되는 사용법)
1. 개발 모드 서버 시작:
   ```bash
   npm run dev:web
   ```
   브라우저에서 `http://localhost:5173` 접속.
2. 프로덕션 빌드 및 프리뷰:
   ```bash
   npm run build:web
   npm --prefix apps/web run preview
   ```

### 3.2 CLI 변환 실행
- Figma JSON 파일로부터 듀얼 포맷 변환:
  ```bash
  npx tsx src/cli.ts samples/synthetic-figma/single-page-brief.json --engine canvas --format both
  ```
- DOCX로부터 HWPX로 직접 변환:
  ```bash
  npx tsx src/cli.ts samples/output/synthetic-benchmarks/single-page-brief.docx --to-hwpx
  ```

### 3.3 테스트 슈트 실행
- 전체 테스트 슈트(297+ 테스트) 실행:
  ```bash
  npm test
  ```
- 7대 합성 벤치마크 테스트만 실행:
  ```bash
  npx vitest run tests/synthetic-benchmarks.test.ts
  ```
- E2E 8개 시나리오 전수 검증:
  ```bash
  npx tsx research/rea-document-engine/phase15/scripts/run_e2e_scenarios.ts
  ```

---

## 4. 핵심 트러블슈팅 및 운영 주의사항

### 4.1 대용량 JSON 업로드 시 브라우저 메모리 관리
- 사용자가 20~40MB 규모의 대형 Figma JSON을 업로드할 때, 원본 JSON 문자열을 React State(DOM textarea)에 바인딩하면 V8 힙 폭증 및 브라우저 동결이 발생합니다.
- `apps/web/src/App.tsx`는 업로드 직후 `JSON.parse`하여 필요한 AST 노드만 메모리에 유지하고 문자열 State는 즉시 비우는(`setJsonInput('')`) 최적화가 적용되어 있습니다.

### 4.2 Windows 환경 PowerShell 스크립트 인코딩
- 한국어 문자열이 포함된 PowerShell(`.ps1`) 스크립트를 새로 작성할 때는 반드시 **UTF-8 with BOM (`utf-8-sig`)**으로 저장해야 Windows 기본 PowerShell 5.1에서 파싱 오류가 발생하지 않습니다.
- 필요 시 `research/rea-document-engine/phase15/scripts/write_ps1_bom.py` 유틸리티를 활용하십시오.

### 4.3 Word COM 프로세스 해제
- Word COM 자동화 테스트 실행 후 백그라운드에 `WINWORD.EXE`가 잔류하는 것을 방지하기 위해, 스크립트 종료 시 반드시:
  ```powershell
  $word.Quit()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
  ```
  를 호출하여 가비지 컬렉션을 즉시 유도해야 합니다.

