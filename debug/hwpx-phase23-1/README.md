# Phase 23.1 HWPX Real Viewer Verification Guide

## 1. 개요
본 디렉터리는 Phase 23.1(Canonical Text Geometry & Overflow Recovery)에서 복구된 HWPX 문서 및 진단 산출물을 포함합니다.
모든 문서는 Canonical JSON(Canvas IR) 단일 원본에서 정밀 생성되었습니다.

## 2. 생성된 산출물 목록

| 파일명 | 형식 | 주요 검증 목적 |
|---|---|---|
| `stage6-representative-report.hwpx` | HWPX | 실무 제안서 보고서: Executive Summary 문단 줄바꿈 및 소제목 충돌 해소 검증 |
| `stage6-representative-report.docx` | DOCX | Stage 6 크로스포맷 대조군 |
| `stage7-full-report.hwpx` | HWPX | 9페이지 고객 실무 진단 보고서: 지표안내 문단(P8) 및 전 페이지 텍스트박스 너비 복구 검증 |
| `stage7-full-report.docx` | DOCX | Stage 7 크로스포맷 대조군 |
| `diag-narrow-textbox.hwpx` | HWPX | 200pt 좁은 폭 텍스트박스에서 우측 여백 낭비 없는 `BREAK_WORD` 줄바꿈 검증 |
| `diag-multiline-text.hwpx` | HWPX | 다중 문단 복합 개행 및 `lineWrap="BREAK"` 정책 보존 검증 |
| `diag-textbox-margin.hwpx` | HWPX | 텍스트박스 내부 여백(`textMargin`) 기본 0 설정 및 명시적 인셋 대조 검증 |
| `diag-adjacent-text.hwpx` | HWPX | 상하 인접 텍스트박스 간 정격 높이 유지 및 다운스트림 객체 충돌 방지 검증 |

## 3. 한컴오피스 2024 뷰어 사용자 검증 절차

1. **`diag-narrow-textbox.hwpx` 열람**:
   - 200pt 박스 내부 텍스트가 오른쪽 테두리 직전까지 꽉 채워져 줄바꿈되는지 확인합니다 (불필요한 우측 공백 해소 확인).
2. **`diag-textbox-margin.hwpx` 열람**:
   - Zero Margin 박스에서 텍스트가 좌측 테두리부터 자연스럽게 시작되는지 확인합니다.
3. **`diag-adjacent-text.hwpx` 열람**:
   - 상단 문단과 하단 소제목 사이에 점선 박스 경계가 겹치지 않고 분리되어 있는지 확인합니다.
4. **`stage6-representative-report.hwpx` 열람**:
   - `Executive Summary Lead Paragraph` 문단이 3줄로 안정적으로 배치되어 하단 소제목(`1. 핵심 기대 효과 및 도입 타당성`)과 충돌하지 않는지 확인합니다.
5. **`stage7-full-report.hwpx` 열람**:
   - 8페이지/9페이지 지표안내 카드의 본문 문장들이 충분한 좌우 너비를 활용하여 자연스럽게 개행되는지 확인합니다.
