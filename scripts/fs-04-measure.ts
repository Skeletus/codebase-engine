import assert from "node:assert/strict";
import path from "node:path";
import {tmpdir} from "node:os";
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,realpathSync,rmSync} from "node:fs";
import {createHash} from "node:crypto";
import {createTypescriptRefresh} from "../lib/engine/adapters/typescript.ts";
import {snapshotJson} from "../lib/engine/snapshot-identity.ts";
const tuple=process.argv.find(a=>a.startsWith("--tuple="))?.slice(8);assert(["next15","next16-preservation","next16-patch","node22","node24"].includes(tuple??""));
const bytes=readFileSync(`tests/fixtures/framework-support/F04-node-next/${tuple?.startsWith("node") ? "node" : "fixture"}.json`),sources:Record<string,string>=JSON.parse(bytes.toString()).sources;
if(tuple==="next15")sources["package.json"]=sources["package.json"].replace("16.3.8","15.5.27").replace("24.19.0","22.23.3");if(tuple==="next16-preservation")sources["package.json"]=sources["package.json"].replace("16.3.8","16.3.6");if(tuple==="node22")sources["package.json"]=sources["package.json"].replace("24.19.0","22.23.3");
const root=realpathSync.native(mkdtempSync(path.join(tmpdir(),"cartograph FS04 measure "))),warm=process.argv.includes("--warm");
try{for(const [file,text]of Object.entries(sources)){mkdirSync(path.dirname(path.join(root,file)),{recursive:true});writeFileSync(path.join(root,file),text);}const driver=createTypescriptRefresh({nodeModes:tuple?.startsWith("node") ? ["node-development","node-production"] : ["node-development","node-production","browser"]}),measurements=[];if(warm)driver.analyze(root,true);for(let n=0;n<(warm ? 20 : 1);n++){const start=performance.now(),s=driver.analyze(root,!warm).snapshot;measurements.push({elapsedMs:performance.now()-start,rssBytes:process.memoryUsage().rss,snapshotBytes:Buffer.byteLength(snapshotJson(s)),facts:s.analysis.bindings.length+s.analysis.registrations.length+s.analysis.gaps.length,files:s.files.length,deadlineHits:0});}console.log(JSON.stringify({tuple,node:process.version,extractorVersion:"fs-04/1",sourceHash:createHash("sha256").update(JSON.stringify(sources)).digest("hex"),fixtureHash:createHash("sha256").update(bytes).digest("hex"),measurements}));}finally{assert(path.basename(root).startsWith("cartograph FS04 measure "));rmSync(root,{recursive:true,force:true});}
