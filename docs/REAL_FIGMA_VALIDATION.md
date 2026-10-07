# Phase 2 — 실제 Figma 데이터 구조 검증 및 변환 품질 분석 (REAL_FIGMA_VALIDATION)

본 문서는 Figma2Word 파이프라인이 단순한 장난감 데모를 넘어, **실제 Figma 디자인 계층 구조를 어디까지 수용하고 어디서 정보 손실이 발생하는지** 정밀 검증한 결과를 기록한다.

---

## 1. 실제 Figma REST API / Dev Mode 스펙 조사 결과

실제 Figma REST API (`GET /v1/files/:key`) 및 Dev Mode의 노드 트리는 다음과 같은 특성을 갖는다:

```text
DOCUMENT
 └── CANVAS (페이지 단위)
      └── FRAME / SECTION (최상위 컨테이너)
           ├── FRAME (중첩 오토레이아웃 또는 자유배치)
           ├── TEXT (단일 문자열 + characterStyleOverrides)
           ├── RECTANGLE / VECTOR / LINE
           └── COMPONENT / INSTANCE
```

### 주요 파서 검증 항목 및 실제 처리 결과:
1. **노드 계층성**: `DOCUMENT` → `CANVAS` → `FRAME` 구조를 완전히 인식하여 다중 섹션으로 분할 매핑 성공.
2. **비가시 노드 (`visible: false`)**: 디자이너가 작업 중 숨겨놓은 레이어가 워드 문서에 누출되지 않고 완벽히 필터링됨 (`Hidden text leaked: False` 검증 완료).
3. **타이포그래피 오버라이드**: 실제 피그마는 1개 텍스트 노드 안에서 글자별로 스타일이 다른 `characterStyleOverrides`를 사용하나, 현재 파서는 첫 번째 대표 스타일을 전체 문단에 적용함 (정보 단순화 발생).
4. **이미지 에셋 참조 (`imageRef`)**: 실제 API는 Base64가 아닌 해시 문자열을 반환하므로 별도 이미지 다운로드 파이프라인(`imageMap`) 연동이 필수적임.

---

## 2. 4대 실무 및 스트레스 Fixture 검증 결과

실제 회사 업무 환경에서 흔히 접하는 4가지 유형의 Figma 데이터를 구축하여 검증하였다:

### [Sample A] 실무 제안서 전문 (`sample-a-proposal-doc.json`)
- **구조**: 카테고리 태그, H1 타이틀, 엑센트 구분선, 본문 단락, H3 소제목, 일러스트 이미지, 주의사항 푸터.
- **검증 결과**: 9개 노드 100% `Supported`. Word 네이티브 단락과 헤딩으로 깨끗하게 렌더링됨.

### [Sample B] 중첩 오토레이아웃 대시보드 (`sample-b-nested-autolayout.json`)
- **구조**: 세로 메인 프레임 → 가로 2단 컬럼 그리드 → 각 카드 내부 세로 스택(태그 배지 + 카드 제목 + 설명 텍스트).
- **검증 결과**: 12개 노드 100% `Supported`. Word 1행 2열 테이블 내부에 카드 셀이 완벽히 배치되어 텍스트 편집성 100% 유지.

### [Sample C] 절대좌표 스트레스 테스트 (`sample-c-stress-absolute.json`)
- **구조**: 좌우 병렬 박스 [A](x:50, y:90) / [B](x:380, y:90), 배경 사각형 위 텍스트 겹침(Overlap), 긴 컬럼(h:160)과 짧은 컬럼(h:50).
- **검증 결과**: **구조적 한계 확인**. Y축 정렬로 인해 좌우 병렬 박스가 위아래 수직으로 적층되고, 겹친 텍스트가 배경 박스 바깥으로 분리됨 (`Partially Supported` 5건 기록).

### [Sample D] 결측치 및 엣지 케이스 (`sample-d-edge-cases.json`)
- **구조**: `visible: false` 노드, 빈 텍스트 `""`, 좌표 누락 노드, `VECTOR`, `STAR`, `BOOLEAN_OPERATION`, `SLICE`, 4단계 깊은 중첩.
- **검증 결과**: 파서 및 렌더러 무중단 완료. 숨김 노드 배제 성공, 미지원 노드 2건(`Unsupported`), 벡터/별 2건(`Fallback`) 정상 집계.

---

## 3. 변환 품질 5점 척도 평가 매트릭스

지시서 제12조의 변환 품질 평가 기준(Structure, Visual, Editability, Stability, Predictability)에 따른 종합 평가:

| 검증 샘플 | Structure (구조) | Visual (외형) | Editability (편집성) | Stability (안정성) | Predictability (결정론) | 총평 |
|---|:---:|:---:|:---:|:---:|:---:|---|
| **Sample A (제안서 문서형)** | **5.0** / 5 | **4.5** / 5 | **5.0** / 5 | **5.0** / 5 | **5.0** / 5 | 실무에 즉시 투입 가능한 최상급 변환 품질 |
| **Sample B (중첩 오토레이아웃)** | **5.0** / 5 | **4.5** / 5 | **5.0** / 5 | **5.0** / 5 | **5.0** / 5 | Word 네이티브 테이블을 활용한 안정적 다단 구조 |
| **Sample C (절대좌표 스트레스)** | **2.5** / 5 | **2.0** / 5 | **5.0** / 5 | **5.0** / 5 | **5.0** / 5 | **한계 확인**: 텍스트 편집성은 완벽하나 좌우 배치가 수직으로 분해됨 |
| **Sample D (엣지 케이스/비표준)** | **4.5** / 5 | **3.5** / 5 | **5.0** / 5 | **5.0** / 5 | **5.0** / 5 | 결측치 방어 및 미지원 노드 투명한 리포팅 성공 |

---

## 4. 정보 손실 단계 분석 (Where Information is Lost)

```text
[Figma AST]  ──(1) 파서 단계──>  [IR Document]  ──(2) 렌더러 단계──>  [DOCX File]
```

1. **파서 단계의 정보 손실**:
   - `characterStyleOverrides` 손실: 텍스트 노드 내 부분 볼드/색상이 대표 서식으로 단순화됨.
   - `layoutSizingHorizontal` (`FIXED` vs `FILL`) 손실: 컨테이너 자식 요소들의 고정 너비와 가변 너비 비율이 1/N 균등으로 처리됨.
2. **렌더러 단계의 정보 손실**:
   - `cornerRadius` (모서리 곡률) 손실: Word 오픈XML 테이블 특성상 직각으로 렌더링됨.
   - `boxShadow` (그림자) 손실: Word의 테이블 음영 스펙 한계로 단색 테두리로 대체됨.
   - `Z-index 겹침` 손실: Flow 문서 특성상 겹침 레이어가 순차 블록으로 분리됨.
