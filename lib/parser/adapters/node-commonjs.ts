import {Node,SyntaxKind} from "ts-morph";
import type {frameworkBindings,FrameworkSource} from "../framework-bindings.ts";
import type {nodeProfile} from "./node-profile.ts";
/** Unique literal initial CommonJS export assignments; mutations/escapes stay boundaries. */
export function extractCommonJs(inputs:FrameworkSource[],profile:ReturnType<typeof nodeProfile>,b:ReturnType<typeof frameworkBindings>,check:()=>void) {
  for(const {sourceFile,candidate} of inputs) {
    if(profile.format(candidate.path)!=="cjs")continue;
    const assignments=sourceFile.getDescendantsOfKind(SyntaxKind.BinaryExpression).filter(n=>n.getOperatorToken().getText()==="="&&/^(?:module\.exports(?:\.\w+)?|exports\.\w+)$/.test(n.getLeft().getText()));
    const escaped=sourceFile.getDescendantsOfKind(SyntaxKind.Identifier).some(n=>["module","exports"].includes(n.getText()) && !assignments.some(a=>n.getStart()>=a.getLeft().getStart()&&n.getEnd()<=a.getLeft().getEnd()));
    const names=new Set<string>(),replaced=assignments.filter(n=>n.getLeft().getText()==="module.exports");
    const exportName=(node:typeof assignments[number])=>node.getLeft().getText().replace(/^(?:module\.exports|exports)\./,"");
    if(escaped || replaced.length && assignments.length>1){for(const assignment of assignments)b.gap(assignment,"ambiguous-target");continue;}
    for(const assignment of assignments){check();const left=assignment.getLeft(),globals=left.getDescendantsOfKind(SyntaxKind.Identifier).filter(n=>["module","exports"].includes(n.getText()));
      // TypeScript creates synthetic `module`/`exports` symbols from CommonJS
      // assignments. Only an actual lexical declaration shadows the platform globals.
      if(globals.some(n=>n.getSymbol()?.getDeclarations().some(d=>Node.isVariableDeclaration(d)||Node.isParameterDeclaration(d)||Node.isFunctionDeclaration(d)||Node.isImportSpecifier(d)||Node.isImportClause(d)||Node.isNamespaceImport(d))) || assignment.getParent()?.getParent()!==sourceFile){b.gap(assignment,"unsupported-syntax");continue;}
      const name=exportName(assignment),right=assignment.getRight();if(names.has(name)){b.gap(assignment,"ambiguous-target");continue;}names.add(name);
      const duplicates=assignments.filter(a=>exportName(a)===name);if(duplicates.length!==1){b.gap(assignment,"ambiguous-target");continue;}
      if(Node.isObjectLiteralExpression(right)) {
        const keys=new Set<string>();if(right.getProperties().some(p=>!Node.isShorthandPropertyAssignment(p)&&!Node.isPropertyAssignment(p))){b.gap(right,"dynamic-expression");continue;}
        let invalid=false;for(const property of right.getProperties())if(Node.isShorthandPropertyAssignment(property)||Node.isPropertyAssignment(property)){const key=property.getName();if(keys.has(key)||property.getNameNode().getKind()===SyntaxKind.ComputedPropertyName)invalid=true;keys.add(key);}if(invalid){b.gap(right,"ambiguous-target");continue;}
        for(const property of right.getProperties())if(Node.isShorthandPropertyAssignment(property)||Node.isPropertyAssignment(property)) {
          const key=property.getName();
          const value=Node.isShorthandPropertyAssignment(property) ? property.getNameNode() : property.getInitializer(),target=Node.isShorthandPropertyAssignment(property) ? b.local(sourceFile,key) : value ? b.target(value) : undefined;if(target)b.bind("module-export",property,target,"node/commonjs-export/"+key);else b.gap(property);
        }
      } else {const target=b.target(right);if(target)b.bind("module-export",assignment,target,"node/commonjs-export/"+name);else if(Node.isCallExpression(right)&&right.getExpression().getText()==="require"&&!right.getExpression().getSymbol()?.getDeclarations().length&&Node.isStringLiteral(right.getArguments()[0])){const arg=right.getArguments()[0];if(Node.isStringLiteral(arg)){const resolution=profile.resolve(candidate.path,arg.getLiteralText(),"require");if(resolution.state==="resolved")b.bind("module-export",assignment,resolution.target,"node/commonjs-reexport");else b.gap(assignment,resolution.reason);}}else b.gap(assignment);}
    }
  }
}
