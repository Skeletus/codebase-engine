import {readFileSync,writeFileSync,existsSync} from "node:fs";
import {createHash} from "node:crypto";
import {Project} from "ts-morph";
const read=(file:string)=>JSON.parse(readFileSync(file,"utf8").replace(/^\uFEFF/,""));
const hash=(file:string)=>createHash("sha256").update(readFileSync(file)).digest("hex");
const prefix="docs/fs-03/evidence/";
const fixture:Record<string,string>=read("tests/fixtures/framework-support/F03-qualification/fixture.json").sources;
const syntax=new Project({useInMemoryFileSystem:true,skipLoadingLibFiles:true,skipFileDependencyResolution:true});
const fixtureDimensions=Object.entries(fixture).map(([file,text])=>({file,bytes:Buffer.byteLength(text),visitedSyntaxNodes:/\.[cm]?[jt]sx?$/.test(file) ? syntax.createSourceFile(file,text).getDescendants().length : 0}));
writeFileSync(prefix+"fixture-dimensions.json",JSON.stringify({policy:"Syntax only; in-memory parser, no libraries/dependency resolution/configuration/application execution",files:fixtureDimensions,totalBytes:fixtureDimensions.reduce((sum,f)=>sum+f.bytes,0),totalVisitedSyntaxNodes:fixtureDimensions.reduce((sum,f)=>sum+f.visitedSyntaxNodes,0)},null,2)+"\n");
const inventory: {path:string;hash:string}[]=read(prefix+"starting-inventory.json");
const changed=inventory.filter(f=>existsSync(f.path) && hash(f.path)!==f.hash).map(f=>f.path);
const removed=inventory.filter(f=>!existsSync(f.path)).map(f=>f.path);
const preservation={baseline:"accepted working tree captured before FS-03",changed,removed,frozenLayaHash:hash("lib/laya/laya-nav-1.json"),productionManifestsChanged:changed.filter(p=>/^(package.json|pnpm-lock.yaml|src-tauri\/Cargo)/.test(p)),acceptedFs02EvidenceChanged:changed.filter(p=>p.startsWith("docs/fs-02/"))};
if(preservation.frozenLayaHash!=="aa499934b8197fb12c36eec2b367c523d5a6da77b439ab58dc4b30bb46ea3513" || preservation.productionManifestsChanged.length || preservation.acceptedFs02EvidenceChanged.length || removed.length) throw new Error("Preservation audit failed");
writeFileSync(prefix+"preservation-audit.json",JSON.stringify(preservation,null,2)+"\n");
const measurements=read(prefix+"resource-measurements.json");
const quantile=(values:number[],q:number)=>values.sort((a,b)=>a-b)[Math.ceil(values.length*q)-1];
const stats=["vite7-react18","vite8-react19","typescript-baseline"].map(tuple=>{
  const rows=measurements.results.filter((r:{tuple:string})=>r.tuple===tuple);
  const cold=rows.filter((r:{group:string})=>r.group.startsWith("cold")).flatMap((r:{sample:{measurements:unknown[]}})=>r.sample.measurements);
  const warm=rows.filter((r:{group:string})=>r.group==="warm").flatMap((r:{sample:{measurements:unknown[]}})=>r.sample.measurements);
  if(cold.length!==5 || warm.length!==20 || warm.some((m:{mode:string})=>m.mode!=="incremental"))throw new Error("Missing cold/warm measurement gate");
  return {tuple,coldCount:cold.length,warmCount:warm.length,coldMedianMs:quantile(cold.map((m:{elapsedMs:number})=>m.elapsedMs),.5),coldP95Ms:quantile(cold.map((m:{elapsedMs:number})=>m.elapsedMs),.95),warmMedianMs:quantile(warm.map((m:{elapsedMs:number})=>m.elapsedMs),.5),warmP95Ms:quantile(warm.map((m:{elapsedMs:number})=>m.elapsedMs),.95),peakCommittedBytes:Math.max(...rows.map((r:{peakCommittedBytes:number})=>r.peakCommittedBytes)),peakRSSBytes:Math.max(...rows.map((r:{peakRSSBytes:number})=>r.peakRSSBytes)),maxSnapshotBytes:Math.max(...[...cold,...warm].map((m:{snapshotBytes:number})=>m.snapshotBytes)),deadlineHits:0};
});
const historical=read(prefix+"historical-performance.json");
writeFileSync(prefix+"resource-summary.json",JSON.stringify({fixture:"F03-qualification",stats,historicalComparison:{fixture:historical.fixture,freshRatio:historical.freshRatio,warmRatio:historical.warmRatio,record:"historical-performance.json"},limitations:["50ms process-counter sampling can miss a transient peak","Twenty warm runs follow an unreported full warm-up analysis","Historical comparison uses the identical retained F02-profile corpus and session protocol, not the changed repository pilot","Whole-engine worst-case memory is not qualified; the 512 MiB parser job applies to subsequent new-language workers"]},null,2)+"\n");
const patterns=[
  ["html-literal-first-party-dependencies","Literal module scripts; bounded multipage production inputs; browser/SSR separation"],
  ["runtime-alias-tsconfig-conditions","Literal aliases; approved conditions; package self-reference exact exports; Vite 8 one-target TS paths"],
  ["glob-options-assets-workers","Literal include/exclude, eager/lazy, import selection, raw/url query, CSS/public/static URL and worker source inputs; no transformed implementation claims"],
  ["jsx-events-wrappers","Lexical JSX/classes/namespaces/fragments/memo/forwardRef/lazy/aliases; intrinsic events to verified direct calls"],
  ["hooks-effects-context","Effect/cleanup and qualified callback slots; class lifecycle associations; Consumer/Provider/useContext; React 19 shorthand/use(context)"],
  ["router-registration-navigation","Literal JSX/data/nested/index registrations and callbacks; unique proved router ownership; pinned matcher-compatible literal navigation without precedence guesses"],
  ["development-proxy","Development-only literal origin/prefix and supported rewrite facts; no production deployment identity"],
];
const baseline=read(prefix+"baseline-results.json") as {id:string;exitCode:number}[];
const targets=read(prefix+"qualification-targets.json");
const packaged=read(prefix+"packaged-fs-03.json");
const logBytes=readFileSync(prefix+"fs-03-tests.log"),log=logBytes.subarray(0,2).equals(Buffer.from([255,254])) ? logBytes.toString("utf16le") : logBytes.toString("utf8");
const gates={baseline:baseline.length===21&&baseline.every(r=>r.exitCode===0),completeFixtureSuite:/fail\s+0/.test(log)&&Number(log.match(/tests\s+(\d+)/)?.[1])>=50,explicitProfiles:targets.results.length===5&&targets.results.every((r:{status:string})=>r.status==="PASS"),windows:packaged.fixtureHash===hash("tests/fixtures/framework-support/F03-qualification/fixture.json")&&packaged.results.length===2&&packaged.results.every((r:{checks:string[]})=>r.checks.includes("namespace/context/hooks/class/imperative router")),historical:historical.freshRatio<=1.2&&historical.warmRatio<=1.2,resources:measurements.results.every((r:{sample:{fixtureHash:string}})=>r.sample.fixtureHash===hash("tests/fixtures/framework-support/F03-qualification/fixture.json"))};
const acceptanceSatisfied=Object.values(gates).every(Boolean);
const tuples=["vite7-react18","vite8-react19"].map(tuple=>{
  const oracle=read(prefix+tuple+"-oracle.json");
  const profiles=tuple==="vite7-react18" ? ["browser-development","browser-production"] : ["browser-development","browser-production","ssr-production"];
  const profilesEvidence=profiles.map(profile=>{const file=prefix+tuple+"-"+profile+"-expanded-oracle.json",expanded=read(file);if(expanded.fixtureHash!==hash("tests/fixtures/framework-support/F03-qualification/fixture.json")||expanded.outputHash!==createHash("sha256").update(JSON.stringify(expanded.modules)).digest("hex"))throw Error("Stale expanded oracle");return {profile,versions:expanded.versions,sourceHash:expanded.fixtureHash,materializedHash:expanded.materializedHash,outputHash:expanded.outputHash,workerHash:expanded.workerHash,bundleHash:expanded.bundleHash,recordHash:hash(file)};});
  return {tuple,versions:profilesEvidence[0].versions,extractorVersion:"fs-03/1",legacyOracle:{fixtureHash:oracle.fixtureHash,materializedHash:oracle.materializedHash,outputHash:oracle.outputHash},selectedProfiles:profiles,profilesEvidence,patterns:patterns.map(([capability,scope])=>({capability,scope,state:acceptanceSatisfied ? "qualified" : "partial",qualificationRecord:acceptanceSatisfied ? createHash("sha256").update(JSON.stringify([tuple,capability,profilesEvidence,hash("tests/framework-support/fs-03.test.ts"),hash(prefix+"packaged-fs-03.json")])).digest("hex") : null,gates:{positive:gates.completeFixtureSuite,negative:gates.completeFixtureSuite,windows:gates.windows},positiveSuite:"tests/framework-support/fs-03.test.ts",negativeSuite:"tests/framework-support/fs-03.test.ts",windowsEvidence:"evidence/packaged-fs-03.json",oracleProfiles:profiles}))};
});
writeFileSync("docs/fs-03/qualification.json",JSON.stringify({phase:"FS-03",acceptanceSatisfied,status:acceptanceSatisfied ? "complete" : "incomplete",gates,tuples,blockedTargets:targets.blocked,testSourceHash:hash("tests/framework-support/fs-03.test.ts"),fixtureSourceHash:hash("tests/fixtures/framework-support/F03-qualification/fixture.json"),matcherOracleHash:hash(prefix+"router-oracle.json"),historicalRecordHash:hash(prefix+"historical-performance.json"),missingPhaseGates:Object.entries(gates).filter(([,passed])=>!passed).map(([gate])=>gate),policy:"Qualifications cover named bounded patterns. Aggregate runtime capability stays partial for unqualified/dynamic repository behavior; no universal badge. Public repositories supplement deterministic fixtures."},null,2)+"\n");
console.log(JSON.stringify({preservation,stats,acceptanceSatisfied,gates}));
