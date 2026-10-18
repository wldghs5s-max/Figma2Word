# 시각적 검증 및 사용자/Argon 독립 검토 인수인계서 (Visual Verification Handoff)

**작성일**: 2026-10-18  
**산출물 디렉터리**: `debug/hwpx-page-orientation-fix/`  
**검증 도구**: 한컴오피스 2024 뷰어 / Microsoft Word  

---

## 1. 생성된 검증 산출물 목록

| 번호 | 파일명 | 형식 | 방향 | 주요 검증 목적 |
| :--- | :--- | :--- | :--- | :--- |
| 1 | `stage6-portrait.hwpx` | HWPX | 세로 (Portrait) | 제안서 실문서 한글 뷰어 세로 열람 및 수직 레이아웃 복구 확인 |
| 2 | `stage6-portrait.docx` | DOCX | 세로 (Portrait) | 동일 Canonical IR 기반 DOCX와의 1:1 시각적 일치 확인 |
| 3 | `stage7-portrait.hwpx` | HWPX | 세로 (Portrait, 9pp) | 9페이지 고객 종합 보고서 전 페이지 세로 열람 및 하단 요소 복구 확인 |
| 4 | `stage7-portrait.docx` | DOCX | 세로 (Portrait, 9pp) | 9페이지 고객 종합 보고서 DOCX 상호 운용성 확인 |
| 5 | `diag-a4-portrait.hwpx` | HWPX | 세로 (Portrait) | 파란색 외곽 프레임과 수직 841.89pt 영역 및 하단 푸터 정상 안착 확인 |
| 6 | `diag-a4-portrait.docx` | DOCX | 세로 (Portrait) | A4 세로 진단 문서의 워드 렌더링 대조 확인 |
| 7 | `diag-a4-landscape.hwpx` | HWPX | 가로 (Landscape) | 초록색 외곽 프레임과 가로 841.89pt 영역의 3단 컬럼 정상 안착 확인 |
| 8 | `diag-a4-landscape.docx` | DOCX | 가로 (Landscape) | A4 가로 진단 문서의 워드 렌더링 대조 확인 |
| 9 | `page-geometry-comparison.json` | JSON | - | 4대 포맷(Figma, Canvas IR, HWPX, DOCX)의 정량 감사 데이터 |
| 10 | `README.md` | MD | - | 산출물 디렉터리 안내 및 체크리스트 |

---

## 2. 한컴오피스 2024 뷰어 육안 점검 절차 (Step-by-Step Checklist)

### 단계 1: 진단 문서 방향 검증
1. `debug/hwpx-page-orientation-fix/diag-a4-portrait.hwpx`를 한컴 뷰어로 엽니다.
   - [ ] 문서가 화면에 세로(A4 세로)로 표시되는가?
   - [ ] 파란색 테두리 사각형이 세로 용지 전체를 온전히 둘러싸고 있는가?
   - [ ] 최하단 푸터("Page 1 of 1 — A4 Portrait")가 잘리지 않고 맨 아래에 선명하게 보이는가?
2. `debug/hwpx-page-orientation-fix/diag-a4-landscape.hwpx`를 한컴 뷰어로 엽니다.
   - [ ] 문서가 화면에 넓은 가로(A4 가로)로 표시되는가?
   - [ ] 좌측, 중앙, 우측 3개의 카드가 가로 841pt 폭에 나란히 배치되는가?

### 단계 2: Stage 6 실전 제안서 검증
1. `debug/hwpx-page-orientation-fix/stage6-portrait.hwpx`를 한컴 뷰어로 엽니다.
   - [ ] 문서가 세로형으로 정상 열리는가?
   - [ ] `stage6-portrait.docx`와 나란히 놓았을 때 페이지 종횡비와 여백이 동일하게 유지되는가?
   - [ ] 기존 가로 모드에서 595pt 아래로 밀려 잘렸던 하단 요소들이 한 페이지 내에 안착하는가?

### 단계 3: Stage 7 종합 보고서 (9페이지) 검증
1. `debug/hwpx-page-orientation-fix/stage7-portrait.hwpx`를 한컴 뷰어로 엽니다.
   - [ ] 1페이지부터 9페이지까지 모든 페이지가 일관되게 세로형으로 표시되는가?
   - [ ] 텍스트 겹침 현상이 Phase 23.1 대비 개선되고 본문의 수직 공간이 확보되었는가?
   - [ ] 도넛 차트(Page 4), KPI 요약 블록, 푸터 번호가 올바른 수직 위치에 렌더링되는가?

---

## 3. 웹 Argon 독립 검토자를 위한 검증 안내 (For Independent Argon Reviewer)

독립 검토자는 터미널에서 다음 명령을 실행하여 모든 근거를 즉시 재현할 수 있습니다:

1. **정적 타입 및 단위 테스트 전체 통과 확인**:
   ```bash
   npx tsc --noEmit
   npx vitest run tests/page-orientation-fidelity.test.ts
   ```
2. **AST Ground-Truth 비교 도구 실행**:
   ```bash
   python scripts/compare_hwpx_ast.py debug/hwpx-page-orientation-fix/stage7-portrait.hwpx
   ```
   - 출력 확인: `Target Page 1: Portrait | landscape=WIDELY width=59528 height=84189`
   - OWPML 규격 위반(SPEC_VIOLATION): `0 violations detected`
3. **정량 기하학 비교 JSON 감사**:
   - `debug/hwpx-page-orientation-fix/page-geometry-comparison.json` 내 `orientationMatches: true` 확인.

