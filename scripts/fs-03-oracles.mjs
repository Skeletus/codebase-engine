// Opt-in developer oracle. Uses only application-owned config and controlled fixture bytes.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
if (!process.argv.includes("--run")) throw new Error("Explicit --run required");
const tuple = process.argv.find(a => a.startsWith("--tuple="))?.slice(8);
const expanded=process.argv.includes("--expanded"),profile=process.argv.find(a=>a.startsWith("--profile="))?.slice(10)??"browser-development";
const testCase=process.argv.find(a=>a.startsWith('--case='))?.slice(7);
if(testCase&&(!expanded||testCase!=='tsconfig-paths'||tuple!=='vite8-react19'))throw Error('Unsupported controlled case');
if(!["browser-development","browser-production","ssr-production"].includes(profile)||profile==="ssr-production"&&tuple!=="vite8-react19")throw Error("Unsupported oracle profile");
const root = path.resolve("node_modules/.fs03-experiments", tuple === "vite7-react18" ? "vite7" : tuple === "vite8-react19" ? "vite8" : "invalid");
if (root.endsWith("invalid")) throw new Error("Exact tuple required");
const expected = tuple === "vite7-react18" ? { node:"22.23.3",vite:"7.3.7",react:"18.3.1","react-dom":"18.3.1","react-router":"7.18.4",typescript:"5.9.3" } : { node:"24.19.0",vite:"8.3.3",react:"19.2.8","react-dom":"19.2.8","react-router":"7.18.4",typescript:"5.9.3" };
if (process.versions.node !== expected.node) throw new Error("Oracle Node tuple mismatch");
for (const [name, version] of Object.entries(expected)) if (name !== "node" && JSON.parse(readFileSync(path.join(root,"node_modules",name,"package.json"),"utf8")).version !== version) throw new Error("Oracle package tuple mismatch: " + name);
const sourcePath = path.resolve(expanded ? "tests/fixtures/framework-support/F03-qualification/fixture.json" : "tests/fixtures/framework-support/F03-react-vite/sources.json");
const sourceBytes = readFileSync(sourcePath), record=JSON.parse(sourceBytes),sources=expanded ? record.sources : record;
const pluginVersion=tuple==="vite7-react18" ? "5.2.0" : "6.1.2";
if(expanded&&JSON.parse(readFileSync(path.join(root,"node_modules/@vitejs/plugin-react/package.json"),"utf8")).version!==pluginVersion)throw Error("Oracle plugin tuple mismatch");
sources["package.json"] = JSON.stringify({...JSON.parse(sources["package.json"]),name:"f03",dependencies:Object.fromEntries(Object.entries(expected).filter(([name])=>!["node","typescript"].includes(name))),...(expanded ? {devDependencies:{"@vitejs/plugin-react":pluginVersion}} : {})});
if(testCase){sources['vite.config.ts']=sources['vite.config.ts'].replace("alias:{'@selected':'./src/Selected.ts'}","tsconfigPaths:true");sources['tsconfig.json']=JSON.stringify({compilerOptions:{baseUrl:'.',paths:{'@selected':['./src/Selected.ts']}}});sources['src/ssr.tsx']+="import {selected} from '@selected';export {selected};";}
const fixture = testCase ? path.resolve('.next/fs03-oracles',tuple,testCase) : path.join(root,expanded ? "qualified-fixture" : "fixture");
for (const [file,text] of Object.entries(sources)) {
  const destination = path.resolve(fixture,file);
  if (!destination.startsWith(fixture + path.sep)) throw new Error("Escaped fixture");
  mkdirSync(path.dirname(destination), {recursive:true}); writeFileSync(destination,text);
}
const {build} = await import(pathToFileURL(path.join(root,"node_modules/vite/dist/node/index.js")).href);
const records = [];
const workerModules=[],bundles=[];
const normalize=v=>v.replaceAll("\\","/").replace(fixture.replaceAll("\\","/")+"/","");
const plugin=expanded ? (await import(pathToFileURL(path.join(root,"node_modules/@vitejs/plugin-react/dist/index.js")).href)).default : undefined;
const selectedConditions=profile.startsWith("ssr") ? ["module","node","production"] : ["module","browser",profile.endsWith("production") ? "production" : "development"];
const config = {
  configFile:false, ...(tuple === "vite8-react19" ? {envDir:false} : {envFile:false}), root:fixture, mode:"development", logLevel:"warn",
  resolve:{conditions:selectedConditions,...(testCase ? {tsconfigPaths:true} : expanded ? {alias:{'@selected':path.join(fixture,'src/Selected.ts')}} : {})},
  ...(expanded ? {base:'/app/',ssr:{resolve:{conditions:selectedConditions}}} : {}),
  ...(expanded ? {worker:{plugins:()=>[{name:'cartograph-owned-worker-oracle',generateBundle(){for(const id of this.getModuleIds())if(normalize(id).startsWith('src/'))workerModules.push({id:normalize(id),imports:this.getModuleInfo(id).importedIds.map(normalize).sort()});}}]}} : {}),
  plugins:[...(plugin ? plugin() : []),{name:"cartograph-owned-oracle", generateBundle(_options,bundle) {
    for(const [file,item] of Object.entries(bundle)){const bytes=item.type==='chunk' ? item.code : item.source;bundles.push({file,type:item.type,hash:createHash('sha256').update(bytes).digest('hex')});}
    for (const id of this.getModuleIds()) {
      if (!id.startsWith(fixture + path.sep) && !id.startsWith(fixture.replaceAll("\\","/") + "/")) continue;
      const info=this.getModuleInfo(id);
      records.push({id:normalize(id), imports:info.importedIds.map(normalize).sort(),dynamic:info.dynamicallyImportedIds.map(normalize).sort()});
    }
  }}],
  build:{...(profile.startsWith("ssr") ? {ssr:path.join(fixture,"src/ssr.tsx")} : {}),outDir:path.join(root,expanded ? "qualified-output-"+profile : "output"),emptyOutDir:true,rollupOptions:{input:profile.startsWith("ssr") ? path.join(fixture,"src/ssr.tsx") : {main:path.join(fixture,"index.html"),admin:path.join(fixture,"admin.html")},external:["react","react/jsx-runtime","react/jsx-dev-runtime","react-dom/client","react-dom/server","react-router"]}},
};
await build(config);
records.sort((a,b)=>a.id.localeCompare(b.id));
const digest = value=>createHash("sha256").update(value).digest("hex");
workerModules.sort((a,b)=>a.id.localeCompare(b.id));bundles.sort((a,b)=>a.file.localeCompare(b.file));
const output={tuple,versions:{...expected,...(expanded ? {'@vitejs/plugin-react':pluginVersion} : {})},...(testCase ? {testCase} : {}),...(expanded ? {profile,workerModules,bundles,workerHash:digest(JSON.stringify(workerModules)),bundleHash:digest(JSON.stringify(bundles))} : {}),configPolicy:"configFile:false/environment-files-disabled/application-owned collector; no fixture app execution",fixtureHash:digest(sourceBytes),materializedHash:digest(JSON.stringify(sources)),modules:records,outputHash:digest(JSON.stringify(records))};
mkdirSync("docs/fs-03/evidence",{recursive:true});
writeFileSync(`docs/fs-03/evidence/${tuple}${expanded ? '-'+profile+'-expanded' : ''}${testCase ? '-'+testCase : ''}-oracle.json`,JSON.stringify(output,null,2)+"\n");
console.log(JSON.stringify({tuple,modules:records.length,outputHash:output.outputHash}));
