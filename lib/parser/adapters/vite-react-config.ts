import {ts} from "ts-morph";
import {interpretConfig,type StaticValue} from "../../engine/static-config.ts";
import {AnalysisBoundaryError,type GenerationBoundary} from "../../engine/boundary.ts";

/** Recognize a qualified literal plugin declaration, never import or invoke it. */
export function reactPluginConfig(text:string,vite:string,version:string|undefined,boundary:GenerationBoundary) {
  const source=ts.createSourceFile("vite.config.ts",text,ts.ScriptTarget.Latest,true);
  const imports=source.statements.filter(ts.isImportDeclaration).filter(n=>ts.isStringLiteral(n.moduleSpecifier)&&n.moduleSpecifier.text==="@vitejs/plugin-react"&&!n.importClause?.isTypeOnly&&n.importClause?.name);
  const expected=vite==="7.3.7" ? "5.2.0" : vite==="8.3.3" ? "6.1.2" : "";
  let replacement:ts.ArrayLiteralExpression|undefined,automatic=false,visited=0;
  const visit=(node:ts.Node)=>{
    boundary.check();
    if(++visited>10000)throw new AnalysisBoundaryError("resource-limit");
    if(ts.isPropertyAssignment(node)&&node.name.getText(source)==="plugins"&&ts.isArrayLiteralExpression(node.initializer)&&node.initializer.elements.length===1&&imports.length===1&&version===expected){
      const call=node.initializer.elements[0],name=imports[0].importClause!.name!.text;
      let shadow=false;
      const check=(n:ts.Node)=>{boundary.check();if((ts.isVariableDeclaration(n)||ts.isParameter(n)||ts.isFunctionDeclaration(n)||ts.isClassDeclaration(n))&&n.name?.getText(source)===name)shadow=true;if(ts.isBinaryExpression(n)&&n.left.getText(source)===name&&n.operatorToken.kind>=ts.SyntaxKind.FirstAssignment&&n.operatorToken.kind<=ts.SyntaxKind.LastAssignment)shadow=true;if((ts.isPrefixUnaryExpression(n)||ts.isPostfixUnaryExpression(n))&&n.operand.getText(source)===name)shadow=true;ts.forEachChild(n,check);};check(source);
      if(!shadow&&ts.isCallExpression(call)&&ts.isIdentifier(call.expression)&&call.expression.text===name&&call.arguments.length<=1){
        const options:StaticValue=call.arguments[0] ? interpretConfig(call.arguments[0].getText(source),{expression:true,boundary}).value : {kind:"object",properties:{}};
        if(options.kind==="object"&&Object.entries(options.properties).every(([key,value])=>value.kind==="literal"&&(key==="jsxImportSource"&&value.value==="react"||key==="jsxRuntime"&&value.value==="automatic"))){
          replacement=node.initializer;automatic=options.properties.jsxRuntime?.kind!=="literal"||options.properties.jsxRuntime.value!=="classic";
        }
      }
    }
    ts.forEachChild(node,visit);
  };visit(source);
  if(!replacement)return {config:interpretConfig(text,{wrappers:{defineConfig:"vite"},boundary}).value,automatic:false,qualifiedPlugin:false};
  const start=replacement.getStart(source),end=replacement.end;
  const sanitized=text.slice(0,start)+"[]"+" ".repeat(end-start-2)+text.slice(end);
  return {config:interpretConfig(sanitized,{wrappers:{defineConfig:"vite"},boundary}).value,automatic,qualifiedPlugin:true};
}
