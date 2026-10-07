# Figma2Word 프로젝트 헌장 (Project Charter)

> **문서 목적**
>
> 이 문서는 `Figma2Word` 프로젝트의 장기적인 개발 방향을 고정하기 위한 **최상위 프로젝트 지침서**다.
> 이후 AI 코딩 에이전트(Antigravity 등)가 프로젝트를 구현하거나 수정할 때, 이 문서의 원칙과 목표를 우선적으로 따른다.
>
> 이 문서와 현재 코드의 구현이 충돌할 경우, **무조건 기존 코드를 유지하는 것이 아니라 이 문서의 목적을 기준으로 현재 구현을 재검토한다.**
> 단, 실제 구현 과정에서 더 나은 기술적 대안이 발견되면 임의로 방향을 변경하지 말고 변경 사유와 영향을 문서화한 뒤 사용자와 합의한다.

---

## 1. 프로젝트 개요

### 1.1 프로젝트명

**Figma2Word**

### 1.2 한 줄 정의

**Figma 디자인을 분석하여 Microsoft Word 문서(`.docx`)로 최대한 유사하게 재구성하는 개인 업무용 로컬 변환 도구**

### 1.3 핵심 목적

이 프로젝트는 상용 SaaS나 판매용 제품이 아니다.

사용자가 회사에서 다양한 프로젝트를 수행하면서 발생하는 다음과 같은 반복 작업을 줄이는 것이 주목적이다.

- Figma 디자인을 Word 문서로 옮기는 작업
- 디자인과 문서 사이의 반복적인 수작업
- 이미지/텍스트/표/레이아웃을 Word에서 다시 구성하는 작업
- 제안서, 기획서, 보고서, 사업계획서 등의 문서화 작업

따라서 **개발 난이도를 불필요하게 높이지 않고 실제 업무에서 빠르게 사용할 수 있는 것**이 가장 중요하다.

---

# 2. 절대적인 프로젝트 원칙

## 2.1 가장 중요한 원칙

> **이 프로젝트는 "Figma를 Word로 100% 완벽하게 복제하는 프로그램"이 아니다.**
>
> **"Figma 디자인을 Word에서 최대한 유사하고 실용적인 문서로 재구성하는 프로그램"이다.**

Figma와 Word는 본질적으로 다른 레이아웃 시스템을 사용한다.

따라서 모든 Figma 기능을 Word에서 동일하게 표현하려는 시도는 프로젝트 복잡도만 폭발시킬 가능성이 높다.

---

## 2.2 로컬 우선

배포 서버, SaaS, 멀티테넌트, 인증 서버, 클라우드 DB 등은 기본적으로 필요하지 않다.

최우선 요구사항은:

- Windows에서 실행 가능
- macOS에서 실행 가능
- 로컬 환경에서 실행 가능
- GitHub로 프로젝트를 관리할 수 있음
- 설치/실행 과정이 단순함

이다.

### 중요

**서버가 필요하다는 이유만으로 복잡한 인프라를 도입하지 않는다.**

로컬 Node.js 서버 + 로컬 웹 UI 정도면 충분하다.

---

## 2.3 구현 난이도 최소화

사용자가 직접 모든 코드를 작성하는 프로젝트가 아니라 **AI 바이브코딩 중심 프로젝트**다.

따라서 기술 선택 기준은:

1. 안정성
2. AI가 이해하고 수정하기 쉬운 구조
3. Windows/macOS 호환성
4. 생태계 및 라이브러리 지원
5. 유지보수 용이성
6. 구현 속도

순으로 판단한다.

"더 고급 기술"이라는 이유만으로 기술을 선택하지 않는다.

---

## 2.4 임의의 방향 전환 금지

AI 에이전트는 개발 도중 다음과 같은 이유로 프로젝트 방향을 임의 변경해서는 안 된다.

- 다른 프레임워크가 더 멋져 보임
- 더 최신 기술이 있음
- 구현이 귀찮음
- 특정 기능 구현이 어려움
- 현재 구조를 버리고 처음부터 만드는 것이 편함

방향 변경이 필요하다면:

1. 현재 문제
2. 변경 제안
3. 기존 방식의 문제점
4. 새로운 방식의 장점
5. 영향 범위
6. 마이그레이션 비용

