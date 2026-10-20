# Phase 27 — 06. 렌더러 범용 결함 추가 수정 및 기하학적 증명 보고서 (Renderer Fixes)

**문서 작성 일시**: 2026-10-20  
**작업자**: Antigravity (Google DeepMind Advanced Agentic Coding)  
**수정 모듈**: `src/canvas/types.ts` (`resolveScale`), `src/canvas/parser/figmaCanvasParser.ts`  
**보증 테스트**: `tests/phase27-renderer-improvements.test.ts` (3/3 통과)

---

## 1. 22인치(1,584 pt) 초과 프레임 균일 등비 축소 (Uniform Downscale)

### 1.1 결함 원인 (Root Cause)
Microsoft Word의 인쇄 레이아웃 엔진은 물리적 페이지 최대 크기가 **22인치(1,584 pt / 31,680 twips)**로 제한되어 있다.
- **기존 레거시 동작**:
  `docxCanvasRenderer.ts`에서 단순히 `Math.min(1584, pageHeightPt)`로 페이지만 강제 절단함.
  세로로 긴 웹 페이지(예: 3,000px = 2,250pt)의 경우, 페이지는 1,584pt로 잘리지만 내부 요소들은 $Y = 1600 \sim 2250$pt에 그대로 배치되어 **하단 콘텐츠가 인쇄 영역 밖으로 통째로 영구 잘려나가는 치명적 결함**이 발생함.

### 1.2 수학적 균일 스케일링 구현 (`src/canvas/types.ts`)
```ts
// src/canvas/types.ts (resolveScale)
const baseScale = 0.75;
const initialWidthPt = frameWidthPx * baseScale;
const initialHeightPt = frameHeightPx * baseScale;

// 1,584pt 초과 시 원본 종횡비를 엄밀히 유지하며 균일 축소 배율 산출
const maxDimPt = Math.max(initialWidthPt, initialHeightPt);
const uniformScaleFactor = maxDimPt > 1584 ? 1584 / maxDimPt : 1.0;

const finalScale = baseScale * uniformScaleFactor;
return {
  scaleX: finalScale,
  scaleY: finalScale,
  targetWidthPt: Number((initialWidthPt * uniformScaleFactor).toFixed(2)),
  targetHeightPt: Number((initialHeightPt * uniformScaleFactor).toFixed(2)),
  policy,
};
```

### 1.3 기하학적 개선 증명
- 가로/세로 중 최대 치수가 1,584pt를 넘으면, 가로와 세로에 동일한 축소 비율($S = 1584 / \text{maxDim}$)이 적용됨.
- `scaleX`와 `scaleY`가 동일하므로, 내부의 모든 자식 요소(카드, 텍스트박스, 이미지)의 상대 좌표와 크기가 페이지와 **1:1로 일관되게 축소되어 단 하나의 요소도 잘려나가지 않고 온전히 보존됨**.
- $3000 \times 4000$ px 프레임의 경우: $H=1584.00$ pt, $W=1188.00$ pt로 종횡비 0.75를 100% 보존하며 안전 수용됨.

---

## 2. A4 종횡비 오탐 범위 정밀화

### 2.1 결함 원인
기존 `isA4Portrait` 판정 조건이 `0.65 <= ratio <= 0.75`로 과도하게 넓게 설정되어 있어, 실제 A4 비율($1 / \sqrt{2} \approx 0.7071$)과 무관한 일반 3:4(0.75) 웹/태블릿 화면이 A4 문서로 오인되어 강제 축소되는 왜곡이 발생함.

### 2.2 개선 내용
주석 사양(`0.68 ~ 0.73`)에 맞추어 엄밀한 A4 감지 구간으로 재조정:
```ts
const isA4Portrait = ratio >= 0.68 && ratio <= 0.73;
const isA4Landscape = ratio >= 1.37 && ratio <= 1.47;
```

---

## 3. `rectangleCornerRadii` 개별 모서리 반경 우선 적용

### 3.1 결함 원인
Figma 노드에서 상단 모서리만 둥근 모달(`rectangleCornerRadii: [16, 16, 0, 0]`)을 파싱할 때, 레거시 스칼라 속성인 `node.cornerRadius: 4`가 존재하면 `if (node.cornerRadius)` 블록이 개별 모서리 계산 결과를 무조건 덮어써버려 모서리 스타일이 왜곡되는 버그가 존재함.

### 3.2 개선 내용
`else if` 분기 구조로 격리하여, 개별 모서리 배열(`rectangleCornerRadii`)이 존재할 경우 0이 아닌 유효 반경들의 평균을 우선 산출하고 레거시 스칼라 값에 의해 덮어써지지 않도록 수정함:
```ts
if (Array.isArray(node.rectangleCornerRadii) && node.rectangleCornerRadii.length === 4) {
  // 개별 반경 우선 적용
  const nonZero = radii.filter((r) => r > 0);
  if (nonZero.length > 0) {
    style.cornerRadius = nonZero.reduce((a, b) => a + b, 0) / nonZero.length;
  }
} else if (node.cornerRadius) {
  style.cornerRadius = node.cornerRadius * scale;
}
```
- **검증**: `tests/phase27-renderer-improvements.test.ts` 통과.
