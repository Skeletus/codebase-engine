import path from "node:path";
import {Node} from "ts-morph";
import type {CodeSnapshot} from "../../engine/types.ts";
import type {FrameworkSource} from "../framework-bindings.ts";
import {frameworkBindings} from "../framework-bindings.ts";
import {factId,type Matcher,type Registration,type Witness} from "../../model/framework.ts";
import {frameworkFact} from "../framework-budget.ts";
import {matchesNavigation} from "./react-router.ts";
import type {FrameworkProjection} from "./rn-platform.ts";
import type {DiscoveredProject,Discovery} from "../../engine/discovery.ts";
import type {metroProfile} from "./metro-profile.ts";
import type {StaticValue} from "../../engine/static-config.ts";
import {metadataWitness} from "../../engine/profiles.ts";
import {AnalysisBoundaryError} from "../../engine/boundary.ts";

/** Expo file-route declarations are selected from protected owned inventory.
 * Generated router/native implementations and runtime configuration stay gaps. */
export function extractExpoRouter(snapshot:CodeSnapshot,discovery:Discovery,project:DiscoveredProject,inputs:FrameworkSource[],profile:ReturnType<typeof metroProfile>,resolve:(from:string,specifier:string)=>string|undefined,projection:FrameworkProjection) {
  const b=frameworkBindings(snapshot,inputs,profile.variant,resolve,()=>discovery.boundary.check(),"fs-07/1",projection);
  const rootPrefix=project.path==="."?"":project.path+"/",paths=inputs.map(i=>i.candidate.path);
  let appRoot=paths.some(p=>p.startsWith(rootPrefix+"src/app/"))?rootPrefix+"src/app/":rootPrefix+"app/";
  const configs=discovery.metadata.all().filter(r=>path.posix.dirname(r.resource.path)===project.path&&/^app(?:\.json|\.config\.)/.test(path.posix.basename(r.resource.path)));
  // A dynamic config may alter route roots/plugins. Retain uncertainty instead
  // of assuming the default tree when that source is present.
  const configProof=configs.flatMap(c=>{const witness=metadataWitness(c,profile.variant.id);return witness?[witness]:[];}),prefixes:string[]=[];
  const field=(v:StaticValue|undefined,k:string)=>v?.kind==="object"?v.properties[k]:undefined;
  const literal=(v:StaticValue|undefined)=>v?.kind==="literal"&&typeof v.value==="string"?v.value:undefined;
  let invalidConfig=configs.length>1||configs.some(c=>c.config.value.kind!=="object"||c.config.gaps.length);
  for(const config of configs){
    const value=field(config.config.value,"expo")??config.config.value;
    const scheme=field(field(value,profile.variant.platform!),"scheme")??field(value,"scheme");
    if(scheme){const names=scheme.kind==="array"?scheme.items:[scheme];if(names.length>64)invalidConfig=true;for(const name of names){const text=literal(name);if(!text||text.length>4096||!/^[a-z][a-z0-9+.-]*$/i.test(text))invalidConfig=true;else prefixes.push(text+"://");}}
    let configuredRoot=field(field(field(value,"extra"),"router"),"root");
    const plugins=field(value,"plugins");
    if(plugins){if(plugins.kind!=="array")invalidConfig=true;else for(const plugin of plugins.items){
      const name=literal(plugin.kind==="array"?plugin.items[0]:plugin),options=plugin.kind==="array"?plugin.items[1]:undefined;
      if(name!=="expo-router"||plugin.kind==="array"&&plugin.items.length>2||options&&options.kind!=="object"){invalidConfig=true;continue;}
      const root=field(options,"root");if(root)configuredRoot=root;
      if(options?.kind==="object"&&Object.keys(options.properties).some(k=>k!=="root"))invalidConfig=true;
    }}
    if(configuredRoot){const raw=literal(configuredRoot),text=raw?.replace(/^\.\//,"");if(!text||text.length>4096||text.startsWith("/")||/[\\:\0]/.test(text)||text.split("/").some(p=>p===".."||p==="."))invalidConfig=true;else appRoot=rootPrefix+path.posix.normalize(text).replace(/\/+$/,"")+"/";}
  }
  const all=inputs.filter(i=>i.candidate.path.startsWith(appRoot));
  if(invalidConfig){
    for(const input of inputs)profile.gap(b.site(input.sourceFile),"dynamic-expression");return;
  }
  const grouped=new Map<string,{input:FrameworkSource;platform:string|null}[]>();
  for(const input of all){
    discovery.boundary.check();const relative=input.candidate.path.slice(appRoot.length),stem=relative.replace(/\.[jt]sx?$/,"");
    if(stem===relative||/(?:^|\/)\+/.test(stem)){profile.gap(b.site(input.sourceFile),"unsupported-syntax");continue;}
    const match=/\.(android|ios|native|web)$/.exec(stem),key=match?stem.slice(0,-match[0].length):stem;
    grouped.set(key,[...grouped.get(key)??[],{input,platform:match?.[1]??null}]);
  }
  const chosen=new Map<string,FrameworkSource>();
  for(const [key,entries]of grouped){
    const base=entries.filter(e=>e.platform===null);
    if(base.length!==1){for(const e of entries)profile.gap(b.site(e.input.sourceFile),base.length?"ambiguous-target":"missing-metadata");continue;}
    const selected=entries.filter(e=>e.platform===profile.variant.platform),native=entries.filter(e=>e.platform==="native"),options=selected.length?selected:native.length?native:base;
    if(options.length!==1){for(const e of options)profile.gap(b.site(e.input.sourceFile),"ambiguous-target");continue;}
    chosen.set(key,options[0].input);
  }
  // Qualified array-group syntax creates distinct logical route contexts from
  // one source file. Do not invent additional files or collapse their IDs.
  const expanded=new Map<string,FrameworkSource>(),collisions=new Set<string>(),arrayKeys=new Set<string>();
  for(const [key,input]of chosen){
    let keys=[""];let invalid=false;
    for(const part of key.split("/")){
      discovery.boundary.check();const match=/^\(([^()]+)\)$/.exec(part),names=match?.[1].includes(",")?match[1].split(","):null;
      if(names&&(new Set(names).size!==names.length||names.some(n=>!n.trim()))){invalid=true;break;}
      const choices=names?names.map(n=>"("+n.trim()+")"):[part],next:string[]=[];
      for(const prefix of keys)for(const choice of choices){discovery.boundary.check();if(next.length>=10000)throw new AnalysisBoundaryError("resource-limit");next.push(prefix?prefix+"/"+choice:choice);}keys=[...new Set(next)];
    }
    if(invalid){profile.gap(b.site(input.sourceFile),"unsupported-matcher");continue;}
    for(const logical of keys){
      if(collisions.has(logical)){profile.gap(b.site(input.sourceFile),"ambiguous-target");continue;}
      const previous=expanded.get(logical);if(previous){profile.gap(b.site(previous.sourceFile),"ambiguous-target");profile.gap(b.site(input.sourceFile),"ambiguous-target");expanded.delete(logical);collisions.add(logical);continue;}
      if(expanded.size>=10000)throw new AnalysisBoundaryError("resource-limit");expanded.set(logical,input);if(logical!==key)arrayKeys.add(logical);
    }
  }
  chosen.clear();for(const [key,input]of expanded)chosen.set(key,input);
  const layouts=[...chosen].filter(([key])=>path.posix.basename(key)==="_layout");
  const packageRecord=discovery.metadata.all().find(r=>r.resource.path===rootPrefix+"package.json"),packageJson=packageRecord?.json;
  if(packageJson&&typeof packageJson==="object"&&!Array.isArray(packageJson)&&"main"in packageJson&&packageJson.main==="expo-router/entry"){
    const layout=chosen.get("_layout"),target=layout?b.exported(layout.sourceFile,"default"):undefined;
    if(layout&&target?.callable)b.bind("entry-point",layout.sourceFile,target,"expo-router/package-entry-root",layout.candidate.path,[...configProof,...profile.variant.configWitnesses]);
    else{const proof=packageRecord?metadataWitness(packageRecord,profile.variant.id):undefined;if(proof&&proof.role!=="framework-rule")profile.gap(proof.site,"generated-code-unavailable");}
  }
  for(const [key,input]of chosen){
    if(path.posix.basename(key)==="_layout")continue;
    const components=key.split("/"),groups=components.filter(p=>/^\([^()]+\)$/.test(p)),segments:Extract<Matcher,{state:"supported"}>["segments"]=[];
    let unsupported=false;
    for(const [index,part]of components.entries()){
      if(/^\([^()]+\)$/.test(part)||part==="index"&&index===components.length-1)continue;
      const catchAll=/^\[\.\.\.([^\[\]]+)\]$/.exec(part),dynamic=/^\[([^\[\]]+)\]$/.exec(part);
      if(catchAll)segments.push({kind:"catchAll",name:catchAll[1],optional:false});else if(dynamic)segments.push({kind:"parameter",name:dynamic[1],converter:"segment"});else if(/[\[\]()]/.test(part))unsupported=true;else segments.push({kind:"literal",value:part});
    }
    if(segments.some((s,i)=>s.kind==="catchAll"&&i!==segments.length-1)||new Set(segments.filter(s=>s.kind!=="literal").map(s=>s.name)).size!==segments.filter(s=>s.kind!=="literal").length)unsupported=true;
    const occurrence=b.site(input.sourceFile),target=b.exported(input.sourceFile,"default"),gaps:string[]=[];
    if(!target?.callable){profile.gap(occurrence,"ambiguous-target");gaps.push(factId("gap",occurrence,profile.variant.id,"ambiguous-target"));}
    if(unsupported){profile.gap(occurrence,"unsupported-matcher");gaps.push(factId("gap",occurrence,profile.variant.id,"unsupported-matcher"));}
    const rawPattern=arrayKeys.has(key)?"/"+components.filter((p,i)=>p!=="index"||i!==components.length-1).map(p=>/^\[\.\.\./.test(p)?"*"+p.slice(4,-1):/^\[/.test(p)?":"+p.slice(1,-1):p).join("/"):"/"+segments.map(s=>s.kind==="literal"?s.value:s.kind==="parameter"?":"+s.name:"*"+s.name).join("/");
    const prefixWitnesses:Witness[]=arrayKeys.has(key)?[{role:"framework-rule",tupleId:profile.tuple!,ruleId:"expo-router/array-group-context:"+key,extractor:"react-native",extractorVersion:"fs-07/1",variantId:profile.variant.id}]:[];
    const id=factId("registration:navigation",occurrence,profile.variant.id,rawPattern);
    const layoutProof=layouts.filter(([layout])=>path.posix.dirname(layout)==="."||key.startsWith(path.posix.dirname(layout)+"/")).map(([,layout])=>b.witness(b.site(layout.sourceFile)));
    const witnesses:Witness[]=[b.witness(occurrence,"registration"),...prefixWitnesses,...layoutProof,...configProof,...profile.variant.configWitnesses,{role:"framework-rule",tupleId:profile.tuple!,ruleId:"expo-router/file-route/"+project.versions["expo-router"],extractor:"react-native",extractorVersion:"fs-07/1",variantId:profile.variant.id},...(target?.callable?[b.witness(target.site,"declaration")]:[])];
    if(witnesses.length>180){profile.gap(occurrence,"resource-limit");continue;}
    if(snapshot.analysis.registrations.length>=10000)throw new AnalysisBoundaryError("resource-limit");
    frameworkFact(snapshot,occurrence.file);
    const registration:Registration={id,kind:"navigation",handlerId:target?.callable?target.id:null,variantId:profile.variant.id,occurrence,rawPattern,methodState:null,matcher:unsupported?{state:"unsupported",gapId:factId("gap",occurrence,profile.variant.id,"unsupported-matcher")}:{state:"supported",segments,trailingSlash:"optional",caseSensitive:true,decodingPolicy:"percent-decode-segments"},precedence:null,conditions:["expo-root:"+appRoot,...groups.map(g=>"group:"+g.slice(1,-1)),...prefixes.map(p=>"linking-prefix:"+p)],prefixWitnesses,witnesses,legacyRouteIndex:null,gapIds:gaps};
    snapshot.analysis.registrations.push(registration);b.bind("registration",input.sourceFile,id,"expo-router/file-registration",input.candidate.path,layoutProof);
    for(const [,layout]of layouts.filter(([layout])=>path.posix.dirname(layout)==="."||key.startsWith(path.posix.dirname(layout)+"/"))){const owner=b.exported(layout.sourceFile,"default");if(owner?.callable&&target?.callable)b.bind("component-reference",layout.sourceFile,target,"expo-router/layout-composition",layout.candidate.path,[b.witness(owner.site,"declaration"),...witnesses]);else profile.gap(b.site(layout.sourceFile),"ambiguous-target");}
  }
  function navigate(node:Node,argument:Node|undefined){
    const destination=argument&&Node.isStringLiteral(argument)?argument.getLiteralText():undefined;
    if(!destination){b.gap(node);return;}
    if(!destination.startsWith("/")){b.gap(node,/^[a-z][a-z0-9+.-]*:/i.test(destination)?"unknown-origin":"unsupported-syntax");return;}
    const requestedGroups=destination.split("/").filter(p=>/^\([^()]+\)$/.test(p)).map(p=>p.slice(1,-1)),pathname=destination.split("/").filter(p=>!/^\([^()]+\)$/.test(p)).join("/");
    const matches=snapshot.analysis.registrations.filter(r=>r.variantId===profile.variant.id&&r.conditions.includes("expo-root:"+appRoot)&&(!requestedGroups.length||JSON.stringify(r.conditions.filter(c=>c.startsWith("group:")).map(c=>c.slice(6)))===JSON.stringify(requestedGroups))&&matchesNavigation(r.matcher,pathname));
    if(matches.length!==1){b.gap(node,"ambiguous-target");return;}
    b.bind("navigation",node,matches[0].id,"expo-router/literal-href",undefined,matches[0].witnesses);
  }
  for(const input of inputs)for(const node of input.sourceFile.getDescendants()){
    discovery.boundary.check();if(!projection.active(node))continue;
    if(Node.isJsxSelfClosingElement(node)||Node.isJsxOpeningElement(node)){
      const api=b.api(node.getTagNameNode());if(api?.module!=="expo-router"||!["Link","Redirect"].includes(api.name))continue;
      const attrs=node.getAttributes(),href=attrs.filter(a=>Node.isJsxAttribute(a)&&a.getNameNode().getText()==="href");
      if(attrs.some(a=>Node.isJsxSpreadAttribute(a))||href.length!==1){b.gap(node);continue;}
      const raw=Node.isJsxAttribute(href[0])?href[0].getInitializer():undefined;navigate(node,raw&&Node.isJsxExpression(raw)?raw.getExpression():raw);
    }
    if(Node.isCallExpression(node)){
      const api=b.api(node.getExpression());if(api?.module==="expo-router"&&["router.push","router.replace","router.navigate"].includes(api.name))navigate(node,node.getArguments()[0]);
    }
  }
}
