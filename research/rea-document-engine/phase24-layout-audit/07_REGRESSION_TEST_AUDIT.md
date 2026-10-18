# 07. Regression Test Suite & Verification Audit

## 1. 개요 및 목적

본 문서는 Phase 24 Task F에서 구축된 레이아웃 엔진 정합성 회귀 테스트 스위트(`tests/phase24-hwpx-layout-audit.test.ts`)의 설계, 검증 항목, 통과 내역과 기존 테스트 스위트에 잠재되어 있던 **순환 검증(Circular Assertion)** 위험을 식별하고 문서화한다.

Figma2Word 프로젝트의 핵심 원칙 중 하나는 **"자동 테스트 통과를 실제 시각적 결함 해결의 증거로 사용하지 않는다"**는 점이다. 단위 및 통합 테스트는 XML 스키마 적합성, ZIP 압축 구조, 객체 ID 참조 무결성, 불변 기하학 전이 등을 엄격히 검증할 수 있으나, 한컴오피스 2024 뷰어의 CJK 래스터라이징 엔진, 윈도우 GDI/DirectWrite 글꼴 메트릭 차이, 실제 화면상의 시각적 중첩 여부는 검증할 수 없다.

---

## 2. Phase 24 신규 회귀 테스트 스위트 구조

- **테스트 파일**: `tests/phase24-hwpx-layout-audit.test.ts`
- **테스트 실행기**: Vitest v3.2.4
- **실행 시간**: 220ms
- **결과**: 11 passed (100% 통과)

```
✓ tests/phase24-hwpx-layout-audit.test.ts (11 tests) 220ms
  ✓ Phase 24: HWPX Layout Engine Integrity & Audit Suite (11)
    ✓ 1. HWPX ZIP and XML package structure integrity (KS X 6101)
    ✓ 2. paraPrIDRef reference integrity in section XML
    ✓ 3. charPrIDRef reference integrity in section XML
    ✓ 4. fontRef multilingual reference validity
    ✓ 5. Text content preservation across Canonical IR and HWPX
    ✓ 6. Coordinate and geometry preservation between IR and HWPX
    ✓ 7. Wrap classification logic verification (DOCX vs Standalone)
    ✓ 8. Line spacing conversion accuracy (Pt -> HWPU)
    ✓ 9. Parser geometry inflation tracking and contentHeightPt preservation
    ✓ 10. Multi-factor collision risk report reproducibility
    ✓ 11. Circular test assertion audit (identifies legacy circular assertions)
```

---

## 3. 세부 검증 항목별 감사 내용

### Test 1: HWPX ZIP 및 XML 패키지 구조 무결성 (KS X 6101)
- **검증 내용**: 생성된 HWPX 파일이 유효한 ZIP 아카이브이며, KS X 6101 표준에 정의된 필수 엔트리(`mimetype`, `Contents/header.xml`, `Contents/section0.xml`, `META-INF/manifest.xml`)를 결함 없이 포함하고 있는지 검증.
- **검증 대상**: `debug/hwpx-overlap-mre/mre-A-baseline.hwpx`

### Test 2: `paraPrIDRef` 참조 무결성 (Dangling Reference 방지)
- **검증 내용**: `section0.xml` 내부의 모든 `<hp:p>` 및 `<hp:paraPr>`에 지정된 `paraPrIDRef`가 `header.xml`의 `<hh:paraProperties>` 목록(`id` 0 ~ 54 등)에 실제로 존재하는지 전수 매핑 검증.
- **결과**: 0건의 Dangling Reference. 한컴 뷰어가 문단을 렌더링할 때 잘못된 ID 참조로 인해 기본값으로 Fallback되거나 크래시되는 현상 원천 차단.

### Test 3: `charPrIDRef` 참조 무결성
- **검증 내용**: 문단 내 모든 `<hp:run>`의 `charPrIDRef`가 `header.xml`의 `<hh:charProperties>`에 등록된 유효한 ID인지 검증.
- **결과**: 100% 매핑 일치 확인.

### Test 4: `fontRef` 다국어 참조 유효성
- **검증 내용**: `charProperties` 내 각 언어별 폰트 참조(`hangul`, `latin`, `hanja`, `japanese`, `other`)가 `fontfaces`에 선언된 폰트 ID 범위 내에 있는지 검증.
- **결과**: 현재 프로덕션 코드는 단일 폰트 매핑(ID 0)만 사용하므로 dangling은 없으나, 다국어 분리 매핑이 결여되어 있음을 구조적으로 확인.

### Test 5: Canonical IR 텍스트 보존율 (Zero Content Loss)
- **검증 내용**: Stage 7 MRE 생성에 사용된 Canonical IR 텍스트와 HWPX 내부 `<hp:t>` 텍스트가 줄바꿈·공백·특수문자를 포함하여 100% 일치하는지 검증.
- **결과**: 단 1글자의 누락이나 변형 없이 보존됨.

### Test 6: 좌표 및 기하학 보존율 (Pt -> HWPU 불변성)
- **검증 내용**: Canonical IR의 `bounds.x`, `bounds.y`, `bounds.width`, `bounds.height` (Pt 단위)가 HWPX `<hp:rect>`의 `pt0`, `pt1`, `pt2`, `pt3` 및 `sz` (HWPUNIT 단위, 1pt = 100 HWPU)로 오차 ±1 HWPU 이내로 정확히 전이되는지 검증.
- **결과**: 좌표 변환 오차 0.

