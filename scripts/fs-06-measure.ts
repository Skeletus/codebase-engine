import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import {createComposedRefresh} from '../lib/engine/adapters/composed.ts';
const bytes=readFileSync('tests/fixtures/framework-support/F06-django/sources.json');
const base=JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/,'')) as Record<string,string>;
const measurements=[];
for(const tuple of ['django52','django60']){
  const root=mkdtempSync(path.join(os.tmpdir(),'cartograph FS06 measurement '));
  try{
    const sources={...base};if(tuple==='django60')sources['pyproject.toml']='[project]\nname="controlled"\nrequires-python="==3.13.16"\ndependencies=["Django==6.0.9","djangorestframework==3.17.2"]\n';
    for(const [file,text]of Object.entries(sources)){mkdirSync(path.dirname(path.join(root,file)),{recursive:true});writeFileSync(path.join(root,file),text);}
    const samples=[];let reference;
    for(let n=0;n<5;n++){const start=performance.now();const result=await createComposedRefresh({host:path.resolve('src-tauri/target/release/parser-host.exe')}).analyze(root,true);samples.push({mode:'fresh-engine',elapsedMs:performance.now()-start,snapshotBytes:Buffer.byteLength(JSON.stringify(result.snapshot)),files:result.snapshot.files.length,registrations:result.snapshot.analysis.registrations.length});reference=result.snapshot;}
    const driver=createComposedRefresh({host:path.resolve('src-tauri/target/release/parser-host.exe')});await driver.analyze(root,true);
    for(let n=0;n<20;n++){const start=performance.now();const result=await driver.analyze(root,false);samples.push({mode:'warm-incremental',elapsedMs:performance.now()-start,snapshotBytes:Buffer.byteLength(JSON.stringify(result.snapshot)),files:result.snapshot.files.length,registrations:result.snapshot.analysis.registrations.length});assert.deepEqual(result.snapshot,reference);}
    measurements.push({tuple,profile:'static-python-declared-environment',fixtureHash:createHash('sha256').update(JSON.stringify(sources)).digest('hex'),samples});
  }finally{assert(path.basename(root).startsWith('cartograph FS06 measurement '));rmSync(root,{recursive:true,force:true});}
}
writeFileSync('docs/fs-06/evidence/resource-measurements.json',JSON.stringify({status:'MEASURED, qualification incomplete',node:process.version,cpu:os.cpus()[0].model,scope:'Small literal fixture, five fresh engine sessions and twenty warm runs per tuple; does not establish parser commit maxima, adversarial limits, large corpus throughput or the historical comparison.',measurements},null,2)+'\n');
