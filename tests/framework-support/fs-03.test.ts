import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { tmpdir } from "node:os";
import { mkdtempSync, realpathSync, readFileSync, mkdirSync, writeFileSync, rmSync, existsSync, symlinkSync } from "node:fs";
import { typescriptAdapter, createTypescriptRefresh } from "../../lib/engine/adapters/typescript.ts";
import { parseRepository } from "../../lib/parser/index.ts";
import { readWitnessEvidence, queryStructure } from "../../lib/engine/index.ts";
import { deserializeSnapshot, serializeSnapshot, validateSnapshot } from "../../lib/engine/contract.ts";
import { traceFramework } from "../../lib/engine/behavior.ts";
import { snapshotJson } from "../../lib/engine/snapshot-identity.ts";
import { htmlModuleScripts } from "../../lib/parser/adapters/vite-html.ts";
import { frameworkFact } from "../../lib/parser/framework-budget.ts";
import { AnalysisBoundaryError,GenerationBoundary } from "../../lib/engine/boundary.ts";
import {SqliteAnalysisStore} from "../../lib/storage/sqlite.ts";
import type {ViteMode} from "../../lib/parser/adapters/vite.ts";
import {Project} from "ts-morph";
import {matchesNavigation} from "../../lib/parser/adapters/react-router.ts";

const sources: Record<string, string> = JSON.parse(readFileSync(new URL("../fixtures/framework-support/F03-react-vite/sources.json", import.meta.url), "utf8"));
const qualified:Record<string,string>=JSON.parse(readFileSync(new URL("../fixtures/framework-support/F03-qualification/fixture.json",import.meta.url),"utf8")).sources;
const targets:[string,ViteMode][]=[["vite7-react18","browser-development"],["vite7-react18","browser-production"],["vite8-react19","browser-development"],["vite8-react19","browser-production"],["vite8-react19","ssr-production"]];
if(process.env.FS03_TUPLE&&!targets.some(([tuple])=>tuple===process.env.FS03_TUPLE)||process.env.FS03_PROFILE&&!targets.some(([,profile])=>profile===process.env.FS03_PROFILE)||process.env.FS03_TUPLE&&process.env.FS03_PROFILE&&!targets.some(([tuple,profile])=>tuple===process.env.FS03_TUPLE&&profile===process.env.FS03_PROFILE))throw Error("Unqualified FS-03 tuple/profile filter");
for(const [tuple,profile] of targets) test(`qualification ${tuple}/${profile}: pinned expanded module oracle and source witnesses`,{skip:!!(process.env.FS03_TUPLE&&process.env.FS03_TUPLE!==tuple||process.env.FS03_PROFILE&&process.env.FS03_PROFILE!==profile)},t=>{
  const digest=(value:Buffer|string)=>createHash("sha256").update(value).digest("hex");
  const bytes=readFileSync(new URL(`../../docs/fs-03/evidence/${tuple}-${profile}-expanded-oracle.json`,import.meta.url));
  const oracle=JSON.parse(bytes.toString()) as {tuple:string;profile:string;fixtureHash:string;outputHash:string;workerHash:string;workerModules:{id:string;imports:string[]}[];modules:{id:string;imports:string[];dynamic:string[]}[]};
  assert.equal(oracle.tuple,tuple);assert.equal(oracle.profile,profile);assert.equal(oracle.fixtureHash,digest(readFileSync(new URL("../fixtures/framework-support/F03-qualification/fixture.json",import.meta.url))));assert.equal(oracle.outputHash,digest(JSON.stringify(oracle.modules)));
  const files={...qualified},pkg=JSON.parse(files["package.json"]);
  if(tuple==="vite7-react18"){pkg.dependencies.vite="7.3.7";pkg.dependencies.react=pkg.dependencies["react-dom"]="18.3.1";pkg.devDependencies["@vitejs/plugin-react"]="5.2.0";}files["package.json"]=JSON.stringify(pkg);
  const f=fixture(files);try{
    const s=createTypescriptRefresh({viteModes:[profile]}).analyze(f.root,true).snapshot;
    const variant=s.analysis.variants.find(v=>v.environment===profile&&v.profileId.includes("fs-03/1"))!;assert(variant);
    for(const record of oracle.modules.filter(m=>/\.(html|tsx|ts)$/.test(m.id))){
      const expected=[...new Set([...record.imports,...record.dynamic].filter(p=>p.startsWith("src/")&&/\.[jt]sx?$/.test(p)).map(p=>p.split("?")[0]))].sort();
      const actual=[...new Set(s.analysis.bindings.filter(b=>b.variantId===variant.id&&b.occurrence.file===record.id&&["module-dependency","entry-point"].includes(b.kind)&&b.targetId.startsWith("src/")).map(b=>b.targetId))].sort();assert.deepEqual(actual,expected,record.id);
    }
    const branch=profile==="ssr-production" ? "src/server.ts" : profile==="browser-production" ? "src/production.ts" : "src/development.ts";
    assert(s.analysis.bindings.some(b=>b.variantId===variant.id&&b.kind==="module-dependency"&&b.targetId===branch));
    if(!profile.startsWith("ssr")){assert(s.analysis.bindings.some(b=>b.kind==="asset"&&b.targetId==="public/public.svg"));assert.equal(oracle.workerHash,digest(JSON.stringify(oracle.workerModules)));assert.deepEqual(oracle.workerModules.map(m=>m.id),["src/worker.ts"]);assert(s.analysis.bindings.some(b=>b.kind==="worker"&&b.targetId===oracle.workerModules[0].id));assert(s.analysis.bindings.some(b=>b.kind==="entry-point"&&b.occurrence.file==="main.tsx"));}
    else assert(s.analysis.bindings.some(b=>b.kind==="entry-point"&&b.occurrence.file==="src/ssr.tsx"));
    for(const binding of s.analysis.bindings)for(const witness of binding.witnesses)assert(["rule","current"].includes(readWitnessEvidence(s,witness).state));
    assert.deepEqual(deserializeSnapshot(serializeSnapshot(s)),s);
    t.diagnostic(JSON.stringify({tuple,profile,facts:s.analysis.bindings.length,registrations:s.analysis.registrations.length,candidates:s.analysis.candidates.length,gaps:s.analysis.gaps.length,forbiddenGuessedFacts:0}));
  }finally{f.cleanup();}
});
for(const profile of ["browser-development","browser-production","ssr-production"] as const)test(`qualification: Vite 8 native TS paths ${profile} agrees with controlled compiler`,()=>{
  const oracle=JSON.parse(readFileSync(new URL(`../../docs/fs-03/evidence/vite8-react19-${profile}-expanded-tsconfig-paths-oracle.json`,import.meta.url),"utf8")) as {testCase:string;outputHash:string;modules:{id:string;imports:string[]}[]};
  assert.equal(oracle.testCase,"tsconfig-paths");assert.equal(oracle.outputHash,createHash("sha256").update(JSON.stringify(oracle.modules)).digest("hex"));
  const files={...qualified,"vite.config.ts":qualified["vite.config.ts"].replace("alias:{'@selected':'./src/Selected.ts'}","tsconfigPaths:true"),"tsconfig.json":JSON.stringify({compilerOptions:{baseUrl:'.',paths:{'@selected':['./src/Selected.ts']}}}),"src/ssr.tsx":qualified["src/ssr.tsx"]+"import {selected} from '@selected';export {selected};"};
  const f=fixture(files);try{const s=createTypescriptRefresh({viteModes:[profile]}).analyze(f.root,true).snapshot;const file=profile.startsWith("ssr") ? "src/ssr.tsx" : "main.tsx";assert(oracle.modules.find(m=>m.id===file)?.imports.includes("src/Selected.ts"));assert(s.analysis.bindings.some(b=>b.kind==="module-dependency"&&b.occurrence.file===file&&b.targetId==="src/Selected.ts"));}finally{f.cleanup();}
});

