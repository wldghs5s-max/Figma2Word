param(
    [string]$DocxPath = "debug/real-figma-screen01-after.docx",
    [string]$PngPrefix = "screen01-after"
)

Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | ? { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
function Await($WinRtTask, $ResultType) {
    $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
    $netTask = $asTask.Invoke($null, @($WinRtTask))
    $netTask.Wait(-1) | Out-Null
    $netTask.Result
}
[Windows.Data.Pdf.PdfDocument, Windows.Data.Pdf, ContentType = WindowsRuntime] | Out-Null
[Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime] | Out-Null

$docPath = (Resolve-Path $DocxPath).Path
$pdfPath = [System.IO.Path]::ChangeExtension($docPath, ".pdf")

Write-Output "Opening in Word COM: $docPath"
$word = New-Object -ComObject Word.Application
$word.Visible = $false
$doc = $word.Documents.Open($docPath, $false, $true)
$pagesCount = $doc.ComputeStatistics([Microsoft.Office.Interop.Word.WdStatistic]::wdStatisticPages)
Write-Output "Word Pages count: $pagesCount"
$doc.SaveAs([ref]$pdfPath, [ref]17)
$doc.Close([ref]$false)
$word.Quit()
[System.Runtime.Interopservices.Marshal]::ReleaseComObject($doc) | Out-Null
[System.Runtime.Interopservices.Marshal]::ReleaseComObject($word) | Out-Null
Write-Output "Exported to $pdfPath"

$storageFile = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($pdfPath)) ([Windows.Storage.StorageFile])
$pdfDoc = Await ([Windows.Data.Pdf.PdfDocument]::LoadFromFileAsync($storageFile)) ([Windows.Data.Pdf.PdfDocument])

Write-Output "PDF Page count from WinRT: $($pdfDoc.PageCount)"

$renderDir = (Resolve-Path "debug/rendered-pages").Path
for ($pIdx = 0; $pIdx -lt $pdfDoc.PageCount; $pIdx++) {
    $page = $pdfDoc.GetPage($pIdx)
    $pngFile = "$PngPrefix-p$($pIdx + 1).png"
    $pngPath = Join-Path $renderDir $pngFile
    $outFile = Await ([Windows.Storage.StorageFolder]::GetFolderFromPathAsync($renderDir)) ([Windows.Storage.StorageFolder])
    $outStorageFile = Await ($outFile.CreateFileAsync($pngFile, [Windows.Storage.CreationCollisionOption]::ReplaceExisting)) ([Windows.Storage.StorageFile])
    $stream = Await ($outStorageFile.OpenAsync([Windows.Storage.FileAccessMode]::ReadWrite)) ([Windows.Storage.Streams.IRandomAccessStream])
    
    $renderTask = $page.RenderToStreamAsync($stream)
    $asTaskVoid = ([System.WindowsRuntimeSystemExtensions].GetMethods() | ? { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncAction' })[0]
    $netTaskVoid = $asTaskVoid.Invoke($null, @($renderTask))
    $netTaskVoid.Wait(-1) | Out-Null
    
    $stream.FlushAsync() | Out-Null
    $stream.Dispose()
    Write-Output "Rendered Page $($pIdx + 1) to $pngPath"
}

