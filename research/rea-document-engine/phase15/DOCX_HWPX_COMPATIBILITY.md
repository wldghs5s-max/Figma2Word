# Phase 15: DOCX & HWPX Deep Compatibility & Verification Report (문제 C, D, E 해결)

## 1. 개요

본 보고서는 Figma2Word Canvas 듀얼 엔진의 문서 호환성 및 무결성 보장을 위해 수행된 **HWPX 규격 심층 검증(문제 C)**, **Word COM 실시간 편집성 검증(문제 D)**, 그리고 **보고서 2 페이지 8의 3각 교차 감사 결과(문제 E)**를 종합 기술한다.

---

## 2. Technical Problem C: HWPX KS X 6101 딥 검증 결과

한컴오피스 한글의 차세대 표준 포맷인 HWPX는 개방형 컨테이너(OCF) 규격을 준수해야 하며, 미세한 XML 문법 위반이나 ZIP 인덱스 불일치 시 문서가 열리지 않는다.
이를 전수 검증하기 위해 자체 검증 스크립트(`verify_hwpx_comprehensive.py`)를 개발하여 전체 패키지(기존 8개 + 합성 7개 = 총 15개 아티팩트)를 감사하였다.

### 2.1 8대 핵심 무결성 검증 기준 및 결과
1. **mimetype 엔트리 규격**:
   - 위치: ZIP 아카이브의 반드시 **첫 번째 엔트리(Offset 0)**
   - 압축 방식: **STORED (압축률 0%)**
   - 크기: 정확히 19 bytes (`application/hwp+zip`)
   - **결과**: 15개 패키지 전원 100% 규격 일치.
2. **OCF 필수 파일 완전성**:
   - `version.xml`, `settings.xml`, `META-INF/container.xml`, `META-INF/manifest.xml`, `Contents/content.hpf`, `Contents/section0.xml`, `Contents/header.xml`
   - **결과**: 결손 0건, 100% 포함.
3. **XML 파싱 문법 무결성**:
   - Python `xml.etree.ElementTree`를 통한 파싱 수행 결과 0건의 구문 오류.
4. **BinData 미디어 리소스 정합성**:
   - `BinData/BIN0001.png` 등 모든 이미지 리소스가 `manifest.xml` 및 `content.hpf`의 manifest 항목과 1:1 일치.
5. **동적 글꼴 레지스트리 (7대 OWPML 언어군)**:
   - 한컴 OWPML은 각 서체마다 `hangul`, `latin`, `hanja`, `japanese`, `other`, `symbol`, `user`의 7개 언어 태그를 요구함.
   - `HwpxCanvasRenderer`가 문서 내 사용된 폰트를 동적으로 추출하여 등록 완료.
6. **텍스트박스 편집성 (`editable="1"`)**:
   - `<hp:rect>` 내부의 모든 텍스트 컨테이너에 `editable="1"` 속성을 부여하여 한글에서 즉시 커서 입력 가능.
7. **벡터 다각형 (`<hp:polygon>`) 정점 유효성**:
   - 다각형 정점 수: 최소 3개 ~ 최대 29개 점으로 구성되어 유효한 폐곡선 형성 확인.
8. **도형 고유 ID 중복 방지**:
   - 모든 셰이프 ID에 중복 0건 보장.

---

## 3. Technical Problem D: Word COM 실시간 편집성 검증 결과

정적 XML 검증에 머무르지 않고, 실제 Windows OS에 설치된 Microsoft Word COM 자동화(`test_word_editability_comprehensive.ps1`)를 통해 6대 대표 의미적 텍스트 요소를 대상으로 수정, 저장, 재열기 파이프라인을 검증하였다.

