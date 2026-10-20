# Figma2Word — Phase 25: 작업 F — JSON 다운로드 기능 안정화 및 아키텍처 감사 보고서

**문서 번호**: P25-DELIV-06  
**작성 일자**: 2026-10-20  
**대상 시스템**: `apps/web` 프론트엔드 및 Figma 스냅샷 엔진  
**분석 책임**: Antigravity REA Document Engine Team  

---

## 1. 개요 및 배경

Figma2Word는 Figma REST API로부터 가져온 실시간 디자인 데이터를 오프라인 및 로컬 테스트 환경에서도 재현할 수 있도록 JSON 스냅샷 기능을 제공해 왔다. 그러나 최근 웹 UI 리팩토링 과정에서 해당 다운로드 버튼이 일시적으로 누락되었고, 이번 실전 프로젝트(`펜테크 3차 디자인`)의 경우 전체 스냅샷 크기가 **186.5 MB**에 달하여 브라우저 메모리 부하와 다운로드 실패 위험이 대두되었다.

본 문서는 JSON 다운로드 기능의 누락 원인 규명, UI 복구 내역, 대용량 JSON 처리 한계 분석 및 3가지 모드(Full, Selected Frame, Diagnostic)의 경량화 아키텍처 설계를 확립한다.

---

## 2. JSON 다운로드 기능 소실 원인 및 복구 감사

### 2.1 소실 원인 분석
- `apps/web/src/App.tsx`의 UI 흐름이 "Figma URL 입력 → 변환 시작 → DOCX 다운로드"의 단일 간소화 파이프라인으로 전환되면서, 개발자/테스터 전용으로 제공되던 JSON 스냅샷 내보내기 버튼이 마크업에서 제외됨.
- 이로 인해 토큰 만료 후 재테스트를 수행하거나 형상 관리 및 회귀 테스트용 Fixture를 수집하는 작업이 차단되는 병목이 발생함.

### 2.2 복구 조치
- `apps/web/src/App.tsx`에 `createFigmaSnapshot()` 호출 및 JSON 다운로드 트리거 버튼을 성공적으로 복구함:
  - 변환 성공 화면에 `JSON 스냅샷 저장 (.json)` 버튼 추가.
  - Figma API 응답 데이터(`figmaNode`), 메타데이터(`metadata`), 이미지 맵(`imageMap`)을 `FigmaSnapshot v1.0` 표준 규격으로 패키징.
  - `URL.createObjectURL(new Blob([jsonStr], { type: "application/json" }))` 방식으로 안정적 로컬 저장 지원.

---

## 3. 대용량 JSON (186.5 MB) 처리 및 브라우저 성능 감사

### 3.1 메모리 사용량 프로파일
- `펜테크 3차 디자인.json`의 실제 용량: **186.52 MB (디스크 기준)**.
- 브라우저 V8 엔진에서의 메모리 풋프린트:
  1. 원본 Figma JSON 객체 트리: 메모리 점유 약 **280 ~ 350 MB**.
  2. `JSON.stringify(rawDoc)` 실행 시: 약 **200 MB**의 단일 UTF-16 문자열 버퍼 생성.
  3. `new Blob([jsonStr])` 생성 및 다운로드: 추가 **200 MB** 메모리 할당.
  4. 순간 최대 힙 점유량(Peak Heap): **약 700 ~ 900 MB**에 도달.
- **위험성**: 저사양 PC나 모바일 브라우저 환경에서는 1GB 메모리 초과로 브라우저 탭 크래시(OOM: Out-Of-Memory) 발생 위험이 있음.

---

## 4. 3가지 JSON 내보내기 모드 아키텍처 설계

대용량 디자인 파일의 효율적 보관 및 테스트 환경 격리를 위해 다음 3단계 모드를 지원한다.

```
+-----------------------------------------------------------------+
|                   Figma Design Data (186.5 MB)                  |
+-----------------------------------------------------------------+
          |                               |                     |
          v                               v                     v
   [ Full Mode ]               [ Selected Frame Mode ]   [ Diagnostic Mode ]
- 원본 FigmaNode 트리          - 선택된 프레임 노드만 보존  - Canvas IR + 메타데이터
- 전체 imageMap 보존           - 해당 프레임 참조 이미지만   - 이미지 바이너리 제외
- 용량: ~180 MB                - 용량: ~5 - 15 MB (90% 절감)- 용량: ~500 KB - 2 MB
- 용도: 완전 무결 아카이빙       - 용도: 단위 화면 디버깅     - 용도: CI 회귀 테스트 / 기하학 검증
```

### 4.1 모드 1: Full JSON (완전 무결 아카이빙)
- **구조**:
  - `version: "1.0"`
  - `figmaNode`: 최상위 Canvas/Document 노드 전체
  - `imageMap`: 추출된 모든 해시의 base64/URL 맵
  - `metadata`: 파일명, 내보낸 시각, 원본 파일 키
- **특징**: Figma 로그인 정보 없이도 100% 동일한 변환 결과를 영구히 재현 가능.

### 4.2 모드 2: Selected Frame JSON (선택 프레임 중심)
- **알고리즘**:
  1. 사용자가 UI에서 선택한 프레임 ID 목록(`selectedFrameIds`)을 수집함.
  2. `rootNode.children`에서 선택된 프레임 및 필수 컴포넌트만 필터링하여 하위 트리를 축소함.
  3. 해당 하위 트리에서 실제로 참조된 `imageRef` 해시 집합을 추출함.
  4. `imageMap`에서 참조되지 않은 대용량 미사용 이미지를 완전히 제거함.
- **효과**: 30개 화면 중 1~2개 화면만 추출할 경우 파일 크기가 **186MB에서 약 5~10MB로 95% 이상 격감**하여 브라우저 크래시 없이 즉시 저장 가능.

### 4.3 모드 3: Diagnostic JSON (초경량 변환 검증)
- **알고리즘**:
  1. `FigmaCanvasParser`가 파싱한 `CanvasDocument` IR 구조만 직렬화함.
  2. 노드별 기하학적 좌표(`bounds`), 스타일(`fills`, `strokes`), 텍스트 속성(`fontSize`, `lineHeight`, `wrap`)만 보존함.
  3. 이미지 바이너리는 더미 플레이스홀더(크기 정보만 유지)로 대체함.
- **효과**: 파일 크기가 **수백 KB** 수준으로 압축되어 Git 공개 저장소의 테스트 Fixture로 직접 커밋 가능.

---

## 5. UI 가이드 및 사용자 안전 장치 권장사항

1. **사전 용량 안내 (Pre-flight Size Estimate)**:
   - JSON 다운로드 버튼 옆에 예상 크기를 표시 (`약 180 MB`, `선택 화면만: 약 8 MB`).
2. **청크 기반 스트리밍 권장**:
   - 브라우저 환경에서 `JSON.stringify` 일시 실행 대신, Web Streams API(`ReadableStream`) 또는 백그라운드 Worker 처리를 적용하여 UI 블로킹 및 메모리 스파이크를 방지.
3. **토큰 및 비밀 정보 누출 원천 차단**:
   - `metadata` 객체에 Figma Personal Access Token이나 사용자 인증 세션이 절대 포함되지 않도록 마스킹 처리 유지.
