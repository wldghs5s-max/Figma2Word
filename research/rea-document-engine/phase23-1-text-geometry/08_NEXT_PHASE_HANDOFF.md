# Phase 23.1 Next Phase Handoff & Architecture Recommendations

## 1. 현재 도달 상태
- **Git Commit**: `fix(canvas): phase23.1 canonical text geometry and overflow recovery`
- **테스트**: 58개 테스트 파일, 370개 테스트 통과 (100%), TypeScript 0 errors.
- **산출물**:
  - `debug/hwpx-phase23-1/`:
    - `stage6-representative-report.hwpx` / `.docx`
    - `stage7-full-report.hwpx` / `.docx`
    - `diag-narrow-textbox.hwpx` / `.docx`
    - `diag-multiline-text.hwpx` / `.docx`
    - `diag-textbox-margin.hwpx` / `.docx`
    - `diag-adjacent-text.hwpx` / `.docx`
    - `README.md`
  - `research/rea-document-engine/phase23-1-text-geometry/`:
    - 보고서 01~08
    - `PHASE23_1_ARGON_REINGEST.txt`

---

## 2. 해결된 결함 목록
1. **텍스트박스 우측 조기 개행 및 여백 낭비 해소**:
   - `hh:paraPr`에 `<hh:breakSetting breakLatinWord="KEEP_WORD" breakNonLatinWord="BREAK_WORD" lineWrap="BREAK"/>` 표준 도입.
   - 한글 단어가 행 끝까지 꽉 차게 배치되어 불필요한 행 추가 발생 차단.
2. **원고지 격자 자간 팽창 해소**:
   - `hh:paraPr`의 `snapToGrid="1"`을 정품 레퍼런스 표준인 `snapToGrid="0"`으로 전면 교정.
3. **한영/숫자 간 불필요한 자동 간격 팽창 차단**:
   - `<hh:autoSpacing eAsianEng="0" eAsianNum="0"/>` 표준 도입.
4. **텍스트박스 내부 여백 인위적 축소 제거**:
   - `hp:textMargin`의 좌우 기본값을 정품 레퍼런스와 동일하게 `0`으로 유지.
5. **Auto-Layout 세로 스택의 한글 줄 수 추정 정밀화**:
   - `synthesizeMissingChildBounds`에서 CJK(1.0em)와 Latin(0.55em)을 구분하여 정격 높이 합성.
6. **Stage 6 Executive Summary 문단 충돌 완전 해소**:
   - 3줄 정격 배치로 하단 소제목과의 간격 21.0pt 완전 확보.

---

## 3. 남은 원본 데이터 과제 및 차기 권장 사항
1. **Figma 디자인 원본의 Source Geometry Conflict 안내**:
   - Stage 7 P8/P9의 `7:952` 등은 Figma 디자이너가 82자 한글 문장에 영어 폰트(Manrope 1줄 17px)만 할당하여 발생한 원본 데이터 한계임.
   - 엔진 수준에서는 절대 좌표 왜곡 없이 충실히 렌더링하며, `TextCollisionDetector`로 진단 리포트를 제공함.
   - 향후 UI/Web 인터페이스에서 Figma 디자이너에게 "텍스트 오버플로우 경고"를 가이드하는 기능 검토 권장.
2. **한컴 뷰어 실측 피드백 수렴**:
   - 사용자가 제공된 `debug/hwpx-phase23-1/`의 파일들을 한컴오피스 2024 뷰어에서 직접 열람하여 최종 시각적 만족도를 확인함.
