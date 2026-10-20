# Phase 26 — 07. 렌더러 범용 결함 개선 및 수학적 검증 보고서 (Renderer Improvements)

**문서 작성 일시**: 2026-10-20  
**작업자**: Antigravity (Google DeepMind Advanced Agentic Coding)  

---

## 1. 개선 개요 및 범용성 원칙

Phase 26의 렌더러 개선은 특정 프레임이나 회사 샘플을 위한 하드코딩을 배제하고, **W3C VML 사양, ECMA-376 표준, 기하학적 수학 공식에 입각한 2가지 핵심 범용 개선**을 구현하고 검증했다:

1. **VML `<v:roundrect>` arcsize 모서리 곡률 반경 수학 공식 정규화**
2. **비문서 Redline 측정 플러그인 필터의 정상 UI 컨테이너 오탐(False Positive) 방지**

---

## 2. 세부 개선 내용 및 인과관계 증명

### 2.1 VML `<v:roundrect>` arcsize 반경 공식 정규화

#### A. 결함 원인 (Root Cause)
- **기존 레거시 코드**:
  ```ts
  const minDim = Math.max(1e-3, Math.min(width, height));
  const arcsizeAttr = isRound
    ? `arcsize="${Math.min(0.5, (style.cornerRadius || 0) / minDim).toFixed(3)}"`
    : "";
  ```
- **W3C VML Specification (§2.3.2 roundrect)**:
  > *"The arcsize attribute defines the corner radius as a fraction of **half** the smaller side of the bounding box."*
- **수학적 불일치**:
  - VML 엔진이 실제로 렌더링하는 모서리 반경은:
    $$R_{\text{rendered}} = \text{arcsize} \times \frac{\min(W, H)}{2}$$
  - 기존 레거시 코드는 $\text{arcsize} = \frac{R}{\min(W, H)}$ 로 계산하였으므로,
    $$R_{\text{rendered}} = \left(\frac{R}{\min(W, H)}\right) \times \frac{\min(W, H)}{2} = \frac{R}{2}$$
    즉, **Figma에서 지정한 cornerRadius의 정확히 50%(절반)에 해당하는 작은 곡률로 납작하게 렌더링되는 심각한 시각적 왜곡**이 발생하고 있었다.

#### B. 정규화 수정 (Normalized Formula)
```ts
// radius = arcsize * (minDim / 2)  =>  arcsize = (2 * radius) / minDim
const arcsizeAttr = isRound
  ? `arcsize="${Math.min(0.5, (2 * (style.cornerRadius || 0)) / minDim).toFixed(3)}"`
  : "";
```
- **개선 효과**: 버튼($H=40, R=8$)의 경우 기존 `arcsize="0.200"`에서 올바른 `arcsize="0.400"`으로 계산되어, Figma 디자인 원본의 부드러운 둥근 모서리가 Word에서 100% 동일한 곡률로 렌더링됨.

---

### 2.2 Redline 측정 플러그인 필터 오탐 방지

#### A. 결함 원인 (Root Cause)
- 기존 코드는 `child.name.toLowerCase().includes("container")`를 무조건적인 가이드 필터링 조건으로 취급함.
- 실제 현업 UI 디자인에서 최상위 그룹 명칭으로 `"Main Container"`, `"Content Container"`를 사용하는 경우가 매우 흔하며, 이 경우 정상적인 메인 화면이 통째로 문서에서 삭제되는 치명적 오탐 위험이 존재함.

#### B. 구조적 증거 기반 필터링 (Evidence-Based Guard)
```ts
const hasGuideChildren =
  Array.isArray(child.children) &&
  child.children.some(
    (c) =>
      c.name &&
      (c.name.includes("INNER_PADDING") ||
        c.name.includes("OUTER_SPACING") ||
        c.name.includes("REDLINE") ||
        c.name.includes("DIMENSION") ||
        c.name.includes("GUIDE_LINE"))
  );

const isMeasurementGuide =
  name.includes("📏") ||
  name.includes("redline") ||
  name.includes("measurement") ||
  (name.includes("container") && hasGuideChildren) ||
  hasGuideChildren;
```
- **개선 효과**: 비문서 플러그인 컨테이너(`📏 Container`, 35인치 거대 오버레이)는 완벽히 제거하면서, 정상 UI 그룹인 `"Main Content Container"`는 100% 안전하게 보존됨 (`tests/phase26-universal-rendering.test.ts` 통과).

---

## 3. 회귀 테스트 및 검증 결과

- **신규 테스트**: `tests/phase26-universal-rendering.test.ts` (3개 테스트 100% 통과)
- **기존 회귀 테스트**:
  - `tests/phase25-web-ui-fidelity.test.ts` (4개 테스트 100% 통과)
  - `tests/canvas-engine.test.ts` (17개 테스트 100% 통과)
- **TypeScript 타입 체크**: 0건 에러
