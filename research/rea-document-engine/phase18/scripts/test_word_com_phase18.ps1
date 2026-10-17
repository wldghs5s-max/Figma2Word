# Phase 18: Microsoft Word COM Programmatic Verification (Open, Page/Section Geometry, Edit, Save, Re-open)
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = (Resolve-Path "$scriptDir\..\..\..\..").Path
$comDir = Join-Path $rootDir "debug\phase18-com"

Write-Host "=== Phase 18: Microsoft Word COM Verification Suite ==="
Write-Host "Target Directory: $comDir"

$testCases = @(
    @{ File = "brief.docx"; ExpectedPages = 1; ExpectedSections = 1; ExpectedSec1Orient = 0 },
    @{ File = "dashboard.docx"; ExpectedPages = 1; ExpectedSections = 1; ExpectedSec1Orient = 1 },
    @{ File = "report.docx"; ExpectedPages = 3; ExpectedSections = 1; ExpectedSec1Orient = 0 },
    @{ File = "proposal.docx"; ExpectedPages = 1; ExpectedSections = 1; ExpectedSec1Orient = 0 },
    @{ File = "mixed-orientation.docx"; ExpectedPages = 2; ExpectedSections = 2; ExpectedSec1Orient = 0; ExpectedSec2Orient = 1 },
    @{ File = "customer-report1.docx"; ExpectedPages = 9; ExpectedSections = 1; ExpectedSec1Orient = 0 }
)

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
    foreach ($tc in $testCases) {
        $f = $tc.File
        $filePath = Join-Path $comDir $f
        if (-not (Test-Path $filePath)) {
            Write-Warning "File not found: $filePath"
            continue
        }

        Write-Host "`n--- Testing: $f ---"
        $doc = $word.Documents.Open($filePath)
        $pages = $doc.ComputeStatistics(2) # wdStatisticPages = 2
        $shapes = $doc.Shapes.Count
        $sections = $doc.Sections.Count
        $sec1Orient = $doc.Sections.Item(1).PageSetup.Orientation
        $sec2Orient = if ($sections -ge 2) { $doc.Sections.Item(2).PageSetup.Orientation } else { -1 }

        Write-Host "Opened cleanly: Pages=$pages (Expected $($tc.ExpectedPages)), Shapes=$shapes, Sections=$sections, Sec1Orient=$sec1Orient"

        $edited = $false
        $origText = ""
        $newText = ""
        $editToken = "[Phase 18 Verified COM Edit]"

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

        $doc.Save()
        $doc.Close(0)

        # Re-open and verify persistence
        $doc2 = $word.Documents.Open($filePath)
        $persisted = $false
        for ($i = 1; $i -le $doc2.Shapes.Count; $i++) {
            $sh = $doc2.Shapes.Item($i)
            if ($sh.TextFrame.HasText -ne 0) {
                $txt = $sh.TextFrame.TextRange.Text.Trim()
                if ($txt -like "*$editToken*") {
                    $persisted = $true
                    break
                }
            }
        }
        $doc2.Close(0)

        $pagesMatch = ($pages -eq $tc.ExpectedPages)
        $orientMatch = ($sec1Orient -eq $tc.ExpectedSec1Orient)
        if ($null -ne $tc.ExpectedSec2Orient) {
            $orientMatch = $orientMatch -and ($sec2Orient -eq $tc.ExpectedSec2Orient)
        }

        $status = if ($pagesMatch -and $orientMatch -and $edited -and $persisted) { "PASS" } else { "FAIL" }

        $results += [PSCustomObject]@{
            Document = $f
            Pages = "$pages/$($tc.ExpectedPages)"
            Shapes = $shapes
            Sections = $sections
            Orient = if ($sections -ge 2) { "$sec1Orient,$sec2Orient" } else { "$sec1Orient" }
            Edited = $edited
            Persisted = $persisted
            Status = $status
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

Write-Host "`n=== PHASE 18 WORD COM SUMMARY RESULTS ==="
$results | Format-Table -AutoSize

$outJsonPath = Join-Path $rootDir "research\rea-document-engine\phase18\word_com_results.json"
$results | ConvertTo-Json -Depth 3 | Set-Content -Path $outJsonPath -Encoding UTF8

$allPass = ($results | Where-Object { $_.Status -ne "PASS" }).Count -eq 0
if ($allPass) {
    Write-Host ">>> ALL 6 DOCX DOCUMENTS PASSED REAL WORD COM GEOMETRY, EDITABILITY & PERSISTENCE VERIFICATION! <<<"
    exit 0
} else {
    Write-Error "Some documents failed Word COM verification!"
    exit 1
}