test("qualification: pinned React plugins reject transforms, shadowing, mutation and version drift",()=>{
  const prefix="import {defineConfig} from 'vite';import react from '@vitejs/plugin-react';";
  const f=fixture(qualified);try{
    for(const [name,config,pkg] of [
      ["babel",prefix+"export default defineConfig({plugins:[react({babel:{plugins:['custom']}})]})",qualified["package.json"]],
      ["importSource",prefix+"export default defineConfig({plugins:[react({jsxImportSource:'other'})]})",qualified["package.json"]],
      ["classic",prefix+"export default defineConfig({plugins:[react({jsxRuntime:'classic'})]})",qualified["package.json"]],
      ["define",prefix+"export default defineConfig({plugins:[react()],define:{Worker:'Fake'}})",qualified["package.json"]],
      ["workerPlugin",prefix+"export default defineConfig({plugins:[react()],worker:{plugins:()=>[custom()]}})",qualified["package.json"]],
      ["mutation",prefix+"react=custom;export default defineConfig({plugins:[react()]})",qualified["package.json"]],
      ["shadow",prefix+"function f(react){return react()}export default defineConfig({plugins:[react()]})",qualified["package.json"]],
      ["version",prefix+"export default defineConfig({plugins:[react()]})",qualified["package.json"].replace("6.1.2","^6.1.2")],
    ]){f.write("vite.config.ts",config);f.write("package.json",pkg);const s=typescriptAdapter.analyze(f.root);assert(!s.analysis.bindings.some(b=>b.kind==="entry-point"),name);assert(s.analysis.gaps.some(g=>g.reason==="custom-resolver"),name);}
    f.write("package.json",qualified["package.json"]);f.write("vite.config.ts",prefix+"export default defineConfig({plugins:[react({jsxRuntime:'automatic',jsxImportSource:'react'})]})");
    assert(typescriptAdapter.analyze(f.root).analysis.bindings.some(b=>b.kind==="entry-point"&&b.occurrence.file==="main.tsx"));
  }finally{f.cleanup();}
});

test("qualification: publicDir disable/custom and unsafe exports retain explicit boundaries",()=>{
  const f=fixture(qualified);try{
    f.write("vite.config.ts","export default {publicDir:false}");assert(!typescriptAdapter.analyze(f.root).analysis.bindings.some(b=>b.kind==="asset"&&b.targetId==="public/public.svg"));
    f.write("vite.config.ts","export default {publicDir:'static'}");f.write("static/public.svg","<svg/>");assert(typescriptAdapter.analyze(f.root).analysis.bindings.some(b=>b.kind==="asset"&&b.targetId==="static/public.svg"));
    for(const exports of [{"./branch":["./src/development.ts","./src/fallback.ts"]},{"./branch":"../outside.ts"},{"./branch":null},{"./*":"./src/*.ts"}]){
      const pkg=JSON.parse(qualified["package.json"]);pkg.exports=exports;f.write("package.json",JSON.stringify(pkg));const s=typescriptAdapter.analyze(f.root);assert(!s.analysis.bindings.some(b=>b.kind==="module-dependency"&&b.occurrence.file==="main.tsx"&&["src/development.ts","src/fallback.ts"].includes(b.targetId)));assert(s.analysis.gaps.some(g=>g.occurrence.file==="main.tsx"));
    }
  }finally{f.cleanup();}
});

test("qualification: namespace components, context consumers, hook callbacks and class lifecycle are associations",()=>{
  const f=fixture({...qualified,"src/Namespace.tsx":"export function Screen(){return <div/>}","src/App.tsx":`import React,{Component,createContext,use,useContext,useMemo,useCallback,useReducer,useImperativeHandle,useSyncExternalStore} from 'react';import * as UI from './Namespace';const C=createContext('x');function reduce(s){return s}function subscribe(){return ()=>{}}function snapshot(){return 1}class Panel extends Component {render(){return <UI.Screen/>}componentDidMount(){}componentDidUpdate(){}componentWillUnmount(){}}export function App(){use(C);useContext(C);useMemo(()=>1,[]);useCallback(()=>1,[]);useReducer(reduce,0);useImperativeHandle(null,()=>({}),[]);useSyncExternalStore(subscribe,snapshot,snapshot);return <C value='x'><C.Consumer>{value=><Panel/>}</C.Consumer></C>}`});try{
    const s=typescriptAdapter.analyze(f.root),rules=new Set(s.analysis.bindings.flatMap(b=>b.witnesses.flatMap(w=>w.role==="framework-rule" ? [w.ruleId] : [])));
    for(const rule of ["react/jsx-namespace","react/context-provider-shorthand","react/context-consumer-element","react/context-consumer-callback","react/context-consumer","react/useMemo/callback/0","react/useCallback/callback/0","react/useReducer/callback/0","react/useImperativeHandle/callback/1","react/useSyncExternalStore/callback/0","react/useSyncExternalStore/callback/1","react/useSyncExternalStore/callback/2","react/class/render","react/class/componentDidMount","react/class/componentDidUpdate","react/class/componentWillUnmount"])assert(rules.has(rule),rule);
    for(const b of s.analysis.bindings)for(const w of b.witnesses)assert(["current","rule"].includes(readWitnessEvidence(s,w).state));
    assert(!s.behavior.relations.some(r=>r.relation==="calls"&&r.site.extractor.startsWith("react")));
    f.write("package.json",qualified["package.json"].replace("8.3.3","7.3.7").replaceAll("19.2.8","18.3.1").replace("6.1.2","5.2.0"));
    const legacy=typescriptAdapter.analyze(f.root),legacyRules=new Set(legacy.analysis.bindings.flatMap(b=>b.witnesses.flatMap(w=>w.role==="framework-rule" ? [w.ruleId] : [])));
    for(const rule of ["react/context-consumer-element","react/context-consumer-callback","react/context-consumer","react/useMemo/callback/0","react/useCallback/callback/0","react/useReducer/callback/0","react/useImperativeHandle/callback/1","react/useSyncExternalStore/callback/2","react/class/render"])assert(legacyRules.has(rule),rule);
    assert(!legacyRules.has("react/context-provider-shorthand"));
  }finally{f.cleanup();}
});

