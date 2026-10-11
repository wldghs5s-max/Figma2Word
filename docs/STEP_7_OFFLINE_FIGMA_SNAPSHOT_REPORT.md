# Figma2Word — Step 7: Figma JSON 스냅샷 저장·불러오기 및 오프라인 재변환 보고서

**작성일시**: 2026-10-11  
**기준 커밋**: `3e5c999` (`fix(layout): preserve horizontal grouping within desktop frames`)  
**작업 상태**: Step 7 기능 구현 및 검증 완료, **Git 커밋/푸시 미수행 (지침 준수 대기)**

---

## 1. 구현 개요 및 아키텍처

Figma API Rate Limit(429) 환경 및 반복 변환 비용을 원천 차단하기 위해, 한 번 수신한 Figma 데이터를 온전히 보존하고 이후 **Figma API 호출 0회**로 DOCX를 무제한 재생성할 수 있는 **스냅샷 기반 오프라인 변환 아키텍처**를 구축했습니다.

### 변환 경로 구조도

```
[ 온라인 변환 경로 (Figma API 1회 호출) ]
Figma URL + PAT ──> FigmaClient (fetchNodes / resolveImages)
                          │
                          ▼
                  ┌───────────────┐
                  │ FigmaSnapshot │ ──> [💾 JSON 파일로 로컬 저장]
                  │ (Node + Images)│
                  └───────┬───────┘
                          │ (메모리 캐시 보존)
                          ▼
[ 오프라인 재변환 경로 (Figma API 0회 호출) ]
[📁 저장된 JSON 업로드] ──> FigmaSnapshot ──> FigmaParser ──> LayoutEngine ──> DocxRenderer ──> DOCX
                                  ▲
                                  │ (A4 세로 / 가로 방향 변경 시 API 재호출 없음!)
                          [용지 방향 전환]
```

---

## 2. 저장 파일 형식 (`FigmaSnapshot`)

### 스냅샷 스키마 (`src/pipeline/index.ts`)
```typescript
export interface FigmaSnapshot {
  version: "1.0";
  source: "figma2word";
  exportedAt: string;          // ISO 타임스탬프
  metadata?: {
    fileName?: string;         // 디자인 문서명
    fileKey?: string;          // Figma File Key
    nodeId?: string;           // 선택 노드 ID
  };
  figmaNode: FigmaNode | FigmaFileResponse; // Figma 원본 AST 트리
  imageMap?: Record<string, string>;        // imageRef -> Base64 Data URL 매핑
}
```

