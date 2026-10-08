import type { Declaration, Site } from "../../model/behavior.ts";
import type { DjangoInput } from "./django-syntax.ts";
import { djangoRules } from "./django-rules.ts";
import { djangoLiteral } from "./django-literals.ts";

type ClassRecord = { declaration: Declaration; input: DjangoInput; members: Declaration[]; assignments: DjangoInput[]; canonical: (name:string)=>string|null; resolve:(name:string)=>Declaration|null };
/** Bounded C3 composition over explicit source classes and qualified framework
 * lineages. Custom dispatch/metaclasses/mutable method attributes stop proof. */
export function djangoDispatch(tuple:string,klass:Declaration,record:(declaration:Declaration)=>ClassRecord|null):{methods:string[];targets:{method:string;declaration:Declaration}[];proof:Site[]}|null {
  const definitions=djangoRules[tuple];if(!definitions)return null;
  const sources=new Map<string,ClassRecord>(),framework=new Map<string,(typeof definitions)[number]>();
  const lineage=(declaration:Declaration,seen:Set<string>):string[]|null=>{
    if(seen.has(declaration.id)||seen.size>=64)return null;const next=new Set(seen);next.add(declaration.id);
    const source=record(declaration);if(!source||source.input.conditional)return null;sources.set(declaration.id,source);
    const bases:string[]=[],parents:string[][]=[];
    for(const argument of source.input.arguments){if(argument.name!==null)return null;const canonical=source.canonical(argument.text),known=definitions.find(d=>d.names.includes(canonical??""));if(known){const id=known.mro[0];framework.set(id,known);bases.push(id);parents.push([...known.mro]);}else{const parent=source.resolve(argument.text);if(!parent||parent.kind!=="class")return null;const inherited=lineage(parent,next);if(!inherited)return null;bases.push(parent.id);parents.push(inherited);}}
    if(!bases.length)return [declaration.id,"builtins.object"];
    const sequences=[...parents.map(p=>[...p]),[...bases]],merged:string[]=[];
    while(sequences.some(s=>s.length)){if(merged.length>=64)return null;const candidate=sequences.filter(s=>s.length).map(s=>s[0]).find(head=>sequences.every(s=>!s.slice(1).includes(head)));if(!candidate)return null;merged.push(candidate);for(const sequence of sequences)if(sequence[0]===candidate)sequence.shift();}
    return [declaration.id,...merged];
  };
  const mro=lineage(klass,new Set());if(!mro||!mro.some(id=>framework.has(id)))return null;
  const targets=new Map<string,Declaration>();let defaults:readonly string[]|undefined,allowed:readonly string[]|undefined;const proof:Site[]=[];
  for(const id of mro){const source=sources.get(id);if(source){proof.push(source.declaration.site);if(source.members.some(d=>["dispatch","as_view","setup","initialize_request","initial","http_method_not_allowed"].includes(d.name)))return null;
      if(source.assignments.some(a=>["dispatch","as_view","setup","initialize_request","initial"].includes(a.name)))return null;
      const names=source.assignments.filter(a=>a.name==="http_method_names");if(names.length){if(names.length!==1||names[0].conditional)return null;const value=djangoLiteral(names[0].value);if(!Array.isArray(value)||!value.every(v=>typeof v==="string"&&/^(get|post|put|patch|delete|head|options|trace)$/.test(v)))return null;if(!allowed)allowed=value.map(v=>String(v).toUpperCase());proof.push(names[0].site);}
      const methods=source.members.filter(d=>["get","post","put","patch","delete","head","options","trace"].includes(d.name));for(const method of methods){const name=method.name.toUpperCase();if(targets.has(name))continue;if(methods.filter(d=>d.name===method.name).length!==1||source.assignments.some(a=>a.name===method.name))return null;targets.set(name,method);}
    }else if(framework.has(id)&&!defaults)defaults=framework.get(id)!.methods;}
  const values=new Set([...(defaults??[]),...targets.keys()]);if(values.has("GET")&&!values.has("HEAD")){values.add("HEAD");if(targets.has("GET"))targets.set("HEAD",targets.get("GET")!);}if(allowed)for(const value of values)if(!allowed.includes(value))values.delete(value);
  return {methods:[...values].sort(),targets:[...targets].filter(([method])=>values.has(method)).map(([method,declaration])=>({method,declaration})),proof};
}
