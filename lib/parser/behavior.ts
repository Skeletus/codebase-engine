import { Node, SyntaxKind, type SourceFile, type Identifier } from "ts-morph";
import type { Resolver } from "./resolve.ts";
import type { Route } from "./types.ts";
import type { Behavior, Declaration, Site } from "../model/behavior.ts";

type Input = { candidate: { path: string; hash: string }; sourceFile: SourceFile; framework: string };
// The compiler binds lexical names only. Repository imports are resolved by the
// existing protected resolver, never by compiler filesystem/type discovery.
export function extractBehavior(inputs: Input[], resolver: Resolver, routes: Route[]): Behavior {
  const result: Behavior = { declarations: [], relations: [], gaps: [], handlers: [] };
  const bySource = new Map(inputs.map((i) => [i.sourceFile.getFilePath(), i]));
  const byPath = new Map(inputs.map((i) => [i.candidate.path, i.sourceFile]));
  const entities = new Map<string, Declaration>();
  const descendants = inputs.map((i) => ({ ...i, nodes: i.sourceFile.getDescendants() }));
  if (descendants.reduce((total, i) => total + i.nodes.length, 0) > 1000000) throw new Error("Static symbol analysis exceeds supported syntax budget");
  const nodeKey = (n: Node) => `${n.getSourceFile().getFilePath()}:${n.getStart()}:${n.getKind()}`;
  function site(n: Node): Site {
    const input = bySource.get(n.getSourceFile().getFilePath())!;
    return { file: input.candidate.path, start: n.getStart(), end: n.getEnd(), line: n.getStartLineNumber(), endLine: n.getEndLineNumber(), fileHash: input.candidate.hash, extractor: "typescript-javascript/static-symbols-v1", evidenceKind: "verified" };
  }
  function add(n: Node, name: string, kind: Declaration["kind"], callable: boolean, body?: Node) {
    const location = site(n), id = JSON.stringify([location.file, location.start, kind]);
    const entity = { id, name, kind, callable, site: location };
    entities.set(nodeKey(n), entity);
    if (body) entities.set(nodeKey(body), entity);
    result.declarations.push(entity);
  }
  for (const { nodes } of descendants) {
    for (const n of nodes) {
      if (Node.isFunctionDeclaration(n)) add(n, n.getName() ?? "default", "function", !!n.getBody());
      else if (Node.isClassDeclaration(n)) add(n, n.getName() ?? "default class", "class", false);
      else if (Node.isMethodDeclaration(n) && Node.isIdentifier(n.getNameNode())) {
        const parent = n.getParent();
        const siblings = parent.getDescendantsOfKind(SyntaxKind.MethodDeclaration).filter((m) => m.getParent() === parent && m.getName() === n.getName());
        add(n, n.getName(), "method", !!n.getBody() && siblings.length === 1);
      }
      else if (Node.isVariableDeclaration(n) && Node.isIdentifier(n.getNameNode())) {
        const init = n.getInitializer();
        const callable = n.getVariableStatement()?.getDeclarationKind() === "const" && !!init && (Node.isArrowFunction(init) || Node.isFunctionExpression(init));
        add(n, n.getName(), "value", callable, callable ? init : undefined);
      } else if (Node.isParameterDeclaration(n) && Node.isIdentifier(n.getNameNode())) add(n, n.getName(), "parameter", false);
    }
  }
  const lookup = (n: Node) => entities.get(nodeKey(n));
  function module(from: SourceFile, specifier: string, kind: "import" | "re-export") {
    const outcome = resolver.resolve(from.getFilePath(), specifier, kind);
    return outcome.status === "internal" ? byPath.get(outcome.target) : undefined;
  }
  function local(from: SourceFile, name: string, seen: Set<string>): Declaration | undefined {
    const candidates: Node[] = [];
    for (const s of from.getStatements()) {
      if ((Node.isFunctionDeclaration(s) || Node.isClassDeclaration(s)) && s.getName() === name) candidates.push(s);
      if (Node.isVariableStatement(s)) candidates.push(...s.getDeclarations().filter((d) => d.getName() === name));
      if (Node.isImportDeclaration(s)) {
        if (s.getDefaultImport()?.getText() === name || s.getNamedImports().some((i) => (i.getAliasNode()?.getText() ?? i.getName()) === name)) candidates.push(s);
      }
    }
    if (candidates.length !== 1) return;
    const only = candidates[0];
    if (Node.isImportDeclaration(only)) {
      if (only.isTypeOnly()) return;
      const target = module(from, only.getModuleSpecifierValue(), "import");
      const spec = only.getNamedImports().find((i) => (i.getAliasNode()?.getText() ?? i.getName()) === name);
      if (!target || spec?.isTypeOnly()) return;
      return exported(target, spec?.getName() ?? "default", seen);
    }
    return lookup(only);
  }
  function exported(from: SourceFile, name: string, seen = new Set<string>()): Declaration | undefined {
    const key = `${from.getFilePath()}:${name}`;
    if (seen.has(key) || seen.size >= 64) return;
    const next = new Set(seen).add(key), candidates: Declaration[] = [];
    let uncertain = false;
    for (const s of from.getStatements()) {
      if ((Node.isFunctionDeclaration(s) || Node.isClassDeclaration(s)) && s.isExported() && (s.isDefaultExport() ? name === "default" : s.getName() === name)) {
        const d = lookup(s); if (d) candidates.push(d);
      } else if (Node.isVariableStatement(s) && s.isExported()) {
        for (const v of s.getDeclarations().filter((v) => v.getName() === name)) { const d = lookup(v); if (d) candidates.push(d); }
      } else if (Node.isExportAssignment(s) && !s.isExportEquals() && name === "default") {
        const expr = s.getExpression();
        const d = Node.isIdentifier(expr) ? local(from, expr.getText(), next) : undefined;
        if (d) candidates.push(d); else uncertain = true;
      } else if (Node.isExportDeclaration(s) && !s.isTypeOnly()) {
        const target = s.getModuleSpecifierValue() ? module(from, s.getModuleSpecifierValue()!, "re-export") : from;
        const named = s.getNamedExports().filter((e) => (e.getAliasNode()?.getText() ?? e.getName()) === name && !e.isTypeOnly());
        for (const spec of named) {
          const d = target === from ? local(from, spec.getName(), next) : target ? exported(target, spec.getName(), next) : undefined;
          if (d) candidates.push(d); else uncertain = true;
        }
        // Star chains can hide conflicts. This subset requires explicit named
        // exports; it never picks one candidate from an incompletely resolved star.
        if (!s.getNamedExports().length && !s.getNamespaceExport() && name !== "default") {
          uncertain = true;
        }
      }
    }
    return !uncertain && candidates.length === 1 ? candidates[0] : undefined;
  }
  function identifier(n: Identifier): Declaration | undefined {
    const defs = n.getSymbol()?.getDeclarations() ?? [];
    if (defs.length !== 1) return;
    const d = defs[0], imported = Node.isImportSpecifier(d) || d.getFirstAncestorByKind(SyntaxKind.ImportDeclaration);
    if (imported) return local(n.getSourceFile(), n.getText(), new Set());
    // One virtual compiler project covers several repository packages/scripts.
    // Its implicit global namespace cannot prove cross-file runtime visibility.
    if (d.getSourceFile() !== n.getSourceFile()) return;
    return lookup(d);
  }
  function owner(n: Node): string | null {
    for (const a of n.getAncestors()) {
      // Class initializers/accessors/decorators do not execute as part of an
      // enclosing function or decorated method body. Do not infer that caller.
      if (Node.isClassDeclaration(a) || Node.isClassExpression(a) || Node.isGetAccessorDeclaration(a) || Node.isSetAccessorDeclaration(a)) return null;
      if (Node.isFunctionDeclaration(a) || Node.isArrowFunction(a) || Node.isFunctionExpression(a) || Node.isMethodDeclaration(a) || Node.isConstructorDeclaration(a)) {
        const body = a.getBody();
        if (!body || n.getStart() < body.getStart() || n.getEnd() > body.getEnd()) return null;
        const d = lookup(a); return d?.callable ? d.id : null;
      }
    }
    return null;
  }
  function conditional(n: Node): boolean {
    for (const a of n.getAncestors()) {
      if (lookup(a)?.callable) break;
      if (Node.isIfStatement(a) || Node.isConditionalExpression(a) || Node.isSwitchStatement(a) || Node.isForStatement(a) || Node.isForOfStatement(a) || Node.isForInStatement(a) || Node.isWhileStatement(a) || Node.isDoStatement(a)) return true;
      if (Node.isBinaryExpression(a) && ["&&", "||", "??"].includes(a.getOperatorToken().getText())) return true;
    }
    return false;
  }
  const mutable = new Set<string>();
  for (const { sourceFile } of inputs) for (const n of sourceFile.getDescendantsOfKind(SyntaxKind.Identifier)) {
    const parent = n.getParent();
    const assignment = n.getAncestors().find((a) => Node.isBinaryExpression(a) && /^(?:=|\+=|-=|\*=|\*\*=|\/=|%=|&=|\|=|\^=|<<=|>>=|>>>=|&&=|\|\|=|\?\?=)$/.test(a.getOperatorToken().getText()));
    if ((assignment && Node.isBinaryExpression(assignment) && n.getStart() >= assignment.getLeft().getStart() && n.getEnd() <= assignment.getLeft().getEnd()) || Node.isPrefixUnaryExpression(parent) || Node.isPostfixUnaryExpression(parent)) {
      const d = identifier(n); if (d) mutable.add(d.id);
    }
  }
  for (const { sourceFile } of inputs) {
    for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const expr = call.getExpression(), d = Node.isIdentifier(expr) ? identifier(expr) : undefined;
      const source = owner(call), location = site(call);
      if (d?.callable && !mutable.has(d.id) && !call.hasQuestionDotToken()) {
        result.relations.push({ id: JSON.stringify([location.file, location.start, "calls"]), source, target: d.id, relation: "calls", conditional: conditional(call), site: location });
        if (source === null) result.gaps.push({ source: null, site: location, reason: "callee is resolved, but this site has no supported callable-body ownership (module/class initialization, accessor, decorator, default parameter or callback); never attributed to an enclosing handler" });
      } else result.gaps.push({ source, site: location, reason: Node.isPropertyAccessExpression(expr) || Node.isElementAccessExpression(expr) ? "receiver/member dispatch is not established (DI, overriding or runtime values may select the target)" : mutable.has(d?.id ?? "") ? "binding is reassigned; runtime target is not established" : "no unique supported callable binding (external, skipped, duplicate, implicit cross-file global, computed, callback or non-callable target)" });
    }
    for (const n of sourceFile.getDescendantsOfKind(SyntaxKind.Identifier)) {
      const d = identifier(n);
      // Declaration names are not references; direct callees already have calls evidence.
      const parent = n.getParent();
      const declarationName = (Node.isFunctionDeclaration(parent) || Node.isClassDeclaration(parent) || Node.isVariableDeclaration(parent) || Node.isParameterDeclaration(parent) || Node.isMethodDeclaration(parent)) && parent.getNameNode() === n;
      const importBinding = Node.isImportSpecifier(parent) || Node.isImportClause(parent) || Node.isNamespaceImport(parent);
      const receiverMember = Node.isPropertyAccessExpression(parent) && parent.getNameNode() === n;
      if (!d || declarationName || importBinding || receiverMember || (Node.isCallExpression(parent) && parent.getExpression() === n)) continue;
      const location = site(n);
      result.relations.push({ id: JSON.stringify([location.file, location.start, "references"]), source: owner(n), target: d.id, relation: "references", conditional: conditional(n), site: location });
    }
  }
  routes.forEach((route, index) => {
    const source = byPath.get(route.file)!;
    // Existing extractors decide whether a route exists. Binding never creates routes.
    let target: Declaration | undefined;
    let bindingNode: Node | undefined;
    const framework = bySource.get(source.getFilePath())!.framework;
    if (framework === "Next.js") {
      target = exported(source, route.method);
      for (const statement of source.getStatements()) {
        if (Node.isFunctionDeclaration(statement) && statement.isExported() && !statement.isDefaultExport() && statement.getName() === route.method) bindingNode ??= statement;
        if (Node.isVariableStatement(statement) && statement.isExported()) bindingNode ??= statement.getDeclarations().find((d) => d.getName() === route.method);
        if (Node.isExportDeclaration(statement)) bindingNode ??= statement.getNamedExports().find((e) => (e.getAliasNode()?.getText() ?? e.getName()) === route.method);
      }
    }
    else if (framework === "NestJS") {
      const matches = source.getDescendantsOfKind(SyntaxKind.MethodDeclaration).flatMap((method) => method.getDecorators().filter((d) => {
        if (d.getStartLineNumber() !== route.line) return false;
        const expression = d.getCallExpression()?.getExpression();
        if (!expression || !Node.isIdentifier(expression)) return false;
        const definitions = expression.getSymbol()?.getDeclarations() ?? [];
        if (definitions.length !== 1 || !Node.isImportSpecifier(definitions[0])) return false;
        const specifier = definitions[0], declaration = specifier.getFirstAncestorByKind(SyntaxKind.ImportDeclaration);
        return !specifier.isTypeOnly() && !declaration?.isTypeOnly() && declaration?.getModuleSpecifierValue() === "@nestjs/common" && specifier.getName().toUpperCase() === route.method;
      }).map((decorator) => ({ method, decorator })));
      if (matches.length === 1) { target = lookup(matches[0].method); bindingNode = matches[0].decorator; }
    }
    result.handlers.push({ route: index, target: target?.callable && !mutable.has(target.id) ? target.id : null, reason: target?.callable && !mutable.has(target.id) ? null : "route declaration has no unique supported handler binding", site: { ...site(bindingNode ?? source.getDescendants().find((n) => n.getStartLineNumber() === route.line) ?? source), extractor: "typescript-javascript/route-binding-v1" } });
  });
  if (result.declarations.length + result.relations.length + result.gaps.length > 200000) throw new Error("Static symbol analysis exceeds supported evidence budget");
  return result;
}
