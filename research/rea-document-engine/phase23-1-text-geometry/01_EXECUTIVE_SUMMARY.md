# Phase 23.1 Executive Summary: Canonical Text Geometry & Overflow Recovery

## 1. 임무 개요
- **Repository**: `wldghs5s-max/Figma2Word`
- **기준 커밋**: `7eff9cf` (Phase 23)
- **목적**: Phase 23에서 도입된 `lineWrap="BREAK"`로 수평 압축 현상은 완화되었으나, 실제 한컴오피스 2024 뷰어에서 관찰된 **텍스트박스 좌우 폭 협소 현상(우측 공백 조기 개행)** 및 **개행 후 다운스트림 객체 침범·충돌 현상**의 근본 원인을 추적·규명하고 OWPML 규격 및 Canonical IR 수준에서 영구 복구함.

---

## 2. 핵심 발견 및 실제 근본 원인 (Root Cause Analysis)

### Root Cause 1: OWPML 문단 속성 결함 (`hh:paraPr`)
1. **`snapToGrid="1"` 활성화 결함**:
   - 기존 직렬화기(`hwpxCanvasRenderer.ts`)에서 모든 문단에 `snapToGrid="1"`이 부여되어 있었음.
   - 한컴오피스 렌더링 엔진은 `snapToGrid="1"`일 때 한글 글자들을 원고지/문서 격자 셀에 강제 스냅시켜 자간을 인위적으로 팽창시킴으로써, 가용 너비에 도달하기 훨씬 전에 조기 줄바꿈을 유발함.
   - **해결**: 정품 레퍼런스(`report-1차-진단-편집가능-최종보정.hwpx`) 전수 검증 결과 55개 `paraPr` 전체가 `snapToGrid="0"`을 적용함을 확인하여 `snapToGrid="0"`으로 전면 교정함.
2. **`hh:breakSetting` 누락 결함 (`breakNonLatinWord="BREAK_WORD"`)**:
   - `hh:breakSetting`이 누락되면 한컴 뷰어는 한글 단어를 어절 단위(`KEEP_WORD`)로 처리함.
   - 긴 한글 어절(예: "무손실변환하는", "보증등급이아닙니다")이 행 끝의 남은 공간에 들어가지 못하면 어절 전체를 다음 행으로 넘겨 우측에 수십 pt의 빈 공백이 남게 됨.
   - 이로 인해 사용자는 **"텍스트박스 폭이 원래 의도보다 좁게 잡힌 것 같다"**고 관찰하게 되었으며, 예상 줄 수(3줄)를 초과하여 4~5줄로 늘어나 하단 요소를 침범함.
   - **해결**: `<hh:breakSetting breakLatinWord="KEEP_WORD" breakNonLatinWord="BREAK_WORD" widowOrphan="0" keepWithNext="0" keepLines="0" pageBreakBefore="0" lineWrap="BREAK"/>` 표준 적용.
3. **`hh:autoSpacing` 자동 공백 삽입 결함**:
   - 한글과 영문/숫자 사이에 한컴 기본 자동 공백(`eAsianEng`, `eAsianNum`)이 삽입되어 "Figma 디자인", "Word(.docx) 형식", "80% 이상" 등의 문맥에서 줄 길이가 추가 팽창함.
   - **해결**: `<hh:autoSpacing eAsianEng="0" eAsianNum="0"/>` 표준 적용.

### Root Cause 2: 텍스트 내부 여백 인위적 침범 해소 (`textMargin`)
- 기존 코드에서 둥근 사각형 및 채우기 스타일이 적용된 객체에 `defaultPadL = cornerRadius * 0.4`를 자동 적용하여 텍스트 가용 너비를 인위적으로 축소하고 있었음.
- 정품 레퍼런스 837개 사각형 도형 전수 조사 결과: **텍스트박스의 좌우 마진(`left="0"`, `right="0"`)은 100% 0으로 설정되어 있음**.
- **해결**: Canvas IR에 명시적 `innerPaddingPt`가 있는 경우에만 해당 값을 반영하고, 그 외에는 `left="0", right="0"`을 기본값으로 유지하여 텍스트 가용 너비를 100% 확보함.

### Root Cause 3: Auto-Layout Bounds Synthesis CJK 글자 폭 추정 오류
- `figmaCanvasParser.ts`의 `synthesizeMissingChildBounds`에서 한 줄당 글자 수를 `innerW / (fs * 0.72)`로 계산하고 있었음.
- 라틴 알파벳(평균 0.55em)과 달리 한글/CJK 글자는 전각(1.0em)이므로, 라틴 기준(0.72em)을 적용하면 줄 수를 과소 계산(3줄로 잘못 판정)하여 합성 높이를 57pt로 부여하고 다음 요소를 바로 아래(y=199.4pt)에 바짝 배치하는 원인이 됨.
- **해결**: CJK/한글 글리프(1.0em)와 라틴 글리프(0.55em)를 정밀 구분하는 비례 계산식 도입.

### Root Cause 4: 원본 Figma Snapshot의 기하 충돌 (Category E: Source Geometry Conflict)
- Stage 7(`Report1-Live-Snapshot.json`)의 `7:952` 등 일부 텍스트 요소는 Figma 원본에서 82자의 긴 한글 문장이 영문 폰트(`Manrope`) 메타데이터와 함께 단 1줄 높이(`height: 17px = 12.7pt`)로 기록되어 있으며, 바로 다음 제목(`7:954`)이 `y=527.0pt`에 배치되어 있음.
- 이는 렌더러의 단위 변환 오류가 아니라 **원본 Figma JSON 자체에 물리적 높이 공간이 부족하게 기록된 Source Geometry Conflict**임.
- 렌더러가 주변 객체를 임의로 밀어내지 않고 단일 원본(Canvas IR)을 충실히 보존하며, 충돌 진단 도구(`TextCollisionDetector`)를 통해 충돌 원인을 명확히 진단·보고하도록 확립함.

---

## 3. 검증 상태 요약 (Verification Status)

| 검증 단계 | 상태 | 내용 |
|---|---|---|
| **L1: 구조 검증 (Structural)** | **PASS** | TypeScript 컴파일 0 오류, Vitest 58개 파일 370개 테스트 통과 (100%), 빌드 성공, AST 비교기 0 violations |
| **L2: 자동 기하 검증 (Visual & Geometry)** | **PASS** | `TextCollisionDetector`를 통한 Stage 6/7 오버플로우·충돌 정밀 분석 및 대조군 DOCX/HWPX 동시 생성 |
| **L3: 한컴 2024 뷰어 실측 (Viewer)** | **READY (사용자 대기)** | `debug/hwpx-phase23-1/` 디렉터리에 Stage 6, Stage 7 및 4종 진단 파일(`diag-*.hwpx`) 배치 완료 |
