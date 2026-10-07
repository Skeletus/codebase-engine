import assert from "node:assert/strict";
import {mkdtempSync,realpathSync,readFileSync,mkdirSync,writeFileSync,rmSync} from "node:fs";
import path from "node:path";
import {tmpdir} from "node:os";
import {createHash} from "node:crypto";
import {createTypescriptRefresh} from "../lib/engine/adapters/typescript.ts";
import {snapshotJson} from "../lib/engine/snapshot-identity.ts";
const tuple=process.argv.find(a=>a.startsWith("--tuple="))?.slice(8);
assert(["vite7-react18","vite8-react19","typescript-baseline"].includes(tuple ?? ""));
const runs=process.argv.includes("--warm") ? 20 : 1;
const bytes=readFileSync("tests/fixtures/framework-support/F03-qualification/fixture.json");
const sources:Record<string,string>=JSON.parse(bytes.toString("utf8")).sources;
if(tuple === "vite7-react18")sources["package.json"]=sources["package.json"].replace("8.3.3","7.3.7").replaceAll("19.2.8","18.3.1").replace("6.1.2","5.2.0");
if(tuple === "typescript-baseline"){sources["package.json"]='{"name":"ts-baseline"}';delete sources["vite.config.ts"];}
const root=realpathSync.native(mkdtempSync(path.join(tmpdir(),"cartograph FS03 measurement ")));
try {
  for(const [file,text]of Object.entries(sources)){mkdirSync(path.dirname(path.join(root,file)),{recursive:true});writeFileSync(path.join(root,file),text);}
  const driver=createTypescriptRefresh({viteModes:tuple==="vite8-react19" ? ["browser-development","browser-production","ssr-production"] : ["browser-development","browser-production"]}),measurements=[];
  if (runs>1) driver.analyze(root,true);
  // Warm runs use one retained syntax session; each iteration is a complete
  // discovery/hash/metadata/framework pass, with no changed files.
  for(let n=0;n<runs;n++){
    const start=performance.now(),result=driver.analyze(root,runs===1).snapshot;
    measurements.push({mode:runs===1 ? "full" : "incremental",elapsedMs:performance.now()-start,rssBytes:process.memoryUsage().rss,snapshotBytes:Buffer.byteLength(snapshotJson(result)),facts:result.analysis.bindings.length+result.analysis.registrations.length+result.analysis.gaps.length,files:result.files.length,sourceBytes:result.files.reduce((sum,f)=>sum+f.bytes,0),deadlineHits:0});
  }
  console.log(JSON.stringify({tuple,node:process.version,platform:process.platform,arch:process.arch,fixtureHash:createHash("sha256").update(bytes).digest("hex"),measurements}));
}finally{assert(path.basename(root).startsWith("cartograph FS03 measurement "));rmSync(root,{recursive:true,force:true});}
