import { createResolutionProfile } from "../profiles.ts";
import { djangoDispatch } from "./django-dispatch.ts";
import { djangoRules } from "./django-rules.ts";
import path from "node:path";
import type { AsyncLanguageExtension } from "../coordinator.ts";
import type { Selection } from "../../parser/index.ts";
import type { CodeSnapshot } from "../types.ts";
import type { Declaration, Site } from "../../model/behavior.ts";
import { capabilityId, contextualBindingId, contextualRegistrationId, factId, profileId, variantId, type GapReason, type Matcher, type MethodState, type Witness, type FrameworkBinding } from "../../model/framework.ts";
import { PythonParserWorker, ParserWorkerError } from "../parser-worker.ts";
import { pythonSource } from "./python-source.ts";
import { djangoLiteral, djangoString, splitDjango, type DjangoLiteral } from "./django-literals.ts";
import type { DjangoSyntax } from "./django-syntax.ts";
import type { PythonOptions } from "./python.ts";
import { validateSnapshot } from "../contract.ts";
import { frameworkFact } from "../../parser/framework-budget.ts";

export type DjangoOptions = PythonOptions & { settingsModules?: Readonly<Record<string, readonly string[]>> };
type RecordInput = { file: string; owner: string; source: ReturnType<typeof pythonSource>; syntax: DjangoSyntax };
const version = "fs-06/1";
function coversDispatch(methods: MethodState, targets: {method:string}[]): boolean { return methods.state === "known" && methods.values.every(value => targets.some(target => target.method === value)); }
const identifier = /^[\p{L}_][\p{L}\p{N}_]*(?:\.[\p{L}_][\p{L}\p{N}_]*)*$/u;

