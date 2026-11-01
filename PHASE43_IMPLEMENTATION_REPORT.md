# Figma2Word — Phase 43 Implementation Report
## Universal Figma Interpretation & Cross-Design Generalization
### 범용 구조 인식 · 실제 Figma 표 자동 변환 · 미사용 디자인 검증 · HWPX/DOCX 무회귀 완성

---

## 1. 개요 및 목적

본 보고서는 **Phase 43 (Universal Figma Interpretation & Cross-Design Generalization)** 구현 및 검증 결과를 기술한다.

본 Phase의 핵심 목표는 특정 고객사 디자인(`펜테크 3차 디자인.json`)에 과적합되지 않고, 임의의 새로운 Figma 디자인 입력 시에도 일관되게 고품질의 DOCX 및 HWPX 문서를 생성할 수 있는 **범용 디자인 구조 인식 엔진**을 완성하는 것이다.

### 주요 달성 내역
1. **Track A (프로세스 안전성 강화)**: 전역 `taskkill` 명령을 전면 제거하고, 테스트 프로세스가 직접 생성한 PID만 추적하여 정상 종료(`terminate`) 및 강제 종료(`kill`)하는 안전 소유권 모델(`close_owned_process`) 도입. 외부 프로세스 및 시스템 WebView2 보호.
2. **Track B & C (범용 구조 해석 및 의미론적 표 인식 엔진)**: 노드 이름에 의존하지 않고 AutoLayout, 행 높이, 열 너비 균일성, 셀 복잡도, 폼 컨트롤 배치 등을 분석하는 `semanticTableDetector.ts` 구현.
   - 대시보드 KPI 카드, 폼 레이아웃, 달력, 태그/칩 버튼 그리드, 사이드바 레이아웃 컨테이너에 대한 엄격한 False-Positive 차단 가드 구축.
   - 실제 고객사 디자인 17개 프레임 중 Page 15 및 Page 16의 4x7 점검 현황 표(`site-item`) 정확 인식. 타 15개 페이지의 오분류 제로(0).
3. **Track D (교차 디자인 일반화 및 홀드아웃 검증)**: 6대 디자인 카테고리(비즈니스 데이터 표, 대시보드, 폼, 모바일 UI, 기술 백서 레이아웃, 디자인 시스템 DataGrid) 피스처 구축 및 7종 테스트 통과.
   - 메타모픽 테스트(Metamorphic Testing): 노드 ID 및 이름을 무작위 문자열로 치환해도 표 구조가 100% 동일하게 인식됨을 검증.
4. **Track E & F (DOCX/HWPX 공통 품질 및 무회귀)**:
   - 전체 Vitest 스위트 전수 통과: **106개 파일, 728개 테스트 100% PASS (0 FAILED)**.
   - 한컴오피스 뷰어(`HwpViewer.exe`): 합성 표, 합성 다중 페이지, 고객사 17개 전 페이지 HWPX **전수 PASS**.
   - TypeScript 컴파일 0 오류, Web 번들 빌드 성공.

---

## 2. 상세 구현 내역

### 2.1 Track A: 테스트 프로세스 소유권 격리 및 안전 제어 (`scripts/test_viewer_suite.py`)
- **기존 결함**: `subprocess.run(["taskkill", "/F", "/IM", "HwpViewer.exe"])` 및 `msedgewebview2.exe` 무차별 강제 종료로 인한 외부 애플리케이션 및 사용자 작업 프로세스 중단 위험.
- **개선 구현**:
  ```python
  def close_owned_process(proc):
      if proc is None:
          return True
      try:
          if proc.poll() is None:
              proc.terminate()
              try:
                  proc.wait(timeout=2.0)
              except subprocess.TimeoutExpired:
                  proc.kill()
                  proc.wait(timeout=1.0)
          return True
      except Exception as e:
          print(f"Notice: exception closing owned PID {getattr(proc, 'pid', None)}: {e}", file=sys.stderr)
          return False
  ```
  - `Popen`으로 실행한 프로세스 객체만 추적하여 `try ... finally` 블록에서 안전 종료.
  - 외부 프로세스 이미지 이름 기반 강제 종료 완전 배제.

### 2.2 Track B & C: 의미론적 표 인식기 (`src/canvas/parser/semanticTableDetector.ts`)
- **구조적 감지 원리**:
  1. 수직 스택(Vertical AutoLayout 또는 Y좌표 순 정렬 프레임) 분석을 통한 `candidateRows` 추출.
  2. **가드 A (행 높이 제약)**: 평균 행 높이 $14\text{px} \le h_{avg} \le 85\text{px}$, 단일 행 최대 $120\text{px}$. 사이드바(281px), 대형 컨텐츠 래퍼(266px) 배제.
  3. **가드 B (행 너비 균일성)**: 행 간 너비 편차 $40\text{px}$ 이내 유지 검증.
  4. **가드 C (컨테이너 최소 규격)**: 최소 너비 $240\text{pt}$ 이상. 툴팁/작은 팝업 카드 배제.
  5. **가드 D (입력 폼 분별)**: 라벨(Col 1) + 입력창/체크박스/드롭다운(Col 2) 구조의 폼 행 검출 시 즉시 표 감지에서 제외.
  6. **가드 E (셀 내부 복잡도)**: 셀당 평균 자손 노드 수 $\le 7$, 최대 자손 노드 수 $\le 14$. 복합 UI 위젯 배제.
  7. **가드 F (필터/선택 칩 그리드)**: 지역 선택 버튼(서울/경기/인천 등) 및 단문 토큰 그리드 제외.
