import path from "node:path";
import { builtinModules } from "node:module";
import {ts} from "ts-morph";
import type { CodeSnapshot } from "../../engine/types.ts";
import type { Discovery, DiscoveredProject } from "../../engine/discovery.ts";
import { metadataWitness } from "../../engine/profiles.ts";
import { capabilityId, profileId, variantId, type Witness, type GapReason } from "../../model/framework.ts";
import type { StaticValue } from "../../engine/static-config.ts";
import {AnalysisBoundaryError} from "../../engine/boundary.ts";
import {nextStaticConfig} from "./next-config.ts";

export type NodeMode = "node-development" | "node-production" | "browser";
export type NodeResolution = {state:"resolved";target:string} | {state:"boundary";reason:GapReason};
const prop=(value:StaticValue|undefined,key:string)=>value?.kind==="object" ? value.properties[key] : undefined;
const literal=(value:StaticValue|undefined)=>value?.kind==="literal" && typeof value.value==="string" ? value.value : undefined;
const builtins=new Set(builtinModules.map(s=>s.replace(/^node:/,"")));
/** Source inventory only. No module loader, installed dependencies or bundler aliases. */
export function nodeProfile(snapshot:CodeSnapshot, discovery:Discovery, project:DiscoveredProject, mode:NodeMode, next=false) {
  const records=discovery.metadata.all().filter(r=>path.posix.basename(r.resource.path)==="package.json");
  const owned=discovery.inventory.filter(f=>f.owner===project.path && f.state==="selected");
  const inventory=new Set(owned.map(f=>f.path));
  const root=project.path==="." ? "" : project.path;
  const pkg=records.find(r=>r.resource.path===(root ? root+"/" : "")+"package.json");
  const version=next ? project.versions.next==="15.5.27" ? "22.23.3" : ["16.3.6","16.3.8"].includes(project.versions.next) ? "24.19.0" : undefined : literal(prop(prop(pkg?.config.value,"engines"),"node"));
  const tuple=next ? project.versions.react!=="19.2.8" || project.versions["react-dom"]!=="19.2.8" ? "unqualified" : ({"15.5.27":"next15","16.3.6":"next16-preservation","16.3.8":"next16-patch"}[project.versions.next] ?? "unqualified") : version==="22.23.3" ? "node22" : version==="24.19.0" ? "node24" : "unqualified";
  const resolverId=next ? "next-runtime" : "node-runtime", semanticsVersion="fs-04/1";
  const profile={id:profileId(project.path,resolverId,semanticsVersion),projectId:project.path,resolverId,semanticsVersion,language:"typescript-javascript"};
  const conditions=next ? [mode==="browser" ? "browser" : "node",mode.endsWith("production") ? "production" : "development","import","default"] : ["node","node-addons","module-sync","import","default"];
  const variant={id:variantId(profile.id,mode,null,conditions),projectId:project.path,profileId:profile.id,resolverId,environment:mode,platform:null,conditions,configWitnesses:[] as Witness[]};
  // Every package scope used by this resolver is hash-bound, including nested scopes.
  if(records.length>64) throw new AnalysisBoundaryError("resource-limit");
  const nextRecords=next ? discovery.metadata.all().filter(r=>/^next\.config\.|^tsconfig.*\.json$/.test(path.posix.basename(r.resource.path)) && (project.path==="." || r.resource.path.startsWith(root+"/"))) : [];
  if(records.length+nextRecords.length>64) throw new AnalysisBoundaryError("resource-limit");
  variant.configWitnesses=[...records,...nextRecords].map(r=>metadataWitness(r,variant.id)).filter((w):w is Witness=>w!==null);
  const nextConfigs=nextRecords.filter(r=>/^next\.config\./.test(path.posix.basename(r.resource.path))&&path.posix.dirname(r.resource.path)===(root||"."));
  const nextConfig=nextConfigs.length===1 ? nextStaticConfig(nextConfigs[0].text,discovery.boundary) : undefined;
  const unsafeNext=next && (nextConfigs.length>1 || nextConfig && nextConfig.kind!=="object" || prop(nextConfig,"webpack") || prop(nextConfig,"turbopack") || discovery.metadata.issues.some(i=>/^next\.config\./.test(path.posix.basename(i.path))&&path.posix.dirname(i.path)===(root||".")));
  if(!snapshot.analysis.profiles.some(p=>p.id===profile.id)){snapshot.analysis.profiles.push(profile);snapshot.analysis.projects.find(p=>p.projectId===project.path)!.profileIds.push(profile.id);}
  snapshot.analysis.variants.push(variant);
  const cap={tupleId:tuple,capabilityId:next ? "next-runtime" : "node-runtime",profileId:profile.id,variantId:variant.id};
  // Aggregate assessments remain partial, as in FS-01/02. An unknown tuple
  // yields no new verified facts and missing-metadata gaps, never a badge.
  snapshot.analysis.capabilities.push({...cap,id:capabilityId(cap),state:"partial",extractorVersion:semanticsVersion,qualificationRecord:null,gapIds:[]});
  const boundary=(reason:GapReason):NodeResolution=>({state:"boundary",reason});
  const nativeSyntax=new Map<string,boolean>();
  function erasable(file:string) {
    if(next || !/\.[cm]?ts$/.test(file))return true;
    if(nativeSyntax.has(file))return nativeSyntax.get(file)!;
    const source=ts.createSourceFile(file,discovery.sourceInputs.get(file)?.text??"",ts.ScriptTarget.Latest,true),pending:ts.Node[]=[source];let safe=true,visited=0;
    while(pending.length){discovery.boundary.check();const node=pending.pop()!;if(++visited>100000){safe=false;break;}if(ts.isEnumDeclaration(node)||ts.isModuleDeclaration(node)||ts.isDecorator(node)||ts.isImportEqualsDeclaration(node)||ts.isParameter(node)&&node.modifiers?.some(m=>[ts.SyntaxKind.PublicKeyword,ts.SyntaxKind.PrivateKeyword,ts.SyntaxKind.ProtectedKeyword,ts.SyntaxKind.ReadonlyKeyword].includes(m.kind))){safe=false;break;}ts.forEachChild(node,n=>{pending.push(n);});}
    nativeSyntax.set(file,safe);return safe;
  }
  const scope=(from:string)=>records.filter(r=>path.posix.dirname(r.resource.path)==="." || from.startsWith(path.posix.dirname(r.resource.path)+"/")).sort((a,b)=>b.resource.path.length-a.resource.path.length)[0];
  function format(file:string) { const extension=path.posix.extname(file),type=literal(prop(scope(file)?.config.value,"type"));return /\.(?:mjs|mts)$/.test(extension) ? "esm" : /\.(?:cjs|cts)$/.test(extension) ? "cjs" : type==="module" ? "esm" : type==="commonjs" ? "cjs" : "unknown"; }
  const sourceReasons=new Map<string,GapReason|undefined>();
  function sourceReason(file:string):GapReason|undefined {
    if(next)return;
    if(sourceReasons.has(file))return sourceReasons.get(file);
    let reason:GapReason|undefined;
    if(format(file)==="unknown" || /\.(?:jsx|tsx)$/.test(file) || !erasable(file))reason="unsupported-syntax";
    else {
      const source=ts.createSourceFile(file,discovery.sourceInputs.get(file)?.text??"",ts.ScriptTarget.Latest,true);
      if((source as ts.SourceFile & {parseDiagnostics:readonly ts.Diagnostic[]}).parseDiagnostics.length)reason="parse-error";
      else if(format(file)==="cjs" && source.statements.some(s=>ts.isImportDeclaration(s)&&!s.importClause?.isTypeOnly || ts.isExportDeclaration(s)&&!s.isTypeOnly || ts.isExportAssignment(s) || ts.canHaveModifiers(s)&&ts.getModifiers(s)?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword)))reason="unsupported-syntax";
      // The shared TS/JS parser also accepts JSX and typed JavaScript intended
      // for a bundler. Native Node must not inherit that grammar qualification.
      const javascript=/\.[cm]?js$/.test(file),pending:ts.Node[]=[source];let visited=0;
      while(!reason&&pending.length){discovery.boundary.check();const node=pending.pop()!;if(++visited>100000){reason="resource-limit";break;}
        if(ts.isJsxElement(node)||ts.isJsxFragment(node)||ts.isJsxSelfClosingElement(node)||format(file)==="cjs"&&ts.isMetaProperty(node)&&node.keywordToken===ts.SyntaxKind.ImportKeyword || javascript&&(ts.isTypeNode(node)||ts.isTypeParameterDeclaration(node)||ts.isAsExpression(node)||ts.isSatisfiesExpression(node)||ts.isNonNullExpression(node)||ts.isEnumDeclaration(node)||ts.isModuleDeclaration(node)||ts.isImportEqualsDeclaration(node)||ts.isDecorator(node)||(ts.isImportClause(node)||ts.isImportSpecifier(node)||ts.isExportSpecifier(node)||ts.isExportDeclaration(node))&&node.isTypeOnly || ts.canHaveModifiers(node)&&ts.getModifiers(node)?.some(m=>[ts.SyntaxKind.DeclareKeyword,ts.SyntaxKind.AbstractKeyword,ts.SyntaxKind.PublicKeyword,ts.SyntaxKind.PrivateKeyword,ts.SyntaxKind.ProtectedKeyword,ts.SyntaxKind.ReadonlyKeyword,ts.SyntaxKind.OverrideKeyword].includes(m.kind))))reason="unsupported-syntax";
        ts.forEachChild(node,n=>{pending.push(n);});
      }
    }
    sourceReasons.set(file,reason);return reason;
  }
  function select(value:StaticValue|undefined,activeConditions:string[],depth=0):string|undefined {
    discovery.boundary.check();if(depth>32)return;
    if(value?.kind==="literal")return literal(value);
    if(value?.kind!=="object")return;
    // Next's browser/server environment alone does not prove an RSC layer.
    if(next && Object.hasOwn(value.properties,"react-server"))return;
    for(const [key,item] of Object.entries(value.properties)) {
      if(/^\d+$/.test(key))return;
      if(key==="default" || activeConditions.includes(key))return select(item,activeConditions,depth+1);
    }
  }
  function resolve(from:string,specifier:string,kind:"import"|"require"="import"):NodeResolution {
    discovery.boundary.check();
    if(tuple==="unqualified")return boundary("missing-metadata");
    if(unsafeNext)return boundary("custom-resolver");
    if(!next && mode==="browser")return boundary("variant-not-selected");
    if(!next && kind==="require" && format(from)==="esm")return boundary("unsupported-syntax");
    if(!next && format(from)==="unknown")return boundary("unsupported-syntax"); // unspecified-type syntax detection is not qualified
    const fromReason=sourceReason(from);if(fromReason)return boundary(fromReason);
    if(!erasable(from) || !next && /\.(?:jsx|tsx)$/.test(from))return boundary("unsupported-syntax");
    if(!inventory.has(from) || !specifier || specifier.length>16384 || /[\\\0?#%]/.test(specifier) && !specifier.startsWith("#"))return boundary("policy-denied");
    if(builtins.has(specifier.replace(/^node:/,"")))return boundary("external-boundary");
    const active=conditions.filter(c=>c!=="import").concat(kind);
    const metadata=scope(from), value=metadata?.config.value;
    let target:string|undefined,packageTarget=false;
    if(specifier.startsWith(".")) target=path.posix.normalize(path.posix.join(path.posix.dirname(from),specifier));
    else {
      const name=literal(prop(value,"name"));
      const exports=prop(value,"exports"), imports=prop(value,"imports");
      let entry:StaticValue|undefined;
      if(specifier.startsWith("#")) entry=prop(imports,specifier);
      else if(name && exports && (specifier===name || specifier.startsWith(name+"/"))) {
        const sub=specifier===name ? "." : "."+specifier.slice(name.length);
        if(exports.kind==="object" && Object.keys(exports.properties).some(k=>k.startsWith("."))) {
          if(Object.keys(exports.properties).some(k=>!k.startsWith(".") || k.includes("*")))return boundary("unsupported-syntax");
          entry=exports.properties[sub];
        } else if(sub===".") entry=exports;
      } else {
        if(next) {
          const configurations=nextRecords.filter(r=>/^tsconfig\.json$/.test(path.posix.basename(r.resource.path)) && (path.posix.dirname(r.resource.path)==="." || from.startsWith(path.posix.dirname(r.resource.path)+"/"))).sort((a,b)=>b.resource.path.length-a.resource.path.length);
          const record=configurations[0], config=record?.config.value,options=prop(config,"compilerOptions"),paths=prop(options,"paths");
          if(record && (prop(config,"extends")||prop(config,"references")))return boundary("custom-resolver");
          if(paths?.kind==="object") {
            const matches=Object.entries(paths.properties).flatMap(([pattern,value])=>{const star=pattern.indexOf("*"),matched=star<0 ? specifier===pattern ? "" : undefined : pattern.indexOf("*",star+1)<0 && specifier.startsWith(pattern.slice(0,star)) && specifier.endsWith(pattern.slice(star+1)) ? specifier.slice(star,specifier.length-pattern.length+star+1) : undefined;return matched===undefined ? [] : [{value,matched,pattern}];});
            if(matches.length){const match=matches[0];if(matches.length!==1 || match.value.kind!=="array" || match.value.items.length!==1)return boundary("ambiguous-target");const value=literal(match.value.items[0]);if(!value)return boundary("dynamic-expression");const candidate=path.posix.normalize(path.posix.join(path.posix.dirname(record!.resource.path),literal(prop(options,"baseUrl"))??".",value.replace("*",match.matched)));const found=[candidate,candidate+".ts",candidate+".tsx",candidate+".js",candidate+"/index.ts"].filter(f=>inventory.has(f));return found.length>1 ? boundary("ambiguous-target") : found.length===1 && discovery.sourceInputs.get(found[0])?.validUtf8!==false ? {state:"resolved",target:found[0]} : boundary("missing-metadata");}
          }
        }
        return boundary("external-boundary");
      }
      const result=select(entry,active);
      packageTarget=true;
      if(!result?.startsWith("./") || result.split("/").some(p=>p===".." || p==="node_modules"))return boundary("unsupported-syntax");
      target=path.posix.normalize(path.posix.join(path.posix.dirname(metadata!.resource.path),result));
    }
    if(!target || target.startsWith("../") || target.startsWith("/") || target.includes(":"))return boundary("policy-denied");
    if(!inventory.has(target) && !packageTarget && (next || kind==="require")) {
      const candidates=next ? [target+".ts",target+".tsx",target+".js",target+".jsx",target+"/index.ts",target+"/index.tsx",target+"/index.js"] : [target+".js",target+"/index.js"];
      const present=candidates.filter(f=>inventory.has(f));
      if(next && present.length>1)return boundary("ambiguous-target");
      target=present[0];
    }
    if(!target || !inventory.has(target))return boundary("missing-metadata");
    if(discovery.sourceInputs.get(target)?.validUtf8===false)return boundary("unsupported-encoding");
    if(!next && /\.(?:jsx|tsx)$/.test(target))return boundary("unsupported-syntax");
    if(!erasable(target))return boundary("unsupported-syntax");
    if(!next && format(target)==="unknown")return boundary("unsupported-syntax");
    const targetReason=sourceReason(target);if(targetReason)return boundary(targetReason);
    if(!next && kind==="require" && format(target)==="esm")return boundary("unsupported-syntax"); // sync ESM needs a proved no-TLA graph
    return {state:"resolved",target};
  }
  return {variant,tuple,version,resolve,format,sourceReason,pkg,inventory,qualified:tuple!=="unqualified"&&(next||mode!=="browser")};
}