test("qualification: imperative navigation requires one proved router, callbacks remain framework bindings",()=>{
  const app=`import React from 'react';import {BrowserRouter,Routes,Route,Link,useNavigate,createBrowserRouter} from 'react-router';function Page(){return <div/>}function Menu(){const navigate=useNavigate();function go(){navigate('/home')}return <><button onClick={go}/><Link to='/home'/></>}export function App(){return <BrowserRouter><Menu/><Routes><Route path='/home' element={<Page/>}/></Routes></BrowserRouter>}const router=createBrowserRouter([{path:'/data',Component:Page,loader:()=>1,action:()=>2}]);`;
  const f=fixture({...qualified,"src/App.tsx":app});try{
    const s=typescriptAdapter.analyze(f.root);assert(s.analysis.bindings.some(b=>b.witnesses.some(w=>w.role==="framework-rule"&&w.ruleId==="router/literal-useNavigate")));assert(s.analysis.bindings.some(b=>b.witnesses.some(w=>w.role==="framework-rule"&&w.ruleId==="router/loader")));assert(s.analysis.bindings.some(b=>b.witnesses.some(w=>w.role==="framework-rule"&&w.ruleId==="router/action")));
    for(const b of s.analysis.bindings.filter(b=>b.kind==="navigation"))for(const w of b.witnesses)assert(["current","rule"].includes(readWitnessEvidence(s,w).state));
    f.write("src/App.tsx",app.replace("<BrowserRouter>","<BrowserRouter basename={window.base}>"));const dynamic=typescriptAdapter.analyze(f.root);assert(!dynamic.analysis.bindings.some(b=>b.kind==="navigation"));assert(dynamic.analysis.gaps.some(g=>g.reason==="dynamic-expression"));
    f.write("src/App.tsx",app.replace("<Menu/>","<Menu/><BrowserRouter><Menu/></BrowserRouter>"));assert(!typescriptAdapter.analyze(f.root).analysis.bindings.some(b=>b.kind==="navigation"));
    f.write("src/App.tsx",app.replace("</Routes>","{unknownRoutes()}</Routes>"));const incomplete=typescriptAdapter.analyze(f.root);assert(!incomplete.analysis.bindings.some(b=>b.kind==="navigation"));assert(incomplete.analysis.gaps.some(g=>g.reason==="dynamic-expression"));
    f.write("src/App.tsx",app.replace("path='/home'","path='/users/:id'").replaceAll("'/home'","'/users/a%2Fb'"));assert(typescriptAdapter.analyze(f.root).analysis.bindings.some(b=>b.kind==="navigation"));
    f.write("main.tsx",`const modules=import.meta.glob(${JSON.stringify(Array.from({length:101},()=>"./src/*.tsx"))});`);assert(!typescriptAdapter.analyze(f.root).analysis.bindings.some(b=>b.kind==="navigation"));
  }finally{f.cleanup();}
});

test("qualification: nested router and plugin syntax depth/size limits fail explicitly",()=>{
  const nested=(depth:number)=>{let route="{path:'leaf',Component:Page}";for(let n=0;n<depth;n++)route=`{path:'p',Component:Page,children:[${route}]}`;return `import {createMemoryRouter} from 'react-router';function Page(){return <div/>}const router=createMemoryRouter([${route}]);`;};
  const f=fixture({...qualified,"src/App.tsx":"export function App(){return <div/>}","src/below.tsx":nested(31),"src/at.tsx":nested(32),"src/above.tsx":nested(33)});try{
    const s=typescriptAdapter.analyze(f.root);for(const file of ["src/below.tsx","src/at.tsx"])assert(!s.analysis.gaps.some(g=>g.reason==="resource-limit"&&g.occurrence.file===file));assert(s.analysis.gaps.some(g=>g.reason==="resource-limit"&&g.occurrence.file==="src/above.tsx"));
    f.write("vite.config.ts",";".repeat(9990)+"export default {plugins:[]};");assert.doesNotThrow(()=>typescriptAdapter.analyze(f.root));
    f.write("vite.config.ts",";".repeat(10000)+"export default {plugins:[]};");assert.throws(()=>typescriptAdapter.analyze(f.root),(e:unknown)=>e instanceof AnalysisBoundaryError&&e.reason==="resource-limit");
  }finally{f.cleanup();}
});

test("qualification: active framework cancellation/deadline preserves persisted generation and recovers",()=>{
  const f=fixture(qualified),original=GenerationBoundary.prototype.check;
  const store=new SqliteAnalysisStore(path.join(f.root,"analysis.sqlite"));
  try{
    const first=typescriptAdapter.analyze(f.root),repo=store.register(f.root);store.begin(repo.repositoryId,"good");store.publish(repo.repositoryId,"good",first);
    for(const reason of ["cancelled","resource-limit"] as const){
      let checks=0,hit=false,clock=0;const controller=new AbortController(),deadline=new GenerationBoundary(undefined,1,()=>clock);
      GenerationBoundary.prototype.check=function(){if(new Error().stack?.includes("vite-react.ts")&&++checks===20){hit=true;if(reason==="cancelled")controller.abort();else{clock=2;original.call(deadline);}}original.call(this);};
      assert.throws(()=>createTypescriptRefresh({signal:controller.signal}).analyze(f.root,true),(error:unknown)=>error instanceof AnalysisBoundaryError&&error.reason===reason);assert(hit,"interruption occurred inside React extractor");
      GenerationBoundary.prototype.check=original;assert.deepEqual(store.load(repo.repositoryId),first);assert.deepEqual(typescriptAdapter.analyze(f.root),first);
    }
  }finally{GenerationBoundary.prototype.check=original;store.close();f.cleanup();}
});

test("qualification: metadata and glob limits pass at ceiling and reject above without guessed facts",()=>{
  const f=fixture(qualified);try{
    f.write("main.tsx",`const pages=import.meta.glob(${JSON.stringify(Array.from({length:100},()=>"./src/pages/*.tsx"))});`);
    assert(typescriptAdapter.analyze(f.root).analysis.bindings.some(b=>b.kind==="module-dependency"&&b.occurrence.file==="main.tsx"));
    f.write("main.tsx",`const pages=import.meta.glob(${JSON.stringify(Array.from({length:101},()=>"./src/pages/*.tsx"))});`);
    const above=typescriptAdapter.analyze(f.root);assert(!above.analysis.bindings.some(b=>b.occurrence.file==="main.tsx"));assert(above.analysis.gaps.some(g=>g.occurrence.file==="main.tsx"&&g.reason==="resource-limit"));
    for(let n=0;n<62;n++)f.write(`tsconfig.${n}.json`,"{}");assert.doesNotThrow(()=>typescriptAdapter.analyze(f.root));
    f.write("tsconfig.extra.json","{}");assert.throws(()=>typescriptAdapter.analyze(f.root),(error:unknown)=>error instanceof Error&&error.message.includes("resource-limit"));
  }finally{f.cleanup();}
});

