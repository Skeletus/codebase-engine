import { createHash } from "node:crypto";
import { decodeSource, normalizeRange } from "../../model/positions.ts";
import type { Behavior, Declaration, Site } from "../../model/behavior.ts";

type SyntaxNode = {type: string; range: [number, number]; [key: string]: unknown};
export type FlowParser = {parse: (text: string, options: unknown) => unknown; FlowVisitorKeys: Record<string, readonly string[]>};
export type FlowSyntax = {
  behavior: Behavior;
  imports: {module: string; name: string; alias: string; typeOnly: boolean; site: Site}[];
  exports: {name: string; id: string}[];
  importedCalls: {module: string; name: string; bindingStart: number; source: string | null; site: Site}[];
  visited: number;
};
type Binding = {declaration?: Declaration; imported?: FlowSyntax["imports"][number]; alias?: string; initialized: number; mutable: boolean};
type Scope = {parent: Scope | null; owner: string | null; bindings: Map<string, Binding[]>; uncertain: Set<string>};
const node = (value: unknown): value is SyntaxNode => !!value && typeof value === "object" && "type" in value && typeof value.type === "string" && "range" in value && Array.isArray(value.range) && value.range.length === 2;
const name = (value: unknown): string | undefined => node(value) && value.type === "Identifier" && typeof value.name === "string" ? value.name : undefined;
const functionTypes = new Set(["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression", "ComponentDeclaration", "HookDeclaration"]);
const typeKeys = new Set(["typeAnnotation", "returnType", "typeParameters", "typeArguments", "rendersType", "superTypeParameters", "implements"]);

/** Worker-owned lexical extraction. No AST or executable module escapes this
 * function. Production wiring must call it inside the supervised parser only.
 * Type-based/member dispatch is deliberately not inferred.
 */
