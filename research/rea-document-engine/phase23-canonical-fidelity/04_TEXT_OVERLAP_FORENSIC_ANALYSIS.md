# Phase 23: Text Overlap Forensic Analysis & Resolution

## 1. 결함 보고 내용 (User Ground Truth)
Phase 22 배포 후 실제 한컴오피스 2024 뷰어 검증 결과:
- Stage 6 및 Stage 7에서 문서 열람 자체는 성공(오류 팝업 없이 100% 정상 오픈)하였으나,
- **본문 텍스트들이 수평 또는 수직으로 한 줄에 겹치거나 글자가 찌그러져 렌더링되는 결함**이 관찰됨.

---

## 2. 결함 추적 및 원인 규명 (Root Cause Analysis)

### 2.1 가설 검증 결과
1. **페이지 간 좌표 충돌 가설**: 기각.
   - 단일 페이지 내에서 텍스트 Bounding Box 좌표 간 물리적 충돌은 발생하지 않음 (`scripts/analyze_text_overlaps.py` 검사 결과 단일 페이지 내 중복 충돌 0건).
2. **`lineWrap="SQUEEZE"` 압축 현상 가설**: **채택 (주원인 1)**.
   - `hwpxCanvasRenderer.ts`는 모든 텍스트의 `<hp:subList>`에 `lineWrap="SQUEEZE"`를 방출하고 있었음.
   - OWPML 표준 규격에서 `SQUEEZE`는 텍스트 길이가 `textWidth`를 초과할 때 개행(줄바꿈)을 수행하지 않고 글자 간격(자간)을 강제로 줄여 한 행에 압축 배치하는 기능임.
   - Figma 폰트 렌더링 너비와 한컴 폰트 렌더링 너비의 미세한 오차로 인해, 텍스트가 박스 경계에 닿는 순간 글자들이 수평으로 겹치며 찌그러지는 현상 발생.
3. **투명 텍스트 박스 잔상 가설**: **채택 (주원인 2)**.
   - 투명 텍스트 박스에 `<hc:winBrush faceColor="none" hatchColor="#999999" alpha="0"/>`가 방출되어, 한컴 뷰어가 회색 경계선을 그려 텍스트 주변에 불필요한 사각 박스가 나타남.
4. **수직 정렬 시 상단 여백 가산 가설**: **채택 (주원인 3)**.
   - `vertAlign="CENTER"` 적용 시 한글 폰트 어센더 특성과 더불어 `defaultPadT = cornerRadius * 0.3`이 여백으로 가산되어 글자가 사각형 아래로 밀려나는 현상 발생.

---

## 3. 해결 조치 (Remediation Actions)

1. **`lineWrap="BREAK"` 전면 적용**:
   - `<hp:subList>`의 `lineWrap`을 `BREAK`로 지정하여, 글자 압축 대신 정상적인 단어 단위 개행이 이루어지도록 교정.
2. **빈 브러시 태그 `<hc:fillBrush/>` 정류화**:
   - 투명 텍스트 박스 및 배경이 없는 요소의 `fillBrush`를 self-closing 빈 태그로 변경하여 한컴 뷰어의 외곽선 잔상 제거.
3. **수직 정렬 시 여백 중복 가산 방지**:
   - `vertAlignAttr === "CENTER"`인 경우 `defaultPadT`를 0으로 처리하여 기하학적 수직 중앙 일치 보장.
