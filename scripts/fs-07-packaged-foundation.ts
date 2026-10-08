import assert from "node:assert/strict";
import { cpSync, copyFileSync, mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import path from "node:path";
import os from "node:os";

// First-party synthetic sources only. This qualifies packaged foundations,
// never the still-incomplete navigation/Expo/native specification matrix.
const manifest = JSON.parse(readFileSync("docs/fs-00/support-manifest.json", "utf8")) as {tuples: {id: string; versions: Record<string,string>}[]};
const temporary = mkdtempSync(path.join(os.tmpdir(), "cartograph FS07 packaged "));
try {
  const engine = path.join(temporary, "engine"), runtime = path.join(temporary, "node.exe");
  cpSync("src-tauri/resources/generated/engine", engine, {recursive: true});
  copyFileSync("src-tauri/binaries/code-engine-x86_64-pc-windows-msvc.exe", runtime);
  const cases: {tuple: string; root: string}[] = [];
  for (const tuple of manifest.tuples.filter(t => ["rn83-bare", "rn85-bare", "expo55", "expo56"].includes(t.id))) {
    const root = path.join(temporary, tuple.id); mkdirSync(root);
    const sources = {
      "package.json": JSON.stringify({name: "controlled-packaged-rn", dependencies: tuple.versions}),
      "index.ts": "import {AppRegistry} from 'react-native'; import {App} from './App'; import {choice} from './Choice'; AppRegistry.registerComponent('Controlled',()=>App); choice();\n",
      "App.tsx": "import {Pressable} from 'react-native';export function handle(){} export function App(){return <Pressable onPress={handle}/>;}\n",
      "Choice.android.ts": "export function choice(){return 'android';}\n",
      "Choice.ios.ts": "export function choice(){return 'ios';}\n",
      "Flow.js": "// @flow\nexport function local(x:number){return x;} export function outer(){local(1);}\n",
      "sentinel.js": "throw Error('INSPECTED APPLICATION MUST NEVER EXECUTE');\n",
    };
    for (const [file, text] of Object.entries(sources)) writeFileSync(path.join(root, file), text);
    cases.push({tuple: tuple.id, root});
  }
  assert.equal(cases.length, 4);
  const url = (file: string) => JSON.stringify(pathToFileURL(path.join(engine, file)).href);
  const probe = `import assert from 'node:assert/strict';import net from 'node:net';import path from 'node:path';import {createRequire} from 'node:module';import {readFileSync,writeFileSync,renameSync} from 'node:fs';
import {createComposedRefresh} from ${url("lib/engine/adapters/composed.ts")};
import {serializeSnapshot,deserializeSnapshot} from ${url("lib/engine/contract.ts")};
const require=createRequire(import.meta.url);assert.equal(process.env.PATH,'');for(const name of ['python','metro','expo','react-native','next','pnpm'])assert.throws(()=>require.resolve(name));
globalThis.fetch=()=>{throw Error('denied egress')};net.connect=()=>{throw Error('denied egress')};net.createConnection=net.connect;
const results=[];for(const item of ${JSON.stringify(cases)})for(const platform of ['android','ios']){
 const refresh=createComposedRefresh({host:path.resolve('bin/parser-host.exe'),metroModes:[platform+'-development']});
 const started=performance.now(),first=await refresh.analyze(item.root,true),s=first.snapshot;
 assert(s.files.some(f=>f.path==='Flow.js'));assert(s.behavior.relations.some(r=>r.site.file==='Flow.js'&&r.relation==='calls'));
 const v=s.analysis.variants.find(v=>v.platform===platform&&v.profileId.includes('fs-07/1'));assert(v);
 assert(s.analysis.bindings.some(b=>b.variantId===v.id&&b.kind==='module-dependency'&&b.targetId==='Choice.'+platform+'.ts'));
 assert(!s.analysis.bindings.some(b=>b.variantId===v.id&&b.targetId==='Choice.'+(platform==='android'?'ios':'android')+'.ts'));
 assert(s.analysis.bindings.some(b=>b.variantId===v.id&&b.kind==='entry-point'));
 assert(s.analysis.bindings.some(b=>b.variantId===v.id&&b.kind==='event-handler'));
 assert.deepEqual(deserializeSnapshot(serializeSnapshot(s)),s);assert.deepEqual((await refresh.analyze(item.root,false)).snapshot,s);
 const {createHash}=await import('node:crypto');
 results.push({tuple:item.tuple,platform,profileId:v.profileId,variantId:v.id,extractorVersion:'fs-07/1',files:s.files.length,bindings:s.analysis.bindings.length,sourceHashes:s.files.map(f=>({path:f.path,hash:f.hash})),outputHash:createHash('sha256').update(serializeSnapshot(s)).digest('hex'),elapsedMs:performance.now()-started,rssBytes:process.memoryUsage().rss,snapshotBytes:Buffer.byteLength(serializeSnapshot(s)),missingProof:['full pattern qualification','navigation','Expo routing','native spec boundaries','resource ceilings','fault containment matrix']});}
const faults=[];const faultRoot=${JSON.stringify(cases[0].root)},refresh=createComposedRefresh({host:path.resolve('bin/parser-host.exe')});
const accepted=(await refresh.analyze(faultRoot,true)).snapshot,serialized=serializeSnapshot(accepted);
for(const fault of ['missing-manifest','corrupt-manifest','corrupt-parser']){
 const file=fault==='corrupt-parser'?require.resolve('hermes-parser'):path.resolve('flow-runtime.json'),saved=readFileSync(file),backup=file+'.fs07-isolated-backup';
 try{
  if(fault==='missing-manifest')renameSync(file,backup);else writeFileSync(file,fault==='corrupt-manifest'?'{}':'throw Error("CORRUPT PARSER MUST NOT LOAD");');
  await assert.rejects(()=>refresh.analyze(faultRoot,true),e=>e?.reason==='parser-unavailable');
  assert.equal(serializeSnapshot(accepted),serialized);
  const fresh=(await createComposedRefresh({host:path.resolve('bin/parser-host.exe')}).analyze(faultRoot,true)).snapshot;
  assert(!fresh.files.some(f=>f.path==='Flow.js'));assert(fresh.diagnostics.some(d=>d.path==='Flow.js'&&d.reason==='parser-unavailable'));
  faults.push({id:fault,status:'PASS',noSyntaxFallback:true,previousSnapshotUnchanged:true});
 }finally{if(fault==='missing-manifest')renameSync(backup,file);else writeFileSync(file,saved);}
}
assert((await refresh.analyze(faultRoot,true)).snapshot.files.some(f=>f.path==='Flow.js'));
console.log(JSON.stringify({status:'PASS',scope:'packaged foundations only',results,faults,emptyPath:true,egressDenied:true,inspectedExecution:false}));`;
  const probePath = path.join(engine, "fs07-probe.mjs"); writeFileSync(probePath, probe);
  const output = execFileSync(runtime, [probePath], {cwd: engine, env: {PATH: "", SystemRoot: process.env.SystemRoot, NODE_ENV: "production"}, encoding: "utf8", timeout: 240000, maxBuffer: 8 * 1024 * 1024});
  const result = JSON.parse(output.trim()); assert.equal(result.status, "PASS"); assert.equal(result.results.length, 8);
  writeFileSync("docs/fs-07/evidence/packaged-foundation.json", JSON.stringify({...result, probeHash: createHash("sha256").update(probe).digest("hex"), runtimeManifest: JSON.parse(readFileSync(path.join(engine, "flow-runtime.json"), "utf8"))}, null, 2) + "\n");
  console.log("PASS eight packaged Windows foundation profiles; full FS-07 remains incomplete");
} finally { assert(path.basename(temporary).startsWith("cartograph FS07 packaged ")); rmSync(temporary, {recursive: true, force: true}); }
