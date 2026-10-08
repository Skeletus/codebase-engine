import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { normalizeRange } from "../lib/model/positions.ts";

/** Isolated syntax/location experiment; this is not the production Flow adapter. */
type AstNode = {type: string; range: [number, number]; [key: string]: unknown};
const isNode = (value: unknown): value is AstNode => !!value && typeof value === "object" && "type" in value && typeof value.type === "string" && "range" in value && Array.isArray(value.range);
const require = createRequire(import.meta.url);
const hermes = require("hermes-parser") as {parse: (text: string, options: unknown) => unknown; FlowVisitorKeys: Record<string, string[]>};
assert.equal(require("hermes-parser/package.json").version, "0.25.1");
assert.equal(createRequire(require.resolve("hermes-parser"))("hermes-estree/package.json").version, "0.25.1");
const digest = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const bytes = readFileSync("tests/fixtures/framework-support/F07-rn/flow.json");
const fixture = JSON.parse(bytes.toString()) as {cases: {id: string; source: string; requiredTypes?: string[]; error?: boolean}[]};
const outputs = fixture.cases.map(c => {
  const started = performance.now();
  let ast: unknown;
  try { ast = hermes.parse(c.source, {flow: "all", babel: false, sourceType: "module", enableExperimentalComponentSyntax: true}); }
  catch { assert.equal(c.error, true, c.id); return {id: c.id, sourceHash: digest(c.source), outcome: "parse-error", nodes: [], elapsedMs: performance.now() - started}; }
  assert(!c.error, c.id);
  assert(isNode(ast));
  const stack: AstNode[] = [ast], nodes: {type: string; start: number; end: number; text: string; line: number; endLine: number}[] = [];
  while (stack.length) {
    assert(nodes.length < 100000);
    const node = stack.pop()!;
    const [start, end] = node.range;
    const position = normalizeRange(c.source, start, end, "utf16");
    const text = c.source.slice(start, end);
    nodes.push({type: node.type, start, end, text, line: position.line, endLine: position.endLine});
    for (const key of hermes.FlowVisitorKeys[node.type] ?? []) {
      const child = node[key];
      if (isNode(child)) stack.push(child);
      else if (Array.isArray(child)) for (const value of child) if (isNode(value)) stack.push(value);
    }
  }
  for (const type of c.requiredTypes ?? []) assert(nodes.some(n => n.type === type), `${c.id}: ${type}`);
  if (c.id === "position") {
    const call = nodes.find(n => n.type === "CallExpression")!;
    assert.equal(call.start, c.source.indexOf("helper(1)")); assert.equal(call.text, "helper(1)"); assert.equal(call.line, 4);
  }
  return {id: c.id, sourceHash: digest(c.source), outcome: "parsed", nodes, elapsedMs: performance.now() - started};
});
const normalized = outputs.map(({elapsedMs, ...o}) => { void elapsedMs; return o; });
writeFileSync("docs/fs-07/evidence/hermes-syntax-experiment.json", JSON.stringify({parser: "hermes-parser@0.25.1", estree: "hermes-estree@0.25.1", fixtureHash: digest(bytes), outputHash: digest(JSON.stringify(normalized)), outputs, process: process.memoryUsage(), scopeQualification: false, productionSupervisionQualification: false, repositoryExecution: false}, null, 2) + "\n");
console.log("Hermes controlled syntax/location experiment:", outputs.length, "cases; no scope or supervision qualification claimed");
