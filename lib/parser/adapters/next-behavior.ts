import path from "node:path";
import { Node, SyntaxKind } from "ts-morph";
import type { CodeSnapshot } from "../../engine/types.ts";
import type { Selection } from "../index.ts";
import type { FrameworkSource, frameworkBindings } from "../framework-bindings.ts";
import type { nodeProfile } from "./node-profile.ts";
import { factId, type Matcher, type MethodState, type Witness } from "../../model/framework.ts";
import { frameworkFact } from "../framework-budget.ts";
import { extractReactBindings } from "./vite-react.ts";
import { interpretConfig, type StaticValue } from "../../engine/static-config.ts";
import { nextStaticConfig } from "./next-config.ts";
import { matchesNavigation } from "./react-router.ts";

const METHODS=["GET","POST","PUT","PATCH","DELETE","HEAD","OPTIONS"];
const literal=(value:StaticValue|undefined)=>value?.kind==="literal" && typeof value.value==="string" ? value.value : undefined;
const property=(value:StaticValue|undefined,name:string)=>value?.kind==="object" ? value.properties[name] : undefined;
function directive(node:Node,name:string):Node|undefined {
  const statements=Node.isSourceFile(node) || Node.isBlock(node) ? node.getStatements() : [];
  for(const s of statements){if(!Node.isExpressionStatement(s) || !Node.isStringLiteral(s.getExpression()))break;if(s.getExpression().getText().slice(1,-1)===name)return s;}
}
export function nextMatcher(pattern:string):Extract<Matcher,{state:"supported"}>|undefined {
  const segments:Extract<Matcher,{state:"supported"}>["segments"]=[],names=new Set<string>();
  for(const s of pattern.split("/").filter(Boolean)) {
    const rest=/^\[\[\.\.\.(\w+)\]\]$/.exec(s),catchAll=/^\[\.\.\.(\w+)\]$/.exec(s),param=/^\[(\w+)\]$/.exec(s);
    const colon=/^:([A-Za-z_]\w*)([+*]?)$/.exec(s);
    const name=rest?.[1]??catchAll?.[1]??param?.[1]??colon?.[1];if(name){if(names.has(name))return;names.add(name);}
    if(rest||catchAll)segments.push({kind:"catchAll",name:name!,optional:!!rest});else if(colon?.[2])segments.push({kind:"catchAll",name:name!,optional:colon[2]==="*"});else if(param||colon)segments.push({kind:"parameter",name:name!,converter:"segment"});else if(/[\[\]%?*\\():+]/.test(s))return;else segments.push({kind:"literal",value:s});
  }
  if(segments.length>64 || segments.some((s,i)=>s.kind==="catchAll"&&i!==segments.length-1))return;
  return {state:"supported",segments,trailingSlash:"optional",caseSensitive:true,decodingPolicy:"percent-decode-segments"};
}

