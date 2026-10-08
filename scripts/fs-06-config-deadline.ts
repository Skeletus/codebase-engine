import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createComposedRefresh} from '../lib/engine/adapters/composed.ts';
import {djangoExtension} from '../lib/engine/adapters/django.ts';
import {pythonExtension} from '../lib/engine/adapters/python.ts';
import {typescriptDriver} from '../lib/engine/adapters/typescript.ts';
import {coordinateSnapshot} from '../lib/engine/composition.ts';
import {selectFiles} from '../lib/parser/index.ts';
import {GenerationBoundary} from '../lib/engine/boundary.ts';
const baseline=JSON.parse(readFileSync('tests/fixtures/framework-support/F06-django/sources.json','utf8').replace(/^\uFEFF/,'')) as Record<string,string>,host=path.resolve('src-tauri/target/debug/parser-host.exe');
const root=mkdtempSync(path.join(os.tmpdir(),'cartograph FS06 config ')),records=[];
try{
  for(const [file,text]of Object.entries(baseline)){mkdirSync(path.dirname(path.join(root,file)),{recursive:true});writeFileSync(path.join(root,file),text);}
  for(const n of [31,32,33]){
    const text=Array.from({length:n-1},(_,index)=>`C${index} = ${index===n-2?"'project.urls'":'C'+(index+1)}\n`).join('')+baseline['project/settings.py'].replace("ROOT_URLCONF = 'project.urls'",'ROOT_URLCONF = C0');writeFileSync(path.join(root,'project/settings.py'),text);
    const snapshot=(await createComposedRefresh({host}).analyze(root,true)).snapshot;
    if(n<=32)assert.equal(snapshot.analysis.registrations.length,4);else{assert.equal(snapshot.analysis.registrations.length,0);assert(snapshot.analysis.gaps.some(g=>g.reason==='dynamic-expression'));}
    records.push({case:'named-settings-depth',n,limit:32,status:'PASS',outcome:n<=32?'supported literal resolution':'explicit dynamic gap; no truncated proof'});
  }
  writeFileSync(path.join(root,'project/settings.py'),baseline['project/settings.py']);
  for(const phase of ['before-parser','during-extraction']){
    let clock=0;const boundary=new GenerationBoundary(undefined,120000,()=>clock),selection=selectFiles(root,root,boundary);
    let snapshot=coordinateSnapshot(typescriptDriver().analyze(selection,true).snapshot,selection);snapshot=(await pythonExtension({host}).analyze(snapshot,selection,true)).snapshot;
    const check=boundary.check.bind(boundary);let calls=0;boundary.check=()=>{if(phase==='before-parser'||++calls===9)clock=120000;check();};
    await assert.rejects(djangoExtension({host}).analyze(snapshot,selection,true),/resource-limit/);records.push({case:'generation-deadline',phase,limitMs:120000,status:'PASS',checks:calls,clock:'existing trusted GenerationBoundary injection; no repository clock/config execution'});
    assert.equal((await createComposedRefresh({host}).analyze(root,true)).snapshot.analysis.registrations.length,4);
  }
  writeFileSync('docs/fs-06/evidence/config-deadline-probes.json',JSON.stringify({status:'PASS',scope:'Named settings recursion 31/32/33 and generation deadline entry/during-extraction with fresh recovery; shared FS02 node/metadata/read ceilings retain inherited coverage',records},null,2)+'\n');console.log('PASS settings recursion and generation deadline probes');
}finally{assert(path.basename(root).startsWith('cartograph FS06 config '));rmSync(root,{recursive:true,force:true});}
