$ErrorActionPreference='Continue'
$evidence=Join-Path $PSScriptRoot '../docs/fs-04/evidence'
$results=@(Get-Content (Join-Path $evidence 'post-verification.json') -Raw | ConvertFrom-Json)
$checks=@(
 @('typecheck','node node_modules/typescript/bin/tsc --noEmit'),
 @('lint','node node_modules/eslint/bin/eslint.js .'),
 @('fs-04-tests','node --test tests/framework-support/fs-04.test.ts'),
 @('qualification','node scripts/fs-04-qualification-runner.ts --all'),
 @('parse','node scripts/parse.ts . --out docs/fs-04/evidence/baseline-parse.json'),
 @('map-counts','node scripts/map-counts.ts docs/fs-04/evidence/baseline-parse.json'),
 @('insights','node scripts/insights.ts docs/fs-04/evidence/baseline-parse.json'),
 @('engine','node scripts/engine.ts . --out docs/fs-04/evidence/baseline-snapshot.json'),
 @('diff-check','git diff --check')
)
$failed=$false
foreach($check in $checks){
 $started=[DateTime]::UtcNow;$timer=[Diagnostics.Stopwatch]::StartNew();$log=Join-Path $evidence ($check[0]+'-qualified.log')
 Invoke-Expression ($check[1]+' *> "'+$log+'"');$code=$LASTEXITCODE;$timer.Stop()
 $results+=[PSCustomObject]@{id=$check[0];command=$check[1];startedUtc=$started.ToString('o');elapsedMs=$timer.ElapsedMilliseconds;exitCode=$code;log=($check[0]+'-qualified.log')}
 $results | ConvertTo-Json -Depth 8 | Set-Content (Join-Path $evidence 'post-verification.json') -Encoding UTF8
 Write-Output ($check[0]+': '+$code)
 if($code -ne 0){$failed=$true}
}
if($failed){exit 1}
