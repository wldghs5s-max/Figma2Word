# FIGMA2WORD — INDEPENDENT TECHNICAL AUDIT INGEST DOSSIER
## HWPX Text Overlap & Visual Collision Forensic Audit

**Document Type**: Independent Auditor Ingest Dossier (웹 Argon 독립 기술 감사 제출용 통합 마스터 문서)  
**Target Repository**: `wldghs5s-max/Figma2Word`  
**Current HEAD Commit**: `5ecc067`  
**Date**: 2026-10-18  
**Audit Purpose**: HWPX 텍스트 겹침 결함의 근본 원인 규명 및 독립적 기술 해법 자문  

---

## 0. 감사관(Web Argon)을 위한 안내문 (Auditor's Brief)

본 문서는 `Figma2Word` 프로젝트에서 수차례의 수정(Phase 20~23.1, 긴급 방향 수정)에도 불구하고 한컴오피스 2024 정식 뷰어에서 해결되지 않고 있는 **HWPX 텍스트 겹침(Visual Overlap) 결함**을 해결하기 위해, 독립 기술 감사관(Web Argon)에게 제출하는 공학적 사실 및 코드 실측 증거 데이터 세트입니다.

현재 프로덕션 렌더러 수정은 전면 동결(Code Freeze)되었으며, 본 문서의 목적은 추측이나 낙관적 보고를 배제하고 **코드 실측치, 정품 OWPML 레퍼런스, 기하학적 수치, 사용자 실측 팩트**를 제공하여 독립적인 원인 분석과 최적 해법을 도출하는 데 있습니다.

---

## 1. 프로젝트 목적 및 불변의 설계 원칙

### 1.1 프로젝트 목적
Figma 디자인(API 응답 또는 오프라인 JSON 스냅샷)을 입력받아, 이미지 래스터화가 아닌 네이티브 워드프로세서 객체로 1:1 직렬화하여 **Microsoft Word(DOCX)** 및 **한컴오피스 한글(HWPX)** 문서로 변환하는 크로스 플랫폼 문서 변환 엔진입니다.

### 1.2 불변의 원칙: Canonical JSON (Canvas IR) as Single Source of Truth
- 원본은 DOCX도 HWPX도 아니며, 중간 추상화 계층인 **`CanvasDocument` (Canonical JSON / Canvas IR)이 유일무이한 단일 원본(SSOT)**입니다.
- 특정 포맷(HWPX)의 렌더링 버그나 특수성을 회피하기 위해 Canonical JSON의 좌표, 너비, 높이, 텍스트 구조를 인위적으로 오염시켜서는 안 됩니다.
- 동일한 Canonical JSON이 입력되었을 때, DOCX와 HWPX는 각 포맷의 국가/국제 표준 규격(ECMA-376 vs KS X 6101)에 따라 대등한 시각적 충실도로 렌더링되어야 합니다.

```text
                  [ Figma Design Source ]
                             │
                             ▼
                  [ FigmaCanvasParser ]
                             │
                             ▼
               ==============================
               * Canonical JSON (Canvas IR) *  <--- Single Source of Truth
               ==============================
                             │
             ┌───────────────┴───────────────┐
             ▼                               ▼
   [ DocxCanvasRenderer ]          [ HwpxCanvasRenderer ]
             │                               │
             ▼                               ▼
       Output (.docx)                  Output (.hwpx)
     (Microsoft Word)                (한컴오피스 한글)
   * 텍스트 겹침 없음! *           * 심각한 텍스트 겹침 발생! *
```

---

## 2. 사용자 실제 검증 타임라인 (User Verified Ground Truth)

모든 자동화 테스트(Vitest 376개 테스트) 통과 여부와 무관하게, **사용자가 한컴오피스 2024 정품 뷰어에서 직접 눈으로 확인한 사실만이 최우선 Ground Truth**입니다:

| 단계 (Phase) | 코드 변경 요약 | 사용자 한컴 뷰어 실측 결과 | 비고 |
| :--- | :--- | :--- | :--- |
| **Phase 20~21** | ZIP 패키지 및 OWPML 태그 복구 | 파일 열람 실패 (뷰어 크래시 또는 빈 화면) | 패키지/스키마 결함 |
| **Phase 22** | 네임스페이스 및 필수 XML 매니페스트 복구 | **한컴 뷰어 정상 열람 성공!** | 파일 오픈 성공 (최초) |
| **Phase 23** | 전면 `lineWrap="BREAK"` 일괄 적용 | 글자 가로 찌그러짐은 일부 풀렸으나, **개행된 문단이 바로 아래에 배치된 다른 문단이나 도형을 덮어써 글자가 심하게 겹침** | 신규 치명적 결함 노출 |
| **Phase 23.1** | `snapToGrid=0`, `autoSpacing=0`, `textMargin=0`, `BREAK_WORD` | **텍스트 겹침 현상 전혀 해결되지 않음** (변화 없음) | 타이포 보정 효과 없음 |
| **긴급 방향 수정 (`5ecc067`)** | `WIDELY`=세로, `NARROWLY`=가로 정상화 | **세로 방향과 9페이지 구성은 정상 복구되었으나, 텍스트 겹침 결함에는 변화 없음** | 매크로 방향만 해결 |

