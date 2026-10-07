import path from "node:path";
import { Node, SyntaxKind } from "ts-morph";
import type { CodeSnapshot } from "../../engine/types.ts";
import type { Selection } from "../index.ts";
import { frameworkBindings, type FrameworkSource } from "../framework-bindings.ts";
import { nodeProfile, type NodeMode } from "./node-profile.ts";
import { extractNextBindings } from "./next-behavior.ts";
import { validateSnapshot } from "../../engine/contract.ts";
import {extractCommonJs} from "./node-commonjs.ts";
import {seedFrameworkCallbacks} from "../framework-budget.ts";

/** Additive framework projection. Legacy imports, calls, routes and Impact are retained. */
export function extractNodeNext(snapshot:CodeSnapshot, selection:Selection, inputs:FrameworkSource[], modes:readonly NodeMode[]=["node-development"]) {
  if(modes.some(m=>!["node-development","node-production","browser"].includes(m)))throw new Error("Unsupported Node/Next variant");
  const discovery=selection.walk.discovery;
  for(const project of discovery.projects) {
    const nextProject=project.composition.frameworks.includes("Next.js");
    const packageRecord=discovery.metadata.all().find(r=>r.resource.path===(project.path==="." ? "" : project.path+"/")+"package.json");
    const json=packageRecord?.json;
    const engines=json && typeof json==="object" && "engines" in json ? json.engines : undefined;
    const nodeDeclared=!!(engines && typeof engines==="object" && "node" in engines);
    if(!nextProject && !nodeDeclared)continue;
    // A Next package can also own a native custom server. These profiles have
    // distinct resolvers; Node never inherits the Next bundler's TS paths.
    for(const next of (nextProject&&nodeDeclared ? [true,false] : [nextProject])) for(const mode of [...new Set(modes)].filter(m=>next || !nextProject || m!=="browser")) {
      const p=nodeProfile(snapshot,discovery,project,mode,next);
      seedFrameworkCallbacks(snapshot);
      const selected=inputs.filter(i=>discovery.inventory.some(f=>f.path===i.candidate.path && f.owner===project.path));
      const owned=selected.filter(i=>discovery.sourceInputs.get(i.candidate.path)?.validUtf8!==false && i.sourceFile.getDescendants().length<=100000 && !p.sourceReason(i.candidate.path));
      const resolve=(from:string,name:string)=>{const result=p.resolve(from,name);return result.state==="resolved" ? result.target : undefined;};
      const b=frameworkBindings(snapshot,selected,p.variant,resolve,()=>discovery.boundary.check(),"fs-04/1");
      for(const i of selected.filter(i=>!owned.includes(i))) { const first=i.sourceFile.getStatements()[0];if(first)b.gap(first,discovery.sourceInputs.get(i.candidate.path)?.validUtf8===false ? "unsupported-encoding" : p.sourceReason(i.candidate.path)??"resource-limit"); }
      for(const {candidate,sourceFile} of owned)for(const n of sourceFile.getDescendants()) {
        discovery.boundary.check();let specifier:string|undefined,kind:"import"|"require"="import";
        if(Node.isImportDeclaration(n) && !n.isTypeOnly() && (!n.getNamedImports().length || n.getDefaultImport() || n.getNamespaceImport() || n.getNamedImports().some(e=>!e.isTypeOnly())))specifier=n.getModuleSpecifierValue();
        if(Node.isExportDeclaration(n) && !n.isTypeOnly() && (!n.getNamedExports().length || n.getNamedExports().some(e=>!e.isTypeOnly())))specifier=n.getModuleSpecifierValue();
        if(Node.isCallExpression(n)) {
          const expr=n.getExpression();
          const nativeRequire=Node.isIdentifier(expr) && expr.getText()==="require" && !(expr.getSymbol()?.getDeclarations().length);
          if(expr.getKind()===SyntaxKind.ImportKeyword || nativeRequire){kind=nativeRequire ? "require" : "import";const arg=n.getArguments()[0];if(arg && Node.isStringLiteral(arg) && n.getArguments().length===1)specifier=arg.getLiteralText();else b.gap(n);}
        }
        if(specifier){const result=p.resolve(candidate.path,specifier,kind);if(result.state==="resolved")b.bind("module-dependency",n,result.target,`node/${kind}/${p.format(candidate.path)}`);else b.gap(n,result.reason);}
        if(!p.qualified || next)continue;
        if(Node.isCallExpression(n)) {
          const api=b.api(n.getExpression());
          if(api && ["node:http","http","node:https","https"].includes(api.module) && api.name==="createServer") {
            const args=n.getArguments(),handler=args.length===1 ? b.target(args[0]) : undefined;
            if(handler?.callable)b.bind("event-handler",n,handler,"node/http-handler-registration");else b.gap(n,"unsupported-syntax");
          }
          if(Node.isPropertyAccessExpression(n.getExpression())) {
            const e=n.getExpression();if(Node.isPropertyAccessExpression(e) && ["listen","on","once"].includes(e.getName())) {
              const receiver=e.getExpression(),defs=Node.isIdentifier(receiver) ? receiver.getSymbol()?.getDeclarations() : undefined;
              const variable=defs?.length===1 && Node.isVariableDeclaration(defs[0]) && defs[0].getVariableStatement()?.getDeclarationKind()==="const" ? defs[0] : undefined;
              const initializer=variable?.getInitializer();
              // Calls/registrations on arbitrary similarly named receivers are never attributed to Node.
              const creator=initializer && (Node.isCallExpression(initializer)||Node.isNewExpression(initializer)) ? b.api(initializer.getExpression()) : undefined;
              if(creator && e.getName()==="listen" && creator.name==="createServer" && ["node:http","http","node:https","https"].includes(creator.module)) {
                const stable=b.identifier(receiver),arg=n.getArguments()[0];
                if(stable && arg && Node.isNumericLiteral(arg) && n.getArguments().length===1)b.bind("operation",n,stable,"node/listen-literal-port/"+arg.getText());else b.gap(n);
              } else if(creator && creator.name==="EventEmitter" && ["node:events","events"].includes(creator.module)) {
                const args=n.getArguments(),handler=args[1] ? b.target(args[1]) : undefined;
                if(b.identifier(receiver) && args.length===2 && Node.isStringLiteral(args[0]) && handler?.callable)b.bind("event-handler",n,handler,"node/event/"+args[0].getLiteralText());else b.gap(n);
              }
            }
          }
        }
        if(Node.isNewExpression(n)) {
          const api=b.api(n.getExpression());
          if(api?.name==="Worker" && ["node:worker_threads","worker_threads"].includes(api.module)) {
            const arg=n.getArguments()[0];
            const urlArg=arg && Node.isNewExpression(arg) ? arg.getArguments()[0] : undefined;
            if(arg && Node.isNewExpression(arg) && arg.getExpression().getText()==="URL" && !arg.getExpression().getSymbol()?.getDeclarations().length && arg.getArguments()[1]?.getText()==="import.meta.url" && urlArg && Node.isStringLiteral(urlArg) && n.getArguments().length===1){const result=p.resolve(candidate.path,urlArg.getLiteralText());if(result.state==="resolved")b.bind("worker",n,result.target,"node/worker-url");else b.gap(n,result.reason);}else b.gap(n);
          }
        }
      }
      if(p.pkg?.config.value.kind==="object" && p.qualified && !next) {
        const value=p.pkg.config.value, bin=value.properties.bin, scripts=value.properties.scripts;
        const entries=bin?.kind==="literal" && typeof bin.value==="string" ? [bin.value] : bin?.kind==="object" ? Object.values(bin.properties).flatMap(v=>v.kind==="literal" && typeof v.value==="string" ? [v.value] : []) : [];
        if(scripts?.kind==="object")for(const v of Object.values(scripts.properties))if(v.kind==="literal" && typeof v.value==="string"){const match=/^node ([\w./-]+\.(?:[cm]?[jt]s))$/.exec(v.value);if(match)entries.push(match[1]);}
        // The existing source-backed target proves an entry declaration, never shell execution.
        for(const entry of entries.slice(0,100)){const target=path.posix.normalize(path.posix.join(project.path,entry));const input=owned.find(i=>i.candidate.path===target),first=input?.sourceFile.getStatements()[0];if(first)b.bind("entry-point",first,target,"node/package-entry",target,p.variant.configWitnesses);}
      }
      if(next)extractNextBindings(snapshot,selection,owned,p,b);
      else if(p.qualified)extractCommonJs(owned,p,b,()=>discovery.boundary.check());
      if(!next) {
        const calls=new Map(snapshot.behavior.relations.filter(r=>r.relation==="calls").map(r=>[JSON.stringify([r.site.file,r.site.start]),r]));
        for(const input of selected)for(const call of input.sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)){discovery.boundary.check();const old=calls.get(JSON.stringify([input.candidate.path,call.getStart()]));if(old && (p.sourceReason(input.candidate.path)||Node.isIdentifier(call.getExpression())&&b.identifier(call.getExpression())?.id!==old.target))b.gap(call,"custom-resolver");}
      }
      const assessment=snapshot.analysis.capabilities.find(c=>c.variantId===p.variant.id&&c.extractorVersion==="fs-04/1");
      if(assessment)assessment.gapIds=snapshot.analysis.gaps.filter(g=>g.variantId===p.variant.id).map(g=>g.id);
    }
  }
  return validateSnapshot(snapshot);
}
