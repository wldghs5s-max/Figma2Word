param(
    [string]$TargetGroup = "all" # "ref", "canvas", "flow", or "all"
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = (Resolve-Path "$scriptDir\..\..\..\..").Path
$renderScript = Join-Path $rootDir "tools\quality-audit\scripts\render_docx_to_png.ps1"

Write-Host "Starting batch render..."
Write-Host "Root Dir: $rootDir"

# 1. Resolve Ref DOCX files dynamically
$refFolder = Get-ChildItem $rootDir -Directory | Where-Object { $_.Name -like "*20261012*" }
$refDocs = @()
if ($refFolder) {
    $r1 = Get-ChildItem $refFolder.FullName | Where-Object { $_.Name -like "report-1*Word*.docx" } | Select-Object -First 1
    $r2 = Get-ChildItem $refFolder.FullName | Where-Object { $_.Name -like "report-2*Word*.docx" } | Select-Object -First 1
    $r3 = Get-ChildItem $refFolder.FullName | Where-Object { $_.Name -like "report-3*Word*.docx" } | Select-Object -First 1
    $refDocs = @(
        @{ Group="ref"; Id="report1"; File=$r1; Out="research\rea-document-engine\phase13c\renders\ref_report1"; Prefix="ref" },
        @{ Group="ref"; Id="report2"; File=$r2; Out="research\rea-document-engine\phase13c\renders\ref_report2"; Prefix="ref" },
        @{ Group="ref"; Id="report3"; File=$r3; Out="research\rea-document-engine\phase13c\renders\ref_report3"; Prefix="ref" }
    )
}

# 2. Resolve Flow DOCX files dynamically
$flowFolder = Join-Path $rootDir "debug\quality-audit\live_generated"
$flowDocs = @()
if (Test-Path $flowFolder) {
    $f1 = Get-ChildItem $flowFolder | Where-Object { $_.Name -like "report-1*.docx" -and $_.Name -notlike "*test*" -and $_.Name -notlike "*unwrapped*" -and $_.Name -notlike "*Figma2Word*" } | Select-Object -First 1
    $f2 = Get-ChildItem $flowFolder | Where-Object { $_.Name -like "report-2*.docx" } | Select-Object -First 1
    $f3 = Get-ChildItem $flowFolder | Where-Object { $_.Name -like "report-3*.docx" } | Select-Object -First 1
    $flowDocs = @(
        @{ Group="flow"; Id="report1"; File=$f1; Out="research\rea-document-engine\phase13c\renders\flow_report1"; Prefix="flow" },
        @{ Group="flow"; Id="report2"; File=$f2; Out="research\rea-document-engine\phase13c\renders\flow_report2"; Prefix="flow" },
        @{ Group="flow"; Id="report3"; File=$f3; Out="research\rea-document-engine\phase13c\renders\flow_report3"; Prefix="flow" }
    )
}

# 3. Canvas DOCX files
$canvasFolder = Join-Path $rootDir "debug\canvas-audit"
$c1 = Get-Item (Join-Path $canvasFolder "report-1-canvas.docx") -ErrorAction SilentlyContinue
$c2 = Get-Item (Join-Path $canvasFolder "report-2-canvas.docx") -ErrorAction SilentlyContinue
$c3 = Get-Item (Join-Path $canvasFolder "report-3-canvas.docx") -ErrorAction SilentlyContinue
$canvasDocs = @(
    @{ Group="canvas"; Id="report1"; File=$c1; Out="research\rea-document-engine\phase13c\renders\canvas_report1"; Prefix="canvas" },
    @{ Group="canvas"; Id="report2"; File=$c2; Out="research\rea-document-engine\phase13c\renders\canvas_report2"; Prefix="canvas" },
    @{ Group="canvas"; Id="report3"; File=$c3; Out="research\rea-document-engine\phase13c\renders\canvas_report3"; Prefix="canvas" }
)

$allDocs = $refDocs + $canvasDocs + $flowDocs

foreach ($item in $allDocs) {
    if ($TargetGroup -ne "all" -and $item.Group -ne $TargetGroup) {
        continue
    }

    if (-not $item.File) {
        Write-Warning "Item not found for $($item.Group)-$($item.Id)"
        continue
    }

    $docxFull = $item.File.FullName
    $outFull = Join-Path $rootDir $item.Out

    # Check if already rendered correctly
    if (Test-Path $outFull) {
        $existingPngs = Get-ChildItem $outFull -Filter "$($item.Prefix)-Page*.png"
        # For ref_report3, we want to re-render if it was wrongly 9 pages instead of 10 pages
        if ($item.Group -eq "ref" -and $item.Id -eq "report3" -and $existingPngs.Count -eq 9) {
            Write-Host "Cleaning up misrendered ref_report3 (9 pages -> should be 10 pages)..."
            Remove-Item (Join-Path $outFull "$($item.Prefix)-Page*.png") -Force
            $existingPngs = @()
        }

        if ($existingPngs.Count -gt 0) {
            Write-Host "Skipping already rendered [$($item.Group)-$($item.Id)] ($($existingPngs.Count) PNGs exist in $outFull)"
            continue
        }
    }

    Write-Host "Rendering [$($item.Group)-$($item.Id)] $docxFull -> $outFull"
    & powershell -ExecutionPolicy Bypass -NoProfile -File $renderScript -DocxPath $docxFull -OutputDir $outFull -Prefix $item.Prefix -Width 1400
}

Write-Host "Batch render complete!"

