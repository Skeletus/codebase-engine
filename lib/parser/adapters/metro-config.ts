import {ts} from "ts-morph";
import {interpretConfig,type ConfigResult,type StaticValue,CONFIG_LIMITS} from "../../engine/static-config.ts";
import type {GenerationBoundary} from "../../engine/boundary.ts";
import {METRO_DEFAULTS} from "./metro-defaults.ts";

/** Framework-specific bounded evaluator for pure getDefaultConfig/mergeConfig
 * declarations. Helpers are identities/record merges over pinned data, never
 * imported or called. Mutation, plugins and configuration callbacks are gaps. */
export function interpretMetroConfig(text:string,tuple:keyof typeof METRO_DEFAULTS,boundary:GenerationBoundary):ConfigResult{
  const original=interpretConfig(text,{boundary});if(original.value.kind==="object")return original;
  const source=ts.createSourceFile("metro.config.ts",text,ts.ScriptTarget.Latest,true),helpers=new Map<string,"getDefaultConfig"|"mergeConfig">(),constants=new Map<string,ts.Expression>(),active=new Set<string>();
  let root:ts.Expression|undefined,visited=0;
  const resolverKeys=new Set(["sourceExts","assetExts","resolverMainFields","unstable_conditionNames","unstable_conditionsByPlatform","unstable_enablePackageExports"]);
  const defaults=interpretConfig(JSON.stringify({resolver:Object.fromEntries(Object.entries(METRO_DEFAULTS[tuple]).filter(([key])=>resolverKeys.has(key)))}),{expression:true,boundary}).value;
  const moduleNames=new Set(tuple.startsWith("expo")?["expo/metro-config","@expo/metro-config"]:["@react-native/metro-config"]);
  const fail=(reason:"dynamic-expression"|"resource-limit"|"parse-error"="dynamic-expression"):ConfigResult=>({value:{kind:"unknown",reason},gaps:[{reason,start:0,end:text.length,detail:"Metro composition requires unsupported execution or exceeds its static budget"}],visited,sites:[]});
  if((source as ts.SourceFile&{parseDiagnostics:readonly ts.Diagnostic[]}).parseDiagnostics.length)return fail("parse-error");
  function helper(local:string,imported:string){if(!(tuple.startsWith("expo")?["getDefaultConfig"]:["getDefaultConfig","mergeConfig"]).includes(imported)||helpers.has(local)||constants.has(local))throw Error("unknown");helpers.set(local,imported as "getDefaultConfig"|"mergeConfig");}
  function evaluate(n:ts.Expression,depth=0):StaticValue{
    boundary.check();if(++visited>CONFIG_LIMITS.nodes||depth>CONFIG_LIMITS.depth)throw Error("budget");
    if(ts.isParenthesizedExpression(n)||ts.isAsExpression(n)||ts.isSatisfiesExpression(n))return evaluate(n.expression,depth+1);
    if(ts.isStringLiteral(n)||ts.isNoSubstitutionTemplateLiteral(n))return{kind:"literal",value:n.text};
    if(ts.isNumericLiteral(n))return{kind:"literal",value:Number(n.text)};
    if(n.kind===ts.SyntaxKind.TrueKeyword||n.kind===ts.SyntaxKind.FalseKeyword)return{kind:"literal",value:n.kind===ts.SyntaxKind.TrueKeyword};
    if(n.kind===ts.SyntaxKind.NullKeyword)return{kind:"literal",value:null};
    if(ts.isIdentifier(n)){const value=constants.get(n.text);if(!value||active.has(n.text))throw Error("unknown");active.add(n.text);const result=evaluate(value,depth+1);active.delete(n.text);return result;}
    if(ts.isPropertyAccessExpression(n)){const value=evaluate(n.expression,depth+1);if(value.kind!=="object"||!Object.hasOwn(value.properties,n.name.text))throw Error("unknown");return value.properties[n.name.text];}
    if(ts.isArrayLiteralExpression(n)){const items:StaticValue[]=[];for(const child of n.elements){if(ts.isSpreadElement(child)){const value=evaluate(child.expression,depth+1);if(value.kind!=="array")throw Error("unknown");items.push(...value.items);}else items.push(evaluate(child,depth+1));if(items.length>1000)throw Error("budget");}return{kind:"array",items};}
    if(ts.isObjectLiteralExpression(n)){
      const properties:Record<string,StaticValue>=Object.create(null);
      for(const p of n.properties){
        if(ts.isSpreadAssignment(p)){const value=evaluate(p.expression,depth+1);if(value.kind!=="object")throw Error("unknown");Object.assign(properties,value.properties);continue;}
        if(!ts.isPropertyAssignment(p)&&!ts.isShorthandPropertyAssignment(p))throw Error("unknown");
        if(!ts.isIdentifier(p.name)&&!ts.isStringLiteral(p.name))throw Error("unknown");if(p.name.text==="__proto__")throw Error("unknown");
        properties[p.name.text]=evaluate(ts.isPropertyAssignment(p)?p.initializer:p.name,depth+1);
      }return{kind:"object",properties};
    }
    if(ts.isCallExpression(n)&&ts.isIdentifier(n.expression)&&helpers.has(n.expression.text)){
      if(helpers.get(n.expression.text)==="getDefaultConfig"){
        if(n.arguments.length!==1||!ts.isIdentifier(n.arguments[0])||n.arguments[0].text!=="__dirname"||constants.has("__dirname")||helpers.has("__dirname"))throw Error("unknown");return structuredClone(defaults);
      }
      if(n.arguments.length<1||n.arguments.length>64)throw Error("budget");
      let result:StaticValue={kind:"object",properties:{}};
      for(const arg of n.arguments){const next=evaluate(arg,depth+1);if(result.kind!=="object"||next.kind!=="object")throw Error("unknown");const resolver:StaticValue|undefined=result.properties.resolver,override:StaticValue|undefined=next.properties.resolver;result={kind:"object",properties:{...result.properties,...next.properties,...(override?{resolver:resolver?.kind==="object"&&override.kind==="object"?{kind:"object",properties:{...resolver.properties,...override.properties}}:override}:{})}};}
      return result;
    }
    throw Error("unknown");
  }
  try{
    for(const statement of source.statements){
      boundary.check();if(++visited>CONFIG_LIMITS.nodes)throw Error("budget");
      if(ts.isImportDeclaration(statement)&&ts.isStringLiteral(statement.moduleSpecifier)&&moduleNames.has(statement.moduleSpecifier.text)){
        const bindings=statement.importClause?.namedBindings;if(!bindings||!ts.isNamedImports(bindings)||statement.importClause?.isTypeOnly||statement.importClause.name)throw Error("unknown");for(const binding of bindings.elements){if(binding.isTypeOnly)throw Error("unknown");helper(binding.name.text,binding.propertyName?.text??binding.name.text);}continue;
      }
      if(ts.isVariableStatement(statement)&&statement.declarationList.flags&ts.NodeFlags.Const){
        for(const d of statement.declarationList.declarations){
          if(!d.initializer)throw Error("unknown");
          if(ts.isObjectBindingPattern(d.name)&&ts.isCallExpression(d.initializer)&&ts.isIdentifier(d.initializer.expression)&&d.initializer.expression.text==="require"&&d.initializer.arguments.length===1&&ts.isStringLiteral(d.initializer.arguments[0])&&moduleNames.has(d.initializer.arguments[0].text)){
            for(const binding of d.name.elements){if(!ts.isIdentifier(binding.name)||binding.initializer||binding.dotDotDotToken||binding.propertyName&&!ts.isIdentifier(binding.propertyName))throw Error("unknown");helper(binding.name.text,binding.propertyName&&ts.isIdentifier(binding.propertyName)?binding.propertyName.text:binding.name.text);}continue;
          }
          if(!ts.isIdentifier(d.name)||constants.has(d.name.text)||helpers.has(d.name.text)||d.name.text==="require"||d.name.text==="module")throw Error("unknown");constants.set(d.name.text,d.initializer);evaluate(d.initializer);
        }continue;
      }
      if(ts.isExportAssignment(statement)&&!statement.isExportEquals){if(root)throw Error("unknown");root=statement.expression;continue;}
      if(ts.isExpressionStatement(statement)&&ts.isBinaryExpression(statement.expression)&&statement.expression.operatorToken.kind===ts.SyntaxKind.EqualsToken&&ts.isPropertyAccessExpression(statement.expression.left)&&ts.isIdentifier(statement.expression.left.expression)&&statement.expression.left.expression.text==="module"&&statement.expression.left.name.text==="exports"){if(root)throw Error("unknown");root=statement.expression.right;continue;}
      if(!ts.isEmptyStatement(statement))throw Error("unknown");
    }
    return root?{value:evaluate(root),gaps:[],visited,sites:[{start:root.getStart(source),end:root.end}]}:fail();
  }catch(error){if(error instanceof Error&&["unknown","budget"].includes(error.message))return fail(error.message==="budget"?"resource-limit":"dynamic-expression");throw error;}
}
