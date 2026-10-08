# Figma2Word Project Handover

작성일: 2026-10-08. 이 문서가 현재 단계의 인수인계 기준이다.

`docs/PROJECT_STATUS.md`는 2026-10-07 Phase 4.1 기록이다. README의 6절과 7절은 STEP 2-B-1 직후 계획이다. 둘 다 현재 상태를 대체하지 않는다.

다음 작업자는 코드를 수정하기 전에 이 문서를 읽는다. 여기 적힌 분석은 같은 조사를 반복하지 않기 위한 기록이다. 코드나 `output/`의 DOCX가 이 문서와 다르면 코드와 산출물이 source of truth다.

## 1. 현재 프로젝트 목적

Figma 디자인을 로컬에서 규칙 기반으로 Word `.docx`로 재구성한다. 편집 가능한 문단, 표, 이미지를 만드는 것이 목표다. 픽셀 단위 복제는 목표가 아니다.

현재 최적화의 목표도 표 개수를 최소로 만드는 것이 아니다.

> Figma의 시각적/공간적 구조를 DOCX에서 유지하면서, 의미 없는 wrapper만 고른다.

원칙:

```text
Visual fidelity > table count reduction
```

표가 하나 줄어드는 것보다 배경, 테두리, 여백, 이미지, 텍스트, 열 너비가 유지되는 것이 우선이다.

`1x1 table이니까 제거해도 된다`는 규칙은 쓰지 않는다.

## 2. 현재 Git 상태

- 브랜치: `master`
- 이 문서를 포함한 checkpoint 커밋 메시지는 `chore(phase-4.2): checkpoint step-2b6 and handover`다. 커밋 해시는 커밋 직후 `git log -1`로 확인한다.
- 직전 HEAD는 `a7fce13` (`docs: add project handover and current development status`)였다.
- STEP 2-B-1 코드 커밋은 `8986931`이다. 그 위에 있던 미커밋 안정화 수정과 STEP 2-B-2, 2-B-5, 2-B-6이 이번 checkpoint에 함께 들어간다.
- push는 하지 않는다.

이번 checkpoint에 STEP 2-B 외에 함께 포함된 안정화 수정:

- 열 퍼센트가 음수가 되지 않도록 합을 100으로 맞춘다 (`LayoutEngine.toColumnPercents`).
- 이미 행 칸인 가로 프레임도 너비 비율을 계산한다.
- 보이지 않는 채움 위로 형제를 접지 않는다.
- 글자가 그림 위에 있어도 이미지 채움을 유지한다.
- `node.fills`가 빈 배열이면 `style.fills`에서 글자색을 읽는다.
- 본문에 `title`이 있다고 제목으로 올리지 않는다.
- 오토레이아웃 간격은 렌더러에서 px를 pt로 바꾼다. 파서에서 미리 바꾸지 않는다.
- 캔버스에 텍스트 라벨이 있어도 나란한 아트보드는 페이지를 나눈다.
- Figma 노드 응답 키가 `-`, `:`, 인코딩이 달라도 노드를 찾는다 (`findNodeEntry`).
- 이미지 응답의 MIME이 일반 값이면 바이트로 JPEG/PNG를 구분한다.
- Windows 파일명에 들어갈 수 없는 문자를 제거한다.
- 결정론 테스트는 `word/document.xml`을 Node zlib로 비교한다. Python은 쓰지 않는다.

이 안정화는 `tests/regression-guards.test.ts`가 고정한다.

## 3. 현재 구현 단계

Phase 4.2 STEP 2-B는 STEP 2-B-6까지 구현되어 있다.

| 단계 | 상태 |
| --- | --- |
| STEP 1 화면 격리와 PageBreak | 커밋 `6e509c1` |
| STEP 2-B-1 빈 장식 Shape | 커밋 `8986931`, 유지 |
| STEP 2-B-2 단일 텍스트 칩/버튼 | 이번 checkpoint에서 구현 |
| STEP 2-B-3 3067개 표 분류 | 분석만. 코드 변경 없음 |
| STEP 2-B-4 711개 wrapper 등급 | 분석만. 코드 변경 없음 |
| STEP 2-B-5 SAFE 3개 | 이번 checkpoint에서 구현 |
| STEP 2-B-6 배경 행 2개 | 이번 checkpoint에서 구현 |
| STEP 2-B-7 | NOT STARTED |

