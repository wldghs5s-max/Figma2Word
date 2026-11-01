param(
    [Parameter(Mandatory=$true)]
    [string]$DocxSourcePath,
    [Parameter(Mandatory=$true)]
    [string]$WorkDir,
    [int]$MaxEdits = 25,
    [string]$EditMode = "Normal" # "Normal" or "Stress"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

function Get-KoreanText($type) {
    if ($type -eq "Normal_Long") {
        # "실사용 텍스트 수정"
        return [System.Text.Encoding]::UTF8.GetString([byte[]]@(236,139,164,236,130,172,236,154,169,32,237,133,141,236,138,164,237,138,184,32,236,136,152,236,160,149))
    }
    if ($type -eq "Normal_Short") {
        # "수정확인"
        return [System.Text.Encoding]::UTF8.GetString([byte[]]@(236,136,152,236,160,149,237,153,149,236,157,184))
    }
    if ($type -eq "Stress_Line1") {
        # "한국어 텍스트 완전 보존 및 다중 단락 스트레스 검증용 긴 문장입니다."
        return [System.Text.Encoding]::UTF8.GetString([byte[]]@(237,149,156,234,181,173,236,150,180,32,237,133,141,236,138,164,237,138,184,32,236,153,132,236,160,132,32,235,179,180,236,161,180,32,235,176,143,32,235,139,164,236,164,145,32,235,139,168,235,157,189,32,236,138,164,237,138,184,235,160,136,236,138,164,32,234,178,128,236,166,157,236,154,169,32,234,184,180,32,235,172,184,236,158,165,236,158,133,235,139,136,235,139,164,46))
    }
    if ($type -eq "Stress_Line2") {
        # "두 번째 단락: 특수문자와 공백 및 개행 문자가 정상적으로 유지되는지 확인합니다."
        return [System.Text.Encoding]::UTF8.GetString([byte[]]@(235,145,144,32,235,178,136,236,167,184,32,235,139,168,235,157,189,58,32,237,138,185,236,136,152,235,172,184,236,158,144,236,153,128,32,234,179,181,235,176,177,32,235,176,143,32,234,176,156,237,150,137,32,235,172,184,236,158,144,234,176,128,32,236,160,149,236,131,129,236,160,129,236,156,188,235,161,156,32,236,156,160,236,167,128,235,144,152,235,138,148,236,167,128,32,237,153,149,236,157,184,237,149,169,235,139,136,235,139,164,46))
    }
    if ($type -eq "Stress_Line3") {
        # "세 번째 단락: Word COM 편집 후 저장 및 재열기 시 손실 없이 보존되어야 합니다."
        return [System.Text.Encoding]::UTF8.GetString([byte[]]@(236,132,184,32,235,178,136,236,167,184,32,235,139,168,235,157,189,58,32,87,111,114,100,32,67,79,77,32,237,142,184,236,167,145,32,237,155,132,32,236,160,128,236,158,165,32,235,176,143,32,236,158,172,236,151,180,234,184,176,32,236,139,156,32,236,134,144,236,139,164,32,236,151,134,236,157,180,32,235,179,180,236,161,180,235,144,152,236,150,180,236,149,188,32,237,149,169,235,139,136,235,139,164,46))
    }
    return ""
}

function Output-JsonResult($obj) {
    Write-Output (ConvertTo-Json -Depth 6 -InputObject $obj)
}

function Compute-Sha256($filePath) {
    if (-not (Test-Path $filePath)) { return "" }
    $hasher = [System.Security.Cryptography.SHA256]::Create()
    $stream = [System.IO.File]::OpenRead($filePath)
    $hashBytes = $hasher.ComputeHash($stream)
    $stream.Dispose()
    $hasher.Dispose()
    return [BitConverter]::ToString($hashBytes).Replace("-", "").ToLower()
}

# Safe Word COM instance launcher tracking specific PID and verifying ownership
function Start-WordComSafe {
    $beforePids = @(Get-Process -Name WINWORD -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)
    $startTimeMark = Get-Date
    $w = New-Object -ComObject Word.Application
    $w.Visible = $false
    $w.DisplayAlerts = 0
    $afterPids = @(Get-Process -Name WINWORD -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)
    $newPids = @($afterPids | Where-Object { $beforePids -notcontains $_ })
    
    $ownedPid = $null
    $isOwned = $false
    if ($newPids.Count -eq 1) {
        $p = Get-Process -Id $newPids[0] -ErrorAction SilentlyContinue
        if ($p -and $p.StartTime -ge $startTimeMark.AddSeconds(-2)) {
            $ownedPid = $newPids[0]
            $isOwned = $true
        }
    }
    return @{ Application = $w; ProcessId = $ownedPid; IsOwned = $isOwned }
}

# Safe Word COM instance cleanup terminating ONLY test's own confirmed PID if lingering
function Stop-WordComSafe($bundle, $docObj) {
    if ($docObj) {
        try { $docObj.Close([ref]$false) } catch {}
        try { [System.Runtime.InteropServices.Marshal]::ReleaseComObject($docObj) | Out-Null } catch {}
    }
    if ($bundle -and $bundle.Application) {
        try { $bundle.Application.Quit([ref]$false) } catch {}
        try { [System.Runtime.InteropServices.Marshal]::ReleaseComObject($bundle.Application) | Out-Null } catch {}
    }
    [System.GC]::Collect()
    [System.GC]::WaitForPendingFinalizers()

    # Never kill if ownership was unconfirmed or process is not strictly owned by this test instance
    if ($bundle -and $bundle.IsOwned -and $bundle.ProcessId) {
        Start-Sleep -Milliseconds 200
        $proc = Get-Process -Id $bundle.ProcessId -ErrorAction SilentlyContinue
        if ($proc -and -not $proc.HasExited -and $proc.ProcessName -eq "WINWORD") {
            try { Stop-Process -Id $bundle.ProcessId -Force -ErrorAction SilentlyContinue } catch {}
        }
    }
}

# Text normalization for Word COM TextRange comparisons
function Normalize-WordText($rawText) {
    if (-not $rawText) { return "" }
    # Remove Word control artifacts: end-of-cell (\x07), page break (\x0c), null (\x00)
    $t = $rawText -replace "[\x00\x07\x0c]", ""
    # Normalize Word paragraph/line breaks (\r\n, \r, \v) to \n
    $t = $t -replace "`r`n", "`n" -replace "`r", "`n" -replace "`v", "`n"
    # Normalize per-line whitespace while preserving line structure
    $lines = @($t -split "`n" | ForEach-Object { $_.Trim() } | Where-Object { $_.Length -gt 0 })
    return ($lines -join "`n")
}

$com1 = $null
$doc = $null
$com2 = $null
$doc2 = $null

try {
    # 0. Setup directories
    $resolvedSource = (Resolve-Path $DocxSourcePath).Path
    $resolvedWorkDir = [System.IO.Path]::GetFullPath($WorkDir)

    $origDir = Join-Path $resolvedWorkDir "originals"
    $workingDir = Join-Path $resolvedWorkDir "working-copies"
    $savedDir = Join-Path $resolvedWorkDir "saved-documents"
    $beforeDir = Join-Path $resolvedWorkDir "rendered-before"
    $afterDir = Join-Path $resolvedWorkDir "rendered-after"
    $evidenceDir = Join-Path $resolvedWorkDir "evidence"

    @($origDir, $workingDir, $savedDir, $beforeDir, $afterDir, $evidenceDir) | ForEach-Object {
        if (-not (Test-Path $_)) { New-Item -ItemType Directory -Path $_ -Force | Out-Null }
    }

    $origCopy = Join-Path $origDir "untouched_original.docx"
    Copy-Item -Path $resolvedSource -Destination $origCopy -Force

    $workingCopy = Join-Path $workingDir "candidate_working.docx"
    Copy-Item -Path $resolvedSource -Destination $workingCopy -Force

    [string]$savedDocx = [System.IO.Path]::GetFullPath((Join-Path $savedDir "candidate_edited.docx"))
    [string]$beforePdf = [System.IO.Path]::GetFullPath((Join-Path $beforeDir "before_edit.pdf"))
    [string]$afterPdf = [System.IO.Path]::GetFullPath((Join-Path $afterDir "after_edit.pdf"))

    $sourceSha = Compute-Sha256 $origCopy

    # 1. Open in Word COM with isolated PID tracking
    $com1 = Start-WordComSafe
    $word = $com1.Application

    $doc = $word.Documents.Open($workingCopy, $false, $false)

    $initSections = $doc.Sections.Count
    $initPages = $doc.ComputeStatistics(2) # wdStatisticPages
    $initShapes = $doc.Shapes.Count
    $initTables = $doc.Tables.Count
    $initParagraphs = $doc.Paragraphs.Count

    # Export Before PDF
    $wdFormatPDF = 17
    $doc.SaveAs([ref]$beforePdf, [ref]$wdFormatPDF)

    # 2. Perform Native Edits across Shapes, Textboxes, and Paragraphs
    $editOperations = @()
    $editedBoundingBoxes = @()
    $attemptedEdits = 0
    $successfulEdits = 0
    $largeForegroundCandidateCount = 0
    $largeForegroundAttempted = 0
    $largeForegroundSuccessful = 0
    $largeForegroundPersisted = 0

    for ($i = 1; $i -le $initShapes; $i++) {
        if ($attemptedEdits -ge $MaxEdits) { break }
        try {
            $shape = $doc.Shapes.Item($i)
            $leftPt = [double]$shape.Left
            $topPt = [double]$shape.Top
            $widthPt = [double]$shape.Width
            $heightPt = [double]$shape.Height
            
            $altText = ""
            $shapeName = ""
            $shapeTitle = ""
            try { $altText = $shape.AlternativeText } catch { $altText = "" }
            try { $shapeName = $shape.Name } catch { $shapeName = "" }
            try { $shapeTitle = $shape.Title } catch { $shapeTitle = "" }

            # Background canvas filter: prioritize explicit metadata, use geometry only for empty origin-anchored backdrops
            $hasText = $false
            try { $hasText = ($shape.TextFrame -and $shape.TextFrame.HasText -ne 0) } catch {}
            $isExplicitBg = ($shapeName -like "bg_*" -or $shapeTitle -like "bg_*" -or $altText -like "bg_*" -or $shapeName -like "*background*" -or $shapeTitle -like "*background*")
            # Only full-page backdrops covering entire page from origin without text are excluded
            $isCanvasBackdrop = (-not $hasText) -and ($widthPt -ge 550 -and $heightPt -ge 750) -and ($leftPt -le 15 -and $topPt -le 15)
            $isFullPageBg = $isExplicitBg -or $isCanvasBackdrop
            if ($isFullPageBg) { continue }

            $isLargeForeground = ($widthPt -gt 300 -or $heightPt -gt 300)
            if ($isLargeForeground) { $largeForegroundCandidateCount++ }

            $shapePage = 1
            try {
                $shapePage = [int]$shape.Anchor.Information(3) # wdActiveEndPageNumber
            } catch {
                $shapePage = [Math]::Max(1, [Math]::Min($initPages, [Math]::Floor(($i - 1) / [Math]::Max(1, ($initShapes / $initPages))) + 1))
            }

            $catSelector = $attemptedEdits % 4

            if ($catSelector -eq 0 -and $shape.TextFrame -and $shape.TextFrame.HasText -ne 0) {
                # Category 1: VML_TEXTBOX_TEXT
                $textRange = $shape.TextFrame.TextRange
                $origText = $textRange.Text
                if ($origText -and $origText.Trim().Length -gt 0) {
                    $attemptedEdits++
                    if ($isLargeForeground) { $largeForegroundAttempted++ }
                    $origLen = $origText.Trim().Length

                    # Capture Before Dimensions
                    $beforeLeft = $leftPt
                    $beforeTop = $topPt
                    $beforeWidth = $widthPt
                    $beforeHeight = $heightPt

                    if ($EditMode -eq "Stress") {
                        # Multi-line Korean stress text with genuine paragraph returns (\r\n)
                        $expectedLines = @(
                            "[STRESS_$attemptedEdits]",
                            (Get-KoreanText "Stress_Line1"),
                            (Get-KoreanText "Stress_Line2"),
                            (Get-KoreanText "Stress_Line3")
                        )
                        $targetMarker = $expectedLines -join "`r`n"
                    } else {
                        # Normal proportional realistic replacement text
                        $expectedLines = if ($origLen -le 4) {
                            @("[E$attemptedEdits]")
                        } elseif ($origLen -le 10) {
                            @((Get-KoreanText "Normal_Short") + " [E$attemptedEdits]")
                        } else {
                            @((Get-KoreanText "Normal_Long") + " [EDIT_$attemptedEdits]")
                        }
                        $targetMarker = $expectedLines -join "`r`n"
                    }
                    $textRange.Text = $targetMarker

                    $successfulEdits++
                    if ($isLargeForeground) { $largeForegroundSuccessful++ }

                    # Measure actual After Dimensions
                    $afterLeft = [double]$shape.Left
                    $afterTop = [double]$shape.Top
                    $afterWidth = [double]$shape.Width
                    $afterHeight = [double]$shape.Height

                    $unionLeft = [Math]::Min($beforeLeft, $afterLeft)
                    $unionTop = [Math]::Min($beforeTop, $afterTop)
                    $unionRight = [Math]::Max($beforeLeft + $beforeWidth, $afterLeft + $afterWidth)
                    $unionBottom = [Math]::Max($beforeTop + $beforeHeight, $afterTop + $afterHeight)

                    if ($EditMode -eq "Stress") {
                        # 3-paragraph text expansion in Word typically reflows downwards by approx 36-48pt
                        $unionBottom = [Math]::Max($unionBottom, $unionTop + $beforeHeight + 48.0)
                        $unionRight = [Math]::Max($unionRight, $unionLeft + $beforeWidth + 8.0)
                    }

                    $editOperations += @{
                        editIndex = $attemptedEdits
                        category = "VML_TEXTBOX_TEXT"
                        targetShapeIndex = $i
                        altText = $altText
                        shapeName = $shapeName
                        shapeTitle = $shapeTitle
                        marker = $targetMarker
                        expectedLines = $expectedLines
                        page = $shapePage
                        isLargeForeground = $isLargeForeground
                        appliedSuccessfully = $true
                    }
                    $editedBoundingBoxes += @{
                        page = $shapePage
                        leftPt = $unionLeft
                        topPt = $unionTop
                        widthPt = [Math]::Max(1.0, $unionRight - $unionLeft)
                        heightPt = [Math]::Max(1.0, $unionBottom - $unionTop)
                        category = "VML_TEXTBOX_TEXT"
                        marker = $targetMarker
                        beforeBox = @{ leftPt = $beforeLeft; topPt = $beforeTop; widthPt = $beforeWidth; heightPt = $beforeHeight }
                        afterBox = @{ leftPt = $afterLeft; topPt = $afterTop; widthPt = $afterWidth; heightPt = $afterHeight }
                    }
                }
            } elseif ($catSelector -eq 1) {
                # Category 2: VML_SHAPE_STROKE_COLOR
                $attemptedEdits++
                if ($isLargeForeground) { $largeForegroundAttempted++ }
                $targetMarker = "[PHASE38_EDIT_STROKE_$attemptedEdits]"
                $expectedLines = @($targetMarker)

                $beforeLeft = $leftPt
                $beforeTop = $topPt
                $beforeWidth = $widthPt
                $beforeHeight = $heightPt

                $shape.Line.ForeColor.RGB = 0x0000FF # Pure Red in BGR
                $shape.Line.Weight = if ($EditMode -eq "Stress") { 4.0 } else { 2.0 }

                $successfulEdits++
                if ($isLargeForeground) { $largeForegroundSuccessful++ }

                $afterLeft = [double]$shape.Left
                $afterTop = [double]$shape.Top
                $afterWidth = [double]$shape.Width
                $afterHeight = [double]$shape.Height

                $unionLeft = [Math]::Min($beforeLeft, $afterLeft)
                $unionTop = [Math]::Min($beforeTop, $afterTop)
                $unionRight = [Math]::Max($beforeLeft + $beforeWidth, $afterLeft + $afterWidth)
                $unionBottom = [Math]::Max($beforeTop + $beforeHeight, $afterTop + $afterHeight)

                $editOperations += @{
                    editIndex = $attemptedEdits
                    category = "VML_SHAPE_STROKE_COLOR"
                    targetShapeIndex = $i
                    altText = $altText
                    shapeName = $shapeName
                    shapeTitle = $shapeTitle
                    marker = $targetMarker
                    expectedLines = $expectedLines
                    page = $shapePage
                    isLargeForeground = $isLargeForeground
                    appliedSuccessfully = $true
                }
                $editedBoundingBoxes += @{
                    page = $shapePage
                    leftPt = $unionLeft
                    topPt = $unionTop
                    widthPt = [Math]::Max(1.0, $unionRight - $unionLeft)
                    heightPt = [Math]::Max(1.0, $unionBottom - $unionTop)
                    category = "VML_SHAPE_STROKE_COLOR"
                    marker = $targetMarker
                    beforeBox = @{ leftPt = $beforeLeft; topPt = $beforeTop; widthPt = $beforeWidth; heightPt = $beforeHeight }
                    afterBox = @{ leftPt = $afterLeft; topPt = $afterTop; widthPt = $afterWidth; heightPt = $afterHeight }
                }
            } elseif ($catSelector -eq 2) {
                # Category 3: VML_SHAPE_FILL_COLOR
                if ($widthPt -le 1.0 -or $heightPt -le 1.0) { continue }
                $attemptedEdits++
                if ($isLargeForeground) { $largeForegroundAttempted++ }
                $targetMarker = "[PHASE38_EDIT_FILL_$attemptedEdits]"
                $expectedLines = @($targetMarker)

                $beforeLeft = $leftPt
                $beforeTop = $topPt
                $beforeWidth = $widthPt
                $beforeHeight = $heightPt

                $shape.Fill.ForeColor.RGB = 0x00FF00 # Pure Green in BGR

                $successfulEdits++
                if ($isLargeForeground) { $largeForegroundSuccessful++ }

                $afterLeft = [double]$shape.Left
                $afterTop = [double]$shape.Top
                $afterWidth = [double]$shape.Width
                $afterHeight = [double]$shape.Height

                $unionLeft = [Math]::Min($beforeLeft, $afterLeft)
                $unionTop = [Math]::Min($beforeTop, $afterTop)
                $unionRight = [Math]::Max($beforeLeft + $beforeWidth, $afterLeft + $afterWidth)
                $unionBottom = [Math]::Max($beforeTop + $beforeHeight, $afterTop + $afterHeight)

                $editOperations += @{
                    editIndex = $attemptedEdits
                    category = "VML_SHAPE_FILL_COLOR"
                    targetShapeIndex = $i
                    altText = $altText
                    shapeName = $shapeName
                    shapeTitle = $shapeTitle
                    marker = $targetMarker
                    expectedLines = $expectedLines
                    page = $shapePage
                    isLargeForeground = $isLargeForeground
                    appliedSuccessfully = $true
                }
                $editedBoundingBoxes += @{
                    page = $shapePage
                    leftPt = $unionLeft
                    topPt = $unionTop
                    widthPt = [Math]::Max(1.0, $unionRight - $unionLeft)
                    heightPt = [Math]::Max(1.0, $unionBottom - $unionTop)
                    category = "VML_SHAPE_FILL_COLOR"
                    marker = $targetMarker
                    beforeBox = @{ leftPt = $beforeLeft; topPt = $beforeTop; widthPt = $beforeWidth; heightPt = $beforeHeight }
                    afterBox = @{ leftPt = $afterLeft; topPt = $afterTop; widthPt = $afterWidth; heightPt = $afterHeight }
                }
            } elseif ($catSelector -eq 3) {
                # Category 4: VML_SHAPE_DIMENSION
                if ($widthPt -le 1.0) { continue }
                $attemptedEdits++
                if ($isLargeForeground) { $largeForegroundAttempted++ }
                $targetMarker = "[PHASE38_EDIT_DIMENSION_$attemptedEdits]"
                $expectedLines = @($targetMarker)

                $origWidth = $widthPt
                $beforeLeft = $leftPt
                $beforeTop = $topPt
                $beforeWidth = $widthPt
                $beforeHeight = $heightPt

                $shape.Width = if ($EditMode -eq "Stress") { $widthPt * 1.3 } else { $widthPt + 4.0 }

                $successfulEdits++
                if ($isLargeForeground) { $largeForegroundSuccessful++ }

                $afterLeft = [double]$shape.Left
                $afterTop = [double]$shape.Top
                $afterWidth = [double]$shape.Width
                $afterHeight = [double]$shape.Height

                $unionLeft = [Math]::Min($beforeLeft, $afterLeft)
                $unionTop = [Math]::Min($beforeTop, $afterTop)
                $unionRight = [Math]::Max($beforeLeft + $beforeWidth, $afterLeft + $afterWidth)
                $unionBottom = [Math]::Max($beforeTop + $beforeHeight, $afterTop + $afterHeight)

                $editOperations += @{
                    editIndex = $attemptedEdits
                    category = "VML_SHAPE_DIMENSION"
                    targetShapeIndex = $i
                    altText = $altText
                    shapeName = $shapeName
                    shapeTitle = $shapeTitle
                    marker = $targetMarker
                    expectedLines = $expectedLines
                    page = $shapePage
                    origWidth = $origWidth
                    isLargeForeground = $isLargeForeground
                    appliedSuccessfully = $true
                }
                $editedBoundingBoxes += @{
                    page = $shapePage
                    leftPt = $unionLeft
                    topPt = $unionTop
                    widthPt = [Math]::Max(1.0, $unionRight - $unionLeft)
                    heightPt = [Math]::Max(1.0, $unionBottom - $unionTop)
                    category = "VML_SHAPE_DIMENSION"
                    marker = $targetMarker
                    beforeBox = @{ leftPt = $beforeLeft; topPt = $beforeTop; widthPt = $beforeWidth; heightPt = $beforeHeight }
                    afterBox = @{ leftPt = $afterLeft; topPt = $afterTop; widthPt = $afterWidth; heightPt = $afterHeight }
                }
            }
        } catch {}
    }

    # Edit Tables (if present)
    if ($initTables -gt 0 -and $attemptedEdits -lt $MaxEdits) {
        for ($t = 1; $t -le $initTables; $t++) {
            if ($attemptedEdits -ge $MaxEdits) { break }
            try {
                $table = $doc.Tables.Item($t)
                $cell = $table.Cell(1, 1)
                $origCellText = $cell.Range.Text
                $attemptedEdits++
                $marker = "[PHASE38_EDIT_TABLE_$attemptedEdits]"
                $expectedLines = @($marker)
                $cell.Range.Text = $marker
                $successfulEdits++
                $editOperations += @{
                    editIndex = $attemptedEdits
                    category = "TABLE_CELL_TEXT"
                    targetTableIndex = $t
                    marker = $marker
                    expectedLines = $expectedLines
                    page = 1
                    isLargeForeground = $false
                    appliedSuccessfully = $true
                }
            } catch {}
        }
    }

    # 3. Save Document
    $wdFormatXMLDocument = 12
    $doc.SaveAs([ref]$savedDocx, [ref]$wdFormatXMLDocument)

    # Clean up first instance safely
    Stop-WordComSafe $com1 $doc
    $com1 = $null
    $doc = $null

    $savedDocxSha = Compute-Sha256 $savedDocx

    # 4. Save-and-Reopen Persistence Verification in Fresh Word COM instance
    $com2 = Start-WordComSafe
    $word2 = $com2.Application

    $doc2 = $word2.Documents.Open($savedDocx, $false, $true) # Open saved doc strictly ReadOnly

    $reopenedSections = $doc2.Sections.Count
    $reopenedPages = $doc2.ComputeStatistics(2)
    $reopenedShapes = $doc2.Shapes.Count

    # Export After PDF
    $doc2.SaveAs([ref]$afterPdf, [ref]$wdFormatPDF)

    # Verify Persistence of Each Edited Marker
    $persistedCount = 0
    $verifiedEdits = @()
    $categoryCounts = @{
        VML_TEXTBOX_TEXT = 0
        VML_SHAPE_STROKE_COLOR = 0
        VML_SHAPE_FILL_COLOR = 0
        VML_SHAPE_DIMENSION = 0
        TABLE_CELL_TEXT = 0
    }

    function Find-Shape($docObj, $op) {
        # 1. Try match by persistent alternative text or name
        if ($op.altText -and $op.altText.Length -gt 0) {
            for ($k = 1; $k -le $docObj.Shapes.Count; $k++) {
                try {
                    $s = $docObj.Shapes.Item($k)
                    if ($s.AlternativeText -eq $op.altText) { return $s }
                } catch {}
            }
        }
        if ($op.shapeName -and $op.shapeName.Length -gt 0) {
            try {
                $s = $docObj.Shapes.Item($op.shapeName)
                if ($s) { return $s }
            } catch {}
        }
        # 2. Try match by target marker in TextFrame
        if ($op.marker -and $op.marker.Length -gt 0) {
            $firstLineMarker = ($op.marker -split "`r|`n")[0].Trim()
            for ($k = 1; $k -le $docObj.Shapes.Count; $k++) {
                try {
                    $s = $docObj.Shapes.Item($k)
                    if ($s.TextFrame -and $s.TextFrame.HasText -ne 0) {
                        $sText = $s.TextFrame.TextRange.Text
                        if ($sText -and ($sText.Contains($op.marker) -or $sText.Contains($firstLineMarker))) { return $s }
                    }
                } catch {}
            }
        }
        # 3. Fallback to index if within bounds
        if ($op.targetShapeIndex -ge 1 -and $op.targetShapeIndex -le $docObj.Shapes.Count) {
            try {
                return $docObj.Shapes.Item($op.targetShapeIndex)
            } catch {}
        }
        return $null
    }

    foreach ($op in $editOperations) {
        $marker = $op.marker
        $cat = $op.category
        $persisted = $false
        $errorMsg = $null

        if ($cat -eq "VML_TEXTBOX_TEXT") {
            try {
                $shape = Find-Shape $doc2 $op
                if ($shape -and $shape.TextFrame -and $shape.TextFrame.HasText -ne 0) {
                    $currentText = $shape.TextFrame.TextRange.Text
                    $normActual = Normalize-WordText $currentText
                    $normExpected = Normalize-WordText ($op.expectedLines -join "`n")
                    $actualLines = @($normActual -split "`n")
                    $expectedLines = @($normExpected -split "`n")

                    # 1. Encoding corruption check: check for replacement chars or unexpected question marks
                    $hasCorruptedChars = $currentText.Contains([char]0xFFFD) -or ($currentText -match "\?\?\?")

                    # 2. Strict whole-string & line-by-line order/count match (rejects partial contains, swaps, duplicates)
                    $isExactMatch = ($normActual -eq $normExpected)

                    if ($isExactMatch -and -not $hasCorruptedChars) {
                        $persisted = $true
                        $categoryCounts["VML_TEXTBOX_TEXT"]++
                        if ($op.isLargeForeground) { $largeForegroundPersisted++ }
                    } else {
                        if ($hasCorruptedChars) {
                            $errorMsg = "Korean encoding corruption detected in reopened text"
                        } elseif ($actualLines.Count -ne $expectedLines.Count) {
                            $errorMsg = "Line count mismatch: expected $($expectedLines.Count), received $($actualLines.Count)"
                        } else {
                            $mismatchIdx = 0
                            for ($k = 0; $k -le $expectedLines.Count; $k++) {
                                if ($actualLines[$k] -ne $expectedLines[$k]) {
                                    $mismatchIdx = $k + 1
                                    break
                                }
                            }
                            $errorMsg = "Content/order mismatch at line $mismatchIdx: expected '$($expectedLines[$mismatchIdx - 1])', received '$($actualLines[$mismatchIdx - 1])'"
                        }
                    }
                } else {
                    $errorMsg = "Target shape or textframe not found"
                }
            } catch {
                $errorMsg = $_.Exception.Message
            }
        } elseif ($cat -eq "VML_SHAPE_STROKE_COLOR") {
            try {
                $shape = Find-Shape $doc2 $op
                if ($shape -and $shape.Line.ForeColor.RGB -eq 0x0000FF -and $shape.Line.Weight -ge 1.9) {
                    $persisted = $true
                    $categoryCounts["VML_SHAPE_STROKE_COLOR"]++
                    if ($op.isLargeForeground) { $largeForegroundPersisted++ }
                } else {
                    $errorMsg = "Stroke color/weight mismatch on reopened shape"
                }
            } catch {
                $errorMsg = $_.Exception.Message
            }
        } elseif ($cat -eq "VML_SHAPE_FILL_COLOR") {
            try {
                $shape = Find-Shape $doc2 $op
                if ($shape -and $shape.Fill.ForeColor.RGB -eq 0x00FF00) {
                    $persisted = $true
                    $categoryCounts["VML_SHAPE_FILL_COLOR"]++
                    if ($op.isLargeForeground) { $largeForegroundPersisted++ }
                } else {
                    $errorMsg = "Fill color mismatch on reopened shape"
                }
            } catch {
                $errorMsg = $_.Exception.Message
            }
        } elseif ($cat -eq "VML_SHAPE_DIMENSION") {
            try {
                $shape = Find-Shape $doc2 $op
                if ($shape -and $shape.Width -ge ($op.origWidth + 3.0)) {
                    $persisted = $true
                    $categoryCounts["VML_SHAPE_DIMENSION"]++
                    if ($op.isLargeForeground) { $largeForegroundPersisted++ }
                } else {
                    $errorMsg = "Width dimension expansion not preserved"
                }
            } catch {
                $errorMsg = $_.Exception.Message
            }
        } elseif ($cat -eq "TABLE_CELL_TEXT") {
            $tIdx = $op.targetTableIndex
            try {
                if ($tIdx -ge 1 -and $tIdx -le $doc2.Tables.Count) {
                    $table = $doc2.Tables.Item($tIdx)
                    $cellText = $table.Cell(1, 1).Range.Text
                    if ($cellText -and $cellText.Contains($marker)) {
                        $persisted = $true
                        $categoryCounts["TABLE_CELL_TEXT"]++
                    } else {
                        $errorMsg = "Table cell text missing marker"
                    }
                } else {
                    $errorMsg = "Table index out of bounds"
                }
            } catch {
                $errorMsg = $_.Exception.Message
            }
        }

        if ($persisted) {
            $persistedCount++
        }

        $verifiedEdits += @{
            editIndex = $op.editIndex
            category = $cat
            marker = $op.marker
            page = $op.page
            persistedInReopenedDoc = $persisted
            error = $errorMsg
        }
    }

    # Clean up second instance safely
    Stop-WordComSafe $com2 $doc2
    $com2 = $null
    $doc2 = $null

    # 5. Check Layout Stability
    $pageCountStable = ($reopenedPages -eq $initPages)
    $sectionCountStable = ($reopenedSections -eq $initSections)
    $layoutStability = if ($pageCountStable -and $sectionCountStable) { "STABLE" } else { "UNSTABLE" }

    $persistenceRate = if ($successfulEdits -gt 0) { [Math]::Round(($persistedCount / $successfulEdits) * 100, 2) } else { 0 }

    # 6. Rasterize PDF pages using WinRT
    Add-Type -AssemblyName System.Runtime.WindowsRuntime
    $asTaskGeneric = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { 
        $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' 
    }[0]
    function Await($WinRtTask, $ResultType) {
        $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
        $netTask = $asTask.Invoke($null, @($WinRtTask))
        $netTask.Wait(-1) | Out-Null
        $netTask.Result
    }
    $asTaskNoResult = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { 
        $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncAction' 
    }[0]
    function AwaitAction($WinRtAction) {
        $netTask = $asTaskNoResult.Invoke($null, @($WinRtAction))
        $netTask.Wait(-1) | Out-Null
    }

    [Windows.Storage.StorageFolder, Windows.Storage, ContentType = WindowsRuntime] | Out-Null
    [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime] | Out-Null
    [Windows.Data.Pdf.PdfDocument, Windows.Data.Pdf, ContentType = WindowsRuntime] | Out-Null

    # Rasterize Before PDF
    $beforeFolder = Await ([Windows.Storage.StorageFolder]::GetFolderFromPathAsync($beforeDir)) ([Windows.Storage.StorageFolder])
    $beforeStorageFile = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($beforePdf)) ([Windows.Storage.StorageFile])
    $beforePdfDoc = Await ([Windows.Data.Pdf.PdfDocument]::LoadFromFileAsync($beforeStorageFile)) ([Windows.Data.Pdf.PdfDocument])
    for ($p = 0; $p -lt $beforePdfDoc.PageCount; $p++) {
        $page = $beforePdfDoc.GetPage($p)
        $pNumStr = ($p + 1).ToString("000")
        $pngName = "page-$pNumStr.png"
        $destFile = Await ($beforeFolder.CreateFileAsync($pngName, [Windows.Storage.CreationCollisionOption]::ReplaceExisting)) ([Windows.Storage.StorageFile])
        $stream = Await ($destFile.OpenAsync([Windows.Storage.FileAccessMode]::ReadWrite)) ([Windows.Storage.Streams.IRandomAccessStream])
        $renderOptions = New-Object Windows.Data.Pdf.PdfPageRenderOptions
        $renderOptions.DestinationWidth = [uint32][Math]::Round($page.Size.Width * 1.0)
        $renderOptions.DestinationHeight = [uint32][Math]::Round($page.Size.Height * 1.0)
        AwaitAction ($page.RenderToStreamAsync($stream, $renderOptions))
        $stream.Dispose()
        $page.Dispose()
    }

    # Rasterize After PDF
    $afterFolder = Await ([Windows.Storage.StorageFolder]::GetFolderFromPathAsync($afterDir)) ([Windows.Storage.StorageFolder])
    $afterStorageFile = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($afterPdf)) ([Windows.Storage.StorageFile])
    $afterPdfDoc = Await ([Windows.Data.Pdf.PdfDocument]::LoadFromFileAsync($afterStorageFile)) ([Windows.Data.Pdf.PdfDocument])
    for ($p = 0; $p -lt $afterPdfDoc.PageCount; $p++) {
        $page = $afterPdfDoc.GetPage($p)
        $pNumStr = ($p + 1).ToString("000")
        $pngName = "page-$pNumStr.png"
        $destFile = Await ($afterFolder.CreateFileAsync($pngName, [Windows.Storage.CreationCollisionOption]::ReplaceExisting)) ([Windows.Storage.StorageFile])
        $stream = Await ($destFile.OpenAsync([Windows.Storage.FileAccessMode]::ReadWrite)) ([Windows.Storage.Streams.IRandomAccessStream])
        $renderOptions = New-Object Windows.Data.Pdf.PdfPageRenderOptions
        $renderOptions.DestinationWidth = [uint32][Math]::Round($page.Size.Width * 1.0)
        $renderOptions.DestinationHeight = [uint32][Math]::Round($page.Size.Height * 1.0)
        AwaitAction ($page.RenderToStreamAsync($stream, $renderOptions))
        $stream.Dispose()
        $page.Dispose()
    }

    $untestedCount = [Math]::Max(0, ($initShapes + $initParagraphs) - $attemptedEdits)
    $allPersisted = ($persistedCount -eq $successfulEdits) -and ($successfulEdits -ge 1)
    $overallSuccess = $allPersisted -and $pageCountStable
    $editVerdict = if ($allPersisted -and $pageCountStable) { "PASSED" } elseif ($persistedCount -gt 0) { "PARTIAL" } else { "FAILED" }

    $result = @{
        success = $overallSuccess
        verdict = $editVerdict
        editMode = $EditMode
        largeForegroundTested = $largeForegroundPersisted
        largeForegroundStatistics = @{
            candidateCount = $largeForegroundCandidateCount
            attemptedCount = $largeForegroundAttempted
            successfulCount = $largeForegroundSuccessful
            persistedCount = $largeForegroundPersisted
        }
        sourceSha256 = $sourceSha
        savedDocxSha256 = $savedDocxSha
        beforePdfSha256 = (Compute-Sha256 $beforePdf)
        afterPdfSha256 = (Compute-Sha256 $afterPdf)
        initialMetrics = @{
            sections = $initSections
            pages = $initPages
            shapes = $initShapes
            tables = $initTables
            paragraphs = $initParagraphs
        }
        reopenedMetrics = @{
            sections = $reopenedSections
            pages = $reopenedPages
            shapes = $reopenedShapes
        }
        editStatistics = @{
            attempted = $attemptedEdits
            successful = $successfulEdits
            persisted = $persistedCount
            persistenceRatePercent = $persistenceRate
            verdict = $editVerdict
        }
        layoutStability = @{
            verdict = $layoutStability
            pageCountPreserved = $pageCountStable
            sectionCountPreserved = $sectionCountStable
        }
        editedObjectTypes = $categoryCounts
        untestedObjects = $untestedCount
        editedBoundingBoxes = $editedBoundingBoxes
        verifiedEdits = $verifiedEdits
    }

    # Write evidence summary with explicit UTF-8
    $evidenceJson = Join-Path $evidenceDir "word-edit-test-summary.json"
    $jsonContent = ConvertTo-Json -Depth 6 -InputObject $result
    [System.IO.File]::WriteAllText($evidenceJson, $jsonContent, [System.Text.Encoding]::UTF8)

    Output-JsonResult $result
    if (-not $overallSuccess) {
        exit 1
    }
} catch {
    Stop-WordComSafe $com1 $doc
    Stop-WordComSafe $com2 $doc2
    Output-JsonResult @{
        success = $false
        error = $_.Exception.Message
        stackTrace = $_.ScriptStackTrace
    }
    exit 1
}
