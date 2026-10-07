import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { PythonParserWorker } from "../lib/engine/parser-worker.ts";
const hash=(value:Uint8Array|string)=>createHash("sha256").update(value).digest("hex");
const targets=[{id:"python31215",version:"3.12.15",parent:"django52"},{id:"python31316",version:"3.13.16",parent:"django60"}];
const profile="static-python-declared-environment", requested=process.argv.find(arg=>arg.startsWith("--tuple="))?.slice(8), requestedProfile=process.argv.find(arg=>arg.startsWith("--profile="))?.slice(10);
assert(process.argv.includes("--all")||requested,"Specify --all or --tuple=<id>");assert(!requested||targets.some(t=>t.id===requested),"Unknown tuple");assert(!requestedProfile||requestedProfile===profile,"Unknown profile");
const syntaxBytes=readFileSync("tests/fixtures/framework-support/F05-python/syntax.json"),semanticBytes=readFileSync("tests/fixtures/framework-support/F05-python/semantics.json");
const semantics=JSON.parse(semanticBytes.toString()) as {cases:{id:string;source:string;calls:string[];gap:boolean;all?:string[]|null;mro?:string[]|null}[]};
const records=[];let failed=false;
for(const target of targets.filter(t=>!requested||t.id===requested)){
  try{
    const oracles=JSON.parse(readFileSync("docs/fs-05/evidence/syntax-oracles.json","utf8")) as {tuple:string;python:string;profile:string;fixtureHash:string;records:{id:string;status:string}[]}[];
    const oracle=oracles.find(o=>o.tuple===target.id);assert(oracle&&oracle.python===target.version&&oracle.profile===profile&&oracle.fixtureHash===hash(syntaxBytes),"Missing/stale exact-version oracle");
    const cases=JSON.parse(syntaxBytes.toString()) as {cases:{id:string}[]};assert.equal(oracle.records.length,cases.cases.length);for(const c of cases.cases)assert(oracle.records.some(r=>r.id===c.id&&r.status==="PASS"),"Missing syntax case "+c.id);
    const worker=new PythonParserWorker(path.resolve("src-tauri/target/debug/parser-host.exe")),patterns=[];
    try{
      await worker.start();
      for(const c of semantics.cases){const syntax=await worker.parse(c.id+".py",Buffer.from(c.source)),names=new Map(syntax.behavior.declarations.map(d=>[d.id,d.name]));assert.deepEqual(syntax.behavior.relations.filter(r=>r.relation==="calls").map(r=>names.get(r.target)),c.calls,c.id);assert.equal(syntax.behavior.gaps.length>0,c.gap,c.id);if("all"in c)assert.deepEqual(syntax.all?.map(e=>e.name)??null,c.all,c.id);if("mro"in c)assert.deepEqual(syntax.inheritance.at(-1)?.mro?.map(id=>names.get(id))??null,c.mro,c.id);assert.deepEqual(await worker.parse(c.id+".py",Buffer.from(c.source)),syntax);patterns.push({id:c.id,status:"PASS",sourceHash:hash(c.source),outputHash:hash(JSON.stringify(syntax)),verifiedCalls:c.calls,typedGaps:[...new Set(syntax.behavior.gaps.map(g=>g.reason))],forbidden:"Every call beyond the exact controlled oracle; every repeated output difference",extractorVersion:"fs-05/1",visitedNodes:syntax.visited,facts:syntax.behavior.declarations.length+syntax.behavior.relations.length+syntax.behavior.gaps.length+syntax.imports.length});}
    }finally{await worker.close();}
    records.push({tuple:target.id,python:target.version,baselineParent:target.parent,profile,status:"PASS controlled syntax/semantic patterns",syntax:oracle.records,patterns,semanticFixtureHash:hash(semanticBytes),extractorHash:hash(readFileSync("lib/engine/adapters/python-syntax.ts")),scope:"Language foundation only; no Django/DRF qualification or overall-phase completion"});
  }catch(error){failed=true;records.push({tuple:target.id,python:target.version,profile,status:"UNVERIFIED",missingProof:error instanceof Error?error.message:"Unknown qualification failure"});}
}
writeFileSync("docs/fs-05/evidence/qualification.json",JSON.stringify(records,null,2)+"\n");process.stdout.write(JSON.stringify(records.map(r=>({tuple:r.tuple,status:r.status})))+"\n");if(failed)process.exitCode=1;