을 먼저 설명하고 사용자 승인 후 변경한다.

---

# 3. 성공 기준

프로젝트 성공은 "Figma와 픽셀 단위로 동일한 Word 파일"이 아니다.

다음 세 가지를 기준으로 평가한다.

### 3.1 시각적 유사성

Figma의 디자인 의도와 시각적으로 충분히 유사해야 한다.

### 3.2 Word 편집성

텍스트, 표 등 문서로서 수정할 가치가 있는 요소는 가능하면 Word의 네이티브 요소로 생성해야 한다.

### 3.3 업무 효율성

수동으로 Figma 디자인을 Word에서 재작성하는 것보다 실제로 빠르고 편해야 한다.

---

# 4. 핵심 설계 철학

## 4.1 Figma → DOCX 직접 변환을 피한다

권장 구조:

```text
Figma
  ↓
Figma Parser
  ↓
Internal Document Model (IR)
  ↓
Layout / Conversion Strategy
  ↓
DOCX Renderer
  ↓
.docx
```

중간 표현 계층(Internal Representation)을 반드시 고려한다.

이 구조를 사용하면 향후 변환 로직을 수정하거나 새로운 출력 포맷을 추가하기 쉬워진다.

---

## 4.2 Internal Representation은 중요한 핵심 자산이다

예시:

```json
{
  "document": {
    "page": {
      "width": 210,
      "height": 297,
      "unit": "mm"
    },
    "elements": [
      {
        "type": "heading",
        "text": "2026 사업계획"
      },
      {
        "type": "image",
        "source": "..."
      }
    ]
  }
}
```

위 JSON은 단순 예시이며 최종 스키마는 실제 Figma 구조 분석 후 결정한다.

중요한 것은 **Figma의 데이터 구조와 DOCX의 구조를 직접 강결합하지 않는 것**이다.

---

# 5. Figma와 Word의 기본 매핑 전략

초기에는 다음과 같은 방향을 사용한다.

| Figma 요소 | Word 표현 |
|---|---|
| Frame | Container / Section 성격의 구조 |
| Text | Paragraph / Text Run |
| Image | Image |
| Rectangle | Shape / Table Cell / Image 중 상황에 맞게 |
| Line | Border / Shape |
| Auto Layout | Table / Paragraph / Layout strategy |
| Group | Container |
| Component | Reusable block 개념 |
| Fill Color | Background / Cell Fill / Shape Fill |
| Stroke | Border |
| Border Radius | 가능한 경우 근사 표현 |
| Font | Word Font |
| Shadow | 가능한 경우 근사, 불가능하면 무시 또는 이미지화 |
| Vector | SVG/PNG 등으로 변환 |
| 복잡한 그래픽 | 이미지화 가능 |

**위 매핑은 고정된 법칙이 아니라 기본 전략이다.**

실제 Figma 샘플을 분석한 후 더 적절한 방법이 발견되면 조정한다.

---

# 6. 가장 중요한 트레이드오프

## 디자인 보존 vs Word 편집성

Figma와 Word는 표현 방식이 다르기 때문에 모든 요소를 네이티브 Word 객체로 만들면 디자인이 깨질 수 있다.

반대로 모든 요소를 이미지로 만들면 디자인은 보존되지만 Word에서 수정할 수 없다.

따라서 **하이브리드 전략**을 기본값으로 한다.

### 기본 원칙

```text
수정 가치가 높은 콘텐츠
→ Word Native Object

Word에서 표현하기 어려운 복잡한 그래픽
→ Image / SVG / Raster

둘 사이에서 애매한 요소
→ 시각적 유사성과 편집성 중 실제 업무 가치가 높은 쪽을 선택
```

예:

- 제목 → Word Text
- 본문 → Word Text
- 표 → Word Table
- 사진 → Image
- 복잡한 일러스트 → Image/SVG
- 복잡한 배경 → Image
- 단순한 도형 → Word Shape 또는 적절한 대체 방식

---

# 7. MVP 범위

처음부터 모든 Figma 기능을 지원하지 않는다.

## MVP 우선 지원

- Frame
- Group
- Text
- Image
- Rectangle
- Line
- 기본 Fill
- 기본 Stroke
- 기본 Border Radius
- 기본 Font
- 기본 Auto Layout
- 기본 spacing
- 기본 alignment
- 기본 page size
- 기본 margin
- 기본 header/footer가 필요한 경우의 구조

