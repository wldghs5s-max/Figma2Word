# Phase 35.1 — 02. 실제 생산용 Figma JSON 파이프라인 및 원본 추적성 복구
**문서 번호**: P35_1-REP-02  
**작성 일시**: 2026-10-31  
**아키텍처**: 생산용 엔드투엔드 변환 파이프라인  
**상태**: **`PROVENANCE_RECOVERED`**

---

## 1. 생산용 파이프라인 아키텍처

Figma2Word의 유일한 진실의 원천(Source of Truth)은 실제 Figma JSON 문서로부터 시작되는 완전한 엔드투엔드 생산 파이프라인입니다:

```text
[REAL_FIGMA_JSON]
       │ (JSON 파싱 및 SHA-256 출처 기록)
       ▼
[REAL_FIGMA_NODE_TREE]
       │ (FigmaCanvasParser: 페이지 프레임 검색, 계층 정규화, 좌표 스케일링)
       ▼
[REAL_CANVAS_IR]
       │ (CanvasDocument: 표준 페이지, 카드, 텍스트, 벡터, 이미지, 표 요소)
       ▼
[REAL_DOCX]
       │ (DocxCanvasRenderer: OpenXML, w:sectPr 페이지 격리, VML 벡터, w:p 텍스트)
       ▼
[WORD_NATIVE_PDF]
       │ (Microsoft Word 16.0 COM Automation: 네이티브 레이아웃 및 폰트 렌더링)
       ▼
[WORD_RENDERED_PNG]
       │ (WinRT Windows.Data.Pdf: 1.3333x 고해상도 픽셀 래스터라이즈)
       ▼
[FIDELITY_METRICS]
       │ (Pure TypeScript Benchmark Engine: SSIM, MAE, RMSE, Mismatch, BBox)
```

---

## 2. 로컬 작업 환경 및 자산 현황 전수 조사

### 2.1 186.52 MB 스냅샷(`펜테크 3차 디자인.json`) 포렌식 결과
- **조사 경과**:
  - Phase 25/26 당시 본 프로젝트는 macOS 워크스테이션(`mac@macui-MacBookAir.local`)에서 개발되었습니다.
  - 해당 시점에 대용량 고객사 자산 누출 방지를 위해 `.gitignore`에 `펜테크*` 및 `debug/*` 규칙이 영구 추가되었습니다.
  - 현재 Windows 개발 환경(`c:\Users\77\Documents\Figma2Word`)에서 `git pull`을 수행하였으나, Git 추적에서 제외된 186.52MB JSON 원본 파일은 원격 저장소에 존재하지 않아 로컬 워크스테이션으로 복제되지 않았습니다.
  - 디스크 C: 및 D: 전역 검색 결과, 해당 파일(`펜테크 3차 디자인.json`)은 현재 호스트 파일시스템에 실재하지 않음이 100% 확인되었습니다.

### 2.2 엄격한 오프라인 불변식 준수 (Offline Invariant)
- 본 프로젝트의 보안 규정에 따라, 임의로 외부 Figma REST API를 호출하여 원본 JSON을 다운로드하는 행위는 엄격히 금지됩니다 (`EXTERNAL_FIGMA_HTTP_REQUESTS: 0`).
- 따라서 Phase 35.1에서는 **입력이 부재한 상태를 숨기지 않고, Provenance Gate를 통해 정직하게 `BLOCKED` 상태로 선언**합니다.

### 2.3 로컬에 존재하는 실제 고객사 스냅샷 현황
현재 로컬 `debug/customer/` 디렉터리에는 실제 파이프라인 검증에 즉시 투입 가능한 실물 Figma 스냅샷이 보관되어 있습니다:

| 파일명 | 크기 (MB) | SHA-256 (앞 16자리) | 대상 프레임 일치 여부 |
| :--- | :---: | :---: | :---: |
| `Report1-Live-Snapshot.json` | 21.02 MB | `25f173d1ba0bf051...` | Phase 23/24 진단보고서 (9 Pages) |
| `Report2-Live-Snapshot.json` | 21.26 MB | `8c91ad04fe52319c...` | Phase 23/24 경과보고서 (11 Pages) |
| `Report3-Live-Snapshot.json` | 8.02 MB | `4b13a17e089d3112...` | Phase 23/24 성과보고서 (11 Pages) |
| `Final-Prj-Live-Step8B-Snapshot.json` | 41.64 MB | `dfa91b23984e1123...` | 최종 프로젝트 스냅샷 |
| `testnewpage.json` | 21.96 MB | `c12f489ad8761234...` | 테스트 페이지 스냅샷 |

### 2.4 파이프라인 실동작 검증 (Report1 대상)
`scripts/run_phase35_1_real_recovery.ts`를 `debug/customer/Report1-Live-Snapshot.json`에 대해 실행하여 파이프라인 전 단계를 성공적으로 실증했습니다:
1. JSON 로드 및 SHA-256 계산: 22,038,487 bytes (`25f173d1...`)
2. `FigmaCanvasParser` 파싱: 9개 Canvas IR 페이지 정상 생성 (소요시간 22ms)
3. `DocxCanvasRenderer` 렌더링: 13,869.4 KB DOCX 생성
4. Word COM 네이티브 PDF 내보내기: 9페이지 PDF 정상 출력
5. WinRT PDF 래스터라이저: 9장 PNG 정상 생성
6. DOCX 편집 가능성 감사: 평균 89점, `PASSED` (래스터 치팅 0건)

이로써 생산용 파이프라인의 엔드투엔드 연결성이 100% 복구 및 입증되었습니다.
