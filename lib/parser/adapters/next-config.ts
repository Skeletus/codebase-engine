import { ts } from "ts-morph";
import { interpretConfig } from "../../engine/static-config.ts";
import type { GenerationBoundary } from "../../engine/boundary.ts";
/** Only single-return literal configuration callbacks are interpreted as data. */
export function nextStaticConfig(text:string,boundary:GenerationBoundary) {
  const source=ts.createSourceFile("next.config.ts",text,ts.ScriptTarget.Latest,true);
  const edits:{start:number;end:number;text:string}[]=[],pending:ts.Node[]=[source];let visited=0;
  while(pending.length){boundary.check();if(++visited>10000)return {kind:"unknown" as const,reason:"resource-limit" as const};const node=pending.pop()!;
    if(ts.isMethodDeclaration(node) && (ts.isIdentifier(node.name)||ts.isStringLiteral(node.name)) && ["rewrites","redirects"].includes(node.name.text) && node.parameters.length===0 && !node.asteriskToken && node.body?.statements.length===1 && ts.isReturnStatement(node.body.statements[0]) && node.body.statements[0].expression) {
      const expression=node.body.statements[0].expression, replacement=JSON.stringify(node.name.text)+":"+expression.getText(source),start=node.getStart(source),end=node.end;
      if(replacement.length<=end-start)edits.push({start,end,text:replacement+" ".repeat(end-start-replacement.length)});
      continue;
    }
    ts.forEachChild(node,n=>{pending.push(n);});
  }
  let bounded=text;for(const edit of edits.sort((a,b)=>b.start-a.start))bounded=bounded.slice(0,edit.start)+edit.text+bounded.slice(edit.end);
  return interpretConfig(bounded,{boundary}).value;
}
