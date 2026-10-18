# Figma2Word 아키텍처 및 핵심 원칙 (Project Architecture & Core Principles)

**문서 분류**: 독립 기술 감사(Independent Technical Audit) 자료 01  
**대상 리포지토리**: `wldghs5s-max/Figma2Word`  
**기준 커밋**: `5ecc067`  

---

## 1. 프로젝트 비전 및 근본 목적

`Figma2Word`는 Figma 디자인 파일(REST API 응답 또는 오프라인 JSON 스냅샷)을 입력받아, 사용자가 즉시 인쇄·배포·편집할 수 있는 **상용 오피스 문서(Microsoft Word DOCX 및 한컴오피스 HWPX)**로 자동 변환하는 오픈소스 문서 변환 엔진입니다.

이 프로젝트의 핵심 철학은 **"완벽한 시각적 충실도(Visual Fidelity)와 완전한 사후 편집 가능성(Full Editability)의 동시 달성"**입니다. 이미지를 통째로 박는 래스터화(Rasterization) 방식이 아니라, 텍스트·도형·표·선·이미지 등의 모든 구성 요소를 네이티브 워드프로세서 객체로 1:1 직렬화합니다.

---

## 2. 불변의 설계 원칙: Canonical JSON (Canvas IR) as Single Source of Truth

이 프로젝트에서 DOCX와 HWPX는 대등한 출력 포맷이며, 어느 한쪽이 다른 쪽의 원본이 아닙니다.  
**중간 추상화 표현인 `CanvasDocument` (Canonical JSON / Canvas IR)이 유일무이한 단일 원본(SSOT)입니다.**

```text
                  [ Figma Design Source ]
                  (API JSON / Offline Snapshot)
                             │
                             ▼
                  [ FigmaCanvasParser ]
                             │
                             ▼
               ==============================
               * Canonical JSON (Canvas IR) *  <--- Single Source of Truth
               ==============================
                             │
             ┌───────────────┴───────────────┐
             ▼                               ▼
   [ DocxCanvasRenderer ]          [ HwpxCanvasRenderer ]
             │                               │
             ▼                               ▼
       Output (.docx)                  Output (.hwpx)
     (Microsoft Word)                (한컴오피스 한글)
```

### 2.1 아키텍처 불변 규칙
1. **포맷 종속적 역류 금지**: HWPX 렌더러의 버그나 특수성을 회피하기 위해 Canonical JSON의 좌표, 크기, 텍스트 구조를 왜곡하거나 오염시켜서는 안 됩니다.
2. **동등한 표현력**: Canonical JSON에 기록된 텍스트 내용, 박스 크기, 정렬, 색상, 글꼴 크기는 DOCX와 HWPX 양측 렌더러에 동일하게 전달되어야 합니다.
3. **렌더러 책임 원칙**: 특정 워드프로세서(예: 한컴오피스)가 텍스트 오버플로우나 줄바꿈을 다르게 처리한다면, 그 차이는 해당 렌더러 계층 내에서 표준 규격(KS X 6101)에 부합하는 방식으로 안전하게 해결되어야 합니다.

---

## 3. 계층별 모듈 구성 및 역할

| 모듈 경로 | 주요 클래스 | 역할 및 책임 |
| :--- | :--- | :--- |
| `src/canvas/parser/figmaCanvasParser.ts` | `FigmaCanvasParser` | Figma 노드 트리(DOCUMENT, CANVAS, FRAME, TEXT, RECTANGLE 등)를 순회하며 AutoLayout 계산, 절대 좌표 변환, 다중 페이지 분할, 텍스트 런 추출을 거쳐 `CanvasDocument` 생성. |
| `src/canvas/types.ts` | `CanvasDocument`, `CanvasPage`, `CanvasElement`, `CanvasTextRun` | 프로젝트의 핵심 데이터 스키마. 모든 좌표와 크기는 포인트(pt, 1pt = 1/72 inch) 단위로 정규화됨. |
| `src/canvas/renderer/docxCanvasRenderer.ts` | `DocxCanvasRenderer` | `CanvasDocument`를 OpenXML (ECMA-376) 표준 DOCX 패키지 및 VML/DrawingML 마크업으로 변환. |
| `src/canvas/renderer/hwpxCanvasRenderer.ts` | `HwpxCanvasRenderer` | `CanvasDocument`를 대한민국 국가표준 KS X 6101 (OWPML) 표준 HWPX 패키지(ZIP, header.xml, section0.xml 등)로 변환. |

---

## 4. 기하학 파이프라인 (Geometry Pipeline)

1. **Figma 좌표계**:
   - Figma API는 화면 픽셀(px) 기반의 `absoluteBoundingBox` (`x`, `y`, `width`, `height`)를 제공합니다.
   - 96 DPI 기준: `1 px = 0.75 pt`.
2. **Canonical IR 좌표계**:
   - 모든 요소는 페이지 좌상단 `(0, 0)`을 기준으로 상대적 pt 좌표 `bounds: { x, y, width, height }`로 저장됩니다.
   - 표준 A4 Portrait: `width: 595.28 pt`, `height: 841.89 pt`.
3. **DOCX 좌표계 (OpenXML)**:
   - 본문 배치는 Twip (1/20 pt) 및 VML pt 단위를 병행 사용합니다.
   - A4 Portrait: `11906 twips × 16838 twips`.
4. **HWPX 좌표계 (OWPML)**:
   - 기본 단위: HWPUNIT (1/100 pt, 1 pt = 100 HWPU).
   - A4 Portrait: `59528 HWPU × 84189 HWPU`.
   - 모든 요소는 `<hp:pos vertRelTo="PAPER" horzRelTo="PAPER" vertOffset="..." horzOffset="...">`을 통해 용지 기준 절대 위치로 배치됩니다.

---

## 5. 핵심 평가 대상 실문서 (Real-World Testbeds)

- **Stage 6 (`sample-a-proposal-doc.json`)**: 1페이지 제안서 실문서. 타이틀, 메타 정보, 본문 요약 카드.
- **Stage 7 (`Report1-Live-Snapshot.json`)**: 9페이지 실제 고객 종합 보고서. 표지, 개요, KPI 지표 블록, 통계 차트, 도넛 차트, 세부 평가표, 결론 요약 등을 포함하는 대규모 복합 문서 (총 424개 텍스트박스, 788개 도형).

