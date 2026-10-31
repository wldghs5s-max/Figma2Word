# Phase 35.1 — 03. 독립적 Before/After 빌드 및 격리 아키텍처
**문서 번호**: P35_1-REP-03  
**작성 일시**: 2026-10-31  
**아키텍처**: Baseline 및 Improved 독립 빌드 격리  
**상태**: **`INDEPENDENT_BUILDS_ENFORCED`**

---

## 1. 개요 및 원칙

진정한 시각 충실도 비교 및 개선량 측정을 위해서는 **Baseline(수정 전)과 Improved(수정 후)가 각각 완전히 독립된 산출물 디렉터리, 독자적인 DOCX 바이너리, 독자적인 PDF 및 PNG 래스터라이즈 결과물**을 가져야 합니다.

어떠한 경우에도:
1. 단일 빌드에서 한쪽 점수를 역산하거나,
2. 동일한 PNG 이미지를 양쪽 폴더에서 공유하거나,
3. 가상의 점수 델타를 하드코딩하는 행위를 일체 금지합니다.

---

## 2. 디렉터리 구조 및 격리 사양

Phase 35.1 프로덕션 파이프라인은 다음과 같이 완벽히 분리된 물리 경로를 강제합니다:

```text
phase35-1-real-document-recovery/
├── baseline/
│   ├── actual.docx       (수정 전 렌더러로 독립 생성된 실제 DOCX)
│   ├── actual.pdf        (Word COM으로 내보낸 실제 PDF)
│   └── pages/
│       ├── page-001.png  (WinRT로 래스터라이즈된 픽셀 이미지)
│       └── ...
└── improved/
    ├── actual.docx       (수정 후 렌더러로 독립 생성된 실제 DOCX)
    ├── actual.pdf        (Word COM으로 내보낸 실제 PDF)
    └── pages/
        ├── page-001.png  (WinRT로 래스터라이즈된 픽셀 이미지)
        └── ...
```

---

## 3. 공정성 및 무결성 보장 규칙

1. **동일 입력 보장**:
   - Baseline과 Improved는 반드시 동일한 원본 Figma JSON 스냅샷(동일 SHA-256)을 입력으로 사용합니다.
2. **동일 렌더링 환경 보장**:
   - 동일한 Microsoft Word 16.0 COM 환경, 동일한 폰트 세트, 동일한 WinRT 래스터라이즈 배율(1.3333x), 동일한 8x8 SSIM 알고리즘을 사용합니다.
3. **독립 해시 추적**:
   - `metrics/provenance-manifest.json`에 `baselineDocxSha256`, `improvedDocxSha256`, `baselinePdfSha256`, `improvedPdfSha256`을 각각 독립적으로 기록합니다.
4. **무결성 게이트 감시**:
   - Baseline PNG 경로와 Improved PNG 경로가 동일한 경우 즉시 `INTEGRITY_FAIL_07C` 예외를 발생시키고 벤치마크를 무효화합니다.
   - 모든 프레임에서 동일한 델타가 관측되는 경우 즉시 `INTEGRITY_FAIL_08` 예외를 발생시켜 역산 조작을 차단합니다.
