import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { PythonParserWorker, ParserWorkerError } from "../lib/engine/parser-worker.ts";
const records=[];
for(const kind of ["nodes","facts"] as const)for(const count of kind==="nodes"?[99998,99999,100000]:[19999,20000,20001]){
  const source=kind==="nodes"?"#\n".repeat(count):Array.from({length:count},(_,n)=>`import m${n}\n`).join("");
  const worker=new PythonParserWorker(path.resolve("src-tauri/target/release/parser-host.exe")),started=performance.now();
  try{
    await worker.start();
    try{const syntax=await worker.parse("limits.py",Buffer.from(source));assert(count<(kind==="nodes"?100000:20001),"Above boundary accepted");assert.equal(kind==="nodes"?syntax.visited:syntax.imports.length,kind==="nodes"?count+1:count);records.push({kind,count,status:"PASS",outcome:"accepted",visited:syntax.visited,imports:syntax.imports.length,sourceBytes:Buffer.byteLength(source),sourceHash:createHash("sha256").update(source).digest("hex"),elapsedMs:performance.now()-started});}
    catch(error){if(!(error instanceof ParserWorkerError&&error.reason==="resource-limit"))throw error;records.push({kind,count,status:count===(kind==="nodes"?100000:20001)?"PASS":"UNVERIFIED",outcome:"resource-limit",missingProof:count===(kind==="nodes"?100000:20001)?null:"An interacting deadline/memory/output boundary prevented qualification at this independent node/fact count",sourceBytes:Buffer.byteLength(source),sourceHash:createHash("sha256").update(source).digest("hex"),elapsedMs:performance.now()-started});}
  }finally{await worker.close();}
}
writeFileSync("docs/fs-05/evidence/extractor-limits.json",JSON.stringify({harnessHash:createHash("sha256").update(readFileSync(import.meta.filename)).digest("hex"),records},null,2)+"\n");process.stdout.write(JSON.stringify(records)+"\n");if(records.some(r=>r.status!=="PASS"))process.exitCode=1;
