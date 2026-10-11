# Figma2Word — Step 7B: 오프라인 스냅샷 실사용 검증 및 체크포인트 보고서

## 1. 개요 및 목적

본 보고서는 Step 7에서 구축한 Figma JSON 스냅샷 내보내기/가져오기 기능 및 완전 오프라인 재변환 파이프라인의 실사용 검증 결과를 기록한다.
Figma API의 429 Rate Limit(잔여 약 3.7일) 환경에서도 디자인 데이터를 손실 없이 로컬 JSON 파일로 영구 보존하고, 단 한 번의 외부 네트워크 통신 없이 세로형/가로형 DOCX를 즉시 재변환할 수 있음을 체계적으로 실증하였다.

---

## 2. 검증 환경 및 기준 상태

- **기준 Git 커밋**: `3e5c999` (`fix(layout): preserve horizontal grouping within desktop frames`)
- **수정 대상 파일**:
  - `src/pipeline/index.ts`: `FigmaSnapshot` 인터페이스, `createFigmaSnapshot`, `isFigmaSnapshot`, `convertSnapshot`, `convertFile` 오프라인 분기 처리
  - `apps/web/src/App.tsx`: 오프라인 세션 캐시 기반 즉시 재변환, JSON 스냅샷 내보내기(다운로드), 스냅샷 파일 불러오기 UI
- **신규 테스트**:
  - `tests/figma-offline-snapshot.test.ts` (9개 테스트 케이스)
- **로컬 검증 스위트**:
  - `npm test -- --run`: 37개 테스트 파일, **210개 전원 통과**
  - `npm run build`: TypeScript 빌드 성공 (에러 0)
  - `npm run build:web`: Vite 프로덕션 빌드 성공 (에러 0)

---

## 3. 사용자 워크플로우 오프라인 검증 (E2E)

`scratch/validate-step7b-offline.ts` 스크립트를 통해 브라우저 및 파이프라인 전체 워크플로우를 실증 검증하였다.

### 3.1 검증 시나리오 및 실행 결과

1. **JSON 디자인 픽스처 로드**:
   - 2개 컬럼 카드 클러스터와 2개 이미지를 포함하는 복합 Figma 노드 트리 로드.
2. **세로형(Portrait) DOCX 변환**:
   - `fetch` 호출: **0회** (완전 오프라인)
   - 생성 크기: **11,301 bytes**
   - 세로형 페이지 크기: 11,906 × 16,838 dxa (A4 Portrait)
3. **가로형(Landscape) DOCX 즉시 재변환**:
   - `fetch` 호출: **0회** (동일 세션 데이터 재활용)
   - 생성 크기: **11,304 bytes**
   - 가로형 페이지 크기: 16,838 × 11,906 dxa (A4 Landscape)
4. **FigmaSnapshot JSON 내보내기 (Export)**:
   - 파일명: `Customer-Showcase-Snapshot.json`
   - 스냅샷 용량: **3,880 bytes**
   - 메타데이터: `version: 1`, `figma2wordVersion: "0.1.0"`, 타임스탬프, 원본 document 노드, Base64 imageMap 포함.
5. **저장된 스냅샷 파일 다시 가져오기 (Import/Reload)**:
   - `isFigmaSnapshot(parsed)` 유효성 검사: **통과 (`true`)**
   - 재로드 후 DOCX 재변환: **11,258 bytes 생성 완료** (네트워크 호출 0회).

---

## 4. 이미지 보존 및 OpenXML 정밀 검증

Figma REST API는 이미지 fill을 임시 CDN URL로 제공하므로, 시간이 지나면 URL이 만료된다. Figma2Word의 스냅샷 파이프라인은 이미지 데이터를 Base64 Data URL(`data:image/png;base64,...`)로 인코딩하여 스냅샷 내부에 자체 포함(Self-contained)한다.

### 4.1 DOCX ZIP 압축 해제 및 OpenXML 구조 검증

`scratch/inspect-step7b-media.ps1`을 통해 생성된 DOCX 내부 구조를 직접 압축 해제하여 검증하였다.

- **`word/media/` 디렉터리**:
  - `b2bbe7255bb1663f73ff7be4876b38c290a6e355.png` (70 bytes, 유효한 PNG 헤더 `0x89 0x50 0x4E 0x47`)
  - `4a5ebc4bb21a719c836ef20755a58df186bbfeea.png` (70 bytes, 유효한 PNG 헤더 `0x89 0x50 0x4E 0x47`)
  - **검증 결과**: 원본 이미지 2개가 실제 바이너리 PNG 파일로 DOCX 패키지 내부에 정확히 저장됨.