export function extractFlow(parser: FlowParser, file: string, bytes: Uint8Array): FlowSyntax {
  if (bytes.length > 1048576) throw new Error("resource-limit");
  let text: string; try { text = decodeSource(bytes); } catch { throw new Error("unsupported-encoding"); }
  const started = performance.now(), deadline = started + 2000;
  const checkpoint = () => { if (performance.now() >= deadline) throw new Error("resource-limit"); };
  const ast: unknown = parser.parse(text, {flow: "all", babel: false, sourceType: "module", enableExperimentalComponentSyntax: true});
  if (!node(ast)) throw new Error("parse-error");
  const behavior: Behavior = {declarations: [], relations: [], gaps: [], handlers: []};
  const result: FlowSyntax = {behavior, imports: [], exports: [], importedCalls: [], visited: 0};
  const children = (n: SyntaxNode, runtime = false) => (parser.FlowVisitorKeys[n.type] ?? []).filter(k => !runtime || !typeKeys.has(k)).flatMap(key => node(n[key]) ? [n[key] as SyntaxNode] : Array.isArray(n[key]) ? (n[key] as unknown[]).filter(node) : []);
  const inventory = [ast];
  while (inventory.length) { checkpoint(); const n = inventory.pop()!; if (++result.visited > 100000) throw new Error("resource-limit"); inventory.push(...children(n)); }
  const hash = createHash("sha256").update(bytes).digest("hex");
  let facts = 0;
  const count = () => { checkpoint(); if (++facts > 20000) throw new Error("resource-limit"); };
  const site = (n: SyntaxNode): Site => ({file, ...normalizeRange(text, n.range[0], n.range[1], "utf16"), fileHash: hash, extractor: "flow/syntax/fs-07/1", evidenceKind: "verified"});
  const root: Scope = {parent: null, owner: null, bindings: new Map(), uncertain: new Set()};
  const references: {n: SyntaxNode; occurrence: SyntaxNode; scope: Scope; call: boolean; conditional: boolean}[] = [];
  const writes: {n: SyntaxNode; scope: Scope}[] = [];
  const exported: {name: string; local: string; scope: Scope}[] = [];
  const gap = (n: SyntaxNode, scope: Scope, reason: string) => { count(); behavior.gaps.push({source: scope.owner, reason, site: site(n)}); };
  const bind = (scope: Scope, key: string, binding: Binding) => scope.bindings.set(key, [...scope.bindings.get(key) ?? [], binding]);
  function declare(n: SyntaxNode, key: string, kind: Declaration["kind"], callable: boolean, scope: Scope, mutable = false) {
    count(); const location = site(n);
    const d: Declaration = {id: JSON.stringify([file, location.start, kind]), name: key, kind, callable, site: location};
    behavior.declarations.push(d); bind(scope, key, {declaration: d, initialized: kind === "function" ? -1 : n.range[1], mutable}); return d;
  }
  function walk(n: SyntaxNode, scope: Scope, conditional = false): void {
    checkpoint();
    if (/^(?:TypeAlias|OpaqueType|Declare|Interface)/.test(n.type)) return;
    if (n.type === "ImportDeclaration") {
      const moduleSpecifier = node(n.source) && typeof n.source.value === "string" ? n.source.value : undefined;
      if (!moduleSpecifier || !Array.isArray(n.specifiers)) { gap(n, scope, "dynamic-import-boundary"); return; }
      for (const specifier of n.specifiers.filter(node)) {
        const alias = name(specifier.local);
        const imported = specifier.type === "ImportDefaultSpecifier" ? "default" : specifier.type === "ImportNamespaceSpecifier" ? "*" : name(specifier.imported);
        if (!alias || !imported) { gap(specifier, scope, "unsupported-import-binding"); continue; }
        count(); const entry = {module: moduleSpecifier, name: imported, alias, typeOnly: ["type", "typeof"].includes(String(n.importKind)) || ["type", "typeof"].includes(String(specifier.importKind)), site: site(specifier)};
        result.imports.push(entry); bind(scope, alias, {imported: entry, initialized: -1, mutable: false});
      }
      return;
    }
    if (functionTypes.has(n.type)) {
      const key = name(n.id) ?? "<callback>";
      const d = declare(n, key, "function", true, scope);
      const inner: Scope = {parent: scope, owner: d.id, bindings: new Map(), uncertain: new Set()};
      if (n.type === "FunctionExpression" && name(n.id)) bind(inner, key, {declaration: d, initialized: -1, mutable: false});
      for (const parameter of Array.isArray(n.params) ? n.params.filter(node) : []) {
        const local = parameter.type === "ComponentParameter" && node(parameter.local) ? parameter.local : parameter;
        const key = name(local);
        if (key) declare(local, key, "parameter", false, inner);
        else gap(parameter, inner, "destructured-parameter-boundary");
      }
      if (node(n.body)) walk(n.body, inner, conditional);
      return;
    }
    if (n.type === "BlockStatement") {
      const inner: Scope = {parent: scope, owner: scope.owner, bindings: new Map(), uncertain: new Set()};
      for (const child of children(n, true)) walk(child, inner, conditional); return;
    }
    if (n.type === "VariableDeclaration") {
      for (const variable of Array.isArray(n.declarations) ? n.declarations.filter(node) : []) {
        const key = name(variable.id), init = node(variable.init) ? variable.init : undefined;
        if (!key) { gap(variable, scope, "destructured-binding-boundary"); continue; }
        if (n.kind === "var") { scope.uncertain.add(key); gap(variable, scope, "var-hoisting-boundary"); continue; }
        const d = declare(variable, key, "value", !!init && functionTypes.has(init.type), scope, n.kind !== "const");
        const binding = scope.bindings.get(key)!.at(-1)!;
        if (init?.type === "Identifier" && n.kind === "const") binding.alias = name(init);
        if (init && functionTypes.has(init.type)) {
          const inner: Scope = {parent: scope, owner: d.id, bindings: new Map(), uncertain: new Set()};
          for (const p of Array.isArray(init.params) ? init.params.filter(node) : []) if (name(p)) declare(p, name(p)!, "parameter", false, inner); else gap(p, inner, "destructured-parameter-boundary");
          if (node(init.body)) walk(init.body, inner, conditional);
        } else if (init) walk(init, scope, conditional);
      }
      return;
    }
    if (n.type === "ExportNamedDeclaration" || n.type === "ExportDefaultDeclaration") {
      const declaration = node(n.declaration) ? n.declaration : undefined;
      if (declaration) {
        walk(declaration, scope, conditional);
        if (n.type === "ExportDefaultDeclaration" && name(declaration)) exported.push({name: "default", local: name(declaration)!, scope});
        else if (name(declaration.id)) exported.push({name: n.type === "ExportDefaultDeclaration" ? "default" : name(declaration.id)!, local: name(declaration.id)!, scope});
        else if (declaration.type === "VariableDeclaration") for (const v of Array.isArray(declaration.declarations) ? declaration.declarations.filter(node) : []) if (name(v.id)) exported.push({name: name(v.id)!, local: name(v.id)!, scope});
      }
      if (node(n.source)) { gap(n, scope, "reexport-resolution-boundary"); return; }
      for (const specifier of Array.isArray(n.specifiers) ? n.specifiers.filter(node) : []) if (name(specifier.local) && name(specifier.exported)) exported.push({name: name(specifier.exported)!, local: name(specifier.local)!, scope});
      return;
    }
    if (n.type === "AssignmentExpression" || n.type === "UpdateExpression") {
      const target = node(n.left) ? n.left : node(n.argument) ? n.argument : undefined;
      if (target) writes.push({n: target, scope});
      gap(n, scope, "mutation-boundary");
    }
    if (n.type === "ClassDeclaration" || n.type === "EnumDeclaration") {
      if (name(n.id)) declare(n, name(n.id)!, n.type === "ClassDeclaration" ? "class" : "value", false, scope);
      gap(n, scope, n.type === "ClassDeclaration" ? "class-dispatch-boundary" : "enum-runtime-boundary"); return;
    }
    if (n.type === "CallExpression") {
      if (node(n.callee) && name(n.callee) === "eval") { scope.uncertain.add("*"); gap(n, scope, "eval-scope-boundary"); }
      else if (node(n.callee) && name(n.callee)) references.push({n: n.callee, occurrence: n, scope, call: true, conditional});
      else gap(n, scope, "dynamic-dispatch-boundary");
      for (const argument of Array.isArray(n.arguments) ? n.arguments.filter(node) : []) walk(argument, scope, conditional);
      return;
    }
    if (n.type === "Identifier") { references.push({n, occurrence: n, scope, call: false, conditional}); return; }
    if (n.type === "MemberExpression" || n.type === "OptionalMemberExpression") { if (node(n.object)) walk(n.object, scope, conditional); if (n.computed && node(n.property)) walk(n.property, scope, conditional); return; }
    if (n.type.startsWith("JSX")) {
      // Tag/attribute names are framework syntax, while embedded expressions
      // still belong to the lexical scope and must retain direct-call evidence.
      if (["JSXIdentifier", "JSXNamespacedName", "JSXMemberExpression"].includes(n.type)) return;
      for (const child of children(n, true)) walk(child, scope, conditional); return;
    }
    for (const child of children(n, true)) walk(child, scope, conditional || ["IfStatement", "ConditionalExpression", "LogicalExpression", "SwitchStatement", "TryStatement"].includes(n.type));
  }
  walk(ast, root);
  function lookup(scope: Scope, key: string): {scope: Scope; binding: Binding} | undefined {
    for (let s: Scope | null = scope; s; s = s.parent) {
      if (s.uncertain.has(key) || s.uncertain.has("*")) return;
      const bindings = s.bindings.get(key); if (bindings) return bindings.length === 1 ? {scope: s, binding: bindings[0]} : undefined;
    }
  }
  for (const write of writes) if (name(write.n)) { const found = lookup(write.scope, name(write.n)!); if (found) found.scope.uncertain.add(name(write.n)!); }
  function resolve(scope: Scope, key: string, offset: number, active = new Set<Binding>()): Binding | undefined {
    checkpoint(); const found = lookup(scope, key); if (!found || found.binding.mutable || found.binding.initialized > offset || active.size >= 64 || active.has(found.binding)) return;
    if (found.binding.alias) return resolve(found.scope, found.binding.alias, found.binding.initialized, new Set(active).add(found.binding));
    return found.binding;
  }
  for (const ref of references) {
    const binding = resolve(ref.scope, name(ref.n)!, ref.n.range[0]);
    if (binding?.imported) {
      if (ref.call && !binding.imported.typeOnly) { count(); result.importedCalls.push({module: binding.imported.module, name: binding.imported.name, bindingStart: binding.imported.site.start, source: ref.scope.owner, site: site(ref.occurrence)}); }
      else if (ref.call) gap(ref.occurrence, ref.scope, "type-only-call-boundary");
    } else if (binding?.declaration && (!ref.call || binding.declaration.callable)) {
      count(); const location = site(ref.occurrence), relation = ref.call ? "calls" : "references";
      behavior.relations.push({id: JSON.stringify([location.file, location.start, relation]), source: ref.scope.owner, target: binding.declaration.id, relation, conditional: ref.conditional, site: location});
    } else if (ref.call) gap(ref.occurrence, ref.scope, "unresolved-lexical-call");
  }
  for (const entry of exported) { const binding = resolve(entry.scope, entry.local, text.length); if (binding?.declaration) { count(); result.exports.push({name: entry.name, id: binding.declaration.id}); } }
  checkpoint(); return result;
}
