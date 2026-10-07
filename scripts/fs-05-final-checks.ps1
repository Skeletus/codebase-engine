$ErrorActionPreference='Continue'
$phaseEvidence=Join-Path $PSScriptRoot '../docs/fs-05/evidence'
$checks=@(
    @{id='next-typegen';command='node node_modules/next/dist/bin/next typegen'},
    @{id='typecheck';command='node node_modules/typescript/bin/tsc --noEmit'},
    @{id='lint';command='node node_modules/eslint/bin/eslint.js .'},
    @{id='next-build';command='node node_modules/next/dist/bin/next build'},
    @{id='assets';command='node scripts/verify-desktop-assets.ts'},
    @{id='rust-format';command='cargo fmt --manifest-path src-tauri/Cargo.toml -- --check'},
    @{id='rust-check';command='cargo check --locked --offline --manifest-path src-tauri/Cargo.toml'},
    @{id='rust-tests';command='cargo test --locked --offline --manifest-path src-tauri/Cargo.toml'},
    @{id='engine';command='node scripts/engine.ts . --out docs/fs-05/evidence/baseline-snapshot.json'},
    @{id='staged-smoke';command='node scripts/smoke-engine.ts'},
    @{id='fs-03-packaged';command='node scripts/fs-05-vite-preservation.ts'},
    @{id='fs-04-packaged';command='node scripts/fs-05-node-preservation.ts'},
    @{id='fs-05-packaged';command='node scripts/fs-05-packaged.ts'},
    @{id='fs-05-packaged-failures';command='node scripts/fs-05-packaged-failures.ts'},
    @{id='python-qualification';command='node scripts/fs-05-qualification.ts --all'},
    @{id='qualification-negative';command='node scripts/fs-05-qualification-negative.ts'},
    @{id='scope-audit';command='node scripts/fs-05-audit.ts'},
    @{id='diff-check';command='git diff --check'}
)
$results=@()
foreach($check in $checks){
    $started=[DateTime]::UtcNow;$timer=[Diagnostics.Stopwatch]::StartNew()
    $log=Join-Path $phaseEvidence ($check.id+'-final.log')
    Invoke-Expression ($check.command+' *> "'+$log+'"')
    $code=$LASTEXITCODE;$timer.Stop()
    $results+=[PSCustomObject]@{id=$check.id;command=$check.command;startedUtc=$started.ToString('o');elapsedMs=$timer.ElapsedMilliseconds;exitCode=$code;log=($check.id+'-final.log')}
    $results|ConvertTo-Json -Depth 8|Set-Content (Join-Path $phaseEvidence 'final-results.json') -Encoding UTF8
    Write-Output ($check.id+': '+$code)
}
if(@($results|Where-Object exitCode -ne 0).Count){exit 1}
