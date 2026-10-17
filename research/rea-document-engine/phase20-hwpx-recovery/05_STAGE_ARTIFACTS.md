# Phase 20 Stage Artifacts Catalog

Phase 20 임무의 일환으로 `debug/hwpx-recovery/` 디렉터리에 생성된 7단계 HWPX 검증 산출물의 상세 명세이다.
모든 산출물은 `scripts/generate_stage_artifacts.ts`를 통해 자율 생성되었으며, `scripts/verify_hwpx_artifacts.ts`를 통해 OWPML 스키마 적격성이 전수 확인되었다.

---

## 1. 단계별 산출물 요약표

| 단계 | 산출물 파일명 | 용량 (Bytes) | 페이지 수 | 주요 검증 영역 |
|---|---|---|---|---|
| **Stage 1** | `stage1-korean-text.hwpx` | 5,395 | 1 | 기본 한글 텍스트, `<hp:secPr>`의 `<hp:run>` 내 배치, 단일 문단 |
| **Stage 2** | `stage2-typography.hwpx` | 5,494 | 1 | 다중 글꼴(맑은 고딕, Pretendard), 굵게, 기울임, 밑줄, 취소선, 자간, 색상 |
| **Stage 3** | `stage3-rect-line.hwpx` | 5,593 | 1 | 사각형 카드, 테두리, 둥근 모서리(0~50 캡핑), 직선(`isReverseHV`, `hc:pt0..1`) |
| **Stage 4** | `stage4-textbox-oval-vector.hwpx` | 5,711 | 1 | 패딩 텍스트박스, 타원 전용 기하(`hc:center/ax1/ax2`), 벡터 다각형 및 열린 선 |
| **Stage 5** | `stage5-images.hwpx` | 5,798 | 1 | PNG/JPEG 임베딩, FIT 모드, COVER 모드, 커스텀 크롭, `hp:imgRect` 중첩 구조 |
| **Stage 6** | `stage6-representative-report.hwpx` | 6,703 | 1 | 합성 제안서 문서(`sample-a-proposal-doc.json`) 기반 통합 렌더링 |
| **Stage 7** | `stage7-full-report.hwpx` | 14,216,290 | 9 | 실제 고객 진단 보고서(`Report1-Live-Snapshot.json`) 9페이지 대규모 통합 렌더링 |

---

## 2. 산출물별 세부 검증 내용

### Stage 1: `stage1-korean-text.hwpx`
- **목적**: HWPX 패키지 최소 골격 및 한글 텍스트 런 무결성 검증.
- **주요 XML 구조**:
  - `mimetype`: uncompressed `application/hwp+zip` (19 bytes).
  - `Contents/section0.xml`: `<hp:secPr>`가 첫 `<hp:p>`의 `<hp:run charPrIDRef="0">` 내부에 격리되어 렌더링됨.
  - `Contents/header.xml`: 대문자 7대 언어(`lang="HANGUL"`) 선언 및 `hh:charPr` 매핑.

### Stage 2: `stage2-typography.hwpx`
- **목적**: 동적 글꼴 레지스트리 및 문자 속성(`charProperties`) 검증.
- **주요 XML 구조**:
  - `bold="1"`, `italic="1"`, `<hh:underline>`, `<hh:strikeout>` 속성 방출 확인.
  - `hh:spacing`을 통한 자간(`letterSpacingPt`) % 환산 반영 확인.
  - 맑은 고딕 및 Pretendard가 `header.xml`에 고유 ID로 등록되어 상호 참조됨.

### Stage 3: `stage3-rect-line.hwpx`
- **목적**: 기본 도형 및 선 객체 직렬화 검증.
- **주요 XML 구조**:
  - 사각형: `ratio="16"` (모서리 둥글기 50 이하 캡핑), `<hc:pt0>`~`<hc:pt3>` 좌표 방출.
  - 선: `<hp:line ... isReverseHV="0">` 및 `<hc:pt0>`, `<hc:pt1>` 코어 좌표 방출.
  - 모든 도형에 `<hp:shadow type="NONE">`, `<hp:sz>`, `<hp:pos>`, `<hp:outMargin>` 구비.

### Stage 4: `stage4-textbox-oval-vector.hwpx`
- **목적**: 복합 텍스트박스, 타원 전용 지오메트리, 다각형/선 벡터 검증.
- **주요 XML 구조**:
  - 텍스트박스: `<hp:textMargin left="1500" right="1500" top="1000" bottom="1000"/>`가 `<hp:subList>` 직후에 배치.
  - 타원: `<hp:oval>` 내부에 `<hc:center>`, `<hc:ax1>`, `<hc:ax2>`, `<hc:start1..end2>`가 올바른 순서로 방출됨.
  - 벡터: 열린 경로는 복수의 `<hp:line>`으로 분할 방출, 닫힌 경로는 `<hp:polygon>` 및 `<hc:pt>`로 방출.

### Stage 5: `stage5-images.hwpx`
- **목적**: 이미지 리소스 바인딩 및 크롭핑/스케일링 검증.
- **주요 XML 구조**:
  - `BinData/BIN0001.png`, `BinData/BIN0002.png` 정상 패키징.
  - `META-INF/manifest.xml` 및 `Contents/content.hpf`에 이미지 엔트리 완비.
  - `<hp:imgRect>` 내부에 `<hc:pt0>`~`<hc:pt3>` 자식 좌표 포함.
  - `<hc:img binaryItemIDRef="BIN0001" bright="0" contrast="0" effect="REAL_PIC" alpha="0"/>` 표준 속성 단일 사용 (`binRef` 삭제).

### Stage 6: `stage6-representative-report.hwpx`
- **목적**: 제안서 양식의 실제 피그마 컴포넌트 복합 배치 검증.
- **주요 특징**: 헤더 밴드, 다단 정보 카드, 본문 텍스트가 1페이지 캔버스 내에 복합 배치됨.

### Stage 7: `stage7-full-report.hwpx`
- **목적**: 9페이지에 달하는 고객 진단 보고서 실데이터의 엔드투엔드 파싱 및 HWPX 직렬화 검증.
- **주요 특징**:
  - 용량 14.2MB (고해상도 진단 이미지 20여 종 포함).
  - 9개 페이지 간 자동 페이지 구분(`pageBreak="1"`) 및 독립 배경 사각형 직렬화.
  - 차트, 진단 도넛 링, 테이블 카드, 상태 뱃지 등 수백 개의 도형 객체에 대해 순수 정수 ID(`1, 2, 3, ...`) 발급 및 무결성 유지.

