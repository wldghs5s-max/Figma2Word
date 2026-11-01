# Figma2Word — Project Handoff & Technical Status

## 1. 프로젝트 정체성 및 비전

**Figma2Word**는 Figma 디자인 데이터를 실무 환경에서 바로 활용 가능한 **Microsoft Word(.docx)** 및 **한컴오피스 한글(.hwpx)** 문서로 정밀 변환하는 단일 캔버스 기반 로컬 변환 엔진입니다.

* **최종 목표**:
  1. Figma 디자인 레이아웃 및 스타일의 고충실도 시각 재현.
  2. 생성된 Word 및 한글 문서의 네이티브 객체 수준 실사용 편집성 보장.
  3. 동일한 중간 표현(Canvas IR)을 기반으로 DOCX 및 HWPX를 완벽하게 생성하는 이중 문서 렌더링 파이프라인 완성.

---

## 2. 핵심 아키텍처 개요

```
[ Figma Node Tree / JSON ]
          │
          ▼
┌───────────────────────────┐
│   FigmaCanvasParser       │ (2D 절대 좌표계 정규화, 스케일링, 인셋 계산)
└─────────┬─────────────────┘
          │
          ▼
┌───────────────────────────┐
│       Canvas IR           │ (CanvasDocument, CanvasPage, CanvasElement)
└─────┬───────────────┬─────┘
      │               │
      ▼               ▼
┌─────────────┐ ┌─────────────┐
│    DOCX     │ │    HWPX     │
│  Renderer   │ │  Renderer   │
└─────┬───────┘ └─────┬───────┘
      │               │
      ▼               ▼
[.docx (Word)]  [.hwpx (한글)]
```

---

## 3. 구현 현황 및 핵심 성과 (Phase 43 완료)

### 3.1 Phase 43: Universal Figma Interpretation & Cross-Design Generalization
1. **프로세스 소유권 격리 및 안전 제어 (Track A)**:
   - 무차별 전역 `taskkill` 명령을 전면 제거하고, 테스트 프로세스가 직접 생성한 PID만 추적하여 정상 종료(`terminate`) 및 강제 종료(`kill`)하는 안전 소유권 모델(`close_owned_process`) 도입. 외부 프로세스 및 시스템 WebView2 보호.
2. **범용 디자인 구조 해석 및 의미론적 표 인식 엔진 (Track B & C)**:
   - 노드 이름에 의존하지 않고 AutoLayout, 행 높이, 행 너비 균일성, 셀 복잡도, 폼 컨트롤 배치를 종합 분석하는 `semanticTableDetector.ts` 구현.
   - 대시보드 KPI 카드, 폼 레이아웃, 달력, 태그/칩 버튼 그리드, 사이드바 레이아웃 컨테이너에 대한 엄격한 False-Positive 차단 가드 구축.
   - 실제 고객사 디자인 17개 프레임 중 Page 15 및 Page 16의 4x7 점검 현황 표(`site-item`) 정확 인식. 타 15개 페이지의 오분류 제로(0).
3. **교차 디자인 일반화 및 홀드아웃 검증 (Track D)**:
   - 6대 디자인 카테고리(비즈니스 데이터 표, 대시보드, 폼, 모바일 UI, 기술 백서 레이아웃, 디자인 시스템 DataGrid) 피스처 구축 및 7종 테스트 통과.
   - 메타모픽 테스트(Metamorphic Testing): 노드 ID 및 이름을 무작위 문자열로 치환해도 표 구조가 100% 동일하게 인식됨을 입증.
4. **전체 테스트 및 뷰어 무회귀 검증 (Track E & F)**:
   - 전체 Vitest 스위트 전수 통과: **106개 파일, 728개 테스트 100% PASS (0 FAILED)**.
   - 한컴오피스 2024 뷰어(`HwpViewer.exe`): 합성 표, 합성 다중 페이지, 고객사 17개 전 페이지 HWPX **전수 PASS**.
   - TypeScript 컴파일 0 오류, Web 번들 빌드 성공.

### 3.2 핵심 벤치마크 지표

| 지표 항목 | Phase 42 | Phase 43 (Current) | 판정 기준 | 최종 상태 |
|---|:---:|:---:|:---:|:---:|
| **범용 표 자동 인식 엔진** | 미지원 (수동 IR) | **완전 지원 (`semanticTableDetector`)** | AutoLayout / Stack 분석 | **VERIFIED** |
| **False-Positive 오분류 방지** | N/A | **100% 차단 (6대 가드)** | 대시보드/폼/사이드바 보호 | **VERIFIED** |
| **메타모픽 구조 불변성 검증** | N/A | **100% PASS** | ID/Name 변조 시에도 동일 인식 | **VERIFIED** |
| **테스트 프로세스 소유권 격리** | 불안정 (taskkill) | **완전 격리 (`close_owned_process`)** | 소유 PID만 종료, WebView2 보호 | **VERIFIED** |
| **HWPX 뷰어 실제 열기** | PASS (3종) | **PASS (3종 전수 통과)** | HwpViewer.exe 창 열림 확인 | **VERIFIED** |
| **평균 SSIM (16개 프레임)** | 0.9502 | **0.9502** | >= 0.9400 | **PASSED (보존)** |
| **Normal Edit Persistence** | 25 / 25 (100%) | **25 / 25 (100%)** | 100% 지속 (한글 일치) | **PASSED** |
| **Stress Edit Persistence** | 25 / 25 (100%) | **25 / 25 (100%)** | 100% 지속 (전체 일치) | **HARDENED** |
| **전체 단위/통합 테스트** | 721 passed | **728 passed (100%)** | 106개 파일 전원 통과 | **PASSED** |
| **TypeScript / Web 빌드** | 0 errors | **0 errors (363ms)** | 컴파일/빌드 성공 | **PASSED** |

---

## 4. 알려진 한계 및 다음 Phase 개발 계획

1. **HWPX 편집기 인터랙티브 편집 검증 (상용 한글 라이선스 필요)**:
   * 로컬에 설치된 환경이 `HwpViewer.exe`(공식 뷰어)이므로, 열기 및 화면 표시 무결성은 확인되었으나 상용 한글 프로그램의 COM/자동화 인터랙티브 편집/저장 검증은 `NOT_VERIFIED` 상태입니다.
2. **향후 권장 개발 항목**:
   * 복합 셀 내부의 멀티라인 단락 스타일 및 텍스트 런 서식 세분화.
   * DOCX 폼 입력란 및 텍스트박스 내부 여백(inset) 미세 조정.
