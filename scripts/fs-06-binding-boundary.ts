import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import {AnalysisCoordinator} from '../lib/engine/coordinator.ts';
import {typescriptDriver} from '../lib/engine/adapters/typescript.ts';
import {pythonExtension} from '../lib/engine/adapters/python.ts';
import {djangoExtension} from '../lib/engine/adapters/django.ts';
import {createComposedRefresh} from '../lib/engine/adapters/composed.ts';
const baseline=JSON.parse(readFileSync('tests/fixtures/framework-support/F06-django/sources.json','utf8').replace(/^\uFEFF/,'')) as Record<string,string>,records=[];
const host=path.resolve('src-tauri/target/debug/parser-host.exe');
for(const expected of [19999,20000,20001]){
  const input:Record<string,string>={...baseline,'app/views.py':"from django.shortcuts import render\ndef home(request):\n    render(request, 'first.html')\n    render(request, 'second.html')\n"};
  const blocks=expected-3;for(const [file,n]of [['first.html',Math.floor(blocks/2)],['second.html',Math.ceil(blocks/2)]] as const)input['templates/'+file]=Array.from({length:n},(_,index)=>`{% block b${index} %}x{% endblock %}`).join('');
  const root=mkdtempSync(path.join(os.tmpdir(),'cartograph FS06 binding boundary ')),started=performance.now();
  try{
    for(const [file,text]of Object.entries(input)){mkdirSync(path.dirname(path.join(root,file)),{recursive:true});writeFileSync(path.join(root,file),text);}
    const django=djangoExtension({host});let observed=-1,bytes=0,outcome='complete';
    try{await new AnalysisCoordinator(typescriptDriver()).analyzeAsync(root,true,[pythonExtension({host}),{reset:()=>django.reset(),analyze:async(snapshot,selection,full)=>{const before=snapshot.analysis.bindings.length;try{return await django.analyze(snapshot,selection,full);}finally{observed=snapshot.analysis.bindings.length-before;bytes=Buffer.byteLength(JSON.stringify(snapshot));}}}]);}catch(error){assert(error instanceof Error&&error.message==='resource-limit');outcome='typed refusal; no publication';}
    assert.equal(observed,Math.min(expected,20000));if(expected>20000)assert.equal(outcome,'typed refusal; no publication');else if(outcome!=='complete')assert(bytes>31*1024*1024,'Below/at quota refusal must come from the stricter snapshot ceiling');
    writeFileSync(path.join(root,'app/views.py'),'def home(request):\n    pass\n');assert.equal((await createComposedRefresh({host}).analyze(root,true)).snapshot.analysis.registrations.length,4);
    records.push({expectedAddedBindings:expected,observedAddedBindings:observed,status:'PASS',outcome,discardedOrPublishedBytes:bytes,elapsedMs:performance.now()-started,inputHash:createHash('sha256').update(JSON.stringify(input)).digest('hex'),checks:['actual controlled source facts','all per-file tag/fact quotas below ceiling','exact added-binding threshold','stricter snapshot refusal distinguished','no failed generation published','fresh recovery']});console.log(JSON.stringify(records.at(-1)));
  }finally{assert(path.basename(root).startsWith('cartograph FS06 binding boundary '));rmSync(root,{recursive:true,force:true});}
}
writeFileSync('docs/fs-06/evidence/binding-boundary.json',JSON.stringify({status:'PASS',limit:20000,scope:'Django-added bindings only; inherited facts remain outside this quota. Failed-generation counts are instrumentation, not verified published facts.',records},null,2)+'\n');
