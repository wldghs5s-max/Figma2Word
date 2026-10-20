# Phase 27 — 02. Word 자동화 데이터 손실 위험 제거 및 문서 소유권 격리 보고서

**문서 작성 일시**: 2026-10-20  
**작업자**: Antigravity (Google DeepMind Advanced Agentic Coding)  
**수정 파일**: `tools/visual-regression/safe_word_automation.ts`, `tools/visual-regression/pipeline.ts`  
**보증 테스트**: `tests/word-automation-safety.test.ts` (3/3 통과)

---

## 1. 결함 발견 배경 및 위험 분석

### 1.1 지적된 위험 코드 (Phase 26 레거시)
```ts
// tools/visual-regression/pipeline.ts (Line 71-74)
try {
  execSync(`osascript -e 'tell application "Microsoft Word" to close every document saving no'`, { timeout: 10000 });
} catch {}
```

### 1.2 위험의 치명성
사용자가 로컬 Mac 환경에서 다른 업무를 위해 저장하지 않은 Word 문서(예: 회의록, 계약서, 기획서 등)를 열어둔 상태에서 시각 회귀 파이프라인이 구동될 경우, 사용자의 모든 활성 문서가 **저장되지 않은 채 강제 종료되어 복구 불가능한 데이터 손실**을 초래하는 중대한 보안/안전 결함이었다.

---

## 2. 안전 아키텍처 및 구현 내용

### 2.1 위험 명령어 전면 영구 제거
- 코드베이스 전역에서 `close every document` 및 `close documents saving no` 명령어를 완전 제거함.
- `tests/word-automation-safety.test.ts`에 정적 가드 테스트를 도입하여 향후 재도입을 원천 차단함.

### 2.2 문서 소유권 추적 (Document Ownership Tracking) 도입
`tools/visual-regression/safe_word_automation.ts`에 세 가지 안전 메커니즘을 구현함:

1. **비파괴적 상태 스냅샷 (`captureWordState`)**:
   - 실행 전 현재 실행 중인 Word 인스턴스와 기존 열려 있는 문서 목록(`initialDocumentNames`)을 읽기 전용으로 수집.
   - 기존 문서는 단 하나도 수정하거나 닫지 않음.
2. **대상 문서 엄밀 특정 (`openTargetDocumentSafely`)**:
   - `open -a "Microsoft Word" <resolvedPath>`로 열린 문서 중 오직 해당 파일명/경로와 일치하는 문서 객체만 폴링하여 바인딩.
3. **단독 저장 및 닫기 격리 (`exportAndCloseTargetDocOnly` / `cleanupTargetDocOnly`)**:
   - AppleScript 반복문에서 오직 바인딩된 `targetDocName`과 일치하는 문서만 PDF로 저장하고 닫음.
   - 예외가 발생하더라도 `cleanupTargetDocOnly`를 통해 오직 자동화가 생성한 파일만 닫히며, 사용자가 작업 중이던 기존 문서는 100% 보존됨.

---

## 3. 실측 및 모의 테스트 검증 결과

- **정적 회귀 방어**: `tools/visual-regression` 디렉토리 내의 모든 스크립트에 일괄 종료 코드가 존재하지 않음을 확인 (`expect(content).not.toContain(...)`).
- **상태 보존**: Word가 실행 중이거나 실행 중이지 않은 모든 상황에서 안전하게 상태를 스냅샷 처리함.
- **오동작 격리**: 비소유 문서에 대한 cleanup 호출 시 무시(No-op) 처리됨을 검증 완료.