/** Framework ownership/boundaries remain distinct from verified lexical calls. */
export function extractNextBindings(snapshot:CodeSnapshot,selection:Selection,inputs:FrameworkSource[],p:ReturnType<typeof nodeProfile>,b:ReturnType<typeof frameworkBindings>) {
  const discovery=selection.walk.discovery,project=p.variant.projectId;
  if(!p.qualified){for(const i of inputs){const first=i.sourceFile.getStatements()[0];if(first)b.gap(first,"missing-metadata");}return;}
  const prefix=project==="." ? "" : project+"/";
  const configs=discovery.metadata.all().filter(r=>r.resource.path.startsWith(prefix) && path.posix.dirname(r.resource.path)===(project==="." ? "." : project) && /^next\.config\.[cm]?[jt]s$/.test(path.posix.basename(r.resource.path)));
  const config=configs.length===1 ? nextStaticConfig(configs[0].text,discovery.boundary) : undefined;
  const base=literal(property(config,"basePath")) ?? "";
  const extensions=property(config,"pageExtensions"), pageExtensions=extensions?.kind==="array" && extensions.items.every(v=>v.kind==="literal" && typeof v.value==="string" && /^[\w.]+$/.test(v.value)) ? extensions.items.map(v=>literal(v)!) : extensions ? undefined : ["tsx","ts","jsx","js"];
  const configSafe=!discovery.metadata.issues.some(i=>/^next\.config\./.test(path.posix.basename(i.path))&&path.posix.dirname(i.path)===(project==="." ? "." : project)) && configs.length<=1 && (!config || config.kind==="object") && (!property(config,"basePath") || literal(property(config,"basePath"))!==undefined) && (!base || /^\/(?:[\w-]+\/?)*$/.test(base)) && !!pageExtensions && !property(config,"i18n") && !property(config,"webpack") && !property(config,"turbopack");
  if(!configSafe){for(const input of inputs){const first=input.sourceFile.getStatements()[0];if(first)b.gap(first,"custom-resolver");}return;}
  const clients=new Set(inputs.filter(i=>directive(i.sourceFile,"use client")).map(i=>i.candidate.path));
  const serverFiles=new Set(inputs.filter(i=>directive(i.sourceFile,"use server")).map(i=>i.candidate.path));
  for(let depth=0;depth<64;depth++){let changed=false;for(const binding of snapshot.analysis.bindings.filter(x=>x.variantId===p.variant.id && x.kind==="module-dependency"))if(clients.has(binding.occurrence.file) && !serverFiles.has(binding.targetId) && !clients.has(binding.targetId)){clients.add(binding.targetId);changed=true;}if(!changed)break;if(depth===63)for(const i of inputs){const first=i.sourceFile.getStatements()[0];if(first)b.gap(first,"resource-limit");}}
  const actions=new Map<string,Node>();
  for(const i of inputs)for(const node of i.sourceFile.getDescendants()) {
    discovery.boundary.check();
    const d=b.declaration(node);
    if(clients.has(i.candidate.path)&&serverFiles.has(i.candidate.path)){b.gap(node,"unsupported-syntax");continue;}
    const fn=Node.isFunctionDeclaration(node)||Node.isArrowFunction(node)||Node.isFunctionExpression(node) ? node : Node.isVariableDeclaration(node) ? node.getInitializer() : undefined;
    if(!d?.callable || !fn || !(Node.isFunctionDeclaration(fn)||Node.isArrowFunction(fn)||Node.isFunctionExpression(fn)))continue;
    const body=fn.getBody(), inline=body && directive(body,"use server");
    const exported=serverFiles.has(i.candidate.path) && i.sourceFile.getStatements().some(s=>Node.isFunctionDeclaration(s) && s===node && s.isExported() || Node.isVariableStatement(s) && s.isExported() && Node.isVariableDeclaration(node) && s.getDeclarations().includes(node));
    if(inline || exported){if(fn.isAsync() && !(clients.has(i.candidate.path)&&inline)){actions.set(d.id,node);b.bind("server-action",node,d,"next/server-function-declaration",d.id);}else b.gap(node,"unsupported-syntax");}
  }
  const aliases=new Map<string,string>();
  for(let iteration=0;iteration<64;iteration++){let changed=false;for(const input of inputs)for(const variable of input.sourceFile.getDescendantsOfKind(SyntaxKind.VariableDeclaration)){const initializer=variable.getInitializer(),reference=initializer&&Node.isIdentifier(initializer) ? b.identifier(initializer) : undefined,alias=b.identifier(variable.getNameNode()),root=reference ? actions.has(reference.id) ? reference.id : aliases.get(reference.id) : undefined;if(root&&alias&&!aliases.has(alias.id)){aliases.set(alias.id,root);const target=snapshot.behavior.declarations.find(d=>d.id===root)!;b.bind("server-action",initializer!,target,"next/transparent-action-alias",alias.id);changed=true;}}if(!changed)break;}
  const actionTarget=(id:string)=>snapshot.behavior.declarations.find(d=>d.id===(aliases.get(id)??id)&&actions.has(d.id));
  const register=(node:Node,pattern:string,kind:"http"|"page"|"navigation",handler:string|null,methodState:MethodState|null,conditions:string[]=[],derived=false,precedence:number|null=null,matcherPattern=pattern,caseSensitive=true)=>{
    const occurrence=b.site(node),matcher=nextMatcher(matcherPattern),gapIds:string[]=[];
    const addGap=(reason:"unknown-method"|"unsupported-matcher")=>{b.gap(node,reason);const id=factId("gap",occurrence,p.variant.id,reason);gapIds.push(id);return id;};
    if(methodState?.state==="unknown")addGap("unknown-method");
    if(handler===null){b.gap(node,"generated-code-unavailable");gapIds.push(factId("gap",occurrence,p.variant.id,"generated-code-unavailable"));}
    const normalized:Matcher=matcher ? {...matcher,caseSensitive} : {state:"unsupported",gapId:addGap("unsupported-matcher")};
    const id=factId("registration:"+kind,occurrence,p.variant.id,pattern);
    if(snapshot.analysis.registrations.some(r=>r.id===id))return;
    if(snapshot.analysis.registrations.length>=10000){b.gap(node,"resource-limit");return;}
    frameworkFact(snapshot,occurrence.file);
    const declaration=handler ? snapshot.behavior.declarations.find(d=>d.id===handler) : undefined;
    const witnesses:Witness[]=[b.witness(occurrence,"registration"),...(declaration ? [b.witness(declaration.site,"declaration")] : []),...p.variant.configWitnesses,{role:"framework-rule",tupleId:p.tuple,ruleId:derived ? "next/derived-method" : "next/source-registration",extractor:"next",extractorVersion:"fs-04/1",variantId:p.variant.id}];
    snapshot.analysis.registrations.push({id,kind,handlerId:handler,variantId:p.variant.id,occurrence,rawPattern:pattern,methodState,matcher:normalized,precedence,conditions,prefixWitnesses:p.variant.configWitnesses,witnesses,legacyRouteIndex:null,gapIds});
    b.bind("registration",node,id,"next/route-registration",occurrence.file);
    if(handler){const declaration=snapshot.behavior.declarations.find(d=>d.id===handler);if(declaration)b.bind(kind==="http" ? "event-handler" : "component-reference",node,declaration,"next/route-handler",occurrence.file);}
  };
  for(const i of inputs) {
    const file=i.candidate.path,source=i.sourceFile,first=source.getStatements()[0];if(!first)continue;
    if(clients.has(file)&&serverFiles.has(file)){b.gap(first,"unsupported-syntax");continue;}
    for(const marker of ["use client","use server"]) {const d=directive(source,marker);if(d)b.bind("module-boundary",d,file,"next/"+marker+(marker==="use client" ? "/client-entry-with-server-prerendering" : ""),file);}
    for(const imported of source.getImportDeclarations())if(["server-only","client-only"].includes(imported.getModuleSpecifierValue())){b.bind("module-boundary",imported,file,"next/"+imported.getModuleSpecifierValue(),file);if(imported.getModuleSpecifierValue()==="server-only" && clients.has(file) || imported.getModuleSpecifierValue()==="client-only" && !clients.has(file))b.gap(imported,"variant-not-selected");}
    const relative=file.slice(prefix.length).replace(/^src\//,"");
    const extension=pageExtensions?.find(e=>relative.endsWith("."+e)),stem=extension ? relative.slice(0,-extension.length-1) : "";
    if(file.startsWith(prefix+"src/") && inputs.some(x=>x.candidate.path.startsWith(prefix+(relative.startsWith("pages/") ? "pages/" : "app/")))){if(relative.startsWith("app/")||relative.startsWith("pages/")){b.gap(first,"variant-not-selected");continue;}}
    if(["proxy","middleware"].includes(stem)) {
      const convention=stem;
      if(!configSafe){b.gap(first,"custom-resolver");continue;}
      if(convention==="proxy" && p.tuple==="next15"){b.gap(first,"unsupported-syntax");continue;}
      const configDeclaration=source.getVariableDeclaration("config"),initializer=configDeclaration?.getInitializer();
      const configValue=initializer && configDeclaration && b.identifier(configDeclaration.getNameNode()) ? interpretConfig(initializer.getText(),{expression:true,boundary:discovery.boundary}).value : undefined;
      const configuredRuntime=property(configValue,"runtime"),runtime=literal(configuredRuntime) ?? (convention==="proxy" ? "nodejs" : "edge");
      if(configuredRuntime && (convention==="proxy" || !["nodejs","edge"].includes(runtime) || configuredRuntime.kind!=="literal")){b.gap(first,"variant-not-selected");continue;}
      // The matcher is a source declaration even when its Edge implementation
      // cannot participate in this phase's Node execution projection.
      if(runtime==="edge")b.gap(first,"variant-not-selected");
      const matcher=property(configValue,"matcher"),entries=matcher?.kind==="array" ? matcher.items : matcher ? [matcher] : [];
      const handler=b.exported(source,convention) ?? b.exported(source,"default");
      if(!entries.length){b.gap(first,"unsupported-matcher");continue;}
      for(const entry of entries.slice(0,100)) {
        const pattern=literal(entry) ?? literal(property(entry,"source"));
        const occurrence=source.getDescendantsOfKind(SyntaxKind.StringLiteral).find(n=>n.getLiteralText()===pattern);
        if(pattern && occurrence)register(occurrence,pattern,"navigation",handler?.callable ? handler.id : null,null,["next-convention:"+convention,"runtime:"+runtime,...(runtime==="edge" ? ["implementation:unqualified-edge-boundary"] : []),...(convention==="middleware" && p.tuple!=="next15" ? ["deprecated:use-proxy"] : []),"matcher-options:"+JSON.stringify(entry)],false,null,base+pattern);else b.gap(first,"unsupported-matcher");
      }
    }
    if(!configSafe){if(relative.startsWith("app/")||relative.startsWith("pages/"))b.gap(first,"custom-resolver");continue;}
    if(stem.startsWith("app/")) {
      const runtime=source.getVariableDeclaration("runtime");
      if(runtime?.getVariableStatement()?.isExported()) {const value=runtime.getInitializer();if(!value || !Node.isStringLiteral(value)||value.getLiteralText()!=="nodejs"||!b.identifier(runtime.getNameNode())){b.gap(runtime,"variant-not-selected");continue;}b.bind("module-boundary",runtime,file,"next/runtime/nodejs",file);}
      const parts=stem.split("/"),name=parts.pop()!,folders=parts.slice(1);
      if(folders.some(f=>f.startsWith("_")))continue;
      const interception=folders.some(f=>f.startsWith("(.")),slots=folders.filter(f=>f.startsWith("@"));
      const pattern=(base+"/"+folders.filter(f=>!/^\(.*\)$/.test(f)&&!f.startsWith("@")).join("/")).replace(/\/$/,"") || "/";
      const conditions=[...slots.map(s=>"parallel-slot:"+s),...(interception ? ["intercepted-navigation-context:unresolved"] : [])];
      let matchedPattern=pattern;
      if(interception) {
        const segments:string[]=[],origins:string[]=[];let invalid=false;
        for(const folder of folders){if(folder.startsWith("@")||/^\([^.]\w*\)$/.test(folder))continue;const token=/^(\(\.\.\.\)|\(\.\.\)\(\.\.\)|\(\.\.\)|\(\.\))(.+)$/.exec(folder);if(token){origins.push("intercept-origin:/"+segments.join("/"));const count=token[1]==="(...)" ? segments.length : token[1]==="(..)(..)" ? 2 : token[1]==="(..)" ? 1 : 0;if(count>segments.length){invalid=true;break;}segments.splice(segments.length-count,count);segments.push(token[2]);}else if(/^\(.*\)$/.test(folder))continue;else segments.push(folder);}
        if(invalid){b.gap(first,"unsupported-matcher");continue;}
        matchedPattern=(base+"/"+segments.join("/")).replace(/\/$/,"")||"/";conditions.splice(conditions.indexOf("intercepted-navigation-context:unresolved"),1,"requires:soft-navigation",...origins);
      }
      if(name==="route") {
        const known=METHODS.flatMap(method=>{const target=b.exported(source,method);return target?.callable ? [{method,target}] : [];});
        const hidden=source.getExportDeclarations().some(e=>!e.isTypeOnly() && !e.getNamedExports().length);
        const declared=new Set(source.getExportSymbols().map(s=>s.getName()));
        for(const {method,target} of known){const alias=source.getExportDeclarations().flatMap(e=>e.getNamedExports()).find(e=>(e.getAliasNode()?.getText()??e.getName())===method);const definition=source.getDescendants().find(n=>b.declaration(n)?.id===target.id);const occurrence=alias ?? (definition && (Node.isFunctionDeclaration(definition)||Node.isVariableDeclaration(definition)) ? definition.getNameNode() ?? definition : first);register(occurrence,pattern,"http",target.id,{state:"known",values:[method]},conditions);}
        if(!hidden && known.length){if(!declared.has("HEAD")){const get=known.find(m=>m.method==="GET");if(get)register(source.getFirstDescendantByKind(SyntaxKind.ExportKeyword)??first,pattern,"http",get.target.id,{state:"known",values:["HEAD"]},[...conditions,"derived-from:GET"],true);}if(!declared.has("OPTIONS"))register(source,pattern,"http",null,{state:"known",values:["OPTIONS"]},[...conditions,"derived:auto-OPTIONS"],true);}
        if(hidden || !known.length)b.gap(first,"ambiguous-target");
      } else if(["page","layout","template","default","loading","error","global-error","not-found","sitemap","robots","manifest","icon","apple-icon","opengraph-image","twitter-image"].includes(name)) {
        const target=b.exported(source,"default");
        if(name==="page")register(first,matchedPattern,"page",target?.callable ? target.id : null,null,conditions);
        if(target)b.bind("entry-point",first,target,"next/app-convention/"+name,file);
        else b.gap(first,"ambiguous-target");
        if(!["layout","template"].includes(name))for(let parent=path.posix.dirname(file);parent.startsWith(prefix+"app")||parent.startsWith(prefix+"src/app");parent=path.posix.dirname(parent)) {
          const layouts=inputs.filter(x=>path.posix.dirname(x.candidate.path)===parent && pageExtensions!.some(e=>["layout","template"].some(name=>path.posix.basename(x.candidate.path)===name+"."+e)));
          for(const layout of layouts){const owner=b.exported(layout.sourceFile,"default");if(owner)b.bind("component-reference",first,owner,"next/layout-ownership",file);}
          if(parent===prefix+"app"||parent===prefix+"src/app")break;
        }
      }
      for(const name of ["generateStaticParams","generateMetadata","generateViewport"]) {const target=b.exported(source,name);if(target?.callable)b.bind("lifecycle",first,target,"next/"+name,file);}
    } else if(/^pages\/_(?:app|document|error)$/.test(stem)) {
      const target=b.exported(source,"default");if(target)b.bind("entry-point",first,target,"next/pages-convention/"+stem.slice(6),file);else b.gap(first,"ambiguous-target");
    } else if(stem.startsWith("pages/")) {
      const raw=stem.slice(6).replace(/(?:^|\/)index$/,"");const pattern=(base+"/"+raw).replace(/\/$/,"")||"/",target=b.exported(source,"default");
      if(stem.startsWith("pages/api/")) {
        register(first,pattern,"http",target?.id??null,{state:"unknown",values:[]},["pages-api:runtime-dispatch"]);
        const definition=target ? source.getDescendants().find(n=>b.declaration(n)?.id===target.id) : undefined;
        if(definition && Node.isFunctionDeclaration(definition)) {
          const request=definition.getParameters()[0],name=request?.getName();
          const mutation=definition.getDescendantsOfKind(SyntaxKind.BinaryExpression).some(n=>/^(?:=|\+=|-=|\?\?=|\|\|=|&&=)$/.test(n.getOperatorToken().getText())&&(n.getLeft().getText()===name||n.getLeft().getText().startsWith(name+".")));
          const escaped=definition.getDescendantsOfKind(SyntaxKind.CallExpression).some(n=>n.getArguments().some(a=>a.getText()===name));
          const isMethod=(node:Node)=>Node.isPropertyAccessExpression(node)&&node.getName()==="method"&&Node.isIdentifier(node.getExpression())&&node.getExpression().getText()===name&&node.getExpression().getSymbol()?.getDeclarations().length===1&&node.getExpression().getSymbol()?.getDeclarations()[0]===request;
          for(const node of definition.getDescendants()) {
            if(mutation || escaped){b.gap(node,"ambiguous-target");break;}
            if(node.getAncestors().find(n=>Node.isFunctionDeclaration(n)||Node.isArrowFunction(n)||Node.isFunctionExpression(n))!==definition)continue;
            if(Node.isIfStatement(node)) {const condition=node.getExpression();if(Node.isBinaryExpression(condition)&&["===","=="].includes(condition.getOperatorToken().getText())){const left=condition.getLeft(),right=condition.getRight(),value=isMethod(left)&&Node.isStringLiteral(right) ? right.getLiteralText() : isMethod(right)&&Node.isStringLiteral(left) ? left.getLiteralText() : undefined;if(value && METHODS.includes(value))register(condition,pattern,"http",target!.id,{state:"known",values:[value]},["pages-api:conditional-branch","dispatch-test:"+condition.getText()]);}}
            if(Node.isSwitchStatement(node)&&isMethod(node.getExpression()))for(const clause of node.getCaseBlock().getClauses())if(Node.isCaseClause(clause)){const expression=clause.getExpression();if(Node.isStringLiteral(expression)&&METHODS.includes(expression.getLiteralText()))register(expression,pattern,"http",target!.id,{state:"known",values:[expression.getLiteralText()]},["pages-api:conditional-case","fallthrough:possible"]);}
          }
        }
      }
      else {register(first,pattern,"page",target?.callable ? target.id : null,null);const app=inputs.find(x=>pageExtensions!.some(e=>x.candidate.path===prefix+(file.startsWith(prefix+"src/") ? "src/" : "")+"pages/_app."+e));const owner=app ? b.exported(app.sourceFile,"default") : undefined;if(owner)b.bind("component-reference",first,owner,"next/pages-app-ownership",file);}
      if(target)b.bind("entry-point",first,target,"next/pages-default",file);
      for(const name of ["getStaticProps","getStaticPaths","getServerSideProps"]) {const target=b.exported(source,name);if(target?.callable)b.bind("lifecycle",first,target,"next/"+name,file);}
    }
    for(const node of source.getDescendants()) {
      discovery.boundary.check();
      if(Node.isJsxAttribute(node) && ["action","formAction"].includes(node.getNameNode().getText())) {
        const parent=node.getFirstAncestor(a=>Node.isJsxOpeningElement(a)||Node.isJsxSelfClosingElement(a)),tag=parent && (Node.isJsxOpeningElement(parent)||Node.isJsxSelfClosingElement(parent)) ? parent.getTagNameNode().getText() : "";
        const args=parent && (Node.isJsxOpeningElement(parent)||Node.isJsxSelfClosingElement(parent)) ? parent.getAttributes() : [];
        const init=node.getInitializer(),expression=init && Node.isJsxExpression(init) ? init.getExpression() : undefined,reference=expression ? b.target(expression) : undefined,target=reference ? actionTarget(reference.id) : undefined;
        if(["form","button","input"].includes(tag) && !args.some(Node.isJsxSpreadAttribute) && args.filter(a=>Node.isJsxAttribute(a)&&a.getNameNode().getText()===node.getNameNode().getText()).length===1 && target)b.bind("server-action",node,target,"next/form-action-framework-boundary");else b.gap(node,"ambiguous-target");
      }
      if(Node.isCallExpression(node)) {
        const reference=b.identifier(node.getExpression()),target=reference ? actionTarget(reference.id) : undefined;
        if(target && clients.has(file)){b.bind("server-action",node,target,"next/client-mediated-invocation/no-public-url");b.gap(node,"external-boundary");}
        const api=b.api(node.getExpression());
        if(api && ["next/navigation","next/cache"].includes(api.module) && ["redirect","permanentRedirect","revalidatePath","revalidateTag","updateTag"].includes(api.name)) {
          const args=node.getArguments();if(api.name==="updateTag"&&p.tuple==="next15")b.gap(node,"unsupported-syntax");else if(args[0]&&Node.isStringLiteral(args[0]))b.bind("operation",node,file,"next/"+api.name+"/literal/"+args[0].getLiteralText());else b.gap(node);
        }
      }
    }
  }
  const pages=snapshot.analysis.registrations.filter(r=>r.variantId===p.variant.id&&r.kind==="page"&&!r.conditions.includes("requires:soft-navigation"));
  const navigate=(node:Node,destination:string)=>{if(!destination.startsWith("/")||/[?#]/.test(destination)){b.gap(node,"unsupported-matcher");return;}const matches=pages.filter(r=>r.matcher.state==="supported"&&matchesNavigation(r.matcher,destination));if(matches.length===1 && matches[0].handlerId && !pages.some(r=>r.matcher.state==="unsupported") && !snapshot.analysis.gaps.some(g=>g.variantId===p.variant.id&&["resource-limit","custom-resolver","unsupported-encoding","parse-error"].includes(g.reason)))b.bind("navigation",node,matches[0].id,"next/literal-navigation",b.owner(node),matches[0].witnesses);else b.gap(node,"ambiguous-target");};
  for(const i of inputs)for(const node of i.sourceFile.getDescendants()) {
    discovery.boundary.check();
    if(Node.isJsxOpeningElement(node)||Node.isJsxSelfClosingElement(node)) {
      const api=b.api(node.getTagNameNode());
      if(api?.module==="next/link" && api.name==="default") {
        const attrs=node.getAttributes(),hrefs=attrs.filter(a=>Node.isJsxAttribute(a)&&a.getNameNode().getText()==="href"),href=hrefs.length===1 && Node.isJsxAttribute(hrefs[0]) ? hrefs[0].getInitializer() : undefined;
        const value=href && Node.isJsxExpression(href) ? href.getExpression() : href;
        if(!attrs.some(Node.isJsxSpreadAttribute)&&value&&Node.isStringLiteral(value))navigate(value,value.getLiteralText());else b.gap(node);
      }
    }
    if(Node.isCallExpression(node)&&Node.isPropertyAccessExpression(node.getExpression())) {
      const expression=node.getExpression();if(Node.isPropertyAccessExpression(expression)&&["push","replace"].includes(expression.getName())) {
        const receiver=expression.getExpression(),defs=receiver.getSymbol()?.getDeclarations()??[],variable=defs.length===1 && Node.isVariableDeclaration(defs[0]) ? defs[0] : undefined,initializer=variable?.getInitializer();
        const api=initializer && Node.isCallExpression(initializer) ? b.api(initializer.getExpression()) : undefined;
        if(api?.module==="next/navigation"&&api.name==="useRouter") {const args=node.getArguments();if(b.identifier(receiver)&&args.length===1 && Node.isStringLiteral(args[0]))navigate(node,args[0].getLiteralText());else b.gap(node);}
      }
    }
  }
  for(const record of configs) {
    const input=inputs.find(i=>i.candidate.path===record.resource.path);if(!input)continue;
    const source=input.sourceFile;
    const used=new Set<Node>();
    for(const key of ["redirects","rewrites"]) {
      const value=property(config,key);if(!value)continue;
      if(!configSafe){b.gap(source,"dynamic-expression");continue;}
      const groups=key==="rewrites" && value.kind==="object" ? ["beforeFiles","afterFiles","fallback"].map(group=>({group,value:value.properties[group]})) : [{group:key==="rewrites" ? "afterFiles" : "redirects",value}];
      let order=0;
      for(const group of groups) {
        if(!group.value)continue;if(group.value.kind!=="array"){b.gap(source);continue;}
        for(const rule of group.value.items) {
          discovery.boundary.check();const raw=literal(property(rule,"source")),destination=literal(property(rule,"destination"));
          const occurrence=source.getDescendantsOfKind(SyntaxKind.PropertyAssignment).find(n=>!used.has(n) && n.getName().replace(/['"]/g,"")==="source" && n.getInitializer()?.getText().slice(1,-1)===raw);if(occurrence)used.add(occurrence);
          if(!raw || !destination || !occurrence || rule.kind!=="object" || Object.keys(rule.properties).some(k=>!["source","destination","basePath","locale","has","missing","permanent","statusCode"].includes(k))){b.gap(source);continue;}
          // Routing declaration only: no destination endpoint or deployment identity is inferred.
          const basePathOption=property(rule,"basePath");
          const sensitivity=property(property(config,"experimental"),"caseSensitiveRoutes");
          if(sensitivity && (sensitivity.kind!=="literal"||typeof sensitivity.value!=="boolean")){b.gap(occurrence,"custom-resolver");continue;}
          register(occurrence,raw,"navigation",null,null,["next-config:"+key,"order-group:"+group.group,"destination:"+destination,"declared-options:"+JSON.stringify(rule),"basePath:"+base,"selected-environment:"+p.variant.environment],false,order++,basePathOption?.kind==="literal"&&basePathOption.value===false ? raw : base+raw,sensitivity?.kind==="literal" ? sensitivity.value===true : false);
        }
      }
    }
  }
  const runtimeResolve=(from:string,name:string)=>{const result=p.resolve(from,name);return result.state==="resolved" ? result.target : undefined;};
  extractReactBindings(snapshot,inputs,p.variant,runtimeResolve,"19.2.8",()=>discovery.boundary.check(),"19.2.8",true,"fs-04/1");
  // Legacy TS calls are retained, but divergent runtime/boundary calls are withheld from this variant's trace.
  const calls=new Map(snapshot.behavior.relations.filter(r=>r.relation==="calls").map(r=>[JSON.stringify([r.site.file,r.site.start]),r]));
  for(const i of inputs)for(const call of i.sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)){const old=calls.get(JSON.stringify([i.candidate.path,call.getStart()]));if(old && Node.isIdentifier(call.getExpression()) && !actions.has(old.target) && b.identifier(call.getExpression())?.id!==old.target)b.gap(call,"ambiguous-target");}
}
