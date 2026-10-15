Add-Type -AssemblyName System.Drawing
$refBmp = [System.Drawing.Bitmap]::FromFile((Resolve-Path "research/rea-document-engine/phase13c/renders/ref_report3/ref-Page09.png").Path)
for ($y = 0; $y -lt $refBmp.Height; $y += 50) {
    for ($x = 1250; $x -lt $refBmp.Width; $x += 10) {
        $c = $refBmp.GetPixel($x, $y)
        if ($c.R -lt 245 -or $c.G -lt 245 -or $c.B -lt 245) {
            Write-Host "Ref Non-white at X=$x, Y=${y}: RGB($($c.R), $($c.G), $($c.B))"
            break
        }
    }
}
$refBmp.Dispose()
