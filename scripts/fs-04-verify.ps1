$ErrorActionPreference = 'Continue'
$phaseEvidence = Join-Path $PSScriptRoot '../docs/fs-04/evidence'
$acceptedChecks = Get-Content (Join-Path $PSScriptRoot '../docs/fs-03/evidence/baseline-results.json') -Raw | ConvertFrom-Json
$checks = @($acceptedChecks | ForEach-Object {
    $command = $_.command.Replace('docs/fs-03/evidence/', 'docs/fs-04/evidence/')
    if ($_.id -eq 'fs-03-packaged') { $command = 'node scripts/fs-04-vite-preservation.ts' }
    [PSCustomObject]@{id=$_.id; command=$command}
}) + @(
    [PSCustomObject]@{id='fs-04-tests'; command='node --test tests/framework-support/fs-04.test.ts'},
    [PSCustomObject]@{id='fs-04-packaged'; command='node scripts/fs-04-packaged.ts'},
    [PSCustomObject]@{id='qualification'; command='node scripts/fs-04-qualification-runner.ts --all'}
)
$results = @()
foreach ($check in $checks) {
    $started = [DateTime]::UtcNow
    $timer = [Diagnostics.Stopwatch]::StartNew()
    $log = Join-Path $phaseEvidence ($check.id + '.log')
    # Commands are the retained, application-owned verification ledger above.
    # No inspected application, configuration or plugin is invoked.
    Invoke-Expression ($check.command + ' *> "' + $log + '"')
    $code = $LASTEXITCODE
    $timer.Stop()
    $results += [PSCustomObject]@{id=$check.id;command=$check.command;startedUtc=$started.ToString('o');elapsedMs=$timer.ElapsedMilliseconds;exitCode=$code;log=($check.id+'.log')}
    $results | ConvertTo-Json -Depth 8 | Set-Content (Join-Path $phaseEvidence 'baseline-results.json') -Encoding UTF8
    Write-Output ($check.id + ': ' + $code)
}
if (@($results | Where-Object exitCode -ne 0).Count) { exit 1 }
