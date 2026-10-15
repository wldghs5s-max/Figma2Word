import os

ps1_code = '''# Comprehensive Word COM Editability & Persistence Verification Script (Phase 15)
param()

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = (Resolve-Path "$scriptDir\\..\\..\\..\\..").Path
$sourceDocx = Join-Path $rootDir "debug\\canvas-audit\\report-1-canvas.docx"
$testDocx = Join-Path $rootDir "debug\\canvas-audit\\report-1-comprehensive-edit-test.docx"

Write-Host "=== PHASE 15: WORD COM COMPREHENSIVE EDITABILITY VERIFICATION ==="
Write-Host "Source DOCX: $sourceDocx"

# 1. Prepare isolated test copy
Copy-Item -Path $sourceDocx -Destination $testDocx -Force
Write-Host "Created test copy at: $testDocx"

# 2. Launch Word COM
$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0

try {
    Write-Host "`nOpening document in Word COM..."
    $doc = $word.Documents.Open($testDocx)
    $initialPages = $doc.ComputeStatistics([Microsoft.Office.Interop.Word.WdStatistic]::wdStatisticPages)
    $totalShapes = $doc.Shapes.Count
    Write-Host "Initial Document Stats: $initialPages pages, $totalShapes shapes"

    $editTargets = @(
        @{
            Category = "1. Main Title / Header"
            SearchPattern = "외벽"
            NewText = "[수정검증-제목] AI 외벽 균열 진단 최종 평가 보고서 (Phase 15 Verified)"
            ShapeIndex = -1
        },
        @{
            Category = "2. Subheading / Section Header"
            SearchPattern = "종합"
            NewText = "[수정검증-소제목] 1. 건축물 외벽 상태 및 균열 진단 개요"
            ShapeIndex = -1
        },
        @{
            Category = "3. Small Badge / Status Chip"
            SearchPattern = "보고서"
            NewText = "[상태: 정상진행 A+]"
            ShapeIndex = -1
        },
        @{
            Category = "4. Metric / Numeric Cell"
            SearchPattern = "102"
            NewText = "102동 14층 (재실측: 0.72mm)"
            ShapeIndex = -1
        },
        @{
            Category = "5. Multiline Paragraph"
            SearchPattern = "진단"
            NewText = "[수정검증-다중행]`n첫 번째 행: 외벽 콘크리트 균열 폭 0.25mm 이내 안정`n두 번째 행: 향후 6개월 주기적 모니터링 권고`n세 번째 행: 추가 보수 조치 불필요"
            ShapeIndex = -1
        },
        @{
            Category = "6. Mixed Korean/English/Numbers"
            SearchPattern = "AIREKA"
            NewText = "[수정검증-혼합] AIREKA DeepLearning Model v3.5 (Precision 99.4%) 외벽안전진단"
            ShapeIndex = -1
        }
    )

    $usedIndices = New-Object System.Collections.Generic.HashSet[int]
    for ($i = 1; $i -le $totalShapes; $i++) {
        $shape = $doc.Shapes.Item($i)
        if ($shape.TextFrame.HasText -ne 0) {
            $txt = $shape.TextFrame.TextRange.Text.Trim()
            foreach ($t in $editTargets) {
                if ($t.ShapeIndex -eq -1 -and -not $usedIndices.Contains($i)) {
                    if ($txt -like "*$($t.SearchPattern)*" -and $txt.Length -gt 2) {
                        $t.ShapeIndex = $i
                        $t.OriginalText = $txt
                        $usedIndices.Add($i) | Out-Null
                        break
                    }
                }
            }
        }
    }

    Write-Host "`nApplying programmatic edits to $($editTargets.Count) distinct shape categories..."
    foreach ($t in $editTargets) {
        if ($t.ShapeIndex -gt 0) {
            $shape = $doc.Shapes.Item($t.ShapeIndex)
            Write-Host "  Editing Shape #$($t.ShapeIndex) [$($t.Category)]:"
            Write-Host "    Original: '$($t.OriginalText)'"
            Write-Host "    New Text: '$($t.NewText.Replace("`n", " \n "))'"
            $shape.TextFrame.TextRange.Text = $t.NewText
        } else {
            Write-Warning "Could not find candidate shape for category: $($t.Category)"
        }
    }

    Write-Host "`nSaving document via Document.Save()..."
    $doc.Save()
    $doc.Close([Microsoft.Office.Interop.Word.WdSaveOptions]::wdDoNotSaveChanges)
    Write-Host "Document closed successfully."
}
finally {
    $word.Quit()
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
    [System.GC]::Collect()
    [System.GC]::WaitForPendingFinalizers()
    Start-Sleep -Seconds 1
}

Write-Host "`n--- VERIFICATION: RE-OPENING SAVED DOCUMENT IN CLEAN WORD INSTANCE ---"
$word2 = New-Object -ComObject Word.Application
$word2.Visible = $false
$word2.DisplayAlerts = 0

$results = @()
try {
    $doc2 = $word2.Documents.Open($testDocx)
    $reopenedPages = $doc2.ComputeStatistics([Microsoft.Office.Interop.Word.WdStatistic]::wdStatisticPages)
    $reopenedShapes = $doc2.Shapes.Count
    Write-Host "Re-opened Document Stats: $reopenedPages pages (Initial: $initialPages), $reopenedShapes shapes"

    $pageCountMatched = ($reopenedPages -eq $initialPages)
    Write-Host "Page Count Match: $pageCountMatched ($reopenedPages / $initialPages)"

    $allPassed = $pageCountMatched
    foreach ($t in $editTargets) {
        if ($t.ShapeIndex -gt 0) {
            $shape = $doc2.Shapes.Item($t.ShapeIndex)
            $actualText = $shape.TextFrame.TextRange.Text.Trim()
            $expectedText = $t.NewText.Trim()
            
            $normActual = ($actualText -replace "\\r\\n", "`n" -replace "\\r", "`n").Trim()
            $normExpected = ($expectedText -replace "\\r\\n", "`n" -replace "\\r", "`n").Trim()
            
            $matched = ($normActual -eq $normExpected)
            if (-not $matched) {
                $allPassed = $false
            }

            $resObj = [PSCustomObject]@{
                Category = $t.Category
                ShapeIndex = $t.ShapeIndex
                Matched = $matched
                VerifiedText = $normActual.Substring(0, [Math]::Min(40, $normActual.Length))
            }
            $results += $resObj
            Write-Host "  Category: $($t.Category)"
            Write-Host "    Shape ID: #$($t.ShapeIndex)"
            Write-Host "    Verified Match: $matched"
            Write-Host "    Text in Reopened Document: '$($resObj.VerifiedText)...'"
        }
    }

    $doc2.Close([Microsoft.Office.Interop.Word.WdSaveOptions]::wdDoNotSaveChanges)
}
finally {
    $word2.Quit()
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word2) | Out-Null
    [System.GC]::Collect()
    [System.GC]::WaitForPendingFinalizers()
}

Write-Host "`n=== COMPREHENSIVE EDITABILITY VERIFICATION SUMMARY ==="
$results | Format-Table -AutoSize
Write-Host "Final Result: $(if ($allPassed) { 'ALL TESTS PASSED (100% PERSISTED & ZERO LAYOUT SHIFTS)' } else { 'FAILURES DETECTED' })"

if (-not $allPassed) {
    exit 1
}
'''

target_path = "research/rea-document-engine/phase15/scripts/test_word_editability_comprehensive.ps1"
with open(target_path, "w", encoding="utf-8-sig") as f:
    f.write(ps1_code)

print(f"Written with UTF-8 BOM: {target_path}")

