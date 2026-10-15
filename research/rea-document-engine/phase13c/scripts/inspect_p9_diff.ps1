Add-Type -AssemblyName System.Drawing
$bmp = [System.Drawing.Bitmap]::FromFile((Resolve-Path "research/rea-document-engine/phase13c/comparisons/improved_canvas_vs_ref_report3/Page09-diff.png").Path)
$minY = 99999; $maxY = 0; $minX = 99999; $maxX = 0
for ($y = 0; $y -lt $bmp.Height; $y += 5) {
    for ($x = 0; $x -lt $bmp.Width; $x += 5) {
        $c = $bmp.GetPixel($x, $y)
        if ($c.R -gt 200 -and $c.B -gt 100 -and $c.G -lt 50) {
            if ($y -lt $minY) { $minY = $y }
            if ($y -gt $maxY) { $maxY = $y }
            if ($x -lt $minX) { $minX = $x }
            if ($x -gt $maxX) { $maxX = $x }
        }
    }
}
$bmp.Dispose()
Write-Host "Diff BBox: X=[$minX, $maxX], Y=[$minY, $maxY]"
