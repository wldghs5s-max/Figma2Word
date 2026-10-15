# Phase 13B: Canvas 듀얼 엔진 핸드오프 문서 (Handoff Report)

## 1. 개요 및 인계 배경

본 문서는 Phase 13A 코드 리뷰 피드백을 기반으로 호환성, 무손실성, 실제 Office 렌더링 품질을 고도화한 Phase 13B 작업의 성과와 결과물을 후속 개발(Phase 14) 및 외부 리뷰어에게 인계하기 위해 작성되었다.

---

## 2. Phase 13B 핵심 달성 성과

1. **실제 고객사 보고서 3종 라운드트립 100.0% 요소 무손실 달성**:
   - 1차 보고서: 760개 요소 중 760개 보존 (100.0%, 0개 유실)
   - 2차 보고서: 802개 요소 중 802개 보존 (100.0%, 0개 유실)
   - 3차 보고서: 784개 요소 중 784개 보존 (100.0%, 0개 유실)
   - 텍스트 오차 및 좌표 오차(> 0.5pt) 0건 달성.

2. **Microsoft Word COM 실제 렌더링 무결성 입증**:
   - 실제 Windows Word COM을 통한 3종 문서 열기 100% 성공.
   - 문서 손상/복구 경고 0건.
   - 각 보고서별 9p, 11p, 10p 정확한 1:1 페이지 분할 및 Word 네이티브 PDF 변환 완료.

3. **XML 파싱 및 관계 처리의 구조적 취약점 해소**:
   - 속성 순서 의존 정규식을 완전히 걷어내고 범용 XML 속성 파서(`parseXmlAttributes`) 구축.
   - 관계 파일(`document.xml.rels`)의 외부 URL 배제(`TargetMode="External"` 차단) 및 상위 디렉터리 순회(`..`) 보안 방어 적용.

4. **한국어 타이포그래피 및 폰트 매핑 체계 정밀화**:
   - DOCX: `resolveEastAsiaFont` 유틸리티를 통해 `Pretendard`, `맑은 고딕`, `Noto Sans KR` 등 한글 서체가 Word에서 대체 폰트로 강제 치환되지 않도록 동아시아 및 라틴 폰트 정합성 확보.
   - HWPX: KS X 6101 OWPML 표준 규격에 따라 7개 언어군(`<hh:fontface lang="...">`) 전수 등록 및 동적 `fontRef` 참조 연결.

5. **완벽한 하위 호환성 및 무회귀 보장**:
   - 기존 Flow 엔진 및 유틸리티 포함 48개 테스트 스위트, 292개 테스트 케이스 100% 통과.

---

## 3. 해결된 문제와 미해결 과제 비교

| 구분 | Phase 13A 상태 | Phase 13B 해결 내역 | 잔여 과제 (Phase 14) |
| :--- | :--- | :--- | :--- |
| **DOCX 속성 파싱** | 속성 순서 고정 정규식 사용으로 속성 순서 변경 시 파싱 실패 위험 | 순서 무관 `parseXmlAttributes`로 모든 속성 안전 추출 | 정식 SAX/DOM 파서 라이브러리 도입 검토 |
| **라인 요소 보존** | `<v:line>` 자가 닫힘 태그 누락으로 보고서당 6~10개 분할선 유실 | 자가 닫힘 및 쌍 태그 분리 정규식으로 100% 복원 | 화살표/점선 등 선 스타일 고도화 |
| **요소 메타데이터** | Figma 노드 ID 및 이름이 DOCX 변환 시 증발 | VML `alt` 및 `o:title` 속성에 보존하여 역추출 성공 | HWPX `memo` 또는 사용자 정의 속성 매핑 강화 |
| **한글 폰트 매핑** | `맑은 고딕`/`Calibri` 고정으로 Pretendard 등 서체 유실 | `resolveEastAsiaFont` 및 HWPX 7개 언어군 동적 생성 | 시스템 미설치 폰트 웹 폰트 임베딩 방안 |
| **박스 여백 및 행간** | 기본값(10pt) 고정으로 텍스트 수직 밀림 발생 | `innerPaddingPt` (`inset`) 및 `lineHeightPt` (`exact`) 반영 | 텍스트박스 오버플로우 자동 글자 축소 |
| **Hancom COM 무인화** | COM 기동 가능 여부 불명확 | COM 인스턴스 확인 완료 및 보안 모달 제약 사항 규명 | `FilePathCheckDLL` 등록을 통한 CI 무인 자동화 |

---

## 4. Phase 14(완성도 고도화)를 위한 구체적 제안

1. **Figma 벡터 패스(Bezier Curves)의 정밀 VML/HWPX 변환**:
   - 현재 사각형, 둥근 사각형, 라인, 타원은 네이티브 변환되나 복합 SVG 경로는 바운딩 박스 사각형으로 간소화됨.
   - VML `<v:shape path="m... l... e">` 및 HWPX `<hp:lines>`/`<hp:curve>`를 활용한 벡터 패스 엔진 구현 제안.
2. **Hancom Office HWPX 다중 구획(Multi-Section) 템플릿화**:
   - 단일 구획 페이지 분할을 넘어, 표지/목차/간지/본문별 독립 구획 설정을 지원하여 바탕쪽 및 번호 매기기 완벽 지원.
3. **Figma 컴포넌트 자동 인식 및 표/차트 네이티브 변환**:
   - 절대좌표 텍스트 박스 나열형 표를 Word 네이티브 `<w:tbl>` 및 HWPX `<hp:tbl>`로 재합성하는 지능형 그룹화 패스 도입.
4. **웹 UI 파이프라인 연동**:
   - `src/canvas/pipeline/canvasPipeline.ts`를 Express API 엔드포인트에 연결하여 사용자 선택(기존 Flow 모드 vs 신규 Canvas 모드) 지원.

---

## 5. 외부 리뷰어를 위한 안내 (Phase 13A 대비 변경점 요약)

- **핵심 수정 파일**:
  1. `src/canvas/parser/docxCanvasParser.ts`:
     - XML 속성 파서 `parseXmlAttributes()` 도입.
     - VML 도형 자가 닫힘 태그(`/>`) 대응 정규식 적용.
     - 외부 링크 필터링 및 경로 순회 방지.
     - 비지원 요소(`<w:drawing>`, `<w:tbl>`, 본문 텍스트) 진단 경고 시스템 도입.
  2. `src/canvas/renderer/docxCanvasRenderer.ts`:
     - `resolveEastAsiaFont()`를 통한 동아시아 폰트 매핑 및 `w:rFonts` 정밀화.
     - VML `alt`, `o:title`, `inset` 속성 생성.
     - `w:spacing`의 `lineRule="exact"` 행간 반영.
  3. `src/canvas/renderer/hwpxCanvasRenderer.ts`:
     - 7개 OWPML 언어군 폰트페이스 생성 및 `fontRef` 연동.
     - `<hp:drawText>` 메타데이터 부여 및 라인 최소 크기 보정.
  4. `tests/canvas-engine.test.ts`:
     - 속성 순서 무관성, 메타데이터 보존, 라운드트립 100%, 진단 경고 검증 테스트 추가.
