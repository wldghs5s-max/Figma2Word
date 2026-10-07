# 레이아웃 전략 한계 분석 및 문제 분류 보고서 (LAYOUT_LIMITATIONS)

본 문서는 Phase 2 스트레스 테스트를 통해 규명된 **절대좌표(Non-Auto Layout) 및 Auto Layout 변환 전략의 기술적 한계**와 **P0 ~ P3 문제 분류 체계**를 명시한다.

---

## 1. Y-flow 절대좌표 정렬 전략의 핵심 한계

현재 파서는 Non-Auto Layout 노드들을 다음과 같이 Y 좌표 오름차순으로 정렬한다:

```typescript
visibleNodes.sort((a, b) => (a.absoluteBoundingBox?.y ?? 0) - (b.absoluteBoundingBox?.y ?? 0));
```

이 방식은 위에서 아래로 흐르는 단일 컬럼 문서에서는 매우 안정적이지만, 실제 디자인의 다음 패턴에서 명백한 한계가 드러난다:

### 한계 1: 좌우 병렬 요소의 수직 늘어짐 (Parallel Column Flattening)
- **Figma 의도**: [A](x:50, y:100)와 [B](x:420, y:100)가 좌우 2열로 나란히 배치됨.
- **변환 결과**: Word에서 [A]가 먼저 100% 폭을 차지하고, [B]가 그 아래로 떨어져 1열 수직 나열됨.
- **원인**: X축 좌표의 수평 인접성(Horizontal Closeness)을 고려하지 않고 Y축 단일 정렬만 수행함.

### 한계 2: 배경과 텍스트의 겹침 분리 (Z-Index Overlap Separation)
- **Figma 의도**: 직사각형 배경 [Base](x:50, y:200, w:400, h:120) 위에 텍스트 [Text](x:80, y:230)가 오버레이됨.
- **변환 결과**: Word에서 [Base] 테이블이 먼저 그려지고, 그 밑에 [Text] 문단이 별도로 나타남.
- **원인**: Word Flow 레이아웃은 기본적으로 Z-index 중첩을 지원하지 않음.

### 한계 3: 높이가 다른 병렬 컬럼 (Uneven Height Stacking)
- **Figma 의도**: 좌측에 긴 컬럼(h:160), 우측에 짧은 컬럼(h:50), 짧은 컬럼 아래에 다른 요소(y:420).
- **변환 결과**: Y 순서에 따라 긴 컬럼 → 짧은 컬럼 → 하단 요소 순으로 무조건 단일 열로 나열됨.

---

## 2. Auto Layout 테이블 매핑의 한계

Auto Layout은 Word Table로 매우 성공적으로 매핑되지만, 다음 2가지 과제가 존재한다:

1. **너비 분할 정책 (Sizing Mode)**:
   - 현재는 자식 개수에 따라 `100% / N`으로 균등 분할함.
   - 실제 UI에서 [작은 아이콘(40px)] + [긴 설명 본문(Fill container)] 구조일 때, 아이콘 셀이 불필요하게 50%의 너비를 차지하게 됨.
2. **다단계 중첩 테이블 (Deep Nested Tables)**:
   - 3단계 이상 중첩된 Frame이 각각 테이블로 변환될 경우, Word의 렌더링 성능 저하 및 여백 계산 오차가 누적될 수 있음.

---

## 3. 발견된 문제점 P0 ~ P3 분류 체계

### [P0 Critical] 치명적 결함 (0건)
- *해당 사항 없음*: 실제 Figma AST 입력으로 인한 파서 크래시나 깨진 DOCX 파일 생성 문제는 발견되지 않음.

### [P1 High] 핵심 사용성 및 레이아웃 결함 (3건)
1. **[P1-1] Non-Auto Layout 좌우 병렬 요소 수직 늘어짐**:
   - 영향: Auto Layout을 쓰지 않은 다단 레이아웃이 1열로 세로로 길어짐.
   - 해결 대안: Y 좌표 차이가 임계값(예: 15px 이내) 미만이고 X가 겹치지 않는 형제 노드들을 가로 그룹(1행 다열 테이블)으로 자동 클러스터링하는 휴리스틱 추가.
2. **[P1-2] Z-index 겹침 노드의 블록 분리**:
   - 영향: 배경 사각형 위에 얹은 텍스트가 분리되어 디자인 외형 훼손.
   - 해결 대안: 사각형의 바운딩 박스 안에 완전히 포함된 텍스트 노드를 사각형의 `content` 자식으로 감싸 1x1 Shaded Table 내부에 주입.
3. **[P1-3] Auto Layout Sizing Mode (Fixed vs Fill) 반영**:
   - 영향: 고정 너비 요소와 가변 너비 요소 간의 비율 왜곡.
   - 해결 대안: 자식 노드의 `layoutSizingHorizontal` 및 `width` 비율을 계산하여 테이블 셀의 상대 너비(`%`)로 반영.

### [P2 Medium] 서식 및 에셋 결함 (3건)
1. **[P2-1] 단일 Text 노드 내 다중 스타일 오버라이드 미지원**:
   - `characterStyleOverrides`를 해석하여 단일 문단 안에서 여러 개의 `TextRun`으로 분할 필요.
2. **[P2-2] Figma REST API 원격 이미지 다운로드 부재**:
   - Figma `imageRef`를 실제 이미지 파일로 받아오는 fetcher 파이프라인 필요.
3. **[P2-3] Line 구분선의 고정 100% 길이**:
   - 실제 너비에 맞게 정렬 및 길이 제어 필요.

### [P3 Low] 미세 시각 오차 (2건)
1. **[P3-1] Word Table 모서리 곡률(Corner Radius) 미지원**: Word OpenXML 테이블 스펙 한계로 직각 유지.
2. **[P3-2] 드롭 섀도우(Drop Shadow)의 단색 테두리 근사**: 음영 스타일의 한계로 경계선 강조 유지.
