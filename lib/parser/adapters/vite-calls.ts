import { Node, SyntaxKind } from "ts-morph";
import type { CodeSnapshot } from "../../engine/types.ts";
import type { Variant } from "../../model/framework.ts";
import { frameworkBindings, type FrameworkSource } from "../framework-bindings.ts";

/** Keep accepted TS lexical calls; withhold them from a differing runtime profile. */
export function qualifyViteCalls(snapshot:CodeSnapshot,inputs:FrameworkSource[],variant:Variant,resolve:(from:string,specifier:string)=>string|undefined,checkpoint:()=>void) {
  const b=frameworkBindings(snapshot,inputs,variant,resolve,checkpoint);
  const calls=new Map(snapshot.behavior.relations.filter(r=>r.relation === "calls").map(r=>[JSON.stringify([r.site.file,r.site.start]),r]));
  const declarations=new Map(snapshot.behavior.declarations.map(d=>[d.id,d]));
  for (const {candidate,sourceFile} of inputs) for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    checkpoint();
    const verified=calls.get(JSON.stringify([candidate.path,call.getStart()]));
    if (!verified || declarations.get(verified.target)?.site.file === candidate.path || !Node.isIdentifier(call.getExpression())) continue;
    const runtime=b.identifier(call.getExpression());
    if (runtime?.id !== verified.target) b.gap(call,runtime ? "ambiguous-target" : "custom-resolver");
  }
}
