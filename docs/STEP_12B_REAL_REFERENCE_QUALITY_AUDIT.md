# Figma2Word — Step 12B: 실제 완성 문서 기반 정밀 품질 감사 및 우선 결함 개선 보고서

## 1. 개요 및 작업 배경

본 문서는 Figma2Word 파이프라인을 실제 완성본 업무용 문서(`완성본-20261012/`) 및 실제 A4 디자인 스냅샷과 정밀 대조 감사하고, 발견된 핵심 충실도 결함을 일반화된 규칙으로 개선한 결과를 기록합니다.

- **작업 브랜치**: `master`
- **기준 체크포인트**: `b5d3463` (`feat: add document quality audit infrastructure`)
- **보안 원칙 준수**: 실무 회사 자료(`완성본-20261012/`), 스냅샷, 실무 이미지 등은 `.gitignore`를 통해 Git 추적 대상에서 완전히 격리됨.

---

## 2. 제공된 기준 자료 전수 조사 (읽기 전용 분석)

### 2.1 디렉터리 실사 (`완성본-20261012/`)
- `report-1차-진단-편집가능-Word보정-v3.docx` (9.97 MB) & `report-1차-진단-편집가능-최종보정.hwpx` (10.30 MB)
- `report-2차-경과-편집가능-Word보정-v3.docx` (12.02 MB) & `report-2차-경과-편집가능-최종보정.hwpx` (12.61 MB)
- `report-3차-성과검증-편집가능-Word보정-v3.docx` (8.36 MB) & `report-3차-성과검증-편집가능-최종보정.hwpx` (8.58 MB)
- `글꼴/`: InstrumentSans, Inter, JetBrainsMono, Manrope, NotoSansKR 등 22개 TTF 폰트

### 2.2 기준 DOCX 구조 모델 (`report-1차-진단-편집가능-Word보정-v3.docx`)
- **생성기 및 메타데이터**: `python-docx` 기반 (`dc:creator: python-docx`, 제목: "펜테크 1차 보고서 편집 가능 정밀 수정본")
- **페이지 구성**: Microsoft Word 16.0 COM 렌더링 결과 **총 9페이지 (A4 Portrait, 210 × 297 mm)**
- **페이지 분할 방식**: 8개의 `<w:pageBreakBefore/>` 속성을 통해 9개 페이지를 결정론적으로 구분
- **레이아웃 구현 방식**:
  - OpenXML 네이티브 표(`w:tbl`): **0개**
  - 부동 VML 도형(`w:pict` / `v:rect` / `v:roundrect`): **861개**
  - VML 텍스트 박스(`w:txbxContent` / `v:textbox`): **424개** (총 4,833자)
  - 모든 요소가 절대좌표 부동 박스(`mso-position-vertical-relative:page`)로 배치되어 있음

### 2.3 HWPX 읽기 전용 구조 검증 (`report-1차-진단-편집가능-최종보정.hwpx`)
- ZIP 압축 해제 후 `Contents/section0.xml` 파싱 완료
- 본문 텍스트: `hp:t` 2,091개 ("드론 AI 외벽 진단 1차 진단 2026 정밀 진단 종합보고 해운대동신아파트...")
- 표 개수: `hp:tbl` **0개** (DOCX와 완벽히 동일)
- 그림 요소: `hp:pic` 22개
- **결론**: HWPX와 DOCX는 동일한 원본 레이아웃으로부터 1:1로 생성된 완성본 쌍임을 확인 (HWPX 렌더러 개발은 지침에 따라 일체 진행하지 않음).

---

## 3. Figma2Word 아키텍처와 기준 문서의 근본적 차이

| 비교 항목 | 기준 완성본 (`python-docx`) | Figma2Word 생성 문서 |
|---|---|---|
| **문서 패러다임** | 절대좌표 부동 도형 기반 고정 캔버스 | **흐름형(Flow-based) 표준 OpenXML 네이티브 문서** |
| **표(Table) 지원** | 0개 (셀마다 개별 floating textbox) | **네이티브 다행·다열 `w:tbl` (헤더, 열너비, 테두리, 셀패딩 완벽 지원)** |
| **텍스트 편집성** | 424개 박스 개별 클릭 필요 (텍스트 연속 선택/흐름 불가) | **표준 단락(`w:p`) 기반의 연속 선택, 복사, 리플로우 가능** |
| **복합 기하/차트** | 개별 VML 선/사각형 분할 | **Geometry Cluster 자동 인식 및 고해상도 PNG 래스터 합성 보존** |
| **접근성/표준 준수** | 비표준 레거시 VML 사용 | **최신 Office OpenXML 표준 (Word, LibreOffice, 한컴 호환)** |

---

## 4. 식별된 핵심 충실도 결함 및 일반화된 코드 개선

기준 문서와 실제 A4 다면 비즈니스 보고서 스냅샷(`debug/customer/testnewpage.json`, 5개 프레임)을 Word COM으로 실물 렌더링 대조한 결과, 2가지 중대한 품질 결함을 도출하고 최소 침습 원칙으로 수정했습니다.

