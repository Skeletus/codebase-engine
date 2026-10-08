import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import {createComposedRefresh} from '../lib/engine/adapters/composed.ts';
const baseline=JSON.parse(readFileSync('tests/fixtures/framework-support/F06-django/sources.json','utf8').replace(/^\uFEFF/,'')) as Record<string,string>;
const records=[];
for(const tuple of ['django52','django60']){
  const input={...baseline};if(tuple==='django60')input['pyproject.toml']='[project]\nname="controlled"\nrequires-python="==3.13.16"\ndependencies=["Django==6.0.9","djangorestframework==3.17.2"]\n';
  for(let n=0;n<500;n++)input[`app/model${n}.py`]=`from django.db import models\nclass Item${n}(models.Model):\n    name = models.CharField(max_length=80)\n`;
  const root=mkdtempSync(path.join(os.tmpdir(),'cartograph FS06 large '));
  try{
    for(const [file,text]of Object.entries(input)){mkdirSync(path.dirname(path.join(root,file)),{recursive:true});writeFileSync(path.join(root,file),text);}
    const samples=[];let reference;
    for(let n=0;n<5;n++){const started=performance.now();reference=(await createComposedRefresh({host:path.resolve('src-tauri/target/release/parser-host.exe')}).analyze(root,true)).snapshot;assert.equal(reference.files.length,507);assert.equal(reference.analysis.bindings.filter(b=>b.witnesses.some(w=>w.role==='framework-rule'&&w.ruleId==='model-declaration-not-runtime-schema')).length,500);samples.push({mode:'fresh',elapsedMs:performance.now()-started,snapshotBytes:Buffer.byteLength(JSON.stringify(reference)),rssBytes:process.memoryUsage().rss});}
    const driver=createComposedRefresh({host:path.resolve('src-tauri/target/release/parser-host.exe')});await driver.analyze(root,true);
    for(let n=0;n<20;n++){const started=performance.now(),snapshot=(await driver.analyze(root,false)).snapshot;assert.deepEqual(snapshot,reference);samples.push({mode:'warm',elapsedMs:performance.now()-started,snapshotBytes:Buffer.byteLength(JSON.stringify(snapshot)),rssBytes:process.memoryUsage().rss});}
    records.push({tuple,status:'PASS',files:507,sourceBytes:Object.values(input).reduce((sum,text)=>sum+Buffer.byteLength(text),0),inputHash:createHash('sha256').update(JSON.stringify(input)).digest('hex'),samples});console.log(`PASS ${tuple} 500-model corpus`);
  }finally{assert(path.basename(root).startsWith('cartograph FS06 large '));rmSync(root,{recursive:true,force:true});}
}
writeFileSync('docs/fs-06/evidence/large-corpus.json',JSON.stringify({status:'PASS',scope:'Five fresh and twenty warm runs per tuple; complete 507-file generations with equivalence. RSS samples are not peak commit or hard whole-engine memory bounds.',records},null,2)+'\n');
