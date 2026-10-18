# DOCX vs HWPX 렌더러 구현 및 동작 메커니즘 심층 비교 (Renderer Comparison)

**문서 분류**: 독립 기술 감사(Independent Technical Audit) 자료 04  
**비교 대상**: `src/canvas/renderer/docxCanvasRenderer.ts` vs `src/canvas/renderer/hwpxCanvasRenderer.ts`  

---

## 1. 핵심 질문: 왜 동일한 JSON에서 DOCX는 정상이고 HWPX만 겹치는가?

사용자가 지속적으로 관찰한 핵심 팩트는 다음과 같습니다:
> **"Figma 원본과 동일한 Canonical JSON을 렌더링했을 때, Microsoft Word(DOCX)는 텍스트 겹침이 전혀 없는데, 한컴오피스(HWPX)에서만 텍스트 겹침이 대규모로 발생한다."**

두 렌더러 소스 코드를 1:1 대조 분석한 결과, **텍스트 줄바꿈 판별 정책(Text Wrapping Policy)과 높이 적응 정책(Shape-to-Text Fit Policy)**에서 결정적인 아키텍처 차이가 확인되었습니다.

---

## 2. 텍스트 줄바꿈 제어 정책 비교 (Text Wrapping Policy)

### 2.1 DOCX Renderer: 정밀한 다중행 판별 및 단일행 줄바꿈 금지

