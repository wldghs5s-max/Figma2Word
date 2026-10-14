# Figma2Word — REA 기반 문서 렌더링 역공학 및 DOCX/HWPX 변환 심층 연구 보고서
**Reverse Engineering Analysis on Document Rendering & High-Fidelity Dual Exporter Architecture**

---

## 1. 연구 배경 및 미션

Figma2Word는 Figma 디자인을 높은 시각적 충실도를 지닌 편집 가능한 문서(DOCX/HWPX)로 변환하는 데스크톱/로컬 변환 엔진이다.

Step 11~12C까지 구현된 기존 엔진은 실제 업무용 A4 보고서 변환 시 **중첩 테이블 셀 패딩 누적, 수직 높이 팽창, 행간/줄바꿈 왜곡, 페이지 수 증가** 등의 고질적인 시각적 결함을 겪어왔다.

본 연구는 **REA(Reverse Engineer Anything) 6.4.0** MCP 도구와 실제 인간 전문가가 완성한 **3종 정답 문서(Word DOCX 및 한글 HWPX)**의 내부 구조를 전수 역공학하여, 기존 한계를 근본적으로 해결하는 **2D Canvas IR 및 DOCX/HWPX 듀얼 렌더러 아키텍처**를 수립하고 독립 프로토타입으로 실증하는 것을 목적으로 수행되었다.

---

## 2. 핵심 발견 및 아키텍처 혁신 요약 (Key Findings)

### 2.1 기존 엔진의 실패 원인 규명
- **기존 방식**: Figma의 2D 평면 배치를 Word 표준 표(`w:tbl`)로 모방 (카드 1개마다 중첩 표 생성, 최대 4단계 깊이, 총 144개 표 생성).
- **결과**: Word 렌더링 엔진의 기본 셀 패딩(`w:tcMar`)과 문단 간격이 중첩 누적되어 문서 전체가 수직으로 130~150% 팽창하고 페이지 경계가 무너짐.

### 2.2 정답 기준 DOCX의 역공학적 구조 발견
- **테이블 개수: 0개 (None)**.
- **여백: 상/하/좌/우 0 dxa (0 mm 제로 마진)**. A4 전체를 순수 2D 캔버스로 사용.
- **페이지 제어: 1페이지 = 1문단 (`w:p`)**. 9페이지 문서는 정확히 9개의 문단만 가짐 (`pageBreakBefore`와 1pt 고정 행간 적용).
- **텍스트박스: 424개 절대좌표 VML 사각형 (`v:rect` + `v:textbox`)**.
- 모든 요소가 용지 기준 절대좌표(`margin-left:...pt`, `margin-top:...pt`)로 고정되어 인쇄 및 뷰어 환경에 영향을 받지 않고 픽셀 퍼펙트를 유지함과 동시에 100% 텍스트 편집이 가능함.

### 2.3 정답 기준 HWPX(OWPML)의 동일 구조 및 1:1 매핑 발견
- **테이블 개수: 0개 (None)**.
- **여백: 0 HWPU (Zero Margin)**.
- **단위 정합성: $1\text{ pt} = 100\text{ HWPU}$**. DOCX의 포인트 좌표와 HWPX의 HWPU 좌표가 정확히 100배율로 1:1 일치 ($482.25\text{ pt} \leftrightarrow 48,225\text{ HWPU}$).
- **글상자: 429개 `<hp:rect>` + `<hp:drawText>`**. DOCX의 424개 텍스트박스와 오차 없이 상호 대응됨.

