import { ts } from "ts-morph";
import type { MetadataRecord } from "../../engine/metadata.ts";
import type { StaticValue } from "../../engine/static-config.ts";
import type { CodeSnapshot } from "../../engine/types.ts";
import { factId, type DevelopmentProxy, type Variant, type Witness } from "../../model/framework.ts";
import { normalizeRange } from "../../model/positions.ts";
import { frameworkFact } from "../framework-budget.ts";

const property=(v:StaticValue|undefined,key:string)=>v?.kind === "object" ? v.properties[key] : undefined;
const literal=(v:StaticValue|undefined)=>v?.kind === "literal" && typeof v.value === "string" ? v.value : undefined;
/** Configuration facts only; no deployment identity or cross-stack edge is emitted. */
export function extractDevelopmentProxies(snapshot:CodeSnapshot,record:MetadataRecord,variant:Variant) {
  const proxies=property(property(record.config.value,"server"),"proxy");
  if (proxies?.kind !== "object") return;
  const source=ts.createSourceFile("vite.config.ts",record.text,ts.ScriptTarget.Latest,true);
  let root:ts.Expression|undefined=source.statements.find(ts.isExportAssignment)?.expression;
  if (root && ts.isCallExpression(root)) root=root.arguments[0];
  const syntaxProperty=(node:ts.Node|undefined,key:string):ts.Expression|undefined=>node && ts.isObjectLiteralExpression(node) ? node.properties.find(p=>ts.isPropertyAssignment(p) && (ts.isIdentifier(p.name)||ts.isStringLiteral(p.name)) && p.name.text === key) && node.properties.flatMap(p=>ts.isPropertyAssignment(p) && (ts.isIdentifier(p.name)||ts.isStringLiteral(p.name)) && p.name.text === key ? [p.initializer] : [])[0] : undefined;
  const proxySyntax=syntaxProperty(syntaxProperty(root,"server"),"proxy");
  const end=record.text.length-(/\r\n$/.test(record.text)?2:/[\r\n]$/.test(record.text)?1:0);
  if (!end) return;
  const occurrence={file:record.resource.path,...normalizeRange(record.text,0,end,"utf16"),fileHash:record.resource.hash,extractor:"vite/proxy/fs-03-1",evidenceKind:"verified" as const};
  const gap=(reason:"unsupported-syntax"|"dynamic-expression")=>{const id=factId("gap",occurrence,variant.id,reason);if (!snapshot.analysis.gaps.some(g=>g.id===id)) {frameworkFact(snapshot,occurrence.file);snapshot.analysis.gaps.push({id,reason,occurrence,variantId:variant.id,capabilityId:null});}return id;};
  const witnesses:Witness[]=[{role:"configuration",site:occurrence,extractorVersion:"fs-03/1",variantId:variant.id}];
  for (const [prefix,value] of Object.entries(proxies.properties)) {
    if ((snapshot.analysis.developmentProxies?.length ?? 0)>=64) {gap("unsupported-syntax");return;}
    const target=literal(value) ?? literal(property(value,"target"));
    // Hooks can mutate the request/path; no identity rewrite may be inferred.
    if (property(value,"configure") || property(value,"bypass") || property(value,"router")) {gap("dynamic-expression");continue;}
    if (!prefix.startsWith("/") || /[?*^$()\[\]{}\\]/.test(prefix) || !target) {gap("unsupported-syntax");continue;}
    let url:URL;try{url=new URL(target);}catch{gap("unsupported-syntax");continue;}
    if (!["http:","https:"].includes(url.protocol)||url.username||url.password||url.search||url.hash) {gap("unsupported-syntax");continue;}
    let rewrite:DevelopmentProxy["rewrite"]={state:"identity"};
    if (property(value,"rewrite")) {
      rewrite={state:"unknown",gapId:"pending"};
      const callback=syntaxProperty(syntaxProperty(proxySyntax,prefix),"rewrite");
      if (callback && ts.isArrowFunction(callback) && callback.parameters.length===1 && ts.isIdentifier(callback.parameters[0].name) && !callback.parameters[0].dotDotDotToken && !callback.parameters[0].initializer && !callback.modifiers?.some(m=>m.kind===ts.SyntaxKind.AsyncKeyword)) {
        const body=ts.isBlock(callback.body) && callback.body.statements.length===1 && ts.isReturnStatement(callback.body.statements[0]) ? callback.body.statements[0].expression : ts.isBlock(callback.body) ? undefined : callback.body;
        if (body && ts.isCallExpression(body) && body.arguments.length===2 && ts.isPropertyAccessExpression(body.expression) && body.expression.name.text==="replace" && ts.isIdentifier(body.expression.expression) && body.expression.expression.text===callback.parameters[0].name.text && body.arguments[0].kind===ts.SyntaxKind.RegularExpressionLiteral && ts.isStringLiteral(body.arguments[1])) {
          const expression=body.arguments[0].getText(source), pattern=/^\/\^((?:\\\/|[\w-])+)\/$/.exec(expression);
          if (pattern && !body.arguments[1].text.includes("$")) { const from=pattern[1].replaceAll("\\/","/");if (from.startsWith("/")) rewrite={state:"prefix",from,to:body.arguments[1].text}; }
        }
      }
      if (rewrite.state === "unknown") rewrite.gapId=gap("dynamic-expression");
    }
    frameworkFact(snapshot,occurrence.file);
    (snapshot.analysis.developmentProxies ??= []).push({id:factId("development-proxy",occurrence,variant.id,prefix),variantId:variant.id,scope:"development",prefix,targetOrigin:url.origin,targetBasePath:url.pathname,rewrite,occurrence,witnesses});
  }
}