test("qualification: retained pinned matcher oracle maps to supported neutral registrations",()=>{
  const oracle=JSON.parse(readFileSync(new URL("../../docs/fs-03/evidence/router-oracle.json",import.meta.url),"utf8")) as {version:string;records:{path:string;url:string;params:Record<string,string>}[];outputHash:string};
  assert.equal(oracle.version,"7.18.4");assert.equal(oracle.outputHash,createHash("sha256").update(JSON.stringify(oracle.records)).digest("hex"));
  const paths=[...new Set(oracle.records.map(r=>r.path))];const f=fixture({...qualified,"src/App.tsx":`import React from 'react';import {createBrowserRouter} from 'react-router';function Page(){return <div/>}const router=createBrowserRouter(${JSON.stringify(paths.map(path=>({path}))).replaceAll('}',',Component:Page}')});export function App(){return <div/>}`});try{
    const s=typescriptAdapter.analyze(f.root),routes=s.analysis.registrations.filter(r=>r.kind==="navigation");assert.deepEqual(routes.map(r=>r.rawPattern),paths);
    for(const r of routes){assert.equal(r.precedence,null);assert.equal(r.matcher.state,"supported");if(r.matcher.state==="supported"){assert.equal(r.matcher.trailingSlash,"optional");assert.equal(r.matcher.caseSensitive,false);assert.equal(r.matcher.decodingPolicy,"percent-decode-segments");}}
    for(const record of oracle.records)assert(matchesNavigation(routes.find(r=>r.rawPattern===record.path)!.matcher,record.url),record.url);
    const user=routes.find(r=>r.rawPattern==="/users/:id")!;assert(!matchesNavigation(user.matcher,"/users/"));assert(!matchesNavigation(user.matcher,"/users/%ZZ"));assert(!matchesNavigation(user.matcher,"/users/a/b"));
  }finally{f.cleanup();}
});

test("qualification: actual syntax below/at/above 100k nodes and generation fact ceiling",()=>{
  const syntax=new Project({useInMemoryFileSystem:true,skipLoadingLibFiles:true,skipFileDependencyResolution:true});
  const files:Record<string,string>={};
  for(const [name,count] of [["below",49998],["at",49999],["above",50000]] as const){const text=";".repeat(count);files[`src/${name}.ts`]=text;assert.equal(syntax.createSourceFile(`${name}.ts`,text).getDescendants().length,count*2+2);}
  const f=fixture({...qualified,...files});try{
    const s=typescriptAdapter.analyze(f.root);for(const name of ["below","at"])assert(!s.analysis.gaps.some(g=>g.occurrence.file===`src/${name}.ts`&&g.reason==="resource-limit"));assert(s.analysis.gaps.some(g=>g.occurrence.file==="src/above.ts"&&g.reason==="resource-limit"));
    const budget=structuredClone(s);for(let n=0;n<200000;n++)frameworkFact(budget,`budget-${Math.floor(n/20000)}.ts`);assert.throws(()=>frameworkFact(budget,"extra.ts"),(error:unknown)=>error instanceof AnalysisBoundaryError&&error.reason==="resource-limit");
  }finally{f.cleanup();}
});

test("qualification: distributed routes reach 10k ceiling and overflow remains an explicit gap",()=>{
  const files:Record<string,string>={...qualified,"src/App.tsx":"export function App(){return <div/>}"};
  for(let file=0;file<100;file++){
    const routes=Array.from({length:file===99 ? 101 : 100},(_,index)=>`{path:'/limit-${file}-${index}',Component:Page}`);
    files[`src/route-limit-${String(file).padStart(2,'0')}.tsx`]=`import {createMemoryRouter} from 'react-router';function Page(){return <div/>}const router=createMemoryRouter([${routes.join(',')}]);`;
  }
  const f=fixture(files);try{const s=typescriptAdapter.analyze(f.root),routes=s.analysis.registrations.filter(r=>r.kind==="navigation");assert.equal(routes.length,10000);assert.equal(new Set(routes.map(r=>r.id)).size,10000);assert(routes.every(r=>r.precedence===null));assert(!routes.some(r=>r.rawPattern==="/limit-99-100"));assert(s.analysis.gaps.some(g=>g.reason==="resource-limit"&&g.occurrence.file==="src/route-limit-99.tsx"));for(const route of [routes[0],routes.at(-1)!])for(const witness of route.witnesses)assert(["current","rule"].includes(readWitnessEvidence(s,witness).state));}finally{f.cleanup();}
});

test("qualification: state/reducer initialization and React 19 callbacks are version-qualified",()=>{
  const app="import {useState,useReducer,useActionState,useOptimistic,useEffectEvent} from 'react';function reduce(s){return s}function init(){return 0}export function App(){useState(init);useReducer(reduce,0,init);useActionState(async()=>0,0);useOptimistic(0,reduce);useEffectEvent(()=>0);return <div/>}";
  const f=fixture({...qualified,"src/App.tsx":app});try{
    const rules=(s:ReturnType<typeof typescriptAdapter.analyze>)=>new Set(s.analysis.bindings.flatMap(b=>b.witnesses.flatMap(w=>w.role==="framework-rule" ? [w.ruleId] : [])));
    const modern=rules(typescriptAdapter.analyze(f.root));for(const rule of ["react/useState/initializer","react/useReducer/callback/2","react/useActionState/callback/0","react/useOptimistic/callback/1","react/useEffectEvent/callback/0"])assert(modern.has(rule),rule);
    f.write("package.json",qualified["package.json"].replace("8.3.3","7.3.7").replaceAll("19.2.8","18.3.1").replace("6.1.2","5.2.0"));const s=typescriptAdapter.analyze(f.root),old=rules(s);assert(old.has("react/useState/initializer"));assert(old.has("react/useReducer/callback/2"));assert(!old.has("react/useActionState/callback/0"));assert(s.analysis.gaps.some(g=>g.reason==="unsupported-syntax"&&g.occurrence.file==="src/App.tsx"));
  }finally{f.cleanup();}
});

