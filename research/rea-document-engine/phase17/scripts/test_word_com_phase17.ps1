# Phase 17: Microsoft Word COM Programmatic Edit & Re-open Verification
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = (Resolve-Path "$scriptDir\..\..\..\..").Path
$comDir = Join-Path $rootDir "debug\phase17-com"

Write-Host "=== Phase 17: Microsoft Word COM Editability Audit ==="
Write-Host "Target Directory: $comDir"

$files = @("brief.docx", "dashboard.docx", "report.docx")

$word = $null
try {
    $word = New-Object -ComObject Word.Application
    $word.Visible = $false
    $word.DisplayAlerts = 0
    Write-Host "Word COM Instance initialized successfully. Version: $($word.Version)"
} catch {
    Write-Host "Word COM is not available on this environment: $($_.Exception.Message)"
    exit 0
}

$results = @()

try {
    foreach ($f in $files) {
        $filePath = Join-Path $comDir $f
        if (-not (Test-Path $filePath)) {
            Write-Warning "File not found: $filePath"
            continue
        }

        Write-Host "`n--- Testing: $f ---"
        # 1. Open document
        $doc = $word.Documents.Open($filePath)
        $pages = $doc.ComputeStatistics([Microsoft.Office.Interop.Word.WdStatistic]::wdStatisticPages)
        $shapes = $doc.Shapes.Count
        Write-Host "Opened cleanly: $pages pages, $shapes shapes"

        # 2. Find a shape with text and edit it
        $edited = $false
        $origText = ""
        $newText = ""
        $editToken = "[Phase 17 Verified COM Edit]"

        for ($i = 1; $i -le $shapes; $i++) {
            $sh = $doc.Shapes.Item($i)
            if ($sh.TextFrame.HasText -ne 0) {
                $origText = $sh.TextFrame.TextRange.Text.Trim()
                if ($origText.Length -gt 2) {
                    $newText = "$origText $editToken"
                    $sh.TextFrame.TextRange.Text = $newText
                    $edited = $true
                    Write-Host "Edited Shape #${i}: '$origText' -> '$newText'"
                    break
                }
            }
        }

        # 3. Save and Close
        $doc.Save()
        $doc.Close([Microsoft.Office.Interop.Word.WdSaveOptions]::wdDoNotSaveChanges)
        Write-Host "Saved and closed."

        # 4. Re-open and verify persistence
        $doc2 = $word.Documents.Open($filePath)
        $persisted = $false
        $readBackText = ""

        for ($i = 1; $i -le $doc2.Shapes.Count; $i++) {
            $sh = $doc2.Shapes.Item($i)
            if ($sh.TextFrame.HasText -ne 0) {
                $txt = $sh.TextFrame.TextRange.Text.Trim()
                if ($txt -like "*$editToken*") {
                    $persisted = $true
                    $readBackText = $txt
                    break
                }
            }
        }

        $doc2.Close([Microsoft.Office.Interop.Word.WdSaveOptions]::wdDoNotSaveChanges)

        Write-Host "Re-opened check: Persisted=$persisted"
        if ($persisted) {
            Write-Host "Verified persisted string: '$readBackText'"
        }

        $results += [PSCustomObject]@{
            Document = $f
            Pages = $pages
            Shapes = $shapes
            Edited = $edited
            Persisted = $persisted
            Status = if ($persisted) { "PASS" } else { "FAIL" }
        }
    }
} finally {
    if ($null -ne $word) {
        $word.Quit()
        [System.Runtime.Interopservices.Marshal]::ReleaseComObject($word) | Out-Null
        [System.GC]::Collect()
        [System.GC]::WaitForPendingFinalizers()
        Write-Host "`nWord COM closed and released cleanly."
    }
}

Write-Host "`n=== SUMMARY RESULTS ==="
$results | Format-Table -AutoSize

$allPass = ($results | Where-Object { $_.Status -ne "PASS" }).Count -eq 0
if ($allPass) {
    Write-Host ">>> ALL DOCX FILES PASSED REAL WORD COM EDITABILITY & PERSISTENCE VERIFICATION! <<<"
    exit 0
} else {
    Write-Error "Some documents failed Word COM verification!"
    exit 1
}
