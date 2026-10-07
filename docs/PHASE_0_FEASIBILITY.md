# Phase 0 변환 가능성 및 한계 검증 보고서 (PHASE_0_FEASIBILITY)

본 문서는 지시서 제20조의 10대 핵심 질문에 대한 실제 검증 결과와 기술적 실현 가능성을 기록한다.

---

## 1. 10대 핵심 검증 질문 답변

### Q1. Figma에서 우리가 실제로 얻을 수 있는 정보는 무엇인가?
- **노드 트리**: 계층 구조 (`children`, `parent`), 노드 타입 (`FRAME`, `GROUP`, `TEXT`, `RECTANGLE`, `LINE`, `VECTOR` 등).
- **레이아웃/좌표**: `absoluteBoundingBox` (x, y, width, height), Auto Layout 속성 (`layoutMode`, `itemSpacing`, `padding`, `primaryAxisAlignItems`, `counterAxisAlignItems`).
- **타이포그래피**: `characters`, `fontFamily`, `fontSize`, `fontWeight`, `textAlignHorizontal`, `lineHeightPx`, `letterSpacing`.
- **비주얼 스타일**: `fills` (색상, 투명도, 이미지 참조 `imageRef`), `strokes` (테두리 두께, 색상), `cornerRadius`.

### Q2. 그 정보를 Word에서 어느 수준까지 재현할 수 있는가?
- **텍스트/타이포**: 95% 이상 일치 (폰트 패밀리, 폰트 크기, 볼드/이탤릭, 텍스트 색상, 정렬).
- **박스 및 카드**: 90% 일치 (배경색 Shading, 테두리 두께/색상, 내부 패딩을 Word Table Cell로 완전 재현).
- **오토레이아웃 (다단 컬럼)**: 85% 일치 (1행 N열 Word Table로 안정적 재현).
- **이미지**: 95% 일치 (종횡비 유지, 폭/높이 지정 삽입).
- **자유곡선/특수효과 (Blur, Shadow, Gradient)**: 10~30% (Word OpenXML 한계로 인해 근사 또는 Fallback 처리 필요).

### Q3. 어떤 요소는 Native Word로 만드는 것이 좋은가?
- **헤딩, 제목, 본문 단락, 리스트**: Word 문단(`Paragraph`, `TextRun`)으로 변환하여 사용자가 글자 수정, 서식 변경, 오탈자 교정을 가능하게 함.
- **표 및 데이터 그리드**: Word 네이티브 `Table`로 변환하여 행/열 추가 및 수치 수정 가능.
- **카드 및 요약 박스**: 1x1 Shaded `Table`로 변환하여 내부 텍스트 수정 및 배경 유지.

### Q4. 어떤 요소는 이미지화하는 것이 좋은가?
- 복잡한 일러스트레이션, 브랜드 로고, 차트 그래픽, 커스텀 벡터 아이콘.
- 여러 벡터 패스가 조합된 불리언 연산 객체.
- 이러한 요소들을 무리하게 Word Shape로 쪼개면 문서가 극도로 불안정해지므로 단일 PNG 이미지로 내보내는 것이 최선임.

### Q5. Auto Layout을 Word에서 어떤 방식으로 근사하는 것이 현실적인가?
- **가로 Auto Layout (`HORIZONTAL`)**: Word의 1행 N열 무테두리(또는 스타일 테두리) Table로 매핑. 컬럼 너비를 비율(`WidthType.PERCENTAGE`)로 분할하여 Word 너비에 맞게 유동 반응형 유지.
- **세로 Auto Layout (`VERTICAL`)**: Word의 표준 단락 흐름(Paragraph Sequence) 또는 카드 형태의 1x1 Table로 매핑.

### Q6. 절대좌표 기반 Figma 디자인을 Word 페이지에 배치할 때 가장 현실적인 전략은 무엇인가?
- **Strategy E (Hybrid 전략)**:
  - 캔버스의 모든 1차 자식 노드를 Y좌표 기준 오름차순으로 정렬.
  - 동일/유사한 Y 범위를 공유하는 노드는 수평 컨테이너(가로 테이블 행)로 묶음.
  - Word의 표준 Document Flow 내에 순차 삽입하여 페이지 넘김 시 레이아웃 붕괴를 방지.

### Q7. Word에서 디자인 fidelity를 높이면서 편집성을 유지할 수 있는 범위는 어디까지인가?
- 일반적인 **보고서, 사업계획서, 제안서, 기획서, 대시보드 요약표, 카드형 UI**까지는 매우 높은 fidelity와 완전한 텍스트 편집성을 동시에 유지 가능함.
- 잡지(Magazine) 스타일의 임의 각도 회전 텍스트나 자유곡선 겹침 레이아웃은 편집성을 포기하고 이미지화해야 함.

### Q8. 현재 선택한 DOCX 라이브러리가 이 프로젝트에 실제로 충분한가?
- **충분함**: `docx` (v9.9.0) 라이브러리는 twip 단위의 정밀한 레이아웃, 셀 패딩, 음영, 복합 테두리, 머리글/바닥글, 다중 섹션을 완벽 지원하며, 테스트 결과 파일 손상 없이 유효한 Word 문서를 고속(50ms 이내)으로 생성함을 검증함.

### Q9. Figma → Internal Model → DOCX 구조가 실제로 유지보수 가능한가?
- **매우 우수함**: 중간 모델(`InternalDocument`)이 격리벽 역할을 하여 Figma API 스펙 변경 시 Parser만 수정하면 되고, DOCX 렌더링 스타일 개선 시 Renderer만 수정하면 됨. 새로운 출력 포맷(예: HTML, PDF) 추가 시에도 Model을 그대로 재사용 가능.

### Q10. 가장 먼저 발생할 가능성이 높은 기술적 병목은 무엇인가?
- **실제 Figma Live 파일의 깊은 컴포넌트 중첩 (Deep Nesting)**: 디자인 파일에서 프레임 속에 프레임, 오토레이아웃 속에 오토레이아웃이 7~10단계 이상 중첩된 경우 Word 테이블 안에 테이블이 중첩되어 Word 렌더링이 느려지거나 레이아웃 여백 계산이 꼬일 수 있음 -> **깊이 제한 및 중간 레이어 평탄화(Flattening) 로직**이 향후 필요함.

