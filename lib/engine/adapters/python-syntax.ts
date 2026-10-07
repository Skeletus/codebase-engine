import type { Node, Parser } from "web-tree-sitter";
import type { Behavior, Declaration, Site } from "../../model/behavior.ts";
import { pythonSource } from "./python-source.ts";

export type PythonImport = { module: string; name: string | null; alias: string; site: Site; star: boolean; topLevel: boolean; reexportable: boolean };
export type PythonSyntax = { behavior: Behavior; imports: PythonImport[]; exports: { name: string; id: string }[]; importedCalls: { alias: string; name: string | null; bindingStart: number; source: string | null; site: Site }[]; decorated: { id: string; site: Site }[]; inheritance: { classId: string; baseIds: string[]; mro: string[] | null; site: Site }[]; all: { name: string; site: Site }[] | null; visited: number };
type Scope = { parent: Scope | null; owner: string | null; classScope: boolean; bindings: Map<string, Declaration[]>; imports: Map<string, PythonImport[]>; aliases: Map<string, string[]>; uncertain: Set<string> };

/** Syntax trees never cross the adapter/worker boundary. All outputs are neutral
 * evidence records or bounded literal module requests, never serialized ASTs. */
export function extractPython(parser: Parser, file: string, bytes: Uint8Array): PythonSyntax {
  const input = pythonSource(bytes), deadline = performance.now() + 2000;
  const tree = parser.parse(input.parserText, null, { progressCallback: () => performance.now() >= deadline });
  if (!tree) { parser.reset(); throw new Error("resource-limit"); }
  const behavior: Behavior = { declarations: [], relations: [], gaps: [], handlers: [] };
  const result: PythonSyntax = { behavior, imports: [], exports: [], importedCalls: [], decorated: [], inheritance: [], all: null, visited: 0 };
  const root: Scope = { parent: null, owner: null, classScope: false, bindings: new Map(), imports: new Map(), aliases: new Map(), uncertain: new Set() };
  const children = (node: Node) => node.namedChildren.filter((child): child is Node => child !== null);
  const nodes: { node: Node; scope: Scope }[] = [];
  const classes: { node: Node; scope: Scope; id: string; decorated: boolean }[] = [];
  let unsafeBindings = false;
  // Count every named syntax node, including unsupported/recovery subtrees and
  // parameter nodes that the semantic walker intentionally does not traverse.
  const inventory = [tree.rootNode];
  while (inventory.length) {
    const node = inventory.pop()!;
    if (++result.visited > 100000 || performance.now() >= deadline) { tree.delete(); throw new Error("resource-limit"); }
    for (const child of children(node)) inventory.push(child);
  }
  const site = (node: Node): Site => { let end = node.endIndex; if (end === input.text.length && /\r\n$/.test(input.text)) end -= 2; else if (end === input.text.length && /[\r\n]$/.test(input.text)) end--; const mapped = input.range(node.startIndex, end); return { file, start: mapped.start, end: mapped.end, line: mapped.line, endLine: mapped.endLine, fileHash: input.hash, extractor: "python/syntax/fs-05/1", evidenceKind: "verified" }; };
  const gap = (node: Node, scope: Scope, reason: string) => { if (node.endIndex > node.startIndex) behavior.gaps.push({ source: scope.owner, reason, site: site(node) }); };
  const declare = (node: Node, name: string, kind: Declaration["kind"], scope: Scope, callable = false) => {
    const location = site(node), d: Declaration = { id: JSON.stringify([file, location.start, kind]), name, kind, callable, site: location };
    const key = name.normalize("NFKC");
    behavior.declarations.push(d); const bindings = scope.bindings.get(key) ?? []; bindings.push(d); scope.bindings.set(key, bindings); return d;
  };
  const walk = (node: Node, scope: Scope) => {
    if (performance.now() >= deadline) throw new Error("resource-limit");
    if (node.isError || node.isMissing) { gap(node, scope, "parse-error"); return; }
    if (node.hasError) { gap(node, scope, "parse-error"); return; } // recovery cannot prove descendants
    nodes.push({ node, scope });
    if (node.type === "function_definition" || node.type === "class_definition") {
      const name = node.childForFieldName("name"); if (!name) return;
      const isClass = node.type === "class_definition", decorated = node.parent?.type === "decorated_definition";
      const declaration = declare(node, name.text, isClass ? "class" : scope.classScope ? "method" : "function", scope, !isClass);
      if (isClass) classes.push({ node, scope, id: declaration.id, decorated });
      if (decorated) { for (const decorator of children(node.parent!).filter(n => n.type === "decorator")) result.decorated.push({ id: declaration.id, site: site(decorator) }); scope.uncertain.add(name.text.normalize("NFKC")); gap(node, scope, "decorator-wrapper-boundary"); }
      const inner: Scope = { parent: !isClass && scope.classScope ? scope.parent : scope, owner: declaration.callable ? declaration.id : scope.owner, classScope: isClass, bindings: new Map(), imports: new Map(), aliases: new Map(), uncertain: new Set() };
      const params = node.childForFieldName("parameters");
      const returnType = node.childForFieldName("return_type");
      if (returnType) gap(returnType,scope,"annotation-expression-boundary");
      if (params) for (const parameter of children(params)) {
        const nameNode = parameter.type === "identifier" ? parameter : parameter.childForFieldName("name") ?? children(parameter).find(n => n.type === "identifier");
        if (nameNode) declare(nameNode, nameNode.text, "parameter", inner);
        if (parameter.type.includes("default") || parameter.type === "typed_parameter") gap(parameter, scope, "parameter-expression-boundary");
      }
      for (const child of children(node)) {
        if (child.id === name.id || child.id === params?.id || child.id === returnType?.id) continue;
        walk(child, child.type === "block" ? inner : scope);
      }
      return;
    }
    if (node.type === "import_statement" || node.type === "import_from_statement") {
      const moduleNode = node.childForFieldName("module_name"), from = node.type === "import_from_statement";
      for (const child of children(node).filter(c => c.id !== moduleNode?.id)) {
        const named = child.type === "aliased_import" ? child.childForFieldName("name") : child;
        if (!named) continue;
        const alias = (child.childForFieldName("alias")?.text ?? (from ? named.text : named.text.split(".")[0])).normalize("NFKC");
        const entry: PythonImport = { module: (from ? moduleNode?.text ?? "" : named.text).normalize("NFKC"), name: from ? named.text.normalize("NFKC") : null, alias, site: site(child), star: child.type === "wildcard_import", topLevel: scope === root, reexportable: false };
        result.imports.push(entry); scope.imports.set(alias, [...scope.imports.get(alias) ?? [], entry]);
        if (entry.star) { unsafeBindings = true; gap(child, scope, "star-import-boundary"); }
      }
      return;
    }
    if (["global_statement", "nonlocal_statement", "delete_statement"].includes(node.type)) {
      unsafeBindings = true;
      for (const child of children(node)) { scope.uncertain.add(child.text.normalize("NFKC")); gap(child, scope, "mutable-binding-boundary"); }
    }
    if (["assignment", "augmented_assignment", "named_expression"].includes(node.type)) {
      const left = node.childForFieldName("left") ?? node.childForFieldName("name"), right = node.childForFieldName("right") ?? node.childForFieldName("value");
      if (left?.type === "identifier") { declare(left, left.text, "value", scope); const key = left.text.normalize("NFKC"); if (right?.type === "identifier" && node.type === "assignment") scope.aliases.set(key, [...scope.aliases.get(key) ?? [], right.text.normalize("NFKC")]); else scope.uncertain.add(key); }
      else if (left) { unsafeBindings = true; gap(left, scope, "dynamic-write-boundary"); }
    }
    if (node.type === "type_alias_statement") {
      const left = node.childForFieldName("left");
      const name = left?.descendantsOfType("identifier")[0];
      if (name) declare(name, name.text, "value", scope);
      gap(node, scope, "type-parameter-semantic-boundary");
      return;
    }
    if (["for_statement", "lambda", "list_comprehension", "dictionary_comprehension", "set_comprehension", "generator_expression", "with_statement", "except_clause", "match_statement"].includes(node.type)) {
      unsafeBindings = true; gap(node, scope, "unsupported-binding-scope"); return;
    }
    for (const child of children(node)) walk(child, scope);
  };
  const lookup = (scope: Scope, name: string, seen = new Set<string>(), at = Infinity, origin = scope): { declaration?: Declaration; imported?: PythonImport } => {
    name = name.normalize("NFKC");
    if (seen.has(name)) return {}; seen.add(name);
    for (let current: Scope | null = scope; current; current = current.parent) {
      if (current.uncertain.has(name)) return {};
      const bindings = current.bindings.get(name), imported = current.imports.get(name), aliases = current.aliases.get(name);
      if (bindings || imported) {
        if (current === origin && (bindings?.some(d => d.site.start > at) || imported?.some(i => i.site.start > at))) return {};
        if (aliases?.length === 1 && bindings?.length === 1 && !imported) return lookup(current, aliases[0], seen, bindings[0].site.start, origin);
        if (bindings?.length === 1 && !imported) return { declaration: bindings[0] };
        if (imported?.length === 1 && !bindings) return { imported: imported[0] };
        return {};
      }
    }
    return {};
  };
  try {
    // A malformed module is withheld as a whole, rather than allowing an error
    // subtree to invalidate otherwise apparently unique name bindings.
    walk(tree.rootNode, root);
    const reflective = new Set(["exec", "eval", "globals", "locals", "setattr", "delattr", "__import__"]);
    const reflectionAlias = (scope: Scope, name: string, seen = new Set<string>()): boolean => {
      name = name.normalize("NFKC"); if (seen.has(name) || seen.size >= 64) return false; seen.add(name);
      if (reflective.has(name)) return true;
      for (let current: Scope | null = scope; current; current = current.parent) {
        if (current.imports.get(name)?.some(i => i.module === "builtins" && i.name !== null && reflective.has(i.name))) return true;
        if (current.aliases.get(name)?.some(alias => reflectionAlias(current, alias, seen))) return true;
      }
      return false;
    };
    for (const { node, scope } of nodes) {
      if (node.type !== "call") continue;
      const fn = node.childForFieldName("function"); if (!fn) continue;
      if (fn.type === "identifier" && reflectionAlias(scope, fn.text)) unsafeBindings = true;
    }
    const allAssignments = nodes.filter(({ node, scope }) => scope === root && node.type === "assignment" && node.childForFieldName("left")?.text === "__all__");
    if (allAssignments.length) {
      const assignment = allAssignments[0], value = assignment.node.childForFieldName("right");
      const values = value && ["list", "tuple"].includes(value.type) ? children(value) : null;
      const mutated = nodes.some(({ node }) => node.type === "identifier" && node.text === "__all__" && !(node.parent?.type === "assignment" && node.parent.childForFieldName("left")?.id === node.id));
      if (allAssignments.length === 1 && !unsafeBindings && !mutated && values && values.length <= 200 && values.every(v => v.type === "string" && /^(['"])[^\\\r\n]*\1$/.test(v.text) && v.text.length > 2 && !v.text.startsWith("'''") && !v.text.startsWith('"""'))) result.all = values.map(v => ({ name: v.text.slice(1, -1), site: site(v) }));
      else gap(assignment.node, root, "dynamic-export-list-boundary");
    }
    for (const c of classes) {
      const superclasses = c.node.childForFieldName("superclasses"), bases = superclasses ? children(superclasses) : [];
      const resolved = bases.map(base => base.type === "identifier" ? lookup(c.scope, base.text, new Set(), c.node.startIndex).declaration : undefined);
      const supported = !unsafeBindings && !c.decorated && resolved.every(d => d?.kind === "class") && !bases.some(b => b.type !== "identifier");
      const record = { classId: c.id, baseIds: supported ? resolved.map(d => d!.id) : [], mro: supported ? [] as string[] : null, site: site(c.node) };
      result.inheritance.push(record); if (!supported) gap(c.node, c.scope, "inheritance-boundary");
    }
    const linearize = (id: string, visiting = new Set<string>()): string[] | null => {
      if (visiting.has(id) || visiting.size >= 64) return null;
      const record = result.inheritance.find(r => r.classId === id); if (!record || record.mro === null) return null;
      if (record.mro.length) return record.mro;
      const next = new Set(visiting); next.add(id);
      const parents = record.baseIds.map(base => linearize(base, next)); if (parents.some(p => p === null)) return null;
      const sequences = [...parents.map(p => [...p!]), [...record.baseIds]], mro = [id];
      while (sequences.some(s => s.length)) {
        const head = sequences.filter(s => s.length).map(s => s[0]).find(candidate => sequences.every(s => !s.slice(1).includes(candidate)));
        if (!head || mro.length >= 64) return null;
        mro.push(head); for (const sequence of sequences) if (sequence[0] === head) sequence.shift();
      }
      record.mro = mro; return mro;
    };
    for (const c of classes) { const record = result.inheritance.find(r => r.classId === c.id)!; record.mro = linearize(c.id); if (!record.mro) gap(c.node, c.scope, "ambiguous-mro-boundary"); }
    for (const { node, scope } of nodes) {
      if (node.type !== "call") continue;
      const fn = node.childForFieldName("function"); if (!fn) continue;
      if (unsafeBindings) { gap(node, scope, "dynamic-binding-boundary"); continue; }
      if (fn.type === "identifier") {
        const target = lookup(scope, fn.text, new Set(), node.startIndex);
        if (target.declaration?.callable) { const location = site(node); behavior.relations.push({ id: JSON.stringify([file, location.start, "calls"]), source: scope.owner, target: target.declaration.id, relation: "calls", conditional: true, site: location }); }
        else if (target.imported) result.importedCalls.push({ alias: target.imported.alias, name: target.imported.name, bindingStart: target.imported.site.start, source: scope.owner, site: site(node) });
        else gap(node, scope, "ambiguous-call-target");
      } else gap(node, scope, "dynamic-attribute-dispatch");
    }
    if (!unsafeBindings) for (const { node, scope } of nodes) {
      if (node.type !== "identifier" || behavior.declarations.some(d => d.site.start === node.startIndex && d.site.end === node.endIndex) || node.parent?.type === "attribute") continue;
      const target = lookup(scope, node.text, new Set(), node.startIndex).declaration;
      if (target && !(node.parent?.type === "call" && node.parent.childForFieldName("function")?.id === node.id)) {
        const location = site(node); behavior.relations.push({ id: JSON.stringify([file, location.start, "references"]), source: scope.owner, target: target.id, relation: "references", conditional: true, site: location });
      }
    }
    for (const [name, declarations] of root.bindings) if (!unsafeBindings && declarations.length === 1 && !root.uncertain.has(name)) result.exports.push({ name, id: declarations[0].id });
    for (const entry of result.imports) entry.reexportable = !unsafeBindings && entry.topLevel && lookup(root, entry.alias).imported === entry;
    if (behavior.declarations.length + behavior.relations.length + behavior.gaps.length + result.imports.length + result.importedCalls.length + result.decorated.length + result.inheritance.length + (result.all?.length ?? 0) > 20000) throw new Error("resource-limit");
    return result;
  } finally { tree.delete(); }
}