파서는 `type: "table"`을 만들지 않는다. 실제 Figma 변환의 표는 `renderContainerBody()`와, 내용이 있는 shape의 표 경로에서 나온다.

## 4. Phase 4.2 STEP 1

여러 화면이 한 LayoutEngine 패스로 섞이던 문제를 화면 단위로 나누고, 화면 사이에 `PageBreakElement`를 넣는다. 영업지원시스템 스토리보드 변환의 PageBreak 38은 화면 39개에서 하나 뺀 값이다. 이 단계는 이번 checkpoint에서 다시 바꾸지 않았다.

## 5. Phase 4.2 STEP 2-B

### 2-B-1

목적: 내용이 없는 장식 Shape가 표를 만들지 않게 한다.

코드 (`renderShape`):

- `content`가 없거나 길이가 0이면 `null`을 반환한다.
- `renderElement()`는 `null`을 허용한다.
- `renderElements()`는 `null`과 빈 결과를 넣지 않는다.
- 가로 칸에서 자식 렌더가 `null`이면 그 칸은 빈 문단을 넣는다. 열 자체를 지우지는 않는다.
- 내용이 하나이고 그것이 텍스트 잎이면 표 대신 음영 문단을 만든다.
- 내용이 여러 개면 기존처럼 1×1 표를 유지한다.

테스트: `tests/empty-shape-no-table.test.ts`.

별도 샘플(안심플랜 설문, 단일 Frame)에서는 표 88개 중 빈 장식 24개가 빠져 64개가 되었다. 그 샘플의 깊이는 7이었다. 이 숫자는 아래 스토리보드 산출물과 다른 파일이다.

스토리보드 파일에서 2-B-1만의 before/after DOCX는 `output/`에 없다. `output/figma-baseline.docx`는 2-B-2 직전 상태이고, 표 4093 / 깊이 11이다. 4093에서 3067로 준 것은 2-B-1이 아니다.

### 2-B-2

목적: 배경이나 테두리가 있는 컨테이너가 텍스트 잎 하나만 감쌀 때, 그 1×1 표를 음영 문단으로 바꾼다. 배지, 칩, 버튼이 대상이다.

이것은 글자 하나짜리만 제거하는 규칙이 아니고, 모든 1×1 표를 제거하는 규칙도 아니다.

코드 조건 (`renderContainerBody`의 `singleTextLeaf` 분기):

- 컨테이너에 배경 또는 테두리가 있다.
- `backgroundImage`가 없다.
- 자식이 정확히 하나다.
- 그 자식을 따라가면 문단 또는 제목 하나다.
- 따라가는 도중에 배경, 테두리, 배경 이미지, 0보다 큰 gap, 0보다 큰 padding이 있으면 멈춘다.
- 맞으면 부모의 배경, 테두리, padding을 그 문단에 얹고 표를 만들지 않는다.

유지하는 것:

- 자식이 둘 이상인 가로 행은 그대로 1×N 표다.
- 배경과 테두리가 있고 자식이 여러 개인 카드는 1×1 표다.
- 이미지와 글자가 함께 있으면 표를 유지한다.
- 내용이 여러 개인 shape는 표를 유지한다.

테스트: `tests/step-2b2-flatten.test.ts` (A 칩, B 버튼, C 아이콘+글자, D 투명 단일 자식, E 다열, F 카드, G 이미지+글자, shape 분기).

스토리보드 실측: 4093 → 3067, 중첩 4054 → 3028. 깊이 11, 문단 5153, 텍스트 3934, 이미지 63, PageBreak 38은 유지. `document.xml` 6,824,668 → 6,113,542바이트. DOCX 16,163,839 → 16,156,367바이트.

### 2-B-3 analysis

분석 당시 파일은 `output/figma-step2b2.docx`다. 이번 checkpoint에서 3067개를 다시 분류하지 않았다. 아래는 그 시점의 기록이다. 현재 최종 표 수(3062)와 섞지 않는다.

```text
Tables: 3067
Nested: 3028
Max depth: 11
Paragraphs: 5153
Text nodes: 3934
Images/drawings: 63
PageBreaks: 38
```

당시 상호 배타 분류:

