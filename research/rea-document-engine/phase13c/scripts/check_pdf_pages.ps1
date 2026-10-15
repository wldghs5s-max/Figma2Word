Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
function Await($WinRtTask, $ResultType) {
    $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
    $netTask = $asTask.Invoke($null, @($WinRtTask))
    $netTask.Wait(-1) | Out-Null
    return $netTask.Result
}
[Windows.Data.Pdf.PdfDocument, Windows.Data.Pdf, ContentType = WindowsRuntime] | Out-Null
[Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime] | Out-Null

$refDir = Get-ChildItem -Directory | Where-Object { $_.Name -like "*20261012*" }
Write-Host "Found ref directory: $($refDir.FullName)"

$refPdfs = Get-ChildItem $refDir.FullName -Filter "*.pdf"
foreach ($pdf in $refPdfs) {
    $storageFile = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($pdf.FullName)) ([Windows.Storage.StorageFile])
    $doc = Await ([Windows.Data.Pdf.PdfDocument]::LoadFromFileAsync($storageFile)) ([Windows.Data.Pdf.PdfDocument])
    Write-Host "$($pdf.Name): $($doc.PageCount) pages"
}

$canvasPdfs = Get-ChildItem "debug/canvas-audit" -Filter "*.pdf"
foreach ($pdf in $canvasPdfs) {
    $storageFile = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($pdf.FullName)) ([Windows.Storage.StorageFile])
    $doc = Await ([Windows.Data.Pdf.PdfDocument]::LoadFromFileAsync($storageFile)) ([Windows.Data.Pdf.PdfDocument])
    Write-Host "$($pdf.Name): $($doc.PageCount) pages"
}
