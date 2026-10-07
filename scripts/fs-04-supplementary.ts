import assert from "node:assert/strict";
import path from "node:path";
import {readFileSync,writeFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {createTypescriptRefresh} from "../lib/engine/adapters/typescript.ts";
if(!process.argv.includes("--run"))throw Error("Explicit --run required");
const checkout=path.resolve("node_modules/.fs03-experiments/bulletproof-react"),commit="9506629ed003a561c6627735480cce4994244bb4";
assert.equal(execFileSync("git",["-C",checkout,"rev-parse","HEAD"],{encoding:"utf8"}).trim(),commit);assert.equal(execFileSync("git",["-C",checkout,"status","--porcelain"],{encoding:"utf8"}).trim(),"");
globalThis.fetch=async()=>{throw Error("Supplementary analysis egress denied")};
const results=[];
for(const subtree of ["apps/nextjs-app","apps/nextjs-pages"]){const root=path.join(checkout,subtree),start=performance.now(),snapshot=createTypescriptRefresh().analyze(root,true).snapshot;results.push({repository:"https://github.com/alan2207/bulletproof-react",commit,subtree,licenseHash:createHash("sha256").update(readFileSync(path.join(checkout,"LICENSE"))).digest("hex"),inventoryHash:createHash("sha256").update(JSON.stringify(snapshot.files.map(f=>[f.path,f.hash]))).digest("hex"),files:snapshot.files.length,imports:snapshot.relationships.length,elapsedMs:performance.now()-start,fs04Bindings:snapshot.analysis.bindings.filter(b=>b.variantId.includes("fs-04/1")).length,assessments:snapshot.analysis.capabilities.filter(c=>c.extractorVersion==="fs-04/1"),unsupportedPatterns:["declared version ranges do not prove exact qualified tuple","external libraries and custom configuration remain boundaries"],policy:"Supplementary read-only source; no checkout dependencies, configuration, plugins, or application logic executed"});}
writeFileSync("docs/fs-04/evidence/supplementary.json",JSON.stringify(results,null,2)+"\n");console.log(JSON.stringify(results.map(r=>({subtree:r.subtree,commit:r.commit,files:r.files,imports:r.imports,fs04Bindings:r.fs04Bindings}))));
