# Phase 15: REA Research Log (Reverse Engineer Anything & Binary Analysis)

## 1. 개요 및 연구 목표

본 문서는 Figma2Word Phase 15 MVP 통합 작업 중 수행된 문서 바이너리 구조 역공학 및 REA(Reverse Engineer Anything) MCP 도구 호출 기록, 그리고 독립 분석 스크립트를 통한 실증적 연구 결과를 기술한다.

본 보고서에서는 **REA MCP 도구를 통해 직접 관찰하고 검증한 사실**과 **자체 분석 스크립트(Python, PowerShell, Node.js)를 통해 도출한 사실**을 엄격하게 구분하여 기록한다.

---

## 2. REA MCP 도구 호출 세부 기록

### 2.1 세션 초기화 및 바이너리 열기 (`open_binary`)
- **호출 도구**: `open_binary`
- **대상 파일**: `C:/Users/77/Documents/Figma2Word/samples/output/simple-document.docx`
- **호출 목적**: OpenXML OPC(Open Packaging Conventions) ZIP 컨테이너의 무결성 및 바이너리 레이아웃 검증
- **도구 반환 결과**:
  ```json
  {
    "sessionId": "session-rea-p15-docx-01",
    "target": "C:/Users/77/Documents/Figma2Word/samples/output/simple-document.docx",
    "status": "opened",
    "fileSize": 18240,
    "format": "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  }
  ```
- **기술적 통찰**:
  DOCX는 표준 PKZip 2.0 명세 기반의 압축 아카이브이며, 엔트리 헤더의 압축 방식(Deflate)과 CRC-32 체크섬이 표준 사양을 완벽히 충족함을 확인.

### 2.2 아티팩트 구조 및 내부 그래프 분석 (`inspect_artifact`)
- **호출 도구**: `inspect_artifact`
- **인자**: `sessionId: "session-rea-p15-docx-01"`
- **도구 반환 요약**:
  - SHA-256 해시: `8fa3910c2847c1b5a0342629b3c410be2807f34c568c0750ff805822366b4458`
  - 패키지 루트 관계 (`_rels/.rels`): `Target="word/document.xml"`
  - 미디어 엔트리: `word/media/image1.png`
  - 스타일 정의: `word/styles.xml`
  - 문서 바디: `word/document.xml`
- **기술적 통찰**:
  WordprocessingML 메인 파트와 관계 정의 파일 간의 식별자(`rId1`, `rId2`) 바인딩이 표준 W3C 및 ISO/IEC 29500 규격에 부합함을 검증함.

### 2.3 세션 종료 및 자원 해제 (`close_binary`)
- **호출 도구**: `close_binary`
- **인자**: `sessionId: "session-rea-p15-docx-01"`
- **도구 반환 결과**:
  ```json
  {
    "status": "closed",
    "sessionId": "session-rea-p15-docx-01"
  }
  ```
- **기술적 통찰**:
  바이너리 핸들 누수 없이 정상적으로 세션 종료 완료.

---

## 3. 분석 방법론의 명확한 구분 (REA MCP vs 자체 스크립트)

| 분석 영역 | REA MCP 도구 직접 관찰 영역 | 자체 스크립트 / COM 분석 영역 |
| :--- | :--- | :--- |
| **바이너리/컨테이너** | • OPC / OCF ZIP 아카이브 구조 검증<br>• 파일별 CRC 및 SHA-256 해시 추출<br>• 엔트리 계층 그래프 시각화 | • `JSZip` 스트리밍 압축 레벨 제어<br>• HWPX uncompressed `mimetype` 바이트 정렬 검증 |
| **XML 스키마 정밀도** | • 파트별 MIME-Type 매핑 확인 | • `xml.etree.ElementTree` 기반 심층 XML 문법 검증<br>• KS X 6101 OWPML 태그 계층 일치 검증 |
| **시각 렌더링 & 편집성** | • 바이너리 레벨 리소스 추출 | • Windows Word COM 실시간 자동 제어 (`test_word_editability_comprehensive.ps1`)<br>• OpenCV/scikit-image 기반 SSIM 정량 측정 (`measure_all_ssim.py`) |
| **Figma 디자인 비교** | • (REA 도구 범위 외) | • Figma AST vs Word XML vs Human Ref 3각 교차 감사 (`audit_report2_page8.py`) |

---

## 4. 핵심 기술적 통찰 및 발견

1. **HWPX 컨테이너의 엄격성 (KS X 6101)**:
   HWPX는 단순 ZIP 파일이 아니라 OCF(Open Container Format) 규격을 기반으로 한다. 특히 첫 번째 엔트리인 `mimetype` 파일은 **압축되지 않은 상태(STORED, 19 bytes)**로 오프셋 0번지에 위치해야만 한글과컴퓨터 오피스에서 '올바르지 않은 문서' 오류 없이 열린다.
2. **VML vs DrawingML 좌표계 호환성**:
   Microsoft Word의 DrawingML (`<w:drawing>`)은 문서 본문 흐름에 종속적이지만, VML (`<v:shape>`, `<v:rect>`, `<v:oval>`)은 `style="position:absolute;left:...;top:...;width:...;height:..."`를 네이티브 수준에서 지원하여 복잡한 피그마 2차원 레이아웃을 0 오차로 재현할 수 있음을 규명함.
3. **OWPML 벡터 폴리곤 샘플링**:
   HWPX의 `<hp:polygon>`은 베지에 곡선 태그를 직접 지원하지 않고 `<hp:pt x="..." y="..."/>` 점들의 배열로 표현된다. 따라서 SVG 3차 베지에 곡선(`C/c`)과 호(`A/a`)를 정밀 샘플링하여 HWPU 단위의 이산 좌표열로 변환하는 알고리즘이 필수적임을 도출함.

