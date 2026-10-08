import {Node,SyntaxKind} from "ts-morph";
import type {CodeSnapshot} from "../../engine/types.ts";
import type {FrameworkSource} from "../framework-bindings.ts";
import {frameworkBindings} from "../framework-bindings.ts";
import {factId,type Registration,type Variant,type Witness,type Matcher} from "../../model/framework.ts";
import {frameworkFact} from "../framework-budget.ts";
import {matchesNavigation} from "./react-router.ts";
import type {FrameworkProjection} from "./rn-platform.ts";
import {AnalysisBoundaryError} from "../../engine/boundary.ts";

/** Declared linking maps are configuration evidence. Opening a URL does not
 * prove which installed native application receives it; keep those candidates. */
export function extractNavigationLinking(snapshot:CodeSnapshot,inputs:FrameworkSource[],variant:Variant,resolve:(from:string,specifier:string)=>string|undefined,checkpoint:()=>void,projection:FrameworkProjection){
  const b=frameworkBindings(snapshot,inputs,variant,resolve,checkpoint,"fs-07/1",projection);
  function fields(node:Node|undefined):Map<string,Node>|undefined{
    if(!node||!Node.isObjectLiteralExpression(node))return;
    const result=new Map<string,Node>();
    for(const p of node.getProperties()){
      if(!Node.isPropertyAssignment(p))return;
      const key=p.getNameNode();if(!Node.isStringLiteral(key)&&!Node.isIdentifier(key))return;
      const name=Node.isStringLiteral(key)?key.getLiteralText():key.getText();if(result.has(name)||name==="__proto__")return;
      result.set(name,p.getInitializerOrThrow());
    }return result;
  }
  for(const input of inputs)for(const node of input.sourceFile.getDescendants()){
    checkpoint();if(!Node.isJsxOpeningElement(node)&&!Node.isJsxSelfClosingElement(node)||!projection.active(node))continue;
    const api=b.api(node.getTagNameNode());if(api?.module!=="@react-navigation/native"||api.name!=="NavigationContainer")continue;
    const attrs=node.getAttributes(),values=attrs.filter(a=>Node.isJsxAttribute(a)&&a.getNameNode().getText()==="linking");if(!values.length)continue;
    if(values.length!==1||attrs.some(a=>Node.isJsxSpreadAttribute(a))){b.gap(node);continue;}
    const init=Node.isJsxAttribute(values[0])?values[0].getInitializer():undefined,map=fields(init&&Node.isJsxExpression(init)?init.getExpression():init);
    const prefixes=map?.get("prefixes"),config=fields(map?.get("config")),screens=fields(config?.get("screens"));
    if(!map||!prefixes||!Node.isArrayLiteralExpression(prefixes)||!screens||[...map.keys()].some(k=>!["prefixes","config","enabled"].includes(k))){b.gap(node);continue;}
    const enabled=map.get("enabled");if(enabled&&enabled.getKind()!==SyntaxKind.TrueKeyword){b.gap(enabled,enabled.getKind()===SyntaxKind.FalseKeyword?"variant-not-selected":"dynamic-expression");continue;}
    const urls=prefixes.getElements().flatMap(p=>Node.isStringLiteral(p)&&/^[a-z][a-z0-9+.-]*:\/\/(?:[^\s@?#]*)$/i.test(p.getLiteralText())?[p.getLiteralText()]:[]);
    if(urls.length!==prefixes.getElements().length||urls.length>64){b.gap(prefixes);continue;}
    const prefixOccurrence=b.site(prefixes);
    const container=Node.isJsxOpeningElement(node)?node.getParentIfKind(SyntaxKind.JsxElement):node;
    const endpoints=snapshot.analysis.registrations.filter(r=>r.variantId===variant.id&&r.kind==="navigation"&&!r.conditions.some(c=>c.startsWith("linking-prefix:"))&&container&&r.occurrence.file===input.candidate.path&&r.occurrence.start>=container.getStart()&&r.occurrence.end<=container.getEnd());
    const navigatorIds=new Set(endpoints.flatMap(r=>r.conditions.filter(c=>c.startsWith("navigator:")).map(c=>c.slice(10))));
    const roots:string[]=[];
    for(const child of container?.getDescendants()??[]){
      if(!Node.isJsxOpeningElement(child)&&!Node.isJsxSelfClosingElement(child))continue;
      const tag=child.getTagNameNode();if(!Node.isPropertyAccessExpression(tag)||tag.getName()!=="Navigator")continue;
      const id=b.identifier(tag.getExpression())?.id;if(!id||!navigatorIds.has(id))continue;
      const ancestors=child.getAncestors().slice(0,child.getAncestors().indexOf(container!));
      if(ancestors.some(a=>Node.isJsxElement(a)&&Node.isPropertyAccessExpression(a.getOpeningElement().getTagNameNode())&&a.getOpeningElement().getTagNameNode().getText().endsWith(".Navigator")))continue;
      if(ancestors.some(a=>Node.isConditionalExpression(a)||Node.isIfStatement(a)||Node.isBinaryExpression(a)||Node.isArrowFunction(a)||Node.isFunctionExpression(a))){b.gap(child);continue;}
      roots.push(id);
    }
    function routes(entries:Map<string,Node>,parent:string,parents:Witness[],depth=0,navigator:string|null=roots.length===1?roots[0]:null){
      checkpoint();if(depth>32){b.gap(node,"resource-limit");return;}
      for(const [name,value]of entries){
        const options=fields(value),pathNode=options?options.get("path"):value,child=options?fields(options.get("screens")):undefined;
        if(options&&[...options.keys()].some(k=>!["path","screens","initialRouteName"].includes(k))){b.gap(value,"unsupported-syntax");continue;}
        if(!pathNode||!Node.isStringLiteral(pathNode)){b.gap(value);continue;}
        const rawPattern="/"+[parent,pathNode.getLiteralText()].filter(Boolean).join("/").replace(/^\/+/,""),parts=rawPattern.slice(1).split("/").filter(Boolean),segments:Extract<Matcher,{state:"supported"}>["segments"]=[];
        let unsupported=false;
        for(const [i,part]of parts.entries()){if(/^:[A-Za-z_]\w*$/.test(part))segments.push({kind:"parameter",name:part.slice(1),converter:"segment"});else if(part==="*"&&i===parts.length-1)segments.push({kind:"catchAll",name:"path",optional:true});else if(/[?*():]/.test(part))unsupported=true;else segments.push({kind:"literal",value:part});}
        if(new Set(segments.filter(s=>s.kind!=="literal").map(s=>s.name)).size!==segments.filter(s=>s.kind!=="literal").length)unsupported=true;
        const matching=navigator?endpoints.filter(r=>r.rawPattern===name&&r.conditions.includes("navigator:"+navigator)&&!r.conditions.some(c=>c.startsWith("conditional:")||c.startsWith("callback:"))):[],target=matching.length===1?matching[0]:undefined,occurrence=b.site(pathNode),gaps:string[]=[];
        if(!target?.handlerId){b.gap(pathNode,"ambiguous-target");gaps.push(factId("gap",occurrence,variant.id,"ambiguous-target"));}
        if(unsupported){b.gap(pathNode,"unsupported-matcher");gaps.push(factId("gap",occurrence,variant.id,"unsupported-matcher"));}
        const proof=[b.witness(occurrence,"registration"),b.witness(b.site(node)),b.witness(prefixOccurrence),...parents,...target?.witnesses??[],...variant.configWitnesses];
        const registration:Registration={id:factId("registration:navigation",occurrence,variant.id,rawPattern),kind:"navigation",handlerId:target?.handlerId??null,variantId:variant.id,occurrence,rawPattern,methodState:null,matcher:unsupported?{state:"unsupported",gapId:factId("gap",occurrence,variant.id,"unsupported-matcher")}:{state:"supported",segments,trailingSlash:"optional",caseSensitive:true,decodingPolicy:"percent-decode-segments"},precedence:null,conditions:[...urls.map(p=>"linking-prefix:"+p),"screen:"+name],prefixWitnesses:[],witnesses:proof,legacyRouteIndex:null,gapIds:gaps};
        if(proof.length>200){b.gap(pathNode,"resource-limit");continue;}
        if(snapshot.analysis.registrations.length>=10000)throw new AnalysisBoundaryError("resource-limit");
        frameworkFact(snapshot,occurrence.file);snapshot.analysis.registrations.push(registration);b.bind("registration",pathNode,registration.id,"react-navigation/linking-map",undefined,proof);
        // Nested maps establish declared paths. Until the component-to-child
        // navigator topology is proven, they cannot identify a handler merely
        // because its name appears elsewhere under this container.
        if(child)routes(child,rawPattern.slice(1),[...parents,b.witness(occurrence)],depth+1,null);
      }
    }routes(screens,"",[]);
  }
  for(const input of inputs)for(const call of input.sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)){
    checkpoint();const api=b.api(call.getExpression());if(api?.module!=="react-native"||api.name!=="Linking.openURL"||!projection.active(call))continue;
    const arg=call.getArguments()[0];if(!arg||!Node.isStringLiteral(arg)){b.gap(call);continue;}
    const candidates=snapshot.analysis.registrations.filter(r=>r.variantId===variant.id&&r.conditions.some(c=>c.startsWith("linking-prefix:")&&arg.getLiteralText().startsWith(c.slice(15))&&matchesNavigation(r.matcher,"/"+arg.getLiteralText().slice(c.slice(15).length).replace(/^\/+/,""))));
    b.gap(call,"unknown-origin");if(!candidates.length)continue;
    const occurrence=b.site(call);frameworkFact(snapshot,occurrence.file);
    snapshot.analysis.candidates.push({id:factId("candidate:navigation",occurrence,variant.id,b.owner(call)),relationKind:"navigation",sourceId:b.owner(call),targetIds:candidates.slice(0,200).map(r=>r.id),reasons:candidates.length>200?["unknown-origin","candidate-overflow"]:["unknown-origin"],truncated:candidates.length>200,variantId:variant.id,occurrence,witnesses:[b.witness(occurrence)]});
  }
}
