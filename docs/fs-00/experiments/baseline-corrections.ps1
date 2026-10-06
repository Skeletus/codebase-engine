$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../../..')).Path
Set-Location -LiteralPath $repoRoot
$evidenceDir = Join-Path $repoRoot 'docs/fs-00/evidence'
$records = @(Get-Content (Join-Path $evidenceDir 'baseline-results.json') -Raw | ConvertFrom-Json)
foreach ($id in @('map-counts','insights')) { Copy-Item -LiteralPath (Join-Path $evidenceDir ($id + '.log')) -Destination (Join-Path $evidenceDir ($id + '-invocation-error.log')) -Force }
$records | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $evidenceDir 'baseline-initial-results.json') -Encoding UTF8
$checks = @(
 @{id='parse'; argv=@('scripts/parse.ts','.','--out','docs/fs-00/evidence/baseline-parse.json')},
 @{id='map-counts'; argv=@('scripts/map-counts.ts','docs/fs-00/evidence/baseline-parse.json')},
 @{id='insights'; argv=@('scripts/insights.ts','docs/fs-00/evidence/baseline-parse.json')},
 @{id='engine'; argv=@('scripts/engine.ts','.','--out','docs/fs-00/evidence/baseline-snapshot.json')}
)
foreach ($check in $checks) {
 $clock=[Diagnostics.Stopwatch]::StartNew(); $started=[DateTime]::UtcNow
 $ErrorActionPreference='Continue'
 & node @($check.argv) *> (Join-Path $evidenceDir ($check.id+'.log'))
 $exitCode=$LASTEXITCODE; $ErrorActionPreference='Stop'; $clock.Stop()
 $records=@($records | Where-Object id -ne $check.id)
 $records += [PSCustomObject]@{id=$check.id;command=('node '+($check.argv -join ' '));startedUtc=$started.ToString('o');elapsedMs=$clock.ElapsedMilliseconds;exitCode=$exitCode;log=($check.id+'.log')}
 $records | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $evidenceDir 'baseline-results.json') -Encoding UTF8
 Write-Output "$($check.id): exit=$exitCode elapsed=$($clock.ElapsedMilliseconds)ms"
}