## MVP에서 적극적으로 제외

초기 구현에서는 다음 기능을 완벽하게 지원하려 하지 않는다.

- 복잡한 Blur
- Blend Mode
- 복잡한 Vector 편집
- Prototype
- Interactive Component
- Animation
- 고급 Constraint
- 복잡한 Mask
- Figma 전용 효과를 Word에서 픽셀 단위로 재현하는 기능

지원이 필요하다는 요구가 실제로 발생했을 때 우선순위를 다시 평가한다.

---

# 8. AI의 역할

AI는 프로젝트의 핵심 렌더링 엔진이 아니다.

### 잘못된 방향

```text
Figma 디자인
 ↓
AI에게 "Word로 만들어줘"
 ↓
AI가 임의로 DOCX 생성
```

이 방식은 결과가 비결정적이고 재현성이 떨어질 수 있다.

### 권장 방향

```text
Figma 구조
 ↓
Rule-based Parser
 ↓
구조화된 데이터
 ↓
AI가 필요한 경우 의미/레이아웃 전략 보조
 ↓
Deterministic Renderer
 ↓
DOCX
```

즉:

> **규칙 기반 시스템이 기본이고 AI는 애매한 부분을 보조한다.**

AI에게 맡길 수 있는 예:

- 요소의 semantic role 추정
- 그룹의 의미 추정
- Word에서 적합한 레이아웃 전략 추천
- 복잡한 디자인의 문서화 전략 제안
- 변환 실패 원인 분석
- 예외 케이스 분류

AI가 최종 DOCX의 모든 구조를 자유롭게 결정하도록 하지 않는다.

---

# 9. 권장 기술 방향

초기 기술 스택 후보:

### Frontend

- React
- TypeScript
- Vite

### Backend / Local runtime

- Node.js
- TypeScript

### DOCX

- 검증된 TypeScript/Node.js DOCX 생성 라이브러리

### 저장

초기에는 DB를 사용하지 않는다.

파일 시스템 기반:

```text
project/
├── input/
├── output/
├── samples/
└── config/
```

정도로 시작한다.

---

# 10. Electron/Tauri 등 데스크톱 패키징

초기에는 **도입하지 않는다.**

우선:

```text
Node.js
+
React/Vite
+
Local server
```

형태로 개발한다.

필요성이 실제로 확인된 후:

- Electron
- Tauri

등을 검토한다.

단순히 "데스크톱 앱처럼 보이게 하기 위해" 초기부터 패키징 계층을 추가하지 않는다.

---

# 11. 플랫폼 요구사항

필수:

```text
Windows
macOS
```

가능하면 동일한 Git 저장소에서 동일한 개발 명령으로 실행할 수 있어야 한다.

목표:

```bash
npm install
npm run dev
```

정도의 단순한 개발 환경.

운영체제별 경로, shell command, 파일 처리 등의 차이는 가능한 한 코드에서 추상화한다.

---

# 12. 개발 단계

## Phase 0 — 변환 가능성 검증

코딩을 크게 시작하기 전에 실제 Figma 샘플 3~5개를 선정한다.

권장 샘플:

1. 단순 문서
2. 카드형 UI
3. 이미지 + 텍스트
4. 복잡한 대시보드
5. 실제 업무에서 자주 사용하는 디자인

목표:

> "Figma에서 어떤 정보를 얻을 수 있고, Word에서 어떤 방식으로 재현할 수 있는가?"

를 확인한다.

---

## Phase 1 — DOCX Renderer

Figma 없이 먼저:

```text
Internal JSON
    ↓
DOCX
```

를 구현한다.

최소한 다음을 검증한다.

- Text
- Image
- Table
- Page
- Header/Footer 필요 여부
- 기본 spacing
- 기본 스타일

---

## Phase 2 — Figma Parser

```text
Figma Data
    ↓
Internal Document Model
```

구조를 구현한다.

---

## Phase 3 — 통합 변환

```text
Figma
 ↓
Parser
 ↓
Internal Model
 ↓
Renderer
 ↓
DOCX
```

---

## Phase 4 — Preview / UX

사용자가:

- Figma 입력
- 변환 옵션 선택
- 결과 확인
- Word 생성

