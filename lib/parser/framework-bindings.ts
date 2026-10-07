import { Node, SyntaxKind, SymbolFlags, type SourceFile } from "ts-morph";
import type { Declaration, Site } from "../model/behavior.ts";
import type { CodeSnapshot } from "../engine/types.ts";
import type { FrameworkBinding, GapReason, Variant, Witness } from "../model/framework.ts";
import { factId } from "../model/framework.ts";
import { normalizeRange } from "../model/positions.ts";
import { frameworkFact } from "./framework-budget.ts";

export type FrameworkSource = { candidate: { path: string; hash: string }; sourceFile: SourceFile; framework: string };
/** Lexical binding only; compiler filesystem resolution is never used. */
export function frameworkBindings(snapshot: CodeSnapshot, inputs: FrameworkSource[], variant: Variant, resolve: (from: string, specifier: string) => string | undefined, checkpoint:()=>void = ()=>{}, version="fs-03/1") {
  const bySource = new Map(inputs.map(i => [i.sourceFile, i.candidate]));
  const byPath = new Map(inputs.map(i => [i.candidate.path, i.sourceFile]));
  const bySite = new Map<string,Declaration[]>();
  for(const d of snapshot.behavior.declarations){const key=JSON.stringify([d.site.file,d.site.start]);bySite.set(key,[...(bySite.get(key)??[]),d]);}
  const stability = new Map<Node, boolean>();
  const mutatedDeclarations=new Set<Node>();
  for (const input of inputs) for (const ref of input.sourceFile.getDescendantsOfKind(SyntaxKind.Identifier)) {
    checkpoint();
    const p=ref.getParent();
    const assignment=ref.getAncestors().find(a=>Node.isBinaryExpression(a) && /^(?:=|.*=)$/.test(a.getOperatorToken().getText()) && !["==","===","!=","!==","<=",">="].includes(a.getOperatorToken().getText()));
    if (assignment && Node.isBinaryExpression(assignment) && ref.getStart() >= assignment.getLeft().getStart() && ref.getEnd() <= assignment.getLeft().getEnd() || Node.isPostfixUnaryExpression(p) || Node.isPrefixUnaryExpression(p) && [SyntaxKind.PlusPlusToken,SyntaxKind.MinusMinusToken].includes(p.getOperatorToken())) for (const d of ref.getSymbol()?.getDeclarations() ?? []) mutatedDeclarations.add(d);
  }
  const exportProofs = new Map<string, Set<SourceFile>>();
  const wholeSites = new Map<SourceFile, Site>();
  function whole(source: SourceFile): Site {
    const cached=wholeSites.get(source);if (cached) return cached;
    const input=bySource.get(source)!, text=source.getFullText(), end=text.length-(/\r\n$/.test(text)?2:/[\r\n]$/.test(text)?1:0);
    const location={file:input.path,...normalizeRange(text,0,end,"utf16"),fileHash:input.hash,extractor:version==="fs-03/1" ? "vite-react/binding-context/fs-03-1" : "node-next/binding-context/fs-04-1",evidenceKind:"verified" as const};
    wholeSites.set(source,location);return location;
  }
  function stable(node: Node): boolean {
    if (stability.has(node)) return stability.get(node)!;
    if (Node.isClassDeclaration(node) && node.getDecorators().length) return false;
    if (Node.isVariableDeclaration(node) && node.getVariableStatement()?.getDeclarationKind() !== "const") return false;
    const name = Node.isFunctionDeclaration(node) || Node.isClassDeclaration(node) || Node.isVariableDeclaration(node) ? node.getNameNode() : undefined;
    if (!name || !Node.isIdentifier(name)) return false;
    const mutated = mutatedDeclarations.has(node);
    stability.set(node, !mutated); return !mutated;
  }
  const declaration = (node: Node) => {
    if (!Node.isFunctionDeclaration(node) && !Node.isClassDeclaration(node) && !Node.isVariableDeclaration(node) && !Node.isMethodDeclaration(node) && !Node.isParameterDeclaration(node) && !Node.isArrowFunction(node) && !Node.isFunctionExpression(node)) return;
    const kind=Node.isClassDeclaration(node) ? "class" : Node.isMethodDeclaration(node) ? "method" : Node.isVariableDeclaration(node) ? "value" : Node.isParameterDeclaration(node) ? "parameter" : "function";
    return bySite.get(JSON.stringify([bySource.get(node.getSourceFile())?.path, node.getStart()]))?.find(d=>d.kind===kind);
  };
  const site = (node: Node): Site => Node.isSourceFile(node) ? whole(node) : ({ file: bySource.get(node.getSourceFile())!.path, start:node.getStart(),end:node.getEnd(),line:node.getStartLineNumber(),endLine:node.getEndLineNumber(), fileHash: bySource.get(node.getSourceFile())!.hash, extractor: version==="fs-03/1" ? "vite-react/fs-03-1" : "node-next/fs-04-1", evidenceKind: "verified" });
  const witness = (location: Site, role: "reference" | "declaration" | "registration" = "reference"): Witness => ({ site: location, role, variantId: variant.id, extractorVersion: version });
  const owner = (node: Node): string => {
    for (const parent of node.getAncestors()) {
      const d = declaration(parent); if (d) return d.id;
    }
    return bySource.get(node.getSourceFile())!.path;
  };
  function exported(source: SourceFile, name: string, active: Set<string>): Declaration | undefined {
    checkpoint();
    const key = source.getFilePath() + ":" + name;
    if (active.has(key) || active.size >= 64) return;
    const next = new Set(active).add(key), candidates: Declaration[] = [];
    let unknown = false;
    for (const s of source.getStatements()) {
      if ((Node.isFunctionDeclaration(s) || Node.isClassDeclaration(s)) && s.isExported() && (s.isDefaultExport() ? name === "default" : s.getName() === name)) { const d = declaration(s); if (d && stable(s)) candidates.push(d); else unknown = true; }
      if (Node.isVariableStatement(s) && s.isExported()) for (const v of s.getDeclarations()) if (v.getName() === name) { const d = declaration(v); if (d && stable(v)) candidates.push(d); else unknown = true; }
      if (Node.isExportAssignment(s) && name === "default") { const d = identifier(s.getExpression(), next); if (d) candidates.push(d); else unknown = true; }
      if (Node.isExportDeclaration(s) && !s.isTypeOnly()) {
        const target = s.getModuleSpecifierValue() ? byPath.get(resolve(bySource.get(source)!.path, s.getModuleSpecifierValue()!) ?? "") : source;
        if (!s.getNamedExports().length) unknown = true;
        for (const spec of s.getNamedExports()) if (!spec.isTypeOnly() && (spec.getAliasNode()?.getText() ?? spec.getName()) === name) {
          const d = target === source ? local(source, spec.getName()) : target ? exported(target, spec.getName(), next) : undefined;
          if (d) candidates.push(d); else unknown = true;
        }
      }
    }
    if (unknown || candidates.length !== 1) return;
    const result=candidates[0], proof=exportProofs.get(result.id) ?? new Set<SourceFile>();
    proof.add(source);exportProofs.set(result.id,proof);return result;
  }
  function local(source: SourceFile, name: string): Declaration | undefined {
    const declarations = source.getStatements().flatMap<Node>(s => Node.isVariableStatement(s) ? s.getDeclarations().filter(d => d.getName() === name) : (Node.isFunctionDeclaration(s) || Node.isClassDeclaration(s)) && s.getName() === name ? [s] : []);
    if (declarations.length !== 1) return;
    return stable(declarations[0]) ? declaration(declarations[0]) : undefined;
  }
  function identifier(node: Node, active = new Set<string>()): Declaration | undefined {
    if(Node.isPropertyAccessExpression(node)&&Node.isIdentifier(node.getExpression())) {
      const receiver=node.getExpression(),defs=receiver.getSymbol()?.getDeclarations()??[];
      if(defs.length!==1||!Node.isNamespaceImport(defs[0])||mutatedDeclarations.has(defs[0]))return;
      const imported=defs[0].getFirstAncestorByKind(SyntaxKind.ImportDeclaration);if(!imported||imported.isTypeOnly())return;
      const path=resolve(bySource.get(node.getSourceFile())!.path,imported.getModuleSpecifierValue()),source=path ? byPath.get(path) : undefined;
      return source ? exported(source,node.getName(),active) : undefined;
    }
    if (!Node.isIdentifier(node)) return;
    const definitions = node.getSymbol()?.getDeclarations() ?? [];
    if (definitions.length !== 1) return;
    const def = definitions[0], imported = def.getFirstAncestorByKind(SyntaxKind.ImportDeclaration);
    if (imported) {
      if (imported.isTypeOnly() || mutatedDeclarations.has(def) || Node.isImportSpecifier(def) && def.isTypeOnly()) return;
      const path = resolve(bySource.get(node.getSourceFile())!.path, imported.getModuleSpecifierValue()), target = path ? byPath.get(path) : undefined;
      return target ? exported(target, Node.isImportSpecifier(def) ? def.getName() : "default", active) : undefined;
    }
    if (def.getSourceFile() !== node.getSourceFile()) return;
    const d = declaration(def);
    if (!d) return;
    // Mutable lexical bindings are never stable callback/component targets.
    return stable(def) ? d : undefined;
  }
  function api(node: Node): { module: string; name: string } | undefined {
    const identifier = Node.isPropertyAccessExpression(node) ? node.getExpression() : node;
    if (!Node.isIdentifier(identifier)) return;
    const defs = identifier.getSymbol()?.getDeclarations() ?? [];
    if (defs.length !== 1) return;
    const def = defs[0], imported = def.getFirstAncestorByKind(SyntaxKind.ImportDeclaration);
    if (!imported || imported.isTypeOnly() || mutatedDeclarations.has(def)) return;
    if (version === "fs-04/1" && Node.isImportClause(def) && !Node.isPropertyAccessExpression(node)) return { module: imported.getModuleSpecifierValue(), name: "default" };
    if (Node.isImportSpecifier(def) && !def.isTypeOnly() && !Node.isPropertyAccessExpression(node)) return { module: imported.getModuleSpecifierValue(), name: def.getName() };
    if ((Node.isNamespaceImport(def) || Node.isImportClause(def) && imported.getModuleSpecifierValue() === "react") && Node.isPropertyAccessExpression(node)) return { module: imported.getModuleSpecifierValue(), name: node.getName() };
  }
  function bind(kind: FrameworkBinding["kind"], node: Node, target: Declaration | string, rule: string, sourceId=owner(node),extra:readonly Witness[]=[]) {
    checkpoint();
    const occurrence = site(node), targetId = typeof target === "string" ? target : target.id;
    const id = factId("binding:" + kind, occurrence, variant.id, targetId);
    if (snapshot.analysis.bindings.some(b => b.id === id)) return;
    const context=[witness(whole(node.getSourceFile())),...([...exportProofs.get(targetId) ?? []].map(source=>witness(whole(source)))),...extra];
    if (context.length + variant.configWitnesses.length + 3 > 200) {gap(node,"resource-limit");return;}
    frameworkFact(snapshot,occurrence.file);
    snapshot.analysis.bindings.push({ id, kind, sourceId, targetId, occurrence, variantId: variant.id, witnesses: [witness(occurrence), ...(typeof target === "string" ? [] : [witness(target.site, "declaration")]), ...context,...variant.configWitnesses, { role: "framework-rule", tupleId: snapshot.analysis.capabilities.find(c=>c.variantId===variant.id&&c.extractorVersion===version)?.tupleId??"unqualified", ruleId: rule, extractor: version==="fs-03/1" ? "vite-react" : "node-next", extractorVersion: version, variantId: variant.id }] });
  }
  function gap(node: Node, reason: GapReason = "dynamic-expression") {
    const occurrence = site(node), id = factId("gap", occurrence, variant.id, reason);
    if (!snapshot.analysis.gaps.some(g => g.id === id)) {frameworkFact(snapshot,occurrence.file);snapshot.analysis.gaps.push({ id, reason, occurrence, variantId: variant.id, capabilityId: null });}
  }
  function implicitReact(node:Node) {
    const symbols=node.getSymbolsInScope(SymbolFlags.Value|SymbolFlags.Alias).filter(s=>s.getName()==="React"),definitions=symbols.length===1 ? symbols[0].getDeclarations() : [];
    const def=definitions.length===1 ? definitions[0] : undefined,imported=def?.getFirstAncestorByKind(SyntaxKind.ImportDeclaration);
    return !!def && !mutatedDeclarations.has(def) && imported?.getModuleSpecifierValue()==="react" && !imported.isTypeOnly() && (Node.isImportClause(def) || Node.isNamespaceImport(def) || Node.isImportSpecifier(def) && !def.isTypeOnly() && def.getName()==="default");
  }
  const target = (node: Node) => Node.isArrowFunction(node) || Node.isFunctionExpression(node) ? declaration(node) : identifier(node);
  return { declaration, identifier, target, implicitReact, local, exported: (source: SourceFile, name: string) => exported(source, name, new Set()), api, bind, gap, site, witness, owner, byPath };
}
