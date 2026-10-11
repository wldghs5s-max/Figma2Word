param(
    [Parameter(Mandatory=$true)]
    [string]$Image1,
    [Parameter(Mandatory=$true)]
    [string]$Image2,
    [string]$OutDiffPng = "",
    [string]$OutOverlayPng = "",
    [int]$Tolerance = 10
)

$ErrorActionPreference = "Stop"

function Output-JsonResult($obj) {
    Write-Output (ConvertTo-Json -Compress -InputObject $obj)
}

if (-not (Test-Path $Image1) -or -not (Test-Path $Image2)) {
    Output-JsonResult @{
        success = $false
        error = "Input image file missing"
    }
    exit 0
}

[void][System.Reflection.Assembly]::LoadWithPartialName("System.Drawing")

$bmp1 = $null
$bmp2 = $null
$diffBmp = $null
$overlayBmp = $null

try {
    $bmp1 = New-Object System.Drawing.Bitmap((Resolve-Path $Image1).Path)
    $bmp2 = New-Object System.Drawing.Bitmap((Resolve-Path $Image2).Path)

    $w1 = $bmp1.Width
    $h1 = $bmp1.Height
    $w2 = $bmp2.Width
    $h2 = $bmp2.Height

    $ar1 = [double]$w1 / [double]$h1
    $ar2 = [double]$w2 / [double]$h2

    $maxW = [Math]::Max($w1, $w2)
    $maxH = [Math]::Max($h1, $h2)
    $minW = [Math]::Min($w1, $w2)
    $minH = [Math]::Min($h1, $h2)

    $totalPixels = $maxW * $maxH
    $mismatchCount = 0
    $sumAbsDiff = 0.0
    $sumSqDiff = 0.0

    $needDiff = -not [string]::IsNullOrEmpty($OutDiffPng)
    $needOverlay = -not [string]::IsNullOrEmpty($OutOverlayPng)

    if ($needDiff) {
        $diffBmp = New-Object System.Drawing.Bitmap($maxW, $maxH)
    }
    if ($needOverlay) {
        $overlayBmp = New-Object System.Drawing.Bitmap($maxW, $maxH)
    }

    # Evaluate pixels across the bounding canvas
    for ($y = 0; $y -lt $maxH; $y++) {
        for ($x = 0; $x -lt $maxW; $x++) {
            $in1 = ($x -lt $w1) -and ($y -lt $h1)
            $in2 = ($x -lt $w2) -and ($y -lt $h2)

            if ($in1 -and $in2) {
                $c1 = $bmp1.GetPixel($x, $y)
                $c2 = $bmp2.GetPixel($x, $y)

                $dr = [Math]::Abs([int]$c1.R - [int]$c2.R)
                $dg = [Math]::Abs([int]$c1.G - [int]$c2.G)
                $db = [Math]::Abs([int]$c1.B - [int]$c2.B)
                $avgDiff = ($dr + $dg + $db) / 3.0

                $sumAbsDiff += $avgDiff
                $sumSqDiff += ($avgDiff * $avgDiff)

                $isMismatch = $avgDiff -gt $Tolerance
                if ($isMismatch) {
                    $mismatchCount++
                    if ($needDiff) {
                        # Highlight difference in vibrant magenta
                        $diffBmp.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(255, 235, 15, 120))
                    }
                } else {
                    if ($needDiff) {
                        # Dim context pixel in light grayscale
                        $gray = [int](([int]$c1.R * 0.299 + [int]$c1.G * 0.587 + [int]$c1.B * 0.114) * 0.4 + 140)
                        $gray = [Math]::Min(255, $gray)
                        $diffBmp.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(255, $gray, $gray, $gray))
                    }
                }

                if ($needOverlay) {
                    $or = [int](($c1.R * 0.5) + ($c2.R * 0.5))
                    $og = [int](($c1.G * 0.5) + ($c2.G * 0.5))
                    $ob = [int](($c1.B * 0.5) + ($c2.B * 0.5))
                    $overlayBmp.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(255, $or, $og, $ob))
                }
            } else {
                # Pixel exists in one image but missing in the other (dimension mismatch)
                $mismatchCount++
                $sumAbsDiff += 255.0
                $sumSqDiff += (255.0 * 255.0)

                if ($needDiff) {
                    # Bright cyan for out-of-bounds area
                    $diffBmp.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(255, 0, 180, 255))
                }
                if ($needOverlay) {
                    $overlayBmp.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(255, 240, 240, 240))
                }
            }
        }
    }

    $mismatchRatio = if ($totalPixels -gt 0) { [Math]::Round(($mismatchCount / $totalPixels), 4) } else { 0.0 }
    $mae = if ($totalPixels -gt 0) { [Math]::Round(($sumAbsDiff / $totalPixels), 2) } else { 0.0 }
    $rmse = if ($totalPixels -gt 0) { [Math]::Round([Math]::Sqrt($sumSqDiff / $totalPixels), 2) } else { 0.0 }

    if ($needDiff -and $diffBmp) {
        $diffDir = Split-Path $OutDiffPng
        if ($diffDir -and -not (Test-Path $diffDir)) { New-Item -ItemType Directory -Force -Path $diffDir | Out-Null }
        $diffBmp.Save($OutDiffPng, [System.Drawing.Imaging.ImageFormat]::Png)
    }

    if ($needOverlay -and $overlayBmp) {
        $overlayDir = Split-Path $OutOverlayPng
        if ($overlayDir -and -not (Test-Path $overlayDir)) { New-Item -ItemType Directory -Force -Path $overlayDir | Out-Null }
        $overlayBmp.Save($OutOverlayPng, [System.Drawing.Imaging.ImageFormat]::Png)
    }

    Output-JsonResult @{
        success = $true
        baseDimensions = @{ width = $w1; height = $h1; aspectRatio = [Math]::Round($ar1, 3) }
        testDimensions = @{ width = $w2; height = $h2; aspectRatio = [Math]::Round($ar2, 3) }
        widthDiff = [Math]::Abs($w1 - $w2)
        heightDiff = [Math]::Abs($h1 - $h2)
        aspectRatioDiff = [Math]::Round([Math]::Abs($ar1 - $ar2), 3)
        totalEvaluatedPixels = $totalPixels
        mismatchPixelCount = $mismatchCount
        mismatchRatio = $mismatchRatio
        mae = $mae
        rmse = $rmse
        diffImagePath = $OutDiffPng
        overlayImagePath = $OutOverlayPng
    }
} catch {
    Output-JsonResult @{
        success = $false
        error = "Image comparison failed: $_"
    }
} finally {
    if ($bmp1) { $bmp1.Dispose() }
    if ($bmp2) { $bmp2.Dispose() }
    if ($diffBmp) { $diffBmp.Dispose() }
    if ($overlayBmp) { $overlayBmp.Dispose() }
}