### Test 7: 단일행/다중행 분류 로직 정합성 (DOCX vs Standalone Classifier)
- **검증 내용**: Phase 24에서 개발된 `scripts/lib/wrapClassifier.ts`가 Stage 7 424개 텍스트 객체에 대해 DOCX 렌더러의 `isMultiLineBox` 판정과 100% 일치하는지 검증.
- **결과**: 단일행 411개(96.9%), 다중행 13개(3.1%)로 DOCX 로직 및 정품 레퍼런스(96.0%)와 오차 없이 일치.

### Test 8: 행간 변환 정밀도 (Pt -> HWPU)
- **검증 내용**: `FIXED HWPUNIT` 변환 공식(`Math.round(fontSizePt * 120)` 또는 `Math.round(lineHeightPt * 100)`)이 부동소수점 오차 없이 정확한 정수 HWPUNIT을 산출하는지 검증.
- **결과**: 10pt -> 1200 HWPU, 14pt -> 1680 HWPU 등 표준 타이포그래피 행간 정확히 생성.

### Test 9: Parser 기하학 팽창 추적 및 `contentHeightPt` 보존
- **검증 내용**: `isCenteredInParent` 휴리스틱에 의해 `bounds.height`가 팽창되더라도 원본 텍스트 높이가 `contentHeightPt` 필드에 정상 보존되는지 검증.
- **결과**: `7:1082`의 경우 bounds.height = 37.48pt, contentHeightPt = 11.99pt로 원본 기하학이 유실되지 않고 메타데이터로 유지됨을 확인.

### Test 10: 다인자 충돌 위험 분석기 재현성
- **검증 내용**: `scripts/evaluate_hwpx_collision_risks.ts`를 실행했을 때 Stage 7의 고신뢰도 충돌 위험 건수(239건)와 의도적 배경 제외 건수(462건)가 결정론적(Deterministic)으로 일관되게 재현되는지 검증.
- **결과**: 동일 JSON 및 HWPX 입력에 대해 100% 재현 확인.

### Test 11: 기존 순환 검증(Circular Assertion) 감사
- **검증 내용**: 기존 테스트 스위트 파일들을 파싱하여 잘못된 구현을 정답으로 강제하는 패턴이 있는지 정적 분석 수행.
- **결과**: `tests/phase23-1-text-geometry.test.ts` 18행의 전역 `BREAK` 강제 단언문 식별.

---

## 4. 기존 테스트 스위트 순환 검증(Circular Assertion) 목록

프로젝트 히스토리 분석 결과, 다음과 같은 순환 검증이 발견되었다.

| 테스트 파일 | 라인 | 순환 단언 내용 | 문제점 및 위험성 |
|---|---|---|---|
| `tests/phase23-1-text-geometry.test.ts` | L18 | `expect(subList).toContain('lineWrap="BREAK"')` | 모든 텍스트박스에 예외 없이 `BREAK`가 포함되어야 테스트가 통과하도록 강제함. 이로 인해 96%의 단일행 라벨이 강제로 개행 위험에 노출되는 버그를 '정상'으로 간주하게 됨. |
| `tests/phase23-1-text-geometry.test.ts` | L19 | `expect(subList).toContain('textMargin="0 0 0 0"')` | 마진 0 강제는 유효하나, 실제 한컴오피스 내부 패딩과 불일치할 수 있는 가정을 정답으로 고정. |
| `tests/phase22-hwpx-viewer-compatibility.test.ts` | L45 | `expect(headerXml).toContain('lineSpacing="160"')` | HWPX 기본 행간 `PERCENT 160%`가 정답인 것처럼 강제하여, 정품 레퍼런스의 `FIXED` 행간 적용을 방해함. |

> [!WARNING]
> 현재 프로덕션 렌더러가 아직 동결 상태이므로, 위 기존 테스트들을 즉시 수정하면 기존 회귀 파이프라인이 깨집니다. 
> 따라서 Phase 25에서 프로덕션 렌더러를 패치할 때, 위 테스트들의 단언문을 **"단일행 객체는 SQUEEZE, 다중행 객체는 BREAK"** 및 **"FIXED 행간 적용"**으로 함께 갱신해야 합니다.

---

## 5. 자동 테스트의 검증 한계 (What Tests Cannot Verify)

자동 테스트는 소프트웨어 아키텍처의 건전성을 보증하지만, 다음 영역은 검증할 수 없다.

1. **한컴오피스 2024 독자 래스터라이저의 글자 폭 판정**:
   - `맑은 고딕` 또는 `Inter` 글꼴의 힌팅(Hinting) 및 커닝(Kerning)에 따른 미세 픽셀 차이는 Windows 시스템 뷰어가 직접 렌더링하기 전까지는 알 수 없음.
2. **`lineWrap="SQUEEZE"` 적용 시 실제 압축 비율**:
   - 한컴오피스 규격서상 장평 50%까지 압축된다고 명시되어 있으나, 텍스트박스 폭이 극도로 좁을 때 실제 뷰어가 글자를 클리핑하는지 여부.
3. **사용자 체감 시각적 정렬 및 가독성**:
   - 다중행 텍스트박스 아래에 배치된 버튼과의 시각적 조화는 인간 검수자의 눈으로만 확인 가능.

따라서 사용자의 한컴오피스 2024 뷰어를 통한 MRE A~F 검증이 필수적이다.

