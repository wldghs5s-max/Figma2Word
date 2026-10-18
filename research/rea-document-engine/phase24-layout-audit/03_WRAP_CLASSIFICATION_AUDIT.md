# 03. Wrap Classification Audit: Unified Single-Line vs Multi-Line Policy

## 1. 개요 및 연구 목적

기존 DOCX 렌더러와 HWPX 렌더러는 줄바꿈 정책에서 완전히 단절된 채 동작하고 있었습니다.
- **DOCX 렌더러**: `isMultiLineBox` 휴리스틱을 통해 96.9%를 단일행(`wrap: none`)으로 묶고, 3.1%만 다중행(`wrap: square`)으로 처리.
- **HWPX 렌더러**: Phase 23에서 글자 겹침을 방지한다는 명목으로 전역 100% `lineWrap="BREAK"`를 강제 적용.

이로 인해 Figma에서 동일한 좌표와 텍스트를 파싱했음에도, DOCX는 세로형에 단일행 라벨이 온전히 보존된 반면, HWPX는 라벨들이 2행으로 쪼개지며 직하단 객체를 연쇄 파괴하는 구조적 불일치가 발생했습니다.

---

## 2. DOCX `isMultiLineBox` 분류 수식 심층 감사

DOCX 렌더러(`docxCanvasRenderer.ts:303-316`)의 분류 로직:

```typescript
const isAutoWidth = el.textAutoResize === "WIDTH_AND_HEIGHT";
let isMultiLineBox = false;

if (!isAutoWidth && el.textRuns && el.textRuns.length > 0) {
  const hasHardNewline = el.textRuns.some((r) => r.text && /[\r\n]/.test(r.text));
  const maxFontSize = Math.max(...el.textRuns.map((r) => r.fontSizePt || 12));
  const firstLineHeight =
    el.textRuns.find((r) => r.lineHeightPt)?.lineHeightPt || maxFontSize * 1.25;
  const evalHeight = el.contentHeightPt || el.bounds.height;
  const estimatedLines = evalHeight / firstLineHeight;
  const totalChars = el.textRuns.reduce((sum, r) => sum + (r.text?.length || 0), 0);

  isMultiLineBox =
    estimatedLines >= 1.45 ||
    hasHardNewline ||
    (totalChars >= 80 && el.textAutoResize === "HEIGHT");
}
```

### 핵심 관찰 및 유효성 검증:
1. **`isAutoWidth` 가드**:
   - `textAutoResize === "WIDTH_AND_HEIGHT"`인 요소는 내용에 맞추어 박스 폭이 결정된 단일 라벨이므로, 절대 다중행으로 분류하지 않음.
   - Stage 7의 `7:980`("균열밀도 (CDI)")과 `7:981`("0.031%")은 모두 `WIDTH_AND_HEIGHT`이므로 DOCX에서는 `isMultiLineBox = false`로 분류됨.
2. **`contentHeightPt` 우선 참조 (`evalHeight`)**:
   - `7:1082` 배너처럼 부모 프레임에 의해 `bounds.height`가 37.48pt로 팽창되었더라도, 파서가 기록한 `contentHeightPt`(11.99pt)를 우선 참조하므로 `11.99 / 12.18 = 0.98 lines`로 산출되어 다중행으로 잘못 분류되는 것을 완벽히 방어함.
3. **명시적 개행 (`hasHardNewline`)**:
   - 텍스트 내 `\n`이 존재하면 박스 비율과 무관하게 무조건 다중행으로 분류.

---

## 3. Stage 6 및 Stage 7 전수 분류 결과

`scripts/audit_wrap_classification.ts`를 통해 Stage 6과 Stage 7의 모든 텍스트 객체를 전수 분류한 결과입니다.

| 데이터셋 | 전체 텍스트 수 | 단일행 (SQUEEZE 권장) | 다중행 (BREAK 권장) | 단일행 비율 (%) |
|---|---|---|---|---|
| **Stage 6 (제안서)** | 5개 | 4개 | 1개 (`1:40` 요약 본문) | **80.0%** |
| **Stage 7 (고객 보고서 9P)** | 424개 | 411개 | 13개 (장문 문단) | **96.9%** |
| **정품 레퍼런스 HWPX** | 429개 | 412개 | 17개 (장문 문단) | **96.0%** |

> **분류 정합도 분석**:
> 우리 수학적 분류기가 도출한 Stage 7의 단일행 비율(**96.9%**)은 상용 정품 HWPX의 실제 `SQUEEZE` 비율(**96.0%**)과 **0.9%p 차이로 사실상 완벽하게 수렴**합니다.

---

## 4. Stage 7에서 분류된 다중행 객체 13종 전수 목록

다음 13개 객체만이 HWPX에서 `lineWrap="BREAK"`를 적용받아야 하는 진정한 다중행 단락입니다.

1. `7:998` ("전반적인 외벽 균열 상태는 안전 범주에 있습니다...") — 70자, 2.05행
2. `7:381` ("주의: 본 균열 폭 측정 결과는 GSD...") — 112자, 2.00행
3. `7:527` ("정규화 합산 결과 109동 > 108동 > 102동 순...") — 103자, 2.00행
4. `7:540` ("드론 고해상도 이미지 스캔 데이터를 정규 격자망으로...") — 122자, 2.00행
5. `7:868` ("해운대동신아파트(해동신) 1차 외벽 균열 진단 결과...") — 338자, 5.05행 (종합 총평)
6. `7:1049` ("AIREKA Custom RTK Drone (61MP) 상세...") — 다중 런 문단
7. `7:1054` ("2026.03.10 ~ 2026.03.14 진단 프로세스 요약...") — 다중 런 문단
8. `7:1059` ("AIREKA Wall-AI v4.2 Deep Crack 신경망 모델...") — 다중 런 문단
9. `7:1074` ("순외벽 면적 36,910㎡ 상세 집계...") — 다중 런 문단
10. `7:1095` ("CDI (Crack Density Index) 산출식 및 보정 계수...") — 85자
11. `7:1145` ("■ 동별 외벽 진단 상세 목록 안내 문단...") — 2행
12. `7:1312` ("균열 분포 지도 범례 및 심도별 판정 기준...") — 95자
13. `7:1405` ("차수별 보수 권고 일정 및 우선순위 매핑...") — 110자

---

## 5. 결론 및 공통화 제안

- HWPX 렌더러에 독립형 분류 모듈(`scripts/lib/wrapClassifier.ts`)을 공통 적용할 준비가 완료되었습니다.
- 단일행(96.9%)에 `SQUEEZE`를 적용하고, 상기 13개 다중행(3.1%)에만 `BREAK`를 적용하면, DOCX와 HWPX가 **완벽히 동일한 의미론적 레이아웃 엔진**을 공유하게 됩니다.