test("qualification: transparent component aliases preserve the complete event/call investigation",()=>{
  const f=fixture({...qualified,"src/Alias.tsx":"import React from 'react';function persist(){}function save(){persist()}function Base(){return <button onClick={save}/>}export const App=Base;","main.tsx":"import {createRoot} from 'react-dom/client';import {App} from './src/Alias';createRoot(document.getElementById('root')).render(<App/>);"});try{
    const s=typescriptAdapter.analyze(f.root),binding=s.analysis.bindings.find(b=>b.witnesses.some(w=>w.role==="framework-rule"&&w.ruleId==="react/component-alias"))!;assert(binding);const trace=traceFramework(s,"index.html",binding.variantId);assert(trace.steps.some(step=>step.kind==="framework-binding"&&step.binding.kind==="event-handler"));assert(trace.steps.some(step=>step.kind==="verified-call"&&s.behavior.declarations.find(d=>d.id===step.call.target)?.name==="persist"));
  }finally{f.cleanup();}
});
function fixture(overrides: Record<string, string> = {}) {
  const root = realpathSync.native(mkdtempSync(path.join(tmpdir(), "cartograph FS-03 ")));
  const write = (file: string, text: string) => { mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); writeFileSync(path.join(root, file), text); };
  for (const [file, text] of Object.entries({ ...sources, ...overrides })) write(file, text);
  return { root, write, cleanup() { assert(path.basename(root).startsWith("cartograph FS-03 ")); rmSync(root, { recursive: true, force: true }); } };
}
for (const [tuple, vite, react] of [["vite7-react18", "7.3.7", "18.3.1"], ["vite8-react19", "8.3.3", "19.2.8"]]) {
  test(`${tuple}: entries, composition, handlers, hooks and dependencies keep independent witnesses`, () => {
    const f = fixture({ "package.json": sources["package.json"].replace("8.3.3", vite).replaceAll("19.2.8", react) });
    try {
      const s = typescriptAdapter.analyze(f.root), bindings = s.analysis.bindings;
      assert(bindings.some(b => b.kind === "entry-point" && b.occurrence.file === "index.html" && b.targetId === "src/main.tsx"));
      assert(bindings.some(b => b.kind === "entry-point" && b.occurrence.file === "admin.html"));
      assert(bindings.some(b => b.kind === "entry-point" && b.occurrence.file === "src/main.tsx"));
      for (const kind of ["component-reference", "event-handler", "wrapper", "hook", "lifecycle", "context", "asset", "worker"]) assert(bindings.some(b => b.kind === kind), kind);
      const event = bindings.find(b => b.kind === "event-handler")!, handler = s.behavior.declarations.find(d => d.id === event.targetId)!;
      assert.equal(handler.name, "save");
      assert(s.behavior.relations.some(r => r.source === handler.id && r.relation === "calls" && s.behavior.declarations.find(d => d.id === r.target)?.name === "persist"));
      const trace = traceFramework(s,"index.html",event.variantId);
      assert(trace.steps.some(step=>step.kind === "framework-binding" && step.binding.kind === "event-handler"));
      assert(trace.steps.some(step=>step.kind === "verified-call" && s.behavior.declarations.find(d=>d.id===step.call.target)?.name === "persist"));
      assert(!bindings.some(b => s.behavior.declarations.find(d => d.id === b.targetId)?.name === "UppercaseHelper"));
      const shadow = s.behavior.declarations.find(d => d.name === "Shadow")!;
      assert(!bindings.some(b => b.sourceId === shadow.id && b.kind === "lifecycle"));
      for (const binding of bindings) for (const witness of binding.witnesses) assert(["current", "rule"].includes(readWitnessEvidence(s, witness).state));
      assert(s.analysis.capabilities.filter(c => c.extractorVersion === "fs-03/1").every(c => c.state === "partial" && c.tupleId === tuple && c.qualificationRecord === null));
      assert(bindings.some(b=>b.kind === "navigation"));
      assert.deepEqual(deserializeSnapshot(serializeSnapshot(s)), s);
      assert.deepEqual(typescriptAdapter.analyze(f.root), s);
    } finally { f.cleanup(); }
  });
}
test("F03: legacy import projection, exact Impact and type-only edges remain unchanged", () => {
  const f = fixture({ "src/types.ts": "export type T=string;", "src/type-user.ts": "import type {T} from './types'; export type U=T;" });
  try {
    const s = typescriptAdapter.analyze(f.root), legacy = parseRepository(f.root);
    assert.deepEqual(s.relationships.map(r => [r.source,r.target,r.typeOnly,r.syntax]), legacy.edges.map(e => [e.source,e.target,e.typeOnly,e.kind]));
    assert(s.relationships.some(r => r.typeOnly));
    assert(!s.analysis.bindings.some(b => b.kind === "module-dependency" && b.occurrence.file === "src/type-user.ts"));
    assert.equal(queryStructure(s, {file:"src/main.tsx",direction:"dependencies"}).steps.flat().includes("src/worker.ts"), false);
  } finally { f.cleanup(); }
});
test("F03: glob exclusion/eager/lazy options and asset/worker facts never become calls", () => {
  const f = fixture(); try {
    const s = typescriptAdapter.analyze(f.root), globs = s.analysis.bindings.filter(b => b.witnesses.some(w => w.role === "framework-rule" && w.ruleId.startsWith("vite/glob/")));
    assert.equal(globs.length, 3);
    assert.equal(globs.filter(b => b.witnesses.some(w => w.role === "framework-rule" && w.ruleId.includes("/eager/"))).length, 1);
    assert(!globs.filter(b => b.witnesses.some(w => w.role === "framework-rule" && w.ruleId.includes("/eager/"))).some(b => b.targetId.includes("Excluded")));
    assert(!s.relationships.some(r => r.target.endsWith(".svg") || r.target.endsWith(".css")));
  } finally { f.cleanup(); }
});
for (const [name, config] of [
  ["computed", "export default {root:process.env.ROOT}"],
  ["plugins", "export default {plugins:[unknownPlugin()]}"],
  ["escape", "export default {root:'../outside'}"],
] as const) test(`F03: ${name} config produces boundaries instead of guessed runtime edges`, () => {
  const f = fixture({ "vite.config.ts": config }); try {
    const s = typescriptAdapter.analyze(f.root);
    assert(!s.analysis.bindings.some(b => b.kind === "module-dependency"));
    assert(s.analysis.gaps.some(g => ["custom-resolver", "policy-denied"].includes(g.reason)));
    assert(s.relationships.length > 0); // Legacy imports retain their accepted meaning.
  } finally { f.cleanup(); }
});
test("F03: unsupported callback props, inline effects and dynamic navigation stay explicit", () => {
  const f = fixture({ "src/View.tsx": "import React,{useEffect} from 'react'; import {Link} from 'react-router'; export function View(props){useEffect(()=>props.run(),[]);return <><Link to={props.to}/><Widget onSave={props.run}/></>} function Widget(){return <div/>}" });
  try { const s = typescriptAdapter.analyze(f.root); assert(s.analysis.gaps.some(g => g.occurrence.file === "src/View.tsx")); assert(!s.analysis.bindings.some(b => b.kind === "event-handler" && b.occurrence.file === "src/View.tsx"));
    f.write("src/View.tsx","import React,{createContext} from 'react';const C=createContext(0);function save(){}function other(){}export function View(props){return <><button onClick={save} {...props}/><button onClick={save} onClick={other}/><C.Consumer>{v=><div/>}{v=><span/>}</C.Consumer></>}");const ambiguous=typescriptAdapter.analyze(f.root);assert(!ambiguous.analysis.bindings.some(b=>b.kind==="event-handler"&&b.occurrence.file==="src/View.tsx"));assert(!ambiguous.analysis.bindings.some(b=>b.witnesses.some(w=>w.role==="framework-rule"&&w.ruleId==="react/context-consumer-callback")));assert(ambiguous.analysis.gaps.some(g=>g.occurrence.file==="src/View.tsx"&&g.reason==="ambiguous-target"));
  } finally { f.cleanup(); }
});
test("F03: nested route/loader/action bindings are navigation, never HTTP claims", () => {
  const f = fixture(); try { const s = typescriptAdapter.analyze(f.root), routes = s.analysis.registrations.filter(r => r.kind === "navigation"); assert.deepEqual(routes.map(r => r.rawPattern), ["/data", "/data", "/home"]); assert(routes.every(r => r.methodState === null)); assert(s.analysis.bindings.some(b => b.witnesses.some(w => w.role === "framework-rule" && w.ruleId === "router/loader"))); } finally { f.cleanup(); }
});
test("F03: incremental/full equivalence and changed HTML/config witnesses become stale", () => {
  const f = fixture(); try {
    const driver = createTypescriptRefresh(), first = driver.analyze(f.root, true);
    const witness = first.snapshot.analysis.bindings.find(b => b.occurrence.file === "index.html")!.witnesses[0];
    f.write("index.html", sources["index.html"].replace("/src/main.tsx", "/src/admin.tsx"));
    assert.equal(first.reader.stable(), false); assert.equal(readWitnessEvidence(first.snapshot,witness).state, "stale");
    assert.deepEqual(driver.analyze(f.root,false).snapshot, typescriptAdapter.analyze(f.root));
    const configWitness=first.snapshot.analysis.bindings.flatMap(b=>b.witnesses).find(w=>w.role!=="framework-rule" && w.site.file==="vite.config.ts")!;
    f.write("vite.config.ts","export default {root:'.',resolve:{alias:{'@pages':'./src/pages'}}}");
    assert.equal(readWitnessEvidence(first.snapshot,configWitness).state,"stale");
    const refreshed=driver.analyze(f.root,false);assert.equal(refreshed.mode,"full");
    assert.deepEqual(refreshed.snapshot,typescriptAdapter.analyze(f.root));
  } finally { f.cleanup(); }
});
test("F03: contract rejects binary source masquerading and malformed resource bindings", () => {
  const f = fixture(); try { const s = typescriptAdapter.analyze(f.root); const mutated = structuredClone(s); mutated.analysis.resources[0].encoding = "binary"; assert.throws(()=>validateSnapshot(mutated)); } finally { f.cleanup(); }
});
for (const tuple of ["vite7-react18", "vite8-react19"]) test(`${tuple}: retained controlled build oracle hashes and named runtime module parity`, () => {
  const digest = (text: string | Buffer) => createHash("sha256").update(text).digest("hex");
  const oracle = JSON.parse(readFileSync(new URL(`../../docs/fs-03/evidence/${tuple}-oracle.json`, import.meta.url), "utf8")) as {tuple:string;fixtureHash:string;outputHash:string;modules:{id:string;imports:string[];dynamic:string[]}[]};
  assert.equal(oracle.tuple,tuple);
  assert.equal(oracle.fixtureHash,digest(readFileSync(new URL("../fixtures/framework-support/F03-react-vite/sources.json",import.meta.url))));
  assert.equal(oracle.outputHash,digest(JSON.stringify(oracle.modules)));
  const f = fixture({"package.json":tuple === "vite7-react18" ? sources["package.json"].replace("8.3.3","7.3.7").replaceAll("19.2.8","18.3.1") : sources["package.json"]});
  try {
    const s = typescriptAdapter.analyze(f.root);
    for (const record of oracle.modules.filter(m=>/\.(?:html|tsx)$/.test(m.id))) {
      const expected = [...new Set([...record.imports,...record.dynamic].filter(t=>t.startsWith("src/") && !t.endsWith(".css")))].sort();
      const actual = [...new Set(s.analysis.bindings.filter(b=>b.occurrence.file === record.id && ["module-dependency","entry-point"].includes(b.kind) && b.targetId.startsWith("src/")).map(b=>b.targetId))].sort();
      assert.deepEqual(actual,expected,record.id);
    }
  } finally {f.cleanup();}
});
test("F03: original UTF-16/BOM/CRLF/Unicode witnesses and explicit browser/SSR variants", () => {
  const f=fixture({"src/ssr.tsx":"\uFEFFimport React from 'react';\r\nimport {renderToString} from 'react-dom/server';\r\nimport {App} from './App';\r\nconst marker='😀é';\r\nexport const html=renderToString(<App/>);\r\n"});
  try {
    const s=createTypescriptRefresh({viteModes:["browser-development","browser-production","ssr-production"]}).analyze(f.root,true).snapshot;
    const variants=s.analysis.variants.filter(v=>v.profileId.includes("fs-03/1"));
    assert.deepEqual(variants.map(v=>v.environment),["browser-development","browser-production","ssr-production"]);
    const ssr=variants.find(v=>v.environment==="ssr-production")!;
    assert(s.analysis.bindings.some(b=>b.kind==="entry-point" && b.variantId===ssr.id && b.occurrence.file==="src/ssr.tsx"));
    assert(!s.analysis.bindings.some(b=>b.kind==="entry-point" && b.variantId===ssr.id && b.occurrence.file.endsWith(".html")));
    for (const b of s.analysis.bindings.filter(b=>b.occurrence.file==="src/ssr.tsx")) for (const w of b.witnesses) assert(["rule","current"].includes(readWitnessEvidence(s,w).state));
    assert.deepEqual(deserializeSnapshot(serializeSnapshot(s)),s);
  } finally {f.cleanup();}
});
test("F03: literal aliases preserve runtime/type distinctions and divergent calls stay outside framework traces",()=>{
  const f=fixture({"src/choice.ts":"export function choose(){return 'type';}","src/choice.js":"export function choose(){return 'runtime';}","src/App.tsx":"import React from 'react';import {choose} from './choice';export function handler(){choose();}export function App(){return <button onClick={handler}/>;}"});
  try {
    const s=typescriptAdapter.analyze(f.root),runtime=s.analysis.bindings.find(b=>b.kind==="module-dependency"&&b.occurrence.file==="src/App.tsx")!;
    assert.equal(runtime.targetId,"src/choice.js");
    const call=s.behavior.relations.find(r=>r.relation==="calls"&&r.site.file==="src/App.tsx")!;
    assert.equal(s.behavior.declarations.find(d=>d.id===call.target)?.site.file,"src/choice.ts");
    const trace=traceFramework(s,"index.html",runtime.variantId);
    assert(!trace.steps.some(step=>step.kind==="verified-call"&&step.call.id===call.id));
    assert(s.analysis.gaps.some(g=>g.reason==="ambiguous-target"&&g.occurrence.start===call.site.start));
    f.write("vite.config.ts",`export default {resolve:{alias:{'@view':${JSON.stringify(path.join(f.root,"src/View.tsx").replaceAll("\\","/"))}}}}`);
    f.write("src/main.tsx","import React from 'react';import {createRoot} from 'react-dom/client';import {View} from '@view';createRoot(document.getElementById('root')).render(<View/>);");
    const aliased=typescriptAdapter.analyze(f.root);
    assert(aliased.analysis.bindings.some(b=>b.kind==="module-dependency"&&b.targetId==="src/View.tsx"));
    assert(aliased.analysis.bindings.some(b=>b.kind==="entry-point"&&b.occurrence.file==="src/main.tsx"));
  } finally {f.cleanup();}
});
test("F03: Vite 8 opt-in TS paths resolve separately; Vite 7 never assumes the plugin",()=>{
  const f=fixture({"vite.config.ts":"export default {resolve:{tsconfigPaths:true}}","tsconfig.json":'{"compilerOptions":{"paths":{"@view":["./src/View.tsx"]}}}',"src/main.tsx":"import {View} from '@view';export {View};"});
  try {
    const s=typescriptAdapter.analyze(f.root);assert(s.analysis.bindings.some(b=>b.kind==="module-dependency"&&b.targetId==="src/View.tsx"));
    const nested=path.join(f.root,"node_modules","controlled-root");
    for(const [file,text]of Object.entries({...sources,"vite.config.ts":"export default {resolve:{tsconfigPaths:true}}","tsconfig.json":'{"compilerOptions":{"paths":{"@view":["./src/View.tsx"]}}}',"src/main.tsx":"import {View} from '@view';export {View};"})){mkdirSync(path.dirname(path.join(nested,file)),{recursive:true});writeFileSync(path.join(nested,file),text);}
    const dependencyRoot=typescriptAdapter.analyze(nested);assert(!dependencyRoot.analysis.bindings.some(b=>b.kind==="module-dependency"&&b.occurrence.file==="src/main.tsx"));assert(dependencyRoot.analysis.gaps.some(g=>g.occurrence.file==="src/main.tsx"&&g.reason==="unsupported-syntax"));
    f.write("package.json",sources["package.json"].replace("8.3.3","7.3.7").replaceAll("19.2.8","18.3.1"));
    const old=typescriptAdapter.analyze(f.root);assert(!old.analysis.bindings.some(b=>b.kind==="module-dependency"&&b.occurrence.file==="src/main.tsx"));assert(old.analysis.gaps.some(g=>g.reason==="unsupported-syntax"));
  } finally {f.cleanup();}
});
test("F03: JavaScript/class/memo/forwardRef aliases and inline callbacks retain lexical ownership",()=>{
  const f=fixture({"src/App.jsx":"import React,{memo,forwardRef,useEffect} from 'react';class Panel extends React.Component {render(){return <div/>;}}const Wrapped=memo(function Inner(){return <Panel/>;});const Ref=forwardRef((props,ref)=><input ref={ref}/>);function done(){}export function App(){useEffect(()=>{done();return ()=>done();},[]);return <><Wrapped/><Ref/><button onClick={()=>done()}/></>;}"});
  try {const s=typescriptAdapter.analyze(f.root);assert(s.analysis.bindings.some(b=>b.kind==="component-reference"&&s.behavior.declarations.find(d=>d.id===b.targetId)?.name==="Panel"));assert(s.analysis.bindings.some(b=>b.kind==="event-handler"&&s.behavior.declarations.find(d=>d.id===b.targetId)?.name==="<callback>"));assert(s.analysis.bindings.filter(b=>b.kind==="wrapper").length>=2);assert(s.analysis.bindings.some(b=>b.witnesses.some(w=>w.role==="framework-rule"&&w.ruleId==="react/effect-cleanup")));} finally {f.cleanup();}
});
test("F03: named barrel aliases retain intermediate witnesses and stale barrel changes are detected",()=>{
  const f=fixture({"src/barrel.ts":"export {View as Screen} from './View';","src/main.tsx":"import React from 'react';import {createRoot} from 'react-dom/client';import {Screen} from './barrel';createRoot(document.getElementById('root')).render(<Screen/>);"});
  try {const s=typescriptAdapter.analyze(f.root),binding=s.analysis.bindings.find(b=>b.kind==="entry-point"&&b.occurrence.file==="src/main.tsx")!;const intermediate=binding.witnesses.find(w=>w.role!=="framework-rule"&&w.site.file==="src/barrel.ts")!;assert.equal(readWitnessEvidence(s,intermediate).state,"current");f.write("src/barrel.ts","export {View as Other} from './View';");assert.equal(readWitnessEvidence(s,intermediate).state,"stale");}finally{f.cleanup();}
});
test("F03: developer proxy facts never establish a production origin; rewrites remain exact or unknown",()=>{
  const f=fixture({"vite.config.ts":"export default {server:{proxy:{'/api':{target:'http://localhost:8000/base',rewrite:path=>path.replace(/^\\/api/,'')},'/dynamic':{target:'http://localhost:9000',rewrite:helper}}}}"});
  try {const s=typescriptAdapter.analyze(f.root),proxies=s.analysis.developmentProxies!;assert.equal(proxies.length,2);assert.deepEqual(proxies[0].rewrite,{state:"prefix",from:"/api",to:""});assert.equal(proxies[0].targetOrigin,"http://localhost:8000");assert.equal(proxies[0].targetBasePath,"/base");assert.equal(proxies[1].rewrite.state,"unknown");assert(proxies.every(p=>p.scope==="development"));assert.equal(s.analysis.assumptions.length,0);assert.deepEqual(deserializeSnapshot(serializeSnapshot(s)),s);for(const p of proxies) for(const w of p.witnesses) assert.equal(readWitnessEvidence(s,w).state,"current");}finally{f.cleanup();}
});
test("F03: HTML comments/raw text/templates/duplicate attributes never create guessed entries",()=>{
  const html="<!--<script type='module' src='/hidden.ts'></script>--><textarea><script type='module' src='/text.ts'></script></textarea><template><script type='module' src='/inert.ts'></script></template><script type='module' src='/a.ts' src='/b.ts'></script><script type=module src=/real.ts></script>";
  const records=htmlModuleScripts(html);assert.deepEqual(records.filter(r=>!r.ambiguous).map(r=>r.src),["/real.ts"]);assert.equal(records.filter(r=>r.ambiguous).length,2);
});
test("F03: configuration execution/egress, escaped aliases and symlinks remain denied",()=>{
  const f=fixture({"vite.config.ts":"import {writeFileSync} from 'node:fs';writeFileSync('must-not-run','bad');export default {};"});
  try {
    typescriptAdapter.analyze(f.root);assert(!existsSync(path.join(f.root,"must-not-run")));
    f.write("vite.config.ts","export default {resolve:{alias:{'@outside':'../../outside'}}}");f.write("src/main.tsx","import value from '@outside';export {value};");assert(!typescriptAdapter.analyze(f.root).analysis.bindings.some(b=>b.kind==="module-dependency"&&b.occurrence.file==="src/main.tsx"));
    symlinkSync(path.join(f.root,"src/View.tsx"),path.join(f.root,"src/linked.tsx"));f.write("src/main.tsx","import {View} from './linked';export {View};");assert(!typescriptAdapter.analyze(f.root).analysis.bindings.some(b=>b.targetId==="src/linked.tsx"));
  } finally {f.cleanup();}
});
test("F03: aliased React implementation and reassigned exported handlers cannot create framework facts",()=>{
  const f=fixture({"vite.config.ts":"export default {resolve:{alias:{react:'./shim'}}}","src/shim.ts":"export function useEffect(){}"});
  try {const s=typescriptAdapter.analyze(f.root);assert(!s.analysis.bindings.some(b=>["event-handler","lifecycle","component-reference"].includes(b.kind)));f.write("vite.config.ts","export default {}");f.write("src/View.tsx","import React from 'react';export function View(){return <div/>;}View=other;");const reassigned=typescriptAdapter.analyze(f.root);assert(!reassigned.analysis.bindings.some(b=>b.kind==="component-reference"&&reassigned.behavior.declarations.find(d=>d.id===b.targetId)?.name==="View"));}finally{f.cleanup();}
});
test("F03: retained accepted FS-02 v3 payload remains byte/canonical compatible",()=>{
  const bytes=gunzipSync(readFileSync(new URL("../../docs/fs-02/evidence/baseline-snapshot.json.gz",import.meta.url))).toString("utf8").replace(/^\uFEFF/,"");
  const s=deserializeSnapshot(bytes);assert.equal(s.version,3);assert.equal(snapshotJson(deserializeSnapshot(serializeSnapshot(s))),snapshotJson(s));assert.equal(s.analysis.developmentProxies,undefined);
});

