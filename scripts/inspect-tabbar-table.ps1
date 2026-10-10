Add-Type -AssemblyName System.IO.Compression.FileSystem

$zipPath = (Resolve-Path "debug/real-figma-screen01-after.docx").Path
$zip = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
$entry = $zip.GetEntry("word/document.xml")
$s = $entry.Open()
$r = New-Object System.IO.StreamReader($s, [System.Text.Encoding]::UTF8)
$xml = $r.ReadToEnd()
$r.Close()
$s.Close()
$zip.Dispose()

# Locate index 50 to 61 in the XML
$targetTexts = @("보장분석", "표준", "고급", "보장상세분석", "부족보장", "인쇄", "이전", "다음")
foreach ($t in $targetTexts) {
    $idx = $xml.LastIndexOf($t)
    Write-Output "Text '$t' at pos $idx"
}

# Find the table that contains "표준"
$pos = $xml.LastIndexOf("표준")
if ($pos -gt 0) {
    # Find enclosing <w:tbl> ... </w:tbl>
    $tblStart = $xml.LastIndexOf("<w:tbl>", $pos)
    if ($tblStart -lt 0) { $tblStart = $xml.LastIndexOf("<w:tbl ", $pos) }
    $tblEnd = $xml.IndexOf("</w:tbl>", $pos) + 8
    Write-Output "--- Table containing '표준' (len: $($tblEnd - $tblStart)) ---"
    $tblXml = $xml.Substring($tblStart, $tblEnd - $tblStart)
    
    # Extract tblGrid and tr/tc structures
    $grid = [regex]::Match($tblXml, "<w:tblGrid>[\s\S]*?</w:tblGrid>").Value
    Write-Output "Grid: $grid"
    
    $cells = [regex]::Matches($tblXml, "<w:tc[\s\S]*?</w:tc>")
    Write-Output "Cell count: $($cells.Count)"
    for ($c = 0; $c -lt $cells.Count; $c++) {
        $tc = $cells[$c].Value
        $tcW = [regex]::Match($tc, '<w:tcW[^>]+/>').Value
        $shd = [regex]::Match($tc, '<w:shd[^>]+/>').Value
        $tVal = ([regex]::Matches($tc, '<w:t[^>]*>([^<]+)</w:t>') | % { $_.Groups[1].Value }) -join ' '
        Write-Output "  Cell $c : Width=$tcW | Shading=$shd | Text='$tVal'"
    }
}

