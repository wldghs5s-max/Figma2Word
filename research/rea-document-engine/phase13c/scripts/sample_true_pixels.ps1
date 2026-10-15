Add-Type -AssemblyName System.Drawing

$b1 = New-Object System.Drawing.Bitmap("research/rea-document-engine/phase13c/renders/ref_report1/ref-Page01.png")
$b2 = New-Object System.Drawing.Bitmap("research/rea-document-engine/phase13c/renders/canvas_report1/canvas-Page01.png")

Write-Host "Sample pixels on Page 1 (Cover):"

$points = @(
    @{ Name="Header Logo Area"; X=150; Y=100 },
    @{ Name="Title Top-Right Badge"; X=1200; Y=115 },
    @{ Name="Title Subtitle Area"; X=300; Y=300 },
    @{ Name="Hero Image Center"; X=700; Y=700 },
    @{ Name="Hero Image Edge"; X=150; Y=700 },
    @{ Name="CDI Card Background"; X=250; Y=1150 },
    @{ Name="Bottom Metadata Footer"; X=300; Y=1860 }
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

