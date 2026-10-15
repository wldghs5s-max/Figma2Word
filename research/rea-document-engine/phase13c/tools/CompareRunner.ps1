param(
    [string]$RefDir,
    [string]$TestDir,
    [string]$OutDir,
    [string]$Prefix1 = "ref",
    [string]$Prefix2 = "canvas",
    [string]$ReportName = "Report",
    [int]$Tolerance = 10,
    [int]$BlockSize = 8
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$csPath = Join-Path $scriptDir "ImageMetrics.cs"

if (-not ("ImageMetricsCalculator" -as [type])) {
    Add-Type -Path $csPath -ReferencedAssemblies System.Drawing
}

function Run-Comparison($img1, $img2, $diffPng, $overlayPng) {
    return [ImageMetricsCalculator]::CompareImages($img1, $img2, $diffPng, $overlayPng, $Tolerance, $BlockSize)
}

if ($RefDir -and $TestDir -and $OutDir) {
    if (-not (Test-Path $OutDir)) {
        New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
    }

    $refImages = Get-ChildItem $RefDir -Filter "$Prefix1-Page*.png" | Sort-Object Name
    $testImages = Get-ChildItem $TestDir -Filter "$Prefix2-Page*.png" | Sort-Object Name

    $count1 = $refImages.Count
    $count2 = $testImages.Count
    $maxPages = [Math]::Max($count1, $count2)

    $pageResults = @()
    $ssimList = @()
    $maeList = @()
    $mismatchList = @()

    $worstSsim = 1.0
    $worstPage = 1

    for ($i = 1; $i -le $maxPages; $i++) {
        $pStr = $i.ToString("00")
        $img1 = Join-Path $RefDir "$Prefix1-Page$pStr.png"
        $img2 = Join-Path $TestDir "$Prefix2-Page$pStr.png"
        $diffPath = Join-Path $OutDir "Page$pStr-diff.png"
        $overlayPath = Join-Path $OutDir "Page$pStr-overlay.png"

        $exists1 = Test-Path $img1
        $exists2 = Test-Path $img2

        if ($exists1 -and $exists2) {
            $res = Run-Comparison $img1 $img2 $diffPath $overlayPath

            $pageEntry = @{
                page = $i
                status = "COMPARED"
                refImage = $img1
                testImage = $img2
                diffImage = $diffPath
                overlayImage = $overlayPath
                ssim = $res.Ssim
                mae = $res.Mae
                normalizedMae = $res.NormalizedMae
                rmse = $res.Rmse
                mismatchRatio = $res.MismatchRatio
                mismatchPixelCount = $res.MismatchPixelCount
                totalPixels = $res.TotalPixels
                bbox1 = @{ x = $res.BBox1_X; y = $res.BBox1_Y; w = $res.BBox1_W; h = $res.BBox1_H }
                bbox2 = @{ x = $res.BBox2_X; y = $res.BBox2_Y; w = $res.BBox2_W; h = $res.BBox2_H }
                delta = @{ x = $res.DeltaX; y = $res.DeltaY; w = $res.DeltaW; h = $res.DeltaH }
                textDetailMismatchRatio = $res.TextDetailMismatchRatio
                backgroundMismatchRatio = $res.BackgroundMismatchRatio
            }

            $pageResults += $pageEntry
            $ssimList += $res.Ssim
            $maeList += $res.Mae
            $mismatchList += $res.MismatchRatio

            if ($res.Ssim -lt $worstSsim) {
                $worstSsim = $res.Ssim
                $worstPage = $i
            }
        } elseif ($exists1 -and -not $exists2) {
            $pageResults += @{
                page = $i
                status = "MISSING_IN_TEST"
                refImage = $img1
                ssim = 0.0
                mae = 255.0
                mismatchRatio = 1.0
            }
            $ssimList += 0.0
            $maeList += 255.0
            $mismatchList += 1.0
            $worstSsim = 0.0
            $worstPage = $i
        } elseif (-not $exists1 -and $exists2) {
            $pageResults += @{
                page = $i
                status = "EXTRA_IN_TEST"
                testImage = $img2
                ssim = 0.0
                mae = 255.0
                mismatchRatio = 1.0
            }
            $ssimList += 0.0
            $maeList += 255.0
            $mismatchList += 1.0
            $worstSsim = 0.0
            $worstPage = $i
        }
    }

    $avgSsim = if ($ssimList.Count -gt 0) { [Math]::Round(($ssimList | Measure-Object -Average).Average, 4) } else { 0.0 }
    $avgMae = if ($maeList.Count -gt 0) { [Math]::Round(($maeList | Measure-Object -Average).Average, 2) } else { 0.0 }
    $avgMismatch = if ($mismatchList.Count -gt 0) { [Math]::Round(($mismatchList | Measure-Object -Average).Average, 4) } else { 0.0 }

    $summary = @{
        reportName = $ReportName
        refPages = $count1
        testPages = $count2
        pageCountMatch = ($count1 -eq $count2)
        totalComparedPages = $pageResults.Count
        meanSsim = $avgSsim
        minSsim = $worstSsim
        worstPage = $worstPage
        meanMae = $avgMae
        meanMismatchRatio = $avgMismatch
        pages = $pageResults
    }

    $jsonPath = Join-Path $OutDir "metrics.json"
    $summary | ConvertTo-Json -Depth 5 | Set-Content -Path $jsonPath -Encoding UTF8

    Write-Output ($summary | ConvertTo-Json -Depth 3)
}

