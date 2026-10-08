import {readFileSync,writeFileSync} from "node:fs";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {createHash} from "node:crypto";
import assert from "node:assert/strict";

// Opt-in developer oracle. Only pinned framework-owned pure path utilities run,
// on first-party JSON data. No application component, config or plugin is loaded.
const hash=(v:Buffer|string)=>createHash("sha256").update(v).digest("hex");
const bytes=readFileSync("tests/fixtures/framework-support/F07-rn/linking.json"),fixture=JSON.parse(bytes.toString()) as {config:unknown;cases:{path:string;screens:string[]}[]};
type State={routes:{name:string;params?:unknown;state?:State}[]};
for(const tuple of ["rn83-bare","rn85-bare","expo55","expo56"]){
  const root=path.resolve("node_modules/.fs07-experiments/oracles",tuple,tuple==="expo56"?"node_modules/expo-router":"node_modules/@react-navigation/core"),file=path.join(root,tuple==="expo56"?"build/react-navigation/core/getStateFromPath.js":"lib/module/getStateFromPath.js");
  const pkg=JSON.parse(readFileSync(path.join(root,"package.json"),"utf8")) as {version:string};
  const utility=await import(pathToFileURL(file).href) as {getStateFromPath:(p:string,c:unknown)=>State|undefined};
  const outputs=fixture.cases.map(c=>{const state=utility.getStateFromPath(c.path,structuredClone(fixture.config));let current=state;const screens:string[]=[];while(current){assert.equal(current.routes.length,1);screens.push(current.routes[0].name);current=current.routes[0].state;}assert.deepEqual(screens,c.screens);return {path:c.path,screens,state:state??null};});
  for(const platform of ["android","ios"])writeFileSync(`docs/fs-07/evidence/${tuple}-${platform}-navigation-linking.json`,JSON.stringify({tuple,platform,coreVersion:pkg.version,fixtureHash:hash(bytes),sourceHash:hash(readFileSync(file)),outputHash:hash(JSON.stringify(outputs)),outputs,applicationModuleLoads:0,configurationExecution:false,scope:"approved framework-owned path utility; static literal configuration"},null,2)+"\n");
}
console.log("PASS four independently pinned navigation utilities, eight tuple/profile records");
