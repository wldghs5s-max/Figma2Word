$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
$dir = "c:\Users\77\Documents\Figma2Word\samples\output\synthetic-benchmarks"

Write-Host "=== Verifying 7 Synthetic Archetypes in Word COM ==="

Get-ChildItem -Path $dir -Filter "*.docx" | ForEach-Object {
    $filePath = $_.FullName
    $doc = $word.Documents.Open($filePath, [ref]$false, [ref]$true)
    $pages = $doc.ComputeStatistics(2) # 2 = wdStatisticPages
    $shapes = $doc.Shapes.Count
    Write-Host "[OK] $($_.Name): Pages=$pages, Shapes=$shapes"
    $doc.Close([ref]$false)
}

$word.Quit()
[System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
Write-Host "=== Word COM Verification Complete ==="

