$ErrorActionPreference = 'Continue'
$phaseEvidence = Join-Path $PSScriptRoot '../docs/fs-05/evidence'
$acceptedChecks = Get-Content (Join-Path $PSScriptRoot '../docs/fs-04/evidence/baseline-results.json') -Raw | ConvertFrom-Json
$checks = @($acceptedChecks | ForEach-Object {
    $command = $_.command.Replace('docs/fs-04/evidence/', 'docs/fs-05/evidence/').Replace('scripts/fs-04-packaged.ts','scripts/fs-05-node-preservation.ts').Replace('scripts/fs-04-qualification-runner.ts','scripts/fs-05-node-qualification.ts')
    if ($_.id -eq 'fs-03-packaged') { $command = 'node scripts/fs-05-vite-preservation.ts' }
    [PSCustomObject]@{id=$_.id; command=$command}
})
$checks += [PSCustomObject]@{id='fs-05-tests';command='node --test tests/framework-support/fs-05.test.ts'}
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


