import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createComposedRefresh} from '../lib/engine/adapters/composed.ts';
const baseline=JSON.parse(readFileSync('tests/fixtures/framework-support/F06-django/sources.json','utf8').replace(/^\uFEFF/,'')) as Record<string,string>;
const records=[];
const host=path.resolve('src-tauri/target/debug/parser-host.exe');
for(const kind of ['roots','tags','blocks','includes'] as const)for(const level of ['below','at','above'] as const){
  const limit=kind==='tags'?20000:64,n=limit+({below:-1,at:0,above:1})[level];
  const input:Record<string,string>={...baseline,'templates/page.html':'controlled','app/views.py':"from django.shortcuts import render\ndef home(request):\n    return render(request, 'page.html')\n"};
  if(kind==='roots')input['project/settings.py']=baseline['project/settings.py'].replace("['templates']",JSON.stringify(Array.from({length:n},(_,i)=>i===0?'templates':'templates'+i))).replace("'APP_DIRS': True","'APP_DIRS': False");
  if(kind==='tags')input['templates/page.html']='{% csrf_token %}'.repeat(n);
  if(kind==='blocks')input['templates/page.html']='{% if value %}'.repeat(n)+'{% endif %}'.repeat(n);
  if(kind==='includes')for(let index=0;index<n;index++)input[index===0?'templates/page.html':`templates/part${index}.html`]=index===n-1?'leaf':`{% include "part${index+1}.html" %}`;
  const root=mkdtempSync(path.join(os.tmpdir(),'cartograph FS06 budgets ')),started=performance.now();
  try{
    for(const [file,text]of Object.entries(input)){mkdirSync(path.dirname(path.join(root,file)),{recursive:true});writeFileSync(path.join(root,file),text);}
    const driver=createComposedRefresh({host});
    if(level==='above')await assert.rejects(driver.analyze(root,true),/resource-limit/);
    else{const snapshot=(await driver.analyze(root,true)).snapshot;assert(snapshot.analysis.resources.some(r=>r.path==='templates/page.html'));assert.equal(snapshot.analysis.gaps.filter(g=>g.reason==='resource-limit').length,0);}
    writeFileSync(path.join(root,'project/settings.py'),baseline['project/settings.py']);writeFileSync(path.join(root,'templates/page.html'),'recovered');
    const recovery=await createComposedRefresh({host}).analyze(root,true);assert(recovery.snapshot.analysis.resources.some(r=>r.path==='templates/page.html'));
    records.push({kind,level,n,limit,status:'PASS',outcome:level==='above'?'typed refusal':'complete generation',elapsedMs:performance.now()-started,inputHash:createHash('sha256').update(JSON.stringify(input)).digest('hex'),rssBytes:process.memoryUsage().rss});
    console.log(`PASS ${kind} ${level} (${n})`);
  }finally{assert(path.basename(root).startsWith('cartograph FS06 budgets '));rmSync(root,{recursive:true,force:true});}
}
writeFileSync('docs/fs-06/evidence/framework-budget-probes.json',JSON.stringify({status:'PASS',scope:'Template roots/tags/block depth/include depth below/at/above only; RSS is not worker commitment',records},null,2)+'\n');
console.log(`PASS ${records.length} template budget cases`);
