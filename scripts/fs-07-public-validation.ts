import assert from "node:assert/strict";
import path from "node:path";
import {mkdirSync,writeFileSync,readFileSync,existsSync} from "node:fs";
import {createHash} from "node:crypto";
import {createComposedRefresh} from "../lib/engine/adapters/composed.ts";
import {serializeSnapshot} from "../lib/engine/contract.ts";

// Opt-in supplementary validation. Download bounded public text at an immutable
// SHA. Never install dependencies, load config, import or run application files.
const sha="76a1dd12978a7ba54b0e318cec01a8578db3b0c0",project="stickersmash",base=path.resolve("node_modules/.fs07-experiments/public",project+"-"+sha),hash=(v:Uint8Array|string)=>createHash("sha256").update(v).digest("hex");
const response=await fetch(`https://api.github.com/repos/expo/examples/git/trees/${sha}?recursive=1`,{headers:{"User-Agent":"Cartograph-FS07-static-qualification"}});assert(response.ok);
const tree=await response.json() as {truncated:boolean;tree:{path:string;type:string;size?:number}[]};assert.equal(tree.truncated,false);
const files=tree.tree.filter(f=>f.type==="blob"&&f.path.startsWith(project+"/")&&/\.(?:[cm]?[jt]sx?|json)$/.test(f.path)&&!f.path.split("/").some(p=>["node_modules",".git",".expo","dist","build"].includes(p)));assert(files.length>5&&files.length<=128);
mkdirSync(base,{recursive:true});const sources=[];
for(const file of files){assert(file.size!==undefined&&file.size<=1048576);const relative=file.path.slice(project.length+1),target=path.resolve(base,relative);assert(target.startsWith(base+path.sep));const raw=await fetch(`https://raw.githubusercontent.com/expo/examples/${sha}/${file.path.split("/").map(encodeURIComponent).join("/")}`);assert(raw.ok);const bytes=new Uint8Array(await raw.arrayBuffer());assert(bytes.length<=1048576);if(existsSync(target))assert.equal(hash(readFileSync(target)),hash(bytes));else{mkdirSync(path.dirname(target),{recursive:true});writeFileSync(target,bytes);}sources.push({path:relative,hash:hash(bytes),bytes:bytes.length});}
const results=[];
for(const platform of ["android","ios"] as const){const started=performance.now(),refresh=createComposedRefresh({host:path.resolve("src-tauri/target/debug/parser-host.exe"),metroModes:[platform==="android"?"android-development":"ios-development"]}),s=(await refresh.analyze(base,true)).snapshot;assert.deepEqual((await refresh.analyze(base,false)).snapshot,s);results.push({platform,outputHash:hash(serializeSnapshot(s)),files:s.files.length,diagnostics:s.diagnostics,capabilities:s.analysis.capabilities,bindings:s.analysis.bindings.length,registrations:s.analysis.registrations.length,gaps:s.analysis.gaps,elapsedMs:performance.now()-started,rssBytes:process.memoryUsage().rss});}
writeFileSync("docs/fs-07/evidence/public-stickersmash.json",JSON.stringify({status:"PASS",scope:"supplementary static robustness only; upstream versions are not rewritten or qualified",repository:"https://github.com/expo/examples",commit:sha,project,sources,results,applicationExecution:false,configurationExecution:false,dependencyInstallation:false,missingProof:["qualified exact-tuple public application interoperability","native binary assets excluded from text-only supplement"]},null,2)+"\n");
console.log("PASS pinned public StickerSmash source: static repeatability; no version overrides or application execution");