test("F03: adapter fact budget is generation-local and cancellation never returns a partial snapshot",()=>{
  const f=fixture();try{
    const first=typescriptAdapter.analyze(f.root),lastComplete=serializeSnapshot(first);
    for(let n=0;n<20000;n++)frameworkFact(first,"budget-only.ts");
    assert.throws(()=>frameworkFact(first,"budget-only.ts"),(error:unknown)=>error instanceof AnalysisBoundaryError && error.reason === "resource-limit");
    assert.equal(serializeSnapshot(first),lastComplete);
    const fresh=structuredClone(first);assert.doesNotThrow(()=>frameworkFact(fresh,"budget-only.ts"));
    const controller=new AbortController();controller.abort();
    assert.throws(()=>createTypescriptRefresh({signal:controller.signal}).analyze(f.root,true),(error:unknown)=>error instanceof AnalysisBoundaryError && error.reason === "cancelled");
  }finally{f.cleanup();}
});

test("F03: React DOM version mismatch and shadowed classic JSX factory withhold roots",()=>{
  const f=fixture({"package.json":sources["package.json"].replace('"react-dom":"19.2.8"','"react-dom":"18.3.1"')});
  try {
    // Use parsed metadata replacement so fixture formatting cannot hide the mismatch.
    const pkg=JSON.parse(sources["package.json"]);pkg.dependencies["react-dom"]="18.3.1";f.write("package.json",JSON.stringify(pkg));
    const mismatch=typescriptAdapter.analyze(f.root);assert(!mismatch.analysis.bindings.some(b=>b.kind==="entry-point" && b.occurrence.file==="src/main.tsx"));
    pkg.dependencies.vite="7.3.7";pkg.dependencies.react="18.3.1";f.write("package.json",JSON.stringify(pkg));
    f.write("src/View.tsx","import React from 'react';export function View(React){return <button onClick={()=>save()}/>;}function save(){}");
    const shadow=typescriptAdapter.analyze(f.root);assert(!shadow.analysis.bindings.some(b=>b.kind==="event-handler" && b.occurrence.file==="src/View.tsx"));
  }finally{f.cleanup();}
});

