$ErrorActionPreference='Stop'
$phaseRoot=Split-Path $PSScriptRoot -Parent
$evidence=Join-Path $phaseRoot 'docs/fs-05/evidence'
$results=@()
foreach($tuple in @('python31215','python31316')) {
    $executable=(Get-Command node).Source
    if($tuple -in @('next15','node22')) {$executable=Join-Path $phaseRoot 'node_modules/.fs03-experiments/vite7/node_modules/node/bin/node.exe'}
    foreach($group in @('cold-0','cold-1','cold-2','cold-3','cold-4','warm')) {
        $output=Join-Path $evidence ('measurement-'+$tuple+'-'+$group+'.json')
        $errorLog=Join-Path $evidence ('measurement-'+$tuple+'-'+$group+'.stderr.log')
        $arguments=@('scripts/fs-05-measure.ts',('--tuple='+$tuple))
        if($group -eq 'warm') {$arguments+='--warm'}
        $process=Start-Process -FilePath $executable -ArgumentList $arguments -WorkingDirectory $phaseRoot -WindowStyle Hidden -RedirectStandardOutput $output -RedirectStandardError $errorLog -PassThru
        # Cache the handle while running; Windows PowerShell otherwise loses
        # ExitCode after repeated Refresh/HasExited polling.
        $phaseProcessHandle=$process.Handle
        if($phaseProcessHandle -eq [IntPtr]::Zero){throw 'Measurement process has no handle'}
        $peakCommit=0L; $peakRSS=0L; $parserPeakCommit=0L; $parserPeakRSS=0L; $parserObserved=$false
        while(!$process.HasExited) {
            $process.Refresh()
            $peakCommit=[Math]::Max($peakCommit,$process.PagedMemorySize64)
            $peakRSS=[Math]::Max($peakRSS,$process.WorkingSet64)
            # Only descendants of this measured engine process are considered.
            # The Rust parser host is its direct child; Node/WASM is the host child.
            foreach($hostProcess in @(Get-CimInstance Win32_Process -Filter ('ParentProcessId = '+$process.Id) -ErrorAction SilentlyContinue)) {
                if($hostProcess.Name -ne 'parser-host.exe'){continue}
                foreach($parserProcess in @(Get-CimInstance Win32_Process -Filter ('ParentProcessId = '+$hostProcess.ProcessId) -ErrorAction SilentlyContinue)) {
                    $counter=Get-Process -Id $parserProcess.ProcessId -ErrorAction SilentlyContinue
                    if($counter){$parserObserved=$true;$parserPeakCommit=[Math]::Max($parserPeakCommit,$counter.PeakPagedMemorySize64);$parserPeakRSS=[Math]::Max($parserPeakRSS,$counter.PeakWorkingSet64)}
                }
            }
            Start-Sleep -Milliseconds 50
        }
        $process.WaitForExit()
        if($process.ExitCode -ne 0) {throw ('Measurement failed: '+$tuple+'/'+$group)}
        $sample=Get-Content $output -Raw | ConvertFrom-Json
        $results+=[PSCustomObject]@{tuple=$tuple;group=$group;peakCommittedBytes=$peakCommit;peakRSSBytes=$peakRSS;parserObserved=$parserObserved;parserPeakCommittedBytes=$parserPeakCommit;parserPeakRSSBytes=$parserPeakRSS;sample=$sample}
        Write-Output ($tuple+'/'+$group)
    }
}
[PSCustomObject]@{recordedAt=[DateTime]::UtcNow.ToString('o');platform='Windows x64';processor=$env:PROCESSOR_IDENTIFIER;policy='Five fresh processes and twenty retained-session runs after one warmup per tuple; Windows counter sampling with CIM descendant discovery plus 50ms pause; parent and parser commit/RSS separate; warm cache may need no parser; no inspected code execution';results=$results} | ConvertTo-Json -Depth 20 | Set-Content (Join-Path $evidence 'resource-measurements.json') -Encoding UTF8
& node scripts/fs-05-historical.ts *> (Join-Path $evidence 'historical-performance.log')
if($LASTEXITCODE -ne 0){throw 'Historical comparison failed'}

