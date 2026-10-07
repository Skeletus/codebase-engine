import { ts } from "ts-morph";
import type { GapReason } from "../model/framework.ts";
import { GenerationBoundary } from "./boundary.ts";

export type StaticValue = { kind: "literal"; value: string | number | boolean | null } | { kind: "array"; items: StaticValue[] } | { kind: "object"; properties: Record<string, StaticValue> } | { kind: "unknown"; reason: GapReason } | { kind: "conditional"; condition: string; whenTrue: StaticValue; whenFalse: StaticValue };
export type ConfigGap = { reason: GapReason; start: number; end: number; detail: string };
export type ConfigResult = { value: StaticValue; gaps: ConfigGap[]; visited: number; sites: { start: number; end: number }[] };
export const CONFIG_LIMITS = { depth: 32, nodes: 10000, dependencies: 64, patterns: 100, matches: 20000 } as const;

/** Syntax only. No module loader, typechecker, environment, or filesystem host. */
export function interpretConfig(text: string, options: { expression?: boolean; wrappers?: Readonly<Record<string, string>>; boundary?: GenerationBoundary } = {}): ConfigResult {
  const prefix = options.expression ? "export default " : "";
  const source = ts.createSourceFile("config.ts", prefix + text, ts.ScriptTarget.Latest, true);
  const gaps: ConfigGap[] = [], sites: { start: number; end: number }[] = [];
  const constants = new Map<string, ts.Expression>(), wrappers = new Set<string>(), active = new Set<string>();
  const importBindings = new Set<string>();
  let visited = 0;
  let producedCharacters = 0;
  function literal(value: string | number | boolean | null): StaticValue {
    if (typeof value === "string") { producedCharacters += value.length; if (value.length > 1048576 || producedCharacters > 8 * 1048576) throw new Error("config-budget"); }
    return { kind: "literal", value };
  }
  const unknown = (node: ts.Node, reason: GapReason, detail: string): StaticValue => {
    gaps.push({ reason, start: Math.max(0, node.getStart(source) - prefix.length), end: Math.min(text.length, node.end - prefix.length), detail }); return { kind: "unknown", reason };
  };
  for (const statement of source.statements) {
    options.boundary?.check();
    if (source.statements.length > CONFIG_LIMITS.nodes) return { value: unknown(source, "resource-limit", "static declaration budget"), gaps, visited, sites };
    if (ts.isVariableStatement(statement) && statement.declarationList.flags & ts.NodeFlags.Const) {
      for (const d of statement.declarationList.declarations) if (ts.isIdentifier(d.name) && d.initializer) {
        if (constants.size >= CONFIG_LIMITS.nodes) return { value: unknown(d, "resource-limit", "static declaration budget"), gaps, visited, sites };
        if (constants.has(d.name.text)) return { value: unknown(d, "ambiguous-target", "duplicate constant"), gaps, visited, sites };
        constants.set(d.name.text, d.initializer);
      }
    }
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      const names = statement.importClause?.namedBindings;
      const identifiers = [...(statement.importClause?.name ? [statement.importClause.name.text] : []), ...(names && ts.isNamespaceImport(names) ? [names.name.text] : names && ts.isNamedImports(names) ? names.elements.map(e => e.name.text) : [])];
      for (const name of identifiers) { if (importBindings.has(name)) return { value: unknown(statement, "ambiguous-target", "duplicate import binding"), gaps, visited, sites }; importBindings.add(name); }
      const bindings = statement.importClause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) for (const b of bindings.elements) {
        if (options.wrappers?.[b.propertyName?.text ?? b.name.text] === statement.moduleSpecifier.text && !statement.importClause?.isTypeOnly && !b.isTypeOnly) wrappers.add(b.name.text);
      }
    }
  }
  function evaluate(node: ts.Expression, depth: number): StaticValue {
    options.boundary?.check();
    if (++visited > CONFIG_LIMITS.nodes || depth > CONFIG_LIMITS.depth) throw new Error("config-budget");
    sites.push({ start: node.getStart(source) - prefix.length, end: node.end - prefix.length });
    if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node)) return evaluate(node.expression, depth + 1);
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return literal(node.text);
    if (ts.isNumericLiteral(node) && Number.isFinite(Number(node.text))) return { kind: "literal", value: Number(node.text) };
    if (node.kind === ts.SyntaxKind.TrueKeyword || node.kind === ts.SyntaxKind.FalseKeyword) return { kind: "literal", value: node.kind === ts.SyntaxKind.TrueKeyword };
    if (node.kind === ts.SyntaxKind.NullKeyword) return { kind: "literal", value: null };
    if (ts.isIdentifier(node)) {
      const initializer = constants.get(node.text);
      if (!initializer) return unknown(node, "dynamic-expression", "unknown or mutable reference");
      if (active.has(node.text)) return unknown(node, "config-cycle", "constant reference cycle");
      active.add(node.text); const result = evaluate(initializer, depth + 1); active.delete(node.text); return result;
    }
    if (ts.isArrayLiteralExpression(node)) return { kind: "array", items: node.elements.map(e => evaluate(e, depth + 1)) };
    if (ts.isObjectLiteralExpression(node)) {
      const properties: Record<string, StaticValue> = Object.create(null);
      for (const p of node.properties) {
        options.boundary?.check();
        if (!ts.isPropertyAssignment(p) && !ts.isShorthandPropertyAssignment(p)) return unknown(p, "dynamic-expression", "getters, methods and spreads are not interpreted");
        if (!ts.isIdentifier(p.name) && !ts.isStringLiteral(p.name) && !ts.isNumericLiteral(p.name)) return unknown(p, "dynamic-expression", "computed property");
        const name = p.name.text;
        if (Object.hasOwn(properties, name)) return unknown(p, "ambiguous-target", "duplicate property");
        properties[name] = evaluate(ts.isPropertyAssignment(p) ? p.initializer : p.name, depth + 1);
      }
      return { kind: "object", properties };
    }
    if (ts.isPropertyAccessExpression(node)) { const base = evaluate(node.expression, depth + 1); return base.kind === "object" && Object.hasOwn(base.properties, node.name.text) ? base.properties[node.name.text] : unknown(node, "dynamic-expression", "unknown property"); }
    if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.MinusToken) { const value = evaluate(node.operand, depth + 1); if (value.kind === "literal" && typeof value.value === "number") return { kind: "literal", value: -value.value }; }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      const left = evaluate(node.left, depth + 1), right = evaluate(node.right, depth + 1);
      if (left.kind === "literal" && right.kind === "literal" && typeof left.value === "string" && typeof right.value === "string") { if (left.value.length + right.value.length > 1048576) throw new Error("config-budget"); return literal(left.value + right.value); }
    }
    if (ts.isConditionalExpression(node)) {
      const condition = evaluate(node.condition, depth + 1);
      if (condition.kind === "literal" && typeof condition.value === "boolean") return evaluate(condition.value ? node.whenTrue : node.whenFalse, depth + 1);
      return { kind: "conditional", condition: node.condition.getText(source), whenTrue: evaluate(node.whenTrue, depth + 1), whenFalse: evaluate(node.whenFalse, depth + 1) };
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && wrappers.has(node.expression.text) && !constants.has(node.expression.text) && node.arguments.length === 1) return evaluate(node.arguments[0], depth + 1);
    return unknown(node, "dynamic-expression", "expression requires execution or unsupported semantics");
  }
  // Reject syntax errors rather than interpreting a recovered partial AST.
  if ((source as ts.SourceFile & { parseDiagnostics: readonly ts.Diagnostic[] }).parseDiagnostics.length) return { value: unknown(source, "parse-error", "invalid configuration syntax"), gaps, visited, sites };
  let root: ts.Expression | undefined;
  {
    for (const s of source.statements) {
      if (ts.isExportAssignment(s) && !s.isExportEquals) { if (root) return { value: unknown(s, "ambiguous-target", "multiple config exports"), gaps, visited, sites }; root = s.expression; }
      if (ts.isExpressionStatement(s) && ts.isBinaryExpression(s.expression) && s.expression.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isPropertyAccessExpression(s.expression.left) && ts.isIdentifier(s.expression.left.expression) && s.expression.left.expression.text === "module" && s.expression.left.name.text === "exports") { if (root) return { value: unknown(s, "ambiguous-target", "multiple config exports"), gaps, visited, sites }; root = s.expression.right; }
      else if (!ts.isExportAssignment(s) && !ts.isImportDeclaration(s) && !ts.isVariableStatement(s) && !ts.isEmptyStatement(s)) return { value: unknown(s, "dynamic-expression", "statement may change configuration"), gaps, visited, sites };
    }
  }
  // An unrelated initializer can mutate the exported object. Do not treat const
  // declarations as immutable data when any top-level initializer calls a helper.
  let inspected = 0;
  for (const statement of source.statements) if (ts.isVariableStatement(statement)) {
    const pending: ts.Node[] = statement.declarationList.declarations.flatMap(d => d.initializer ? [d.initializer] : []);
    while (pending.length) {
      options.boundary?.check();
      const node = pending.pop()!;
      if (++inspected > CONFIG_LIMITS.nodes) return { value: unknown(node, "resource-limit", "configuration inspection budget"), gaps, visited, sites: [] };
      if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) continue;
      if (ts.isCallExpression(node) && !(ts.isIdentifier(node.expression) && wrappers.has(node.expression.text) && !constants.has(node.expression.text) && node.arguments.length === 1)) return { value: unknown(node, "dynamic-expression", "initializer may mutate configuration"), gaps, visited, sites: [] };
      if (ts.isNewExpression(node) || ts.isAwaitExpression(node) || ts.isPostfixUnaryExpression(node) || ts.isDeleteExpression(node) || ts.isTaggedTemplateExpression(node) || ts.isPrefixUnaryExpression(node) && [ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken].includes(node.operator) || ts.isBinaryExpression(node) && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && node.operatorToken.kind <= ts.SyntaxKind.LastAssignment) return { value: unknown(node, "dynamic-expression", "initializer requires runtime effects"), gaps, visited, sites: [] };
      ts.forEachChild(node, child => { pending.push(child); });
    }
  }
  try { return { value: root ? evaluate(root, 0) : unknown(source, "unsupported-syntax", "no supported static export"), gaps, visited, sites }; }
  catch (error) { if (!(error instanceof Error) || error.message !== "config-budget") throw error; return { value: unknown(root ?? source, "resource-limit", "static configuration budget"), gaps: gaps.slice(-1), visited, sites: [] }; }
}
