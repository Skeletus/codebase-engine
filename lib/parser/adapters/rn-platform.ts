import { Node, SyntaxKind } from "ts-morph";
import type { FrameworkSource } from "../framework-bindings.ts";

export type FrameworkProjection = { active: (node: Node) => boolean; select: (node: Node) => Node | undefined };

/** Only source-backed Platform.OS and literal Platform.select maps are reduced.
 * Unknown branches never contribute verified variant-specific framework facts.
 * Lexical CALLS and the accepted structural Impact graph are not rewritten. */
export function rnPlatform(inputs: readonly FrameworkSource[], platform: "android" | "ios", api: (node: Node) => {module: string; name: string} | undefined, gap: (node: Node, reason: "dynamic-expression" | "variant-not-selected") => void, checkpoint: () => void): FrameworkProjection {
  const isApi = (node: Node, name: string) => {const found = api(node); return found?.module === "react-native" && found.name === "Platform." + name;};
  function value(node: Node): string | boolean | undefined {
    checkpoint();
    if (Node.isParenthesizedExpression(node)) return value(node.getExpression());
    if (isApi(node, "OS")) return platform;
    if (Node.isStringLiteral(node)) return node.getLiteralText();
    if (node.getKind() === SyntaxKind.TrueKeyword) return true;
    if (node.getKind() === SyntaxKind.FalseKeyword) return false;
    if (Node.isPrefixUnaryExpression(node) && node.getOperatorToken() === SyntaxKind.ExclamationToken) {const operand = value(node.getOperand()); return typeof operand === "boolean" ? !operand : undefined;}
    if (Node.isBinaryExpression(node)) {
      const left = value(node.getLeft()), right = value(node.getRight()), op = node.getOperatorToken().getText();
      if (left !== undefined && right !== undefined && ["===", "!==", "==", "!="].includes(op) && typeof left === typeof right) return op.includes("!") ? left !== right : left === right;
      if (op === "&&") return left === false || right === false ? false : left === true && right === true ? true : undefined;
      if (op === "||") return left === true || right === true ? true : left === false && right === false ? false : undefined;
    }
    return undefined;
  }
  function selection(node: Node): Node | undefined {
    checkpoint();
    if (Node.isParenthesizedExpression(node) || Node.isAsExpression(node) || Node.isSatisfiesExpression(node)) return selection(node.getExpression());
    if (Node.isConditionalExpression(node)) {const condition = value(node.getCondition()); return typeof condition === "boolean" ? selection(condition ? node.getWhenTrue() : node.getWhenFalse()) : undefined;}
    if (!Node.isCallExpression(node) || !isApi(node.getExpression(), "select")) return node;
    const map = node.getArguments()[0];
    if (node.getArguments().length !== 1 || !map || !Node.isObjectLiteralExpression(map)) return;
    const properties = new Map<string, Node>();
    for (const property of map.getProperties()) {
      if (!Node.isPropertyAssignment(property) && !Node.isShorthandPropertyAssignment(property)) return;
      const name = property.getNameNode(); if (!Node.isIdentifier(name) && !Node.isStringLiteral(name)) return;
      const key = Node.isStringLiteral(name) ? name.getLiteralText() : name.getText();
      if (properties.has(key) || key === "__proto__") return;
      properties.set(key, Node.isPropertyAssignment(property) ? property.getInitializerOrThrow() : name);
    }
    const selected = properties.get(platform) ?? properties.get("native") ?? properties.get("default");
    return selected ? selection(selected) : undefined;
  }
  function active(node: Node): boolean {
    for (const ancestor of node.getAncestors()) {
      checkpoint();
      if (Node.isIfStatement(ancestor) || Node.isConditionalExpression(ancestor)) {
        const condition = Node.isIfStatement(ancestor) ? ancestor.getExpression() : ancestor.getCondition();
        if (node.getStart() >= condition.getStart() && node.getEnd() <= condition.getEnd()) continue;
        const answer = value(condition);
        if (answer === undefined) {gap(condition, "dynamic-expression"); return false;}
        const branch = Node.isIfStatement(ancestor) ? answer ? ancestor.getThenStatement() : ancestor.getElseStatement() : answer ? ancestor.getWhenTrue() : ancestor.getWhenFalse();
        if (!branch || node.getStart() < branch.getStart() || node.getEnd() > branch.getEnd()) return false;
      }
      if (Node.isCallExpression(ancestor) && isApi(ancestor.getExpression(), "select")) {
        const selected = selection(ancestor);
        if (!selected) {gap(ancestor, "dynamic-expression"); return false;}
        if (node.getStart() < selected.getStart() || node.getEnd() > selected.getEnd()) return false;
      }
      if (Node.isBinaryExpression(ancestor) && ["&&", "||"].includes(ancestor.getOperatorToken().getText()) && node.getStart() >= ancestor.getRight().getStart()) {
        const answer = value(ancestor.getLeft());
        if (answer === undefined) {gap(ancestor.getLeft(), "dynamic-expression"); return false;}
        if (ancestor.getOperatorToken().getText() === "&&" ? !answer : answer) return false;
      }
    }
    return true;
  }
  // Retain explicit unresolved evidence even when an unknown branch has no
  // framework operation, rather than claiming a complete branch interpretation.
  for (const input of inputs) for (const call of input.sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) if (isApi(call.getExpression(), "select") && !selection(call)) gap(call, "dynamic-expression");
  return {active, select: selection};
}
