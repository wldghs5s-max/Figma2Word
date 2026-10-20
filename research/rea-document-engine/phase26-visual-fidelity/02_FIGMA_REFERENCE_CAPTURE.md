# Phase 26 — 02. 원본 Figma 시각적 기준선 확보 보고서 (Reference Capture)

**문서 작성 일시**: 2026-10-20  
**작업자**: Antigravity (Google DeepMind Advanced Agentic Coding)  
**대상 파일**: `debug/phase25-web-ui-fidelity/pentech_v3_original.json`

---

## 1. 개요 및 원본 기준선 확보 원칙

본 문서는 원본 Figma 디자인과 생성된 DOCX 문서 간의 시각적 비교를 위한 **시각적 기준선(Reference Baseline)** 확보 과정과 그 한계 및 분류 상태를 명확히 기록한다.

### 원칙 준수 (Section 1.1 및 Section 3)
1. **API 접근 불가 시 우회 금지**:
   - 로컬 작업 환경에 Figma 개인 액세스 토큰(PAT)이 존재하지 않으며, 토큰 추출이나 인증 우회는 원칙적으로 시도하지 않음.
2. **과장 및 허위 표기 금지**:
   - 원본 Figma Canvas Export 이미지가 없는 상태에서, 자체 생성한 렌더링 이미지를 "Figma 원본과 동일하다"고 주장하지 않음.
   - 원본 JSON으로부터 독립 렌더링한 이미지는 반드시 `approximate_reference`로 분류 및 명시함.
3. **완전한 기하학 추적**:
   - 17개 프레임 전수에 대해 원본 JSON의 실제 Bounding Box, Frame ID, 내부 자식 요소 수를 보존하여 매니페스트에 등록함.

---

## 2. 기준선 자산 탐색 결과

| 순위 | 기준선 확보 방식 | 상태 | 사유 및 실측 결과 |
| :---: | :--- | :---: | :--- |
| **1순위** | 로컬에 기 존재하는 Figma 프레임 Export 이미지 | **부재** | 워크스페이스 내에 Figma에서 직접 내보낸 단일 화면 PNG/JPG 파일 미존재 |
| **2순위** | Figma REST API 프레임 이미지 직접 Export | **불가** | Figma API Token 미설정 (환경 원칙 준수) |
| **3순위** | 프로젝트 내장 Figma 렌더링 / 스냅샷 | **대체 적용** | 복원된 웹 UI 스냅샷 다운로드 기능으로 추출된 186.5MB JSON 스냅샷 활용 |
| **4순위** | 원본 JSON 기반 독립 시각화 (`approximate_reference`) | **채택** | 원본 JSON의 계층 구조와 스타일, 절대좌표를 기반으로 한 독립 기준선 구축 |

---

## 3. 17개 프레임 기준선 분류 및 등록 현황

전 17개 대상 프레임은 `references/frame-manifest.json`에 정식 등록되었으며, 모든 프레임은 다음과 같이 분류된다:

- **참조 상태 (Reference Status)**: `approximate_reference`
- **입력 데이터 소스**: `pentech_v3_original.json` (Figma Canvas Node `756:2`)
- **총 프레임 수**: 17개
- **프레임별 요소 수 범위**: 최소 1개(단일 이미지 래핑 뷰) ~ 최대 228개(복합 대시보드 뷰)

### 프레임별 기준선 특성 요약
1. **초대형 와이드 웹 UI (1920 × 1080 / 1170 / 1221 px, 9개 화면)**:
   - Page 1, 2, 4, 8, 10, 14, 15, 16, 17
   - 대시보드, 지도 뷰, 프로젝트 목록, 마법사 단계 모달 화면
   - Canvas IR에서 $1440 \times 877.5$ pt 등으로 스케일 변환됨.
2. **모달 / 팝업 컴포넌트 (504 × 613 / 935 px, 2개 화면)**:
   - Page 11 (`필터`), Page 13 (`사업정보 수정`)
   - 500px 미만의 독립 팝업 폼 컴포넌트
3. **코멘트 / 피드백 수반 화면 (1178 × 1291 px / 1449 × 1083 px, 5개 화면)**:
   - Page 5, 6, 7, 9, 12
   - 디자이너와 개발자 간의 피드백 메모 및 스크린샷이 첨부된 화면
4. **표준 A4 변환 화면 (1440 × 1024 px, 1개 화면)**:
   - Page 3 (`Desktop - 1`)
   - A4 landscape ($841.89 \times 595.28$ pt) 규격으로 정확히 피팅됨.

---

## 4. 미검증 항목 및 향후 과제

- **텍스트 글꼴 렌더링 차이**: Figma의 Pretendard 렌더링(Skia 엔진 기반)과 Microsoft Word의 DirectWrite / 시스템 폰트 치환 간의 자간 및 행간 차이는 순수 정적 JSON 비교로는 포착할 수 없으며, Phase C의 Word 네이티브 렌더링 파이프라인을 통해 실측해야 함.
- **벡터 패스 곡률 보존**: SVG 패스에서 VML `<v:shape path="...">`로 변환 시 베지어 곡선 보존 상태는 픽셀 차이 히트맵으로 정량화됨.