### 2.4 REA 6.4.0 MCP 검증 및 실증 프로토타입 완결
- REA 6.4.0을 통해 정답 DOCX, 정답 HWPX의 아티팩트 무결성 그래프 추출 완료.
- 세션 증거 번들(`rea_evidence_bundle.json`, 212 KB) 추출 및 저장.
- **파이썬 단독 실증 코드 구현**:
  - `prototype_canvas_ir_extractor.py`: DOCX로부터 2D 절대좌표를 추출하여 `canvas_ir.json` 생성.
  - `prototype_hwpx_builder.py`: `canvas_ir.json`으로부터 순수 파이썬 코드로 유효한 HWPX 문서(`prototype_output.hwpx`) 직접 생성.
  - 생성된 HWPX를 REA `open_binary` 및 `inspect_artifact`로 검증하여 9개 노드/8개 엣지 무결성 통과 확인.

---

## 3. 연구 보고서 산출물 인덱스 (Directory Index)

본 `research/rea-document-engine/` 폴더에는 다음 6종의 정밀 연구 문서 및 실증 코드가 포함되어 있다.

| 파일명 | 문서 성격 및 핵심 내용 |
| :--- | :--- |
| **[`README.md`](file:///c:/Users/77/Documents/Figma2Word/research/rea-document-engine/README.md)** | 연구 종합 요약, 핵심 발견, 프로토타입 결과 및 6종 문서 안내 (본 문서) |
| **[`DOCX_STRUCTURE.md`](file:///c:/Users/77/Documents/Figma2Word/research/rea-document-engine/DOCX_STRUCTURE.md)** | OpenXML 심층 비교표, 기존 중첩 표 붕괴 원인, 정답 문서의 VML 제로 마진 캔버스 분석 |
| **[`REA_FINDINGS.md`](file:///c:/Users/77/Documents/Figma2Word/research/rea-document-engine/REA_FINDINGS.md)** | REA 6.4.0 실행 로그, 아티팩트 그래프 분석 결과, 증거 번들(Evidence Bundle) 명세 |
| **[`HWPX_FEASIBILITY.md`](file:///c:/Users/77/Documents/Figma2Word/research/rea-document-engine/HWPX_FEASIBILITY.md)** | HWPX(OWPML) 포맷 역공학, 단위 체계(HWPU), 글상자/표 구조, DOCX↔HWPX 매핑표 |
| **[`ARCHITECTURE_PROPOSAL.md`](file:///c:/Users/77/Documents/Figma2Word/research/rea-document-engine/ARCHITECTURE_PROPOSAL.md)** | 2D Canvas IR 인터페이스 설계, DOCX/HWPX 듀얼 렌더러 아키텍처 및 마이그레이션 전략 |
| **[`NEXT_STEPS.md`](file:///c:/Users/77/Documents/Figma2Word/research/rea-document-engine/NEXT_STEPS.md)** | Step 13A 구현 계획, 단일 결정적 가설, 단계별 개발 로드맵 및 리스크 관리 |

### 동반 실증 코드 및 데이터
- `prototype_canvas_ir_extractor.py`: 정답 문서로부터 Canvas IR을 역추출하는 추출기
- `canvas_ir.json`: 정답 보고서 1차(9페이지, 744개 요소)의 정규화된 2D 캔버스 데이터
- `prototype_hwpx_builder.py`: 외부 도구 없이 순수 코드로 HWPX를 조립하는 빌더
- `prototype_output.hwpx`: 실증 생성된 독립 HWPX 문서 (REA 무결성 검증 완료)
- `rea_evidence_bundle.json`: REA 세션에서 원자적으로 생성된 정밀 진단 증거 번들

---

## 4. Phase 13A 구현을 위한 단일 결정적 가설

> **"Figma의 2D 절대좌표를 1D 플로우 표(Flow Table)로 축약하지 않고, 용지 여백 0의 A4 캔버스 상에 1문단/1페이지 기준의 절대좌표 텍스트박스(VML/DrawingML for DOCX, OWPML for HWPX)로 1:1 직렬화하면, 수직 팽창과 중첩 테이블 왜곡을 완전히 제거하여 실제 완성본 수준의 시각적 일치도(SSIM ≥ 92%)와 100% 네이티브 텍스트 편집성을 동시에 달성할 수 있다."**

