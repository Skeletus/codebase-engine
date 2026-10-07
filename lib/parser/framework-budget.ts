import type { CodeSnapshot } from "../engine/types.ts";
import { AnalysisBoundaryError } from "../engine/boundary.ts";

const counts=new WeakMap<CodeSnapshot,{files:Map<string,number>;total:number}>();
const seeded=new WeakSet<CodeSnapshot>();
export function seedFrameworkCallbacks(snapshot:CodeSnapshot) {
  if(seeded.has(snapshot))return;
  seeded.add(snapshot);
  for(const declaration of snapshot.behavior.declarations.filter(d=>d.name==="<callback>"&&d.kind==="function"))frameworkFact(snapshot,declaration.site.file);
}
/** Generation-local new facts only; inherited TS/JS limits remain unchanged. */
export function frameworkFact(snapshot:CodeSnapshot,file:string) {
  let generation=counts.get(snapshot);if (!generation) {generation={files:new Map(),total:0};counts.set(snapshot,generation);}
  const count=generation.files.get(file) ?? 0;
  if (count>=20000||generation.total>=200000) throw new AnalysisBoundaryError("resource-limit");
  generation.files.set(file,count+1);generation.total++;
}