[`src/canvas/renderer/docxCanvasRenderer.ts#L383-L408`](file:///c:/Users/77/Documents/Figma2Word/src/canvas/renderer/docxCanvasRenderer.ts#L383-L408):

```typescript
// Precision typography wrapping:
// Only elements designed as multi-line paragraphs or containing explicit newlines should auto-wrap.
// Single-line labels, metrics, chips, badges, button texts, and auto-width elements must NOT wrap,
// preventing Word DirectWrite font variance from dropping words into invisible/awkward second lines.
let wrapStyle = "mso-wrap-style:none"; // <--- [기본값: 줄바꿈 금지!]
if (hasText) {
  const isAutoWidth = elem.textAutoResize === "WIDTH_AND_HEIGHT";
  if (!isAutoWidth) {
    const hasHardNewline = elem.textRuns!.some((r) => r.text && /[\r\n]/.test(r.text));
    const maxFontSize = Math.max(...elem.textRuns!.map((r) => r.fontSizePt || 12));
    const firstLineHeight =
      elem.textRuns!.find((r) => r.lineHeightPt)?.lineHeightPt || maxFontSize * 1.25;
    const evalHeight = elem.contentHeightPt || elem.bounds.height;
    const estimatedLines = evalHeight / firstLineHeight;
    const totalChars = elem.textRuns!.reduce((sum, r) => sum + (r.text?.length || 0), 0);

    const isMultiLineBox =
      estimatedLines >= 1.45 ||
      hasHardNewline ||
      (totalChars >= 80 && elem.textAutoResize === "HEIGHT");

    if (isMultiLineBox) {
      wrapStyle = "mso-wrap-style:square"; // <--- [오직 명백한 다중행 문단만 줄바꿈 허용]
    }
  }
}
```

- **동작 결과**:
  - 단일행 라벨(`균열밀도 (CDI)`, `1,248 개` 등)은 `mso-wrap-style:none`이 적용됩니다.
  - 박스 폭이 글자 길이보다 5pt 좁더라도, Word는 **글자를 강제로 2줄로 쪼개지 않고 단일행 상태를 유지**합니다.
  - 따라서 높이가 1행 크기(9.7pt)로 고정되어 직하단 요소(Gap 6pt)와 절대 충돌하지 않습니다.

---

### 2.2 HWPX Renderer: 무차별 전면 줄바꿈 강제 (Global Blind BREAK)

[`src/canvas/renderer/hwpxCanvasRenderer.ts#L768`](file:///c:/Users/77/Documents/Figma2Word/src/canvas/renderer/hwpxCanvasRenderer.ts#L768):

```typescript
drawTextPart = `
  <hp:drawText lastWidth="${shapeW}" name="${drawName}" editable="1">
    <hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="${vertAlignAttr}" ...>
      ${parasXml.join("\n      ")}
    </hp:subList>
    <hp:textMargin left="${marginL}" right="${marginR}" top="${marginT}" bottom="${marginB}"/>
  </hp:drawText>`;
```

- **동작 결과**:
  - `lineWrap="BREAK"`가 **아무런 조건문 없이 모든 텍스트박스에 100% 일괄 적용**됩니다.
  - 단일행 라벨, 배지, 지표 숫자, 버튼 텍스트까지 모조리 강제 줄바꿈 대상이 됩니다.
  - 박스 폭이 1pt라도 부족하면 한컴 뷰어가 단어/글자를 2줄로 쪼갭니다.
  - 2줄로 늘어난 텍스트는 9.7pt 높이의 사각형 바닥을 뚫고 쏟아져 나와 아래 요소를 덮어씁니다.

---

## 3. 높이 자동 적응 정책 비교 (Auto-Fit Shape Policy)

### 3.1 DOCX: 텍스트에 맞춘 도형 자동 신축

[`src/canvas/renderer/docxCanvasRenderer.ts#L691-L699`](file:///c:/Users/77/Documents/Figma2Word/src/canvas/renderer/docxCanvasRenderer.ts#L691-L699):

```typescript
const shouldFitHeight =
  elem.verticalAlign !== "center" &&
  (isPureText ||
    elem.textAutoResize === "HEIGHT" ||
    elem.textAutoResize === "WIDTH_AND_HEIGHT");
const fitTextAttr =
  shouldFitHeight && !hasFill && !hasStroke
    ? "mso-fit-shape-to-text:t" // <--- [Word 텍스트박스 자동 높이 확장]
    : "mso-fit-shape-to-text:f";
```

- DOCX는 순수 텍스트의 경우 `mso-fit-shape-to-text:t`를 활성화하여 텍스트 내용에 맞게 박스 높이를 유연하게 조절합니다.

### 3.2 HWPX: 고정 크기 사각형 + 자유 오버플로우

HWPX OWPML 규격의 `<hp:rect>`는 그리기 객체(Shape Object)로서 다음과 같이 고정 크기가 선언됩니다:

```xml
<hp:sz width="5398" height="975" widthRelTo="ABSOLUTE" heightRelTo="ABSOLUTE" protect="0"/>
```

- 한컴오피스에서 `<hp:rect>`는 테이블 셀과 달리 텍스트 줄 수가 늘어난다고 해서 사각형 도형 자체의 `height`가 자동으로 늘어나지 않습니다.
- 사각형의 경계는 고정되어 있는데 내부 텍스트만 2줄로 렌더링되므로, 초과된 텍스트가 사각형 경계선 아래로 그대로 흘러넘쳐(Visual Overflow) 아래에 놓인 별도의 사각형/텍스트를 침범합니다.

---

## 4. 실측 XML 마크업 1:1 대조 (Case: `7:980` "균열밀도 (CDI)")

### DOCX 실제 마크업 (정상 렌더링):
```xml
<v:rect id="s_0_14" alt="7:980" o:title="균열밀도 (CDI)" 
        style="position:absolute;left:0;top:0;margin-left:52.481pt;margin-top:457.304pt;width:53.980pt;height:9.746pt;z-index:15;mso-position-horizontal-relative:page;mso-position-vertical-relative:page;mso-wrap-style:none" 
        filled="f" stroked="f">
  <v:textbox style="mso-fit-shape-to-text:t;mso-next-textbox:none;v-text-anchor:top" inset="0.00pt,0.00pt,0.00pt,0.00pt">
    <w:txbxContent>
      <w:p>
        <w:pPr><w:jc w:val="left"/><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/></w:pPr>
        <w:r><w:t>균열밀도 (CDI)</w:t></w:r>
      </w:p>
    </w:txbxContent>
  </v:textbox>
</v:rect>
```
> **핵심**: `mso-wrap-style:none`이 단일행을 보장하여 높이 9.7pt 유지 -> **0건 충돌**.

---

### HWPX 실제 마크업 (글자 겹침 발생):
```xml
<hp:rect id="16" zOrder="15" numberingType="NONE" textWrap="IN_FRONT_OF_TEXT" textFlow="BOTH_SIDES" lock="0" ratio="0">
  <hp:sz width="5398" height="975" widthRelTo="ABSOLUTE" heightRelTo="ABSOLUTE" protect="0"/>
  <hp:pos treatAsChar="0" affectLSpacing="0" flowWithText="0" allowOverlap="1" holdAnchorAndSO="1" 
          vertRelTo="PAPER" horzRelTo="PAPER" vertAlign="TOP" horzAlign="LEFT" vertOffset="45731" horzOffset="5248"/>
  <hc:fillBrush/>
  <hp:drawText lastWidth="5398" name="균열밀도 (CDI)" editable="1">
    <hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="TOP" linkListIDRef="0" linkListNextIDRef="0" textWidth="5398" textHeight="0" hasTextRef="0" hasNumRef="0">
      <hp:p id="0" paraPrIDRef="1" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">
        <hp:run charPrIDRef="2"><hp:t>균열밀도 (CDI)</hp:t></hp:run>
      </hp:p>
    </hp:subList>
    <hp:textMargin left="0" right="0" top="0" bottom="0"/>
  </hp:drawText>
</hp:rect>
```
> **핵심**: `lineWrap="BREAK"`로 인해 폭 5398(53.98pt)을 초과한 텍스트가 2줄로 쪼개짐 -> 높이 975(9.75pt)를 초과하여 아래 `0.031%` 침범 -> **치명적 충돌 발생**.

---

## 5. 결론 및 감사 시사점

1. **DOCX의 성공 비결**: DOCX 렌더러는 이미 다중행 문단과 단일행 라벨을 정밀하게 구분(`isMultiLineBox`)하여 단일행에는 `mso-wrap-style:none`을 적용하고 있었습니다.
2. **HWPX의 실패 원인**: HWPX 렌더러는 Phase 23에서 텍스트의 특성(단일행 vs 다중행)을 전혀 고려하지 않고 전면 `lineWrap="BREAK"`를 일괄 적용함으로써, DOCX가 세심하게 회피했던 2줄 개행 함정에 스스로 빠졌습니다.
