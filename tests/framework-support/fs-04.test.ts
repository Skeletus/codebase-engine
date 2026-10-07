import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import {tmpdir} from "node:os";
import {mkdtempSync,readFileSync,writeFileSync,mkdirSync,rmSync,realpathSync} from "node:fs";
import {createTypescriptRefresh} from "../../lib/engine/adapters/typescript.ts";
import {serializeSnapshot,deserializeSnapshot} from "../../lib/engine/contract.ts";
import {readWitnessEvidence} from "../../lib/engine/index.ts";
import {traceFramework} from "../../lib/engine/behavior.ts";
import {createHash} from "node:crypto";
import {GenerationBoundary,AnalysisBoundaryError} from "../../lib/engine/boundary.ts";
import {SqliteAnalysisStore} from "../../lib/storage/sqlite.ts";
import {factId} from "../../lib/model/framework.ts";
import type {NodeMode} from "../../lib/parser/adapters/node-profile.ts";
import {nextMatcher} from "../../lib/parser/adapters/next-behavior.ts";
import {matchesNavigation} from "../../lib/parser/adapters/react-router.ts";
const original=JSON.parse(readFileSync(new URL("../fixtures/framework-support/F04-node-next/fixture.json",import.meta.url),"utf8")).sources as Record<string,string>;
const oracles=JSON.parse(readFileSync(new URL("../../docs/fs-04/evidence/next-oracles.json",import.meta.url),"utf8")) as {tuple:string;profile:string;routes:{file:string;pattern:string}[]}[];
const native=JSON.parse(readFileSync(new URL("../fixtures/framework-support/F04-node-next/node.json",import.meta.url),"utf8")).sources as Record<string,string>;
test("F04 pinned route and rewrite matcher parity",()=>{
  const records=JSON.parse(readFileSync(new URL("../../docs/fs-04/evidence/next-oracles.json",import.meta.url),"utf8")) as {matcherCases:{pattern:string;tests:{destination:string;matches:boolean}[]}[];rewriteCases:{pattern:string;tests:{destination:string;matches:boolean}[]}[]}[];
  assert.equal(records.length,9);
  for(const record of records)for(const [cases,caseSensitive] of [[record.matcherCases,true],[record.rewriteCases,false]] as const)for(const item of cases){const matcher=nextMatcher(item.pattern);assert(matcher?.state==="supported");for(const check of item.tests)assert.equal(matchesNavigation({...matcher,caseSensitive},check.destination),check.matches);}
});
function fixture(sources=original){const root=realpathSync(mkdtempSync(path.join(tmpdir(),"cartograph FS04 ")));for(const [file,text]of Object.entries(sources)){mkdirSync(path.dirname(path.join(root,file)),{recursive:true});writeFileSync(path.join(root,file),text);}return {root,cleanup(){rmSync(root,{recursive:true,force:true});}};}
for(const [version,tuple]of [["15.5.27","next15"],["16.3.6","next16-preservation"],["16.3.8","next16-patch"]])for(const mode of ["node-development","node-production","browser"] as NodeMode[])test(`F04 ${tuple}/${mode}: routes, actions, witnesses and incremental roundtrip`,()=>{
  const sources={...original,"package.json":original["package.json"].replace("16.3.8",version).replace("24.19.0",version==="15.5.27" ? "22.23.3" : "24.19.0")},f=fixture(sources);try{
    const driver=createTypescriptRefresh({nodeModes:[mode]}),s=driver.analyze(f.root,true).snapshot,v=s.analysis.variants.find(v=>v.resolverId==="next-runtime")!;assert(v);assert.equal(v.environment,mode);
    const oracle=oracles.find(o=>o.tuple===tuple&&o.profile===mode);assert(oracle);for(const route of oracle.routes)assert(s.analysis.registrations.some(r=>r.variantId===v.id&&r.occurrence.file===route.file&&r.rawPattern===route.pattern));
    assert(s.analysis.registrations.some(r=>r.variantId===v.id && r.rawPattern==="/base/api/items/[id]" && r.methodState?.state==="known" && r.methodState.values.includes("GET")));
    assert(s.analysis.registrations.some(r=>r.variantId===v.id && r.conditions.includes("derived-from:GET")));
    assert(s.analysis.registrations.some(r=>r.variantId===v.id && r.conditions.includes("derived:auto-OPTIONS") && r.handlerId===null));
    assert(s.analysis.registrations.some(r=>r.variantId===v.id && r.rawPattern==="/base/products/[...slug]"));
    assert(!s.analysis.registrations.some(r=>r.rawPattern.includes("_private") || r.rawPattern.includes("(.)")));
    assert(s.analysis.bindings.some(r=>r.variantId===v.id && r.kind==="server-action" && r.occurrence.file==="app/page.tsx"));
    const action=s.behavior.declarations.find(d=>d.name==="save")!,persist=s.behavior.declarations.find(d=>d.name==="persist"&&d.site.file==="lib/service.ts")!;
    const trace=traceFramework(s,"app/page.tsx",v.id,12,200);assert(trace.steps.some(x=>x.kind==="framework-binding"&&x.binding.kind==="server-action"));assert(trace.steps.some(x=>x.kind==="verified-call"&&x.call.source===action.id&&x.call.target===persist.id));
    const client=s.behavior.declarations.find(d=>d.name==="click")!;assert(trace.steps.some(x=>x.kind==="framework-binding"&&x.binding.targetId===client.id));assert(!trace.steps.some(x=>x.kind==="verified-call"&&x.call.source===client.id&&x.call.target===action.id));
    assert(s.analysis.gaps.some(g=>g.variantId===v.id&&g.reason==="external-boundary"&&g.occurrence.file==="app/Button.tsx"));
    for(const binding of s.analysis.bindings)for(const w of binding.witnesses)assert(["current","rule"].includes(readWitnessEvidence(s,w).state));
    assert.deepEqual(deserializeSnapshot(serializeSnapshot(s)),s);assert.deepEqual(driver.analyze(f.root,false).snapshot,s);
  }finally{f.cleanup();}
});
for(const [tuple,version]of [["node22","22.23.3"],["node24","24.19.0"]])for(const mode of ["node-development","node-production"] as NodeMode[])test(`F04 ${tuple}/${mode}: native resolution oracle and registration parity`,()=>{
  const bytes=readFileSync(new URL("../../docs/fs-04/evidence/node-oracles.json",import.meta.url)),records=JSON.parse(bytes.toString()) as {node:string;fixtureHash:string;importTargets:string[];requireTargets:{specifier:string;target?:string;error?:string}[]}[],record=records.find(r=>r.node===version)!;assert(record);assert.equal(record.fixtureHash,createHash("sha256").update(readFileSync(new URL("../fixtures/framework-support/F04-node-next/node.json",import.meta.url))).digest("hex"));
  const f=fixture({...native,"package.json":native["package.json"].replace("24.19.0",version)});try{const s=createTypescriptRefresh({nodeModes:[mode]}).analyze(f.root,true).snapshot,v=s.analysis.variants.find(v=>v.resolverId==="node-runtime")!;const imports=s.analysis.bindings.filter(b=>b.variantId===v.id&&b.kind==="module-dependency"&&b.occurrence.file==="main.mjs");assert.deepEqual(imports.map(b=>b.targetId),record.importTargets);assert.equal(s.analysis.bindings.filter(b=>b.kind==="module-dependency"&&b.occurrence.file==="main.cjs").length,record.requireTargets.filter(r=>r.target).length);assert(record.requireTargets.some(r=>r.specifier==="./cjs"&&r.error==="MODULE_NOT_FOUND"));for(const kind of ["worker","event-handler","operation","entry-point","module-export"])assert(s.analysis.bindings.some(b=>b.kind===kind));}finally{f.cleanup();}
});
test("F04 pages dispatch, config order/conditions and version-specific proxy declarations",()=>{
  const f=fixture({...original,"next.config.ts":"export default {basePath:'/base',async rewrites(){return {beforeFiles:[{source:'/old',destination:'/new',has:[{type:'header',key:'x-test',value:'yes'}]}],afterFiles:[{source:'/later',destination:'https://example.test/path'}],fallback:[{source:'/last',destination:'/target'}]}},redirects(){return [{source:'/gone',destination:'/new',permanent:true}]}};","proxy.ts":"export function proxy(request){return null}export const config={matcher:['/protected','/dynamic/:path*']};"});try{
    const s=createTypescriptRefresh().analyze(f.root,true).snapshot,v=s.analysis.variants.find(v=>v.resolverId==="next-runtime")!;
    const rules=s.analysis.registrations.filter(r=>r.variantId===v.id&&r.conditions.some(c=>c.startsWith("next-config:")));assert.equal(rules.length,4);assert.deepEqual(rules.filter(r=>r.conditions.includes("next-config:rewrites")).map(r=>r.precedence),[0,1,2]);assert(rules.some(r=>r.conditions.includes("destination:https://example.test/path")));
    assert(s.analysis.registrations.some(r=>r.variantId===v.id&&r.rawPattern==="/base/api/legacy"&&r.methodState?.state==="known"&&r.methodState.values.includes("POST")&&r.conditions.includes("pages-api:conditional-branch")));
    assert(s.analysis.registrations.some(r=>r.variantId===v.id&&r.rawPattern==="/base/api/legacy"&&r.methodState?.state==="unknown"));
    assert(s.analysis.registrations.some(r=>r.variantId===v.id&&r.conditions.includes("next-convention:proxy")));
    assert(s.analysis.registrations.some(r=>r.variantId===v.id&&r.occurrence.file==="proxy.ts"&&r.matcher.state==="supported"&&r.matcher.segments.some(s=>s.kind==="catchAll")));
  }finally{f.cleanup();}
});
test("F04 inline actions, ambiguous props and version drift stay evidence-bound",()=>{
  for(const [source,expected] of [["export default function Page(){async function save(){'use server';return 1}return <form action={save}/>}",true],["export default function Page(){async function save(){'use server';return 1}return <form {...props} action={save}/>}",false]] as const){const f=fixture({...original,"app/page.tsx":source});try{const s=createTypescriptRefresh().analyze(f.root,true).snapshot;assert.equal(s.analysis.bindings.some(b=>b.kind==="server-action"&&b.occurrence.file==="app/page.tsx"&&b.witnesses.some(w=>w.role==="framework-rule"&&w.ruleId==="next/form-action-framework-boundary")),expected);}finally{f.cleanup();}}
  const f=fixture({...original,"package.json":original["package.json"].replaceAll("19.2.8","18.3.1")});try{const snapshot=createTypescriptRefresh().analyze(f.root,true).snapshot;assert(snapshot.analysis.capabilities.some(c=>c.capabilityId==="next-runtime"&&c.tupleId==="unqualified"&&c.state==="partial"&&c.qualificationRecord===null));const ids=new Set(snapshot.analysis.variants.filter(v=>v.resolverId==="next-runtime").map(v=>v.id));assert(!snapshot.analysis.bindings.some(b=>ids.has(b.variantId)));}finally{f.cleanup();}
});
test("F04 Node runtime: ESM exact extension, require search, package conditions and builtins remain separate from TS aliases",()=>{
  const f=fixture({"package.json":JSON.stringify({name:"node-fixture",type:"module",engines:{node:"24.19.0"},exports:{"./selected":{import:"./esm.js",require:"./cjs.cjs"}},imports:{"#local":"./esm.js"}}),"main.mjs":"import x from './esm.js';import y from './esm';import z from 'node-fixture/selected';import w from '#local';import fs from 'node:fs';","main.cjs":"const x=require('./cjs');const y=require('node-fixture/selected');","esm.js":"export default 1;","cjs.cjs":"module.exports=1;"});try{
    const s=createTypescriptRefresh().analyze(f.root,true).snapshot,v=s.analysis.variants.find(v=>v.resolverId==="node-runtime")!;assert(v);
    const deps=s.analysis.bindings.filter(b=>b.variantId===v.id&&b.kind==="module-dependency");assert.equal(deps.filter(d=>d.occurrence.file==="main.mjs").length,3);assert.equal(deps.filter(d=>d.targetId==="cjs.cjs").length,1);assert(s.analysis.gaps.some(g=>g.reason==="external-boundary"));assert(s.analysis.gaps.some(g=>g.reason==="missing-metadata"&&g.occurrence.file==="main.cjs"));
  }finally{f.cleanup();}
});
test("F04 unknown Next version and dynamic configuration cannot qualify new routes",()=>{
  const changes:Record<string,string>[]=[{"package.json":original["package.json"].replace("16.3.8","^16.3.8")},{"next.config.ts":"export default buildConfig();"}];
  for(const change of changes){const f=fixture({...original,...change});try{const s=createTypescriptRefresh().analyze(f.root,true).snapshot;assert(!s.analysis.registrations.some(r=>r.variantId.includes("fs-04/1")));assert(s.analysis.gaps.some(g=>["missing-metadata","custom-resolver"].includes(g.reason)));}finally{f.cleanup();}}
});
test("F04 Node registrations and unique CommonJS exports reject mutated receivers/exports",()=>{
  const files={"package.json":JSON.stringify({type:"module",engines:{node:"24.19.0"},bin:{cli:"./server.mjs"},scripts:{start:"node server.mjs"}}),"server.mjs":"import {createServer} from 'node:http';import {EventEmitter} from 'node:events';import {Worker} from 'node:worker_threads';function handler(){}const server=createServer(handler);server.listen(3000);const events=new EventEmitter();events.on('ready',handler);new Worker(new URL('./worker.mjs',import.meta.url));","worker.mjs":"export const answer=42;","exports.cjs":"function handler(){}module.exports={handler};","mutable.cjs":"function handler(){}exports.handler=handler;exports.handler=other;"};
  const f=fixture(files);try{const s=createTypescriptRefresh().analyze(f.root,true).snapshot;for(const kind of ["event-handler","operation","worker","module-export","entry-point"])assert(s.analysis.bindings.some(b=>b.kind===kind),kind);assert(!s.analysis.bindings.some(b=>b.kind==="module-export"&&b.occurrence.file==="mutable.cjs"));assert(s.analysis.gaps.some(g=>g.reason==="ambiguous-target"&&g.occurrence.file==="mutable.cjs"));}finally{f.cleanup();}
});
test("F04 mutated request dispatch and unresolved explicit HEAD cannot become framework-derived methods",()=>{
  const f=fixture({...original,"pages/api/legacy.ts":"export default function handler(req,res){req.method='POST';if(req.method==='POST'){return 1}}","app/api/items/[id]/route.ts":"export function GET(){return 1}export let HEAD=unknown;"});try{
    const s=createTypescriptRefresh().analyze(f.root,true).snapshot,v=s.analysis.variants.find(v=>v.resolverId==="next-runtime")!;
    assert(!s.analysis.registrations.some(r=>r.variantId===v.id&&r.occurrence.file==="pages/api/legacy.ts"&&r.methodState?.state==="known"));
    assert(!s.analysis.registrations.some(r=>r.variantId===v.id&&r.conditions.includes("derived-from:GET")));
  }finally{f.cleanup();}
});
test("F04 native Node ignores tsconfig paths while Next uses a protected one-target path",()=>{
  const f=fixture({...original,"tsconfig.json":JSON.stringify({compilerOptions:{baseUrl:".",paths:{"@service":["lib/service.ts"]}}}),"app/actions.ts":"'use server';import {persist} from '@service';export async function save(){return persist()}"});try{const s=createTypescriptRefresh().analyze(f.root,true).snapshot;assert(s.analysis.bindings.some(b=>b.kind==="module-dependency"&&b.occurrence.file==="app/actions.ts"&&b.targetId==="lib/service.ts"));}finally{f.cleanup();}
});
test("F04 literal interception records soft navigation context; literal Link has unique route evidence",()=>{
  const f=fixture({...original,"app/page.tsx":"import Link from 'next/link';export default function Page(){return <Link href='/base/products/item'>Go</Link>}"});try{const s=createTypescriptRefresh().analyze(f.root,true).snapshot,v=s.analysis.variants.find(v=>v.resolverId==="next-runtime")!;const intercepted=s.analysis.registrations.find(r=>r.variantId===v.id&&r.occurrence.file.includes("(.)"))!;assert(intercepted.conditions.includes("requires:soft-navigation"));assert.equal(intercepted.rawPattern,"/base/photo/[id]");assert(s.analysis.bindings.some(b=>b.kind==="navigation"&&b.occurrence.file==="app/page.tsx"));}finally{f.cleanup();}
});
test("F04 custom pageExtensions, source ownership, lifecycle exports and imperative navigation",()=>{
  const f=fixture({...original,"next.config.ts":"export default {pageExtensions:['page.tsx','page.ts'],basePath:'/base'};","app/page.page.tsx":"'use client';import {useRouter} from 'next/navigation';export default function Page(){const router=useRouter();function click(){router.push('/base/destination')}return <button onClick={click}/>}","app/destination/page.page.tsx":"export default function Target(){return <div/>}export async function generateMetadata(){return {title:'x'}}","proxy.page.ts":"export function proxy(){return null}export const config={matcher:'/protected'};"});try{const s=createTypescriptRefresh().analyze(f.root,true).snapshot,v=s.analysis.variants.find(v=>v.resolverId==="next-runtime")!;assert(s.analysis.registrations.some(r=>r.variantId===v.id&&r.rawPattern==="/base/destination"));assert(!s.analysis.registrations.some(r=>r.variantId===v.id&&r.occurrence.file==="app/page.tsx"));assert(s.analysis.bindings.some(b=>b.kind==="navigation"&&b.occurrence.file==="app/page.page.tsx"));assert(s.analysis.bindings.some(b=>b.kind==="lifecycle"&&b.occurrence.file==="app/destination/page.page.tsx"));assert(s.analysis.registrations.some(r=>r.variantId===v.id&&r.occurrence.file==="proxy.page.ts"));}finally{f.cleanup();}
});
test("F04 config is never executed and nonerasable native TS remains unresolved",()=>{
  const f=fixture({...native,"main.mjs":"import value from './enum.ts';import escape from '../outside.ts';","enum.ts":"enum E {A};export default E;","next.config.ts":"globalThis.__FS04_EXECUTED=true;export default getConfig();"});try{const s=createTypescriptRefresh().analyze(f.root,true).snapshot;assert(!s.analysis.bindings.some(b=>b.kind==="module-dependency"&&b.targetId==="enum.ts"));assert(s.analysis.gaps.some(g=>g.reason==="unsupported-syntax"));assert(s.analysis.gaps.some(g=>g.reason==="policy-denied"));assert.equal(Reflect.get(globalThis,"__FS04_EXECUTED"),undefined);}finally{f.cleanup();}
});
test("F04 original BOM/CRLF/Unicode witnesses and action alias retain exact ranges",()=>{
  const f=fixture({...original,"app/page.tsx":"\ufeffimport {save} from './actions';\r\nconst alias=save;\r\nexport default function Page(){return <form action={alias}>ñ😀</form>}\r\n"});try{const s=createTypescriptRefresh().analyze(f.root,true).snapshot;assert(s.analysis.bindings.some(b=>b.kind==="server-action"&&b.occurrence.file==="app/page.tsx"));for(const binding of s.analysis.bindings)for(const w of binding.witnesses)assert(["current","rule"].includes(readWitnessEvidence(s,w).state));}finally{f.cleanup();}
});
test("F04 derived methods have distinct occurrences and endpoint aliases trace to a service",()=>{
  for(const body of ["export function GET(){return 1}","import {persist} from '../../../../lib/service';export const GET=()=>persist();export {GET as POST};"]){const f=fixture({...original,"app/api/items/[id]/route.ts":body});try{const s=createTypescriptRefresh().analyze(f.root,true).snapshot,v=s.analysis.variants.find(v=>v.resolverId==="next-runtime")!;const methods=s.analysis.registrations.filter(r=>r.variantId===v.id&&r.rawPattern==="/base/api/items/[id]"&&r.methodState?.state==="known").flatMap(r=>r.methodState?.values??[]);assert(methods.includes("GET"));assert(methods.includes("HEAD"));assert(methods.includes("OPTIONS"));if(body.includes("persist")){assert(methods.includes("POST"));assert(traceFramework(s,"app/api/items/[id]/route.ts",v.id,12,200).steps.some(step=>step.kind==="verified-call"&&s.behavior.declarations.find(d=>d.id===step.call.target)?.name==="persist"));}}finally{f.cleanup();}}
});
test("F04 active cancellation/deadline inside Node/Next preserves stored generation and recovers",()=>{
  const f=fixture(),originalCheck=GenerationBoundary.prototype.check,store=new SqliteAnalysisStore(path.join(f.root,"analysis.sqlite"));try{
    const first=createTypescriptRefresh().analyze(f.root,true).snapshot,repo=store.register(f.root);store.begin(repo.repositoryId,"good");store.publish(repo.repositoryId,"good",first);
    for(const reason of ["cancelled","resource-limit"] as const){let checks=0,hit=false,clock=0;const controller=new AbortController(),deadline=new GenerationBoundary(undefined,1,()=>clock);GenerationBoundary.prototype.check=function(){if(new Error().stack?.includes("node-next.ts")&&++checks===20){hit=true;if(reason==="cancelled")controller.abort();else{clock=2;originalCheck.call(deadline);}}originalCheck.call(this);};assert.throws(()=>createTypescriptRefresh({signal:controller.signal}).analyze(f.root,true),(error:unknown)=>error instanceof AnalysisBoundaryError&&error.reason===reason);assert(hit);GenerationBoundary.prototype.check=originalCheck;assert.deepEqual(store.load(repo.repositoryId),first);assert.deepEqual(createTypescriptRefresh().analyze(f.root,true).snapshot,first);}
  }finally{GenerationBoundary.prototype.check=originalCheck;store.close();f.cleanup();}
});
test("F04 shared snapshot rejects noncallable action targets",()=>{
  const f=fixture();try{const s=createTypescriptRefresh().analyze(f.root,true).snapshot,b=s.analysis.bindings.find(b=>b.kind==="server-action")!;b.targetId=b.occurrence.file;b.id=factId("binding:server-action",b.occurrence,b.variantId,b.targetId);assert.throws(()=>serializeSnapshot(s),/Noncallable framework binding/);}finally{f.cleanup();}
});
test("F04 Middleware runtime and mutable Link stay explicit boundaries",()=>{
  const sources={...original,"package.json":original["package.json"].replace("16.3.8","15.5.27").replace("24.19.0","22.23.3"),"middleware.ts":"export function middleware() {} export const config = {matcher: '/products/:path*'};","app/mutable.tsx":"import Link from 'next/link'; Link = replacement; export default function Mutable(){return <Link href='/base'/>}"};
  const f=fixture(sources);try{const s=createTypescriptRefresh().analyze(f.root,true).snapshot;assert(s.analysis.registrations.some(r=>r.occurrence.file==="middleware.ts"&&r.conditions.includes("runtime:edge")&&r.conditions.includes("implementation:unqualified-edge-boundary")));assert(s.analysis.gaps.some(g=>g.occurrence.file==="middleware.ts"&&g.reason==="variant-not-selected"));assert(!s.analysis.bindings.some(b=>b.occurrence.file==="app/mutable.tsx"&&b.kind==="navigation"));}finally{f.cleanup();}
});
test("F04 convention entries, Pages switch dispatch, re-exports and marker/lifecycle operations",()=>{
  const extra:Record<string,string>={"pages/api/switch.ts":"export default function dispatch(req,res){switch(req.method){case 'GET': return res.end();case 'POST': return res.end();default:return res.end()}}","pages/_app.tsx":"export default function App({Component,pageProps}){return <Component {...pageProps}/>} ","app/api/alias/route.ts":"export {persist as POST} from '../../../lib/service';","app/marker.ts":"'use client';import 'server-only';export function marker(){}","app/operations.ts":"import {revalidatePath,revalidateTag} from 'next/cache';import {redirect} from 'next/navigation';export function operations(){revalidatePath('/base');revalidateTag('item');redirect('/base')}","app/metadata/page.tsx":"export default function Metadata(){return <div/>}export function generateMetadata(){return {title:'x'}}export function generateStaticParams(){return []}export function generateViewport(){return {width:'device-width'}}"};
  for(const name of ["template","loading","error","global-error","not-found","sitemap","robots","manifest","icon","apple-icon","opengraph-image","twitter-image"])extra[`app/${name}.tsx`]=`export default function Entry(){return <div/>}`;
  const f=fixture({...original,...extra});try{const s=createTypescriptRefresh().analyze(f.root,true).snapshot,v=s.analysis.variants.find(v=>v.resolverId==="next-runtime")!;
    for(const file of Object.keys(extra).filter(f=>f.endsWith(".tsx")&&!f.endsWith("page.tsx")))assert(s.analysis.bindings.some(b=>b.variantId===v.id&&b.kind==="entry-point"&&b.occurrence.file===file),file);
    const methods=s.analysis.registrations.filter(r=>r.variantId===v.id&&r.occurrence.file==="pages/api/switch.ts");assert(methods.some(r=>r.methodState?.state==="unknown"));for(const method of ["GET","POST"])assert(methods.some(r=>r.methodState?.state==="known"&&r.methodState.values.includes(method)&&r.conditions.includes("pages-api:conditional-case")));
    assert(s.analysis.registrations.some(r=>r.variantId===v.id&&r.occurrence.file==="app/api/alias/route.ts"&&r.methodState?.state==="known"&&r.methodState.values.includes("POST")));
    assert(s.analysis.gaps.some(g=>g.variantId===v.id&&g.occurrence.file==="app/marker.ts"&&g.reason==="variant-not-selected"));
    for(const name of ["generateMetadata","generateStaticParams","generateViewport"])assert(s.analysis.bindings.some(b=>b.variantId===v.id&&b.kind==="lifecycle"&&b.witnesses.some(w=>w.role==="framework-rule"&&w.ruleId===`next/${name}`)));
    assert.equal(s.analysis.bindings.filter(b=>b.variantId===v.id&&b.kind==="operation"&&b.occurrence.file==="app/operations.ts").length,3);
  }finally{f.cleanup();}
});
test("F04 CJS re-export, duplicate global aliases and conditional assignment boundaries",()=>{
  const f=fixture({...native,"reexport.cjs":"module.exports = require('./cjs.cjs');","duplicate.cjs":"function first(){}function second(){}exports.handler=first;module.exports.handler=second;","conditional.cjs":"function first(){}for(let i=0;i<1;i++){exports.handler=first}"});try{const s=createTypescriptRefresh().analyze(f.root,true).snapshot;assert(s.analysis.bindings.some(b=>b.kind==="module-export"&&b.occurrence.file==="reexport.cjs"&&b.targetId==="cjs.cjs"));for(const file of ["duplicate.cjs","conditional.cjs"])assert(!s.analysis.bindings.some(b=>b.kind==="module-export"&&b.occurrence.file===file));assert(s.analysis.gaps.some(g=>g.occurrence.file==="duplicate.cjs"&&g.reason==="ambiguous-target"));assert(s.analysis.gaps.some(g=>g.occurrence.file==="conditional.cjs"&&g.reason==="unsupported-syntax"));}finally{f.cleanup();}
});
test("F04 native TS erasure oracle and type-only runtime exclusion",()=>{
  const records=JSON.parse(readFileSync(new URL("../../docs/fs-04/evidence/node-erasure-oracles.json",import.meta.url),"utf8")) as {node:string;cases:{source:string;accepted:boolean;expected:boolean}[]}[];assert.equal(records.length,2);
  for(const record of records){assert(record.cases.every(c=>c.accepted===c.expected));const positive=record.cases.find(c=>c.accepted)!,negative=record.cases.find(c=>!c.accepted)!,f=fixture({"package.json":JSON.stringify({type:"module",engines:{node:record.node},bin:{cli:"./typed.ts",bad:"./enum.ts"}}),"typed.ts":positive.source,"enum.ts":negative.source});try{const s=createTypescriptRefresh().analyze(f.root,true).snapshot;assert(s.analysis.bindings.some(b=>b.kind==="entry-point"&&b.targetId==="typed.ts"));assert(!s.analysis.bindings.some(b=>b.kind==="module-dependency"&&b.occurrence.file==="typed.ts"));assert(!s.analysis.bindings.some(b=>b.targetId==="enum.ts"));assert(s.analysis.gaps.some(g=>g.occurrence.file==="enum.ts"&&g.reason==="unsupported-syntax"));}finally{f.cleanup();}}
});
test("F04 native profiles cannot qualify JSX or typed JavaScript accepted by a bundler parser",()=>{
  for(const suffix of ["const value:number=1;","const view=<div/>;"]){const f=fixture({...native,"server.mjs":native["server.mjs"]+suffix});try{const s=createTypescriptRefresh().analyze(f.root,true).snapshot;assert(!s.analysis.bindings.some(b=>b.occurrence.file==="server.mjs"));assert(s.analysis.gaps.some(g=>g.occurrence.file==="server.mjs"&&["unsupported-syntax","parse-error"].includes(g.reason))||s.diagnostics.some(d=>d.path==="server.mjs"&&d.reason==="syntax-error"));}finally{f.cleanup();}}
});
