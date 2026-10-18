# 과거 수정 시도 실패 분석 및 한계 보고서 (Autopsy of Past Attempts & Technical Limitations)

**문서 분류**: 독립 기술 감사(Independent Technical Audit) 자료 06  
**분석 대상**: Phase 22, Phase 23, Phase 23.1 및 Page Orientation 수정 이력  

---

## 1. 실패의 악순환 요약 (The Cascade of Regressions)

```text
[초기 상태 (Phase 22 이전)]
  한컴 2024 뷰어가 아예 열리지 않음 (XML 스키마/패키지 오류)
        │
        ▼ (Phase 22 패치)
  문서는 열렸으나, 글자가 가로로 심하게 찌그러짐 (SQUEEZE 부작용)
        │
        ▼ (Phase 23 패치: 일괄 BREAK 적용)
  글자 찌그러짐은 풀렸으나, 136개 라벨이 2줄로 꺾여 아래 요소를 대거 덮어씀 (수직 충돌)
        │
        ▼ (Phase 23.1 패치: 타이포그래피 미세 조정)
  snapToGrid=0, autoSpacing=0 등을 조정했으나, 원본 폭 부족으로 여전히 2줄 개행 지속
        │
        ▼ (Page Orientation 패치)
  페이지 방향이 가로에서 세로로 복구되었으나, 6pt 간격의 국소 충돌은 그대로 존속
```

---

## 2. 각 시도별 기술적 부검 (Technical Autopsy)

### 2.1 Phase 22: 뷰어 호환성 복구
- **시도 내용**: OWPML 네임스페이스 정규화, 필수 XML 매니페스트 파일 복구.
- **성공 요인**: 한컴 뷰어가 HWPX 패키지를 파싱하고 렌더링을 시작함.
- **남겨진 한계**: 당시 모든 텍스트박스에 `lineWrap="SQUEEZE"`가 적용되어 있었는데, 폭이 좁은 박스에서 글자가 심하게 찌그러지는 시각적 결함이 노출됨.

---

### 2.2 Phase 23: 전면 `lineWrap="BREAK"` 일괄 적용
- **시도 내용**: "글자가 압축되는 원인은 `SQUEEZE` 때문이다"라는 단순 관찰에 기반하여, `hwpxCanvasRenderer.ts`에서 줄바꿈 속성을 `lineWrap="BREAK"`로 일괄 치환함.
- **치명적 부작용**:
  1. 단일행으로 설계된 좁은 라벨(예: 폭 54pt의 `균열밀도 (CDI)`)까지 전부 2줄로 쪼개짐.
  2. 사각형의 높이가 고정(9.7pt)되어 있어 2줄로 늘어난 글자가 사각형 바닥을 뚫고 쏟아져 나옴.
  3. 바로 아래 6pt 간격으로 배치된 숫자나 카드 위로 글자가 직접 겹쳐 인쇄됨.
- **교훈**: **`BREAK`는 장문 본문 문단에는 약(藥)이지만, 고정 크기 라벨과 칩에는 독(毒)**이었음.

---

### 2.3 Phase 23.1: 타이포그래피 파라미터 미세 조정
- **시도 내용**: 
  - `snapToGrid="0"` (원고지 격자 비스냅)
  - `breakSetting breakLatinWord="KEEP_WORD" breakNonLatinWord="BREAK_WORD"` (글자 단위 줄바꿈)
  - `autoSpacing eAsianEng="0" eAsianNum="0"` (자동 간격 팽창 차단)
  - `textMargin` 좌우 0 설정 (내부 패딩 제거)
  - CJK 문자 폭 추정치 조정
- **실패 원인**:
  - `snapToGrid`나 `autoSpacing`을 꺼서 문자 간격을 0.5~1pt 줄이더라도, 원본 Figma 텍스트박스 폭(`53.98 pt`)과 단일행 필요 폭(`59.8 pt`) 사이에는 **약 6pt의 근본적인 폭 부족(Deficit)**이 존재했습니다.
  - 마진과 격자를 아무리 최적화해도 물리적으로 53.98pt 안에 59.8pt의 글자가 1줄로 들어갈 수는 없습니다.
  - `lineWrap="BREAK"`가 유지되는 한, 한컴 뷰어는 단 0.1pt라도 넘치면 가차 없이 2줄로 꺾어버리므로 충돌을 막을 수 없었습니다.

---

### 2.4 Page Orientation 긴급 수정 (커밋 `5ecc067`)
- **시도 내용**: KS X 6101 표준에 따라 세로(WIDELY), 가로(NARROWLY) 매핑을 정상화함.
- **효과**: 가로 뷰포트로 인해 세로 가용 높이가 595pt로 잘려 페이지 전체가 밀리던 매크로 기하학(Macro Geometry) 문제는 완벽히 해결됨.
- **한계**: 페이지 전체 높이는 842pt로 복구되었으나, Page 1 내부의 국소적 요소들(예: y=457pt 라벨과 y=473pt 수치 사이의 6pt 간격)은 상대적 좌표가 그대로이므로, 2줄 개행에 의한 국소 마이크로 충돌(Micro Collision)은 전혀 변하지 않고 그대로 남았습니다.

---

## 3. 구조적 한계와 근본 교훈 (Structural Limitations)

1. **테스트 주도 착시 (Test-Driven Illusion)**:
   - Vitest 단위 테스트는 OWPML XML의 정적 문자열 포함 여부(`toContain`)만 확인할 뿐, 한컴오피스 텍스트 레이아웃 엔진이 실제로 글자를 몇 줄로 개행하고 어떤 좌표에 렌더링하는지 시뮬레이션할 수 없습니다.
   - 따라서 376개 테스트가 모두 통과하더라도 시각적 겹침은 그대로 존재할 수 있습니다.
2. **이진법적 사고의 실패 (All-or-Nothing Fallacy)**:
   - "SQUEEZE가 문제니까 전부 BREAK로 바꾸자"는 극단적 접근이 새로운 대규모 결함을 낳았습니다.
   - DOCX 렌더러가 `mso-wrap-style:none`과 `square`를 정교하게 선별하듯이, 정품 HWPX도 96%의 `SQUEEZE`와 4%의 `BREAK`를 혼합 사용하는 하이브리드 아키텍처를 취하고 있습니다.

