import type { ExplanationSelection } from "./selection.ts";
import { createHash } from "node:crypto";
import type { CodeSnapshot } from "../engine/types.ts";
import { investigate } from "../engine/investigations.ts";

// Only structural metadata is transferred in Phase 05. No source text,
// diagnostic expressions, absolute roots or arbitrary user questions.
function safeText(value: string): string {
  if (value.length > 4096 || /(?:(?:sk-|gsk_)[A-Za-z0-9_-]{12,}|AKIA[A-Z0-9]{16}|-----BEGIN .*PRIVATE KEY|(?:password|secret|token|api_key)\s*[=:])/i.test(value)) throw new Error("Sensitive-looking evidence excluded");
  return value;
}
export function explanationEvidence(snapshot: CodeSnapshot, selection: ExplanationSelection) {
  let paths: string[], answer: ReturnType<typeof investigate> | null = null;
  if (selection.kind === "investigation") {
    answer = investigate(snapshot, selection.query);
    if (answer.state !== "ok") throw new Error("Choose an unambiguous supported investigation first");
    paths = [...new Set([...(answer.target ? [answer.target] : []), ...answer.candidates, ...answer.rows.map((r) => r.file), ...answer.exportFiles, ...answer.routeIndices.map((i) => snapshot.routes[i].file)])];
  } else paths = snapshot.files.filter((f) => selection.kind === "file" ? f.path === selection.path : !selection.path || f.path.startsWith(selection.path + "/")).map((f) => f.path).sort();
  if (!paths.length) throw new Error("No snapshot evidence selected");
  if (selection.kind === "file") paths = [...new Set([...paths, ...snapshot.relationships.filter((r) => r.source === selection.path || r.target === selection.path).flatMap((r) => [r.source, r.target]).sort()])];
  const chosen = paths.slice(0, 8), ids = new Set(chosen);
  const files = snapshot.files.filter((f) => ids.has(f.path)).map((f, i) => ({ id: `F${i + 1}`, path: safeText(f.path), hash: f.hash, role: f.role, exports: f.exports.slice(0, 20).map(safeText), exportsOmitted: Math.max(0, f.exports.length - 20) }));
  const relationships = snapshot.relationships.filter((r) => ids.has(r.source) || ids.has(r.target));
  const edges = relationships.filter((r) => ids.has(r.source) && ids.has(r.target)).slice(0, 24).map((r, i) => ({ id: `E${i + 1}`, source: safeText(r.source), target: safeText(r.target), typeOnly: r.typeOnly, line: r.evidence.line, hash: r.evidence.fileHash, extractor: r.evidence.extractor, occurrence: r.evidence.occurrence }));
  const routes = snapshot.routes.filter((r) => ids.has(r.file));
  const declarations = routes.slice(0, 8).map((r, i) => ({ id: `R${i + 1}`, file: safeText(r.file), method: safeText(r.method), pattern: safeText(r.pattern), line: r.evidence.line, hash: r.evidence.fileHash, extractor: r.evidence.extractor }));
  const evidence = { version: 1, task: selection.kind, goal: selection.kind === "investigation" ? (selection.query.operation === "ask" ? { intent: selection.query.intent, target: safeText(selection.query.target), depth: selection.query.depth, budget: selection.query.budget } : { scope: selection.query.scope, text: safeText(selection.query.text), budget: selection.query.budget }) : { path: safeText(selection.path) }, adapter: snapshot.adapter, files, edges, routes: declarations,
    omissions: { files: paths.length - chosen.length, edges: relationships.length - edges.length, routes: routes.length - declarations.length },
    coverage: snapshot.coverage.files, imports: snapshot.coverage.relationships,
    investigation: answer ? { message: answer.message, beyondDepth: answer.beyondDepth, beyondBudget: answer.beyondBudget } : null,
    limits: "Partial file-dependency evidence, not calls or execution flow. External/excluded/unresolved relationships and truncated context cannot prove absence. No source contents included." };
  const payload = JSON.stringify(evidence);
  if (Buffer.byteLength(payload) > 6000) throw new Error("Selected evidence exceeds explanation budget; select a smaller scope");
  return { payload, digest: createHash("sha256").update(payload).digest("hex"), ids: [...files, ...edges, ...declarations].map((e) => e.id), files: files.map((f) => f.path) };
}

