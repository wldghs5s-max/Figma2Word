param(
    [Parameter(Mandatory=$true)]
    [string]$DocxSourcePath,
    [Parameter(Mandatory=$true)]
    [string]$WorkDir,
    [int]$MaxEdits = 25
)

$ErrorActionPreference = "Stop"

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

$word = $null
$doc = $null
$word2 = $null
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

    # 1. Open in Word COM
    $word = New-Object -ComObject Word.Application
    $word.Visible = $false
    $word.DisplayAlerts = 0

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

    # Distribute edits across multiple distinct categories:
    # Cat 1: VML_TEXTBOX_TEXT (Shape TextFrame text modification)
    # Cat 2: VML_SHAPE_STROKE_COLOR (Line stroke color and weight modification)
    # Cat 3: VML_SHAPE_FILL_COLOR (Shape fill color modification)
    # Cat 4: VML_SHAPE_DIMENSION (Shape width expansion)
    # Cat 5: NATIVE_PARAGRAPH_TEXT (Document body paragraph mutation)
    # Cat 6: TABLE_CELL_TEXT (Table cell mutation if tables exist)

    for ($i = 1; $i -le $initShapes; $i++) {
        if ($attemptedEdits -ge $MaxEdits) { break }
        try {
            $shape = $doc.Shapes.Item($i)
            $leftPt = [double]$shape.Left
            $topPt = [double]$shape.Top
            $widthPt = [double]$shape.Width
            $heightPt = [double]$shape.Height
            
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
                    $targetMarker = "[PHASE38_EDIT_TEXTBOX_$attemptedEdits]"
                    $textRange.Text = $targetMarker

                    $successfulEdits++
                    $editOperations += @{
                        editIndex = $attemptedEdits
                        category = "VML_TEXTBOX_TEXT"
                        targetShapeIndex = $i
                        marker = $targetMarker
                        page = $shapePage
                        appliedSuccessfully = $true
                    }
                    $editedBoundingBoxes += @{
                        page = $shapePage
                        leftPt = $leftPt
                        topPt = $topPt
                        widthPt = $widthPt
                        heightPt = $heightPt
                        category = "VML_TEXTBOX_TEXT"
                        marker = $targetMarker
                    }
                }
            } elseif ($catSelector -eq 1) {
                # Category 2: VML_SHAPE_STROKE_COLOR
                $attemptedEdits++
                $targetMarker = "[PHASE38_EDIT_STROKE_$attemptedEdits]"
                $shape.Line.ForeColor.RGB = 0x0000FF # Pure Red in BGR
                $shape.Line.Weight = 2.0

                $successfulEdits++
                $editOperations += @{
                    editIndex = $attemptedEdits
                    category = "VML_SHAPE_STROKE_COLOR"
                    targetShapeIndex = $i
                    marker = $targetMarker
                    page = $shapePage
                    appliedSuccessfully = $true
                }
                $editedBoundingBoxes += @{
                    page = $shapePage
                    leftPt = $leftPt
                    topPt = $topPt
                    widthPt = $widthPt
                    heightPt = $heightPt
                    category = "VML_SHAPE_STROKE_COLOR"
                    marker = $targetMarker
                }
            } elseif ($catSelector -eq 2) {
                # Category 3: VML_SHAPE_FILL_COLOR
                $attemptedEdits++
                $targetMarker = "[PHASE38_EDIT_FILL_$attemptedEdits]"
                $shape.Fill.ForeColor.RGB = 0x00FF00 # Pure Green in BGR

                $successfulEdits++
                $editOperations += @{
                    editIndex = $attemptedEdits
                    category = "VML_SHAPE_FILL_COLOR"
                    targetShapeIndex = $i
                    marker = $targetMarker
                    page = $shapePage
                    appliedSuccessfully = $true
                }
                $editedBoundingBoxes += @{
                    page = $shapePage
                    leftPt = $leftPt
                    topPt = $topPt
                    widthPt = $widthPt
                    heightPt = $heightPt
                    category = "VML_SHAPE_FILL_COLOR"
                    marker = $targetMarker
                }
            } elseif ($catSelector -eq 3) {
                # Category 4: VML_SHAPE_DIMENSION
                $attemptedEdits++
                $targetMarker = "[PHASE38_EDIT_DIMENSION_$attemptedEdits]"
                $origWidth = $widthPt
                $shape.Width = $widthPt + 4.0

                $successfulEdits++
                $editOperations += @{
                    editIndex = $attemptedEdits
                    category = "VML_SHAPE_DIMENSION"
                    targetShapeIndex = $i
                    marker = $targetMarker
                    page = $shapePage
                    origWidth = $origWidth
                    appliedSuccessfully = $true
                }
                $editedBoundingBoxes += @{
                    page = $shapePage
                    leftPt = $leftPt
                    topPt = $topPt
                    widthPt = $widthPt + 4.0
                    heightPt = $heightPt
                    category = "VML_SHAPE_DIMENSION"
                    marker = $targetMarker
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
                $cell.Range.Text = $marker
                $successfulEdits++
                $editOperations += @{
                    editIndex = $attemptedEdits
                    category = "TABLE_CELL_TEXT"
                    targetTableIndex = $t
                    marker = $marker
                    page = 1
                    appliedSuccessfully = $true
                }
            } catch {}
        }
    }

    # 3. Save Document
    $wdFormatXMLDocument = 12
    $doc.SaveAs([ref]$savedDocx, [ref]$wdFormatXMLDocument)

    # Close first instance
    $doc.Close([ref]$false)
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($doc) | Out-Null
    $doc = $null
    $word.Quit([ref]$false)
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
    $word = $null

    [System.GC]::Collect()
    [System.GC]::WaitForPendingFinalizers()

    $savedDocxSha = Compute-Sha256 $savedDocx

    # 4. Save-and-Reopen Persistence Verification in Fresh Word COM instance
    $word2 = New-Object -ComObject Word.Application
    $word2.Visible = $false
    $word2.DisplayAlerts = 0

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

    foreach ($op in $editOperations) {
        $marker = $op.marker
        $cat = $op.category
        $persisted = $false

        if ($cat -eq "VML_TEXTBOX_TEXT") {
            $sIdx = $op.targetShapeIndex
            try {
                $shape = $doc2.Shapes.Item($sIdx)
                if ($shape.TextFrame -and $shape.TextFrame.HasText -ne 0) {
                    $currentText = $shape.TextFrame.TextRange.Text
                    if ($currentText -and $currentText.Contains($marker)) {
                        $persisted = $true
                        $categoryCounts["VML_TEXTBOX_TEXT"]++
                    }
                }
            } catch {}
        } elseif ($cat -eq "VML_SHAPE_STROKE_COLOR") {
            $sIdx = $op.targetShapeIndex
            try {
                $shape = $doc2.Shapes.Item($sIdx)
                if ($shape.Line.ForeColor.RGB -eq 0x0000FF -and $shape.Line.Weight -ge 1.9) {
                    $persisted = $true
                    $categoryCounts["VML_SHAPE_STROKE_COLOR"]++
                }
            } catch {}
        } elseif ($cat -eq "VML_SHAPE_FILL_COLOR") {
            $sIdx = $op.targetShapeIndex
            try {
                $shape = $doc2.Shapes.Item($sIdx)
                if ($shape.Fill.ForeColor.RGB -eq 0x00FF00) {
                    $persisted = $true
                    $categoryCounts["VML_SHAPE_FILL_COLOR"]++
                }
            } catch {}
        } elseif ($cat -eq "VML_SHAPE_DIMENSION") {
            $sIdx = $op.targetShapeIndex
            try {
                $shape = $doc2.Shapes.Item($sIdx)
                if ($shape.Width -ge ($op.origWidth + 3.0)) {
                    $persisted = $true
                    $categoryCounts["VML_SHAPE_DIMENSION"]++
                }
            } catch {}
        } elseif ($cat -eq "TABLE_CELL_TEXT") {
            $tIdx = $op.targetTableIndex
            try {
                $table = $doc2.Tables.Item($tIdx)
                $cellText = $table.Cell(1, 1).Range.Text
                if ($cellText -and $cellText.Contains($marker)) {
                    $persisted = $true
                    $categoryCounts["TABLE_CELL_TEXT"]++
                }
            } catch {}
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
        }
    }

    $doc2.Close([ref]$false)
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($doc2) | Out-Null
    $doc2 = $null
    $word2.Quit([ref]$false)
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word2) | Out-Null
    $word2 = $null

    [System.GC]::Collect()
    [System.GC]::WaitForPendingFinalizers()

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

    $result = @{
        success = $true
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
            verdict = if ($persistedCount -eq $successfulEdits -and $successfulEdits -gt 0) { "PASSED" } else { "PARTIAL" }
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

    # Write evidence summary
    $evidenceJson = Join-Path $evidenceDir "word-edit-test-summary.json"
    $result | ConvertTo-Json -Depth 6 | Set-Content -Encoding utf8 $evidenceJson

    Output-JsonResult $result
} catch {
    if ($doc) { try { $doc.Close([ref]$false) } catch {} }
    if ($word) { try { $word.Quit([ref]$false) } catch {} }
    if ($doc2) { try { $doc2.Close([ref]$false) } catch {} }
    if ($word2) { try { $word2.Quit([ref]$false) } catch {} }
    Output-JsonResult @{
        success = $false
        error = $_.Exception.Message
        stackTrace = $_.ScriptStackTrace
    }
    exit 1
}
