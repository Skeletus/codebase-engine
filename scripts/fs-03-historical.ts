import assert from "node:assert/strict";
import {mkdtempSync,realpathSync,readFileSync,mkdirSync,writeFileSync,rmSync} from "node:fs";
import path from "node:path";
import os from "node:os";
import {createHash} from "node:crypto";
import {typescriptAdapter,createTypescriptRefresh} from "../lib/engine/adapters/typescript.ts";
const historical=JSON.parse(readFileSync("docs/fs-02/evidence/resource-measurements.json","utf8"));
const fixtureBytes=readFileSync("tests/fixtures/framework-support/F02-profile/fixture.json");
const fixture:{sources:Record<string,string>}=JSON.parse(fixtureBytes.toString("utf8"));
assert.equal(createHash("sha256").update(fixtureBytes).digest("hex"),historical.fixtureSha256);
assert.equal(process.versions.node,historical.tuple.node);assert.equal(os.cpus()[0].model,historical.cpu);
assert.equal(JSON.parse(readFileSync("node_modules/typescript/package.json","utf8")).version,historical.tuple.typescript);
assert.equal(JSON.parse(readFileSync("node_modules/ts-morph/package.json","utf8")).version,historical.tuple.tsMorph);
const root=realpathSync.native(mkdtempSync(path.join(os.tmpdir(),"cartograph FS03 historical ")));
const stats=(values:number[])=>{const sorted=[...values].sort((a,b)=>a-b);return {runs:values.length,medianMs:sorted[Math.floor(sorted.length/2)],p95Ms:sorted[Math.ceil(sorted.length*.95)-1],samplesMs:values};};
try{
  for(const [file,text]of Object.entries(fixture.sources)){mkdirSync(path.dirname(path.join(root,file)),{recursive:true});writeFileSync(path.join(root,file),text);}
  const repetitions=[];
  for(let repeat=0;repeat<3;repeat++){
    const fresh:number[]=[],warm:number[]=[];let snapshot=typescriptAdapter.analyze(root);
    for(let n=0;n<5;n++){const start=performance.now();snapshot=typescriptAdapter.analyze(root);fresh.push(performance.now()-start);}
    const driver=createTypescriptRefresh();driver.analyze(root,true);
    for(let n=0;n<20;n++){const start=performance.now();const next=driver.analyze(root,false);warm.push(performance.now()-start);assert.deepEqual(next.snapshot,snapshot);}
    assert.equal(snapshot.files.length,historical.parsed);assert.equal(snapshot.relationships.length,historical.imports);
    repetitions.push({freshSessions:stats(fresh),warm:stats(warm)});
  }
  const medianFresh=stats(repetitions.map(r=>r.freshSessions.medianMs)).medianMs,medianWarm=stats(repetitions.map(r=>r.warm.medianMs)).medianMs;
  const report={fixture:"F02-profile",fixtureSha256:historical.fixtureSha256,tuple:historical.tuple,cpu:historical.cpu,protocol:"Historical FS02: five fresh syntax sessions in one process; full warm-up then twenty retained-session runs; three repeats on unchanged source bytes",historical:{freshMedianMs:historical.freshSessions.medianMs,warmMedianMs:historical.warm.medianMs},repetitions,medianFreshMs:medianFresh,medianWarmMs:medianWarm,freshRatio:medianFresh/historical.freshSessions.medianMs,warmRatio:medianWarm/historical.warm.medianMs,investigation:medianFresh/historical.freshSessions.medianMs>1.2||medianWarm/historical.warm.medianMs>1.2 ? "Repeated >20% change requires investigation; no blanket performance PASS" : "No repeated median regression above 20%",scope:"Equivalent retained small TSJS corpus; not a claim about changed repository-wide pilot or worst-case throughput"};
  writeFileSync("docs/fs-03/evidence/historical-performance.json",JSON.stringify(report,null,2)+"\n");console.log(JSON.stringify(report));
}finally{assert(path.basename(root).startsWith("cartograph FS03 historical "));rmSync(root,{recursive:true,force:true});}
