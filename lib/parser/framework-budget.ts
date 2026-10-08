import type { CodeSnapshot } from "../engine/types.ts";
import { AnalysisBoundaryError } from "../engine/boundary.ts";

const counts=new WeakMap<CodeSnapshot,{files:Map<string,number>;total:number}>();
const seeded=new WeakSet<CodeSnapshot>();
const identities=new WeakMap<CodeSnapshot,Set<string>>();
export function seedFrameworkCallbacks(snapshot:CodeSnapshot) {
  if(seeded.has(snapshot))return;
  seeded.add(snapshot);
  for(const declaration of snapshot.behavior.declarations.filter(d=>d.name==="<callback>"&&d.kind==="function"))frameworkFact(snapshot,declaration.site.file,declaration.id);
}
/** Generation-local new facts only; inherited TS/JS limits remain unchanged. */
export function frameworkFact(snapshot:CodeSnapshot,file:string,identity?:string) {
  if(identity){let seen=identities.get(snapshot);if(!seen){seen=new Set();identities.set(snapshot,seen);}if(seen.has(identity))return;seen.add(identity);}
  let generation=counts.get(snapshot);if (!generation) {generation={files:new Map(),total:0};counts.set(snapshot,generation);}
  const count=generation.files.get(file) ?? 0;
  if (count>=20000||generation.total>=200000) throw new AnalysisBoundaryError("resource-limit");
  generation.files.set(file,count+1);generation.total++;
}
