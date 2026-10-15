param(
    [string]$InputDocx = "debug/canvas-audit/report-1-canvas.docx"
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = (Resolve-Path "$scriptDir\..\..\..\..").Path
$inputPath = Join-Path $rootDir $InputDocx

if (-not (Test-Path $inputPath)) {
    Write-Error "Input DOCX not found: $inputPath"
}

$tempDir = Join-Path $rootDir "debug\canvas-audit\edit_test"
if (Test-Path $tempDir) { Remove-Item -Recurse -Force $tempDir }
New-Item -ItemType Directory -Path $tempDir -Force | Out-Null

$copyDocx = Join-Path $tempDir "test-editable-input.docx"
$savedDocx = Join-Path $tempDir "test-edited-saved.docx"
Copy-Item $inputPath $copyDocx

Write-Host "=================================================="
Write-Host "Phase 14B - Word COM Editability Validation Test"
Write-Host "Target Document: $copyDocx"
Write-Host "=================================================="

$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0 # wdAlertsNone

$results = @{
    openInitialSuccess = $false
    initialPageCount = 0
    totalShapesCount = 0
    textShapesCount = 0
    editableShapesCount = 0
    targetShapeId = ""
    originalText = ""
    modifiedText = ""
    saveSuccess = $false
    reopenSuccess = $false
    reopenedPageCount = 0
    textPersisted = $false
    pageCountPreserved = $false
    layoutCollapsed = $false
}

try {
    Write-Host "[1/6] Opening document in Word COM..."
    $doc = $word.Documents.Open($copyDocx, $false, $false) # ReadOnly = False
    $results.openInitialSuccess = $true
    
    $pages = $doc.ComputeStatistics(2) # wdStatisticPages
    $results.initialPageCount = $pages
    Write-Host "  Initial Page Count: $pages"

    $shapeCount = $doc.Shapes.Count
    $results.totalShapesCount = $shapeCount
    Write-Host "  Total Floating Shapes Count: $shapeCount"

    # Inspect shapes and TextFrames
    $textCount = 0
    $targetShape = $null

    for ($i = 1; $i -le $shapeCount; $i++) {
        $s = $doc.Shapes.Item($i)
        try {
            if ($s.TextFrame.HasText -ne 0) {
                $textCount++
                $text = $s.TextFrame.TextRange.Text.Trim()
                if ($targetShape -eq $null -and $text.Length -gt 5) {
                    $targetShape = $s
                    $results.targetShapeId = "Shape_$i"
                    $results.originalText = $text
                }
            }
        } catch {}
    }

    $results.textShapesCount = $textCount
    $results.editableShapesCount = $textCount
    Write-Host "  Shapes with TextFrames: $textCount"
    Write-Host "  Selected Target Shape: $($results.targetShapeId)"
    Write-Host "  Original Text: $($results.originalText)"

    Write-Host "[2/6] Editing text in selected shape via TextFrame.TextRange..."
    $newText = "Word COM 실제 편집 검증 텍스트 (Phase 14B Verified)"
    $targetShape.TextFrame.TextRange.Text = $newText
    $results.modifiedText = $newText
    Write-Host "  Successfully replaced text with: $newText"

    Write-Host "[3/6] Saving edited document directly via Document.Save()..."
    $doc.Save()
    $results.saveSuccess = $true
    Write-Host "  Saved successfully via Document.Save()."

    $doc.Close([ref]0) # wdDoNotSaveChanges
    Copy-Item $copyDocx $savedDocx -Force
    Write-Host "  Copied verified saved file to: $savedDocx"
}
catch {
    Write-Error "Error during initial edit: $_"
}
finally {
    $word.Quit()
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
    [System.GC]::Collect()
    [System.GC]::WaitForPendingFinalizers()
}

Write-Host "[4/6] Completely closed Word process."
Start-Sleep -Seconds 1

Write-Host "[5/6] Launching clean Word instance to verify reopening and persistence..."
$word2 = New-Object -ComObject Word.Application
$word2.Visible = $false
$word2.DisplayAlerts = 0

try {
    $doc2 = $word2.Documents.Open($savedDocx, $false, $true) # Open as ReadOnly for inspection
    $results.reopenSuccess = $true
    
    $pages2 = $doc2.ComputeStatistics(2)
    $results.reopenedPageCount = $pages2
    Write-Host "  Reopened Page Count: $pages2"

    if ($pages2 -eq $results.initialPageCount) {
        $results.pageCountPreserved = $true
        Write-Host "  [PASS] Page count perfectly preserved ($pages2 pages)!"
    } else {
        $results.pageCountPreserved = $false
        Write-Warning "  [WARN] Page count changed from $($results.initialPageCount) to $pages2!"
    }

    # Verify text persistence across shapes
    $shapeCount2 = $doc2.Shapes.Count
    $foundModified = $false

    for ($i = 1; $i -le $shapeCount2; $i++) {
        $s2 = $doc2.Shapes.Item($i)
        try {
            if ($s2.TextFrame.HasText -ne 0) {
                $t = $s2.TextFrame.TextRange.Text
                if ($t -like "*$($results.modifiedText)*") {
                    $foundModified = $true
                    break
                }
            }
        } catch {}
    }

    $results.textPersisted = $foundModified
    if ($foundModified) {
        Write-Host "  [PASS] Modified text successfully verified inside saved shape!"
    } else {
        Write-Warning "  [FAIL] Modified text was not found!"
    }

    $doc2.Close([ref]0)
}
catch {
    Write-Error "Error during reopen verification: $_"
}
finally {
    $word2.Quit()
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word2) | Out-Null
    [System.GC]::Collect()
    [System.GC]::WaitForPendingFinalizers()
}

Write-Host "[6/6] Validation Complete!"
$jsonPath = Join-Path $tempDir "editability_results.json"
$results | ConvertTo-Json -Depth 4 | Set-Content -Path $jsonPath -Encoding UTF8

Write-Host "Results saved to: $jsonPath"
$results

