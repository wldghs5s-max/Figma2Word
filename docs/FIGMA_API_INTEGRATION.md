# Figma REST API 연동 가이드 (FIGMA_API_INTEGRATION)

## 1. 개요 및 설계 원칙
Figma2Word Phase 4는 외부 의존성을 최소화하고 로컬-우선(Local-first) 원칙을 준수하면서, 실제 Figma 클라우드 디자인을 Microsoft Word(`.docx`)로 변환하기 위해 **공식 Figma REST API**를 직접 연동합니다.

---

## 2. 사용된 공식 Figma API 엔드포인트

| API 엔드포인트 | HTTP Method | 목적 및 활용 |
|---|---|---|
| `/v1/files/:file_key` | GET | 전체 파일의 계층 트리(Document AST)를 수신. 파일 내 전체 페이지/프레임 변환 시 사용. |
| `/v1/files/:file_key/nodes?ids=:ids` | GET | 특정 Node ID(예: 개별 프레임/카드)만 지정하여 부분 트리를 고속으로 수신. 대용량 파일 변환 최적화. |
| `/v1/files/:file_key/images` | GET | 문서 내 모든 `imageRef`(해시)에 대한 S3 임시 다운로드 URL 매핑 획득. |
| `/v1/images/:file_key?ids=:ids&format=png` | GET | (옵션) 벡터/컴포넌트 노드를 래스터 이미지로 렌더링한 다운로드 URL 획득. |

---

## 3. 인증 방식 및 보안 원칙 (Secret Management)

### 3.1 Personal Access Token (PAT)
- Figma REST API 호출 시 HTTP 요청 헤더에 토큰을 주입합니다:
  ```http
  X-Figma-Token: <FIGMA_ACCESS_TOKEN>
  Accept: application/json
  ```
- **토큰 발급 위치**: Figma 계정 설정 -> *Security* -> *Personal access tokens*

### 3.2 보안 철학 (Zero Secret Exposure)
- **소스 코드 하드코딩 금지**: 어떠한 경우에도 API 키나 토큰을 코드 또는 커밋에 포함하지 않습니다.
- **환경 변수 파일 보호**: `.env`는 `.gitignore`에 등록되어 있으며, 프로젝트 루트의 `.env.example` 템플릿만 버전 관리됩니다.
- **클라이언트 전용 처리**: 웹 UI(`apps/web/`)에서 입력된 토큰은 외부 백엔드로 전송되지 않고 브라우저 로컬 런타임에서 직접 Figma API 호출에만 사용됩니다.

---

## 4. URL 구조 및 파싱 규칙 (`parseFigmaUrl`)

### 4.1 지원되는 URL 패턴
1. **최신 디자인 URL**:
   `https://www.figma.com/design/:fileKey/:fileName?node-id=:nodeId`
2. **레거시 파일 URL**:
   `https://www.figma.com/file/:fileKey/:fileName?node-id=:nodeId`
3. **프로토타입 URL**:
   `https://www.figma.com/proto/:fileKey/:fileName?...`
4. **순수 파일 키 (Raw Key)**:
   `aBcDeFg12345` (22자리 또는 영숫자 키)

### 4.2 Node ID 정규화 (Hyphen to Colon)
- Figma 웹 브라우저 URL 쿼리에서는 Node ID가 `node-id=12-34` (하이픈) 또는 `node-id=12%3A34` 형태로 인코딩됩니다.
- Figma REST API는 `:` (콜론) 포맷(`12:34`)을 요구하므로 파서가 이를 자동으로 정규화합니다.

---

## 5. 이미지 처리 및 캐싱 파이프라인

```text
[ Figma AST ]
      ↓
[ collectImageRefs (트리 재귀 순회) ]
      ↓
[ 인메모리 캐시 조회 ] ──(캐시 적중 시)──> 즉시 base64 반환
      ↓ (캐시 미적중 대상)
[ GET /v1/files/:file_key/images ]
      ↓
[ S3 다운로드 URL 일괄 획득 ]
      ↓
[ 바이너리 fetch & Base64 Data URL 변환 ]
      ↓
[ imageMap 주입 ] ──> [ DocxRenderer Word 미디어 임베딩 ]
```

- **메모리 캐시(`Map<string, string>`)**: 동일한 `imageRef`가 문서 내 여러 위치(반복 아이콘, 프로필 사진 등)에 등장하더라도 네트워크 중복 다운로드를 100% 방지합니다.
- **장애 격리 (Graceful Fallback)**: 단일 이미지 다운로드가 실패하더라도 전체 문서 생성이 중단되지 않고 경고 공지 후 계속 진행됩니다.

---

## 6. 오류 진단 및 상태 코드 매핑

| HTTP Status | 에러 유형 | 사용자 안내 메시지 |
|---|---|---|
| **400** | Bad Request | URL 형식 또는 Node ID 문법 오류 안내 |
| **401** | Unauthorized | "Invalid or expired Figma access token. FIGMA_ACCESS_TOKEN을 확인하세요." |
| **403** | Forbidden | "해당 Figma 파일에 대한 조회 권한이 없습니다. 파일 공유 권한을 확인하세요." |
| **404** | Not Found | "요청한 Figma 파일 또는 노드가 존재하지 않습니다." |
| **429** | Rate Limit | "Figma API 호출 한도가 초과되었습니다. 잠시 후 재시도하세요." |
| **5xx** | Server Error | Figma 서버 일시 장애 안내 |
| **Timeout** | Network Timeout | 30초 AbortController 타임아웃 감지 및 안내 |

---

## 7. CLI 및 Web UI 사용법

### 7.1 CLI 사용법
```bash
# 환경 변수 설정 후 URL 변환
export FIGMA_ACCESS_TOKEN="figd_xxxx"
npm run convert:url -- "https://www.figma.com/design/XXXX/My-Doc?node-id=1-2"

# 토큰을 인라인 옵션으로 직접 전달
npm run convert:url -- "https://www.figma.com/design/XXXX/My-Doc" --token "figd_xxxx" --output "my-result.docx"
```

### 7.2 Web UI 사용법
```bash
npm run dev:web
```
- 브라우저에서 `http://localhost:5173` 접속
- "Figma URL 라이브 연동" 탭 선택
- Figma URL과 Personal Access Token 입력 후 **[Figma 실시간 가져오기 & DOCX 변환]** 클릭
