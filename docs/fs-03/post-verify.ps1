$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Resolve-Path "$PSScriptRoot/../..").Path
$checks = @(
  @{id='typecheck-final';exe='node';argv=@('node_modules/typescript/bin/tsc','--noEmit')},
  @{id='lint-final';exe='node';argv=@('node_modules/eslint/bin/eslint.js','.')},
  @{id='all-tests-final';exe='node';argv=@('--test','tests/phase-01.test.ts','tests/phase-02.test.ts','tests/phase-03.test.ts','tests/phase-04.test.ts','tests/phase-05.test.ts','tests/phase-06.test.ts','tests/phase-07.test.ts','tests/phase-08.test.ts','tests/phase-09.test.ts','tests/framework-support/fs-01.test.ts','tests/framework-support/fs-02.test.ts','tests/framework-support/fs-03.test.ts')},
  @{id='package-final';exe='node';argv=@('scripts/package-engine.ts')},
  @{id='assets-final';exe='node';argv=@('scripts/verify-desktop-assets.ts')},
  @{id='smoke-final';exe='node';argv=@('scripts/smoke-engine.ts')},
  @{id='fs-03-packaged-final';exe='node';argv=@('scripts/fs-03-packaged.ts')},
  @{id='evidence-final';exe='node';argv=@('scripts/fs-03-evidence.ts')},
  @{id='diff-final';exe='git';argv=@('diff','--check')}
)
$records = @()
foreach ($check in $checks) {
  $started = [DateTime]::UtcNow
  $log = Join-Path $PSScriptRoot "evidence/$($check.id).log"
  $ErrorActionPreference = 'Continue'
  & $check.exe @($check.argv) *> $log
  $code = $LASTEXITCODE
  $ErrorActionPreference = 'Stop'
  $records += [pscustomobject]@{id=$check.id;command=($check.exe+' '+($check.argv -join ' '));startedUtc=$started.ToString('o');exitCode=$code;log=($check.id+'.log')}
  $records | ConvertTo-Json -Depth 6 | Set-Content -Encoding UTF8 -LiteralPath "$PSScriptRoot/evidence/post-verification.json"
  Write-Output "$($check.id): exit=$code"
}
if (@($records | Where-Object exitCode -ne 0).Count) { exit 1 }
