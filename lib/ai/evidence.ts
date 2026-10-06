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
  const symbols = new Map(snapshot.behavior.declarations.map((d) => [d.id, d]));
  const fileIds = new Map(files.map((f) => [f.path, f.id]));
  const symbolCandidates = snapshot.behavior.declarations.filter((d) => d.callable && ids.has(d.site.file));
  const relationCandidates = snapshot.behavior.relations.filter((r) => ids.has(r.site.file));
  const gapCandidates = snapshot.behavior.gaps.filter((g) => ids.has(g.site.file));
  const handlerCandidates = snapshot.behavior.handlers.filter((h) => ids.has(h.site.file));
  // Rich facts cite their existing file IDs. Every transmitted site/target is
  // included in native freshness checks, with no new implicit consent or source.
  const compactSite = (s: import("../model/behavior.ts").Site) => ({ citation: fileIds.get(s.file)!, file: safeText(s.file), line: s.line, endLine: s.endLine, hash: s.fileHash });
  const rich = {
    symbols: symbolCandidates.slice(0, 4).map((d) => ({ name: safeText(d.name), kind: d.kind, ...compactSite(d.site) })),
    relations: relationCandidates.filter((r) => ids.has(symbols.get(r.target)!.site.file)).slice(0, 4).map((r) => ({ relation: r.relation, source: r.source ? safeText(symbols.get(r.source)!.name) : null, target: safeText(symbols.get(r.target)!.name), targetSite: compactSite(symbols.get(r.target)!.site), conditional: r.conditional, ...compactSite(r.site) })),
    gaps: gapCandidates.slice(0, 2).map((g) => ({ reason: safeText(g.reason), ...compactSite(g.site) })),
    handlers: handlerCandidates.filter((h) => !h.target || ids.has(symbols.get(h.target)!.site.file)).slice(0, 2).map((h) => ({ route: { method: safeText(snapshot.routes[h.route].method), pattern: safeText(snapshot.routes[h.route].pattern) }, target: h.target ? { name: safeText(symbols.get(h.target)!.name), ...compactSite(symbols.get(h.target)!.site) } : null, reason: h.reason ? safeText(h.reason) : null, ...compactSite(h.site) })),
  };
  const evidence = { version: 2, task: selection.kind, goal: selection.kind === "investigation" ? (selection.query.operation === "ask" ? { intent: selection.query.intent, target: safeText(selection.query.target), depth: selection.query.depth, budget: selection.query.budget } : { scope: selection.query.scope, text: safeText(selection.query.text), budget: selection.query.budget }) : { path: safeText(selection.path) }, adapter: snapshot.adapter, files, edges, routes: declarations, behavior: rich,
    omissions: { files: paths.length - chosen.length, edges: relationships.length - edges.length, routes: routes.length - declarations.length },
    coverage: snapshot.coverage.files, imports: snapshot.coverage.relationships,
    investigation: answer ? { message: answer.message, beyondDepth: answer.beyondDepth, beyondBudget: answer.beyondBudget } : null,
    behaviorOmissions: { symbols: 0, relations: 0, gaps: 0, handlers: 0 },
    limits: "File imports are not calls or execution flow. Included direct calls are verified static possibilities, never temporal order or guaranteed execution. Receiver/DI dispatch is unresolved. External/excluded/unresolved and omitted evidence cannot prove absence. No source contents included." };
  function omissions() { evidence.behaviorOmissions = { symbols: symbolCandidates.length - rich.symbols.length, relations: relationCandidates.length - rich.relations.length, gaps: gapCandidates.length - rich.gaps.length, handlers: handlerCandidates.length - rich.handlers.length }; }
  omissions();
  // Preserve the existing 6KB bound, sacrificing optional metadata explicitly.
  while (Buffer.byteLength(JSON.stringify(evidence)) > 6000 && (rich.symbols.length || rich.relations.length || rich.gaps.length || rich.handlers.length)) {
    if (rich.relations.length) rich.relations.pop(); else if (rich.symbols.length) rich.symbols.pop(); else if (rich.gaps.length) rich.gaps.pop(); else rich.handlers.pop();
    omissions();
  }
  // Dense files can exceed the budget even without behavioral metadata.
  // Retain the selected file and report every reduction; never raise the cap.
  while (Buffer.byteLength(JSON.stringify(evidence)) > 6000) {
    if (edges.length) edges.pop();
    else if (declarations.length) declarations.pop();
    else {
      const exported = files.findLast((f) => f.exports.length > 0);
      if (exported) { exported.exports.pop(); exported.exportsOmitted++; }
      else {
        const index = files.findLastIndex((f) => selection.kind !== "file" || f.path !== selection.path);
        if (index < 0 || files.length <= 1) break;
        files.splice(index, 1);
      }
    }
    evidence.omissions = { files: paths.length - files.length, edges: relationships.length - edges.length, routes: routes.length - declarations.length };
  }
  const payload = JSON.stringify(evidence);
  if (Buffer.byteLength(payload) > 6000) throw new Error("Selected evidence exceeds explanation budget; select a smaller scope");
  return { payload, digest: createHash("sha256").update(payload).digest("hex"), ids: [...files, ...edges, ...declarations].map((e) => e.id), files: files.map((f) => f.path) };
}

