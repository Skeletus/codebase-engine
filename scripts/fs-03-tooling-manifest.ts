import assert from "node:assert/strict";
import {readFileSync,writeFileSync} from "node:fs";
import {createHash} from "node:crypto";
const hash=(file:string)=>createHash("sha256").update(readFileSync(file)).digest("hex"),tuples=[];
for(const [tuple,directory] of [["vite7-react18","vite7"],["vite8-react19","vite8"]]){
  const root=`node_modules/.fs03-experiments/${directory}`;
  const oracle=JSON.parse(readFileSync(`docs/fs-03/evidence/${tuple}-browser-development-expanded-oracle.json`,"utf8"));
  const packages=Object.entries(oracle.versions as Record<string,string>).filter(([name])=>name!=="node").map(([name,version])=>{
    const file=`${root}/node_modules/${name}/package.json`,pkg=JSON.parse(readFileSync(file,"utf8"));assert.equal(pkg.version,version);
    return {name,version,license:pkg.license,packageMetadataHash:hash(file)};
  });
  tuples.push({tuple,node:oracle.versions.node,packages,isolatedLockHash:hash(`${root}/package-lock.json`)});
}
writeFileSync("docs/fs-03/tooling-manifest.json",JSON.stringify({scope:"Approved isolated developer tools only; no production manifests/lockfiles changed; no inspected applications/configuration executed",tuples,unsupportedReactPluginOptions:["SWC","React Compiler/Babel custom transforms","classic/custom JSX","dynamic plugin lists"]},null,2)+"\n");
