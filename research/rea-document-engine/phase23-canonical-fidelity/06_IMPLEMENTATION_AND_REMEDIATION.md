# Phase 23: Implementation & Remediation Details

## 1. 구현 파일 변경 요약

### 1.1 `src/canvas/renderer/hwpxCanvasRenderer.ts`
1. **투명 배경 브러시 정류화 (Self-closing `<hc:fillBrush/>`)**:
   - `renderElement`, `renderPolygonXml`, `renderRectXml` 내에서 배경색이 없는 요소에 대해 `<hc:fillBrush/>`를 방출하도록 변경.
   - 기존의 `<hc:winBrush faceColor="none" hatchColor="#999999" alpha="0"/>` 잔상 제거.
2. **`lineWrap="BREAK"` 적용**:
   - `<hp:subList>` 요소의 줄바꿈 방식을 `SQUEEZE`에서 `BREAK`로 변경하여 글자 수평 겹침 방지.
3. **수직 정렬 및 여백 정밀화**:
   - `vertAlignAttr === "CENTER"` 적용 시 `defaultPadT`를 0으로 처리하여 기하학적 수직 중앙 일치 보장.

### 1.2 `scripts/generate_phase23_deliverables.ts`
- Phase 23 표준 산출물 생성 스크립트 작성.
- Stage 1~7 및 베이스라인/분리 진단 파일 12종을 `debug/hwpx-phase23/` 및 `debug/cross-format-phase23/`에 동시 생성.
- `debug/hwpx-recovery/`에 최신 빌드 동기화 완료.

### 1.3 `scripts/run_cross_format_harness.ts`
- Canonical JSON 기반 DOCX 및 HWPX 병렬 생성 및 무결성/내용 검증 자동화 하네스 구축.