- **파서 통합 (`src/canvas/parser/figmaCanvasParser.ts`)**:
  - 감지된 표의 자손 노드들을 `consumedNodeIds`에 등록하여 중복 도형/텍스트 생성 방지.
  - `type: "table"` 요소로 캡슐화하여 HWPX `<hp:tbl>` 및 DOCX 네이티브 테이블로 직접 연결.

### 2.3 Track D: 일반화 피스처 및 테스트 스위트 (`tests/phase43-generalization.test.ts`)
1. **Fixture 1 (Business Data Table)**: 4x4 표, 헤더 행, `colSpan=2` 셀 병합 검증.
2. **Fixture 2 (Management Dashboard)**: 3개 지표 통계 카드, 표 오분류 차단 및 개별 카드/텍스트 보존 확인.
3. **Fixture 3 (Input Form)**: 관리자 등록 폼, 입력 상자 및 버튼 보존, 표 오분류 차단 확인.
4. **Fixture 4 (Mobile UI)**: 390x844 모바일 스크린, 중첩 AutoLayout 파싱 확인.
5. **Fixture 5 (Holdout: Technical Document)**: 기술 백서 장문 레이아웃, 콜아웃 카드 보존 및 DOCX/HWPX 정상 내보내기 검증.
6. **Fixture 6 (Holdout: Design System Component)**: `ComponentInstance / DataGrid` 중첩 컴포넌트 표 정상 인식 확인.
7. **Fixture 7 (Metamorphic Invariance)**: 모든 노드 ID 및 이름을 무작위 문자열(`random_uuid_...`, `Frame_Obj_...`)로 변조해도 순수 구조 분석에 의해 표가 100% 동일하게 인식됨을 입증.

---

## 3. 검증 결과 요약

### 3.1 테스트 스위트 결과

| 테스트 스위트 | 테스트 파일 | 결과 | 소요 시간 |
|---|:---:|:---:|:---:|
| **Phase 43 범용 일반화 테스트** | `phase43-generalization.test.ts` | **7 / 7 PASS** | 29ms |
| **Phase 42 HWPX 기능 확장 테스트** | `phase42-hwpx-expansion.test.ts` | **4 / 4 PASS** | 13ms |
| **Phase 40.5 시각 충실도 테스트** | `phase40-5-visual-fidelity.test.ts` | **4 / 4 PASS** | 23ms |
| **전체 프로젝트 Vitest 스위트** | **106개 파일** | **728 passed, 0 failed (100%)** | 84.06s |

### 3.2 HWPX 실제 뷰어 검증 (`HwpViewer.exe`)

| 대상 HWPX 문서 | 파일 크기 | 검증 방식 | 판정 결과 | 창 타이틀 확인 |
|---|:---:|:---:|:---:|:---:|
| `phase42-synthetic-table.hwpx` | 6.1 KB | 프로세스 소유권 제어 | **PASS** | 정상 렌더링 확인 |
| `phase42-synthetic-multipage.hwpx` | 6.7 KB | 프로세스 소유권 제어 | **PASS** | 정상 렌더링 확인 |
| `phase42-customer-17-pages.hwpx` | 15.7 MB | 프로세스 소유권 제어 | **PASS** | 정상 렌더링 확인 |

> [!NOTE]
> Fail-Closed 원칙에 따라, 공식 뷰어를 통한 파일 열기 및 화면 표시는 `VERIFIED`로 판정하며, 상용 한글 편집기의 대화형 편집/저장은 라이선스 분리에 따라 `NOT_VERIFIED`로 엄격히 관리합니다.

### 3.3 고객사 17개 프레임 무회귀 검증

- **총 페이지 수**: 17개 페이지
- **총 캔버스 요소 수**: 1,173개 (Page 15, 16의 표 셀들이 2개의 최상위 네이티브 표 객체로 캡슐화됨)
- **표 검출 결과**:
  - Page 15 (`site-item`): 4행 x 7열 네이티브 표 (점검 진행 현황)
  - Page 16 (`site-item`): 4행 x 7열 네이티브 표 (점검 진행 현황)
  - 타 15개 페이지: 오분류 0건 (사이드바, 필터, 폼, 팝업 카드 완전 보존)

---

## 4. 빌드 및 산출물 무결성

- **TypeScript (`npx tsc --noEmit`)**: 0 errors
- **Web App (`npm --prefix apps/web run build`)**: Vite 클라이언트 프로덕션 번들링 성공 (363ms)
- **Git HEAD 상태**: 안전하게 커밋 및 원격 `origin/master` 동기화 준비 완료.
