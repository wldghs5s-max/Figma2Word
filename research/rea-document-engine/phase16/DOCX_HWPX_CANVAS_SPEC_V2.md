# Phase 16 — DOCX & HWPX Canvas Engine Specification v2

## 1. 개요
Canvas IR v2는 Figma2Word의 2D 절대좌표 기반 문서 중간 표현(Intermediate Representation) 규격으로, Figma의 2D 캔버스 공간을 Microsoft Word 네이티브 드로잉(VML/DrawingML)과 한컴오피스 한글 네이티브 드로잉(KS X 6101 OWPML)으로 정밀 상호 변환하기 위한 표준 사양이다.

Phase 16 하드닝을 거치며 다중 줄바꿈(`<w:br/>`, `<hp:p>`), VML 절대좌표 변환, SVG 밀집 아크 플래그 처리, 3차 베지에 극점 바운딩 박스, 동적 가로/세로 오리엔테이션 및 보안 한도가 공식 규격화되었다.

---

## 2. 좌표계 및 단위 체계

내부 표준 단위는 **PostScript Point (pt, 1/72 inch)**를 사용하며, 각 포맷별 변환 공식은 다음과 같다:

| 대상 환경 | 내부 단위 (pt) | 공식 포맷 단위 | 변환 공식 | 비고 |
|---|:---:|:---:|:---:|---|
| **Figma Canvas** | pt | CSS Pixel (96 DPI) | `1 pt = 96 / 72 px ≈ 1.333 px` | `1 px = 0.75 pt` |
| **Microsoft Word** | pt | Twip (dxa, 1/20 pt) | `twip = Math.round(pt * 20)` | `1 pt = 20 twips` |
| **Word EMU** | pt | EMU (1/12,700 pt) | `emu = Math.round(pt * 12700)` | 1 inch = 914,400 EMU |
| **한컴오피스 HWPX** | pt | HWPU (1/100 pt) | `hwpu = Math.round(pt * 100)` | 1 mm ≈ 283.46 HWPU |
| **물리 규격 (mm)** | pt | Millimeter (mm) | `mm = (pt * 25.4) / 72` | A4 = 210 x 297 mm |

---

## 3. 포맷별 세부 매핑 사양

### (1) Microsoft Word (DOCX / VML Canvas)
Word 문서 본문은 단일 또는 다중 `<w:p>` 단락으로 구성되며, 각 페이지의 배경과 요소는 `<w:pict>` 컨테이너 내의 VML 요소로 직렬화된다.

- **텍스트 박스 (`<v:textbox>`)**:
  - `<w:txbxContent>` 내에 `<w:p>`와 다중 `<w:r>`을 포함.
  - 줄바꿈 보존: 텍스트 런 내의 개행문자(`\n`)는 세그먼트 사이의 `<w:br/>`로 방출.
  - 패딩: `inset="left,top,right,bottom"` (pt 단위).
- **벡터 도형 (`<v:shape>`)**:
  - `coordsize="1000,1000"` 정규화 좌표계.
  - VML 패스 명령: `m` (절대 이동), `l` (절대 직선), `c` (절대 곡선), `x` (닫기), `e` (종료).
- **페이지 오리엔테이션 (`<w:sectPr>`)**:
  - 가로(Landscape): `<w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/>`
  - 세로(Portrait): `<w:pgSz w:w="11906" w:h="16838" w:orient="portrait"/>`

### (2) 한컴오피스 한글 (HWPX / KS X 6101 OWPML)
KS X 6101 국가 표준 OWPML 스키마를 준수하며, `Contents/section0.xml` 내에 드로잉 요소들을 배치한다.

- **텍스트 박스 (`<hp:drawText>`)**:
  - `<hp:subList>` 내에 `<hp:p id="${pIdx}">` 단락들을 수용.
  - 줄바꿈 보존: 텍스트 내 줄바꿈 발생 시 새로운 `<hp:p id="pIdx">`를 개설하여 문단 단위로 엄격히 분할.
  - 런 매핑: `<hp:run charPrIDRef="...">`를 통해 7개 언어군 글꼴 및 스타일 참조.
- **벡터 폴리곤 (`<hp:polygon>`)**:
  - 다중 서브패스 지원: 복합 패스(Compound Paths)는 `toHwpxSubpaths`를 통해 독립된 컨투어로 파티셔닝.
  - 정점 배열: `<hp:pt x="${xHwpu}" y="${yHwpu}"/>` (HWPU 정수 좌표).
- **이미지 (`<hp:pic>`)**:
  - `<hp:imgClip>`을 활용한 뷰포트 클리핑 및 커버 크롭.
  - BinData 패키징: 실제 리소스 바이너리 분석(JPEG 매직바이트)을 통해 `.jpg`와 `image/jpeg` 또는 `.png`와 `image/png`를 엄격히 분기하여 `manifest.xml` 및 `content.hpf`에 선언.
- **페이지 오리엔테이션 (`<hp:pagePr>`)**:
  - 가로: `<hp:pagePr landscape="WIDELY" width="84189" height="59528" ...>`
  - 세로: `<hp:pagePr landscape="NARROWLY" width="59528" height="84189" ...>`

---

## 4. 보안 및 스코프 경계 (Security & Scope Boundaries)

1. **ZIP 폭탄 및 입력 한도**:
   - 최대 입력 크기: 100 MB.
   - 최대 ZIP 엔트리 수: 5,000 개.
   - 최대 압축 해제 누적 크기: 250 MB.
2. **경로 탐색 가드**: Null 바이트(`\0`) 및 디렉터리 탈출 탐색 차단.
3. **정직한 스코프 진단 (`[SCOPE_NOTICE]`)**:
   - Word 네이티브 표(`<w:tbl>`): 플로우 표는 캔버스 2D 배치 영역 밖으로 분류되며 진단 경고 발생.
   - ChartML(`<c:chart>`) 및 OLE 바이너리 개체(`<w:object>`): 진단 경고 발생.
