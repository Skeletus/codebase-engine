$ErrorActionPreference = 'Stop'
$workspace = (Resolve-Path "$PSScriptRoot/../..").Path
Set-Location -LiteralPath $workspace
$results = @()
foreach ($tuple in @('vite7-react18','vite8-react19','typescript-baseline')) {
  $runtime = if ($tuple -eq 'vite7-react18') { Join-Path $workspace 'node_modules/.fs03-experiments/vite7/node_modules/node/bin/node.exe' } else { (Get-Command node).Source }
  foreach ($iteration in 0..5) {
    $label = if ($iteration -eq 5) { 'warm' } else { "cold-$iteration" }
    $output = Join-Path $PSScriptRoot "evidence/measurement-$tuple-$label.json"
    $errors = Join-Path $PSScriptRoot "evidence/measurement-$tuple-$label.stderr.log"
    $arguments = @('scripts/fs-03-measure.ts',"--tuple=$tuple")
    if ($iteration -eq 5) { $arguments += '--warm' }
    $process = Start-Process -FilePath $runtime -ArgumentList $arguments -WorkingDirectory $workspace -WindowStyle Hidden -PassThru -RedirectStandardOutput $output -RedirectStandardError $errors
    $null = $process.Handle
    $peakCommit = 0L; $peakRSS = 0L
    do {
      $process.Refresh()
      if (!$process.HasExited) {
        $peakCommit = [Math]::Max($peakCommit,$process.PeakPagedMemorySize64)
        $peakRSS = [Math]::Max($peakRSS,$process.PeakWorkingSet64)
      }
      Start-Sleep -Milliseconds 50
    } while (!$process.HasExited)
    $process.WaitForExit()
    if ($process.ExitCode -ne 0) { throw "Measurement failed: $tuple/$label; see $errors" }
    $sample = Get-Content -Raw -LiteralPath $output | ConvertFrom-Json
    $results += [pscustomobject]@{ tuple=$tuple; group=$label; peakCommittedBytes=$peakCommit; peakRSSBytes=$peakRSS; sample=$sample }
  }
}
$report = [pscustomobject]@{ recordedAt=(Get-Date).ToUniversalTime().ToString('o'); platform='Windows x64'; processor=$env:PROCESSOR_IDENTIFIER; policy='Five fresh-process cold runs and twenty retained-session warm runs per tuple. Peak Windows paged/working-set counters sampled every 50ms; RSS and committed memory reported separately. Synthetic fixture only; no configuration/application execution.'; results=$results }
$report | ConvertTo-Json -Depth 12 | Set-Content -Encoding UTF8 -LiteralPath "$PSScriptRoot/evidence/resource-measurements.json"
Write-Output 'PASS resource measurements: 3 targets; each 5 cold + 20 warm analyses'