을 쉽게 할 수 있는 UI를 만든다.

가능하면 Figma와 결과의 비교가 편하도록 만든다.

---

## Phase 5 — AI 보조 기능

기본 deterministic pipeline이 안정화된 후 AI를 도입한다.

---

## Phase 6 — 실제 업무 검증

실제 회사 업무에서 사용하는 Figma 샘플을 넣어보고 부족한 기능을 우선순위화한다.

---

# 13. 변환 모드 아이디어

향후 다음 세 가지 모드를 고려한다.

## Design Fidelity

Figma와 최대한 유사하게 만드는 것을 우선.

## Word Editability

Word에서 사람이 수정하기 편한 구조를 우선.

## Balanced

디자인과 편집성 사이에서 균형을 잡는다.

MVP에서는 하나의 기본 전략으로 시작하고 실제 사용 데이터가 쌓인 후 분리한다.

---

# 14. 프로젝트 구조 원칙

최종 구조는 기술 선택에 따라 변경할 수 있지만 개념적으로 다음 분리를 유지한다.

```text
figma2word/
│
├── apps/
│   └── web/
│
├── packages/
│   ├── figma-parser/
│   ├── document-model/
│   ├── layout-engine/
│   ├── docx-renderer/
│   └── shared/
│
├── samples/
├── tests/
├── docs/
└── README.md
```

### 핵심 책임

`figma-parser`
- Figma 데이터를 읽고 분석

`document-model`
- Figma와 DOCX 사이의 중간 표현

`layout-engine`
- Figma 요소를 Word에서 어떤 방식으로 표현할지 결정

`docx-renderer`
- 최종 DOCX 생성

`shared`
- 공통 타입/유틸리티

실제 프로젝트 규모가 작다면 폴더를 지나치게 분리하지 않아도 된다.

**구조적 명확성이 복잡성보다 우선한다.**

---

# 15. 테스트 원칙

이 프로젝트에서 테스트는 단순한 코드 커버리지를 위한 것이 아니다.

핵심은 **같은 입력에서 같은 변환 결과를 안정적으로 만드는 것**이다.

가능하면 다음을 구축한다.

### Fixture

```text
samples/
├── simple-text/
├── card-layout/
├── image-text/
└── complex-layout/
```

### 테스트

```text
Figma Input
 ↓
Parser Result
 ↓
Internal Model
 ↓
DOCX Generation
```

각 단계별로 검증한다.

---

# 16. AI 에이전트의 개발 행동 규칙

Antigravity 등 AI 코딩 에이전트는 다음 원칙을 따른다.

### 16.1 먼저 읽고 수정한다

기존 코드를 충분히 확인하지 않고 대규모 파일을 덮어쓰지 않는다.

### 16.2 필요한 것만 만든다

미래의 가능성만을 이유로 불필요한 abstraction, DB, API, 인증, 배포 시스템을 추가하지 않는다.

### 16.3 작은 단계로 구현한다

한 번에 전체 시스템을 만들지 않는다.

각 Phase를 작게 구현하고:

```text
구현
→ 테스트
→ 실행
→ 결과 확인
→ 다음 단계
```

순서를 유지한다.

### 16.4 기존 동작을 함부로 깨지 않는다

수정 전에 현재 동작을 파악하고, 변경 후 관련 테스트를 실행한다.

### 16.5 실패를 숨기지 않는다

Figma의 특정 기능을 Word로 정확하게 표현할 수 없다면 억지로 "지원된다"고 판단하지 않는다.

명확하게:

```text
Supported
Partially Supported
Unsupported
Fallback
```

등으로 구분한다.

---

# 17. 현실적인 품질 기준

변환 결과는 다음과 같이 평가한다.

### Level 1 — 구조 보존

텍스트/이미지/표/그룹 구조가 대체로 유지된다.

### Level 2 — 시각적 유사성

색상/폰트/간격/크기/배치가 상당히 유사하다.

### Level 3 — 업무 사용성

생성된 Word를 사람이 실제 문서로 사용할 수 있다.

### Level 4 — 고급 fidelity

복잡한 Figma 디자인도 높은 수준으로 재현한다.

**MVP 목표는 Level 2~3이다.**

Level 4를 처음부터 목표로 삼지 않는다.

---

