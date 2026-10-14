# Next Steps: Phase 13A Execution Roadmap
**Figma2Word — Canvas IR 기반 차세대 렌더러 구현 계획 및 단일 결정적 가설**

---

## 1. 단일 결정적 가설 (Single Decisive Hypothesis)

> **"Figma의 2D 절대좌표를 1D 플로우 표(Flow Table)로 축약하지 않고, 용지 여백 0의 A4 캔버스 상에 1문단/1페이지 기준의 절대좌표 텍스트박스(VML/DrawingML for DOCX, OWPML for HWPX)로 1:1 직렬화하면, 수직 팽창과 중첩 테이블 왜곡을 완전히 제거하여 실제 완성본 수준의 시각적 일치도(SSIM ≥ 92%)와 100% 네이티브 텍스트 편집성을 동시에 달성할 수 있다."**

---

## 2. Phase 13A 단계별 실행 로드맵

```
[Step 13A-1] Canvas IR 타입 정의 및 정규화 계층 구축
     ↓
[Step 13A-2] Figma AST → Canvas IR 파서 구현 (FigmaCanvasParser)
     ↓
[Step 13A-3] DocxCanvasRenderer 구현 (VML/DrawingML 절대 캔버스 DOCX)
     ↓
[Step 13A-4] HwpxCanvasRenderer 구현 (OWPML 절대 캔버스 HWPX)
     ↓
[Step 13A-5] Step 12A 품질 감사 인프라를 통한 3종 실무 보고서 정밀 회귀 검증
```

---

### Step 13A-1: Canvas IR 코어 타입 정의 (`packages/core/src/canvas/`)
- `CanvasDocument`, `CanvasPage`, `CanvasElement`, `CanvasBounds`, `CanvasStyle`, `CanvasTextRun` 인터페이스 선언.
- 좌표 단위 규격화: 포인트(`pt`)를 기본 단위로 지정 ($1\text{ Figma px} = 0.75\text{ pt}$ 또는 $1:1$ 변환 유틸리티 제공).
- 단위 변환기:
  - `pt -> dxa` ($1\text{ pt} = 20\text{ dxa}$)
  - `pt -> EMU` ($1\text{ pt} = 12,700\text{ EMU}$)
  - `pt -> HWPU` ($1\text{ pt} = 100\text{ HWPU}$)

### Step 13A-2: Figma AST → Canvas IR 파서 (`FigmaCanvasParser`)
- Figma의 최상위 프레임(A4 Page)을 기준으로 자식 노드들의 누적 절대좌표 $(x, y, w, h)$ 계산.
- 부모 프레임의 클리핑(`clipsContent`), 절대 위치(`layoutPositioning: 'ABSOLUTE'`), 오토레이아웃(`flex`) 요소를 절대 바운딩 박스로 평탄화(Flattening).
- 배경색, 테두리선, 모서리 곡률(`cornerRadius`), 텍스트 런 서식 추출.

### Step 13A-3: DocxCanvasRenderer 구현
- `word/document.xml`:
  - `w:sectPr`: 용지 여백 0 (`w:pgMar top="0" bottom="0" left="0" right="0"`).
  - 페이지 루프: 각 페이지마다 정확히 1개의 `<w:p>` 생성.
  - 첫 페이지 제외 모든 문단에 `<w:pageBreakBefore/>` 및 `<w:spacing w:line="20" w:lineRule="exact"/>` 적용.
  - 각 엘리먼트를 `<w:r><w:pict><v:rect>...</v:rect></w:pict></w:r>` 형태로 직렬화.
  - 텍스트는 `<v:textbox><w:txbxContent><w:p><w:r><w:t>`로 출력하여 완전 편집 가능 유지.

### Step 13A-4: HwpxCanvasRenderer 구현
- `prototype_hwpx_builder.py`에서 검증된 구조를 TypeScript/Node.js로 이식.
- `mimetype`: 오프셋 0에 19바이트 비압축(`ZIP_STORED`) 저장.
- `Contents/section0.xml`:
  - `hp:pagePr width="59530" height="84190"` (A4, 여백 0).
  - 각 엘리먼트를 `<hp:rect horzRelTo="PAPER" vertRelTo="PAPER" horzOffset="{x*100}" vertOffset="{y*100}">`로 직렬화.
  - 텍스트는 `<hp:drawText>`로 출력.

### Step 13A-5: 3종 실무 보고서 정밀 회귀 검증
- Step 12A에서 구축된 자동 품질 검증 인프라 가동:
  - Word COM 렌더링을 통해 PDF 및 페이지별 고해상도 PNG(300 DPI) 생성.
  - `완성본-20261012/` 정답 PDF/PNG와 신규 생성물 간 시각적 차이 맵(Diff Image) 및 SSIM 측정.
  - 목표: 기존 표 기반 엔진 대비 SSIM 30% 이상 향상 및 페이지 수(정확히 9페이지/8페이지) 100% 일치.

---

## 3. 리스크 평가 및 대응 방안

| 잠재적 리스크 | 영향도 | 기술적 대응 방안 |
| :--- | :---: | :--- |
| **텍스트 수정 시 박스 오버플로우** | 중간 | `v:textbox`에 `mso-fit-shape-to-text` 속성 지원 및 충분한 기본 하단 패딩 확보. |
| **타 오피스 프로그램 호환성** | 낮음 | VML과 OWPML은 각각 MS Word 및 한컴오피스의 핵심 렌더링 엔진에서 10년 이상 완벽 검증된 표준 기술임. |
| **폰트 미설치로 인한 줄바꿈 변경** | 중간 | 공통 범용 폰트(Pretendard, 맑은 고딕, Arial) 매핑 테이블 적용 및 향후 폰트 임베딩 기능 연계. |
| **대규모 XML 직렬화 성능** | 매우 낮음 | Node.js의 메모리 스트림 기반 ZIP 패키징을 통해 10페이지 기준 200ms 이내 생성 완료 확인. |

