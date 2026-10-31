# Phase 35.1 — 04. Microsoft Word 네이티브 자동화 안전성 및 프로세스 격리 보고서
**문서 번호**: P35_1-REP-04  
**작성 일시**: 2026-10-31  
**대상 스크립트**: `tools/visual-regression/windows_word_automation.ps1`  
**상태**: **`HARDENED_AND_VERIFIED`**

---

## 1. 개요 및 개선 목적

이전 Phase 35의 Word 자동화 스크립트는 기존 사용자의 Word가 실행 중일 때 새로 생성한 COM 인스턴스를 정상 종료하지 못하고 백그라운드 프로세스로 잔류시키는 결함이 있었습니다. 또한, 예외 발생 시 `exit 0`으로 종료되어 파이프라인이 실패를 인지하지 못하는 취약점이 존재했습니다.

Phase 35.1에서는 **10대 안전성 요구사항을 100% 만족하는 완전한 무손실·무누출 자동화 스크립트**로 전면 재작성했습니다.

---

## 2. 10대 안전성 요구사항 구현 내역

| # | 안전성 요구사항 | 구현 방식 및 코드 조치 | 상태 |
|---|---|---|:---:|
| 1 | **작업 전용 Word 인스턴스** | `New-Object -ComObject Word.Application`으로 독립 프로세스 격리 생성 | **VERIFIED** |
| 2 | **작업 대상 DOCX만 ReadOnly 열기** | `$word.Documents.Open($resolvedDocxPath, $false, $true)` (ReadOnly: true) | **VERIFIED** |
| 3 | **사용자 문서 무손실 보장** | 기존에 사용자가 열어둔 문서를 열거하거나 닫지 않으며 저장 요청 일체 배제 | **VERIFIED** |
| 4 | **COM 인스턴스 무조건 정리** | 기존 사용자 Word 실행 여부와 무관하게 자신이 생성한 `$word`는 반드시 Quit | **VERIFIED** |
| 5 | **문서 Close 보장** | `$doc.Close([ref]$false)`를 try-finally 블록에서 철저히 보장 | **VERIFIED** |
| 6 | **Application Quit 보장** | `$word.Quit([ref]$false)`를 try-finally 블록에서 철저히 보장 | **VERIFIED** |
| 7 | **COM 객체 릴리스 및 GC** | `[Marshal]::ReleaseComObject()` 및 `[GC]::Collect()` 명시적 호출 | **VERIFIED** |
| 8 | **오류 시에도 finally 정리** | 상위 try-catch 및 중첩 finally 블록으로 예외 발생 시에도 잔류 프로세스 원천 차단 | **VERIFIED** |
| 9 | **실패 시 비정상 종료 코드** | 오류 발생 시 JSON 에러 출력과 함께 **`exit 1`** 반환 (정상 완료 시에만 `exit 0`) | **VERIFIED** |
| 10 | **PDF 및 PNG 산출물 검증** | 출력 PDF 및 각 페이지 PNG 파일의 존재 여부와 바이트 크기(> 0) 필수 검증 | **VERIFIED** |

> [!CAUTION]
> 시스템 전체 `WINWORD.EXE`를 강제 종료하는 위험한 명령(`taskkill /F /IM WINWORD.EXE`)은 엄격히 금지되었으며, 일체 사용되지 않았습니다.

---

## 3. 실측 성능 및 프로세스 무결성 검증

`windows_word_automation.ps1`을 대형 26페이지 실제 문서(`debug/real-figma-whole.docx`)에 대해 실측 실행한 결과입니다:

- **입력 DOCX**: `debug/real-figma-whole.docx` (26 Pages, 185 KB, 3,759 텍스트)
- **Word COM 로드 및 PDF 내보내기**: 정상 완료 (26페이지 PDF 생성, SHA-256 검증 완료)
- **WinRT PDF 래스터라이즈**: 26장 전 페이지 고해상도 PNG(1058x1497) 래스터라이즈 완료
- **종료 후 프로세스 검사**:
  ```powershell
  Get-Process -Name "WINWORD" -ErrorAction SilentlyContinue
  # 결과: 0개 (완전 무결 잔류 프로세스 0)
  ```
- **비정상 입력 테스트**: 존재하지 않는 DOCX 파일 전달 시 `exit 1` 반환 및 JSON 오류 메시지 출력 확인 완료.
