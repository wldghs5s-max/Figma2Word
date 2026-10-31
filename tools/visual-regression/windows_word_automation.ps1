param(
    [Parameter(Mandatory=$true)]
    [string]$DocxPath,
    [Parameter(Mandatory=$true)]
    [string]$PdfPath,
    [Parameter(Mandatory=$true)]
    [string]$ImagesDir,
    [double]$ScaleFactor = 1.3333333
)

$ErrorActionPreference = "Stop"

function Output-JsonResult($obj) {
    Write-Output (ConvertTo-Json -Compress -Depth 5 -InputObject $obj)
}

function Compute-Sha256($filePath) {
    $hasher = [System.Security.Cryptography.SHA256]::Create()
    $stream = [System.IO.File]::OpenRead($filePath)
    $hashBytes = $hasher.ComputeHash($stream)
    $stream.Dispose()
    $hasher.Dispose()
    return [BitConverter]::ToString($hashBytes).Replace("-", "").ToLower()
}

$resolvedDocx = (Resolve-Path $DocxPath).Path
if (-not (Test-Path $resolvedDocx)) {
    Output-JsonResult @{ success = $false; error = "Input DOCX file not found: $DocxPath" }
    exit 0
}

$pdfDir = Split-Path $PdfPath
if ($pdfDir -and -not (Test-Path $pdfDir)) {
    New-Item -ItemType Directory -Path $pdfDir -Force | Out-Null
}
$resolvedPdf = [System.IO.Path]::GetFullPath($PdfPath)

if (-not (Test-Path $ImagesDir)) {
    New-Item -ItemType Directory -Path $ImagesDir -Force | Out-Null
}
$resolvedImagesDir = (Resolve-Path $ImagesDir).Path

$wordWasRunning = (Get-Process -Name "WINWORD" -ErrorAction SilentlyContinue).Count -gt 0
$word = $null
$doc = $null

try {
    # 1. Open target DOCX safely in Microsoft Word
    $word = New-Object -ComObject Word.Application
    $word.Visible = $false
    $word.DisplayAlerts = 0 # wdAlertsNone

    $doc = $word.Documents.Open($resolvedDocx, $false, $true) # ReadOnly: true

    # 2. Export to PDF (wdFormatPDF = 17)
    $wdFormatPDF = 17
    $doc.SaveAs([ref]$resolvedPdf, [ref]$wdFormatPDF)
    $doc.Close([ref]$false)
    $doc = $null

    # If Word was not running originally, close the application
    if (-not $wordWasRunning) {
        $word.Quit([ref]$false)
        $word = $null
    }
} catch {
    if ($doc) { try { $doc.Close([ref]$false) } catch {} }
    if (-not $wordWasRunning -and $word) { try { $word.Quit([ref]$false) } catch {} }
    Output-JsonResult @{ success = $false; error = "Word automation failed: $_" }
    exit 0
}

# 3. Rasterize PDF pages using WinRT Windows.Data.Pdf
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTaskGeneric = [System.WindowsRuntimeSystemExtensions].GetMethods() | ? { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' }[0]
function Await($WinRtTask, $ResultType) {
    $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
    $netTask = $asTask.Invoke($null, @($WinRtTask))
    $netTask.Wait(-1) | Out-Null
    $netTask.Result
}

$asTaskNoResult = [System.WindowsRuntimeSystemExtensions].GetMethods() | ? { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncAction' }[0]
function AwaitAction($WinRtAction) {
    $netTask = $asTaskNoResult.Invoke($null, @($WinRtAction))
    $netTask.Wait(-1) | Out-Null
}

try {
    [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime] | Out-Null
    [Windows.Data.Pdf.PdfDocument, Windows.Data.Pdf, ContentType = WindowsRuntime] | Out-Null

    $storageFile = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($resolvedPdf)) ([Windows.Storage.StorageFile])
    $pdfDoc = Await ([Windows.Data.Pdf.PdfDocument]::LoadFromFileAsync($storageFile)) ([Windows.Data.Pdf.PdfDocument])
    $pageCount = $pdfDoc.PageCount

    $renderedPages = @()
    $folder = Await ([Windows.Storage.StorageFolder]::GetFolderFromPathAsync($resolvedImagesDir)) ([Windows.Storage.StorageFolder])

    for ($p = 0; $p -lt $pageCount; $p++) {
        $pageNum = $p + 1
        $pStr = $pageNum.ToString("000")
        $pngName = "page-$pStr.png"
        $pngPath = Join-Path $resolvedImagesDir $pngName

        if (Test-Path $pngPath) { Remove-Item $pngPath -Force }

        $page = $pdfDoc.GetPage($p)
        $destWidth = [uint32][Math]::Round($page.Size.Width * $ScaleFactor)
        $destHeight = [uint32][Math]::Round($page.Size.Height * $ScaleFactor)

        $destFile = Await ($folder.CreateFileAsync($pngName, [Windows.Storage.CreationCollisionOption]::ReplaceExisting)) ([Windows.Storage.StorageFile])
        $stream = Await ($destFile.OpenAsync([Windows.Storage.FileAccessMode]::ReadWrite)) ([Windows.Storage.Streams.IRandomAccessStream])

        $opts = New-Object Windows.Data.Pdf.PdfPageRenderOptions
        $opts.DestinationWidth = $destWidth
        $opts.DestinationHeight = $destHeight

        AwaitAction ($page.RenderToStreamAsync($stream, $opts))
        $stream.Dispose()
        $page.Dispose()

        $sha256 = Compute-Sha256 $pngPath
        $renderedPages += @{
            pageNumber = $pageNum
            pngPath = $pngPath
            widthPx = [int]$destWidth
            heightPx = [int]$destHeight
            sha256 = $sha256
        }
    }

    $docxSha256 = Compute-Sha256 $resolvedDocx
    $pdfSha256 = Compute-Sha256 $resolvedPdf

    Output-JsonResult @{
        success = $true
        docxPath = $resolvedDocx
        docxSha256 = $docxSha256
        pdfPath = $resolvedPdf
        pdfSha256 = $pdfSha256
        pageCount = $pageCount
        renderedPages = $renderedPages
    }
} catch {
    Output-JsonResult @{ success = $false; error = "PDF rasterization failed: $_" }
}