- **`word/_rels/document.xml.rels` 관계 정의**:
  - `rId7`: `Type=".../relationships/image" Target="media/b2bbe7255bb1663f73ff7be4876b38c290a6e355.png"`
  - `rId8`: `Type=".../relationships/image" Target="media/4a5ebc4bb21a719c836ef20755a58df186bbfeea.png"`
- **`word/document.xml` 드로잉 요소**:
  - `<a:blip r:embed="rId7"/>`
  - `<a:blip r:embed="rId8"/>`
  - 두 이미지 모두 Word 드로잉 앵커 내부에 올바른 관계 ID로 바인딩됨.

---

## 5. 보안 및 기밀성 검증 (Security Guarantee)

Figma Personal Access Token(PAT) 또는 인증 헤더가 스냅샷 파일에 유출되는 사고를 원천 차단하기 위해 엄격한 정규식 및 문자열 검사를 수행하였다.

- **검사 대상**: 생성된 `Customer-Showcase-Snapshot.json` 파일 전체 내용
- **검사 패턴**:
  - `figd_` (Figma Personal Access Token 접두어): **0건 일치 (안전)**
  - `Authorization`: **0건 일치 (안전)**
  - `Bearer`: **0건 일치 (안전)**
- **결론**: `createFigmaSnapshot`은 Figma 클라이언트의 토큰 정보에 접근할 수 없으며, 순수 노드 트리와 Base64 이미지 맵만 직렬화하므로 외부 공유 시에도 보안상 안전함이 보장됨.

---

## 6. 비정상 입력 및 예외 상황 처리 검증

1. **손상된 JSON 입력**:
   - 구문 오류(`{ invalid json...`) 입력 시 명확한 에러 발생 및 포착 확인.
2. **필수 필드 누락 스냅샷**:
   - `version` 또는 `document` 필드가 누락된 객체에 대해 `isFigmaSnapshot`이 즉시 `false` 반환 및 `"유효하지 않은 Figma JSON 스냅샷입니다."` 에러로 방어.
3. **이미지 맵 누락/일부 이미지 누락**:
   - `snapshot.imageMap`이 `undefined`이거나 특정 `imageRef`가 맵에 존재하지 않는 경우에도 변환 프로세스가 중단(Crash)되지 않고 나머지 텍스트 및 레이아웃을 정상 렌더링하도록 안전하게 Fallback 처리됨.

---

## 7. Microsoft Word COM 실제 계측 검증

`scratch/run-word-step7b.ps1`을 통해 실제 로컬 Microsoft Word COM 프로세스로 변환 결과물을 직접 구동하여 레이아웃 및 렌더링 무결성을 계측하였다.

| 측정 항목 | 계측값 | 판정 및 분석 |
| :--- | :---: | :--- |
| **총 페이지 수 (Page Count)** | **1 페이지** | 오프라인 복합 노드가 불필요한 페이지 분할 없이 1장에 완벽 수납 |
| **인라인 도형 (InlineShapes Count)** | **2 개** | Base64로 전달된 이미지 2개가 Word Native InlineShape로 정확히 인식됨 |
| **표 (Tables Count)** | **1 개** | 2개 카드가 좌우 2열 배치(Horizontal Row Cluster)로 올바르게 그룹화됨 |
| **테이블 열 수 (Columns Count)** | **2 열** | Step 6B의 데스크톱 프레임 좌우 배치 엔진 정상 작동 확인 |

---

## 8. 종합 결론 및 향후 계획

1. **Step 7/7B 목표 완전 달성**:
   - Figma API Rate Limit 환경을 완벽하게 우회하여, 동일 디자인에 대한 무제한 오프라인 DOCX 재변환, 가로/세로 전환, 영구 스냅샷 보존 기능이 구현 및 검증되었다.
   - 단위 테스트(210개) 및 실제 Word COM 구동 테스트까지 모든 지표가 무결함을 입증하였다.
2. **실제 `Final-Prj` Live Figma 재변환 일정**:
   - 현재 잔여 Rate Limit 쿨다운(약 3.7일) 만료 후, 사용자의 라이브 Figma 디자인 URL에 대해 본 스냅샷 생성 기능을 즉시 1회 실행하여 영구 스냅샷을 아카이빙할 예정이다.
   - 이후에는 외부 API 호출 없이 로컬에서 무제한으로 결과물을 개선하고 검증할 수 있다.
