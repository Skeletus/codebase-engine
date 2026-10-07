param([switch]$Run)
$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$evidenceDir = Join-Path $repoRoot 'docs/fs-03/evidence'
New-Item -ItemType Directory -Path $evidenceDir -Force | Out-Null
Set-Location -LiteralPath $repoRoot
if (-not $Run) { throw 'Use -Run explicitly; this runs existing checks and regenerates ignored build outputs only.' }
$checks = @(
  @{id='next-typegen'; exe='node'; argv=@('node_modules/next/dist/bin/next','typegen')},
  @{id='typecheck'; exe='node'; argv=@('node_modules/typescript/bin/tsc','--noEmit')},
  @{id='lint'; exe='node'; argv=@('node_modules/eslint/bin/eslint.js','.')},
  @{id='tests'; exe='node'; argv=@('--test','tests/phase-01.test.ts','tests/phase-02.test.ts','tests/phase-03.test.ts','tests/phase-04.test.ts','tests/phase-05.test.ts','tests/phase-06.test.ts','tests/phase-07.test.ts','tests/phase-08.test.ts','tests/phase-09.test.ts')},
  @{id='next-build'; exe='node'; argv=@('node_modules/next/dist/bin/next','build')},
  @{id='package-engine'; exe='node'; argv=@('scripts/package-engine.ts')},
  @{id='assets'; exe='node'; argv=@('scripts/verify-desktop-assets.ts')},
  @{id='rust-format'; exe='cargo'; argv=@('fmt','--manifest-path','src-tauri/Cargo.toml','--','--check')},
  @{id='rust-check'; exe='cargo'; argv=@('check','--locked','--offline','--manifest-path','src-tauri/Cargo.toml')},
  @{id='rust-tests'; exe='cargo'; argv=@('test','--locked','--offline','--manifest-path','src-tauri/Cargo.toml')},
  @{id='parse'; exe='node'; argv=@('scripts/parse.ts','.','--out','docs/fs-03/evidence/baseline-parse.json')},
  @{id='map-counts'; exe='node'; argv=@('scripts/map-counts.ts','docs/fs-03/evidence/baseline-parse.json')},
  @{id='insights'; exe='node'; argv=@('scripts/insights.ts','docs/fs-03/evidence/baseline-parse.json')},
  @{id='engine'; exe='node'; argv=@('scripts/engine.ts','.','--out','docs/fs-03/evidence/baseline-snapshot.json')},
  @{id='pilot-benchmark'; exe='node'; argv=@('scripts/benchmark-pilot.ts')},
  @{id='staged-smoke'; exe='node'; argv=@('scripts/smoke-engine.ts')},
  @{id='fs-01-tests'; exe='node'; argv=@('--test','tests/framework-support/fs-01.test.ts')},
  @{id='fs-02-tests'; exe='node'; argv=@('--test','tests/framework-support/fs-02.test.ts')},
  @{id='fs-03-tests'; exe='node'; argv=@('--test','tests/framework-support/fs-03.test.ts')},
  @{id='fs-03-packaged'; exe='node'; argv=@('scripts/fs-03-packaged.ts')},
  @{id='diff-check'; exe='git'; argv=@('diff','--check')}
)
$records = @()
foreach ($check in $checks) {
  $started = [DateTime]::UtcNow
  $clock = [Diagnostics.Stopwatch]::StartNew()
  $outputPath = Join-Path $evidenceDir ($check.id + '.log')
  $oldPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  & $check.exe @($check.argv) *> $outputPath
  $exitCode = $LASTEXITCODE
  $ErrorActionPreference = $oldPreference
  $clock.Stop()
  $records += [PSCustomObject]@{id=$check.id; command=($check.exe + ' ' + ($check.argv -join ' ')); startedUtc=$started.ToString('o'); elapsedMs=$clock.ElapsedMilliseconds; exitCode=$exitCode; log=($check.id + '.log')}
  $records | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $evidenceDir 'baseline-results.json') -Encoding UTF8
  Write-Output "$($check.id): exit=$exitCode elapsed=$($clock.ElapsedMilliseconds)ms"
}


if (@($records | Where-Object exitCode -ne 0).Count -gt 0) { exit 1 }


