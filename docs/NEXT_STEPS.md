# 다음 작업자 인수인계 가이드 (NEXT_STEPS)

본 문서는 다음 개발자가 즉시 프로젝트를 이어서 고도화할 수 있도록 현재 상태와 다음 작업 목록을 안내한다.

---

## 1. 현재 구축된 환경 요약

- **저장소 위치**: `c:\Users\77\Documents\Figma2Word`
- **핵심 파이프라인**:
  - `Figma AST JSON` → `FigmaParser` → `InternalDocument` → `DocxRenderer` → `.docx`
  - 3개 핵심 Fixture 및 End-to-End 수직 슬라이스 완성 (`npm run convert`).
- **테스트 커버리지**: 4개 테스트 스위트, 10개 테스트 전원 통과 (`npm test`).
- **웹 UI**: `apps/web` (React + TypeScript + Vite) 브라우저 독립 변환기 구축 완료 (`npm run dev:web`).

---

## 2. 바로 실행해 볼 수 있는 명령어

```bash
# 1. 의존성 설치
npm install
npm --prefix apps/web install

# 2. TypeScript 빌드 검증
npm run build

# 3. 자동 테스트 실행
npm test

# 4. 샘플 Figma Fixture 일괄 DOCX 변환 실행
npm run convert

# 5. 로컬 웹 변환기 UI 실행 (브라우저에서 직접 테스트)
npm run dev:web
```

---

## 3. 다음 단계 우선순위 과제 (Action Items)

### Task 1: 실제 회사 Figma 디자인 샘플 확보 및 엣지 케이스 검증
- 실제 회사에서 사용 중인 사업계획서/제안서 Figma 파일의 JSON 트리 확보 (`samples/real-world/`).
- `npm run convert -- samples/real-world/project.json` 실행 후 레이아웃 깨짐 현상 분석.

### Task 2: Figma REST API Fetcher 연동 (`src/api/`)
- 현재는 로컬 JSON 입력 방식만 연결되어 있음.
- Figma Personal Access Token을 `.env`에 설정하고 Figma 파일 키(`FIGMA_FILE_KEY`)를 통해 `https://api.figma.com/v1/files/:key`에서 실시간 AST 및 이미지 에셋(`https://api.figma.com/v1/images/:key`)을 다운로드하는 어댑터 모듈 구현.

### Task 3: 레이아웃 엔진 고도화 (`src/layout/`)
- `layoutMode: HORIZONTAL` 시 자식 요소의 `layoutSizingHorizontal` (`FIXED`, `HUG`, `FILL`) 속성에 따른 가로 너비 비례 계산 정밀화.
- 깊은 중첩(Deeply nested frames)이 발생할 때 과도한 중첩 테이블 생성을 방지하는 트리 평탄화(Flattening) 로직 추가.

### Task 4: 변환 모드 차별화
- `Balanced` (기본값): 현재 하이브리드 전략.
- `Design Fidelity`: 모서리 배경 박스를 이미지로 굽거나 좌표 정밀도 극대화.
- `Word Editability`: 복잡한 카드를 일반 단락/표 형태로 단순화하여 텍스트 편집성 극대화.
