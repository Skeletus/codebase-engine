import assert from "node:assert/strict";
import path from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync,realpathSync,mkdirSync,writeFileSync,readFileSync,rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";

// Application-owned harness only. The synthetic repository is always data.
const resources=path.resolve("src-tauri/resources/generated/engine");
const runtime=JSON.parse(readFileSync(path.join(resources,"runtime.json"),"utf8"));
const executable=path.resolve(`src-tauri/binaries/code-engine-${runtime.target}.exe`);
const directory=realpathSync.native(mkdtempSync(path.join(tmpdir(),"cartograph FS03 packaged ")));
const sourceBytes=readFileSync("tests/fixtures/framework-support/F03-qualification/fixture.json");
const sources=JSON.parse(sourceBytes.toString("utf8")).sources;
const imports=(file:string)=>JSON.stringify(pathToFileURL(path.join(resources,file)).href);
const results=[];
try {
  for (const [tuple,vite,react] of [["vite7-react18","7.3.7","18.3.1"],["vite8-react19","8.3.3","19.2.8"]]) {
    const root=path.join(directory,tuple);mkdirSync(root);
    for (const [file,value] of Object.entries(sources)) {
      mkdirSync(path.dirname(path.join(root,file)),{recursive:true});
      writeFileSync(path.join(root,file),file === "package.json" ? String(value).replace("8.3.3",vite).replaceAll("19.2.8",react).replace("6.1.2",tuple==="vite7-react18" ? "5.2.0" : "6.1.2") : String(value));
    }
    const contextTag=react==="19.2.8" ? "C" : "C.Provider";
    const controlledProbe=`import React,{Component,createContext,useContext,useState,useMemo,useCallback,useReducer,useImperativeHandle,useSyncExternalStore} from 'react';import {createRoot} from 'react-dom/client';import {BrowserRouter,Routes,Route,Link,useNavigate,createBrowserRouter} from 'react-router';import * as UI from './qualified-component';const C=createContext('x');function snapshot(){return 1}function subscribe(){return ()=>{}}function reduce(s){return s}function persist(){}class Panel extends Component {render(){return <UI.Screen/>}componentDidMount(){persist()}componentWillUnmount(){persist()}}function Menu(){const navigate=useNavigate();function go(){persist();navigate('/users/a%2Fb')}return <><button onClick={go}/><Link to='/users/42'/></>}export function QualifiedApp(){useContext(C);useState(snapshot);useMemo(()=>1,[]);useCallback(()=>1,[]);useReducer(reduce,0,snapshot);useImperativeHandle(null,()=>({}),[]);useSyncExternalStore(subscribe,snapshot,snapshot);return <BrowserRouter><${contextTag} value='x'><C.Consumer>{value=><Panel/>}</C.Consumer><Menu/><Routes><Route path='/users/:id' element={<UI.Screen/>}/></Routes></${contextTag}></BrowserRouter>}const router=createBrowserRouter([{path:'/probe',Component:QualifiedApp,loader:()=>1,action:()=>2}]);createRoot(document.getElementById('qualified')).render(<QualifiedApp/>);`;
    writeFileSync(path.join(root,"src/qualified-component.tsx"),"import React from 'react';export function Screen(){return <div/>}");writeFileSync(path.join(root,"src/qualified-behavior.tsx"),controlledProbe);
    const probe=`
      import assert from 'node:assert/strict';
      import {writeFileSync} from 'node:fs';
      import {createHash} from 'node:crypto';
      import net from 'node:net';
      const {createTypescriptRefresh}=await import(${imports("lib/engine/adapters/typescript.ts")});
      const {traceFramework}=await import(${imports("lib/engine/behavior.ts")});
      const {readWitnessEvidence}=await import(${imports("lib/engine/index.ts")});
      const {snapshotJson}=await import(${imports("lib/engine/snapshot-identity.ts")});
      const {SqliteAnalysisStore}=await import(${imports("lib/storage/sqlite.ts")});
      globalThis.fetch=async()=>{throw new Error('Denied egress');};
      net.connect=()=>{throw new Error('Denied sockets');};
      net.createConnection=net.connect;
      const root=${JSON.stringify(root)},db=${JSON.stringify(path.toNamespacedPath(path.join(directory,tuple+".sqlite")))};
      const driver=createTypescriptRefresh({viteModes:${JSON.stringify(tuple === "vite8-react19" ? ["browser-development","browser-production","ssr-production"] : ["browser-development","browser-production"])}});
      const first=driver.analyze(root,true).snapshot;
      for(const [environment,target] of [['browser-development','src/development.ts'],['browser-production','src/production.ts'],...(${JSON.stringify(tuple)}==='vite8-react19' ? [['ssr-production','src/server.ts']] : [])]){
        const variant=first.analysis.variants.find(v=>v.environment===environment&&v.profileId.includes('fs-03/1'));assert(variant);
        assert(first.analysis.bindings.some(b=>b.variantId===variant.id&&b.kind==='module-dependency'&&b.targetId===target));
      }
      assert(first.analysis.bindings.some(b=>b.kind==='asset'&&b.targetId==='public/public.svg'));
      assert(first.analysis.bindings.some(b=>b.kind==='worker'));
      const rules=new Set(first.analysis.bindings.flatMap(b=>b.witnesses.flatMap(w=>w.role==='framework-rule' ? [w.ruleId] : [])));
      for(const rule of ['react/jsx-namespace','react/context-consumer-callback','react/useState/initializer','react/useSyncExternalStore/callback/2','react/class/componentDidMount','router/literal-useNavigate','router/loader','router/action'])assert(rules.has(rule),rule);
      const event=first.analysis.bindings.find(b=>b.kind === 'event-handler');assert(event);
      const trace=traceFramework(first,'index.html',event.variantId);
      assert(trace.steps.some(s=>s.kind === 'verified-call'));
      const witnesses=[...new Map(first.analysis.bindings.flatMap(b=>b.witnesses).map(w=>[JSON.stringify(w),w])).values()];
      for(const w of witnesses)assert(['current','rule'].includes(readWitnessEvidence(first,w).state));
      assert.deepEqual(driver.analyze(root,false).snapshot,first);
      let store=new SqliteAnalysisStore(db);const repo=store.register(root);store.begin(repo.repositoryId,'fs03');store.publish(repo.repositoryId,'fs03',first);store.close();
      store=new SqliteAnalysisStore(db);assert.deepEqual(store.load(repo.repositoryId),first);store.close();
      const witness=first.analysis.bindings.find(b=>b.occurrence.file === 'index.html').witnesses[0];
      writeFileSync(root+'/index.html','<script type="module" src="/src/admin.tsx"></script>');
      assert.equal(readWitnessEvidence(first,witness).state,'stale');
      console.log(JSON.stringify({tuple:${JSON.stringify(tuple)},controlledProbeHash:${JSON.stringify(createHash("sha256").update(controlledProbe).digest("hex"))},node:process.version,variants:first.analysis.variants.filter(v=>v.profileId.includes('fs-03/1')).map(v=>v.environment),files:first.files.length,bindings:first.analysis.bindings.length,registrations:first.analysis.registrations.length,distinctWitnessCount:witnesses.length,snapshotHash:createHash('sha256').update(snapshotJson(first)).digest('hex'),checks:['offline','empty PATH','conditional exports all selected profiles','public assets/workers','namespace/context/hooks/class/imperative router','all distinct witnesses current','entry-event-call trace','full/incremental','SQLite reopen','stale HTML witness']}));
    `;
    results.push(JSON.parse(execFileSync(executable,["--disable-warning=ExperimentalWarning","--input-type=module","--eval",probe],{cwd:resources,env:{NODE_ENV:"production",PATH:"",SystemRoot:process.env.SystemRoot,TEMP:process.env.TEMP,TMP:process.env.TMP},encoding:"utf8",timeout:120000})));
  }
  writeFileSync("docs/fs-05/evidence/vite-preservation-packaged-vite-preservation.json",JSON.stringify({platform:process.platform,arch:process.arch,runtime,fixtureHash:createHash("sha256").update(sourceBytes).digest("hex"),results},null,2)+"\n");
  console.log(JSON.stringify(results));
} finally {assert(path.basename(directory).startsWith("cartograph FS03 packaged "));rmSync(directory,{recursive:true,force:true});}

