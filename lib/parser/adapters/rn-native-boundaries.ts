import path from "node:path";
import {Node,SyntaxKind} from "ts-morph";
import type {CodeSnapshot} from "../../engine/types.ts";
import {frameworkBindings,type FrameworkSource} from "../framework-bindings.ts";
import type {Discovery,DiscoveredProject} from "../../engine/discovery.ts";
import {metadataWitness} from "../../engine/profiles.ts";
import type {metroProfile} from "./metro-profile.ts";
import type {FrameworkProjection} from "./rn-platform.ts";

/** JS/TS integration inventory only. A literal registry name proves a lookup,
 * never the presence, identity, implementation or dispatch of a native module. */
export function extractNativeBoundaries(snapshot:CodeSnapshot,discovery:Discovery,project:DiscoveredProject,inputs:FrameworkSource[],profile:ReturnType<typeof metroProfile>,resolve:(from:string,specifier:string)=>string|undefined,projection:FrameworkProjection){
  const b=frameworkBindings(snapshot,inputs,profile.variant,resolve,()=>discovery.boundary.check(),"fs-07/1",projection);
  const metadata=discovery.metadata.all().find(r=>r.resource.path===(project.path==="."?"package.json":project.path+"/package.json"));
  const codegen=metadata?.config.value.kind==="object"?metadata.config.value.properties.codegenConfig:undefined;
  const configProof=metadata?metadataWitness(metadata,profile.variant.id):undefined;
  function record(node:Node,rule:string,name:string|undefined,generated:boolean){
    if(name!==undefined&&(!name||name.length>4096||/[\0\r\n]/.test(name))){b.gap(node,"dynamic-expression");return;}
    b.bind("operation",node,b.site(node).file,rule+(name?":"+name:""),undefined,codegen&&configProof?[configProof]:[]);
    // The operation declaration and the absent implementation are separate facts.
    b.gap(node,generated?"generated-code-unavailable":"external-boundary");
    if(codegen&&codegen.kind!=="object")b.gap(node,"dynamic-expression");
  }
  for(const input of inputs)for(const node of input.sourceFile.getDescendants()){
    discovery.boundary.check();if(!projection.active(node))continue;
    if(Node.isNewExpression(node)){
      const api=b.api(node.getExpression());if(api?.module==="react-native"&&api.name==="NativeEventEmitter")record(node,"rn/legacy-native-event-emitter",undefined,false);
    }
    if(Node.isInterfaceDeclaration(node))for(const heritage of node.getExtends()){
      const identifier=heritage.getExpression();if(!Node.isIdentifier(identifier))continue;
      const definitions=identifier.getSymbol()?.getDeclarations()??[];
      if(definitions.length!==1||!Node.isImportSpecifier(definitions[0]))continue;
      const imported=definitions[0].getFirstAncestorByKind(SyntaxKind.ImportDeclaration);
      if(imported?.getModuleSpecifierValue()==="react-native"&&definitions[0].getName()==="TurboModule")record(node,"rn/turbo-module-spec",node.getName(),true);
    }
    if(Node.isPropertyAccessExpression(node)){
      const api=b.api(node);
      if(api?.module==="react-native"&&/^NativeModules\.[^.]+$/.test(api.name))record(node,"rn/legacy-native-module-lookup",node.getName(),false);
    }
    if(Node.isElementAccessExpression(node)){
      const api=b.api(node.getExpression());if(api?.module==="react-native"&&api.name==="NativeModules"){
        const argument=node.getArgumentExpression();if(argument&&Node.isStringLiteral(argument))record(node,"rn/legacy-native-module-lookup",argument.getLiteralText(),false);else b.gap(node,"dynamic-expression");
      }
    }
    if(!Node.isCallExpression(node))continue;
    const expression=node.getExpression();
    if(Node.isPropertyAccessExpression(expression)&&["__turboModuleProxy","nativeCallSyncHook","__nativeModuleProxy"].includes(expression.getName())){
      // Spelling suggests a native surface but establishes neither the global
      // receiver nor a module identity. Retain only a boundary, never an edge.
      b.gap(node,"external-boundary");
    }
    const api=b.api(node.getExpression());if(!api)continue;
    const registry=api.module==="react-native"&&["TurboModuleRegistry.get","TurboModuleRegistry.getEnforcing","requireNativeComponent"].includes(api.name);
    const component=api.module==="react-native/Libraries/Utilities/codegenNativeComponent"&&api.name==="default";
    const commands=api.module==="react-native/Libraries/Utilities/codegenNativeCommands"&&api.name==="default";
    if(registry||component){const name=node.getArguments()[0];if(name&&Node.isStringLiteral(name))record(node,component?"rn/codegen-component-spec":"rn/native-registry-lookup/"+api.name,name.getLiteralText(),component);else b.gap(node,"dynamic-expression");}
    if(commands){
      record(node,"rn/codegen-command-spec",undefined,true);
      const options=node.getArguments()[0],properties=options&&Node.isObjectLiteralExpression(options)?options.getProperties():[];
      const names=properties.length===1&&Node.isPropertyAssignment(properties[0])&&properties[0].getName()==="supportedCommands"?properties[0].getInitializer():undefined;
      if(!names||!Node.isArrayLiteralExpression(names)||names.getElements().length>100||names.getElements().some(n=>!Node.isStringLiteral(n)))b.gap(node,"dynamic-expression");
    }
    if(api.module==="react-native"&&["UIManager.dispatchViewManagerCommand","UIManager.getViewManagerConfig"].includes(api.name))record(node,"rn/legacy-view-manager-operation/"+api.name,undefined,false);
  }
  if(codegen?.kind==="object"){
    const root=codegen.properties.jsSrcsDir,name=codegen.properties.name,type=codegen.properties.type;
    const known=root?.kind==="literal"&&typeof root.value==="string"&&name?.kind==="literal"&&typeof name.value==="string"&&type?.kind==="literal"&&["modules","components","all"].includes(String(type.value));
    const owned=known&&typeof root.value==="string"&&!path.posix.isAbsolute(root.value)&&!/[\\:\0]/.test(root.value)&&!root.value.split("/").includes("..");
    const directory=known&&owned?path.posix.normalize(path.posix.join(project.path,String(root.value))):undefined;
    const specifications=inputs.filter(i=>directory==="."||directory&&i.candidate.path.startsWith(directory+"/"));
    for(const input of specifications){
      b.bind("module-boundary",input.sourceFile,input.candidate.path,"rn/codegen-source-inventory",input.candidate.path,configProof?[configProof]:[]);b.gap(input.sourceFile,"generated-code-unavailable");
    }
    if(configProof&&configProof.role!=="framework-rule"&&(!known||!owned||!specifications.length))profile.gap(configProof.site,!known||!owned?"dynamic-expression":"missing-metadata");
  }else if(codegen&&configProof&&configProof.role!=="framework-rule"){
    profile.gap(configProof.site,"unsupported-syntax");
  }
}