```text
A horizontal layout 1xN: 1661
F nested-only 1x1 shell: 767
Z empty 1x1 box: 378
B text + child table: 177
D text-only 1x1: 43
C image 1x1: 41
```

1661 + 767 + 378 + 177 + 43 + 41 = 3067. 모든 표는 1행이었다. 깊이 11은 채워진 1×1과 가로 1×N이 번갈아 이어진 경로라서, 빈 상자만 지워서 줄지 않았다. 순수 통과(채움 없음, 테두리 없음, 여백 없음, 자식 표만 있음)는 0개였다.

### 2-B-4 analysis

F 767개 가운데 자식 표가 정확히 하나인 1×1은 711개였다. 이번 checkpoint에서 711개를 다시 세지 않았다.

```text
SAFE: 3
CONDITIONAL: 644
UNSAFE: 64
```

3 + 644 + 64 = 711.

SAFE가 된 이유는 부모와 자식이 같은 한 칸을 두 번 그린 경우뿐이었다.

- SAFE-A 2개: 부모 배경 `FFFFFF`, 테두리 없음, padding 0. 자식도 1×1이고 배경 `FFFFFF`이며 자식 테두리와 padding은 이미 가지고 있다.
- SAFE-B 1개: 부모 배경 없음, 네 면 테두리 `A1B0BF`, padding 0. 자식은 빈 1×1이고 배경 `A1B0BF`, 테두리 없음.

CONDITIONAL 644개는 자식이 2열 이상이었다. 자식 칸 자체에는 배경과 테두리가 없었고, 부모의 배경/테두리/padding을 모든 칸에 복사하면 칸 경계, 안쪽 선, 열 너비 기준이 바뀐다.

UNSAFE 64개의 이유는 부모/자식 배경이 다르거나, 양쪽에 테두리가 있거나, 자식 칸에 이미지가 있는 경우였다.

위험으로 본 요소:

- 자식 열이 2개 이상
- 부모와 자식의 배경색이 다름
- 부모와 자식이 모두 테두리를 가짐
- 부모 padding이 있음
- 이미지가 포함됨
- 더 안쪽에 중첩 구조가 있음

### 2-B-5

목적: 2-B-4에서 SAFE로 확인된 3개만 제거한다.

`renderSafeIdenticalWrapper`는 위 단일 자식 분기에서, 텍스트 잎이 아닐 때만 실행된다. 하나라도 애매하면 `null`이고 기존 1×1 표를 만든다.

SAFE-A:

- 부모 배경이 정확히 `FFFFFF`
- 부모 테두리 없음, padding 0, 배경 이미지 없음
- 자식 컨테이너 하나, 가로 다열이 아님, 이미지 없음
- 자식 배경 `FFFFFF`이고 자식에게 보이는 테두리가 있음
- 부모 표를 만들지 않고 자식을 그대로 렌더한다. 자식 테두리와 padding은 옮기지 않는다.

SAFE-B:

- 부모 배경 없음, 보이는 테두리 색이 정확히 `A1B0BF`, padding 0
- 자식 배경 `A1B0BF`, 자식 테두리 없음, 자식 내용 없음, 자식 padding 0
- 부모 테두리를 그 자식에만 복사한 뒤 부모 표를 만들지 않는다.

제거하지 않는 것:

- padding이 있는 wrapper
- 부모와 자식의 배경이 다른 경우
- 자식이 다열인 경우
- 이미지가 있는 경우
- 그 외 일반적인 중첩 wrapper

테스트: `tests/step-2b5-safe-flatten.test.ts` A–F. C는 1×2 유지, D는 배경색 불일치 유지, E는 padding 유지, F는 이미지 유지.

스토리보드 실측: 3067 → 3064, 중첩 3028 → 3025. 깊이 11. 텍스트 3934, 이미지 63, PageBreak 38 유지. `document.xml` 6,110,950바이트. DOCX 16,156,321바이트.

### 2-B-6

목적: CONDITIONAL 배경 wrapper 가운데, 다시 확인했을 때 안전한 행만 편다.

