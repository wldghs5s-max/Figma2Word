Add-Type -AssemblyName System.Drawing

$b1 = New-Object System.Drawing.Bitmap("research/rea-document-engine/phase13c/renders/ref_report2/ref-Page08.png")
$b2 = New-Object System.Drawing.Bitmap("research/rea-document-engine/phase13c/renders/canvas_report2/canvas-Page08.png")

Write-Host "Sample pixels on Report 2 Page 8:"

$points = @(
    @{ Name="Header Text Area"; X=300; Y=150 },
    @{ Name="Photo 1 Center"; X=300; Y=500 },
    @{ Name="Photo 2 Center"; X=900; Y=500 },
    @{ Name="Photo 3 Center"; X=300; Y=1000 },
    @{ Name="Photo 4 Center"; X=900; Y=1000 },
    @{ Name="Photo 5 Center"; X=300; Y=1500 },
    @{ Name="Photo 6 Center"; X=900; Y=1500 }
)

foreach ($pt in $points) {
    $c1 = $b1.GetPixel($pt.X, $pt.Y)
    $c2 = $b2.GetPixel($pt.X, $pt.Y)
    $lum1 = [int](0.299 * $c1.R + 0.587 * $c1.G + 0.114 * $c1.B)
    $lum2 = [int](0.299 * $c2.R + 0.587 * $c2.G + 0.114 * $c2.B)
    $diff = [Math]::Abs($lum1 - $lum2)
    Write-Host ("[{0}] ({1}, {2}) Ref=RGB({3},{4},{5}) [L={6}] vs Canvas=RGB({7},{8},{9}) [L={10}] -> Diff={11}" -f `
        $pt.Name, $pt.X, $pt.Y, $c1.R, $c1.G, $c1.B, $lum1, $c2.R, $c2.G, $c2.B, $lum2, $diff)
}

$b1.Dispose()
$b2.Dispose()