# 18. 실패 방지 체크리스트

AI 에이전트가 다음 방향으로 프로젝트를 끌고 가려고 하면 경계한다.

- "Figma의 모든 기능을 지원해야 합니다."
- "백엔드 DB부터 만들겠습니다."
- "로그인 기능을 추가하겠습니다."
- "클라우드 서버가 필요합니다."
- "Docker/Kubernetes를 사용합시다."
- "Electron부터 구성합시다."
- "AI가 전체 변환을 담당하도록 하겠습니다."
- "현재 코드를 전부 새로 작성하는 게 낫습니다."
- "향후 SaaS 확장을 위해 복잡한 아키텍처가 필요합니다."

이런 제안은 현재 프로젝트 목적과 맞는지 먼저 검토한다.

---

# 19. 프로젝트의 가장 중요한 판단 기준

새로운 기능이나 기술을 도입할 때 다음 질문을 우선한다.

> **"이것이 실제로 Figma → Word 변환 품질이나 사용성을 개선하는가?"**

YES가 아니라면 초기에는 도입하지 않는다.

또한:

> **"이 기능을 추가함으로써 프로젝트 복잡도가 얼마나 증가하는가?"**

를 함께 고려한다.

---

# 20. 향후 확장 가능성

MVP가 안정화된 후에만 다음 기능을 고려한다.

- Figma API 직접 연동
- Figma 파일 import 자동화
- 변환 preset
- Design Fidelity / Editability 모드
- 변환 오류 리포트
- 변환 전후 비교
- AI 기반 semantic analysis
- 반복 사용되는 문서 템플릿
- HTML/PDF 등 다른 출력 포맷
- 이미지/그래픽 최적화
- Figma Component → Word reusable block

하지만 **현재 범위에 포함시키지 않는다.**

---

# 21. 개발 시 의사결정 우선순위

충돌이 발생하면 다음 순서를 따른다.

```text
실제 업무 효용
    ↓
변환 결과 품질
    ↓
안정성
    ↓
AI가 유지보수하기 쉬운 구조
    ↓
Windows/macOS 호환성
    ↓
개발 속도
    ↓
확장성
    ↓
최신 기술 사용
```

최신 기술을 사용하는 것 자체는 목표가 아니다.

---

# 22. 최종 프로젝트 선언

이 프로젝트의 목표는 거대한 제품을 만드는 것이 아니다.

> **"Figma에서 만든 디자인을 Word 문서로 옮겨야 하는 순간의 귀찮음과 반복 작업을 줄이는 작고 강력한 개인 업무 도구"**

를 만드는 것이다.

따라서:

- 작게 시작한다.
- 실제 샘플을 기준으로 판단한다.
- 변환 품질을 실제 결과물로 검증한다.
- AI에게 모든 판단을 맡기지 않는다.
- 불필요한 인프라를 만들지 않는다.
- 구현이 어려운 기능은 무리하게 지원하지 않는다.
- 실제 업무에서 가치가 확인된 기능만 확장한다.

**프로젝트가 커지는 것보다 프로젝트가 쓸모 있어지는 것이 우선이다.**

---

## Appendix — 현재 사용할 AI 자원

### Primary Development

**Google Gemini Pro + Antigravity**

주요 바이브코딩 개발 환경.

### Architecture / Review / Prompting

**ChatGPT**

프로젝트 방향성, 실현 가능성 검토, 아키텍처 논의, 문제 분석, 구현 프롬프트 작성, AI 에이전트 결과 검토.

### Secondary Coding / Investigation

**Cursor AI**

회사 환경에서 필요할 때 제한적으로 사용.

### Hardening / Cross-check

**Google AI Studio**

중간 점검, 코드 리뷰, 보안/안정성/엣지 케이스 검토 등.

### Design Source

**유료 Figma + Dev Mode**

Figma 구조, 디자인 정보, 개발 정보의 기준점.

---

# 문서 상태

- 상태: **Project Charter / Main Guideline**
- 단계: **Pre-Implementation**
- 목표: 실제 샘플 검증 후 MVP 구현 착수
- 기본 실행 환경: **Windows + macOS**
- 배포: **불필요**
- 데이터 저장: **로컬 우선**
- 우선순위: **업무 효용 > 변환 품질 > 단순성 > 확장성**
