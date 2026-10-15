param(
    [string]$Target = "baseline" # "baseline" or "improved"
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = (Resolve-Path "$scriptDir\..\..\..\..").Path
$comparatorScript = Join-Path $rootDir "research\rea-document-engine\phase13c\tools\CompareRunner.ps1"
$rendersDir = Join-Path $rootDir "research\rea-document-engine\phase13c\renders"
$compBaseDir = Join-Path $rootDir "research\rea-document-engine\phase13c\comparisons"

Write-Host "Running benchmarks for target: $Target"

$tasks = @(
    @{
        Name = "Canvas vs Ref Report 1"
        RefDir = Join-Path $rendersDir "ref_report1"
        TestDir = Join-Path $rendersDir "canvas_report1"
        OutDir = Join-Path $compBaseDir "${Target}_canvas_vs_ref_report1"
        Prefix1 = "ref"
        Prefix2 = "canvas"
        Engine = "canvas"
        ReportId = "report1"
    },
    @{
        Name = "Canvas vs Ref Report 2"
        RefDir = Join-Path $rendersDir "ref_report2"
        TestDir = Join-Path $rendersDir "canvas_report2"
        OutDir = Join-Path $compBaseDir "${Target}_canvas_vs_ref_report2"
        Prefix1 = "ref"
        Prefix2 = "canvas"
        Engine = "canvas"
        ReportId = "report2"
    },
    @{
        Name = "Canvas vs Ref Report 3"
        RefDir = Join-Path $rendersDir "ref_report3"
        TestDir = Join-Path $rendersDir "canvas_report3"
        OutDir = Join-Path $compBaseDir "${Target}_canvas_vs_ref_report3"
        Prefix1 = "ref"
        Prefix2 = "canvas"
        Engine = "canvas"
        ReportId = "report3"
    },
    @{
        Name = "Flow vs Ref Report 1"
        RefDir = Join-Path $rendersDir "ref_report1"
        TestDir = Join-Path $rendersDir "flow_report1"
        OutDir = Join-Path $compBaseDir "${Target}_flow_vs_ref_report1"
        Prefix1 = "ref"
        Prefix2 = "flow"
        Engine = "flow"
        ReportId = "report1"
    },
    @{
        Name = "Flow vs Ref Report 2"
        RefDir = Join-Path $rendersDir "ref_report2"
        TestDir = Join-Path $rendersDir "flow_report2"
        OutDir = Join-Path $compBaseDir "${Target}_flow_vs_ref_report2"
        Prefix1 = "ref"
        Prefix2 = "flow"
        Engine = "flow"
        ReportId = "report2"
    },
    @{
        Name = "Flow vs Ref Report 3"
        RefDir = Join-Path $rendersDir "ref_report3"
        TestDir = Join-Path $rendersDir "flow_report3"
        OutDir = Join-Path $compBaseDir "${Target}_flow_vs_ref_report3"
        Prefix1 = "ref"
        Prefix2 = "flow"
        Engine = "flow"
        ReportId = "report3"
    }
)

$masterResults = @()

foreach ($t in $tasks) {
    Write-Host "--------------------------------------------------"
    Write-Host "Comparing: $($t.Name)"
    Write-Host "  Ref: $($t.RefDir)"
    Write-Host "  Test: $($t.TestDir)"
    Write-Host "  Out: $($t.OutDir)"

    & powershell -ExecutionPolicy Bypass -NoProfile -File $comparatorScript `
        -RefDir $t.RefDir `
        -TestDir $t.TestDir `
        -OutDir $t.OutDir `
        -Prefix1 $t.Prefix1 `
        -Prefix2 $t.Prefix2 `
        -ReportName $t.Name

    $metricsJsonPath = Join-Path $t.OutDir "metrics.json"
    if (Test-Path $metricsJsonPath) {
        $data = Get-Content -Raw -Path $metricsJsonPath -Encoding UTF8 | ConvertFrom-Json
        $masterResults += @{
            name = $t.Name
            engine = $t.Engine
            reportId = $t.ReportId
            refPages = $data.refPages
            testPages = $data.testPages
            pageCountMatch = $data.pageCountMatch
            meanSsim = $data.meanSsim
            minSsim = $data.minSsim
            worstPage = $data.worstPage
            meanMae = $data.meanMae
            meanMismatchRatio = $data.meanMismatchRatio
            metricsPath = $metricsJsonPath
        }
    }
}

$summaryPath = Join-Path $rootDir "research\rea-document-engine\phase13c\metrics_${Target}.json"
$masterResults | ConvertTo-Json -Depth 4 | Set-Content -Path $summaryPath -Encoding UTF8

Write-Host "=================================================="
Write-Host "Master summary written to $summaryPath"
Write-Host "=================================================="
$masterResults | Format-Table name, engine, reportId, pageCountMatch, meanSsim, minSsim, worstPage, meanMae, meanMismatchRatio

