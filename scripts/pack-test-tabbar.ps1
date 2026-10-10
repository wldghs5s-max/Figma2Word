Add-Type -AssemblyName System.IO.Compression.FileSystem

$baseDocx = (Resolve-Path "debug/real-figma-screen01-after.docx").Path
$outDocx = (Resolve-Path "debug").Path + "\test-tabbar-experiment.docx"

Copy-Item $baseDocx $outDocx -Force

$zip = [System.IO.Compression.ZipFile]::Open($outDocx, [System.IO.Compression.ZipArchiveMode]::Update)
$entry = $zip.GetEntry("word/document.xml")
$entry.Delete()

$newEntry = $zip.CreateEntry("word/document.xml")
$stream = $newEntry.Open()
$writer = New-Object System.IO.StreamWriter($stream, [System.Text.Encoding]::UTF8)
$xmlContent = [System.IO.File]::ReadAllText("scratch/test_tabbar_doc.xml", [System.Text.Encoding]::UTF8)
$writer.Write($xmlContent)
$writer.Flush()
$writer.Close()
$stream.Close()
$zip.Dispose()

Write-Output "Created $outDocx"