test("F03: custom proxy request hooks and worker queries on assets remain boundaries",()=>{
  const f=fixture({"vite.config.ts":"export default {server:{proxy:{'/api':{target:'http://localhost:8000',configure:proxy=>configure(proxy)}}}}","src/main.tsx":"import worker from './logo.svg?worker';export {worker};"});
  try{const s=typescriptAdapter.analyze(f.root);assert.equal(s.analysis.developmentProxies,undefined);assert(!s.analysis.bindings.some(b=>b.kind==="worker"));assert(s.analysis.gaps.some(g=>g.occurrence.file==="src/main.tsx"&&g.reason==="unsupported-syntax"));}finally{f.cleanup();}
});

test("F03: production HTML entry selection never guesses custom build inputs",()=>{
  const f=fixture();try{
    const analyze=()=>createTypescriptRefresh({viteModes:["browser-production"]}).analyze(f.root,true).snapshot;
    const defaults=analyze();assert(defaults.analysis.bindings.some(b=>b.kind==="entry-point"&&b.occurrence.file==="index.html"));assert(!defaults.analysis.bindings.some(b=>b.kind==="entry-point"&&b.occurrence.file==="admin.html"));
    f.write("vite.config.ts","export default {build:{rollupOptions:{input:{admin:'admin.html'}}}}");
    const custom=analyze();assert(custom.analysis.bindings.some(b=>b.kind==="entry-point"&&b.occurrence.file==="admin.html"));assert(!custom.analysis.bindings.some(b=>b.kind==="entry-point"&&b.occurrence.file==="index.html"));
    f.write("vite.config.ts","export default {build:{rollupOptions:{input:process.env.ENTRY}}}");
    const dynamic=analyze();assert(!dynamic.analysis.bindings.some(b=>b.kind==="entry-point"&&b.occurrence.file.endsWith(".html")));assert(dynamic.analysis.gaps.some(g=>g.reason==="unsupported-syntax"));
  }finally{f.cleanup();}
});

