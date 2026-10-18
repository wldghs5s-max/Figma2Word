# Phase 22 Visual Fidelity & Text Alignment Analysis

## 1. 사용자 피드백(Ground Truth) 기반 개선 내역

사용자께서 `diag-rect-only.hwpx`를 한컴 뷰어에서 확인하시고 주신 핵심 피드백:
> - 파란색 둥근 사각형과 초록색 캡슐 도형은 정상적으로 표시됨.
> - 두 도형 모두 내부 텍스트가 표시됨.
> - 텍스트가 좌상단에 치우쳐 있으며 일부가 도형 경계에서 살짝 벗어난 듯한 배치.
> - 특히 큰 도형의 우하단에는 빈 공간이 많이 남음.

### 원인 분석:
1. **내부 여백 미지정 시의 모서리 돌출**:
   - `innerPaddingPt`가 지정되지 않은 경우 `textMargin`이 `0`으로 기록됨.
   - 사각형이 라운드 코너(예: 반경 8pt, 16pt)를 갖는 경우, (0, 0) 좌표는 둥글게 깎여나간 바깥 영역에 해당하므로 텍스트의 첫 글자가 도형 모서리 밖으로 살짝 삐져나온 것처럼 보임.
2. **수직 정렬 기본값의 한계**:
   - `verticalAlign`이 명시되지 않으면 기본값 `TOP`으로 직렬화됨.
   - 높이가 100pt인 카드에 1줄(12pt)의 텍스트만 들어갈 경우, 상단 12pt만 차지하고 나머지 88pt가 하단 빈 공간으로 남아 불균형하게 보임.
   - 캡슐형 뱃지(높이 32pt)의 경우에도 상단에 붙어 뱃지로서의 시각적 완성도가 떨어짐.

---

## 2. Phase 22 시각적 개선 조치

### 2.1 라운드 코너 안전 내부 여백 (Safe Corner Margins)
- **적용 로직**:
  ```typescript
  const cornerRadiusPt = elem.style?.cornerRadius || 0;
  const defaultPadL = cornerRadiusPt > 0 ? Math.round(cornerRadiusPt * 0.4) : 0;
  const defaultPadT = cornerRadiusPt > 0 ? Math.round(cornerRadiusPt * 0.3) : 0;
  ```
- **효과**:
  - `innerPaddingPt`가 없는 카드라도 코너 곡률에 비례하여 4~8pt의 안전 마진이 자동으로 확보되어 텍스트가 라운드 모서리를 침범하지 않음.

### 2.2 캡슐/뱃지 자동 수직 중앙 정렬 (Adaptive Vertical Centering)
- **적용 로직**:
  - 높이가 36pt 이하이거나, 코너 반경이 높이의 1/3 이상인 캡슐형 도형이 단일 문단을 가질 경우, 명시적 정렬이 없더라도 `vertAlign="CENTER"`를 기본 적용.
- **효과**:
  - 뱃지, 상태 칩, 태그 도형의 텍스트가 상하 정중앙에 균형 있게 배치됨.

### 2.3 구분선(Divider) 렌더링 선명도
- 기존 `<hp:line>`에서 발생하던 선 끝단(endCap) 둥글림이나 서브픽셀 번짐 현상이 채움 사각형(`<hp:rect>`)으로 직렬화됨에 따라 1px/2px 단위의 칼각 렌더링으로 개선됨.

---

## 3. 시각적 품질 검증 파일

다음 진단 파일들을 통해 시각적 배치 개선을 확인할 수 있다:
- `iso-rounded-rect-with-text.hwpx`: 8pt 라운드 카드 및 16pt 캡슐 뱃지의 텍스트 여백과 수직 정렬 검증.
- `iso-textbox.hwpx`: 상하 12pt, 좌우 16pt 명시적 여백과 중앙 정렬 검증.
- `iso-horizontal-divider.hwpx`: 선명한 가로 구분선 렌더링 검증.
