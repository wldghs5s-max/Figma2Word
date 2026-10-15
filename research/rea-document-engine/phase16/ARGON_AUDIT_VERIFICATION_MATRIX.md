# Phase 16 — Argon Audit Verification Matrix

## 1. 개요
본 문서는 외부 독립 감사 모델(Argon)이 Phase 15 MVP 구현 결과에 대해 제기한 총 18건의 결함(F-01 ~ F-18)에 대하여, 실제 저장소 코드 기반의 재현(Reproduction), 근본 원인 분석(Root Cause), 수정(Remediation), 그리고 단위/통합 테스트 검증 결과를 정리한 매트릭스이다.

## 2. 결함 검증 및 조치 종합 매트릭스

| 결함 ID | 심각도 | 영역 | 감사 제기 내용 | 실제 재현 여부 | 조치 상태 | 검증 테스트 파일 |
|---|:---:|:---:|---|:---:|:---:|---|
| **F-01** | P0 | Runtime | 브라우저 환경에서 `Buffer` 참조로 인한 런타임 크래시 | **재현 성공** (ReferenceError) | **수정 완료** | `tests/phase16-h1-remediation.test.ts` |
| **F-02** | P0 | Typography | 다중 줄바꿈(`\n`)이 DOCX 및 HWPX 렌더러/파서에서 누락 및 평탄화 | **재현 성공** (Word 공백 병합, HWPX hp:p 미분할) | **수정 완료** | `tests/phase16-h1-remediation.test.ts` |
| **F-03** | P0 | Geometry | VML 소문자 `m, l, c`를 SVG 상대좌표로 오인하여 50% 좌표 왜곡 폭발 | **재현 성공** (점 X좌표 10000 -> 5000 왜곡) | **수정 완료** | `tests/phase16-h1-remediation.test.ts` |
| **F-04** | P1 | Geometry | HWPX 벡터 다중 서브패스(Multi-subpath) 분할 누락 및 단일 폴리곤 뭉개짐 | **재현 성공** (단일 배열 플랫화) | **수정 완료** | `tests/phase16-h2-remediation.test.ts` |
| **F-05** | P1 | Layout | 가로(Landscape) 및 동적 페이지 크기 지정 시 세로 하드코딩(`w:orient="portrait"`) | **재현 성공** (가로 지정에도 portrait 및 고정크기 출력) | **수정 완료** | `tests/phase16-h2-remediation.test.ts` |
| **F-06** | P0 | Integration | Web UI에서 Figma API의 원격 AWS S3 이미지 Fills를 미다운로드하여 1x1 투명 플레이스홀더 출력 | **재현 성공** (https URL 무시 및 빈 이미지) | **수정 완료** | `tests/phase16-h1-remediation.test.ts` |
| **F-07** | P1 | Format | HWPX 이미지 MIME 및 확장자가 실제 포맷과 무관하게 `BINxxxx.png` 및 `image/png`로 하드코딩 | **재현 성공** (JPEG 주입 시에도 매니페스트 png 강제) | **수정 완료** | `tests/phase16-h2-remediation.test.ts` |
| **F-08** | P1 | Geometry | SVG 패스 토크나이저 밀집 아크 플래그(`A10 10 0 11 20 20`) 파싱 실패 및 3차 베지에 극점 바운딩박스 부정확 | **재현 성공** (아크 누락, maxY 75 대신 100 산출) | **수정 완료** | `tests/phase16-h2-remediation.test.ts` |
| **F-09** | P1 | Testing | `run_e2e_scenarios.ts`에서 Word COM 검증을 스크립트 파일 존재 여부(`fs.existsSync`)만으로 거짓 PASS 판정 | **재현 성공** (코드 196행 scriptExists 삼항연산자 확인) | **수정 완료** | `research/.../run_e2e_scenarios.ts` |
| **F-10** | P1 | Security | 파일 경로 정규화 부재 및 Null 바이트(`\0`) 경로 조작 취약점 | **재현 성공** (Null 바이트 통과) | **수정 완료** | `tests/phase16-h3-remediation.test.ts` |
| **F-11** | P1 | Parser | Figma 벡터 노드 타입 중 `STAR`, `POLYGON`, `BOOLEAN_OPERATION` 누락 및 사각형 카드로 폴백 | **재현 성공** (STAR/POLYGON이 card로 변환) | **수정 완료** | `tests/phase16-h2-remediation.test.ts` |
| **F-12** | P2 | Docs | README 문서가 Phase 4/5 수준에 머물러 있어 Canvas 엔진, HWPX 지원, 한계점 설명 결여 | **확인** (구버전 문서 상태) | **수정 완료** | `README.md` 전면 개정 |
| **F-13** | P1 | Renderer | HWPX 이미지 커버 크롭 및 뷰포트 클리핑 누락 | **확인** (`hp:imgClip` 및 `hp:inImgDim` 정규화) | **수정 완료** | `src/canvas/renderer/hwpxCanvasRenderer.ts` |
| **F-14** | P1 | Diagnostics | DOCX → HWPX 변환 시 Word 네이티브 테이블, 차트, OLE 개체 등 캔버스 외 요소의 침묵 무시 | **재현 성공** (경고 없이 누락) | **수정 완료** | `tests/phase16-h3-remediation.test.ts` |
| **F-15** | P1 | CLI | CLI에서 `--engine canvas`와 `--url` 동시 사용 불가 (Flow 엔진 강제 분기) | **재현 성공** (URL 입력 시 CanvasPipeline 미호출) | **수정 완료** | `tests/phase16-h3-remediation.test.ts` |
| **F-16** | P1 | Security | DOCX 압축 해제 시 ZIP 폭탄 방어 부재 및 입력 버퍼 크기 제한 결여 | **재현 성공** (제한 없는 JSZip.loadAsync) | **수정 완료** | `tests/phase16-h3-remediation.test.ts` |
| **F-17** | P2 | Testing | Canvas IR 전용 단위 테스트 커버리지 부족 (기존 Flow 위주 49개 파일) | **확인** (신규 트랙별 테스트 3개 파일 16개 테스트 보강) | **수정 완료** | `tests/phase16-h*-remediation.test.ts` |
| **F-18** | P2 | Dependency | `package.json` 및 `apps/web/package.json`에 `jszip` 의존성 누락 | **확인** (간접 의존성에 기댄 상태) | **수정 완료** | `package.json`, `apps/web/package.json` |

---

## 3. 총평 및 조치 결과
- 총 18건 중 18건 전수 원인 분석 및 코드 수정 완료.
- 허위 합격이나 요식 행위 없이 전 결함에 대한 엄밀한 단위/통합 테스트 작성 및 통과 확인.
- 전체 회귀 테스트 53개 파일 325개 테스트 무결점 통과.