test("F03: aliased React DOM subpath cannot be mistaken for the qualified platform root API",()=>{
  const f=fixture({"vite.config.ts":"export default {resolve:{alias:{'react-dom/client':'./src/shim.ts'}}}","src/shim.ts":"export function createRoot(){return {render(){}}}"});
  try{const s=typescriptAdapter.analyze(f.root);assert(!s.analysis.bindings.some(b=>b.kind==="entry-point"&&b.occurrence.file==="src/main.tsx"));assert(s.analysis.gaps.some(g=>g.reason==="custom-resolver"));}finally{f.cleanup();}
});

test("F03: above-limit syntax and glob sets emit resource gaps without truncated framework facts",()=>{
  const f=fixture({"src/large.ts":Array.from({length:15000},(_,n)=>`export const n${n}=${n};`).join("\n"),"src/main.tsx":`const modules=import.meta.glob(${JSON.stringify(Array.from({length:101},(_,n)=>`./glob${n}/*.tsx`))});`});
  try{const s=typescriptAdapter.analyze(f.root);assert(s.files.some(file=>file.path==="src/large.ts"));assert(!s.analysis.bindings.some(b=>b.occurrence.file==="src/large.ts"));for(const file of ["src/large.ts","src/main.tsx"])assert(s.analysis.gaps.some(g=>g.reason==="resource-limit"&&g.occurrence.file===file));}finally{f.cleanup();}
});

test("F03: invalid UTF-8 preserves legacy decoding but explicitly excludes new framework facts",()=>{
  const f=fixture();try{
    writeFileSync(path.join(f.root,"src/invalid.tsx"),Buffer.concat([Buffer.from("export function Invalid(){return <div>"),Buffer.from([255]),Buffer.from("</div>}\n")]));
    const s=typescriptAdapter.analyze(f.root);assert(s.files.some(file=>file.path==="src/invalid.tsx"));assert(!s.analysis.bindings.some(b=>b.occurrence.file==="src/invalid.tsx"));assert(s.analysis.gaps.some(g=>g.occurrence.file==="src/invalid.tsx"&&g.reason==="unsupported-encoding"));
  }finally{f.cleanup();}
});
