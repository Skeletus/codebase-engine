import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createMetroResolver, type MetroPackage } from "../../lib/parser/adapters/metro-resolution.ts";
import { GenerationBoundary } from "../../lib/engine/boundary.ts";
import { createRequire } from "node:module";
import { extractFlow, type FlowParser } from "../../lib/engine/adapters/flow-syntax.ts";
import { validateFlowSyntax } from "../../lib/engine/adapters/flow-contract.ts";
import { FlowParserWorker, PythonParserWorker, ParserWorkerError } from "../../lib/engine/parser-worker.ts";
import path from "node:path";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { createTypescriptRefresh } from "../../lib/engine/adapters/typescript.ts";
import { serializeSnapshot, deserializeSnapshot } from "../../lib/engine/contract.ts";
import { readWitnessEvidence } from "../../lib/engine/index.ts";
import { createComposedRefresh } from "../../lib/engine/adapters/composed.ts";
import { flowPragma } from "../../lib/parser/flow-dialect.ts";
import {RepositoryRefresh} from "../../lib/engine/refresh.ts";
import type {CodeSnapshot} from "../../lib/engine/types.ts";
import {rankInvestigation} from "../../lib/engine/ranking.ts";
import {SqliteAnalysisStore} from "../../lib/storage/sqlite.ts";
import {spawn} from "node:child_process";
import {validateEvent,type EngineEvent} from "../../lib/desktop/protocol.ts";
test("RN shipped sidecar: both mobile profiles are accessible through the existing protocol without UI/schema changes",async()=>{
  const manifest=JSON.parse(readFileSync("docs/fs-00/support-manifest.json","utf8")) as {tuples:{id:string;versions:Record<string,string>}[]},records=[];
  for(const tuple of manifest.tuples.filter(t=>["rn83-bare","rn85-bare","expo55","expo56"].includes(t.id))){
    const root=mkdtempSync(path.join(tmpdir(),"cartograph FS07 "));
    try{
      writeFileSync(path.join(root,"package.json"),JSON.stringify({dependencies:tuple.versions}));writeFileSync(path.join(root,"App.tsx"),"import {AppRegistry,Pressable} from 'react-native';import {choice} from './Choice';export function handler(){choice();}export function App(){return <Pressable onPress={handler}/>;}AppRegistry.registerComponent('Controlled',()=>App);\n");
      for(const platform of ["android","ios"])writeFileSync(path.join(root,"Choice."+platform+".ts"),"export function choice(){}\n");
      const events=await new Promise<EngineEvent[]>((resolve,reject)=>{
        const child=spawn(process.execPath,[path.resolve("scripts/sidecar.ts")],{windowsHide:true,env:{NODE_ENV:"production",PATH:"",SystemRoot:process.env.SystemRoot,CODE_INTELLIGENCE_ROOT:root},stdio:["pipe","pipe","pipe"]});
        let buffer="",diagnostics="";const received:EngineEvent[]=[],timer=setTimeout(()=>{child.kill();reject(Error("sidecar fixture deadline"));},15000);
        child.on("error",reject);child.stderr.on("data",bytes=>{diagnostics+=bytes.toString();if(diagnostics.length>65536){child.kill();reject(Error("sidecar fixture diagnostic limit"));}});
        child.stdout.on("data",bytes=>{try{buffer+=bytes.toString();assert(Buffer.byteLength(buffer)<=32*1024*1024);while(buffer.includes("\n")){const end=buffer.indexOf("\n"),event=validateEvent(JSON.parse(buffer.slice(0,end)));buffer=buffer.slice(end+1);received.push(event);if(event.type==="complete")child.stdin.end();if(event.type==="error"){child.kill();reject(Error(event.code));}}}catch(error){child.kill();reject(error);}});
        child.on("close",code=>{clearTimeout(timer);if(code!==0)reject(Error("sidecar fixture exited unsuccessfully"));else resolve(received);});child.stdin.write(JSON.stringify({version:1,jobId:"controlled",requestId:"analyze",type:"analyze",snapshotVersion:3,root})+"\n");
      });
      const complete=events.find(e=>e.type==="complete");assert(complete?.type==="complete");const s=complete.snapshot,variants=s.analysis.variants.filter(v=>v.profileId.includes("fs-07/1"));assert.deepEqual(variants.map(v=>v.platform).sort(),["android","ios"]);
      for(const variant of variants){const bindings=s.analysis.bindings.filter(b=>b.variantId===variant.id);assert(bindings.some(b=>b.kind==="entry-point"));assert(bindings.some(b=>b.kind==="event-handler"));assert(bindings.some(b=>b.kind==="module-dependency"&&b.targetId==="Choice."+variant.platform+".ts"));assert(!bindings.some(b=>b.targetId==="Choice."+(variant.platform==="ios"?"android":"ios")+".ts"));}
      records.push({tuple:tuple.id,status:"PASS",profiles:variants.map(v=>({id:v.id,profileId:v.profileId,platform:v.platform})),sourceHashes:s.files.map(f=>({path:f.path,hash:f.hash})),outputHash:digest(serializeSnapshot(s)),snapshotVersion:s.version,emptyPath:true,inspectedExecution:false});
    }finally{assert(path.basename(root).startsWith("cartograph FS07 "));rmSync(root,{recursive:true,force:true});}
  }writeFileSync("docs/fs-07/evidence/sidecar-mobile-profiles.json",JSON.stringify({status:"PASS",scope:"Existing desktop protocol publishes both mobile variants for controlled TS/JS projects",sidecarHash:digest(readFileSync("scripts/sidecar.ts")),testHash:digest(readFileSync("tests/framework-support/fs-07.test.ts")),records},null,2)+"\n");
});
test("RN React reuse: wrappers, lazy, events, hook callbacks and context independently on every tuple/profile",()=>{
  const fixtureBytes=readFileSync("tests/fixtures/framework-support/F07-rn/react-patterns.json"),fixture=JSON.parse(fixtureBytes.toString()) as {sources:Record<string,string>};
  const manifest=JSON.parse(readFileSync("docs/fs-00/support-manifest.json","utf8")) as {tuples:{id:string;versions:Record<string,string>}[]};
  mkdirSync("docs/fs-07/evidence/qualification",{recursive:true});
  for(const tuple of manifest.tuples.filter(t=>["rn83-bare","rn85-bare","expo55","expo56"].includes(t.id))){
    const root=mkdtempSync(path.join(tmpdir(),"cartograph FS07 "));
    try{
      writeFileSync(path.join(root,"package.json"),JSON.stringify({dependencies:tuple.versions}));for(const [file,source]of Object.entries(fixture.sources))writeFileSync(path.join(root,file),source);
      const driver=createTypescriptRefresh({metroModes:["android-development","ios-development"]}),started=performance.now(),s=driver.analyze(root,true).snapshot;
      assert.deepEqual(driver.analyze(root,false).snapshot,s);assert.deepEqual(createTypescriptRefresh({metroModes:["android-development","ios-development"]}).analyze(root,true).snapshot,s);assert.deepEqual(deserializeSnapshot(serializeSnapshot(s)),s);
      for(const variant of s.analysis.variants.filter(v=>v.profileId.includes("fs-07/1"))){
        const bindings=s.analysis.bindings.filter(b=>b.variantId===variant.id),rule=(name:string)=>bindings.filter(b=>b.witnesses.some(w=>w.role==="framework-rule"&&w.ruleId===name));
        for(const name of ["react/memo","react/forwardRef","react/lazy","react/context-provider","react/context-provider-shorthand","rn/native-ui-event:Pressable:onPress","rn/native-ui-event:TextInput:onChangeText","react/useEffect/callback","react/useLayoutEffect/callback","react/useInsertionEffect/callback","react/useCallback/callback/0","react/useReducer/callback/0","react/useReducer/callback/2","react/useImperativeHandle/callback/1","react/useSyncExternalStore/callback/0","react/useSyncExternalStore/callback/1","react/useSyncExternalStore/callback/2","react/useState/initializer","react/useActionState/callback/0","react/useOptimistic/callback/1","react/useEffectEvent/callback/0","react/custom-hook"])assert.equal(rule(name).length,1,tuple.id+"/"+variant.platform+"/"+name);
        assert.equal(rule("react/context-consumer").length,2);assert.equal(rule("react/effect-cleanup").length,1);assert.equal(bindings.filter(b=>b.kind==="entry-point").length,1);
        assert.equal(bindings.filter(b=>b.kind==="event-handler").length,2);assert(s.analysis.gaps.some(g=>g.variantId===variant.id&&g.reason==="dynamic-expression"));
        for(const binding of bindings)for(const witness of binding.witnesses)assert(["current","rule"].includes(readWitnessEvidence(s,witness).state));
        assert(!bindings.filter(b=>["event-handler","lifecycle","context","wrapper"].includes(b.kind)).some(b=>s.behavior.relations.some(r=>r.relation==="calls"&&r.site.file===b.occurrence.file&&r.site.start===b.occurrence.start)));
        const output={bindings,registrations:s.analysis.registrations.filter(r=>r.variantId===variant.id),gaps:s.analysis.gaps.filter(g=>g.variantId===variant.id)};
        writeFileSync(`docs/fs-07/evidence/qualification/${tuple.id}-${variant.platform}-react-reuse.json`,JSON.stringify({status:"PASS",scope:"TS/JS React reuse patterns only",tuple:tuple.id,versions:tuple.versions,profileId:variant.profileId,variantId:variant.id,extractorVersion:"fs-07/1",fixtureHash:digest(fixtureBytes),testHash:digest(readFileSync("tests/framework-support/fs-07.test.ts")),sourceHashes:s.files.map(f=>({path:f.path,hash:f.hash})),outputHash:digest(JSON.stringify(output)),bindingCounts:Object.fromEntries([...new Set(bindings.map(b=>b.kind))].map(k=>[k,bindings.filter(b=>b.kind===k).length])),missingProof:["Flow framework bindings","whole-worker peak commit","full framework qualification"],resource:{elapsedMs:performance.now()-started,observedParentRss:process.memoryUsage().rss,snapshotBytes:Buffer.byteLength(serializeSnapshot(s))},gapReasons:[...new Set(output.gaps.map(g=>g.reason))],inspectedExecution:false},null,2)+"\n");
      }
    }finally{assert(path.basename(root).startsWith("cartograph FS07 "));rmSync(root,{recursive:true,force:true});}
  }
});
test("RN route ceiling: variant growth aborts a generation and retains its prior publication",()=>{
  const root=mkdtempSync(path.join(tmpdir(),"cartograph FS07 ")),driver=createTypescriptRefresh({metroModes:["android-development","ios-development"]}),publications:CodeSnapshot[]=[];
  const manifest=JSON.parse(readFileSync("docs/fs-00/support-manifest.json","utf8")) as {tuples:{id:string;versions:Record<string,string>}[]};
  writeFileSync(path.join(root,"package.json"),JSON.stringify({dependencies:manifest.tuples.find(t=>t.id==="rn83-bare")!.versions}));
  writeFileSync(path.join(root,"App.tsx"),"export function Home(){return null;}\n");
  const refresh=new RepositoryRefresh({analyze:full=>driver.analyze(root,full),publish:s=>{publications.push(s);},status:()=>{}});
  try{
    refresh.run(true);const accepted=serializeSnapshot(publications[0]),started=performance.now();
    for(const file of ["First.tsx","Second.tsx"])writeFileSync(path.join(root,file),"import {createNativeStackNavigator} from '@react-navigation/native-stack';export function Home(){return null;}const Stack=createNativeStackNavigator({screens:{"+Array.from({length:3000},(_,i)=>`S${i}:Home`).join(",")+"}});\n");
    assert.throws(()=>refresh.run(true),e=>!!e&&typeof e==="object"&&"reason"in e&&e.reason==="resource-limit");assert.equal(publications.length,1);assert.equal(serializeSnapshot(publications[0]),accepted);
    const elapsedMs=performance.now()-started,inputs=["First.tsx","Second.tsx"].map(file=>({path:file,hash:digest(readFileSync(path.join(root,file))),bytes:readFileSync(path.join(root,file)).length}));
    for(const file of ["First.tsx","Second.tsx"])rmSync(path.join(root,file));refresh.run(true);assert.equal(publications.length,2);assert.equal(serializeSnapshot(publications[1]),accepted);
    writeFileSync("docs/fs-07/evidence/route-resource-ceiling.json",JSON.stringify({status:"PASS",intendedRegistrations:12000,limit:10000,profiles:["android-development","ios-development"],inputs,elapsedMs,previousPublicationUnchanged:true,recovery:true},null,2)+"\n");
  }finally{refresh.close();assert(path.basename(root).startsWith("cartograph FS07 "));rmSync(root,{recursive:true,force:true});}
});
test("Flow resource ceilings: source, syntax nodes and fact overflow discard output and recover",async()=>{
  const cases=[{id:"source",text:" ".repeat(1048577)},{id:"syntax-nodes",text:"// @flow\nconst values=["+"0,".repeat(100001)+"];"},{id:"facts",text:"// @flow\n"+Array.from({length:20001},(_,i)=>`function f${i}(){}`).join("\n")}];
  const worker=new FlowParserWorker(path.resolve("src-tauri/target/debug/parser-host.exe")),records=[];
  await worker.start();try{for(const c of cases){const bytes=Buffer.from(c.text),started=performance.now();await assert.rejects(()=>worker.parse("bounded.js",bytes),e=>e instanceof ParserWorkerError&&e.reason==="resource-limit");records.push({id:c.id,sourceBytes:bytes.length,inputHash:digest(bytes),elapsedMs:performance.now()-started,outcome:"resource-limit",unprovenFactsPublished:false});}}
  finally{await worker.close();}
  const recovered=new FlowParserWorker(path.resolve("src-tauri/target/debug/parser-host.exe"));await recovered.start();try{const syntax=await recovered.parse("recovery.js",Buffer.from("// @flow\nfunction helper(){}function caller(){helper();}\n"));assert.equal(syntax.behavior.relations.filter(r=>r.relation==="calls").length,1);}finally{await recovered.close();}
  writeFileSync("docs/fs-07/evidence/flow-resource-ceilings.json",JSON.stringify({status:"PASS",records,recovery:true,workerMemoryLimitBytes:536870912,oldSpaceMiB:128,limitations:["worker peak commit measurement and full IPC/OOM fault matrix remain separate gates"]},null,2)+"\n");
});
test("FS07 Windows watch: app metadata, Flow edits, variant switches and atomic publication",async()=>{
  const root=mkdtempSync(path.join(tmpdir(),"cartograph FS07 ")),host=path.resolve("src-tauri/target/debug/parser-host.exe");
  const manifest=JSON.parse(readFileSync("docs/fs-00/support-manifest.json","utf8")) as {tuples:{id:string;versions:Record<string,string>}[]};
  writeFileSync(path.join(root,"package.json"),JSON.stringify({dependencies:manifest.tuples.find(t=>t.id==="expo56")!.versions}));mkdirSync(path.join(root,"app"));
  writeFileSync(path.join(root,"app/index.tsx"),"export default function Home(){return null;}\n");writeFileSync(path.join(root,"app.json"),JSON.stringify({expo:{scheme:"first"}}));
  writeFileSync(path.join(root,"Flow.js"),"// @flow\nexport function helper(){}export function caller(){helper();}\n");
  const modes:("android-development"|"ios-development")[]=["android-development"],publications:CodeSnapshot[]=[],statuses:string[]=[];
  let driver=createComposedRefresh({host,metroModes:modes});
  let hold=false,release:(()=>void)|undefined;
  const refresh=new RepositoryRefresh({analyze:()=>{throw Error("async only");},analyzeAsync:async full=>{const candidate=await driver.analyze(root,full);if(hold)await new Promise<void>(resolve=>{release=resolve;});return candidate;},publish:s=>{publications.push(s);},status:s=>{statuses.push(s.state+":"+s.message);},debounceMs:100,auditMs:30000});
  const until=async(predicate:()=>boolean)=>{const deadline=performance.now()+20000;while(!predicate()){assert(performance.now()<deadline,"watch publication deadline");await new Promise(resolve=>setTimeout(resolve,25));}};
  try{
    await refresh.runAsync(true);const original=publications[0],configWitness=original.analysis.registrations[0].witnesses.find(w=>w.role!=="framework-rule"&&w.site.file==="app.json")!;assert(configWitness);refresh.start();writeFileSync(path.join(root,"app.json"),JSON.stringify({expo:{scheme:"second"}}));await until(()=>publications.length>=2);refresh.pause();
    assert.equal(readWitnessEvidence(original,configWitness).state,"stale");
    assert(publications.at(-1)!.analysis.registrations.every(r=>r.conditions.includes("linking-prefix:second://")));assert.deepEqual(publications.at(-1),(await createComposedRefresh({host,metroModes:modes}).analyze(root,true)).snapshot);
    refresh.start();const count=publications.length;writeFileSync(path.join(root,"Flow.js"),"// @flow\nexport function helper(){}export function changed(){helper();}\n");await until(()=>publications.length>count);refresh.pause();
    assert.deepEqual(publications.at(-1),(await createComposedRefresh({host,metroModes:modes}).analyze(root,true)).snapshot);
    // Analysis settings create a new driver/session, as with accepted web
    // profiles. Mutating a constructor array is not a settings update API.
    modes.splice(0,1,"ios-development");driver=createComposedRefresh({host,metroModes:modes});await refresh.runAsync(true);
    const selected=publications.at(-1)!.analysis.variants.filter(v=>v.profileId.includes("fs-07/1"));assert(!selected.some(v=>v.platform==="android"));assert(selected.some(v=>v.platform==="ios"));
    assert(!publications.at(-1)!.analysis.bindings.some(b=>b.variantId.includes("fs-07/1")&&!selected.some(v=>v.id===b.variantId)));assert.deepEqual(publications.at(-1),(await createComposedRefresh({host,metroModes:modes}).analyze(root,true)).snapshot);
    const previous=publications.at(-1),before=publications.length;hold=true;const pending=refresh.runAsync(true);await until(()=>!!release);refresh.pause();release!();await assert.rejects(pending,/unstable_generation/);assert.equal(publications.length,before);assert.equal(publications.at(-1),previous);
    hold=false;await refresh.runAsync(true);assert.deepEqual(deserializeSnapshot(serializeSnapshot(publications.at(-1)!)),publications.at(-1));
    const storage=mkdtempSync(path.join(tmpdir(),"cartograph FS07 storage ")),file=path.join(storage,"analysis.sqlite");let store=new SqliteAnalysisStore(file);
    try{const repo=store.register(root);store.begin(repo.repositoryId,"fs07-persist");store.publish(repo.repositoryId,"fs07-persist",publications.at(-1)!);store.close();store=new SqliteAnalysisStore(file);assert.deepEqual(store.load(repo.repositoryId),publications.at(-1));}
    finally{store.close();assert(path.basename(storage).startsWith("cartograph FS07 storage "));rmSync(storage,{recursive:true,force:true});}
  }finally{release?.();refresh.close();writeFileSync("docs/fs-07/evidence/watch-statuses.json",JSON.stringify(statuses,null,2)+"\n");assert(path.basename(root).startsWith("cartograph FS07 "));rmSync(root,{recursive:true,force:true});}
});
test("React Navigation nested literal actions retain ancestry and reject conditional callbacks",()=>{
  const manifest=JSON.parse(readFileSync("docs/fs-00/support-manifest.json","utf8")) as {tuples:{id:string;versions:Record<string,string>}[]};
  for(const tuple of manifest.tuples.filter(t=>["rn83-bare","rn85-bare"].includes(t.id))){
    const root=mkdtempSync(path.join(tmpdir(),"cartograph FS07 "));
    try{
      writeFileSync(path.join(root,"package.json"),JSON.stringify({dependencies:tuple.versions}));
      const source="import {createNativeStackNavigator} from '@react-navigation/native-stack';import {useNavigation} from '@react-navigation/native';export function Home(){const nav=useNavigation();nav.navigate('Nested',{screen:'Detail'});nav.navigate('Nested',{screen:runtime});return null;}export function Detail(){return null;}const Child=createNativeStackNavigator({screens:{Detail}});const Root=createNativeStackNavigator({screens:{Home,Nested:Child}});\n";
      writeFileSync(path.join(root,"App.tsx"),source);
      const refresh=createTypescriptRefresh({metroModes:["android-development","ios-development"]}),s=refresh.analyze(root,true).snapshot;
      for(const v of s.analysis.variants.filter(v=>v.profileId.includes("fs-07/1"))){
        const actions=s.analysis.bindings.filter(b=>b.variantId===v.id&&b.kind==="navigation");assert.equal(actions.length,1,JSON.stringify({registrations:s.analysis.registrations,gaps:s.analysis.gaps}));
        const target=s.analysis.registrations.find(r=>r.id===actions[0].targetId)!;assert.equal(target.rawPattern,"Detail");
        assert(actions[0].witnesses.some(w=>w.role!=="framework-rule"&&w.site.file==="App.tsx"&&source.slice(w.site.start,w.site.end).includes("Nested:Child")));
        for(const w of actions[0].witnesses)assert(["current","rule"].includes(readWitnessEvidence(s,w).state));
      }
      assert.deepEqual(refresh.analyze(root,false).snapshot,s);assert.deepEqual(deserializeSnapshot(serializeSnapshot(s)),s);
      writeFileSync(path.join(root,"App.tsx"),source.replace("screens:{Detail}","screens:{Detail:{screen:Detail,if:useSignedIn}}"));
      const conditional=refresh.analyze(root,false).snapshot;assert(!conditional.analysis.bindings.some(b=>b.kind==="navigation"));assert(conditional.analysis.gaps.some(g=>g.reason==="dynamic-expression"));
      assert.deepEqual(conditional,createTypescriptRefresh({metroModes:["android-development","ios-development"]}).analyze(root,true).snapshot);
    }finally{assert(path.basename(root).startsWith("cartograph FS07 "));rmSync(root,{recursive:true,force:true});}
  }
});
test("Expo static app configuration: literal scheme/root metadata and unknown plugin boundaries",()=>{
  const manifest=JSON.parse(readFileSync("docs/fs-00/support-manifest.json","utf8")) as {tuples:{id:string;versions:Record<string,string>}[]};
  for(const tuple of manifest.tuples.filter(t=>["expo55","expo56"].includes(t.id))){
    const root=mkdtempSync(path.join(tmpdir(),"cartograph FS07 "));
    try{
      writeFileSync(path.join(root,"package.json"),JSON.stringify({dependencies:tuple.versions}));mkdirSync(path.join(root,"routes"));mkdirSync(path.join(root,"app"));
      writeFileSync(path.join(root,"routes/index.tsx"),"export default function Home(){return null;}\n");writeFileSync(path.join(root,"app/index.tsx"),"export default function WrongRoot(){return null;}\n");
      const config={expo:{scheme:"controlled",ios:{scheme:"ios-controlled"},extra:{router:{root:"ignored"}},plugins:[["expo-router",{root:"./routes"}]]}};
      writeFileSync(path.join(root,"app.json"),JSON.stringify(config));
      const refresh=createTypescriptRefresh({metroModes:["android-development","ios-development"]}),s=refresh.analyze(root,true).snapshot;
      assert.equal(s.analysis.registrations.length,2);for(const r of s.analysis.registrations){assert.equal(r.occurrence.file,"routes/index.tsx");const v=s.analysis.variants.find(v=>v.id===r.variantId)!;assert(r.conditions.includes("linking-prefix:"+(v.platform==="ios"?"ios-controlled":"controlled")+"://"));assert(r.witnesses.some(w=>w.role!=="framework-rule"&&w.site.file==="app.json"));}
      config.expo.plugins.push(["unknown-plugin",{root:"routes"}]);writeFileSync(path.join(root,"app.json"),JSON.stringify(config));
      const unknown=refresh.analyze(root,false).snapshot;assert.equal(unknown.analysis.registrations.length,0);assert(unknown.analysis.gaps.some(g=>g.reason==="dynamic-expression"));
    }finally{assert(path.basename(root).startsWith("cartograph FS07 "));rmSync(root,{recursive:true,force:true});}
  }
});
test("Flow scope negatives: destructuring, nested var/eval and named expressions cannot leak guessed targets",()=>{
  for(const source of [
    "function helper(){}function outer({helper}:unknown){helper();}",
    "function helper(){}function outer(){const {helper}=source;helper();}",
    "function helper(){}function outer(){if(flag){var helper=other;}helper();}",
    "function helper(){}function outer(){if(flag){eval('helper=other');}helper();}",
    "consume(function hidden(){});hidden();",
    "function helper(){}function outer(){({helper}=source);helper();}",
    "function helper(){}function outer(helper:number=helper()){helper();}",
    "function helper(){}function outer(){try{throw 1;}catch(helper){helper();}}",
    "const module=import(runtime);const constructed=new Unknown();unknown?.();",
  ]){const syntax=extractFlow(hermes,"scope.js",Buffer.from("// @flow\n"+source));assert.equal(syntax.behavior.relations.filter(r=>r.relation==="calls").length,0,source);assert(syntax.behavior.gaps.length);}
  const known=extractFlow(hermes,"scope.js",Buffer.from("// @flow\nfunction helper(){}function outer(x:number=helper()){for(let helper of list){helper();}helper();}const f=function recurse(){recurse();};\n"));
  assert.equal(known.behavior.relations.filter(r=>r.relation==="calls").length,3);
});
test("Flow imports: stable source-backed exports resolve only when all selected platform targets agree",async()=>{
  const root=mkdtempSync(path.join(tmpdir(),"cartograph FS07 "));
  try{
    writeFileSync(path.join(root,"package.json"),JSON.stringify({dependencies:{"react-native":"0.83.10",react:"19.2.0",metro:"0.83.8","@react-navigation/native":"7.5.0","@react-navigation/native-stack":"7.20.0"}}));
    writeFileSync(path.join(root,"Target.js"),"// @flow\nfunction helper(x:number){return x;}export {helper as selected,helper as alias};\n");
    writeFileSync(path.join(root,"Caller.js"),"// @flow\nimport {selected} from './Target';import './Extra';export function caller(){selected(1);}\n");
    writeFileSync(path.join(root,"Extra.ts"),"export const extra=1;\n");
    writeFileSync(path.join(root,"legacy.ts"),"import './Extra';const extra=require('./Extra');\n");
    writeFileSync(path.join(root,"ordinary.ts"),"import {selected} from './Target';export function lexical(){selected(1);}\n");
    const options={host:path.resolve("src-tauri/target/debug/parser-host.exe"),metroModes:["android-development","ios-development"] as const},refresh=createComposedRefresh(options),s=(await refresh.analyze(root,true)).snapshot;
    const lexical=createTypescriptRefresh({metroModes:options.metroModes}).analyze(root,true).snapshot;
    assert.equal(s.behavior.relations.filter(r=>r.relation==="calls"&&r.site.file==="Caller.js").length,1,JSON.stringify({diagnostics:s.diagnostics,files:s.files.map(f=>[f.path,f.exports]),gaps:s.behavior.gaps}));
    assert.equal(s.analysis.bindings.filter(b=>b.kind==="module-export"&&b.occurrence.file==="Target.js").length,4);
    assert(s.relationships.some(r=>r.source==="Caller.js"&&r.target==="Target.js"&&r.syntax==="flow-import"));assert(s.relationships.some(r=>r.source==="Caller.js"&&r.target==="Extra.ts"));assert.equal(s.files.find(f=>f.path==="Caller.js")!.fanOut,2);assert.equal(s.files.find(f=>f.path==="Target.js")!.fanIn,1);
    assert.equal(s.files.find(f=>f.path==="legacy.ts")!.fanOut,lexical.files.find(f=>f.path==="legacy.ts")!.fanOut);assert.equal(s.files.find(f=>f.path==="Extra.ts")!.fanIn,lexical.files.find(f=>f.path==="Extra.ts")!.fanIn+1);
    const query={goal:"find helper",start:"Caller.js",budget:20,depth:4,timeoutMs:100},baseline=await rankInvestigation(s,query),fallback=await rankInvestigation(s,query,async()=>{throw Error("inference_failure");});
    assert.deepEqual(fallback.steps.map(step=>step.id),baseline.steps.map(step=>step.id));assert(fallback.decisions.some(d=>d.fallback==="inference_failure"));assert.equal(digest(readFileSync("lib/laya/laya-nav-1.json")),"aa499934b8197fb12c36eec2b367c523d5a6da77b439ab58dc4b30bb46ea3513");
    assert(s.analysis.bindings.some(b=>b.kind==="module-dependency"&&b.occurrence.file==="ordinary.ts"&&b.targetId==="Target.js"));
    assert.deepEqual((await refresh.analyze(root,false)).snapshot,s);
    writeFileSync(path.join(root,"Target.ios.js"),"// @flow\nexport function selected(x:number){return x;}\n");
    const variants=(await refresh.analyze(root,false)).snapshot;assert(!variants.behavior.relations.some(r=>r.relation==="calls"&&r.site.file==="Caller.js"));assert(!variants.relationships.some(r=>r.source==="Caller.js"&&r.target.startsWith("Target")));assert(variants.relationships.some(r=>r.source==="Caller.js"&&r.target==="Extra.ts"));assert(variants.behavior.gaps.some(g=>g.reason==="flow-imported-call-unqualified"));
    assert.deepEqual(variants,(await createComposedRefresh(options).analyze(root,true)).snapshot);
  }finally{assert(path.basename(root).startsWith("cartograph FS07 "));rmSync(root,{recursive:true,force:true});}
});
test("Metro advanced exports/imports/redirects: independently pinned fallback and array semantics",()=>{
  const bytes=readFileSync("tests/fixtures/framework-support/F07-rn/metro-advanced.json"),fixture=JSON.parse(bytes.toString()) as {files:string[];packages:MetroPackage[];links:Record<string,string>;sourceExts:string[];cases:{id:string;specifier:string;expectedWarning?:boolean}[]};
  for(const tuple of ["rn83-bare","rn85-bare","expo55","expo56"])for(const platform of ["android","ios"] as const)for(const context of ["controlled","defaults"]){
    const oracle=JSON.parse(readFileSync(`docs/fs-07/evidence/${tuple}-${platform}-metro-advanced${context==="defaults"?"-defaults-oracle":""}.json`,"utf8")) as {fixtureHash:string;outputHash:string;outputs:{id:string;type:string;targets:string[]}[];warnings:string[]};
    const defaults=JSON.parse(readFileSync(`docs/fs-07/evidence/${tuple}-metro-defaults.json`,"utf8")) as {output:{sourceExts:string[];assetExts:string[];resolverMainFields:string[];unstable_conditionNames:string[];unstable_conditionsByPlatform:Record<string,string[]>;unstable_enablePackageExports:boolean}};
    assert.equal(oracle.fixtureHash,digest(bytes));assert.equal(oracle.outputHash,digest(JSON.stringify(oracle.outputs)));assert.equal(oracle.warnings.length,fixture.cases.filter(c=>c.expectedWarning).length);
    const settings=context==="controlled"?{sourceExts:fixture.sourceExts,assetExts:new Set(["png"]),mainFields:["react-native","browser","main"],conditions:["react-native"],exportsEnabled:true}:{sourceExts:defaults.output.sourceExts,assetExts:new Set(defaults.output.assetExts),mainFields:defaults.output.resolverMainFields,conditions:[...defaults.output.unstable_conditionNames,...defaults.output.unstable_conditionsByPlatform[platform]??[]],exportsEnabled:defaults.output.unstable_enablePackageExports};
    const resolver=createMetroResolver({files:new Set(fixture.files),packages:fixture.packages,packageLinks:new Map(Object.entries(fixture.links))},{...settings,platform,preferNativePlatform:true,customResolver:false});
    for(const c of fixture.cases){const actual=resolver.resolve("index.js",c.specifier),expected=oracle.outputs.find(o=>o.id===c.id)!;assert.equal(actual.state,expected.type==="empty"?"empty":"resolved",tuple+"/"+platform+"/"+c.id);if(actual.state==="resolved")assert.deepEqual(actual.targets,expected.targets,c.id);}
  }
});
test("Metro config composition: pinned helpers are interpreted as data; mutation/executable helpers stay boundaries",()=>{
  for(const tuple of ["rn83-bare","expo55"]){
    const root=mkdtempSync(path.join(tmpdir(),"cartograph FS07 "));
    try{
      const manifest=JSON.parse(readFileSync("docs/fs-00/support-manifest.json","utf8")) as {tuples:{id:string;versions:Record<string,string>}[]};
      writeFileSync(path.join(root,"package.json"),JSON.stringify({dependencies:manifest.tuples.find(t=>t.id===tuple)!.versions}));
      writeFileSync(path.join(root,"index.ts"),"import {chosen} from './Choice';\n");writeFileSync(path.join(root,"Choice.cjs"),"exports.chosen=1;\n");
      const helper=tuple==="rn83-bare"?"@react-native/metro-config":"expo/metro-config";
      const config=`const {getDefaultConfig,mergeConfig}=require('${helper}');const defaults=getDefaultConfig(__dirname);const config={resolver:{sourceExts:[...defaults.resolver.sourceExts,'cjs']}};module.exports=mergeConfig(defaults,config);\n`;
      // Expo does not expose mergeConfig from its config facade; the recognized
      // pure object-spread form retains equivalent resolver declarations.
      const pure=tuple==="rn83-bare"?config:`const {getDefaultConfig}=require('${helper}');const defaults=getDefaultConfig(__dirname);module.exports={...defaults,resolver:{...defaults.resolver,sourceExts:['cjs','ts']}};\n`;
      writeFileSync(path.join(root,"metro.config.js"),pure);
      const valid=createTypescriptRefresh().analyze(root,true).snapshot;assert(valid.analysis.bindings.some(b=>b.kind==="module-dependency"&&b.targetId==="Choice.cjs"));
      for(const unsafe of [pure.replace("module.exports=","config.resolver.sourceExts.push('evil');module.exports="),`const {getDefaultConfig}=require('./untrusted');module.exports=getDefaultConfig(__dirname);`,`module.exports={resolver:{resolveRequest(){throw Error('MUST NEVER EXECUTE');}}};`]){
        writeFileSync(path.join(root,"metro.config.js"),unsafe);const s=createTypescriptRefresh().analyze(root,true).snapshot;assert(!s.analysis.bindings.some(b=>b.kind==="module-dependency"&&b.targetId==="Choice.cjs"));assert(s.analysis.gaps.some(g=>g.reason==="custom-resolver"));
      }
    }finally{assert(path.basename(root).startsWith("cartograph FS07 "));rmSync(root,{recursive:true,force:true});}
  }
});
test("Expo55/56 file routes: independent platform oracles, layout evidence and conservative destinations",()=>{
  const fixtureBytes=readFileSync("tests/fixtures/framework-support/F07-rn/expo-routes.json"),fixture=JSON.parse(fixtureBytes.toString()) as {keys:string[]};
  const manifest=JSON.parse(readFileSync("docs/fs-00/support-manifest.json","utf8")) as {tuples:{id:string;versions:Record<string,string>}[]};
  for(const tuple of manifest.tuples.filter(t=>["expo55","expo56"].includes(t.id))){
    const root=mkdtempSync(path.join(tmpdir(),"cartograph FS07 "));
    try{
      writeFileSync(path.join(root,"package.json"),JSON.stringify({main:"expo-router/entry",dependencies:tuple.versions}));
      writeFileSync(path.join(root,"app.json"),JSON.stringify({expo:{name:"Controlled",scheme:"controlled"}}));
      for(const key of fixture.keys){const file=path.join(root,"app",key.slice(2));mkdirSync(path.dirname(file),{recursive:true});writeFileSync(file,"export default function Route(){return null;}\n");}
      writeFileSync(path.join(root,"index.tsx"),"import {Link,router} from 'expo-router';export function Caller(){return <Link href='/users/42'/>;}router.push('/settings');router.push('/(one)/shared/42');router.push('/shared/42');router.push(destination);\n");
      const refresh=createTypescriptRefresh({metroModes:["android-development","ios-development"]}),s=refresh.analyze(root,true).snapshot;
      for(const platform of ["android","ios"]){
        const oracle=JSON.parse(readFileSync(`docs/fs-07/evidence/${tuple.id}-${platform}-expo-routes.json`,"utf8")) as {fixtureHash:string;outputs:{route:string;contextKey:string;dynamic:{name:string;deep:boolean}[]|null;layouts:string[]}[]};
        assert.equal(oracle.fixtureHash,digest(fixtureBytes));
        const variant=s.analysis.variants.find(v=>v.platform===platform&&v.profileId.includes("fs-07/1"))!,registrations=s.analysis.registrations.filter(r=>r.variantId===variant.id);
        assert.equal(registrations.length,oracle.outputs.length);
        for(const expected of oracle.outputs){const actual=registrations.find(r=>r.occurrence.file==="app/"+expected.contextKey.slice(2))!;assert(actual);assert(actual.handlerId);
          for(const layout of expected.layouts)assert(actual.witnesses.some(w=>w.role!=="framework-rule"&&w.site.file==="app/"+layout.slice(2)));
          if(expected.dynamic)assert(actual.matcher.state==="supported"&&expected.dynamic.every(d=>actual.matcher.state==="supported"&&actual.matcher.segments.some(s=>s.kind!=="literal"&&s.name===d.name&&(s.kind==="catchAll")===d.deep)));
          for(const witness of actual.witnesses)assert(["current","rule"].includes(readWitnessEvidence(s,witness).state));
        }
        assert.equal(s.analysis.bindings.filter(b=>b.variantId===variant.id&&b.kind==="navigation").length,3);
        const alternatives=registrations.filter(r=>r.occurrence.file==="app/(one,two)/shared/[id].tsx");assert.equal(alternatives.length,2);assert.equal(new Set(alternatives.map(r=>r.id)).size,2);assert.deepEqual(alternatives.map(r=>r.rawPattern).sort(),["/(one)/shared/:id","/(two)/shared/:id"]);
        const groupNavigation=s.analysis.bindings.find(b=>b.variantId===variant.id&&b.kind==="navigation"&&registrations.find(r=>r.id===b.targetId)?.rawPattern==="/(one)/shared/:id");assert(groupNavigation);
        const caller=readFileSync(path.join(root,"index.tsx"),"utf8");assert(s.analysis.gaps.some(g=>g.variantId===variant.id&&g.reason==="ambiguous-target"&&g.occurrence.start===caller.indexOf("router.push('/shared")));
        assert.equal(s.analysis.bindings.filter(b=>b.variantId===variant.id&&b.kind==="entry-point"&&b.occurrence.file==="app/_layout.tsx").length,1);
        assert(!registrations.some(r=>r.occurrence.file.includes(platform==="android"?".ios.":".android.")));
      }
      assert.deepEqual(refresh.analyze(root,false).snapshot,s);assert.deepEqual(deserializeSnapshot(serializeSnapshot(s)),s);
      writeFileSync(path.join(root,"app.config.js"),"throw Error('MUST NEVER EXECUTE');module.exports=()=>({expo:{name:'dynamic'}});\n");
      const dynamic=refresh.analyze(root,false).snapshot;assert.equal(dynamic.analysis.registrations.length,0);assert(dynamic.analysis.gaps.some(g=>g.reason==="dynamic-expression"));
    }finally{assert(path.basename(root).startsWith("cartograph FS07 "));rmSync(root,{recursive:true,force:true});}
  }
});
test("RN native inventory: source declarations stop at explicit native/generated boundaries on every tuple",()=>{
  const manifest=JSON.parse(readFileSync("docs/fs-00/support-manifest.json","utf8")) as {tuples:{id:string;versions:Record<string,string>}[]};
  for(const tuple of manifest.tuples.filter(t=>["rn83-bare","rn85-bare","expo55","expo56"].includes(t.id))){
    const root=mkdtempSync(path.join(tmpdir(),"cartograph FS07 "));
    try{
      writeFileSync(path.join(root,"package.json"),JSON.stringify({dependencies:tuple.versions,codegenConfig:{name:"Controlled",type:"all",jsSrcsDir:"specs"}}));mkdirSync(path.join(root,"specs"));
      writeFileSync(path.join(root,"specs/NativeCamera.ts"),"import {TurboModuleRegistry,NativeModules,requireNativeComponent,UIManager} from 'react-native';import codegenNativeComponent from 'react-native/Libraries/Utilities/codegenNativeComponent';export const camera=TurboModuleRegistry.getEnforcing<Spec>('Camera');const legacy=NativeModules.Camera;const dynamic=NativeModules[key];export const View=codegenNativeComponent<Props>('CameraView');const LegacyView=requireNativeComponent('LegacyView');UIManager.getViewManagerConfig('LegacyView');\n");
      writeFileSync(path.join(root,"specs/NativeCamera.ts"),readFileSync(path.join(root,"specs/NativeCamera.ts"),"utf8")+"import * as RN from 'react-native';import type {TurboModule as NativeBase} from 'react-native';export interface Spec extends NativeBase{read():string;}const namespaced=RN.TurboModuleRegistry.get<Spec>('Other');const third=RN.NativeModules.Camera;import codegenNativeCommands from 'react-native/Libraries/Utilities/codegenNativeCommands';const Commands=codegenNativeCommands({supportedCommands:['focus','blur']});\n");
      writeFileSync(path.join(root,"specs/NativeCamera.ts"),readFileSync(path.join(root,"specs/NativeCamera.ts"),"utf8")+"const emitter=new RN.NativeEventEmitter(camera);global.__turboModuleProxy('Camera');\n");
      mkdirSync(path.join(root,"android"));writeFileSync(path.join(root,"android/Camera.java"),"THIS FILE MUST NOT BE PARSED AS A NATIVE IMPLEMENTATION\n");
      const s=createTypescriptRefresh({metroModes:["android-development","ios-development"]}).analyze(root,true).snapshot;
      for(const v of s.analysis.variants.filter(v=>v.profileId.includes("fs-07/1"))){const bindings=s.analysis.bindings.filter(b=>b.variantId===v.id);assert(bindings.some(b=>b.kind==="module-boundary"&&b.targetId==="specs/NativeCamera.ts"));assert.equal(bindings.filter(b=>b.kind==="operation").length,10);assert(!bindings.some(b=>b.kind==="native-bridge"));assert(s.analysis.gaps.some(g=>g.variantId===v.id&&g.reason==="generated-code-unavailable"));assert(s.analysis.gaps.some(g=>g.variantId===v.id&&g.reason==="dynamic-expression"));const text=readFileSync(path.join(root,"specs/NativeCamera.ts"),"utf8"),proxy=text.indexOf("global.__turboModuleProxy");assert(!bindings.some(b=>b.occurrence.start===proxy));assert(s.analysis.gaps.some(g=>g.variantId===v.id&&g.occurrence.start===proxy&&g.reason==="external-boundary"));for(const binding of bindings)for(const w of binding.witnesses)assert(["current","rule"].includes(readWitnessEvidence(s,w).state));}
      assert(!s.files.some(f=>f.path.endsWith(".java")));assert(!s.analysis.resources.some(r=>r.path.endsWith(".java")));assert.deepEqual(deserializeSnapshot(serializeSnapshot(s)),s);
    }finally{assert(path.basename(root).startsWith("cartograph FS07 "));rmSync(root,{recursive:true,force:true});}
  }
});
test("RN linking configuration: declared URL paths are separate from unresolved native URL receivers",()=>{
  const root=mkdtempSync(path.join(tmpdir(),"cartograph FS07 "));
  try{
    writeFileSync(path.join(root,"package.json"),JSON.stringify({dependencies:{"react-native":"0.83.10",react:"19.2.0",metro:"0.83.8","@react-navigation/native":"7.5.0","@react-navigation/native-stack":"7.20.0"}}));
    writeFileSync(path.join(root,"App.tsx"),"import {Linking} from 'react-native';import {NavigationContainer} from '@react-navigation/native';import {createNativeStackNavigator} from '@react-navigation/native-stack';const Stack=createNativeStackNavigator();export function Home(){return null;}export function Detail(){return null;}export function App(){return <NavigationContainer linking={{prefixes:['controlled://'],config:{screens:{Home:'',Detail:'detail/:id'}}}}><Stack.Navigator><Stack.Screen name='Home' component={Home}/><Stack.Screen name='Detail' component={Detail}/></Stack.Navigator></NavigationContainer>;}Linking.openURL('controlled://detail/42');\n");
    const s=createTypescriptRefresh({metroModes:["android-development","ios-development"]}).analyze(root,true).snapshot;
    for(const v of s.analysis.variants.filter(v=>v.profileId.includes("fs-07/1"))){assert.equal(s.analysis.registrations.filter(r=>r.variantId===v.id&&r.conditions.includes("linking-prefix:controlled://")).length,2);assert.equal(s.analysis.candidates.filter(c=>c.variantId===v.id&&c.relationKind==="navigation"&&c.reasons.includes("unknown-origin")).length,1);assert(!s.analysis.bindings.some(b=>b.variantId===v.id&&b.kind==="navigation"));assert(s.analysis.gaps.some(g=>g.variantId===v.id&&g.reason==="unknown-origin"));}
    assert.deepEqual(deserializeSnapshot(serializeSnapshot(s)),s);
    const original=readFileSync(path.join(root,"App.tsx"),"utf8");
    for(const source of [original.replace("<Stack.Screen name='Detail' component={Detail}/>","{unknown&&<Stack.Screen name='Detail' component={Detail}/>}"),original.replace("prefixes:['controlled://']","enabled:false,prefixes:['controlled://']"),original.replace("<Stack.Navigator>","<><Stack.Navigator>").replace("</Stack.Navigator>","</Stack.Navigator><Stack.Navigator><Stack.Screen name='Other' component={Detail}/></Stack.Navigator></>")]){
      writeFileSync(path.join(root,"App.tsx"),source);const negative=createTypescriptRefresh({metroModes:["android-development","ios-development"]}).analyze(root,true).snapshot;
      assert(!negative.analysis.registrations.some(r=>r.rawPattern==="/detail/:id"&&r.handlerId));
      assert.deepEqual(deserializeSnapshot(serializeSnapshot(negative)),negative);
    }
  }finally{assert(path.basename(root).startsWith("cartograph FS07 "));rmSync(root,{recursive:true,force:true});}
});
test("RN platform projection: pinned selection, branch dependencies and framework roots remain variant-isolated", () => {
  const fixtureBytes=readFileSync("tests/fixtures/framework-support/F07-rn/platform.json"),fixture=JSON.parse(fixtureBytes.toString()) as {cases:{id:string;spec:Record<string,string>}[]};
  const manifest=JSON.parse(readFileSync("docs/fs-00/support-manifest.json","utf8")) as {tuples:{id:string;versions:Record<string,string>}[]};
  for(const tuple of manifest.tuples.filter(t=>["rn83-bare","rn85-bare","expo55","expo56"].includes(t.id))) {
    const root=mkdtempSync(path.join(tmpdir(),"cartograph FS07 "));
    try {
      writeFileSync(path.join(root,"package.json"),JSON.stringify({dependencies:tuple.versions}));
      for(const name of ["AndroidScreen","IosScreen","NativeScreen","DefaultScreen"])writeFileSync(path.join(root,name+".tsx"),`export function ${name}(){return <Text/>;}\n`);
      for(const entry of fixture.cases) {
        const imports=Object.values(entry.spec).map(name=>`import {${name}} from './${name}';`).join("\n");
        writeFileSync(path.join(root,"index.ts"),`import {Platform,AppRegistry} from 'react-native';${imports}\nconst Screen=Platform.select({${Object.entries(entry.spec).map(([k,v])=>k+":"+v).join(",")}});AppRegistry.registerComponent('Controlled',()=>Screen);\nif(Platform.OS==='android'){require('./AndroidScreen');}else{require('./IosScreen');}\n`);
        const s=createTypescriptRefresh({metroModes:["android-development","ios-development"]}).analyze(root,true).snapshot;
        for(const platform of ["android","ios"]) {
          const oracle=JSON.parse(readFileSync(`docs/fs-07/evidence/${tuple.id}-${platform}-platform.json`,"utf8")) as {fixtureHash:string;outputs:{id:string;selected:string|null}[]};
          assert.equal(oracle.fixtureHash,digest(fixtureBytes));const expected=oracle.outputs.find(c=>c.id===entry.id)!.selected;
          const variant=s.analysis.variants.find(v=>v.platform===platform&&v.profileId.includes("fs-07/1"))!;
          const bindings=s.analysis.bindings.filter(b=>b.variantId===variant.id),roots=bindings.filter(b=>b.kind==="entry-point");
          assert.equal(roots.length,expected?1:0,tuple.id+"/"+platform+"/"+entry.id);
          if(expected)assert.equal(s.behavior.declarations.find(d=>d.id===roots[0].targetId)!.name,expected);
          const guarded=bindings.filter(b=>b.kind==="module-dependency"&&b.occurrence.file==="index.ts"&&b.occurrence.start>readFileSync(path.join(root,"index.ts"),"utf8").indexOf("if(Platform"));
          assert.equal(guarded.length,1);assert.equal(guarded[0].targetId,platform==="android"?"AndroidScreen.tsx":"IosScreen.tsx");
        }
      }
      writeFileSync(path.join(root,"index.ts"),"import {Platform,AppRegistry} from 'react-native';import {AndroidScreen} from './AndroidScreen';const Screen=Platform.select({...dynamic,android:AndroidScreen});if(Platform.OS===runtime){AppRegistry.registerComponent('Unknown',()=>AndroidScreen);}AppRegistry.registerComponent('Unknown',()=>Screen);\n");
      const unknown=createTypescriptRefresh().analyze(root,true).snapshot;
      assert(!unknown.analysis.bindings.some(b=>b.kind==="entry-point"));assert(unknown.analysis.gaps.some(g=>g.reason==="dynamic-expression"));
      writeFileSync(path.join(root,"patch.ts"),"import {Platform as P} from 'react-native';const alias=P;alias.OS='ios';\n");
      writeFileSync(path.join(root,"index.ts"),"import * as RN from 'react-native';import {Platform,AppRegistry} from 'react-native';import {AndroidScreen} from './AndroidScreen';const Screen=Platform.select({android:AndroidScreen,ios:AndroidScreen});AppRegistry.registerComponent('Patched',()=>Screen);\n");
      const patched=createTypescriptRefresh().analyze(root,true).snapshot;assert(!patched.analysis.bindings.some(b=>b.kind==="entry-point"));assert(patched.analysis.gaps.some(g=>g.reason==="dynamic-expression"&&g.occurrence.file==="patch.ts"));
      writeFileSync(path.join(root,"index.ts"),readFileSync(path.join(root,"index.ts"),"utf8").replace("const Screen=Platform.select","const Screen=RN.Platform.select"));
      const namespacePatched=createTypescriptRefresh().analyze(root,true).snapshot;assert(!namespacePatched.analysis.bindings.some(b=>b.kind==="entry-point"));
      for(const mutation of ["Object.assign(alias,{OS:'ios'});","Reflect.set(alias,'OS','ios');"]){
        writeFileSync(path.join(root,"patch.ts"),"import {Platform as P} from 'react-native';const alias=P;"+mutation+"\n");
        const reflected=createTypescriptRefresh().analyze(root,true).snapshot;assert(!reflected.analysis.bindings.some(b=>b.kind==="entry-point"));assert(reflected.analysis.gaps.some(g=>g.reason==="dynamic-expression"&&g.occurrence.file==="patch.ts"));
      }
    }finally{assert(path.basename(root).startsWith("cartograph FS07 "));rmSync(root,{recursive:true,force:true});}
  }
});
test("React Navigation declarations: static groups, JSX screens and context-scoped literal targets",()=>{
  const root=mkdtempSync(path.join(tmpdir(),"cartograph FS07 "));
  try {
    writeFileSync(path.join(root,"package.json"),JSON.stringify({dependencies:{"react-native":"0.83.10",react:"19.2.0",metro:"0.83.8","@react-navigation/native":"7.5.0","@react-navigation/native-stack":"7.20.0"}}));
    writeFileSync(path.join(root,"App.tsx"),"import {createNativeStackNavigator} from '@react-navigation/native-stack';import {useNavigation} from '@react-navigation/native';export function Home(){const nav=useNavigation();return <Button onPress={()=>nav.navigate('Detail')}/>;}export function Detail(){return null;}const Dynamic=createNativeStackNavigator();const Static=createNativeStackNavigator({screens:{Start:Home},groups:{Private:{if:useSignedIn,screens:{Hidden:{screen:Detail}}}}});export function App(){return <Dynamic.Navigator><Dynamic.Screen name='Home' component={Home}/><Dynamic.Screen name='Detail' component={Detail}/></Dynamic.Navigator>;}\n");
    const ambiguous=createTypescriptRefresh({metroModes:["android-development","ios-development"]}).analyze(root,true).snapshot;
    for(const v of ambiguous.analysis.variants.filter(v=>v.profileId.includes("fs-07/1"))) {
      const registrations=ambiguous.analysis.registrations.filter(r=>r.variantId===v.id);
      assert.deepEqual(registrations.map(r=>r.rawPattern).sort(),["Detail","Hidden","Home","Start"]);
      assert(registrations.find(r=>r.rawPattern==="Hidden")!.conditions.some(c=>c.startsWith("callback:")));
      assert(!ambiguous.analysis.bindings.some(b=>b.variantId===v.id&&b.kind==="navigation")); // Home belongs to two independent navigators.
      for(const r of registrations)for(const w of r.witnesses)assert(["current","rule"].includes(readWitnessEvidence(ambiguous,w).state));
    }
    const text=readFileSync(path.join(root,"App.tsx"),"utf8").replace("screens:{Start:Home}","screens:{Start:Detail}");writeFileSync(path.join(root,"App.tsx"),text);
    const unique=createTypescriptRefresh().analyze(root,true).snapshot;
    assert.equal(unique.analysis.bindings.filter(b=>b.kind==="navigation").length,1);
    const navigation=unique.analysis.bindings.find(b=>b.kind==="navigation")!;assert.equal(unique.analysis.registrations.find(r=>r.id===navigation.targetId)!.rawPattern,"Detail");
    assert(!unique.behavior.relations.some(r=>r.relation==="calls"&&r.site.start===navigation.occurrence.start));
    assert.deepEqual(deserializeSnapshot(serializeSnapshot(unique)),unique);
  }finally{assert(path.basename(root).startsWith("cartograph FS07 "));rmSync(root,{recursive:true,force:true});}
});

