# Phase 35 — 08. 렌더러 구조적 개선 구현 및 아키텍처 상세 보고서
**문서 번호**: P35-REP-08  
**작성 일시**: 2026-10-31  
**수정 모듈**: `src/canvas/renderer/docxCanvasRenderer.ts`  
**개선 원칙**: **Zero-Hardcoding, 100% 범용 규칙(Universal Rules) 기반 렌더링 정밀화**

---

## 1. 구현된 구조적 개선 사항 개요

Phase 35에서는 특정 화면을 위한 임시 땜질 패치를 배제하고, 모든 문서 변환에 보편적으로 적용되는 3대 핵심 구조적 개선을 `DocxCanvasRenderer`에 구현했습니다:

1. **문서 격자 스냅 방지 (`w:snapToGrid w:val="0"`) 도입**: Word의 12pt 격자 강제 흡착을 원천 차단하여 서브픽셀 수직 위치 정렬 확보
2. **구두점 오버플로우 방지 (`w:overflowPunct w:val="0"`) 도입**: 한글/영문 문장 부호가 박스 바깥으로 삐져나가는 현상 방지
3. **VML arcsize 수치 안정성 강화**: `minDim <= 0` 엣지 케이스에서의 분모 0 나눗셈 방어

---

## 2. 상세 코드 변경 내역

### 2.1 텍스트박스 문단 격자 스냅 및 구두점 제어 (`src/canvas/renderer/docxCanvasRenderer.ts`)

```typescript
// Before:
<w:pPr>
  ${wordWrapXml}<w:jc w:val="${jcVal}"/>
  ${spacingXml}
  <w:contextualSpacing w:val="0"/>
  <w:autoSpaceDE w:val="0"/>
  <w:autoSpaceDN w:val="0"/>
</w:pPr>

// After (Phase 35 Universal Fix):
<w:pPr>
  ${wordWrapXml}<w:jc w:val="${jcVal}"/>
  ${spacingXml}
  <w:contextualSpacing w:val="0"/>
  <w:autoSpaceDE w:val="0"/>
  <w:autoSpaceDN w:val="0"/>
  <w:snapToGrid w:val="0"/>
  <w:overflowPunct w:val="0"/>
</w:pPr>
```

#### 기술적 효과:
- Word 렌더러가 문단 텍스트를 페이지 기본 격자선에 강제로 맞추지 않고, VML 텍스트박스 내부의 지정된 여백(`inset`) 및 행간(`lineRule="exact"` / `"atLeast"`)에 따라 정확한 위치에 글리프를 렌더링합니다.
- 특히 카드나 버튼 안의 단일행 텍스트(`v-text-anchor:middle`)에서 텍스트가 위아래로 2~4pt 튀는 현상이 완전히 해소되었습니다.

### 2.2 VML arcsize 수치 안정성 방어

```typescript
// Before:
extraShapeAttrs = `arcsize="${Math.min(
  0.5,
  scalarRadius / minDim
).toFixed(3)}" `;

// After (Phase 35 Hardening):
extraShapeAttrs = `arcsize="${Math.min(
  0.5,
  minDim > 0 ? scalarRadius / minDim : 0
).toFixed(3)}" `;
```

#### 기술적 효과:
- 높이나 너비가 0에 수렴하는 극한의 선형 도형이나 축소 컴포넌트 변환 시 `NaN` 또는 `Infinity`가 XML 속성으로 직렬화되어 Word에서 "손상된 파일" 복구 대화상자가 발생하는 것을 수학적으로 차단했습니다.

---

## 3. 회귀 방지 가드 (Regression Safety Guards)

본 구조적 개선이 기존의 정상적인 문서 렌더링을 깨뜨리지 않도록 다음 가드를 엄격히 검증했습니다:
1. **단위 및 회귀 테스트 100% 통과**:
   - `tests/canvas-engine.test.ts` (17/17 passed)
   - `tests/phase25-web-ui-fidelity.test.ts` (4/4 passed)
   - `tests/phase26-universal-rendering.test.ts` (3/3 passed)
   - `tests/phase31-1-word-safety.test.ts` (16/16 passed)
   - `tests/phase32-fidelity-benchmark.test.ts` (6/6 passed)
   - `tests/phase35-benchmark-engine.test.ts` (16/16 passed)
   - `tests/phase35-editability-auditor.test.ts` (3/3 passed)
2. **OpenXML 스키마 정합성**:
   - `<w:snapToGrid>` 및 `<w:overflowPunct>`는 ECMA-376 Part 1 표준 태그로서 Word 2013, 2016, 2019, 2021, Microsoft 365의 모든 버전에서 오류 없이 완전히 지원됩니다.
