# HWPX 페이지 방향 교정 및 회귀 방지 시스템 (Fix & Regression Guard)

**작성일**: 2026-10-18  
**모듈**: `src/canvas/renderer/hwpxCanvasRenderer.ts`  
**테스트 스위트**: `tests/page-orientation-fidelity.test.ts` 외 4개 파일  

---

## 1. 구현 코드 수정 내역 (Exact Code Diff)

### 1.1 `src/canvas/renderer/hwpxCanvasRenderer.ts`

```diff
@@ -399,9 +399,13 @@ export class HwpxCanvasRenderer {
       const pageWidthPt = page.bounds.width || doc.pageSize.widthPt || 595.28;
       const pageHeightPt = page.bounds.height || doc.pageSize.heightPt || 841.89;
       const isLandscape = pageWidthPt > pageHeightPt;
-      const landscapeAttr = isLandscape ? "WIDELY" : "NARROWLY";
-      const widthHwpu = Math.round(pageWidthPt * 100);
-      const heightHwpu = Math.round(pageHeightPt * 100);
+      // In KS X 6101 (OWPML): WIDELY = Portrait (세로), NARROWLY = Landscape (가로)
+      const landscapeAttr = isLandscape ? "NARROWLY" : "WIDELY";
+      // OWPML paper dimensions are strictly defined in portrait-base coordinates (width <= height)
+      const baseWidthPt = isLandscape ? Math.min(pageWidthPt, pageHeightPt) : pageWidthPt;
+      const baseHeightPt = isLandscape ? Math.max(pageWidthPt, pageHeightPt) : pageHeightPt;
+      const widthHwpu = Math.round(baseWidthPt * 100);
+      const heightHwpu = Math.round(baseHeightPt * 100);
```

### 1.2 `scripts/compare_hwpx_ast.py`

AST 감사 도구에 `<hp:pagePr>` 추출 및 방향 검증 로직을 신규 탑재하여, 향후 생성되는 모든 HWPX 문서의 페이지 방향 불일치를 자동으로 감지하도록 강화했습니다.

```python
# Audit pagePr (Page Orientation and Dimensions)
for pp in sroot.findall(".//{*}pagePr"):
    report["page_pr"].append({
        "landscape": pp.get("landscape"),
        "width": pp.get("width"),
        "height": pp.get("height"),
        "gutterType": pp.get("gutterType")
    })
```

---

## 2. 회귀 방지 테스트 체계 (Automated Regression Suite)

### 2.1 신규 전용 테스트: `tests/page-orientation-fidelity.test.ts`

- **Test 1**: A4 Portrait 문서에서 HWPX `landscape="WIDELY"`, DOCX `w:orient="portrait"` 검증.
- **Test 2**: A4 Landscape 문서에서 HWPX `landscape="NARROWLY"`, DOCX `w:orient="landscape"` 검증 (용지 폭/높이 종방향 기본좌표 유지).
- **Test 3**: 다중 페이지 혼합 방향(Mixed Orientation: Page 1 Portrait, Page 2 Landscape) 동적 전환 검증.
- **Test 4**: 실제 Stage 6 제안서 렌더링 시 세로 방향 일치성 검증.
- **Test 5**: 실제 Stage 7 대형 보고서 (9페이지) 렌더링 시 전 페이지 세로 방향 일치성 검증.
- **Test 6**: Phase 23~23.1의 타이포그래피 개선 사항(`lineWrap="BREAK"`, `BREAK_WORD`, `snapToGrid="0"`, `autoSpacing`, `fillBrush` 투명 처리)의 비회귀(보존) 검증.

### 2.2 레거시 테스트 교정 내역

이전 Phase에서 거꾸로 된 매핑을 기대하고 있던 4개의 과거 테스트 파일을 공식 KS X 6101 표준에 맞게 교정 완료함:
1. `tests/phase16-1-remediation.test.ts`: landscape 문서 검증 시 `landscape="NARROWLY"`로 교정.
2. `tests/phase16-h2-remediation.test.ts`: landscape 문서 검증 시 `landscape="NARROWLY"` 및 portrait-base 크기로 교정.
3. `tests/phase17-quality-integration.test.ts`: 혼합 방향 검증 시 P1=`WIDELY`, P2=`NARROWLY`로 교정.
4. `tests/phase18-architecture-fidelity.test.ts`: 라운드트립 검증 시 P1=`WIDELY`, P2=`NARROWLY`로 교정.

---

## 3. 타이포그래피 및 레이아웃 무결성 보존

이번 페이지 방향 수정 작업은 Phase 23 및 Phase 23.1에서 달성한 어떠한 텍스트 렌더링 개선 사항도 롤백하지 않고 100% 보존했습니다:
- `<hh:lineWrap breakLatinWord="KEEP_WORD" breakNonLatinWord="BREAK_WORD"/>` 유지
- `lineWrap="BREAK"` 유지
- `snapToGrid="0"` 유지
- `<hh:autoSpacing eAsianEng="0" eAsianNum="0"/>` 유지
- 텍스트박스 내부 `textMargin` 0 유지 (불필요한 인위적 여백 차단)
- 투명 카드용 `<hc:fillBrush/>` (공백 브러시) 보존