---

## 3. 코드 실측 비교: DOCX는 왜 정상이고, HWPX는 왜 겹치는가?

동일한 Canonical JSON을 처리함에도 불구하고, Microsoft Word에서는 글자 겹침이 전혀 발생하지 않고 한컴오피스에서만 겹치는 근본적인 이유는 두 렌더러의 **줄바꿈 판별 정책(Text Wrapping Policy)**의 차이 때문입니다.

### 3.1 DOCX Renderer의 정밀한 단일행 보존 로직
- 소스 코드: [`src/canvas/renderer/docxCanvasRenderer.ts#L383-L408`](file:///c:/Users/77/Documents/Figma2Word/src/canvas/renderer/docxCanvasRenderer.ts#L383-L408)
```typescript
let wrapStyle = "mso-wrap-style:none"; // [기본값: 줄바꿈 금지!]
if (hasText) {
  const isAutoWidth = elem.textAutoResize === "WIDTH_AND_HEIGHT";
  if (!isAutoWidth) {
    const hasHardNewline = elem.textRuns!.some((r) => r.text && /[\r\n]/.test(r.text));
    const maxFontSize = Math.max(...elem.textRuns!.map((r) => r.fontSizePt || 12));
    const firstLineHeight = elem.textRuns!.find((r) => r.lineHeightPt)?.lineHeightPt || maxFontSize * 1.25;
    const evalHeight = elem.contentHeightPt || elem.bounds.height;
    const estimatedLines = evalHeight / firstLineHeight;
    const totalChars = elem.textRuns!.reduce((sum, r) => sum + (r.text?.length || 0), 0);

    const isMultiLineBox =
      estimatedLines >= 1.45 ||
      hasHardNewline ||
      (totalChars >= 80 && elem.textAutoResize === "HEIGHT");

    if (isMultiLineBox) {
      wrapStyle = "mso-wrap-style:square"; // [오직 명백한 다중행 문단만 줄바꿈 허용]
    }
  }
}
```
- **Word 동작**: 단일행 라벨이나 지표는 `mso-wrap-style:none`이 적용되어, 박스 폭이 다소 좁더라도 2줄로 쪼개지지 않고 단일행 상태를 유지하므로 높이가 늘어나지 않아 하단 요소와 절대 충돌하지 않습니다.

### 3.2 HWPX Renderer의 전면 강제 줄바꿈
- 소스 코드: [`src/canvas/renderer/hwpxCanvasRenderer.ts#L768`](file:///c:/Users/77/Documents/Figma2Word/src/canvas/renderer/hwpxCanvasRenderer.ts#L768)
```typescript
drawTextPart = `
  <hp:drawText lastWidth="${shapeW}" name="${drawName}" editable="1">
    <hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="${vertAlignAttr}" ...>
      ${parasXml.join("\n      ")}
    </hp:subList>
    <hp:textMargin left="${marginL}" right="${marginR}" top="${marginT}" bottom="${marginB}"/>
  </hp:drawText>`;
```
- **한컴 뷰어 동작**: `lineWrap="BREAK"`가 아무런 조건 없이 100% 모든 요소에 일괄 강제되어 있습니다.
- 좁은 라벨이나 수치 박스(폭 30~60pt)까지 무조건 개행 처리되며, 한컴 뷰어가 단어를 2줄로 꺾어버립니다.
- 사각형(`<hp:rect>`)의 높이는 9.7pt로 고정되어 있어, 늘어난 2번째 행 텍스트가 사각형 바닥을 뚫고 쏟아져 나와 6pt 아래에 놓인 다음 요소 위로 글자가 겹쳐 인쇄됩니다.

---

## 4. 정품 OWPML 레퍼런스 실측 증거 (Ground Truth from Reference)

한컴 정식 제품으로 생성되어 검증된 실제 레퍼런스 파일(`완성본-20261012/report-1차-진단-편집가능-최종보정.hwpx`)을 전수 조사한 결과:

1. **전체 텍스트 그리기 객체 수**: 429개
2. **`lineWrap="SQUEEZE"` 비율**: **412개 (96.0%)**
3. **`lineWrap="BREAK"` 비율**: **17개 (4.0%)**

### 4.1 정품 레퍼런스에서 `BREAK`가 사용된 17개 객체의 성격:
- 최소 너비: **357.0 pt ~ 523.5 pt**
- 높이: **16.1 pt ~ 119.25 pt**
- 내용: 5줄짜리 종합 의견 문단, 2줄 권고사항 문단 등 **공간이 극히 넓은 대형 본문 문단에만 한정 적용**됨.
- 단일행 라벨, 칩, 배지, KPI 수치 중 `BREAK`가 적용된 것은 **0건**.

### 4.2 현재 겹침이 발생하는 KPI 블록의 정품 레퍼런스 실제 XML:
- `균열밀도 (CDI)`:
  ```xml
  <hp:rect id="16" zOrder="15">
    <hp:sz width="5860" height="1425"/>
    <hp:pos vertOffset="45750" horzOffset="5250"/>
    <hp:drawText lastWidth="5860">
      <hp:subList lineWrap="SQUEEZE" vertAlign="TOP">
        <hp:p id="0"><hp:run charPrIDRef="2"><hp:t>균열밀도 (CDI)</hp:t></hp:run></hp:p>
      </hp:subList>
    </hp:drawText>
  </hp:rect>
  ```
- **정품 문서의 핵심 전략**:
  - `lineWrap="SQUEEZE"`를 통해 자간/장평을 미세하게 압축하여 **반드시 1줄로 유지**.
  - 높이가 14.25pt를 넘지 않아 아래 47.3pt에 위치한 `0.031%`와 **절대 충돌하지 않음**.

---

## 5. 실제 문제 발생 객체의 기하학적 실측 데이터 (Stage 7)

`scripts/inspect_geometry_details.ts`를 실행하여 도출한 Stage 7 (Page 1) 주요 충돌 객체의 기하학적 실측치입니다:

| ID | 텍스트 내용 | 박스폭 (W) | 단일행 필요폭 | 박스높이 (H) | 개행 후 필요높이 | 높이 초과량 | 직하단 요소 ID 및 Y좌표 | 요소 간 물리적 여백 | 뷰어 겹침 상태 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `7:980` | 균열밀도 (CDI) | 53.98 pt | 59.8 pt | 9.75 pt | 22.26 pt | **+12.51 pt** | `7:981` (473.06 pt) | **6.00 pt** | **글자 중첩 충돌 (Collision)** |
| `7:984` | 건전성 지수 (BHI) | 63.00 pt | 78.5 pt | 9.75 pt | 22.26 pt | **+12.51 pt** | `7:985` (473.06 pt) | **6.00 pt** | **글자 중첩 충돌 (Collision)** |
| `7:988` | 정제 검출 균열 | 50.20 pt | 57.7 pt | 9.75 pt | 22.26 pt | **+12.51 pt** | `7:989` (473.06 pt) | **6.00 pt** | **글자 중첩 충돌 (Collision)** |
| `7:989` | 1,248 개 | 58.48 pt | 68.0 pt | 17.99 pt | 40.48 pt | **+22.49 pt** | `7:990` (497.06 pt) | **6.00 pt** | **16.5pt 관통 충돌 (Collision)** |
| `7:992` | 순외벽면적 | 38.20 pt | 41.2 pt | 9.75 pt | 22.26 pt | **+12.51 pt** | `7:993` (473.06 pt) | **6.00 pt** | **글자 중첩 충돌 (Collision)** |

### 충돌 메커니즘의 수학적 증명:
1. `균열밀도 (CDI)` 박스 바닥 = `457.30 + 9.75 = 467.06 pt`.
2. 바로 아래 `0.031%` 박스 상단 = `473.06 pt`.
3. 두 객체 사이의 여백은 단 **6.00 pt**.
4. 박스폭(53.98pt)이 단일행 필요폭(59.8pt)보다 좁아 `lineWrap="BREAK"`에 의해 2줄로 꺾임.
5. 2줄 렌더링에 필요한 높이는 `22.26 pt`이며, 2번째 줄 `(CDI)`는 `468.43 pt`에서 시작하여 `476.68 pt`까지 그려짐.
6. `476.68 pt > 473.06 pt`이므로, **3.62 pt 구간에 걸쳐 `0.031%` 숫자의 상단과 `(CDI)` 글자가 물리적으로 겹쳐짐**.

---

## 6. 현재 가장 유력한 가설과 반증 (Hypotheses & Counter-Evidence)

### 가설 A (기각됨): "격자 스냅과 마진 때문에 텍스트 가용폭이 좁아져 줄바꿈이 발생했다."
- **반증**: Phase 23.1에서 `snapToGrid="0"`과 `textMargin="0"`을 완벽히 적용했음에도, 원본 Figma 박스폭 자체가 글자 길이보다 5~15pt 좁게 정의되어 있어 물리적으로 1줄 수용이 불가능했습니다.

### 가설 B (기각됨): "페이지 방향이 가로여서 세로 공간이 부족해 발생했다."
- **반증**: 페이지 방향을 세로(WIDELY)로 복구하여 페이지 전체 높이가 842pt로 늘어났음에도, Page 1 내부 요소 간의 상대 간격(6pt)은 변하지 않아 충돌이 100% 그대로 유지되었습니다.

### 가설 C (유력 가설): "단일행/다중행 구분 없는 전면 `lineWrap="BREAK"` 지정이 충돌의 직접적 트리거이다."
- **입증 근거**:
  1. DOCX는 `mso-wrap-style:none`으로 단일행 줄바꿈을 차단하여 0건 충돌 달성.
  2. 정품 HWPX 레퍼런스는 96%의 요소에 `lineWrap="SQUEEZE"`를 적용하여 단일행을 강제함으로써 0건 충돌 달성.
  3. 현재 HWPX 렌더러만 유일하게 100% `lineWrap="BREAK"`를 강제하여 136개 요소에서 수직 충돌을 유발하고 있음.

---

## 7. 독립 감사관(Web Argon)에게 요청하는 핵심 기술 감사 질문

웹 Argon 모델은 위의 실측 증거와 코드를 바탕으로 다음 질문에 대한 기술적 평가와 권고사항을 제시해 주시기 바랍니다:

1. **줄바꿈 정책의 이원화 (Hybrid lineWrap)**:
   - DOCX의 `isMultiLineBox` (예: `estimatedLines >= 1.45 || hasHardNewline || (totalChars >= 80 && textAutoResize === "HEIGHT")`) 판별 로직을 HWPX 렌더러에 이식하여, 다중행 문단에는 `lineWrap="BREAK"`, 단일행 라벨/지표에는 `lineWrap="SQUEEZE"`를 적용하는 방식이 OWPML 규격상 최적의 해법인가?
2. **`SQUEEZE`와 가로 찌그러짐의 상충 관계**:
   - 단일행 라벨에 `SQUEEZE`를 적용할 때, 과거에 발생했던 "과도한 글자 압축(글자가 얇아지거나 찌그러짐)" 부작용을 방지하기 위해 최소 너비 보정(Auto-width / Min-width)이나 여백 보정이 병행되어야 하는가?
3. **Canonical JSON 계층의 책임 여부**:
   - Figma 원본에서 텍스트폭보다 좁게 잡힌 텍스트박스(`textAutoResize: "WIDTH_AND_HEIGHT"` 등)에 대해, FigmaCanvasParser가 `bounds.width`를 텍스트 런의 실제 측정 폭으로 능동 확장하는 것이 바람직한가, 아니면 렌더러의 `lineWrap` 정책에 맡겨야 하는가?
4. **자동화 테스트의 시각적 검증 맹점 극복 방안**:
   - 정적 XML 검증에 머물고 있는 현재의 Vitest 테스트 스위트에, `inspect_geometry_details.ts`와 같은 `TextCollisionDetector` 기반의 물리적 기하학 충돌 검증 가드를 공식 추가하는 방안에 대한 평가.

---

## 8. 감사 증거 파일 참조 목록 (Repository File Map)

- **HWPX 렌더러**: [`src/canvas/renderer/hwpxCanvasRenderer.ts`](file:///c:/Users/77/Documents/Figma2Word/src/canvas/renderer/hwpxCanvasRenderer.ts)
- **DOCX 렌더러**: [`src/canvas/renderer/docxCanvasRenderer.ts`](file:///c:/Users/77/Documents/Figma2Word/src/canvas/renderer/docxCanvasRenderer.ts)
- **Figma 파서**: [`src/canvas/parser/figmaCanvasParser.ts`](file:///c:/Users/77/Documents/Figma2Word/src/canvas/parser/figmaCanvasParser.ts)
- **기하학 충돌 분석 스크립트**: [`scripts/inspect_geometry_details.ts`](file:///c:/Users/77/Documents/Figma2Word/scripts/inspect_geometry_details.ts)
- **정품 HWPX 레퍼런스**: `완성본-20261012/report-1차-진단-편집가능-최종보정.hwpx`
- **최신 생성 산출물**: `debug/hwpx-page-orientation-fix/stage7-portrait.hwpx` 및 `stage7-portrait.docx`
- **세부 감사 보고서 디렉터리**: `research/rea-document-engine/argon-independent-audit/` (01~07)
