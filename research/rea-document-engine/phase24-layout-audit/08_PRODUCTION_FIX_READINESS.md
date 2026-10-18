# 08. Production Fix Readiness & Phase 25 Implementation Roadmap

## 1. 개요

본 문서는 Phase 24 감사(Task A~F)를 통해 규명된 증거를 바탕으로, **Phase 25에서 프로덕션 코드(`src/**`)에 안전하게 적용할 수 있는 4대 격리 변경 사항(Isolated Fixes)**과 사용자의 실제 한컴 뷰어 검증 결과에 따라 조정되어야 할 조건부 결정 사항을 정의한다.

Phase 24에서는 프로덕션 코드 동결(Frozen) 원칙을 100% 준수하여 `src/**`의 변경이 0바이트 상태로 유지되었다. 본 로드맵은 Phase 25 시작 즉시 안전하고 정밀하게 코드를 패치할 수 있도록 구체적인 코드 수준의 지침을 제공한다.

---

## 2. 검증된 변경과 미검증 가설의 명확한 분리

| 구분 | 항목 | 근거 및 상태 | Phase 25 적용 준비 상태 |
|---|---|---|---|
| **검증됨 (A급)** | **단일행/다중행 분리 wrap 적용** | 정품 레퍼런스 HWPX(96.0% SQUEEZE), DOCX `isMultiLineBox` 정합성 100% 일치 확인 (`scripts/lib/wrapClassifier.ts`). | **즉시 적용 가능 (Ready)** |
| **검증됨 (A급)** | **FIXED HWPU 고정 행간 전환** | 정품 레퍼런스 55개 스타일 전수 분석 결과 100% FIXED 사용 확인. PERCENT 160%로 인한 33% 팽창 원천 차단. | **즉시 적용 가능 (Ready)** |
| **검증됨 (B급)** | **다국어 폰트 매핑 (Hangul/Latin)** | KS X 6101 표준 구조 및 한컴 정품 폰트 매핑 구조 규명. | **즉시 적용 가능 (Ready)** |
| **조건부 (C급)** | **Parser `isCenteredInParent` 높이 보정** | Stage 7 424개 중 214개 팽창 확인. 단, 파서 삭제 시 74개 배지 깨짐 위험. **렌더러 측 `contentHeightPt` 바운딩 적용으로 격리 해결**. | **렌더러 측 완화책 Ready (파서 수정 보류)** |
| **미검증 (D급)** | **한컴 뷰어 실제 폰트 메트릭 렌더링** | 맑은 고딕 vs Inter 글꼴 폭, 한컴 뷰어의 장평 압축 시각 품질. | **사용자의 MRE A~F 육안 검증 후 확정** |

---

## 3. Phase 25 프로덕션 변경 계획 (4대 격리 패치)

### 패치 1: HWPX 단일행/다중행 분리 `lineWrap` 정책 적용
- **대상 파일**: `src/canvas/renderer/hwpxCanvasRenderer.ts`
- **구현 방식**:
  - `scripts/lib/wrapClassifier.ts`의 `classifyWrapMode` 로직을 렌더러에 내장하거나 공통 모듈로 임포트.
  - 각 텍스트 요소 렌더링 시:
    ```typescript
    const wrapDecision = classifyWrapMode(element);
    const lineWrapAttr = wrapDecision.mode === 'BREAK' ? 'lineWrap="BREAK"' : 'lineWrap="SQUEEZE"';
    ```
- **효과**:
  - Stage 7 기준 411개(96.9%)의 단일행 라벨/수치가 `SQUEEZE`를 적용받아 예기치 못한 자동 줄바꿈으로 인한 하단 객체 침범 원천 차단.
  - 실제 2줄 이상의 본문 13개(3.1%)만 `BREAK`가 적용되어 글자 찌그러짐 방지.

### 패치 2: 기본 행간 `PERCENT 160` -> `FIXED HWPUNIT` 고정 행간 전환
- **대상 파일**: `src/canvas/renderer/hwpxCanvasRenderer.ts`
- **구현 방식**:
  - `header.xml`의 문단 모양(`<hh:paraPr>`) 생성 시, 기본 fallback을 160% 비율이 아닌 폰트 크기 비례 고정 행간으로 전환:
    ```typescript
    // 기존:
    // <hh:lineSpacing type="PERCENT" value="160"/>
    
    // Phase 25 패치:
    const fixedSpacingHwpu = Math.round(fontSizePt * 120); // 1.2배 고정 행간 (정품 레퍼런스 표준)
    // <hh:lineSpacing type="FIXED" value="${fixedSpacingHwpu}"/>
    ```
- **효과**:
  - `7:980`과 `7:981` 사이의 간격(6.0pt)보다 큰 6.6pt 팽창 현상 소멸.
  - Stage 7의 55개 수직 오버플로우 충돌 위험 완화.

