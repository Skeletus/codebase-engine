import assert from 'node:assert/strict';
import {cpSync,mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import os from 'node:os';
const initial=JSON.parse(readFileSync('docs/fs-06/evidence/starting-inventory.json','utf8')) as {head:string;files:{path:string;sha256:string}[]};
const fixtureBytes=readFileSync('tests/fixtures/framework-support/F02-profile/fixture.json');
const fixture=JSON.parse(fixtureBytes.toString()) as {sources:Record<string,string>};
// The historical runner imports typescript.ts directly. The three changed
// composed/Python worker modules are outside that import path and never run.
// Restore the two changed shared-model modules reachable by this TS path.
const changed=['lib/model/framework.ts','lib/model/framework-validate.ts'];
const hash=(bytes:Uint8Array|string)=>createHash('sha256').update(bytes).digest('hex');
const root=mkdtempSync(path.join(os.tmpdir(),'cartograph FS06 paired performance '));
type Stats={medianMs:number;p95Ms:number;samplesMs:number[]};
type Result={snapshotHash:string;bindings:number;registrations:number;repetitions:{fresh:Stats;warm:Stats}[];freshMedianMs:number;warmMedianMs:number};
try{
  const engines={accepted:path.join(root,'accepted'),current:path.join(root,'current')},source=path.join(root,'fixture');
  for(const engine of Object.values(engines))cpSync('src-tauri/resources/generated/engine',engine,{recursive:true});
  const restored=[];
  for(const file of changed){const bytes=Buffer.from(execFileSync('git',['show',`${initial.head}:${file}`]).toString('utf8').replace(/\r\n/g,'\n'));const expected=initial.files.find(row=>row.path===file)?.sha256;assert.equal(hash(bytes),expected,'Accepted TS-path source must match starting inventory exactly');writeFileSync(path.join(engines.accepted,file),bytes);restored.push({file,acceptedHash:hash(bytes),currentHash:hash(readFileSync(file))});}
  assert.equal(hash(readFileSync('lib/engine/adapters/typescript.ts')),initial.files.find(row=>row.path==='lib/engine/adapters/typescript.ts')?.sha256);
  for(const [file,text]of Object.entries(fixture.sources)){mkdirSync(path.dirname(path.join(source,file)),{recursive:true});writeFileSync(path.join(source,file),text);}
  const probe=`import assert from 'node:assert/strict';import {createHash} from 'node:crypto';const {typescriptAdapter,createTypescriptRefresh}=await import(process.argv[2]);const source=process.argv[3];const stats=values=>{const sorted=[...values].sort((a,b)=>a-b);return{medianMs:sorted[Math.floor(sorted.length/2)],p95Ms:sorted[Math.ceil(sorted.length*.95)-1],samplesMs:values}};const repetitions=[];let snapshot;for(let repeat=0;repeat<3;repeat++){const fresh=[],warm=[];snapshot=typescriptAdapter.analyze(source);for(let n=0;n<5;n++){const start=performance.now();snapshot=typescriptAdapter.analyze(source);fresh.push(performance.now()-start);}const driver=createTypescriptRefresh();driver.analyze(source,true);for(let n=0;n<20;n++){const start=performance.now();const next=driver.analyze(source,false);warm.push(performance.now()-start);assert.deepEqual(next.snapshot,snapshot);}assert.equal(snapshot.files.length,2);assert.equal(snapshot.relationships.length,1);assert.equal(snapshot.analysis.bindings.length,0);assert.equal(snapshot.analysis.registrations.length,0);repetitions.push({fresh:stats(fresh),warm:stats(warm)});}console.log(JSON.stringify({snapshotHash:createHash('sha256').update(JSON.stringify(snapshot)).digest('hex'),bindings:snapshot.analysis.bindings.length,registrations:snapshot.analysis.registrations.length,repetitions,freshMedianMs:stats(repetitions.map(r=>r.fresh.medianMs)).medianMs,warmMedianMs:stats(repetitions.map(r=>r.warm.medianMs)).medianMs}));`;
  const entry=path.join(root,'probe.mjs');writeFileSync(entry,probe);const pairs=[];
  for(let pair=0;pair<3;pair++){
    const results:Partial<Record<keyof typeof engines,Result>>={};const order: (keyof typeof engines)[]=pair%2?['current','accepted']:['accepted','current'];
    for(const target of order){results[target]=JSON.parse(execFileSync(process.execPath,[entry,pathToFileURL(path.join(engines[target],'lib/engine/adapters/typescript.ts')).href,source],{encoding:'utf8',timeout:60000,windowsHide:true})) as Result;}
    const accepted=results.accepted!,current=results.current!;assert.equal(current.snapshotHash,accepted.snapshotHash);pairs.push({order,accepted,current,freshRatio:current.freshMedianMs/accepted.freshMedianMs,warmRatio:current.warmMedianMs/accepted.warmMedianMs});
  }
  const median=(values:number[])=>values.sort((a,b)=>a-b)[Math.floor(values.length/2)];
  const freshRatio=median(pairs.map(p=>p.freshRatio)),warmRatio=median(pairs.map(p=>p.warmRatio));
  const status=freshRatio<=1.2&&warmRatio<=1.2?'PASS':'UNVERIFIED';
  const report={status,acceptedHead:initial.head,fixtureSha256:hash(fixtureBytes),node:process.versions.node,cpu:os.cpus()[0].model,scope:'Paired accepted-FS05/current first-party TS/JS engine-path comparison: exact accepted shared-model bytes restored; other reachable source unchanged by scope audit. Same staged dependency bytes, fixture/root, runtime and host; alternating process order; each process repeats the exact five-fresh/twenty-warm protocol three times. The historical runner never invokes composed/Python/Django workers. No inspected code executes.',restored,pairs,freshRatio,warmRatio,interpretation:status==='PASS'?'Paired current/accepted medians stay below 1.20 and exact snapshots match. No Django/route bindings are exercised by this unchanged historical TS fixture. This resolves attribution of the historical timing increase to FS06 on this corpus, not a worst-case performance guarantee.':'Paired comparison still exceeds threshold; investigation remains open'};
  writeFileSync('docs/fs-06/evidence/performance-investigation.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status,freshRatio,warmRatio}));assert.equal(status,'PASS');
}finally{assert(path.basename(root).startsWith('cartograph FS06 paired performance '));rmSync(root,{recursive:true,force:true});}
