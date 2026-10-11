param(
    [Parameter(Mandatory=$true)]
    [string]$DocxPath,
    [Parameter(Mandatory=$true)]
    [string]$OutputDir,
    [string]$Prefix = "page",
    [int]$Width = 1400,
    [int]$TimeoutSec = 60
)

$ErrorActionPreference = "Stop"

function Output-JsonResult($obj) {
    Write-Output (ConvertTo-Json -Compress -InputObject $obj)
}

# 1. Check DOCX existence
if (-not (Test-Path $DocxPath)) {
    Output-JsonResult @{
        success = $false
        skipped = $false
        error = "File not found: $DocxPath"
        pageCount = 0
        pngPaths = @()
    }
    exit 0
}

$fullDocxPath = (Resolve-Path $DocxPath).Path

# 2. Ensure Output Directory
if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
}
$fullOutputDir = (Resolve-Path $OutputDir).Path

# 3. Setup WinRT Runtime Environment Early
try {
    Add-Type -AssemblyName System.Runtime.WindowsRuntime -ErrorAction Stop

    $asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
    function Await($WinRtTask, $ResultType) {
        $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
        $netTask = $asTask.Invoke($null, @($WinRtTask))
        $netTask.Wait(-1) | Out-Null
        return $netTask.Result
    }

    $asTaskVoid = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncAction' })[0]
    function AwaitVoid($WinRtTask) {
        $netTask = $asTaskVoid.Invoke($null, @($WinRtTask))
        $netTask.Wait(-1) | Out-Null
    }

    [Windows.Data.Pdf.PdfDocument, Windows.Data.Pdf, ContentType = WindowsRuntime] | Out-Null
    [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime] | Out-Null
    [Windows.Storage.StorageFolder, Windows.Storage, ContentType = WindowsRuntime] | Out-Null
    [Windows.Storage.Streams.IRandomAccessStream, Windows.Storage.Streams, ContentType = WindowsRuntime] | Out-Null
} catch {
    Output-JsonResult @{
        success = $false
        skipped = $true
        skipReason = "WinRT PDF runtime components unavailable: $_"
        docPath = $fullDocxPath
        pageCount = 0
        pngPaths = @()
    }
    exit 0
}

# 4. Check Word COM availability
$word = $null
try {
    $word = New-Object -ComObject Word.Application
    $word.Visible = $false
    $word.DisplayAlerts = 0
} catch {
    Output-JsonResult @{
        success = $false
        skipped = $true
        skipReason = "Microsoft Word COM is not installed or accessible: $_"
        docPath = $fullDocxPath
        pageCount = 0
        pngPaths = @()
    }
    exit 0
}

# Crucial Word COM reliability fix: Generate PDF in the same folder as DOCX
$pdfPath = [System.IO.Path]::ChangeExtension($fullDocxPath, ".pdf")
$pngPaths = @()
$stats = @{
    pages = 0
    tables = 0
    inlineShapes = 0
    floatingShapes = 0
}

try {
    # 5. Open and Export PDF via Word
    $doc = $word.Documents.Open($fullDocxPath)
    $doc.Repaginate()
    $pages = $doc.ComputeStatistics(2) # wdStatisticPages
    $tables = $doc.Tables.Count
    $inlineShapes = $doc.InlineShapes.Count
    $floatingShapes = $doc.Shapes.Count

    $stats.pages = [int]$pages
    $stats.tables = [int]$tables
    $stats.inlineShapes = [int]$inlineShapes
    $stats.floatingShapes = [int]$floatingShapes

    $doc.ExportAsFixedFormat($pdfPath, 17) # 17 = wdExportFormatPDF
    $doc.Close(0) # 0 = wdDoNotSaveChanges
} catch {
    Output-JsonResult @{
        success = $false
        skipped = $false
        error = "Word COM export failed: $_"
        docPath = $fullDocxPath
        pageCount = 0
        pngPaths = @()
    }
    exit 0
} finally {
    if ($word) {
        $word.Quit()
        [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
        $word = $null
    }
    [System.GC]::Collect()
    [System.GC]::WaitForPendingFinalizers()
}

# 6. Render PDF to PNG via WinRT directly into OutputDir
try {
    $outFolder = Await ([Windows.Storage.StorageFolder]::GetFolderFromPathAsync($fullOutputDir)) ([Windows.Storage.StorageFolder])
    $storageFile = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($pdfPath)) ([Windows.Storage.StorageFile])
    $pdfDoc = Await ([Windows.Data.Pdf.PdfDocument]::LoadFromFileAsync($storageFile)) ([Windows.Data.Pdf.PdfDocument])

    $pdfPageCount = $pdfDoc.PageCount

    for ($i = 0; $i -lt $pdfPageCount; $i++) {
        $page = $pdfDoc.GetPage($i)
        $pageNum = $i + 1
        $pngName = "$Prefix-Page$($pageNum.ToString('00')).png"
        $pngFullPath = Join-Path $fullOutputDir $pngName

        $renderFile = Await ($outFolder.CreateFileAsync($pngName, [Windows.Storage.CreationCollisionOption]::ReplaceExisting)) ([Windows.Storage.StorageFile])
        $stream = Await ($renderFile.OpenAsync([Windows.Storage.FileAccessMode]::ReadWrite)) ([Windows.Storage.Streams.IRandomAccessStream])

        $opts = New-Object Windows.Data.Pdf.PdfPageRenderOptions
        $opts.DestinationWidth = $Width

        AwaitVoid ($page.RenderToStreamAsync($stream, $opts))
        $stream.Dispose()

        $pngPaths += $pngFullPath
    }

    Output-JsonResult @{
        success = $true
        skipped = $false
        docPath = $fullDocxPath
        pdfPath = $pdfPath
        pageCount = [int]$pdfPageCount
        pngPaths = $pngPaths
        stats = $stats
    }
} catch {
    Output-JsonResult @{
        success = $false
        skipped = $false
        error = "WinRT PDF rendering failed: $_"
        docPath = $fullDocxPath
        pdfPath = $pdfPath
        pageCount = $stats.pages
        pngPaths = @()
        stats = $stats
    }
}
