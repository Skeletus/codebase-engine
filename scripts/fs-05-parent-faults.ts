import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, copyFileSync, writeFileSync, readFileSync, mkdtempSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { PythonParserWorker } from "../lib/engine/parser-worker.ts";
import { createComposedRefresh } from "../lib/engine/adapters/composed.ts";
import os from "node:os";
const directory=path.resolve("node_modules/.fs05-experiments/parent-faults");mkdirSync(directory,{recursive:true});
const source="tests/fixtures/framework-support/F05-python/parser-fault-host.rs",binary=path.join(directory,"fault.exe");
execFileSync("rustc",[source,"-o",binary],{timeout:30000});
const cases=[{mode:"startup",reason:"parser-unavailable",startup:true},{mode:"wrong-abi",reason:"parser-unavailable",startup:true},{mode:"exit-during-frame",reason:"resource-limit|parser-unavailable",startup:false},{mode:"output-below",reason:"parser-unavailable",startup:false},{mode:"output-at",reason:"parser-unavailable",startup:false},{mode:"output",reason:"resource-limit",startup:false},{mode:"diagnostics-below",reason:null,startup:false},{mode:"diagnostics-at",reason:null,startup:false},{mode:"diagnostics",reason:"resource-limit",startup:false},{mode:"parse-timeout",reason:"resource-limit",startup:false},{mode:"invalid-result",reason:"parser-unavailable",startup:false}];
const records=[];
for(const c of cases){
  const host=path.join(directory,c.mode+".exe");copyFileSync(binary,host);const worker=new PythonParserWorker(host),started=performance.now();
  try {if(c.startup)await assert.rejects(worker.start(),new RegExp(c.reason!));else{await worker.start();if(c.reason)await assert.rejects(worker.parse("controlled.py",Buffer.from(c.mode==="exit-during-frame"?"#"+"a".repeat(1048574)+"\n":"x=1\n")),new RegExp(c.reason));else assert.equal((await worker.parse("controlled.py",Buffer.from("x=1\n"))).visited,0);}}
  finally{await worker.close();}
  const fresh=new PythonParserWorker(path.resolve("src-tauri/target/debug/parser-host.exe"));try{await fresh.start();assert.equal((await fresh.parse("fresh.py",Buffer.from("def fresh():\n    pass\n"))).behavior.declarations[0].name,"fresh");}finally{await fresh.close();}
  records.push({...c,status:"PASS",elapsedMs:performance.now()-started});
}
const root=mkdtempSync(path.join(os.tmpdir(),"cartograph FS05 response-retention "));
try{
  writeFileSync(path.join(root,"controlled.py"),"def original():\n    pass\n");
  const previous=(await createComposedRefresh({host:path.resolve("src-tauri/target/release/parser-host.exe")}).analyze(root,true)).snapshot;
  await assert.rejects(createComposedRefresh({host:path.join(directory,"invalid-result.exe"),previousSnapshot:()=>previous}).analyze(root,true),/parser-unavailable/);
  assert.equal(previous.behavior.declarations[0].name,"original");
  records.push({mode:"invalid-result-retains-reopened-generation",reason:"parser-unavailable",startup:false,status:"PASS",elapsedMs:0});
}finally{assert(path.basename(root).startsWith("cartograph FS05 response-retention "));rmSync(root,{recursive:true,force:true});}
writeFileSync("docs/fs-05/evidence/parent-faults.json",JSON.stringify({scope:"Parent lifecycle/IPC negative checks with an application-owned fault executable; separate from real Windows job qualification",sourceHash:createHash("sha256").update(readFileSync(source)).digest("hex"),records},null,2)+"\n");
process.stdout.write(`PASS ${records.length} parent faults and fresh recoveries\n`);