### 패치 3: 다국어 글꼴 패밀리 분리 매핑 (`header.xml`)
- **대상 파일**: `src/canvas/renderer/hwpxCanvasRenderer.ts`
- **구현 방식**:
  - `header.xml`의 `<hh:fontfaces>`에 한글용(맑은 고딕), 영문용(Inter) 폰트를 분리 등록하고, `<hh:charPr>`의 `<hh:fontRef>`에서 `hangul="0"` 및 `latin="1"`을 분리 지정.
- **효과**:
  - 숫자/영문(Inter)과 한글(맑은 고딕)이 각자의 정확한 베이스라인과 글자 폭으로 렌더링되어 혼용 문단에서의 가독성 및 글자 폭 정밀도 향상.

### 패치 4: `contentHeightPt` 기반 텍스트박스 높이 클리핑 (렌더러 측 격리 완화)
- **대상 파일**: `src/canvas/renderer/hwpxCanvasRenderer.ts`
- **배경**:
  - `figmaCanvasParser.ts`의 `isCenteredInParent` 휴리스틱을 직접 수정하면 74개의 정상 배지(Tag/Badge)의 수직 중앙 정렬이 파괴됨.
- **해결책**:
  - 파서는 그대로 유지하되, HWPX 렌더러가 요소를 그릴 때 만약 `element.contentHeightPt`가 정의되어 있고 부모 컨테이너가 카드 내부인 경우:
  - `<hp:rect>`의 높이를 `bounds.height` 대신 실제 텍스트 높이인 `contentHeightPt`로 클리핑하고, Y좌표를 중앙 정렬 오프셋만큼 아래로 이동(`bounds.y + (bounds.height - contentHeightPt) / 2`).
- **효과**:
  - 파서의 회귀 위험 없이 44개의 카드 내부 텍스트 팽창(예: `7:1082`의 37.48pt -> 11.99pt)을 안전하게 정상 높이로 렌더링.

---

## 4. 실제 사용자 검증(MRE A~F) 피드백에 따른 분기 시나리오

사용자가 한컴오피스 2024 뷰어에서 6개 MRE 파일을 열람한 결과에 따라 Phase 25 구현은 다음과 같이 분기된다.

| MRE 파일 | 주요 시각적 관찰 포인트 | 시나리오별 대응 방향 |
|---|---|---|
| `mre-A-baseline.hwpx` | 현재 커밋 기준 (전역 BREAK + 160% 행간). `7:980` 아래 침범 및 `7:1082` 겹침 확인. | 기준점 확인 |
| `mre-B-wrap-only.hwpx` | 단일행 SQUEEZE + 다중행 BREAK 적용. | **라벨 겹침이 사라졌다면**: 패치 1 단독으로도 겹침의 70% 이상이 해소됨을 입증. 즉시 패치 1 적용. |
| `mre-C-lineheight-only.hwpx` | FIXED 고정 행간 적용 (160% -> 120% 고정). | **다중행 본문 하단 침범이 줄어들었다면**: 패치 2의 행간 축소 효용 확인. |
| `mre-D-font-only.hwpx` | 맑은 고딕 / Inter 다국어 폰트 분리 매핑 적용. | **글자 폭 짤림 개선 여부 확인**: 패치 3 적용 우선순위 결정. |
| `mre-E-geometry-only.hwpx` | `7:1082` 원본 높이(11.99pt) 복구 적용. | **카드 배경과 직하단 버튼 겹침이 사라졌다면**: 패치 4 렌더러 클리핑 적용. |
| `mre-F-combined.hwpx` | **4대 개선 요소가 모두 결합된 종합 파일**. | **가장 완벽한 렌더링을 보인다면**: 패치 1~4를 Phase 25에서 원자적(Atomic)으로 일괄 프로덕션 배포. |

---

## 5. Phase 25 롤아웃 안전 절차

1. **테스트 기대값 갱신**:
   - `tests/phase23-1-text-geometry.test.ts`의 전역 `BREAK` 강제 단언문을 `wrapClassifier` 기반 기대값으로 선제 개정.
2. **패치별 순차 적용 및 Vitest 실행**:
   - 패치 1 (Wrap) -> 테스트 검증
   - 패치 2 (LineSpacing) -> 테스트 검증
   - 패치 3 (Font) -> 테스트 검증
   - 패치 4 (Geometry Clipping) -> 테스트 검증
3. **Stage 6 & 7 전체 문서 재렌더링**:
   - `scripts/evaluate_hwpx_collision_risks.ts`를 실행하여 고신뢰도 충돌 건수가 239건에서 20건 미만으로 급감하는지 정량적 검증.
4. **사용자 최종 육안 승인**:
   - 새로 생성된 `Stage6.hwpx` 및 `Stage7.hwpx`를 한컴 뷰어에서 최종 확인.