const bytes = readFileSync(new URL("../fixtures/framework-support/F07-rn/metro.json", import.meta.url));
const fixture = JSON.parse(bytes.toString()) as {files: string[]; packages: MetroPackage[]; links: Record<string, string>; sourceExts: string[]; cases: {id: string; specifier: string; isImport?: boolean}[]};
const digest = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");
test("Flow dialect selection accepts leading pragmas only", () => {
  for (const text of ["// @flow\nfunction f(){}", "\uFEFF#!/usr/bin/env node\n/* @flow strict */\nfunction f(){}", "/* first */\n// @flow\n"]) assert(flowPragma(text));
  for (const text of ["const text='@flow';", "function f(){} // @flow", "// @noflow\n// @flow", "/* unterminated @flow"]) assert(!flowPragma(text));
});
test("Flow shared pipeline: neutral facts, safe unresolved imports, cache and full equivalence", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "cartograph FS07 "));
  try {
    writeFileSync(path.join(root, "package.json"), JSON.stringify({dependencies: {"react-native": "0.83.10", react: "19.2.0", metro: "0.83.8", "@react-navigation/native": "7.5.0", "@react-navigation/native-stack": "7.20.0"}}));
    const text = "\uFEFF// @flow\r\nimport {foreign} from './missing';\r\nexport function local(x:number){return x;}\r\nexport function caller(){local(1);foreign();}\r\n";
    writeFileSync(path.join(root, "Flow.js"), text);
    writeFileSync(path.join(root, "ordinary.ts"), "export function ordinary(){}\n");
    const options = {host: path.resolve("src-tauri/target/debug/parser-host.exe")};
    const refresh = createComposedRefresh(options), first = await refresh.analyze(root, true);
    const s = first.snapshot;
    assert(s.files.some(f => f.path === "Flow.js")); assert(s.files.some(f => f.path === "ordinary.ts"));
    assert.equal(s.coverage.files.parsed, 2); assert.equal(s.coverage.files.skipped, 0);
    assert(!s.diagnostics.some(d => d.reason === "flow-session-required"));
    assert(s.analysis.projects.some(p => p.languages.includes("flow") && p.extractors.includes("flow/fs-07/1")));
    const calls = s.behavior.relations.filter(r => r.relation === "calls" && r.site.file === "Flow.js");
    assert.equal(calls.length, 1); assert.equal(s.behavior.declarations.find(d => d.id === calls[0].target)?.name, "local");
    assert(s.behavior.gaps.some(g => g.reason === "flow-imported-call-unqualified"));
    assert.equal(s.files.find(f => f.path === "Flow.js")!.hash, digest(Buffer.from(text)));
    assert.deepEqual(deserializeSnapshot(serializeSnapshot(s)), s);
    const cached = await refresh.analyze(root, false); assert(cached.reused >= 1); assert.deepEqual(cached.snapshot, s);
    writeFileSync(path.join(root, "Flow.js"), text.replace("local(1)", "local(2)"));
    assert.deepEqual((await refresh.analyze(root, false)).snapshot, (await createComposedRefresh(options).analyze(root, true)).snapshot);
  } finally { assert(path.basename(root).startsWith("cartograph FS07 ")); rmSync(root, {recursive: true, force: true}); }
});
function resolver(platform: "android" | "ios", customResolver = false, budget?: GenerationBoundary) {
  return createMetroResolver({files: new Set(fixture.files), packages: fixture.packages, packageLinks: new Map(Object.entries(fixture.links))}, {platform, sourceExts: fixture.sourceExts, assetExts: new Set(["png"]), mainFields: ["react-native", "browser", "main"], conditions: ["react-native"], exportsEnabled: true, preferNativePlatform: true, customResolver}, budget);
}
for (const tuple of ["rn83-bare", "rn85-bare", "expo55", "expo56"]) for (const platform of ["android", "ios"] as const) test(`Metro static kernel ${tuple}/${platform}: pinned synthetic oracle parity`, () => {
  const oracle = JSON.parse(readFileSync(new URL(`../../docs/fs-07/evidence/${tuple}-${platform}-metro.json`, import.meta.url), "utf8")) as {tuple: string; versions: Record<string, string>; resolverVersion: string; resolverEntryHash: string; platform: string; fixtureHash: string; outputHash: string; outputs: {id: string; type: string; targets: string[]}[]; warnings: string[]; configExecution: boolean; applicationExecution: boolean};
  assert.equal(oracle.tuple, tuple); assert.equal(oracle.platform, platform);
  const manifest = JSON.parse(readFileSync(new URL("../../docs/fs-00/support-manifest.json", import.meta.url), "utf8")) as {tuples: {id: string; versions: Record<string, string>}[]};
  assert.deepEqual(oracle.versions, manifest.tuples.find(t => t.id === tuple)!.versions);
  assert.equal(oracle.resolverVersion, tuple === "rn85-bare" ? "0.84.6" : tuple === "expo56" ? "0.84.5" : "0.83.8");
  assert.match(oracle.resolverEntryHash, /^[a-f0-9]{64}$/);
  assert.equal(oracle.fixtureHash, digest(bytes)); assert.equal(oracle.outputHash, digest(JSON.stringify(oracle.outputs)));
  assert.deepEqual(oracle.warnings, []); assert.equal(oracle.configExecution, false); assert.equal(oracle.applicationExecution, false);
  const profile = resolver(platform);
  for (const c of fixture.cases) {
    const actual = profile.resolve("index.js", c.specifier, c.isImport !== false);
    const expected = oracle.outputs.find(o => o.id === c.id)!;
    assert(expected, c.id);
    assert.equal(actual.state, expected.type === "empty" ? "empty" : "resolved", c.id);
    if (actual.state === "resolved") { assert.deepEqual(actual.targets, expected.targets, c.id); assert.equal(actual.category, expected.type === "assetFiles" ? "asset" : "module", c.id); }
  }
  assert.deepEqual(profile.resolve("index.js", "./src/Choice"), {state: "resolved", targets: [`src/Choice.${platform}.js`], category: "module", rule: "metro/source-extension-platform"});
});
test("Metro static kernel: policy, custom resolver and missing exports targets stay explicit", () => {
  const normal = resolver("ios");
  for (const specifier of ["../../outside", "C:/outside", "/outside", "./src/../node_modules/secret", "./private\\file", "./bad\0file"]) assert.deepEqual(normal.resolve("index.js", specifier), {state: "boundary", reason: "policy-denied"});
  assert.deepEqual(normal.resolve("not-authorized.js", "./src/Choice"), {state: "boundary", reason: "policy-denied"});
  assert.deepEqual(normal.resolve("index.js", "external"), {state: "boundary", reason: "external-boundary"});
  // Pinned Metro falls back for an unexported path. This absent file remains
  // unresolved; the advanced oracle separately qualifies existing fallbacks.
  assert.deepEqual(normal.resolve("index.js", "dep/not-exported"), {state: "boundary", reason: "missing-metadata"});
  assert.deepEqual(normal.resolve("index.js", "#private"), {state: "boundary", reason: "unsupported-syntax"});
  assert.deepEqual(resolver("android", true).resolve("index.js", "./src/Choice"), {state: "boundary", reason: "custom-resolver"});
  const files = new Set(fixture.files.filter(f => f !== "packages/dep/import.js"));
  const profile = createMetroResolver({files, packages: fixture.packages, packageLinks: new Map(Object.entries(fixture.links))}, {platform: "android", sourceExts: fixture.sourceExts, assetExts: new Set(), mainFields: ["main"], conditions: ["react-native"], exportsEnabled: true, preferNativePlatform: true, customResolver: false});
  assert.deepEqual(profile.resolve("index.js", "dep"), {state: "boundary", reason: "missing-metadata"});
});
test("Metro static kernel: cooperative cancellation and deadline remain enforced", () => {
  const controller = new AbortController(); controller.abort();
  assert.throws(() => resolver("android", false, new GenerationBoundary(controller.signal)).resolve("index.js", "./src/Choice"), /cancelled/);
  assert.throws(() => resolver("ios", false, new GenerationBoundary(undefined, 0)).resolve("index.js", "./src/Choice"), /resource-limit/);
  assert.throws(() => createMetroResolver({files: new Set(Array.from({length: 20001}, (_, i) => `src/${i}.js`)), packages: [], packageLinks: new Map()}, {platform: "ios", sourceExts: ["js"], assetExts: new Set(), mainFields: ["main"], conditions: [], exportsEnabled: true, preferNativePlatform: true, customResolver: false}), /resource-limit/);
});
test("Flow syntax experiment: pinned grammar records preserve original BOM/CRLF/Unicode offsets", () => {
  const fixtureBytes = readFileSync(new URL("../fixtures/framework-support/F07-rn/flow.json", import.meta.url));
  const f = JSON.parse(fixtureBytes.toString()) as {cases: {id: string; source: string; requiredTypes?: string[]; error?: boolean}[]};
  const record = JSON.parse(readFileSync(new URL("../../docs/fs-07/evidence/hermes-syntax-experiment.json", import.meta.url), "utf8")) as {parser: string; fixtureHash: string; outputHash: string; outputs: {id: string; sourceHash: string; outcome: string; elapsedMs: number; nodes: {type: string; start: number; end: number; text: string; line: number}[]}[]; scopeQualification: boolean; productionSupervisionQualification: boolean};
  assert.equal(record.parser, "hermes-parser@0.25.1"); assert.equal(record.fixtureHash, digest(fixtureBytes));
  assert.equal(record.outputHash, digest(JSON.stringify(record.outputs.map(({elapsedMs, ...o}) => { void elapsedMs; return o; }))));
  assert.equal(record.scopeQualification, false); assert.equal(record.productionSupervisionQualification, false);
  for (const c of f.cases) {
    const output = record.outputs.find(o => o.id === c.id)!; assert(output); assert.equal(output.sourceHash, digest(c.source));
    assert.equal(output.outcome, c.error ? "parse-error" : "parsed");
    for (const type of c.requiredTypes ?? []) assert(output.nodes.some(n => n.type === type));
    for (const n of output.nodes) assert.equal(c.source.slice(n.start, n.end), n.text);
    if (c.id === "position") { const call = output.nodes.find(n => n.type === "CallExpression")!; assert.equal(call.start, c.source.indexOf("helper(1)")); assert.equal(call.line, 4); }
  }
});
const hermes = createRequire(import.meta.url)("hermes-parser") as FlowParser;
for (const tuple of ["rn83-bare", "rn85-bare", "expo55", "expo56"]) for (const platform of ["android", "ios"] as const) test(`Metro default-context kernel ${tuple}/${platform}: source-backed defaults oracle parity`, () => {
  const defaults = JSON.parse(readFileSync(new URL(`../../docs/fs-07/evidence/${tuple}-metro-defaults.json`, import.meta.url), "utf8")) as {outputHash: string; output: {sourceExts: string[]; assetExts: string[]; resolverMainFields: string[]; unstable_conditionNames: string[]; unstable_conditionsByPlatform: Record<string, string[]>; unstable_enablePackageExports: boolean}};
  const oracle = JSON.parse(readFileSync(new URL(`../../docs/fs-07/evidence/${tuple}-${platform}-metro-defaults-oracle.json`, import.meta.url), "utf8")) as {defaultsHash: string; fixtureHash: string; outputHash: string; outputs: {id: string; type: string; targets: string[]}[]; warnings: string[]};
  assert.equal(defaults.outputHash, digest(JSON.stringify(defaults.output))); assert.equal(oracle.defaultsHash, defaults.outputHash);
  assert.equal(oracle.fixtureHash, digest(bytes)); assert.equal(oracle.outputHash, digest(JSON.stringify(oracle.outputs))); assert.deepEqual(oracle.warnings, []);
  const settings = defaults.output;
  const profile = createMetroResolver({files: new Set(fixture.files), packages: fixture.packages, packageLinks: new Map(Object.entries(fixture.links))}, {platform, sourceExts: settings.sourceExts, assetExts: new Set(settings.assetExts), mainFields: settings.resolverMainFields, conditions: [...settings.unstable_conditionNames, ...settings.unstable_conditionsByPlatform[platform] ?? []], exportsEnabled: settings.unstable_enablePackageExports, preferNativePlatform: true, customResolver: false});
  for (const c of fixture.cases) {
    const actual = profile.resolve("index.js", c.specifier, c.isImport !== false), expected = oracle.outputs.find(o => o.id === c.id)!;
    assert.equal(actual.state, expected.type === "empty" ? "empty" : "resolved", c.id);
    if (actual.state === "resolved") assert.deepEqual(actual.targets, expected.targets, c.id);
  }
  const choice = profile.resolve("index.js", "./src/Choice"); assert.equal(choice.state, "resolved");
  if (choice.state === "resolved") assert.deepEqual(choice.targets, tuple.startsWith("expo") ? ["src/Choice.ts"] : [`src/Choice.${platform}.js`]);
});
test("Flow neutral extraction: lexical functions, immutable aliases and import requests are distinct", () => {
  const source = "// @flow\nimport {external as remote} from './external'; export function helper(x:number):number {return x;} const alias=helper; export function outer(){alias(1);remote(2);}\n";
  const result = extractFlow(hermes, "source.js", Buffer.from(source));
  assert.deepEqual(validateFlowSyntax(result, "source.js", Buffer.from(source)), result);
  const helper = result.behavior.declarations.find(d => d.name === "helper")!;
  const outer = result.behavior.declarations.find(d => d.name === "outer")!;
  const call = result.behavior.relations.find(r => r.relation === "calls")!;
  assert.equal(call.source, outer.id); assert.equal(call.target, helper.id); assert.equal(source.slice(call.site.start, call.site.end), "alias(1)");
  assert.deepEqual(result.exports.map(e => e.name), ["helper", "outer"]);
  assert.equal(result.imports[0].alias, "remote"); assert.equal(result.importedCalls[0].module, "./external"); assert.equal(result.importedCalls[0].name, "external");
  assert.equal(result.behavior.relations.filter(r => r.relation === "calls").length, 1);
});
test("Flow neutral protocol rejects AST leakage, forged source ranges, owners and imported targets", () => {
  const source = Buffer.from("// @flow\nimport {remote} from './external'; function helper(){remote();}\n");
  const syntax = extractFlow(hermes, "source.js", source);
  assert.deepEqual(validateFlowSyntax(syntax, "source.js", source), syntax);
  assert.throws(() => validateFlowSyntax({...syntax, ast: {}}, "source.js", source));
  for (const mutate of [
    (copy: typeof syntax) => { copy.behavior.declarations[0].site.fileHash = "0".repeat(64); },
    (copy: typeof syntax) => { copy.behavior.declarations[0].site.start = 100000; },
    (copy: typeof syntax) => { copy.importedCalls[0].source = "invented"; },
    (copy: typeof syntax) => { copy.importedCalls[0].module = "invented"; },
  ]) { const copy = structuredClone(syntax); mutate(copy); assert.throws(() => validateFlowSyntax(copy, "source.js", source)); }
});
test("Flow supervised parser: neutral fixture parity, Python shared lease and malformed recovery", {timeout: 30000, skip: process.platform !== "win32"}, async () => {
  const host = path.resolve("src-tauri/target/debug/parser-host.exe"), worker = new FlowParserWorker(host);
  const f = JSON.parse(readFileSync(new URL("../fixtures/framework-support/F07-rn/flow.json", import.meta.url), "utf8")) as {cases: {id: string; source: string; error?: boolean}[]};
  try {
    await worker.start();
    const other = new PythonParserWorker(host);
    await assert.rejects(other.start(), /parser-unavailable/); await other.close();
    for (const c of f.cases) if (c.error) await assert.rejects(worker.parse(c.id + ".js", Buffer.from(c.source)), /parse-error/);
    else assert.deepEqual(await worker.parse(c.id + ".js", Buffer.from(c.source)), extractFlow(hermes, c.id + ".js", Buffer.from(c.source)));
    await assert.rejects(worker.parse("bad.js", Buffer.from([0xff])), /unsupported-encoding/);
    assert((await worker.parse("again.js", Buffer.from("// @flow\nfunction helper(){}"))).behavior.declarations.length);
  } finally { await worker.close(); }
  const python = new PythonParserWorker(host);
  try { await python.start(); assert((await python.parse("healthy.py", Buffer.from("def helper():\n    pass\n"))).behavior.declarations.length); } finally { await python.close(); }
});
test("Flow supervised parser: cancellation releases lease and a new worker recovers", {timeout: 20000, skip: process.platform !== "win32"}, async () => {
  const host = path.resolve("src-tauri/target/debug/parser-host.exe"), controller = new AbortController(), worker = new FlowParserWorker(host, controller.signal);
  try {
    await worker.start();
    const pending = worker.parse("large.js", Buffer.from("// @flow\nconst values=[" + Array.from({length: 30000}, () => "0").join(",") + "];"));
    controller.abort(); await assert.rejects(pending, /cancelled/);
  } finally { await worker.close(); }
  const recovered = new FlowParserWorker(host);
  try { await recovered.start(); assert((await recovered.parse("okay.js", Buffer.from("// @flow\nfunction okay(){}"))).behavior.declarations.length); } finally { await recovered.close(); }
});
test("Metro production profile: platform dependencies/assets retain shared witnesses and incremental equivalence", () => {
  const root = mkdtempSync(path.join(tmpdir(), "cartograph FS07 "));
  const sources: Record<string, string> = {
    "package.json": JSON.stringify({name: "controlled-rn", dependencies: {"react-native": "0.83.10", react: "19.2.0", metro: "0.83.8", "@react-navigation/native": "7.5.0", "@react-navigation/native-stack": "7.20.0"}}),
    "index.ts": "import {choice} from './src/Choice'; const logo=require('./src/logo.png'); export function entry(){return choice();}\n",
    "src/Choice.android.js": "export function choice(){return 'android';}\n",
    "src/Choice.ios.js": "export function choice(){return 'ios';}\n",
    "src/Choice.ts": "export function choice(){return 'plain';}\n",
    "src/logo.png": "synthetic image bytes", "src/logo@2x.png": "synthetic density bytes",
  };
  try {
    for (const [file, text] of Object.entries(sources)) { mkdirSync(path.dirname(path.join(root, file)), {recursive: true}); writeFileSync(path.join(root, file), text); }
    const driver = createTypescriptRefresh({metroModes: ["android-development", "ios-development"]}), snapshot = driver.analyze(root, true).snapshot;
    for (const platform of ["android", "ios"]) {
      const variant = snapshot.analysis.variants.find(v => v.platform === platform && v.profileId.includes("fs-07/1"))!; assert(variant);
      const dependencies = snapshot.analysis.bindings.filter(b => b.variantId === variant.id && b.kind === "module-dependency");
      assert(dependencies.some(b => b.targetId === `src/Choice.${platform}.js`));
      assert(!dependencies.some(b => b.targetId === `src/Choice.${platform === "ios" ? "android" : "ios"}.js`));
      assert.equal(snapshot.analysis.bindings.filter(b => b.variantId === variant.id && b.kind === "asset").length, 2);
      for (const binding of snapshot.analysis.bindings.filter(b => b.variantId === variant.id)) for (const witness of binding.witnesses) assert(["current", "rule"].includes(readWitnessEvidence(snapshot, witness).state));
      assert(snapshot.analysis.gaps.some(g => g.variantId === variant.id && g.occurrence.file === "index.ts")); // Legacy plain call is not promoted into this differing runtime.
    }
    assert.deepEqual(deserializeSnapshot(serializeSnapshot(snapshot)), snapshot);
    assert.deepEqual(driver.analyze(root, false).snapshot, snapshot);
    writeFileSync(path.join(root, "src/Choice.ios.js"), "export function choice(){return 'changed';}\n");
    assert.deepEqual(driver.analyze(root, false).snapshot, createTypescriptRefresh({metroModes: ["android-development", "ios-development"]}).analyze(root, true).snapshot);
  } finally { assert(path.basename(root).startsWith("cartograph FS07 ")); rmSync(root, {recursive: true, force: true}); }
});
test("RN shared React projection: AppRegistry, composition, native events, effects and context stay distinct from calls", () => {
  const root = mkdtempSync(path.join(tmpdir(), "cartograph FS07 "));
  const sources = {
    "package.json": JSON.stringify({name: "controlled-rn", dependencies: {"react-native": "0.83.10", react: "19.2.0", metro: "0.83.8", "@react-navigation/native": "7.5.0", "@react-navigation/native-stack": "7.20.0"}}),
    "index.ts": "import {AppRegistry} from 'react-native'; import App from './App'; AppRegistry.registerComponent('Controlled',()=>App);\n",
    "App.tsx": "import {Pressable,Text} from 'react-native'; import {createContext,useContext,useEffect,memo} from 'react'; export const Ctx=createContext(null); export function Child(){return <Text/>;} export function handle(){} export function cleanup(){} const Memo=memo(Child); export default function App(){useEffect(()=>{handle();return ()=>cleanup();},[]);useContext(Ctx);return <Ctx.Provider value={null}><Pressable onPress={handle}><Memo/><Child/></Pressable></Ctx.Provider>;}\n",
  };
  try {
    for (const [file, text] of Object.entries(sources)) writeFileSync(path.join(root, file), text);
    const s = createTypescriptRefresh({metroModes: ["android-development", "ios-development"]}).analyze(root, true).snapshot;
    for (const variant of s.analysis.variants.filter(v => v.profileId.includes("fs-07/1"))) {
      const bindings = s.analysis.bindings.filter(b => b.variantId === variant.id);
      const rules = bindings.flatMap(b => b.witnesses.filter(w => w.role === "framework-rule").map(w => w.ruleId));
      for (const rule of ["rn/app-registry-provider:Controlled", "rn/native-ui-event:Pressable:onPress", "react/jsx", "react/memo", "react/useEffect/callback", "react/context-provider", "react/context-consumer"]) assert(rules.includes(rule), rule);
      const event = bindings.find(b => b.kind === "event-handler")!;
      assert.equal(s.behavior.declarations.find(d => d.id === event.targetId)?.name, "handle");
      assert(!s.analysis.gaps.some(g => g.variantId === variant.id && g.occurrence.start === event.occurrence.start && g.occurrence.file === event.occurrence.file));
      const entry = bindings.find(b => b.kind === "entry-point")!; assert.equal(s.behavior.declarations.find(d => d.id === entry.targetId)?.name, "App");
      for (const binding of bindings) for (const witness of binding.witnesses) assert(["current", "rule"].includes(readWitnessEvidence(s, witness).state));
    }
    assert(s.behavior.relations.some(r => r.relation === "calls" && s.behavior.declarations.find(d => d.id === r.target)?.name === "handle"));
    assert(!s.behavior.relations.some(r => r.relation === "calls" && r.site.file === "index.ts"));
    writeFileSync(path.join(root, "index.ts"), "import {AppRegistry} from 'react-native';import App from './App';AppRegistry.registerComponent(name,()=>App);\n");
    const dynamic = createTypescriptRefresh().analyze(root, true).snapshot;
    assert(!dynamic.analysis.bindings.some(b => b.kind === "entry-point")); assert(dynamic.analysis.gaps.some(g => g.reason === "dynamic-expression" && g.occurrence.file === "index.ts"));
    writeFileSync(path.join(root, "App.tsx"), sources["App.tsx"].replace("onPress={handle}", "onPress={handle} {...props}"));
    assert(!createTypescriptRefresh().analyze(root, true).snapshot.analysis.bindings.some(b => b.kind === "event-handler"));
  } finally { assert(path.basename(root).startsWith("cartograph FS07 ")); rmSync(root, {recursive: true, force: true}); }
});
test("Flow neutral extraction: parameter shadowing, mutations, eval and receiver dispatch never guess calls", () => {
  for (const source of [
    "function helper(){} function outer(helper:number){helper();}",
    "function helper(){} helper = other; function outer(){helper();}",
    "function helper(){} function outer(){eval('helper = other');helper();}",
    "function helper(){} function outer(receiver:unknown){receiver.helper();}",
    "function helper(){} function outer(){alias(); const alias=helper;}",
    "import type {helper} from './external'; function outer(){helper();}",
  ]) {
    const result = extractFlow(hermes, "source.js", Buffer.from("// @flow\n" + source));
    assert.equal(result.behavior.relations.filter(r => r.relation === "calls").length, 0, source);
    assert.equal(result.importedCalls.length, 0, source); assert(result.behavior.gaps.length, source);
  }
});
test("Flow neutral extraction: component/hook scopes, JSX calls, conditional evidence and original coordinates", () => {
  const source = "\uFEFF// @flow\r\nconst emoji='😀é';\r\nfunction helper(x:number){return x;}\r\nhook useValue(value:number){return helper(value);}\r\ncomponent Screen(title:number){return <Text>{helper(title)}</Text>;}\r\nfunction outer(){if(flag){helper(1);}}\r\n";
  const result = extractFlow(hermes, "source.js", Buffer.from(source));
  assert.deepEqual(validateFlowSyntax(result, "source.js", Buffer.from(source)), result);
  assert.equal(result.behavior.relations.filter(r => r.relation === "calls").length, 3);
  const last = result.behavior.relations.find(r => r.relation === "calls" && r.conditional)!;
  assert.equal(source.slice(last.site.start, last.site.end), "helper(1)"); assert.equal(last.site.line, 6);
  for (const d of result.behavior.declarations) assert(d.site.end <= source.length);
  assert(result.behavior.declarations.some(d => d.name === "Screen" && d.kind === "function"));
  assert(result.behavior.declarations.some(d => d.name === "useValue" && d.kind === "function"));
  assert.throws(() => extractFlow(hermes, "bad.js", Buffer.from("function broken(x:number {}")));
  assert.throws(() => extractFlow(hermes, "bad.js", Buffer.from([0xff])), /unsupported-encoding/);
  assert.throws(() => extractFlow(hermes, "big.js", Buffer.alloc(1048577)), /resource-limit/);
});
