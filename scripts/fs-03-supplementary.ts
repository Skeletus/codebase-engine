import path from "node:path";
import { readFileSync,writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { typescriptAdapter } from "../lib/engine/adapters/typescript.ts";
import { selectFiles } from "../lib/parser/index.ts";

if (!process.argv.includes("--run")) throw new Error("Explicit --run required");
globalThis.fetch=async()=>{throw new Error("Supplementary analysis egress denied");};
const repositories=[
  {name:"bulletproof-react",url:"https://github.com/alan2207/bulletproof-react",commit:"9506629ed003a561c6627735480cce4994244bb4",subtree:"apps/react-vite"},
  {name:"vite-plugin-react",url:"https://github.com/vitejs/vite-plugin-react",commit:"ac47648e17674299accb51816e9e33b8a7b07b05",subtree:"playground/react-sourcemap"},
];
const results=[];
for (const repository of repositories) {
  const checkout=path.resolve("node_modules/.fs03-experiments",repository.name);
  if (execFileSync("git",["-C",checkout,"rev-parse","HEAD"],{encoding:"utf8"}).trim() !== repository.commit) throw new Error("Pinned public checkout mismatch");
  if (execFileSync("git",["-C",checkout,"status","--porcelain"],{encoding:"utf8"}).trim()) throw new Error("Modified public checkout");
  const root=path.join(checkout,repository.subtree),started=performance.now();
  const selection=selectFiles(root),snapshot=typescriptAdapter.analyze(root);
  results.push({...repository,licenseHash:createHash("sha256").update(readFileSync(path.join(checkout,"LICENSE"))).digest("hex"),elapsedMs:Math.round(performance.now()-started),sourceInventoryHash:createHash("sha256").update(JSON.stringify(snapshot.files.map(f=>[f.path,f.hash]))).digest("hex"),files:snapshot.files.length,imports:snapshot.relationships.length,declarations:snapshot.behavior.declarations.length,bindings:snapshot.analysis.bindings.length,versions:selection.walk.discovery.projects.map(p=>({project:p.path,versions:p.versions})),qualification:"supplementary only; declared ranges/workspace tooling are not exact FS-03 tuples",unsupportedPatterns:["nonexact/inherited Vite and React qualification versions","@vitejs/plugin-react transformations","plugin-provided tsconfig paths / conditional configuration","external component library and runtime dispatch boundaries"],capabilities:snapshot.analysis.capabilities.filter(c=>c.extractorVersion === "fs-03/1"),diagnostics:snapshot.diagnostics.filter(d=>["config-discovery","discovery"].includes(d.category))});
}
writeFileSync("docs/fs-03/evidence/supplementary-repositories.json",JSON.stringify({policy:"Public pinned source read only; no checkout dependencies, configuration or application executed",results},null,2)+"\n");
console.log(JSON.stringify(results.map(r=>({name:r.name,commit:r.commit,files:r.files,imports:r.imports,bindings:r.bindings,elapsedMs:r.elapsedMs}))));
