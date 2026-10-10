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

$matches = [regex]::Matches($xml, "<w:t[^>]*>([^<]+)</w:t>")
for ($i = 0; $i -lt $matches.Count; $i++) {
    $txt = $matches[$i].Groups[1].Value
    # check if non-ascii or interesting
    Write-Output "[$i] $txt"
}

