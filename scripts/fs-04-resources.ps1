$ErrorActionPreference='Stop'
$phaseRoot=Split-Path $PSScriptRoot -Parent
$evidence=Join-Path $phaseRoot 'docs/fs-04/evidence'
$results=@()
foreach($tuple in @('next15','next16-preservation','next16-patch','node22','node24')) {
    $executable=(Get-Command node).Source
    if($tuple -in @('next15','node22')) {$executable=Join-Path $phaseRoot 'node_modules/.fs03-experiments/vite7/node_modules/node/bin/node.exe'}
    foreach($group in @('cold-0','cold-1','cold-2','cold-3','cold-4','warm')) {
        $output=Join-Path $evidence ('measurement-'+$tuple+'-'+$group+'.json')
        $errorLog=Join-Path $evidence ('measurement-'+$tuple+'-'+$group+'.stderr.log')
        $arguments=@('scripts/fs-04-measure.ts',('--tuple='+$tuple))
        if($group -eq 'warm') {$arguments+='--warm'}
        $process=Start-Process -FilePath $executable -ArgumentList $arguments -WorkingDirectory $phaseRoot -WindowStyle Hidden -RedirectStandardOutput $output -RedirectStandardError $errorLog -PassThru
        # Cache the handle while running; Windows PowerShell otherwise loses
        # ExitCode after repeated Refresh/HasExited polling.
        $phaseProcessHandle=$process.Handle
        if($phaseProcessHandle -eq [IntPtr]::Zero){throw 'Measurement process has no handle'}
        $peakCommit=0L; $peakRSS=0L
        while(!$process.HasExited) {
            $process.Refresh()
            $peakCommit=[Math]::Max($peakCommit,$process.PagedMemorySize64)
            $peakRSS=[Math]::Max($peakRSS,$process.WorkingSet64)
            Start-Sleep -Milliseconds 50
        }
        $process.WaitForExit()
        if($process.ExitCode -ne 0) {throw ('Measurement failed: '+$tuple+'/'+$group)}
        $sample=Get-Content $output -Raw | ConvertFrom-Json
        $results+=[PSCustomObject]@{tuple=$tuple;group=$group;peakCommittedBytes=$peakCommit;peakRSSBytes=$peakRSS;sample=$sample}
        Write-Output ($tuple+'/'+$group)
    }
}
[PSCustomObject]@{recordedAt=[DateTime]::UtcNow.ToString('o');platform='Windows x64';processor=$env:PROCESSOR_IDENTIFIER;policy='Five fresh processes and twenty retained-session runs after one warmup per tuple; 50ms Windows counter sampling; no inspected code execution';results=$results} | ConvertTo-Json -Depth 20 | Set-Content (Join-Path $evidence 'resource-measurements.json') -Encoding UTF8
& node scripts/fs-04-historical.ts *> (Join-Path $evidence 'historical-performance.log')
if($LASTEXITCODE -ne 0){throw 'Historical comparison failed'}
