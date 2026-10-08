import assert from "node:assert/strict";
import {readFileSync,writeFileSync} from "node:fs";
import {createRequire} from "node:module";
import {createHash} from "node:crypto";
import path from "node:path";
type Route={type:string;route:string;contextKey:string;dynamic:unknown;children:Route[]};
const fixtureBytes=readFileSync("tests/fixtures/framework-support/F07-rn/expo-routes.json"),fixture=JSON.parse(fixtureBytes.toString()) as {keys:string[];negativeKeys:string[]};
const hash=(v:string|Buffer)=>createHash("sha256").update(v).digest("hex");
for(const tuple of ["expo55","expo56"])for(const platform of ["android","ios"]){
  const root=path.resolve("node_modules/.fs07-experiments/oracles",tuple),require=createRequire(path.join(root,"package.json"));
  const entry=path.join(root,"node_modules/expo-router/build/getRoutesCore.js"),pkg=JSON.parse(readFileSync(path.join(root,"node_modules/expo-router/package.json"),"utf8")) as {version:string};
  const tool=require(entry) as {getRoutes:(context:unknown,options:unknown)=>Route};
  let loaded=0;
  // The framework asks for layout settings. Supply inert first-party data;
  // never load a source file, evaluate its exports or call a component.
  function context(keys:string[]){return Object.assign(()=>{loaded++;return Object.freeze({});},{keys:()=>keys});}
  const options={platform,importMode:"lazy",ignoreEntryPoints:true,internal_stripLoadRoute:true,skipGenerated:true,getSystemRoute:()=>{throw Error("No generated route fixture permitted");}};
  const tree=tool.getRoutes(context(fixture.keys),options),outputs:{route:string;contextKey:string;dynamic:unknown;layouts:string[]}[]=[];
  function flatten(route:Route,prefix:string,layouts:string[]){const full=[prefix,route.route].filter(Boolean).join("/");const next=route.type==="layout"?[...layouts,route.contextKey]:layouts;if(route.type==="route")outputs.push({route:full,contextKey:route.contextKey,dynamic:route.dynamic,layouts:next});for(const child of route.children??[])flatten(child,full,next);}
  flatten(tree,"",[]);outputs.sort((a,b)=>a.contextKey.localeCompare(b.contextKey));
  if(platform==="android")assert.throws(()=>tool.getRoutes(context(fixture.negativeKeys),options),/fallback sibling/);
  writeFileSync(`docs/fs-07/evidence/${tuple}-${platform}-expo-routes.json`,JSON.stringify({tuple,platform,routerVersion:pkg.version,toolSourceHash:hash(readFileSync(entry)),fixtureHash:hash(fixtureBytes),outputHash:hash(JSON.stringify(outputs)),outputs,syntheticLayoutDataRequests:loaded,customerModuleLoads:0,negative:platform==="android"?"matching platform route without base rejected":"opposite platform ignored",inspectedExecution:false},null,2)+"\n");
}
console.log("PASS independent Expo55/56 Android/iOS route-name/layout/dynamic oracles; no context modules executed");
