# Phase 17 — Known Limitations & Honest Technical Boundaries

## 1. 개요

Figma2Word는 2D 절대좌표 Canvas IR을 기반으로 Figma의 정밀한 레이아웃을 Microsoft Word 및 한컴오피스 한글의 네이티브 드로잉 요소로 변환하는 데 최적화되어 있다. 그러나 오피스 워드프로세서 포맷(OOXML / OWPML)의 자체적 특성과 렌더링 엔진의 한계로 인해 다음과 같은 기술적 경계가 존재한다.

---

## 2. 잔여 한계 사항 목록

### 2.1. Canvas 절대좌표 표 vs Flow 네이티브 표 (`<w:tbl>` / `<hp:tbl>`)
- **현상**: Figma에서 작성된 표(Table) 또는 카드 그리드는 Canvas 모드에서 각각의 셀이 독립된 직사각형(`<v:rect>`, `<hp:rect>`)과 텍스트 박스로 변환된다.
- **영향**: 시각적 정렬과 개별 셀 텍스트 편집은 완벽히 지원되지만, Word나 한글의 "표 행 추가/삭제", "열 너비 자동 재계산" 등의 표 전용 기능을 사용할 수는 없다.
- **대안**: 표 구조 재합성 엔진(Flow Engine)이 별도 존재하며, CLI나 Web UI에서 용도에 맞게 선택할 수 있다.

### 2.2. 복합 클리핑 패스 (Non-Rectangular Clips)
- **현상**: Figma 노드의 `clipsContent: true`는 사각형 바운딩 박스 단위로 처리된다. SVG의 비정형 곡선 마스크나 원형 마스크 내부에 잘리는 복합 클리핑은 드로잉 오피스 포맷에서 온전히 지원되지 않는다.
- **대안**: 복합 마스크 요소는 `ImageElement` 래스터화 또는 다중 서브패스 폴리곤으로 근사 처리된다.

### 2.3. 시스템 미설치 폰트의 대체 렌더링 (Font Fallback)
- **현상**: 사용자의 로컬 PC에 Figma 디자인에서 사용된 폰트(예: `Pretendard`, `Inter`, `Spoqa Han Sans`)가 설치되어 있지 않은 경우, Microsoft Word 및 한컴오피스는 OS 기본 글꼴(`맑은 고딕`, `Calibri`)로 대체하여 렌더링한다.
- **영향**: 글자 폭의 미세한 차이로 인해 텍스트 줄바꿈 위치가 Figma와 1~2글자 차이날 수 있다.
- **대안**: 자주 사용하는 서체는 로컬 시스템에 사전 설치할 것을 권장하며, 향후 HWPX/DOCX 폰트 임베딩 확장을 검토할 수 있다.

### 2.4. 온라인 Figma API 실시간 호출 속도 제한 (Rate Limiting)
- **현상**: Figma REST API는 단시간 대량 호출 시 HTTP 429(Too Many Requests)를 반환한다.
- **대안**: 오프라인 JSON 스냅샷(`--file`) 또는 캐시된 이미지 맵 활용을 우선 권장한다.
