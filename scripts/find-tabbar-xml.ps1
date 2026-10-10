Add-Type -AssemblyName System.IO.Compression.FileSystem

$zipPath = (Resolve-Path "debug/real-figma-screen01-after.docx").Path
$zip = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
$entry = $zip.GetEntry("word/document.xml")
$s = $entry.Open()
$r = New-Object System.IO.StreamReader($s)
$xml = $r.ReadToEnd()
$r.Close()
$s.Close()
$zip.Dispose()

# Find the bottom area with "보장분석 요약" or "표준" or "고급" or "인쇄"
$pos = $xml.LastIndexOf("보장분석 요약")
if ($pos -gt 0) {
    # Extract surrounding XML
    $start = [Math]::Max(0, $pos - 1500)
    $len = [Math]::Min($xml.Length - $start, 4000)
    Write-Output $xml.Substring($start, $len)
} else {
    Write-Output "Not found"
}