분류상 배경만 있고 테두리와 padding이 없는 후보는 57개였다. 57개라는 이유만으로 57개를 전부 펴지 않았다. 실제 구조를 다시 보면 이미지 29개, shape가 섞인 26개였고, 칸이 문단 또는 단일 텍스트 칩인 행은 2개뿐이었다. 그 2개만 처리했다. 둘 다 `01 고객 발굴` / `02 FC 배정` / `03 배정결과` 행이다.

`renderConditionalBackgroundWrapper` 조건:

- 부모 자식이 하나, 배경 이미지가 없음, padding 0, 보이는 테두리 없음, 배경색이 있음
- 자식은 가로 배치이고 자식이 2개 이상
- 자식 자체 배경 없음, 자식 테두리 없음, 자식 트리에 이미지 없음
- 각 칸은 문단, 제목, 또는 자식 하나가 텍스트 잎인 칩 컨테이너
- shape, 가로 중첩 행, 여러 자식을 가진 블록은 칸으로 인정하지 않음

처리 방식:

- 자식 행을 기존 방식으로 렌더한다. 열 너비 계산은 그대로다.
- 부모 배경은 그 표의 `w:tblPr/w:shd`에 한 번만 넣는다.
- 각 칸에 배경을 복사하지 않는다. `docx`의 `Table` 생성자는 shading을 `tblPr`로 넘기지 않아서, 만들어진 표의 `tblPr`에 `w:shd`를 붙인다.
- 칩의 자체 배경은 문단 음영으로 남는다.

테스트: `tests/step-2b6-background-row.test.ts`. 1×2, 1×3 칩, padding, 테두리, 자식 배경, 이미지, 텍스트, 열 너비, 중첩 표, shape를 본다.

스토리보드 실측: 3064 → 3062, 중첩 3025 → 3023. 깊이 11. 텍스트 3934, 이미지 63, PageBreak 38 유지. `document.xml` 6,110,950 → 6,109,292바이트. DOCX 16,156,321 → 16,156,307바이트.

Word에서 두 번째 `01 고객 발굴` 행은 3열이었고, 문단 음영은 `F5F7FA`였다. 칸 자체에 개별 배경은 없었다.

## 6. 현재 DOCX 구조 및 검증 결과

대상은 Sh 영업지원시스템(ODS), 캔버스 스토리보드, 노드 `1154-2208`이다. 파일은 gitignore된 `output/`에만 있다.

2026-10-08에 네 파일을 같은 방식으로 다시 읽었다. 문단 수는 비어 있는 `<w:p/>`를 제외한 `<w:p>`다.

| 항목 | baseline (2-B-2 직전) | 2-B-2 | 2-B-5 | 2-B-6 현재 |
| --- | ---: | ---: | ---: | ---: |
| 파일 | figma-baseline.docx | figma-step2b2.docx | figma-step2b5.docx | figma-step2b6.docx |
| Tables | 4093 | 3067 | 3064 | 3062 |
| Nested | 4054 | 3028 | 3025 | 3023 |
| Max depth | 11 | 11 | 11 | 11 |
| Paragraphs | 5153 | 5153 | 5153 | 5153 |
| Text nodes | 3934 | 3934 | 3934 | 3934 |
| Images/drawings | 63 | 63 | 63 | 63 |
| PageBreaks | 38 | 38 | 38 | 38 |
| document.xml | 6824668 | 6113542 | 6110950 | 6109292 |
| DOCX | 16163839 | 16156367 | 16156321 | 16156307 |
| malformed XML | 0 | 0 | 0 | 0 |
| broken image relationship | 0 | 0 | 0 | 0 |
| negative width | 0 | 0 | 0 | 0 |
| zero width | 0 | 0 | 0 | 0 |
| text loss | 없음 | 없음 | 없음 | 없음 |
| image loss | 없음 | 없음 | 없음 | 없음 |

미디어 PNG 20개, 이미지 관계 20개, drawing과 blip은 각 63개다. `output/figma-step2b.docx`라는 파일은 없다.

결정론 기준은 ZIP 전체 크기가 아니라 `word/document.xml`이다. `tests/determinism.test.ts`가 같은 IR을 두 번 렌더해 그 XML이 같은지 본다. 이미지 번호 속성만 정규화한다. 이 테스트는 2026-10-08 전체 테스트에 포함되어 통과했다.

## 7. 무엇을 의도적으로 하지 않았는가

