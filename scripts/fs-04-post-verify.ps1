$ErrorActionPreference='Continue'
$evidence=Join-Path $PSScriptRoot '../docs/fs-04/evidence'
$checks=@(
 @('typecheck','node node_modules/typescript/bin/tsc --noEmit'),
 @('lint','node node_modules/eslint/bin/eslint.js .'),
 @('tests','node --test tests/phase-01.test.ts tests/phase-02.test.ts tests/phase-03.test.ts tests/phase-04.test.ts tests/phase-05.test.ts tests/phase-06.test.ts tests/phase-07.test.ts tests/phase-08.test.ts tests/phase-09.test.ts'),
 @('next-build','node node_modules/next/dist/bin/next build'),
 @('package-engine','node scripts/package-engine.ts'),
 @('assets','node scripts/verify-desktop-assets.ts'),
 @('staged-smoke','node scripts/smoke-engine.ts'),
 @('fs-03-packaged','node scripts/fs-04-vite-preservation.ts'),
 @('fs-04-tests','node --test tests/framework-support/fs-04.test.ts'),
 @('fs-04-packaged','node scripts/fs-04-packaged.ts'),
 @('qualification','node scripts/fs-04-qualification-runner.ts --all'),
 @('diff-check','git diff --check')
)
$results=@()
foreach($check in $checks){
 $started=[DateTime]::UtcNow;$timer=[Diagnostics.Stopwatch]::StartNew();$log=Join-Path $evidence ($check[0]+'-final.log')
 Invoke-Expression ($check[1]+' *> "'+$log+'"');$code=$LASTEXITCODE;$timer.Stop()
 $results+=[PSCustomObject]@{id=$check[0];command=$check[1];startedUtc=$started.ToString('o');elapsedMs=$timer.ElapsedMilliseconds;exitCode=$code;log=($check[0]+'-final.log')}
 $results | ConvertTo-Json -Depth 8 | Set-Content (Join-Path $evidence 'post-verification.json') -Encoding UTF8
 Write-Output ($check[0]+': '+$code)
}
if(@($results | Where-Object exitCode -ne 0).Count){exit 1}
