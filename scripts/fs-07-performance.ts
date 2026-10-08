import assert from "node:assert/strict";
import {cpSync,mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {pathToFileURL} from "node:url";
import path from "node:path";
import os from "node:os";

// Application-owned performance runners only. Restore captured accepted FS-06
// application sources, not customer code or a guessed historical HEAD.
const hash=(v:Buffer|string)=>createHash("sha256").update(v).digest("hex");
const baselineBytes=readFileSync("docs/fs-07/evidence/starting-inventory.json"),baseline=JSON.parse(baselineBytes.toString()) as {head:string;files:{path:string;sha256:string}[];acceptedSource:{path:string;base64:string}[]};
const root=mkdtempSync(path.join(os.tmpdir(),"cartograph FS07 paired performance "));
try{
  const accepted=path.join(root,"accepted"),current=path.join(root,"current"),fixture=path.join(root,"fixture");mkdirSync(fixture);
  for(const engine of [accepted,current])cpSync("src-tauri/resources/generated/engine",engine,{recursive:true});
  const restored=[];
  for(const entry of baseline.acceptedSource.filter(s=>s.path.startsWith("lib/"))){
    assert(!path.isAbsolute(entry.path)&&!entry.path.split("/").includes(".."));const bytes=Buffer.from(entry.base64,"base64");assert.equal(hash(bytes),baseline.files.find(f=>f.path===entry.path)?.sha256);
    mkdirSync(path.dirname(path.join(accepted,entry.path)),{recursive:true});writeFileSync(path.join(accepted,entry.path),bytes);restored.push({path:entry.path,hash:hash(bytes)});
  }
  const fixtureBytes=readFileSync("tests/fixtures/framework-support/F02-profile/fixture.json"),sources=(JSON.parse(fixtureBytes.toString()) as {sources:Record<string,string>}).sources;
  for(const [file,text]of Object.entries(sources)){assert(!path.isAbsolute(file)&&!file.split("/").includes(".."));mkdirSync(path.dirname(path.join(fixture,file)),{recursive:true});writeFileSync(path.join(fixture,file),text);}
  const results=[];
  for(const [name,engine]of [["accepted",accepted],["current",current]]){
    const script=path.join(root,name+"-probe.mjs");
    writeFileSync(script,`import {createTypescriptRefresh} from ${JSON.stringify(pathToFileURL(path.join(engine,"lib/engine/adapters/typescript.ts")).href)};import {serializeSnapshot} from ${JSON.stringify(pathToFileURL(path.join(engine,"lib/engine/contract.ts")).href)};import {createHash} from 'node:crypto';
const root=${JSON.stringify(fixture)},cold=[],warm=[],outputs=[];let peakObservedRss=0;const take=(refresh,full)=>{const start=performance.now(),s=refresh.analyze(root,full).snapshot;peakObservedRss=Math.max(peakObservedRss,process.memoryUsage().rss);outputs.push(createHash('sha256').update(serializeSnapshot(s)).digest('hex'));return performance.now()-start;};for(let i=0;i<5;i++)cold.push(take(createTypescriptRefresh(),true));const refresh=createTypescriptRefresh();take(refresh,true);for(let i=0;i<20;i++)warm.push(take(refresh,false));console.log(JSON.stringify({cold,warm,outputs,peakObservedRss}));`);
    const output=JSON.parse(execFileSync(process.execPath,[script],{cwd:engine,encoding:"utf8",timeout:120000,windowsHide:true})) as {cold:number[];warm:number[];outputs:string[];peakObservedRss:number};
    assert(output.outputs.every(h=>h===output.outputs[0]));
    const stats=(samples:number[])=>{const values=[...samples].sort((a,b)=>a-b);return {samples,medianMs:values[Math.floor(values.length/2)],p95Ms:values[Math.ceil(values.length*.95)-1]};};
    results.push({name,cold:stats(output.cold),warm:stats(output.warm),snapshotHash:output.outputs[0],peakObservedRss:output.peakObservedRss});
  }
  assert.equal(results[0].snapshotHash,results[1].snapshotHash,"Equivalent unchanged TS/JS corpus outputs must match");
  const coldRatio=results[1].cold.medianMs/results[0].cold.medianMs,warmRatio=results[1].warm.medianMs/results[0].warm.medianMs;
  writeFileSync("docs/fs-07/evidence/performance-comparison.json",JSON.stringify({status:"PASS",scope:"unchanged TS/JS historical comparison only",baselineHead:baseline.head,baselineInventoryHash:hash(baselineBytes),restored,fixtureHash:hash(fixtureBytes),runtime:process.version,host:{platform:process.platform,arch:process.arch,cpus:os.cpus().map(c=>c.model),memoryBytes:os.totalmem()},results,coldRatio,warmRatio,investigationRequired:coldRatio>1.2||warmRatio>1.2,limitations:["observed RSS is not peak committed memory","per-tuple new-domain 5 cold/20 warm measurements and ceilings remain separate mandatory gates"]},null,2)+"\n");
  console.log(JSON.stringify({scope:"unchanged TS/JS historical comparison",coldRatio,warmRatio,investigationRequired:coldRatio>1.2||warmRatio>1.2}));
}finally{assert(path.basename(root).startsWith("cartograph FS07 paired performance "));rmSync(root,{recursive:true,force:true});}
