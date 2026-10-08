import {Node, SyntaxKind} from "ts-morph";
import type {CodeSnapshot} from "../../engine/types.ts";
import {factId, type Registration, type Witness} from "../../model/framework.ts";
import type {FrameworkSource} from "../framework-bindings.ts";
import {frameworkBindings} from "../framework-bindings.ts";
import {frameworkFact} from "../framework-budget.ts";
import type {FrameworkProjection} from "./rn-platform.ts";
import type {Variant} from "../../model/framework.ts";
import {AnalysisBoundaryError} from "../../engine/boundary.ts";

/** Navigation is declarative framework evidence, never a CALLS edge. Only an
 * established navigator and screen context can disambiguate literal targets. */
export function extractReactNavigation(snapshot: CodeSnapshot, inputs: FrameworkSource[], variant: Variant, resolve: (from:string,specifier:string)=>string|undefined, checkpoint:()=>void, projection:FrameworkProjection) {
  const base=frameworkBindings(snapshot,inputs,variant,resolve,checkpoint,"fs-07/1");
  const b=frameworkBindings(snapshot,inputs,variant,resolve,checkpoint,"fs-07/1",projection);
  const definitions=new Map(inputs.flatMap(i=>i.sourceFile.getDescendants().flatMap(n=>{const d=b.declaration(n);return d?[[d.id,n] as const]:[];})));
  const navigators=new Map<string,{call:Node; config:Node|undefined}>();
  for(const input of inputs)for(const v of input.sourceFile.getVariableDeclarations()) {
    checkpoint();const id=b.identifier(v.getNameNode())?.id,call=v.getInitializer();
    if(!id||!call||!Node.isCallExpression(call)||!projection.active(call))continue;
    const api=b.api(call.getExpression());
    if(api?.module!=="@react-navigation/native-stack"||api.name!=="createNativeStackNavigator")continue;
    if(call.getArguments().length>1){b.gap(call);continue;}
    navigators.set(id,{call,config:call.getArguments()[0]});
  }
  type Screen={navigator:string;registration:Registration;target:string|null;child?:string};
  const screens:Screen[]=[];
  function register(navigator:string,name:string,node:Node,component:Node|undefined,conditions:string[]=[],extra:Witness[]=[]) {
    checkpoint();if(!name||name.length>4096||name.includes("/")||!projection.active(node)){b.gap(node,"unsupported-matcher");return;}
    const target=component?b.target(component):undefined,handler=target?.callable?target:undefined;
    const childId=component?b.identifier(component)?.id:undefined,child=childId&&navigators.has(childId)?childId:undefined;
    const gaps:string[]=[];
    if(!handler){base.gap(node,"ambiguous-target");gaps.push(factId("gap",b.site(node),variant.id,"ambiguous-target"));}
    const occurrence=b.site(node),id=factId("registration:navigation",occurrence,variant.id,name);
    if(snapshot.analysis.registrations.some(r=>r.id===id))return;
    if(snapshot.analysis.registrations.length>=10000)throw new AnalysisBoundaryError("resource-limit");
    frameworkFact(snapshot,occurrence.file);
    const factory=navigators.get(navigator)!;
    const witnesses:Witness[]=[b.witness(occurrence,"registration"),b.witness(b.site(factory.call)),...extra,...variant.configWitnesses,{role:"framework-rule",tupleId:snapshot.analysis.capabilities.find(c=>c.variantId===variant.id&&c.extractorVersion==="fs-07/1")!.tupleId,ruleId:"react-navigation/screen-declaration",extractor:"react-native",extractorVersion:"fs-07/1",variantId:variant.id},...(handler?[b.witness(handler.site,"declaration")]:[])];
    const registration:Registration={id,kind:"navigation",handlerId:handler?.id??null,variantId:variant.id,occurrence,rawPattern:name,methodState:null,matcher:{state:"supported",segments:[{kind:"literal",value:name}],trailingSlash:"optional",caseSensitive:true,decodingPolicy:"raw"},precedence:null,conditions:["navigator:"+navigator,...conditions],prefixWitnesses:[],witnesses,legacyRouteIndex:null,gapIds:gaps};
    snapshot.analysis.registrations.push(registration);screens.push({navigator,registration,target:handler?.id??null,child});
    b.bind("registration",node,id,"react-navigation/screen-registration",undefined,extra);
  }
  function object(node:Node|undefined):Map<string,Node>|undefined {
    if(!node||!Node.isObjectLiteralExpression(node))return;
    const properties=new Map<string,Node>();
    for(const p of node.getProperties()) {
      if(!Node.isPropertyAssignment(p)&&!Node.isShorthandPropertyAssignment(p))return;
      const key=p.getNameNode();if(!Node.isIdentifier(key)&&!Node.isStringLiteral(key))return;
      const name=Node.isStringLiteral(key)?key.getLiteralText():key.getText();if(properties.has(name)||name==="__proto__")return;
      properties.set(name,Node.isPropertyAssignment(p)?p.getInitializerOrThrow():key);
    }return properties;
  }
  for(const [id,factory]of navigators) {
    if(!factory.config)continue;
    const config=object(factory.config);if(!config){b.gap(factory.config);continue;}
    function staticScreens(node:Node|undefined,conditions:string[],depth=0) {
      checkpoint();if(depth>32){if(node)b.gap(node,"resource-limit");return;}
      const entries=object(node);if(!entries){if(node)b.gap(node);return;}
      for(const [name,value]of entries) {
        const entry=object(value),component=entry?entry.get("screen"):value;
        const condition=entry?.get("if"),next=condition?[...conditions,"callback:"+b.site(condition).file+":"+condition.getStart()]:conditions;
        if(condition)base.gap(condition,"dynamic-expression");
        register(id,name,value,component,next,[b.witness(b.site(factory.config!))]);
      }
    }
    if(config.has("screens"))staticScreens(config.get("screens"),[]);
    const groups=config.get("groups");if(groups){const entries=object(groups);if(!entries)b.gap(groups);else for(const [name,group]of entries){const options=object(group);if(!options){b.gap(group);continue;}const condition=options.get("if");if(condition)base.gap(condition,"dynamic-expression");staticScreens(options.get("screens"),["group:"+name,...(condition?["callback:"+b.site(condition).file+":"+condition.getStart()]:[])]);}}
    for(const key of config.keys())if(!["screens","groups","initialRouteName","screenOptions","id","layout","screenLayout"].includes(key))b.gap(factory.config,"unsupported-syntax");
  }
  const instanceCounts=new Map<string,number>();
  for(const input of inputs)for(const node of input.sourceFile.getDescendants()){
    checkpoint();if(!projection.active(node)||!Node.isJsxOpeningElement(node)&&!Node.isJsxSelfClosingElement(node))continue;
    const tag=node.getTagNameNode();if(!Node.isPropertyAccessExpression(tag)||tag.getName()!=="Navigator")continue;
    const id=b.identifier(tag.getExpression())?.id;if(id&&navigators.has(id))instanceCounts.set(id,(instanceCounts.get(id)??0)+1);
  }
  for(const input of inputs)for(const node of input.sourceFile.getDescendants()) {
    checkpoint();if(!Node.isJsxSelfClosingElement(node)&&!Node.isJsxOpeningElement(node))continue;
    const tag=node.getTagNameNode();if(!Node.isPropertyAccessExpression(tag)||tag.getName()!=="Screen")continue;
    const id=b.identifier(tag.getExpression())?.id;if(!id||!navigators.has(id))continue;
    const properties=new Map<string,Node>();let dynamic=false;
    for(const p of node.getAttributes()){if(!Node.isJsxAttribute(p)){dynamic=true;continue;}const name=p.getNameNode().getText();if(properties.has(name))dynamic=true;const value=p.getInitializer();if(value)properties.set(name,Node.isJsxExpression(value)?value.getExpression()??value:value);}
    const name=properties.get("name");if(dynamic||!name||!Node.isStringLiteral(name)){b.gap(node);continue;}
    const container=node.getAncestors().find(a=>Node.isJsxElement(a)&&Node.isPropertyAccessExpression(a.getOpeningElement().getTagNameNode())&&a.getOpeningElement().getTagNameNode().getText()===tag.getExpression().getText()+".Navigator");
    if(!container){b.gap(node,"external-boundary");continue;}
    const between=node.getAncestors().slice(0,node.getAncestors().indexOf(container));
    const conditions=between.filter(a=>Node.isConditionalExpression(a)||Node.isBinaryExpression(a)||Node.isIfStatement(a)).map(a=>"conditional:"+b.site(a).file+":"+a.getStart());
    if(between.some(a=>Node.isArrowFunction(a)||Node.isFunctionExpression(a))){base.gap(node,"dynamic-expression");continue;}
    const ambiguousInstance=(instanceCounts.get(id)??0)!==1;
    if(ambiguousInstance)base.gap(node,"ambiguous-target");
    register(id,name.getLiteralText(),node,ambiguousInstance?undefined:properties.get("component"),[...conditions,...(ambiguousInstance?["ambiguous-instance"]:[])],[b.witness(b.site(container))]);
    for(const p of node.getAttributes())if(Node.isJsxAttribute(p)&&["listeners","options","getComponent"].includes(p.getNameNode().getText()))b.gap(p,"dynamic-expression");
  }
  // A callable screen can host a JSX navigator. Establish nesting only when
  // its own declaration contains one direct navigator, outside callbacks and
  // unknown branches. Merely sharing a component name establishes no parent.
  for(const screen of screens){
    if(screen.child||!screen.target)continue;
    const declaration=definitions.get(screen.target);if(!declaration)continue;
    const nested=new Set<string>();
    for(const node of declaration.getDescendants()){
      checkpoint();if(!Node.isJsxOpeningElement(node)||!projection.active(node))continue;
      const tag=node.getTagNameNode();if(!Node.isPropertyAccessExpression(tag)||tag.getName()!=="Navigator")continue;
      const id=b.identifier(tag.getExpression())?.id;if(!id||!navigators.has(id))continue;
      const intervening=node.getAncestors().slice(0,node.getAncestors().indexOf(declaration));
      if(intervening.some(a=>Node.isArrowFunction(a)||Node.isFunctionExpression(a)||Node.isConditionalExpression(a)||Node.isIfStatement(a)||Node.isBinaryExpression(a))){base.gap(node,"dynamic-expression");continue;}
      nested.add(id);
    }
    if(nested.size===1)screen.child=[...nested][0];else if(nested.size>1)base.gap(declaration,"ambiguous-target");
  }
  for(const input of inputs)for(const call of input.sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    checkpoint();if(!projection.active(call))continue;
    const expr=call.getExpression();if(!Node.isPropertyAccessExpression(expr)||!Node.isIdentifier(expr.getExpression())||!["navigate","push","replace"].includes(expr.getName()))continue;
    const receiver=b.identifier(expr.getExpression()),definition=receiver?definitions.get(receiver.id):undefined,init=definition&&Node.isVariableDeclaration(definition)?definition.getInitializer():undefined;
    const api=init&&Node.isCallExpression(init)?b.api(init.getExpression()):undefined;
    if(api?.module!=="@react-navigation/native"||api.name!=="useNavigation")continue;
    const argument=call.getArguments()[0];if(!argument||!Node.isStringLiteral(argument)){b.gap(call);continue;}
    const owner=call.getAncestors().map(n=>b.declaration(n)?.id).find(id=>id&&screens.some(s=>s.target===id));
    const owners=screens.filter(s=>s.target===owner),contexts=new Set(owners.map(s=>s.navigator));
    let targets=screens.filter(s=>contexts.has(s.navigator)&&s.registration.rawPattern===argument.getLiteralText());
    const uncertain=(s:Screen)=>s.registration.conditions.some(c=>c.startsWith("callback:")||c.startsWith("conditional:"));
    if(contexts.size!==1||owners.some(uncertain)||targets.length!==1||uncertain(targets[0])){b.gap(call,"ambiguous-target");continue;}
    const proof=[...owners[0].registration.witnesses,...targets[0].registration.witnesses];
    let options:Node|undefined=call.getArguments()[1];let depth=0,invalid=false;
    while(options){
      checkpoint();if(++depth>32){b.gap(call,"resource-limit");invalid=true;break;}
      const config=object(options);if(!config){b.gap(call);invalid=true;break;}
      if(!config.has("screen"))break; // Ordinary params cannot select a nested screen.
      const name=config.get("screen"),child=targets[0].child;
      if(!name||!Node.isStringLiteral(name)||!child){b.gap(call,"ambiguous-target");invalid=true;break;}
      targets=screens.filter(s=>s.navigator===child&&s.registration.rawPattern===name.getLiteralText());
      if(targets.length!==1||uncertain(targets[0])){b.gap(call,"ambiguous-target");invalid=true;break;}
      proof.push(...targets[0].registration.witnesses);options=config.get("params");
    }
    if(invalid)continue;if(proof.length>190){b.gap(call,"resource-limit");continue;}
    b.bind("navigation",call,targets[0].registration.id,"react-navigation/literal-target",undefined,proof);
  }
}