### 보안 검증
- **PAT(Personal Access Token) 및 인증 정보 영구 배제**:
  - 스냅샷 생성 함수 `createFigmaSnapshot`은 노드 트리, 이미지 맵, 메타데이터만 캡슐화합니다.
  - 토큰, 쿠키, Authorization 헤더 등 민감한 자격 증명은 절대 스냅샷 JSON에 포함되지 않음을 단위 테스트([tests/figma-offline-snapshot.test.ts](file:///c:/Users/77/Documents/Figma2Word/tests/figma-offline-snapshot.test.ts) Item 8)로 검증했습니다.

---

## 3. 이미지 오프라인 처리 방식

단순히 노드 트리만 저장할 경우, 이미지 채우기(`fills.type === 'IMAGE'`)가 가리키는 원본 CDN URL이 만료되면 재변환 시 이미지가 누락되는 치명적인 문제가 발생합니다.

- **Base64 Data URL 직접 번들링**:
  - 온라인 변환 시 `client.resolveImages`가 다운로드한 이미지 바이너리를 `data:image/png;base64,...` 포맷으로 `imageMap`에 영구 보존합니다.
  - 스냅샷을 불러와 오프라인 변환할 때, `FigmaParser({ imageMap })`와 `DocxRenderer`가 로컬 Base64 바이트를 직접 디코딩하여 DOCX에 삽입합니다.
  - 외부 네트워크 연결이나 CDN 유효기간과 무관하게 **완전한 오프라인 영구 재변환**이 보장됩니다.
- **Graceful Fallback**:
  - 특정 이미지가 누락되거나 참조가 손상된 경우에도 프로세스가 크래시되지 않고 1×1 투명 플레이스홀더로 안전하게 대체됩니다.

---

## 4. UI/UX 개선 사항 (`apps/web/src/App.tsx`)

1. **온라인 변환 후 원클릭 스냅샷 다운로드**:
   - URL 변환 성공 시 "📥 DOCX 다운로드" 버튼 옆에 **"💾 Figma JSON 스냅샷 저장 (.json 다운로드)"** 버튼이 즉시 활성화됩니다.
2. **세션 메모리 캐시를 통한 즉시 재변환 (API 0회)**:
   - URL 탭에서 한 번 변환된 데이터는 컴포넌트 상태(`loadedSnapshot`)에 자동 보존됩니다.
   - 용지 방향을 **A4 세로형 ↔ A4 가로형**으로 바꾸거나 모드를 변경할 때, 상단에 `⚡ 메모리 스냅샷 보존 중` 알림과 함께 **"⚡ 메모리 데이터로 DOCX 즉시 변환"** 버튼이 노출되어 네트워크 호출 없이 0.2초 만에 재변환됩니다.
3. **오프라인 파일 업로드 및 자동 판별**:
   - "샘플 프리셋 및 JSON" 탭에서 파일 업로드 시, 일반 Figma JSON뿐 아니라 `FigmaSnapshot` 포맷을 자동 감지하여 노드와 오프라인 이미지를 함께 로드합니다.
   - "JSON 데이터 변환 실행" 클릭 시 Figma API 호출 없이 로컬에서 완전하게 DOCX가 생성됩니다.

---

## 5. API 호출 절감 효과 측정

| 사용 시나리오 | 기존 방식 | Step 7 스냅샷 적용 후 | 개선율 |
|:---|:---:|:---:|:---:|
| 최초 Figma URL 변환 | 1회 (Nodes + Images) | 1회 (Nodes + Images) | - |
| **세로형 ↔ 가로형 전환** | **1회 재호출** | **0회 (메모리 즉시 변환)** | **100% 절감 (Rate Limit 방지)** |
| 오프라인 환경 재변환 | 변환 불가 (API 필요) | **0회 (JSON 스냅샷 로드)** | **완전 오프라인화** |
| 디자인 반복 튜닝 / 재실행 | 매 실행 시 API 호출 | **0회 (저장된 JSON 활용)** | **API 소진 제로** |

---

## 6. 테스트 및 빌드 검증

### 6.1 신규 스냅샷 테스트 ([tests/figma-offline-snapshot.test.ts](file:///c:/Users/77/Documents/Figma2Word/tests/figma-offline-snapshot.test.ts))

- **Item 1**: 노드 및 이미지 맵으로부터 유효한 FigmaSnapshot 생성 검증
- **Item 2**: 스냅샷 포맷과 일반 Figma JSON의 정확한 타입 판별
- **Item 3**: 오프라인 Portrait 변환 및 `fetch` 호출 0회 검증 (`vi.spyOn(globalThis, 'fetch')`)
- **Item 4**: 동일 스냅샷 재사용 Landscape 변환 및 `fetch` 호출 0회 검증
- **Item 6**: Base64 임베디드 이미지의 오프라인 파이프라인 보존 검증
- **Item 7**: 이미지 참조 누락 시 크래시 없는 안전한 Fallback 동작
- **Item 8**: PAT 토큰 및 인증 헤더 미포함 보안 검증
- **Item 9**: `ConversionPipeline.convertFile`을 통한 스냅샷 `.json` 파일 직접 변환
- **Item 10**: 세로/가로 반복 전환 시의 파이프라인 일관성 검증
- **결과**: **9개 항목 전원 통과 (100%)**

### 6.2 전체 프로젝트 회귀 및 빌드
```bash
npm test -- --run
Test Files  37 passed (37)
Tests       210 passed (210)
Duration    2.56s

npm run build      # tsc 빌드 성공 (0 errors)
npm run build:web  # Vite + React 웹 앱 빌드 성공 (0 errors)
```

---

## 7. 남은 제약사항 및 안내

1. **현재 API Rate Limit 기간 중의 스냅샷 생성**:
   - 현재 사용자의 Figma 계정에 설정된 Rate Limit(약 3.7일) 기간 동안은 신규 URL 호출을 통한 실시간 스냅샷 생성이 제한됩니다.
   - 단, Rate Limit이 해제된 직후 1회만 URL 변환을 수행하면 바로 `.json` 스냅샷을 내려받을 수 있으며, 이후부터는 영구히 API 호출 없이 오프라인 변환이 가능합니다.
2. **초대형 파일의 JSON 크기**:
   - 고해상도 이미지가 수십 장 이상 포함된 복합 디자인의 경우 Base64 인코딩으로 인해 JSON 파일 크기가 수십 MB로 증가할 수 있습니다. (향후 필요 시 zip 압축 형태의 번들링 검토 가능)

---

## 8. Git 상태

- **Phase 1 체크포인트**: 커밋 `3e5c999`로 `origin/master`에 푸시 완료.
- **Phase 2 변경사항**: 지침에 따라 일체의 Git 커밋 및 푸시를 수행하지 않고 작업 트리에 보존 중입니다.

