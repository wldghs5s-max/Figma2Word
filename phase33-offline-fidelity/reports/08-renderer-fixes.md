# Phase 33 — Report 08: Universal Renderer Improvements & Safety Hardening

## 1. 개요

Phase 33에서 구현된 핵심 범용 렌더러 개선 및 자동화 안전성 보강 내역입니다.
특정 페이지나 특정 프레임 ID를 하드코딩하지 않고, 순수 기하학 및 표준 마크업 생성 규칙을 범용적으로 개선했습니다.

## 2. 계단식 투명도 전파 (Cascading Opacity Propagation)

### 1) 결함 원인 분석
- Figma 노드 트리에서 부모 `GROUP`, `FRAME`, `COMPONENT`에 `opacity`가 지정된 경우, Figma는 자식 요소들에 부모의 투명도를 곱하여 렌더링합니다.
- 기존 파서는 `processChildren()`에서 부모의 `opacity`를 자식으로 전달하지 않아, 자식 카드가 완전 불투명(1.0)으로 렌더링되어 배경 및 텍스트를 가리는 시각적 결함이 있었습니다.

### 2) 구현 내역 (`src/canvas/parser/figmaCanvasParser.ts`)
```ts
const processChildren = (node: FigmaNode, parentOpacity: number = 1.0) => {
  if (!node.children) return;

  for (const child of node.children) {
    if (child.visible === false) continue;

    const childRawOpacity = typeof child.opacity === "number" ? child.opacity : 1.0;
    const effectiveOpacity = Math.max(0, Math.min(1.0, parentOpacity * childRawOpacity));
    const finalElemOpacity = effectiveOpacity < 1.0 ? effectiveOpacity : (child.opacity !== undefined ? child.opacity : undefined);
    ...
    // Element 생성 시
    opacity: finalElemOpacity,
    ...
    // 자식 재귀 호출 시
    processChildren(child, effectiveOpacity);
  }
};
```

### 3) 렌더러 반영 (`src/canvas/renderer/docxCanvasRenderer.ts` & `hwpxCanvasRenderer.ts`)
- **Word DOCX (VML)**:
  - `<v:fill opacity="${fillAlpha.toFixed(2)}"/>`로 카드 및 도형의 반투명 채우기 지원.
  - `<v:stroke opacity="${strokeAlpha.toFixed(2)}"/>`로 반투명 테두리 지원.
  - 이미지 요소의 `<v:fill opacity="...">` 지원.
- **한컴 HWPX (OWPML)**:
  - `<hc:winBrush ... alpha="${Math.round((1 - fillAlpha) * 255)}"/>`로 KS X 6101 표준 투명도 지원.

---

## 3. 디렉터리 경계 방어 (`isPathInsideDirectory`)

### 1) 결함 원인 분석 (Phase 32 잔여 취약점)
- `safe_word_automation.ts`의 `cleanResidualIsolationDirsSafely()`에서 열린 문서 포함 여부를 `p.startsWith(normDir)` 단순 문자열 비교로 검사했습니다.
- 이 경우 `/tmp/f2w_word_isolation/vr_123` 디렉터리가 열려 있을 때, 비활성 상태인 `/tmp/f2w_word_isolation/vr_1234`가 오탐(False Positive)되어 잠금 처리로 오인되는 결함이 있었습니다.

### 2) 구현 내역 (`tools/visual-regression/safe_word_automation.ts`)
```ts
export function isPathInsideDirectory(targetPath: string, parentDir: string): boolean {
  const normTarget = normalizeWordPath(targetPath);
  const normParent = normalizeWordPath(parentDir);
  if (normTarget === normParent) return true;
  const rel = path.relative(normParent, normTarget);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}
```
- OS 경로 구분자 및 정규화 경로를 고려하여 디렉터리 경계를 정확하게 검사함으로써, 접두사 충돌을 100% 방지했습니다.

---

## 4. 벤치마크 오류 감지 및 안전한 종료 (`benchmark_phase32_real_figma.ts` / `phase33`)

- 기존의 `run().catch(console.error);` 구조를 수정하여, 오류 발생 시 `closeTargetDocOnly` 및 `safeCleanupIsolatedDirectory` 비상 안전 정리를 수행한 후 `process.exit(1)`로 비정상 종료 코드를 반환하도록 개선했습니다.
- 실패를 숨기거나 부분 성공을 전체 성공으로 잘못 기록하는 것을 방지했습니다.