- STEP 2-B-7을 시작하지 않았다.
- CONDITIONAL 644개 전체를 펴지 않았다.
- UNSAFE 64개를 처리하지 않았다.
- padding 이동, `tcMar` / `tblCellMar` 일반화를 만들지 않았다.
- 테두리 이동을 SAFE-B의 `A1B0BF` 한 경우 밖으로 넓히지 않았다.
- 1×N 표를 일반적으로 펴지 않았다.
- 깊이 상한을 넣지 않았다.
- 파서, LayoutEngine의 역할, 이미지 저장 방식을 표 감소를 위해 다시 설계하지 않았다.
- 표 수를 특정 숫자에 맞추려고 추가 표를 지우지 않았다.

## 8. 현재 남아 있는 table 구조를 함부로 제거하면 안 되는 이유

현재 3062개 가운데 대부분은 여전히 가로 배치, 카드의 배경/테두리, 여백, 이미지, 글자와 중첩 내용, 빈 시각 상자다.

1×1이 남아 있다는 사실만으로 불필요한 표가 아니다. 부모 색이 padding 뒤에 보이고 자식 색이 그 안에 있는 경우, 두 색은 칸 하나에 같이 남을 수 없다. 바깥 테두리를 모든 자식 칸에 복사하면 칸 사이에 선이 생긴다. 부모 padding이 있는 1×N에서 표를 바깥 너비로 늘리면 열 퍼센트의 기준이 바뀐다.

다음에 후보를 보더라도 한 번에 한 패턴만 고르고, 텍스트 3934, 이미지 63, PageBreak 38이 줄지 않는지, 그리고 해당 화면을 Word에서 보는 것까지 확인한다.

## 9. 현재 테스트 / build 상태

2026-10-08 실행:

- `npm test`: 21개 파일, 101개 테스트, 실패 0
- `npm run build`: 통과
- `npm run build:web`: 통과. Vite는 `__dirname`과 `fs` externalize, 청크 크기 경고만 낸다.

관련 테스트 파일:

- `tests/empty-shape-no-table.test.ts`
- `tests/step-2b2-flatten.test.ts`
- `tests/step-2b5-safe-flatten.test.ts`
- `tests/step-2b6-background-row.test.ts`
- `tests/regression-guards.test.ts`
- `tests/determinism.test.ts`

## 10. 현재 작업 tree 상태

checkpoint 커밋 후 working tree는 clean이어야 한다. `output/`, `temp/`, `.env`는 gitignore라 커밋되지 않는다. `samples/output/det-1.docx`, `det-2.docx`는 결정론 테스트가 만드는 산출물이며 커밋 대상이 아니다.

토큰은 `.env`의 `FIGMA_ACCESS_TOKEN`에만 둔다. 문서와 커밋에 토큰 값을 적지 않는다.

## 11. 다음 작업자가 반드시 먼저 확인해야 할 것

바로 코드를 수정하지 말고 다음 순서로 읽는다.

1. `docs/PROJECT_HANDOVER.md`
2. `README.md`
3. `git log -1`과 `git status`
4. `tests/step-2b2-flatten.test.ts`, `tests/step-2b5-safe-flatten.test.ts`, `tests/step-2b6-background-row.test.ts`
5. `output/figma-step2b6.docx`가 로컬에 있으면 그 측정값

그 다음에도 새 flatten을 바로 구현하지 않는다. 남아 있는 CONDITIONAL / UNSAFE 가운데 화면이 깨지지 않는 구조가 있는지를 작은 단위로 다시 본다.

기존 분석을 다시 돌리기 전에 이 문서의 2-B-3, 2-B-4 숫자를 먼저 신뢰한다. 코드와 현재 산출물이 다르면 실제 코드와 산출물을 source of truth로 삼는다.

## 12. 다음 단계 후보

```text
STEP 2-B-7 = NOT STARTED
```

후보로만 남아 있는 것:

- 배경만 있는 57개 중 이번 단계에서 제외한 이미지 29개와 shape 26개
- padding이 있는 wrapper
- 테두리가 있는 wrapper
- UNSAFE 64개

이들을 구현 대상으로 승인한 기록이 아니다. 각 후보는 별도의 단계에서, 현재 3062 / 3023 / 3934 / 63 / 38을 기준으로 다시 검증한다.