export function djangoExtension(options: DjangoOptions): AsyncLanguageExtension {
  const cache = new Map<string, { hash: string; syntax: DjangoSyntax }>();
  return { reset() { cache.clear(); }, async analyze(snapshot, selection, full) {
    const projects = selection.walk.discovery.projects.filter(p => p.languageDependencies.python?.includes("django"));
    if (!projects.length) return { snapshot, parsed: 0, reused: 0 };
    const inheritedBindings=snapshot.analysis.bindings.length;
    // An apps.py-only discovery root keeps its original owner. It may join a
    // parent Django analysis only through that parent's literal INSTALLED_APPS.
    // Independent package/manage roots and dependency declarations never join.
    const appParents=new Map<string,string>();
    for(const candidate of selection.walk.discovery.projects){
      if(!candidate.declarations.length||candidate.declarations.some(d=>path.posix.basename(d)!=="apps.py")||candidate.dependencies.length||selection.walk.discovery.metadata.all().some(r=>path.posix.dirname(r.resource.path)===candidate.path&&/^(?:requirements|pyproject\.toml$|package\.json$)/.test(path.posix.basename(r.resource.path))))continue;
      const parent=projects.filter(p=>p.path!==candidate.path&&(p.path==="."||candidate.path.startsWith(p.path+"/"))).sort((a,b)=>b.path.length-a.path.length)[0];
      if(parent)appParents.set(candidate.path,parent.path);
    }
    if (full) cache.clear(); const records: RecordInput[] = []; let worker: PythonParserWorker | undefined, parsed=0,reused=0;
    const started=performance.now();
    try {
      for(const file of snapshot.files.filter(f=>f.path.endsWith(".py"))) {
        selection.walk.discovery.boundary.check(); if(options.signal?.aborted)throw new ParserWorkerError("cancelled");
        if(performance.now()-started>=120000)throw new ParserWorkerError("resource-limit");
        const owner=selection.walk.discovery.inventory.find(f=>f.path===file.path)?.owner;
        if(!owner||!projects.some(p=>p.path===owner)&&!appParents.has(owner))continue;
        const bytes=selection.reader.read(path.resolve(selection.root,file.path),"source"),source=pythonSource(bytes);
        if(source.hash!==file.hash)throw Error("unstable_generation");
        let syntax=cache.get(file.path)?.hash===file.hash?structuredClone(cache.get(file.path)!.syntax):undefined;
        if(syntax)reused++;else {worker??=new PythonParserWorker(options.host,options.signal);if(!parsed)await worker.start();syntax=await worker.parseDjango(file.path,bytes);parsed++;cache.set(file.path,{hash:file.hash,syntax:structuredClone(syntax)});}
        records.push({file:file.path,owner,source,syntax});
      }
    }finally{await worker?.close();}
    for(const project of projects) {
      const candidates=records.filter(r=>r.owner===project.path||appParents.get(r.owner)===project.path);let owned=records.filter(r=>r.owner===project.path);const associated=new Set<string>();const roots=[...new Set(options.moduleRoots?.[project.path]??[project.path])].sort();
      const modules=new Map<string,RecordInput[]>();for(const r of candidates)for(const root of roots){const relative=path.posix.relative(root,r.file);if(relative.startsWith("../"))continue;const key=relative.replace(/(?:\/__init__)?\.py$/,"").replaceAll("/",".");modules.set(key,[...modules.get(key)??[],r]);}
      const findModule=(key:string)=>{const values=modules.get(key)?.filter(r=>r.owner===project.path||associated.has(r.owner));return values?.length===1?values[0]:null;};
      const requestedSettings=options.settingsModules?.[project.path];if(requestedSettings&&(requestedSettings.length>64||requestedSettings.some(s=>!identifier.test(s))))throw Error("Invalid Django settings selection");
      const settings=requestedSettings?[...new Set(requestedSettings)]:undefined;
      const discovered=owned.filter(r=>r.syntax.inputs.some(i=>i.kind==="assignment"&&i.ownerStart===null&&i.name==="ROOT_URLCONF"));
      const selected=settings?settings.map(findModule).filter((r):r is RecordInput=>r!==null):discovered;
      const variants=selected.length?selected:[owned.find(r=>r.syntax.inputs.length)??owned[0]].filter((r):r is RecordInput=>!!r);
      for(const configuration of variants) {
        associated.clear();owned=records.filter(r=>r.owner===project.path);
        const profile={id:profileId(project.path,"django-static",version),projectId:project.path,resolverId:"django-static",semanticsVersion:version,language:"python"};
        const conditions=["settings:"+configuration.file,...roots.map(root=>"module-root:"+root)];
        const variant={id:variantId(profile.id,"static-python-declared-environment",null,conditions),projectId:project.path,profileId:profile.id,resolverId:profile.resolverId,environment:"static-python-declared-environment",platform:null,conditions,configWitnesses:[] as Witness[]};
        if(!snapshot.analysis.profiles.some(p=>p.id===profile.id)){snapshot.analysis.profiles.push(profile);snapshot.analysis.projects.find(p=>p.projectId===project.path)!.profileIds.push(profile.id);}
        snapshot.analysis.variants.push(variant);
        const extractors=snapshot.analysis.projects.find(p=>p.projectId===project.path)!.extractors;
        if(!extractors.includes("django/"+version))extractors.push("django/"+version);
        const py=selection.walk.discovery.metadata.all().find(r=>r.resource.path===path.posix.join(project.path,"pyproject.toml"));
        const python=py?.config.value.kind==="object"?py.config.value.properties["project.requires-python"]:undefined;
        const pythonVersion=python?.kind==="literal"?python.value:null;
        const tuple=project.versions.django==="5.2.18"&&project.versions.djangorestframework==="3.16.1"&&pythonVersion==="==3.12.15"?"django52":project.versions.django==="6.0.9"&&project.versions.djangorestframework==="3.17.2"&&pythonVersion==="==3.13.16"?"django60":"django-unqualified";
        const key={tupleId:tuple,capabilityId:"django-drf-static",profileId:profile.id,variantId:variant.id};const cap={...key,id:capabilityId(key),state:"partial" as const,extractorVersion:version,qualificationRecord:null,gapIds:[] as string[]};snapshot.analysis.capabilities.push(cap);
        const witness=(site:Site,role:"registration"|"reference"|"declaration"|"configuration"="reference"):Witness=>({site,role,extractorVersion:version,variantId:variant.id});
        const rule=(ruleId:string):Witness=>({role:"framework-rule",tupleId:tuple,ruleId,extractor:"django",extractorVersion:version,variantId:variant.id});
        const gap=(site:Site,reason:GapReason)=>{const id=factId("gap",site,variant.id,reason);if(!snapshot.analysis.gaps.some(g=>g.id===id)){frameworkFact(snapshot,site.file);snapshot.analysis.gaps.push({id,reason,occurrence:site,variantId:variant.id,capabilityId:cap.id});cap.gapIds.push(id);}return id;};
        const bind=(sourceId:string,targetId:string,kind:FrameworkBinding["kind"],site:Site,proof:Witness[])=>{const id=contextualBindingId(kind,site,variant.id,sourceId,targetId);const existing=snapshot.analysis.bindings.find(b=>b.id===id);if(!existing){if(snapshot.analysis.bindings.length-inheritedBindings>=20000)throw new ParserWorkerError("resource-limit");frameworkFact(snapshot,site.file);snapshot.analysis.bindings.push({id,kind,sourceId,targetId,variantId:variant.id,occurrence:site,witnesses:[witness(site),...proof]});}else if(existing.sourceId===sourceId){for(const evidence of proof)if(!existing.witnesses.some(w=>JSON.stringify(w)===JSON.stringify(evidence)))existing.witnesses.push(evidence);}};
        const check=()=>{selection.walk.discovery.boundary.check();if(options.signal?.aborted)throw new ParserWorkerError("cancelled");if(performance.now()-started>=120000||snapshot.analysis.registrations.length>10000||snapshot.analysis.bindings.length-inheritedBindings>20000)throw new ParserWorkerError("resource-limit");};
        const imports=(r:RecordInput)=>snapshot.analysis.bindings.filter(b=>b.kind==="module-export"&&b.occurrence.file===r.file);
        const declarations=(r:RecordInput,name:string)=>snapshot.behavior.declarations.filter(d=>d.site.file===r.file&&d.name.normalize("NFKC")===name.normalize("NFKC"));
        const canonical=(r:RecordInput,text:string):string|null=>{
          if(!identifier.test(text))return null;const [first,...rest]=text.split(".");
          const candidates=r.syntax.inputs.filter(i=>i.kind==="import"&&i.name===first&&i.ownerStart===null&&!i.conditional&&/^(django|rest_framework)(\.|$)/.test(i.value)).map(i=>{const original=r.source.text.slice(i.site.start,i.site.end);return original.includes(" as ")||i.value.split(".").at(-1)===first?[i.value,...rest].join("."):text;});
          if(candidates.length!==1||r.syntax.malformed||r.syntax.inputs.some(i=>i.kind==="assignment"&&i.ownerStart===null&&(i.name===first||i.name.startsWith(first+".")))||declarations(r,first).length)return null;
          const namespace=candidates[0].split(".")[0];
          if(roots.some(root=>snapshot.files.some(f=>f.path===path.posix.join(root,namespace+".py")||f.path===path.posix.join(root,namespace,"__init__.py")))){const input=r.syntax.inputs.find(i=>i.kind==="import"&&i.name===first);if(input)gap(input.site,"custom-resolver");return null;}
          return candidates[0];
        };
        const resolve=(r:RecordInput,text:string):Declaration|null=>{
          if(!identifier.test(text)||snapshot.behavior.gaps.some(g=>g.site.file===r.file&&["dynamic-binding-boundary","mutable-binding-boundary","unsupported-binding-scope"].includes(g.reason)))return null;
          const own=declarations(r,text).filter(d=>!snapshot.behavior.declarations.some(parent=>parent.id!==d.id&&parent.site.file===d.site.file&&["function","method","class"].includes(parent.kind)&&parent.site.start<d.site.start&&parent.site.end>=d.site.end));
          if(own.length===1&&!r.syntax.inputs.some(i=>i.kind==="assignment"&&i.ownerStart===null&&i.name===text))return r.syntax.inputs.some(i=>(i.kind==="class"||i.kind==="function")&&i.site.start===own[0].site.start&&i.conditional)?null:own[0];
          const [first,...rest]=text.split(".");const imported=r.syntax.inputs.filter(i=>i.kind==="import"&&i.ownerStart===null&&!i.conditional&&i.name===first);
          if(imported.length===1&&!r.syntax.inputs.some(i=>i.kind==="assignment"&&i.ownerStart===null&&i.name===first)&&!declarations(r,first).length){const input=imported[0],original=r.source.text.slice(input.site.start,input.site.end);let expanded=original.includes(" as ")||input.value.split(".").at(-1)===first?[input.value,...rest].join("."):text;const dots=/^\.+/.exec(expanded)?.[0].length??0;if(dots){const root=roots.find(root=>!path.posix.relative(root,r.file).startsWith("../"));if(root){const parts=path.posix.relative(root,path.posix.dirname(r.file)).split("/").filter(v=>v&&v!==".");if(dots>parts.length)return null;parts.splice(parts.length-dots+1);expanded=[...parts,expanded.slice(dots)].filter(Boolean).join(".");}}const pieces=expanded.split("."),name=pieces.pop()!,target=findModule(pieces.join("."));if(target){const ds=declarations(target,name).filter(d=>!snapshot.behavior.declarations.some(parent=>parent.id!==d.id&&parent.site.file===d.site.file&&["function","method","class"].includes(parent.kind)&&parent.site.start<d.site.start&&parent.site.end>=d.site.end));if(ds.length===1&&!target.syntax.inputs.some(i=>(i.kind==="class"||i.kind==="function")&&i.site.start===ds[0].site.start&&i.conditional)&&!target.syntax.inputs.some(i=>i.kind==="assignment"&&i.ownerStart===null&&i.name===name)&&!snapshot.behavior.gaps.some(g=>g.site.file===target.file&&["dynamic-binding-boundary","mutable-binding-boundary","unsupported-binding-scope"].includes(g.reason)))return ds[0];}}
          const bound=imports(r).filter(b=>r.source.text.slice(b.occurrence.start,b.occurrence.end).split(/\s+as\s+/).at(-1)===text);if(bound.length===1)return snapshot.behavior.declarations.find(d=>d.id===bound[0].targetId)??null;
          if(text.includes(".")){const parts=text.split("."),name=parts.pop()!,request=parts.join(".");const edges=snapshot.relationships.filter(e=>e.source===r.file);const target=findModule(request);if(target&&edges.some(e=>e.target===target.file)){const ds=declarations(target,name);return ds.length===1?ds[0]:null;}}
          return null;
        };
        const configAssignments=(r:RecordInput,name:string)=>r.syntax.inputs.filter(i=>i.kind==="assignment"&&i.ownerStart===null&&i.name===name);
        const importedConstant=(r:RecordInput,name:string):{record:RecordInput;name:string;site:Site}|null=>{
          const candidates=r.syntax.inputs.filter(i=>i.kind==="import"&&i.name===name&&i.ownerStart===null&&!i.conditional);
          if(candidates.length!==1)return null;const input=candidates[0];let expanded=input.value;
          const dots=/^\.+/.exec(expanded)?.[0].length??0;
          if(dots){const root=roots.find(root=>!path.posix.relative(root,r.file).startsWith("../"));if(!root)return null;const parts=path.posix.relative(root,path.posix.dirname(r.file)).split("/").filter(v=>v&&v!==".");if(dots>parts.length)return null;parts.splice(parts.length-dots+1);expanded=[...parts,expanded.slice(dots)].filter(Boolean).join(".");}
          const parts=expanded.split("."),targetName=parts.pop()!,target=findModule(parts.join("."));return target?{record:target,name:targetName,site:input.site}:null;
        };
        const literal=(r:RecordInput,text:string,seen=new Set<string>()):{value:DjangoLiteral;proof:Witness[];site?:Site}|null=>{
          const value=djangoLiteral(text);if(value!==null)return {value,proof:[]};const key=r.file+":"+text;if(!identifier.test(text)||seen.has(key)||seen.size>=32)return null;seen.add(key);
          const values=configAssignments(r,text);if(values.length){if(values.length!==1||values[0].conditional||r.syntax.inputs.some(i=>i.kind==="import"&&i.ownerStart===null&&i.name===text||i.kind==="call"&&i.name.startsWith(text+".")||i.kind==="assignment"&&(i.name.startsWith(text+".")||i.name.startsWith(text+"["))))return null;const answer=literal(r,values[0].value,seen);return answer?{value:answer.value,proof:[witness(values[0].site,"configuration"),...answer.proof],site:values[0].site}:null;}
          const inherited=importedConstant(r,text);if(!inherited)return null;const answer=literal(inherited.record,inherited.name,seen);return answer?{value:answer.value,proof:[witness(inherited.site,"configuration"),...answer.proof],site:inherited.site}:null;
        };
        const setting=(name:string)=>{const answer=literal(configuration,name);if(answer?.site)return {value:answer.value,proof:answer.proof,site:answer.site};const assignment=configAssignments(configuration,name)[0];if(assignment)gap(assignment.site,"dynamic-expression");return null;};
        const installed=setting("INSTALLED_APPS");
        if(installed&&Array.isArray(installed.value))for(const value of installed.value){
          if(typeof value!=="string"||!identifier.test(value))continue;
          const app=value.replace(/\.apps\.[\w]+$/,"");
          for(const root of roots){const directory=path.posix.join(root,app.replaceAll(".","/"));if(appParents.get(directory)===project.path)associated.add(directory);}
        }
        owned=candidates.filter(r=>r.owner===project.path||associated.has(r.owner));
        const root=settings&&selected.length===0?null:setting("ROOT_URLCONF");variant.configWitnesses=[...createResolutionProfile(selection.walk.discovery,project,"python-package").variant.configWitnesses.map(w=>({...w,variantId:variant.id})),...(root?[witness(root.site,"configuration"),...root.proof]:[]),...(installed?[witness(installed.site,"configuration"),...installed.proof]:[])];
        if(settings&&selected.length!==settings.length){const site=configuration.syntax.inputs[0]?.site;if(site)gap(site,"missing-metadata");}
        if(!settings&&discovered.length!==1){const site=configuration.syntax.inputs[0]?.site??snapshot.behavior.declarations.find(d=>d.site.file===configuration.file)?.site;if(site)gap(site,"variant-not-selected");}
        if(tuple==="django-unqualified"&&configuration.syntax.inputs[0])gap(configuration.syntax.inputs[0].site,"missing-metadata");
        const view=(r:RecordInput,expression:string):{handler:Declaration|null;methods:MethodState;proof:Witness[];targets:{method:string;declaration:Declaration}[]}=>{
          const direct=resolve(r,expression);if(direct?.callable){const target=owned.find(r=>r.file===direct.site.file)!,decorators=target.syntax.inputs.filter(i=>i.kind==="decorator"&&i.ownerStart===direct.site.start);let dispatchTargets:{method:string;declaration:Declaration}[]=[];let methods:MethodState={state:tuple==="django-unqualified"?"unknown":"all",values:[]};
            const supported=decorators.length<=1&&decorators.every(d=>{const name=d.name.split("(")[0],api=canonical(target,name);if(api==="rest_framework.decorators.api_view"||api==="django.views.decorators.http.require_http_methods"){const args=/\(([\s\S]*)\)$/.exec(d.name),list=args?djangoLiteral(args[1].trim()|| (api==="rest_framework.decorators.api_view"?"['GET']":"")):null;if(api==="rest_framework.decorators.api_view"&&Array.isArray(list))dispatchTargets=list.map(v=>({method:String(v).toUpperCase(),declaration:direct}));if(!Array.isArray(list)||!list.length||!list.every(v=>typeof v==="string"&&/^[A-Za-z]+$/.test(v)))return false;methods=tuple==="django-unqualified"?{state:"unknown",values:[]}:{state:"known",values:[...new Set([...list.map(v=>String(v).toUpperCase()),...(api==="rest_framework.decorators.api_view"?["OPTIONS"]:[])])].sort()};return true;}if(api==="django.views.decorators.http.require_GET"){methods={state:"known",values:["GET"]};return tuple!=="django-unqualified";}if(api==="django.views.decorators.http.require_POST"){methods={state:"known",values:["POST"]};return tuple!=="django-unqualified";}if(api==="django.views.decorators.http.require_safe"){methods={state:"known",values:["GET","HEAD"]};return tuple!=="django-unqualified";}return false;});
            const exact=supported&&decorators.every(d=>{if(canonical(target,d.name.split("(")[0])!=="django.views.decorators.http.require_http_methods")return true;const args=/\(([\s\S]*)\)$/.exec(d.name),value=args?djangoLiteral(args[1]):null;return Array.isArray(value)&&value.every(method=>typeof method==="string"&&method===method.toUpperCase());});
            return {handler:exact&&(!dispatchTargets.length||coversDispatch(methods,dispatchTargets))?direct:null,methods:exact?methods:{state:"unknown",values:[]},proof:[witness(direct.site,"declaration"),...r.syntax.inputs.filter(i=>i.kind==="import"&&i.name===expression.split(".")[0]).map(i=>witness(i.site)),...decorators.map(d=>witness(d.site)),...(tuple!=="django-unqualified"?[rule("fbv-dispatch-and-http-decorators")]:[])],targets:exact?dispatchTargets:[]};}
          const factory=/^([\w.]+)\.as_view\(\s*\)$/.exec(expression),klass=factory?resolve(r,factory[1]):null;
          if(klass){const mutation=owned.flatMap(record=>record.syntax.inputs.map(input=>({record,input}))).find(({record,input})=>{const name=input.kind==="assignment"&&input.name.includes(".")?input.name.slice(0,input.name.lastIndexOf(".")):input.kind==="call"&&["setattr","delattr"].includes(input.name)?input.arguments[0]?.text:null;if(!name||["self","cls"].includes(name))return false;return resolve(record,name)?.id===klass.id||record.file===klass.site.file&&name===klass.name||record.syntax.inputs.some(i=>i.kind==="import"&&i.name===name&&i.value.endsWith("."+klass.name));});if(mutation){gap(mutation.input.site,"custom-resolver");return {handler:null,methods:{state:"unknown",values:[]},proof:[],targets:[]};}}
          if(klass?.kind==="class") {const dispatch=djangoDispatch(tuple,klass,declaration=>{const record=owned.find(r=>r.file===declaration.site.file),input=record?.syntax.inputs.find(i=>i.kind==="class"&&i.site.start===declaration.site.start);if(!record||!input||record.syntax.inputs.some(i=>i.kind==="decorator"&&i.ownerStart!==null&&i.ownerStart>=declaration.site.start&&i.ownerStart<=declaration.site.end))return null;const members=snapshot.behavior.declarations.filter(d=>d.kind==="method"&&d.site.file===record.file&&d.site.start>declaration.site.start&&d.site.end<=declaration.site.end&&!snapshot.behavior.declarations.some(inner=>inner.kind==="class"&&inner.id!==declaration.id&&inner.site.file===record.file&&inner.site.start>declaration.site.start&&inner.site.start<d.site.start&&inner.site.end>=d.site.end));return {declaration,input,members,assignments:record.syntax.inputs.filter(i=>i.kind==="assignment"&&i.ownerStart===declaration.site.start),canonical:name=>canonical(record,name),resolve:name=>resolve(record,name)};});
            if(dispatch)return {handler:new Set(dispatch.targets.map(t=>t.declaration.id)).size===1&&dispatch.methods.every(m=>dispatch.targets.some(t=>t.method===m))?dispatch.targets[0].declaration:null,methods:{state:"known",values:dispatch.methods},proof:[...dispatch.proof.map(site=>witness(site,"declaration")),...r.syntax.inputs.filter(i=>i.kind==="import"&&i.name===factory![1].split(".")[0]).map(i=>witness(i.site)),rule("cbv-c3-dispatch-head-options")],targets:dispatch.targets};
          }
          return {handler:null,methods:{state:"unknown",values:[]},proof:[],targets:[]};
        };
        const matcher=(raw:string,regex:boolean,site:Site):Matcher=>{
          if(tuple==="django-unqualified"||regex&&!/^\^[A-Za-z0-9_/-]*\$/.test(raw)||raw.startsWith("/")||raw.includes("//"))return {state:"unsupported",gapId:gap(site,"unsupported-matcher")};
          if(regex){raw=raw.replace(/^\^/,"").replace(/\$/,"");}
          const segments:Extract<Matcher,{state:"supported"}>["segments"]=[],names=new Set<string>();
          for(const part of raw.split("/").filter(Boolean)){const parameter=/^<(?:(\w+):)?(\w+)>$/.exec(part);if(parameter){const converter=parameter[1]??"str",name=parameter[2];if(names.has(name)||!["str","int","slug","uuid","path"].includes(converter)||converter==="path"&&part!==raw.split("/").filter(Boolean).at(-1))return {state:"unsupported",gapId:gap(site,"unsupported-matcher")};names.add(name);segments.push(converter==="path"?{kind:"catchAll",name,optional:false}:{kind:"parameter",name,converter:({str:"segment",int:"integer",slug:"slug",uuid:"uuid"} as const)[converter as "str"|"int"|"slug"|"uuid"]});}else if(/[<>%?#^$()[\]{}+*|\\]/.test(part))return {state:"unsupported",gapId:gap(site,"unsupported-matcher")};else segments.push({kind:"literal",value:part});}
          return {state:"supported",segments,trailingSlash:raw.endsWith("/")?"required":"forbidden",caseSensitive:true,decodingPolicy:"raw"};
        };
        let order=0;
        const defaultFormatSettings=()=>{
          const declared=configAssignments(configuration,"REST_FRAMEWORK").length||configuration.syntax.inputs.some(i=>i.kind==="import"&&i.name==="REST_FRAMEWORK");
          if(!declared)return true;
          const settings=setting("REST_FRAMEWORK");
          return !!settings&&!!settings.value&&typeof settings.value==="object"&&!Array.isArray(settings.value)&&(!Object.hasOwn(settings.value,"FORMAT_SUFFIX_KWARG")||settings.value.FORMAT_SUFFIX_KWARG==="format");
        };
        const routerRoutes=(r:RecordInput,variable:string,prefix:string,proof:Witness[],namespace:string,site:Site):boolean=>{
          const assignments=configAssignments(r,variable);if(assignments.length!==1||assignments[0].conditional)return false;
          const constructor=r.syntax.inputs.find(i=>i.kind==="call"&&i.site.start>=assignments[0].site.start&&i.site.end<=assignments[0].site.end);
          const api=constructor?canonical(r,constructor.name):null;
          if(!constructor||!["rest_framework.routers.SimpleRouter","rest_framework.routers.DefaultRouter"].includes(api??"")){gap(site,"custom-resolver");return false;}
          if(api==="rest_framework.routers.DefaultRouter"&&!defaultFormatSettings()){gap(constructor.site,"custom-resolver");return false;}
          if(constructor.arguments.some(a=>a.name===null||!["trailing_slash","use_regex_path"].includes(a.name)||typeof djangoLiteral(a.text)!=="boolean")){gap(constructor.site,"dynamic-expression");return false;}
          const mutation=r.syntax.inputs.find(i=>i.kind==="assignment"&&(i.name.startsWith(variable+".")||i.name!==variable&&i.value.trim()===variable)||i.kind==="call"&&i.arguments.some(a=>a.text.trim()===variable));
          if(mutation){gap(mutation.site,"dynamic-expression");return false;}
          const slash=constructor.arguments.find(a=>a.name==="trailing_slash")?.text!=="False",regex=constructor.arguments.find(a=>a.name==="use_regex_path")?.text!=="False";
          const registrations=r.syntax.inputs.filter(i=>i.kind==="call"&&i.name===variable+".register").sort((a,b)=>a.site.start-b.site.start);
          for(const call of registrations){check();if(call.conditional||call.site.start>site.start){gap(call.site,"dynamic-expression");continue;}
            const routePrefix=djangoString(call.arguments[0]?.text??""),klass=resolve(r,call.arguments[1]?.text??""),basename=djangoString(call.arguments.find(a=>a.name==="basename")?.text??call.arguments[2]?.text??"");
            if(routePrefix===null||!klass||klass.kind!=="class"||!basename){gap(call.site,"missing-metadata");continue;}
            const record=owned.find(r=>r.file===klass.site.file)!,definition=record.syntax.inputs.find(i=>i.kind==="class"&&i.site.start===klass.site.start),base=definition?.arguments.length===1?canonical(record,definition.arguments[0].text):null;
            if(tuple==="django-unqualified"||!/^rest_framework\.viewsets\.(ViewSet|GenericViewSet|ModelViewSet|ReadOnlyModelViewSet)$/.test(base??"")){gap(call.site,"custom-resolver");continue;}
            const members=snapshot.behavior.declarations.filter(d=>d.kind==="method"&&d.site.file===record.file&&d.site.start>klass.site.start&&d.site.end<=klass.site.end);
            if(members.some(d=>["dispatch","as_view","get_extra_actions","initialize_request","initial"].includes(d.name))||record.syntax.inputs.some(i=>i.kind==="assignment"&&i.ownerStart===klass.site.start&&["lookup_value_regex","lookup_value_converter","lookup_field","lookup_url_kwarg","http_method_names"].includes(i.name))){gap(call.site,"custom-resolver");continue;}
            if(record.syntax.inputs.some(i=>i.kind==="decorator"&&(i.ownerStart===klass.site.start||members.some(d=>d.site.start===i.ownerStart)&&canonical(record,i.name.split("(")[0])!=="rest_framework.decorators.action"))){gap(call.site,"custom-resolver");continue;}
            const actions=new Map(members.map(d=>[d.name,d]));const supports=(name:string)=>actions.has(name)||base?.endsWith("ModelViewSet")&&!base.endsWith("ReadOnlyModelViewSet")||base?.endsWith("ReadOnlyModelViewSet")&&["list","retrieve"].includes(name);
            const lookup=regex?"<regex:pk>":"<str:pk>",suffix=slash?"/":"";
            const plans:{raw:string;name:string;mapping:[string,string][];source:Site;extra:Witness[]}[]=[{raw:routePrefix+suffix,name:basename+"-list",mapping:[["GET","list"],["POST","create"]].filter(([,a])=>supports(a)) as [string,string][],source:call.site,extra:[]},{raw:routePrefix+"/"+lookup+suffix,name:basename+"-detail",mapping:[["GET","retrieve"],["PUT","update"],["PATCH","partial_update"],["DELETE","destroy"]].filter(([,a])=>supports(a)) as [string,string][],source:call.site,extra:[]}];
            for(const decorator of record.syntax.inputs.filter(i=>i.kind==="decorator"&&i.ownerStart!==null).sort((a,b)=>(members.find(d=>d.site.start===a.ownerStart)?.name??"").localeCompare(members.find(d=>d.site.start===b.ownerStart)?.name??""))){
              if(canonical(record,decorator.name.split("(")[0])!=="rest_framework.decorators.action")continue;
              const method=members.find(d=>d.site.start===decorator.ownerStart),actionCall=record.syntax.inputs.find(i=>i.kind==="call"&&i.site.start===decorator.site.start+1);if(!method||!actionCall)continue;
              const detail=djangoLiteral(actionCall.arguments.find(a=>a.name==="detail")?.text??""),methods=djangoLiteral(actionCall.arguments.find(a=>a.name==="methods")?.text??"['get']"),urlPath=djangoString(actionCall.arguments.find(a=>a.name==="url_path")?.text??"" )??method.name,urlName=djangoString(actionCall.arguments.find(a=>a.name==="url_name")?.text??"")??method.name.replaceAll("_","-");
              if(typeof detail!=="boolean"||!Array.isArray(methods)||!methods.length||!methods.every(m=>typeof m==="string"&&/^[A-Za-z]+$/.test(m))||/[<>()[\]{}?*+|\\]/.test(urlPath)){gap(decorator.site,"dynamic-expression");continue;}
              plans.splice(detail?plans.length:plans.findIndex(p=>p.name===basename+"-detail"),0,{raw:routePrefix+"/"+(detail?lookup+"/":"")+urlPath+suffix,name:basename+"-"+urlName,mapping:methods.map(m=>[String(m).toUpperCase(),method.name]),source:decorator.site,extra:[witness(call.site),witness(actionCall.site)]});
            }
            const regexPattern=(raw:string)=>"^"+raw.replace("<regex:pk>","(?P<pk>[^/.]+)")+"$";
            const expanded=plans.filter(p=>p.mapping.length).flatMap(plan=>api==="rest_framework.routers.DefaultRouter"?[{...plan,format:false},{...plan,raw:regex?regexPattern(plan.raw.replace(/\/+$/,"")):plan.raw.replace(/\/+$/,"")+"<drf_format_suffix:format>",format:true}]:[{...plan,format:false}]);
            for(const plan of expanded) {
              const mappings=[...plan.mapping];if(mappings.some(([method])=>method==="GET")&&!mappings.some(([method])=>method==="HEAD"))mappings.push(["HEAD",mappings.find(([method])=>method==="GET")![1]]);
              const sourcePattern=regex?(plan.format?plan.raw.slice(0,-1)+"\\.(?P<format>[a-z0-9]+)/?$":regexPattern(plan.raw)):plan.raw;
              const raw=prefix+(regex&&plan.format?sourcePattern:plan.raw),display="/"+raw,id=contextualRegistrationId("http",plan.source,variant.id,display,proof),targets=[...new Set(mappings.map(([,name])=>actions.get(name)).filter((d):d is Declaration=>!!d))];
              const handler=null,ids:string[]=[];if(!handler)ids.push(gap(plan.source,targets.length?"ambiguous-target":"external-boundary"));
              const match=plan.format||regex&&(!/^\^[A-Za-z0-9_/-]*\$/.test(sourcePattern))?{state:"unsupported" as const,gapId:gap(plan.source,"unsupported-matcher")}:matcher(raw,false,plan.source);if(match.state==="unsupported")ids.push(match.gapId);
              const witnesses=[witness(plan.source,"registration"),witness(constructor.site),witness(klass.site,"declaration"),...proof,...plan.extra,...targets.map(d=>witness(d.site,"declaration")),rule("drf-router:"+api+":action-mapping-and-head-options")];
              if(snapshot.analysis.registrations.length>=10000)throw new ParserWorkerError("resource-limit");frameworkFact(snapshot,plan.source.file);snapshot.analysis.registrations.push({id,kind:"http",handlerId:null,variantId:variant.id,occurrence:plan.source,rawPattern:display,methodState:{state:"known",values:[...new Set([...mappings.map(([m])=>m),"OPTIONS"])].sort()},matcher:match,precedence:order++,conditions:["settings:"+configuration.file,"django-source-pattern:"+sourcePattern,"url-name:"+namespace+plan.name,"router:"+api,"slash:"+(slash?"required":"forbidden")],prefixWitnesses:proof,witnesses,legacyRouteIndex:null,gapIds:ids});
              for(const [method,name]of mappings){const target=actions.get(name);if(target)bind(id,target.id,"lifecycle",plan.source,[...witnesses,rule("drf-action-method:"+method+":"+name)]);}

            }
          }
          if(api==="rest_framework.routers.DefaultRouter"){
            for(const format of [false,true]){
              check();const raw=prefix+(format?"<drf_format_suffix:format>":""),display="/"+raw,id=contextualRegistrationId("http",constructor.site,variant.id,display,proof);
              const ids=[gap(constructor.site,"external-boundary")],match=format?{state:"unsupported" as const,gapId:gap(constructor.site,"unsupported-matcher")}:matcher(raw,false,constructor.site);if(match.state==="unsupported")ids.push(match.gapId);
              if(snapshot.analysis.registrations.length>=10000)throw new ParserWorkerError("resource-limit");
              frameworkFact(snapshot,constructor.site.file);snapshot.analysis.registrations.push({id,kind:"http",handlerId:null,variantId:variant.id,occurrence:constructor.site,rawPattern:display,methodState:{state:"known",values:["GET","HEAD","OPTIONS"]},matcher:match,precedence:order++,conditions:["settings:"+configuration.file,"django-source-pattern:"+(format?"<drf_format_suffix:format>":""),"url-name:"+namespace+"api-root","router:"+api],prefixWitnesses:proof,witnesses:[witness(constructor.site,"registration"),...proof,rule("drf-default-router-api-root-and-format-declaration")],legacyRouteIndex:null,gapIds:ids});
            }
          }
          return true;
        };
        const routes=(r:RecordInput,prefix:string,proof:Witness[],namespace:string,seen:Set<string>)=>{
          check();if(seen.has(r.file)||seen.size>=64){gap(r.syntax.inputs[0].site,"config-cycle");return;}const next=new Set(seen);next.add(r.file);
          const mutation=r.syntax.inputs.find(i=>i.kind==="call"&&(i.name.startsWith("urlpatterns.")||i.arguments.some(a=>a.text==="urlpatterns")&&!["rest_framework.urlpatterns.format_suffix_patterns","django.urls.include"].includes(canonical(r,i.name)??""))||i.kind==="assignment"&&(i.name.startsWith("urlpatterns[")||i.name.startsWith("urlpatterns.")));
          if(mutation){gap(mutation.site,"dynamic-expression");return;}
          let assignments=configAssignments(r,"urlpatterns");
          const suffixAssignment=assignments.length===1||assignments.length===2?assignments.at(-1):undefined;
          const suffixCall=suffixAssignment&&!assignments.some(a=>a.conditional)?r.syntax.inputs.find(i=>i.kind==="call"&&i.site.start>=suffixAssignment.site.start&&i.site.end<=suffixAssignment.site.end&&r.source.text.slice(i.site.start,i.site.end)===suffixAssignment.value&&canonical(r,i.name)==="rest_framework.urlpatterns.format_suffix_patterns"):undefined;
          let required=false,formats:string[]=[];
          if(suffixCall){
            const argument=suffixCall.arguments[0],inline=assignments.length===1&&argument&&/^[\[(]/.test(argument.text);
            const pieces=inline?splitDjango(argument.text.slice(1,-1)):null;
            const allowed=suffixCall.arguments.find(a=>a.name==="allowed"),requiredArgument=suffixCall.arguments.find(a=>a.name==="suffix_required"),values=allowed?djangoLiteral(allowed.text):null;
            const requiredValue=requiredArgument?djangoLiteral(requiredArgument.text):false;
            if(tuple==="django-unqualified"||!defaultFormatSettings()||(!inline&&argument?.text!=="urlpatterns")||inline&&!pieces||suffixCall.arguments.slice(1).some(a=>a.name===null||!["allowed","suffix_required"].includes(a.name))||typeof requiredValue!=="boolean"||allowed&&allowed.text!=="None"&&(!Array.isArray(values)||values.length>32||!values.every(v=>typeof v==="string"&&/^[a-z0-9]+$/.test(v)))){gap(suffixCall.site,"dynamic-expression");return;}
            required=requiredValue;formats=Array.isArray(values)?values as string[]:[];
            if(inline&&pieces&&suffixAssignment){let offset=1;const items=pieces.map(text=>{const start=argument.text.indexOf(text,offset);offset=start+text.length;return {name:null,text,start:argument.start+start,end:argument.start+offset};});assignments=[{...suffixAssignment,value:argument.text,arguments:items}];}else assignments=[assignments[0]];
          }
          const firstRegistration=snapshot.analysis.registrations.length;
          const applySuffix=()=>{
            if(!suffixCall)return;
            const original=snapshot.analysis.registrations.splice(firstRegistration),ids=new Set(original.map(item=>item.id));
            const bindings=snapshot.analysis.bindings.filter(b=>ids.has(b.sourceId));snapshot.analysis.bindings=snapshot.analysis.bindings.filter(b=>!ids.has(b.sourceId));
            let precedence=original[0]?.precedence??order;
            for(const item of original){check();
              if(item.conditions.some(condition=>condition.startsWith("router:"))){gap(suffixCall.site,"custom-resolver");continue;}
              if(!required){snapshot.analysis.registrations.push({...item,precedence:precedence++});for(const binding of bindings.filter(b=>b.sourceId===item.id)){if(snapshot.analysis.bindings.length-inheritedBindings>=20000)throw new ParserWorkerError("resource-limit");snapshot.analysis.bindings.push(binding);}}
              const source=owned.find(input=>input.file===item.occurrence.file),call=source?.syntax.inputs.find(input=>input.kind==="call"&&input.site.start===item.occurrence.start),regex=source&&call?canonical(source,call.name)==="django.urls.re_path":false;
              const suffix=regex?"\\.(?P<format>"+(formats.length===1?formats[0]:formats.length?"("+formats.join("|")+")":"[a-z0-9]+")+")/?$":"<drf_format_suffix"+(formats.length?"_"+formats.join("_"):"")+":format>";
              const stripped=item.rawPattern.replace(/\$+$/,"").replace(/\/+$/,"")+suffix,raw=stripped.startsWith("/")?stripped:"/"+stripped;
              const prefixWitnesses=[...item.prefixWitnesses,witness(suffixCall.site,"configuration")],id=contextualRegistrationId("http",item.occurrence,variant.id,raw,prefixWitnesses);
              const pattern=item.conditions.find(condition=>condition.startsWith("django-source-pattern:"))?.slice("django-source-pattern:".length)??item.rawPattern.slice(1);
              const gapId=gap(item.occurrence,"unsupported-matcher");
              if(snapshot.analysis.registrations.length>=10000)throw new ParserWorkerError("resource-limit");
              frameworkFact(snapshot,item.occurrence.file);snapshot.analysis.registrations.push({...item,id,rawPattern:raw,precedence:precedence++,prefixWitnesses,matcher:{state:"unsupported",gapId},gapIds:[...new Set([...item.gapIds,gapId])],conditions:[...item.conditions.filter(c=>!c.startsWith("django-source-pattern:")),"django-source-pattern:"+pattern.replace(/\$+$/,"").replace(/\/+$/,"")+suffix],witnesses:[...item.witnesses,witness(suffixCall.site,"configuration"),rule("drf-format-suffix-patterns:static-declaration")]});
              for(const binding of bindings.filter(b=>b.sourceId===item.id))bind(id,binding.targetId,binding.kind,binding.occurrence,[...binding.witnesses,witness(suffixCall.site,"configuration"),rule("drf-format-suffix-patterns:callback-preserved")]);
            }
            order=precedence;
          };
          if(assignments.length===1&&!assignments[0].conditional){const router=/^([\w]+)\.urls$/.exec(assignments[0].value.trim());if(router&&routerRoutes(r,router[1],prefix,proof,namespace,assignments[0].site)){applySuffix();return;}}if(assignments.length!==1||assignments[0].conditional||!/[\[(]/.test(assignments[0].value.trim()[0]??"")){if(assignments[0])gap(assignments[0].site,"dynamic-expression");return;}
          const assignment=assignments[0],calls=r.syntax.inputs.filter(i=>i.kind==="call"&&i.ownerStart===null&&i.site.start>=assignment.site.start&&i.site.end<=assignment.site.end&&assignment.arguments.some(a=>a.start===i.site.start&&a.end===i.site.end)&&["django.urls.path","django.urls.re_path"].includes(canonical(r,i.name)??"")).sort((a,b)=>a.site.start-b.site.start);
          if(assignment.arguments.some(argument=>!calls.some(call=>call.site.start===argument.start&&call.site.end===argument.end))){gap(assignment.site,"dynamic-expression");return;}
          for(const call of calls){check();if(call.conditional){gap(call.site,"dynamic-expression");continue;}const pattern=djangoString(call.arguments[0]?.text??""),expression=call.arguments[1]?.text??"";if(pattern===null){gap(call.site,"dynamic-expression");continue;}const raw=prefix+pattern,include=r.syntax.inputs.find(i=>i.kind==="call"&&i.site.start===call.arguments[1]?.start&&canonical(r,i.name)==="django.urls.include");
            if(include){
              const argument=include.arguments[0]?.text??"",tupleValue=argument.trim().startsWith("(")?djangoLiteral(argument):null;
              const tupleModule=Array.isArray(tupleValue)&&tupleValue.length===2&&tupleValue.every(v=>typeof v==="string")?tupleValue as string[]:null;
              const literalModule=djangoString(argument)??tupleModule?.[0]??null,child=literalModule?findModule(literalModule):null;
              const namespaceArgument=include.arguments.find(a=>a.name==="namespace"),appName=child?configAssignments(child,"app_name"):[];
              const declaredApp=appName.length===0?tupleModule?.[1]??null:appName.length===1&&!appName[0].conditional?djangoString(appName[0].value):null;
              if(appName.length&&declaredApp===null){gap(include.site,"dynamic-expression");continue;}
              const selectedNamespace=namespaceArgument?djangoString(namespaceArgument.text):"",ns=selectedNamespace===null?null:selectedNamespace||declaredApp||"";
              if(ns===null||selectedNamespace&&!declaredApp){gap(include.site,"missing-metadata");continue;}
              const router=/^([\w]+)\.urls$/.exec(argument);
              if(router&&routerRoutes(r,router[1],raw,[...proof,witness(call.site,"registration"),witness(include.site)],namespace+(ns?ns+":":""),include.site))continue;
              if(child)routes(child,raw,[...proof,witness(call.site,"registration"),witness(include.site),...appName.map(a=>witness(a.site,"configuration"))],namespace+(ns?ns+":":""),next);else gap(include.site,"missing-metadata");continue;
            }
            const target=view(r,expression),gapIds:string[]=[];if(!target.handler)gapIds.push(gap(call.site,"ambiguous-target"));if(target.methods.state==="unknown")gapIds.push(gap(call.site,"unknown-method"));const routeMatcher=matcher(raw,canonical(r,call.name)==="django.urls.re_path",call.site);if(routeMatcher.state==="unsupported")gapIds.push(routeMatcher.gapId);
            const display="/"+raw;const id=contextualRegistrationId("http",call.site,variant.id,display,proof);const name=djangoString(call.arguments.find(a=>a.name==="name")?.text??"");
            if(snapshot.analysis.registrations.length>=10000)throw new ParserWorkerError("resource-limit");frameworkFact(snapshot,call.site.file);snapshot.analysis.registrations.push({id,kind:"http",handlerId:target.handler?.id??null,variantId:variant.id,occurrence:call.site,rawPattern:display,methodState:target.methods,matcher:routeMatcher,precedence:order++,conditions:["settings:"+configuration.file,"django-source-pattern:"+raw,...(name?["url-name:"+namespace+name]:[])],prefixWitnesses:proof,witnesses:[witness(call.site,"registration"),...proof,...target.proof],legacyRouteIndex:null,gapIds});
            for(const t of target.targets)bind(id,t.declaration.id,"lifecycle",call.site,[...proof,witness(t.declaration.site,"declaration"),rule("cbv-method:"+t.method)]);
          }
          applySuffix();
        };
        if(root&&typeof root.value==="string"){const urlconf=findModule(root.value);if(urlconf)routes(urlconf,"",variant.configWitnesses,"",new Set());else gap(root.site,"missing-metadata");}else if(configuration.syntax.inputs[0])gap(configuration.syntax.inputs[0].site,"dynamic-expression");
        // Further declaration extractors share these exact witnesses and variant.
        extractDeclarations({snapshot,selection,owned,configuration,variantId:variant.id,tuple,canonical,resolve,setting,bind,gap,witness,rule,check,findModule});
      }
    }
    if(Buffer.byteLength(JSON.stringify(snapshot))>31*1024*1024)throw new ParserWorkerError("resource-limit");
    return {snapshot:validateSnapshot(snapshot),parsed,reused};
  }};
}

type ExtractionContext={snapshot:CodeSnapshot;selection:Selection;owned:RecordInput[];configuration:RecordInput;variantId:string;tuple:string;canonical:(r:RecordInput,text:string)=>string|null;resolve:(r:RecordInput,text:string)=>Declaration|null;setting:(name:string)=>{value:DjangoLiteral;proof:Witness[];site:Site}|null;bind:(source:string,target:string,kind:FrameworkBinding["kind"],site:Site,proof:Witness[])=>void;gap:(site:Site,reason:GapReason)=>string;witness:(site:Site,role?:"registration"|"reference"|"declaration"|"configuration")=>Witness;rule:(id:string)=>Witness;check:()=>void;findModule:(key:string)=>RecordInput|null};
function extractDeclarations(c:ExtractionContext):void {
  const {snapshot,owned,canonical,witness,rule,bind,gap,setting,check}=c;
  const declaration=(r:RecordInput,start:number|null)=>snapshot.behavior.declarations.find(d=>d.site.file===r.file&&d.site.start===start)??null;
  const members=(r:RecordInput,klass:Declaration)=>snapshot.behavior.declarations.filter(d=>d.site.file===r.file&&d.site.start>klass.site.start&&d.site.end<=klass.site.end&&!snapshot.behavior.declarations.some(inner=>inner.kind==="class"&&inner.id!==klass.id&&inner.site.file===r.file&&inner.site.start>klass.site.start&&inner.site.start<d.site.start&&inner.site.end>=d.site.end));
  const qualified=(text:string):Declaration|null=>{const parts=text.split("."),name=parts.pop()!,r=c.findModule(parts.join("."));if(!r)return null;const target=c.resolve(r,name);return target&&["function","class"].includes(target.kind)?target:null;};
  const apps=setting("INSTALLED_APPS");
  if(apps&&Array.isArray(apps.value))for(const name of apps.value){check();if(typeof name!=="string"){gap(apps.site,"dynamic-expression");continue;}const target=qualified(name),appModule=c.findModule(name);if(target)bind(c.configuration.file,target.id,"entry-point",apps.site,[witness(target.site,"declaration"),...apps.proof,rule("installed-app-declaration:"+name)]);else if(appModule)bind(c.configuration.file,appModule.file,"entry-point",apps.site,[witness(appModule.syntax.inputs[0]?.site??apps.site),...apps.proof,rule("installed-app-declaration:"+name)]);else gap(apps.site,"external-boundary");}
  const middleware=setting("MIDDLEWARE");
  if(middleware&&Array.isArray(middleware.value))for(const [index,name]of middleware.value.entries()){check();const target=typeof name==="string"?qualified(name):null;if(!target){gap(middleware.site,"missing-metadata");continue;}bind(c.configuration.file,target.id,target.callable?"lifecycle":"context",middleware.site,[witness(target.site,"declaration"),...middleware.proof,rule("middleware-sequence:"+index+":conditional-short-circuit")]);if(target.kind==="class"){const record=owned.find(r=>r.file===target.site.file)!;for(const hook of members(record,target).filter(d=>d.callable&&["__init__","__call__","process_view","process_exception","process_template_response"].includes(d.name)))bind(c.configuration.file,hook.id,"lifecycle",middleware.site,[witness(target.site,"declaration"),witness(hook.site,"declaration"),rule("middleware-hook:"+index+":"+hook.name+":conditional")]);}}
  const models=new Map<string,Declaration>();
  // A visible manager replacement is a runtime boundary even when the Python
  // resolver consequently withholds the imported model reference.
  for(const record of owned)for(const input of record.syntax.inputs)if(input.kind==="assignment"&&input.name.endsWith(".objects")||input.kind==="call"&&input.name.endsWith(".add_to_class"))gap(input.site,"custom-resolver");
  const drfClass=(r:RecordInput,klass:Declaration)=>{const input=r.syntax.inputs.find(i=>i.kind==="class"&&i.site.start===klass.site.start),base=input?.arguments.length===1?canonical(r,input.arguments[0].text):null;return !!base&&base.startsWith("rest_framework.")&&!!djangoRules[c.tuple]?.some(rule=>rule.names.includes(base))&&!input?.conditional&&!r.syntax.inputs.some(i=>i.kind==="decorator"&&i.ownerStart===klass.site.start);};
  for(const r of owned)for(const input of r.syntax.inputs.filter(i=>i.kind==="class")){const klass=declaration(r,input.site.start);if(klass&&drfClass(r,klass))for(const method of members(r,klass).filter(member=>["get_queryset","get_serializer_class"].includes(member.name)))gap(method.site,"custom-resolver");}
  for(const r of owned)for(const i of r.syntax.inputs.filter(i=>i.kind==="class")){const klass=declaration(r,i.site.start);if(klass&&i.arguments.some(argument=>canonical(r,argument.text)==="django.db.models.Model")){if(i.conditional||i.arguments.length!==1||r.syntax.inputs.some(d=>d.kind==="decorator"&&d.ownerStart===klass.site.start)){gap(i.site,i.conditional?"dynamic-expression":"custom-resolver");continue;}models.set(klass.id,klass);bind(r.file,klass.id,"context",i.site,[witness(klass.site,"declaration"),rule("model-declaration-not-runtime-schema")]);}}
  // Declaration associations describe source intent, never generated manager
  // dispatch or evaluation of a QuerySet.
  for(const r of owned)for(const input of r.syntax.inputs.filter(i=>i.kind==="class")){
    const current=declaration(r,input.site.start),base=input.arguments.length===1?canonical(r,input.arguments[0].text):null;
    if(!current||!["django.db.models.Manager","django.db.models.QuerySet"].includes(base??""))continue;
    if(input.conditional||r.syntax.inputs.some(i=>i.kind==="decorator"&&i.ownerStart===current.site.start)){gap(input.site,"custom-resolver");continue;}
    bind(r.file,current.id,"context",input.site,[witness(current.site,"declaration"),rule("orm-class-declaration:"+base+":no-runtime-dispatch")]);
    for(const method of members(r,current).filter(d=>d.kind==="method"))bind(current.id,method.id,"context",method.site,[witness(current.site,"declaration"),witness(method.site,"declaration"),rule("orm-method-declaration:custom-dispatch-unresolved")]);
    gap(input.site,"custom-resolver");
  }
  const fields=new Set(["AutoField","BigAutoField","BigIntegerField","BinaryField","BooleanField","CharField","DateField","DateTimeField","DecimalField","DurationField","EmailField","FileField","FloatField","GenericIPAddressField","ImageField","IntegerField","JSONField","PositiveIntegerField","SlugField","SmallIntegerField","TextField","TimeField","URLField","UUIDField","ForeignKey","OneToOneField","ManyToManyField"]);
  const modelTarget=(r:RecordInput,text:string,klass:Declaration)=>{const direct=c.resolve(r,text);if(direct&&models.has(direct.id))return direct;const name=djangoString(text);if(name==="self")return klass;if(name){const local=c.resolve(r,name);if(local&&models.has(local.id))return local;const [app,model]=name.split(".");if(model&&apps&&Array.isArray(apps.value)&&apps.value.includes(app)){const d=qualified(app+".models."+model);if(d&&models.has(d.id))return d;}}return null;};
  for(const r of owned)for(const i of r.syntax.inputs){check();if(i.conditional){if(i.kind==="call"&&(canonical(r,i.name)?.startsWith("django.")||canonical(r,i.name)?.startsWith("rest_framework.")))gap(i.site,"dynamic-expression");continue;}
    const owner=declaration(r,i.ownerStart),api=canonical(r,i.name),klass=owner?.kind==="class"?owner:null;
    if(i.kind==="assignment"&&i.name==="serializer_class"&&klass&&drfClass(r,klass)){const target=c.resolve(r,i.value),source=target?owned.find(record=>record.file===target.site.file):null,input=source&&target?source.syntax.inputs.find(item=>item.kind==="class"&&item.site.start===target.site.start):null;const base=input?.arguments.length===1&&source?canonical(source,input.arguments[0].text):null;if(target&&source&&base&&["rest_framework.serializers.Serializer","rest_framework.serializers.ModelSerializer","rest_framework.serializers.HyperlinkedModelSerializer"].includes(base)&&!source.syntax.inputs.some(item=>item.kind==="decorator"&&item.ownerStart===target.site.start))bind(klass.id,target.id,"context",i.site,[witness(target.site,"declaration"),rule("drf-serializer-class-declaration:not-runtime-selection")]);else gap(i.site,"custom-resolver");}
    if(owner?.kind==="method"&&["get_queryset","get_serializer_class"].includes(owner.name))gap(owner.site,"custom-resolver");
    if(i.kind==="call"&&klass&&models.has(klass.id)&&api==="django.db.models.Manager"){
      const assignment=r.syntax.inputs.find(a=>a.kind==="assignment"&&a.ownerStart===klass.site.start&&a.site.start<=i.site.start&&a.site.end>=i.site.end);
      const field=assignment?members(r,klass).find(d=>d.kind==="value"&&d.name===assignment.name):null;
      if(field&&i.arguments.length===0)bind(klass.id,field.id,"context",i.site,[witness(field.site,"declaration"),rule("standard-manager-declaration:no-query-execution")]);else gap(i.site,"custom-resolver");
    }
    if(i.kind==="call"&&klass&&models.has(klass.id)&&api?.startsWith("django.db.models.")&&fields.has(api.split(".").at(-1)!)){
      const assignment=r.syntax.inputs.find(a=>a.kind==="assignment"&&a.ownerStart===klass.site.start&&a.site.start<=i.site.start&&a.site.end>=i.site.end);const field=assignment?members(r,klass).find(d=>d.kind==="value"&&d.name===assignment.name):null;
      if(field)bind(klass.id,field.id,"context",i.site,[witness(field.site,"declaration"),rule("model-field:"+api.split(".").at(-1))]);
      if(["ForeignKey","OneToOneField","ManyToManyField"].includes(api.split(".").at(-1)!)){const target=modelTarget(r,i.arguments[0]?.text??"",klass);if(target)bind(klass.id,target.id,"context",i.site,[witness(target.site,"declaration"),rule("model-relationship:"+api.split(".").at(-1)+":declaration-only")]);else gap(i.site,"ambiguous-target");}
    }
    if(i.kind==="call") {
      const operation=/^([\w.]+)\.objects\.(all|filter|exclude|get|create|update|delete|count|exists|first|last|order_by|select_related|prefetch_related)\b$/.exec(i.name);
      if(operation){const model=c.resolve(r,operation[1]);if(model&&models.has(model.id)){const record=owned.find(r=>r.file===model.site.file)!,manager=record.syntax.inputs.filter(a=>a.kind==="assignment"&&a.ownerStart===model.site.start&&a.name==="objects");const mutation=owned.some(input=>input.syntax.inputs.some(a=>a.kind==="assignment"&&a.name.endsWith(".objects")||a.kind==="call"&&a.name.endsWith(".add_to_class")));const supported=!mutation&&(!manager.length||manager.length===1&&!manager[0].conditional&&/^\w+(?:\.\w+)*\(\s*\)$/.test(manager[0].value)&&canonical(record,manager[0].value.replace(/\(\s*\)$/,""))==="django.db.models.Manager");if(supported)bind(owner?.callable?owner.id:r.file,model.id,"operation",i.site,[witness(model.site,"declaration"),...manager.map(a=>witness(a.site)),rule("orm-intent:"+operation[2]+":"+(["all","filter","exclude","order_by","select_related","prefetch_related"].includes(operation[2])?"lazy-queryset":"operation-declaration")+":no-sql-execution-claim")]);else gap(i.site,"custom-resolver");}else gap(i.site,"ambiguous-target");}
      if(operation&&klass&&drfClass(r,klass)&&r.syntax.inputs.filter(a=>a.kind==="assignment"&&a.ownerStart===klass.site.start&&a.name==="queryset").length===1){const attribute=r.syntax.inputs.find(a=>a.kind==="assignment"&&a.ownerStart===klass.site.start&&a.name==="queryset"&&a.site.start<=i.site.start&&a.site.end>=i.site.end),model=c.resolve(r,operation[1]);if(attribute&&model&&models.has(model.id)&&c.snapshot.analysis.bindings.some(b=>b.occurrence.start===i.site.start&&b.occurrence.file===r.file&&b.kind==="operation"))bind(klass.id,model.id,"context",i.site,[witness(attribute.site,"declaration"),witness(model.site,"declaration"),rule("drf-queryset-attribute-declaration:not-runtime-selection")]);}
      if(api==="django.dispatch.Signal")gap(i.site,"custom-resolver");
      if(api?.startsWith("django.db.models.signals.")&&api.endsWith(".connect")){const receiver=c.resolve(r,i.arguments.find(a=>a.name==="receiver")?.text??i.arguments[0]?.text??"");const source=receiver?owned.find(input=>input.file===receiver.site.file):null;const opaque=source&&source.syntax.inputs.some(a=>a.kind==="decorator"&&a.ownerStart===receiver!.site.start&&canonical(source,a.name.split("(")[0])!=="django.dispatch.receiver");if(receiver?.callable&&!opaque)bind(owner?.callable?owner.id:r.file,receiver.id,"event-handler",i.site,[witness(receiver.site,"declaration"),rule("signal-connect:"+api+":registration-not-emission")]);else gap(i.site,opaque?"custom-resolver":"ambiguous-target");}
      if(api==="django.contrib.admin.site.register"){const model=c.resolve(r,i.arguments[0]?.text??"");if(model&&models.has(model.id))bind(r.file,model.id,"context",i.site,[witness(model.site,"declaration"),rule("admin-register-declaration")]);else gap(i.site,"ambiguous-target");}
    }
    if(i.kind==="decorator"){
      const api=canonical(r,i.name.split("(")[0]);if(api==="django.dispatch.receiver"&&owner?.callable){const opaque=r.syntax.inputs.some(input=>input.kind==="decorator"&&input.ownerStart===owner.site.start&&canonical(r,input.name.split("(")[0])!=="django.dispatch.receiver");const call=r.syntax.inputs.find(call=>call.kind==="call"&&call.site.start===i.site.start+1),signal=call?canonical(r,call.arguments[0]?.text??""):null;if(opaque)gap(i.site,"custom-resolver");else if(signal?.startsWith("django.db.models.signals."))bind(r.file,owner.id,"event-handler",i.site,[witness(owner.site,"declaration"),rule("signal-receiver:"+signal+":registration-not-emission")]);else gap(i.site,"dynamic-expression");}
      if(api==="django.contrib.admin.register"){const call=r.syntax.inputs.find(call=>call.kind==="call"&&call.site.start===i.site.start+1),target=call?c.resolve(r,call.arguments[0]?.text??""):null;if(target&&models.has(target.id))bind(r.file,target.id,"context",i.site,[witness(target.site,"declaration"),rule("admin-decorator-registration")]);else gap(i.site,"ambiguous-target");}
    }
    if(i.kind==="class"&&owner===null){const current=declaration(r,i.site.start);if(current&&i.arguments.length===1){const base=canonical(r,i.arguments[0].text);if(base==="django.apps.AppConfig"||base==="django.core.management.base.BaseCommand")for(const method of members(r,current).filter(d=>d.callable&&d.name===(base.endsWith("AppConfig")?"ready":"handle")))bind(r.file,method.id,"entry-point",i.site,[witness(current.site,"declaration"),witness(method.site,"declaration"),rule(base.endsWith("AppConfig")?"app-ready-declaration-not-execution":"management-command-handle-ownership")]);}}
    if(i.kind==="assignment"&&i.name==="model"&&klass){const outer=snapshot.behavior.declarations.filter(d=>d.kind==="class"&&d.site.file===r.file&&d.site.start<klass.site.start&&d.site.end>=klass.site.end).sort((a,b)=>b.site.start-a.site.start)[0];const outerInput=outer?r.syntax.inputs.find(a=>a.kind==="class"&&a.site.start===outer.site.start):null;const base=outerInput?.arguments.map(a=>canonical(r,a.text)).find(name=>name?.startsWith("rest_framework.serializers."));const target=c.resolve(r,i.value);if(base){const meta=r.syntax.inputs.find(a=>a.kind==="class"&&a.site.start===klass.site.start);const opaque=klass.name!=="Meta"||outerInput?.arguments.length!==1||!!meta?.arguments.length||!["rest_framework.serializers.Serializer","rest_framework.serializers.ModelSerializer","rest_framework.serializers.HyperlinkedModelSerializer"].includes(base)||r.syntax.inputs.some(a=>a.kind==="decorator"&&(a.ownerStart===outer!.site.start||a.ownerStart===klass.site.start))||r.syntax.inputs.filter(a=>a.kind==="assignment"&&a.ownerStart===klass.site.start&&a.name==="model").length!==1;if(!opaque&&target&&models.has(target.id))bind(outer!.id,target.id,"context",i.site,[witness(target.site,"declaration"),witness(outer!.site,"declaration"),rule("serializer-meta-model-declaration")]);else gap(i.site,opaque?"custom-resolver":"ambiguous-target");}}
  }
  extractTemplates(c);
}

function extractTemplates(c:ExtractionContext):void {
  const config=c.setting("TEMPLATES");if(!config)return;
  const engines=config.value;if(!Array.isArray(engines)||engines.length!==1||!engines[0]||typeof engines[0]!=="object"||Array.isArray(engines[0])||engines[0].BACKEND!=="django.template.backends.django.DjangoTemplates"){c.gap(config.site,"custom-resolver");return;}
  const engine=engines[0],dirs=engine.DIRS;const roots:string[]=[];
  if(engine.OPTIONS&&typeof engine.OPTIONS==="object"&&!Array.isArray(engine.OPTIONS)&&["loaders","libraries","builtins"].some(key=>Object.hasOwn(engine.OPTIONS as object,key))){c.gap(config.site,"custom-resolver");return;}
  if(Array.isArray(dirs)&&dirs.every(d=>typeof d==="string"))roots.push(...(dirs as string[]).map(dir=>path.posix.join(c.configuration.owner,dir)));else{c.gap(config.site,"dynamic-expression");return;}
  const apps=c.setting("INSTALLED_APPS");if(engine.APP_DIRS===true&&apps&&Array.isArray(apps.value))for(const app of apps.value)if(typeof app==="string"&&identifier.test(app)){const record=c.findModule(app)??c.findModule(app.replace(/\.apps\.[\w]+$/,""));if(record)roots.push(path.posix.join(path.posix.dirname(record.file),"templates"));}
  if(roots.length>64)throw new ParserWorkerError("resource-limit");
  const sourceMap=new Map<string,{source:ReturnType<typeof pythonSource>;file:string}>();
  const load=(name:string,occurrence:Site):{source:ReturnType<typeof pythonSource>;file:string}|null=>{
    if(!name||name.includes("\\")||name.includes("\0")||path.posix.isAbsolute(name)||name.split("/").some(s=>!s||s==="."||s==="..")||!name.endsWith(".html")){c.gap(occurrence,"policy-denied");return null;}
    for(const root of roots){c.check();if(path.posix.isAbsolute(root)||root.split("/").some(s=>s===".."||s.startsWith("."))){c.gap(occurrence,"policy-denied");continue;}const file=path.posix.join(root,name),absolute=path.resolve(c.selection.root,file);try{if(!c.selection.reader.stat(absolute)?.isFile())continue;const bytes=c.selection.reader.read(absolute,"source"),source=pythonSource(bytes);const known=c.snapshot.analysis.resources.find(r=>r.path===file);if(known&&known.hash!==source.hash)throw Error("unstable_generation");if(!known)c.snapshot.analysis.resources.push({path:file,hash:source.hash,bytes:bytes.length,utf16Length:source.text.length,lines:Math.max(1,source.text.split("\n").length-(source.text.endsWith("\n")?1:0)),encoding:"utf8",purpose:"framework-input"});const loaded={file,source};sourceMap.set(file,loaded);return loaded;}catch(error){if(error instanceof Error&&error.message==="unstable_generation")throw error;c.gap(occurrence,"policy-denied");return null;}}
    c.gap(occurrence,"missing-metadata");return null;
  };
  const names=(name:string)=>c.snapshot.analysis.registrations.filter(r=>r.variantId===c.variantId&&r.conditions.includes("url-name:"+name));
  const scanned=new Set<string>();
  const scan=(template:{source:ReturnType<typeof pythonSource>;file:string},seen:Set<string>)=>{
    if(seen.has(template.file)){return;}if(seen.size>=64)throw new ParserWorkerError("resource-limit");if(scanned.has(template.file))return;scanned.add(template.file);const next=new Set(seen);next.add(template.file);
    const text=template.source.text;let cursor=0,tags=0;const blocks:{command:string;site:Site}[]=[];
    if(/{%\s*load\b/.test(text)){const start=text.indexOf("{%"),end=text.indexOf("%}",start)+2;if(end>start){const mapped=template.source.range(start,end);c.gap({file:template.file,start:mapped.start,end:mapped.end,line:mapped.line,endLine:mapped.endLine,fileHash:template.source.hash,extractor:"django/template/"+version,evidenceKind:"verified"},"custom-resolver");}return;}
    while(cursor<text.length){c.check();const start=text.indexOf("{%",cursor),comment=text.indexOf("{#",cursor);if(comment>=0&&(start<0||comment<start)){const finish=text.indexOf("#}",comment+2);cursor=finish<0?text.length:finish+2;continue;}if(start<0)break;const end=text.indexOf("%}",start+2);if(end<0)break;cursor=end+2;if(++tags>20000)throw new ParserWorkerError("resource-limit");const body=text.slice(start+2,end).trim(),command=body.split(/\s/)[0],site:Site={file:template.file,...(({start,end,line,endLine})=>({start,end,line,endLine}))(template.source.range(start,cursor)),fileHash:template.source.hash,extractor:"django/template/"+version,evidenceKind:"verified"};
      if(command==="comment"||command==="verbatim"){const finish=text.indexOf("{% end"+command,start),closing=finish<0?-1:text.indexOf("%}",finish);if(closing<0)c.gap(site,"unsupported-syntax");cursor=closing<0?text.length:closing+2;continue;}
      const paired=new Set(["block","if","for","with","autoescape","spaceless","filter","ifchanged"]);
      if(paired.has(command)){if(blocks.length>=64)throw new ParserWorkerError("resource-limit");blocks.push({command,site});}
      else if(command.startsWith("end")&&paired.has(command.slice(3))){if(blocks.at(-1)?.command!==command.slice(3))c.gap(site,"unsupported-syntax");else blocks.pop();}
      else if(["elif","else"].includes(command)&&blocks.at(-1)?.command!=="if"||command==="empty"&&blocks.at(-1)?.command!=="for")c.gap(site,"unsupported-syntax");
      if(command==="extends"||command==="include"){const argument=body.slice(command.length).trim(),name=djangoString(argument);if(name===null){c.gap(site,"dynamic-expression");continue;}const target=load(name,site);if(target){c.bind(template.file,target.file,"context",site,[c.witness(config.site,"configuration"),c.rule("template-"+command+":literal")]);if(next.has(target.file))c.gap(site,"config-cycle");else scan(target,next);}}
      else if(command==="block"){const name=body.slice(5).trim();if(/^[\w]+$/.test(name))c.bind(template.file,template.file,"context",site,[c.rule("template-block:"+name)]);else c.gap(site,"unsupported-syntax");}
      else if(command==="url"){const match=/^url\s+((?:'[^']*')|(?:"[^"]*"))/.exec(body),name=match?djangoString(match[1]):null,targets=name?names(name):[];if(targets.length===1)c.bind(template.file,targets[0].id,"context",site,[...targets[0].witnesses,c.rule("template-url-name-reference")]);else c.gap(site,targets.length>1?"ambiguous-target":"dynamic-expression");}
      else if(!new Set(["endblock","if","elif","else","endif","for","empty","endfor","with","endwith","autoescape","endautoescape","csrf_token","firstof","cycle","resetcycle","now","spaceless","endspaceless","filter","endfilter","widthratio","templatetag","lorem","regroup","ifchanged","endifchanged"]).has(command))c.gap(site,"custom-resolver");
    }
    for(const block of blocks)c.gap(block.site,"unsupported-syntax");
  };
  for(const r of c.owned)for(const input of r.syntax.inputs){c.check();let name:string|null=null;
    if(input.kind==="assignment"&&input.name==="template_name")name=djangoString(input.value);
    if(input.kind==="call"){const api=c.canonical(r,input.name);if(["django.shortcuts.render","django.template.loader.render_to_string","django.template.loader.get_template"].includes(api??"")){
      if(input.arguments.some(a=>a.name==="using")){c.gap(input.site,"custom-resolver");continue;}
      const positional=input.arguments.filter(a=>a.name===null),named=input.arguments.filter(a=>a.name==="template_name"),argument=positional[api==="django.shortcuts.render"?1:0];
      if(named.length>1||named.length&&argument){c.gap(input.site,"dynamic-expression");continue;}
      name=djangoString(named[0]?.text??argument?.text??"");
    }else if(api==="django.urls.reverse"){const url=djangoString(input.arguments[0]?.text??""),targets=url?names(url):[];if(targets.length===1)c.bind(r.file,targets[0].id,"context",input.site,[...targets[0].witnesses,c.rule("reverse-url-name-reference")]);else c.gap(input.site,"ambiguous-target");}}
    if(name!==null){const target=load(name,input.site);if(target){c.bind(r.file,target.file,"asset",input.site,[c.witness(config.site,"configuration"),c.rule("template-selection-declaration")]);scan(target,new Set());}}
    else if(input.kind==="assignment"&&input.name==="template_name"||input.kind==="call"&&["django.shortcuts.render","django.template.loader.render_to_string","django.template.loader.get_template"].includes(c.canonical(r,input.name)??""))c.gap(input.site,"dynamic-expression");
  }
}