### 3.1 6개 의미적 카테고리 테스트 항목
1. **메인 타이틀 (#29)**: `1. 결함 분석 개요` → `[수정완료] 1. 차세대 AI 결함 분석 종합 개요`
2. **소제목/헤더 (#30)**: `1.1 분석 목적 및 범위` → `[수정완료] 1.1 분석 목적 및 점검 범위`
3. **상태 배지 (#31)**: `1차 (육안)` → `[수정] 3차(완료)`
4. **지표/수치 셀 (#125)**: `12` → `99`
5. **다중행 본문 문단 (#32)**: 복합 한국어 문단 텍스트 수정
6. **혼합 서식 텍스트 (#269)**: 영문/숫자/기호 혼합 텍스트 수정

### 3.2 검증 절차 및 결과
- **절차**:
  1. `$word.Documents.Open()`으로 DOCX 로드.
  2. 6개 대상 텍스트박스의 텍스트 런 내용 프로그래밍 방식 치환.
  3. `$doc.Save()` 호출로 Word 자체 OpenXML 직렬화 엔진으로 디스크 저장.
  4. Word 프로세스 완전 종료(`$word.Quit()`) 및 COM 핸들 해제.
  5. 새로운 Word 프로세스를 생성하여 수정된 파일을 다시 오픈(`Re-open`).
  6. 텍스트 변경 사항 일치 여부 및 문서 페이지 수(9페이지) 변동 여부 확인.
- **결과**:
  - **수정 성공률: 6 / 6 (100% PASSED)**
  - **페이지 수 변동: 9페이지 → 9페이지 (레이아웃 밀림 0%)**
  - **Word 파일 복구 프롬프트 또는 오류 다이얼로그 발생: 0건**

---

## 4. Technical Problem E: 보고서 2 페이지 8 사실 확인 (Ground Truth)

과거 개발 메모에서 제기되었던 *"보고서 2 페이지 8의 이미지가 4개인가 8개인가, Canvas가 이미지를 누락한 것이 아닌가"*라는 의문에 대해, 3대 원본 데이터를 대조하는 독립 감사(`audit_report2_page8.py`)를 수행하였다.

### 4.1 3각 대조 감사 데이터
1. **Figma AST 원본**: `research/rea-document-engine/reference-corpus/fixtures/Report2-Live-Snapshot.json`
2. **Canvas 생성 DOCX**: `research/rea-document-engine/phase13c/renders/canvas_report2/`
3. **디자이너 수작업 완성본**: `research/rea-document-engine/reference-corpus/docx/완성본-20261012/`

### 4.2 규명된 결정적 진실 (Ground Truth)
1. **이미지 개수 오해의 원인**:
   - 보고서 2의 7페이지(Frame 6: `P6a 결함Top5(1)`)에는 결함 사진이 **4개** 배치되어 있음.
   - 8페이지(Frame 7: `P6b 결함Top5(2)`)에는 결함 사진이 **6개** + 상단 로고 **1개** = **총 7개의 이미지가 배치되어 있음.**
   - 즉, "4 vs 8"이라는 혼란은 7페이지와 8페이지의 구성을 오인하여 발생한 단순 착오였음.
2. **인간 디자이너의 임의 수정과 시각적 차이 (45.62% Pixel Mismatch 원인)**:
   - **Figma 원본**: 6장의 결함 사진이 각각 가로 341px, 세로 255.75px (4:3 비율, 191.8pt)로 배치되어 있으며, 각 사진 상단에 `1차 (육안)`, `2차 (육안)` 배지 텍스트박스가 존재함.
   - **Canvas 엔진**: Figma 원본 설계에 100% 충실하게 191.8pt 높이와 6개의 배지를 온전히 렌더링함.
   - **인간 디자이너 완성본**: 디자이너가 Word 수작업 편집 과정에서 1페이지 안에 여백을 더 확보하기 위해 **6장 사진의 세로 높이를 191.8pt에서 150.0pt로 일괄 41.8pt 압축(Squish)**시켰으며, **6개의 배지 텍스트박스를 수작업으로 삭제(Omit)**하였음.
   - 행당 41.8pt씩 총 125pt의 수직 위치 밀림이 발생하여 이미지 픽셀 차이가 발생한 것이었음.

### 4.3 결론
Canvas 엔진은 피그마 원본 디자인을 단 하나의 요소도 누락하지 않고 **100% 완전 무결하게 보존**하고 있음이 최종 실증되었다. 인간 디자이너의 임의적인 수작업 축소 및 삭제를 오류로 오인해서는 안 되며, Figma 디자인의 충실도 측면에서 Canvas 엔진의 구현이 올바른 기준(Ground Truth)이다.