### 결함 1: 단일 텍스트 노드 개행 문자(`\n`) 증발 및 장문 본문의 제목 오분류

#### 1) 원인 분석
- `docxRenderer.ts`의 `renderTextRun`에서 Figma 텍스트에 포함된 `\n` 개행 문자를 그대로 `new TextRun({ text })`로 전달함. OpenXML 사양상 `<w:t>` 태그 내부의 `\n`은 단순 공백으로 무시되므로 Word 렌더링 시 모든 줄바꿈이 한 줄로 뭉개지는 현상 발생.
- `figmaParser.ts`의 `isHeadingText`에서 레이어 이름에 "Title"이나 "Heading"이 포함되어 있는지 검사할 때, 디자이너가 긴 텍스트의 첫머리에 "Document Title:" 등을 기입하면 Figma가 레이어 이름을 해당 텍스트로 자동 지정함. Figma는 레이어 이름의 개행을 공백으로 치환하므로 기존의 `nameMirrorsText`가 일치 판정을 내리지 못하고, 1,798자에 달하는 10페이지 분량의 긴 본문 전체가 단 하나의 `Heading 3`으로 오분류되는 심각한 계층 왜곡이 발생함.

#### 2) 일반화된 규칙 개선
- **`src/renderer/docxRenderer.ts`**:
  `renderTextRun`이 `TextRun[]`을 반환하도록 개선하고, 텍스트에 `\n`이 포함된 경우 각 줄을 분할하여 `break: 1` (`<w:br/>`) 태그를 명시적으로 삽입. 빈 줄(`\n\n`) 역시 `<w:br/>`로 보존.
- **`src/parser/figmaParser.ts`**:
  `isHeadingText`에 일반화된 본문 가드 추가:
  - 텍스트 길이가 150자를 초과하거나 줄바꿈 개행이 2회 이상 포함된 경우 제목이 아닌 일반 본문(`paragraph`)으로 처리.
  - `nameMirrorsText` 검사 시 공백 및 개행을 정규화(`\s+` → ` `)하여 자동 명명된 레이어가 제목으로 오탐되는 현상을 완벽 차단.

---

### 결함 2: 네이티브 테이블 기본 셀 여백(`<w:tblCellMar>`) 누락

#### 1) 원인 분석
- `docxRenderer.ts`의 `renderTable`에서 `new Table(...)` 생성 시 `margins` 옵션을 지정하지 않아 OpenXML `<w:tblCellMar>` 속성이 생성되지 않음.
- 개별 셀에 명시적 패딩이 지정되지 않은 데이터 표의 경우, Word가 기본 0pt 상하 마진을 적용하여 텍스트가 표 테두리 선에 완전히 밀착되는 시각적 답답함 발생.

#### 2) 일반화된 규칙 개선
- **`src/renderer/docxRenderer.ts`**:
  `renderTable`의 `new Table(...)`에 전문 문서 표준 여백(`margins: { top: ptToDxa(5), bottom: ptToDxa(5), left: ptToDxa(8), right: ptToDxa(8) }`, 약 상하 100 dxa / 좌우 160 dxa)을 기본 탑재.
  이를 통해 모든 네이티브 데이터 표가 적절한 가독성 여백을 유지하며, 개별 셀에 커스텀 패딩이 있을 경우 정상적으로 오버라이드되도록 보장.

---

## 5. 검증 및 테스트 결과

### 5.1 단위 및 회귀 테스트 전수 통과
- **신규 테스트 스위트 추가**: [`tests/step-12b-fidelity-improvements.test.ts`](file:///c:/Users/77/Documents/Figma2Word/tests/step-12b-fidelity-improvements.test.ts) (4개 테스트)
  - `Requirement 1`: 멀티라인 텍스트 런의 `<w:br/>` 줄바꿈 보존 검증 (PASS)
  - `Requirement 2`: 150자 초과 다중행 텍스트의 제목 오탐 방지 가드 검증 (PASS)
  - `Requirement 3`: `TableElement`의 `<w:tblCellMar>` 기본 셀 여백 생성 검증 (PASS)
  - `Requirement 4`: 실제 `testnewpage.json` A4-1 프레임 변환 시 개행 보존 E2E 검증 (PASS)
- **전체 테스트 결과**: **46개 파일, 275개 테스트 전수 통과 (100% PASS, 무회귀 확인)**

```bash
Test Files  46 passed (46)
     Tests  275 passed (275)
  Duration  83.53s
```

### 5.2 빌드 무결성 확인
- `npm run build` (`tsc`): 오류 없음 (PASS)
- `npm run build:web` (`vite build`): 오류 없음 (PASS)

---

## 6. 결론

Step 12B 작업을 통해 제공된 실제 완성본 문서(`완성본-20261012/`)의 내부 원리를 역공학하여 파악하고, Figma2Word 파이프라인의 핵심 결함 2가지를 일반화된 규칙으로 완벽히 개선했습니다. 특정 노드 ID나 텍스트를 하드코딩하지 않고 본문 개행 보존과 표 여백 체계를 고도화하여, A4 보고서 및 제안서 문서 변환 충실도를 대폭 향상시켰습니다.
