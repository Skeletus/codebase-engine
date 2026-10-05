import type { CodeSnapshot } from "./types.ts";
import type { SymbolRelation } from "../model/behavior.ts";

/** Static reachability, never execution order. All returned edges are canonical. */
export function traceCalls(snapshot: CodeSnapshot, target: string, depth = 8, budget = 100) {
  if (!Number.isInteger(depth) || depth < 0 || depth > 32 || !Number.isInteger(budget) || budget < 1 || budget > 200) throw new Error("Trace limits: depth 0–32, budget 1–200");
  const entities = new Map(snapshot.behavior.declarations.map((d) => [d.id, d]));
  if (!entities.get(target)?.callable) throw new Error("Choose a callable declaration from this snapshot");
  const outgoing = new Map<string, SymbolRelation[]>();
  for (const r of snapshot.behavior.relations) if (r.relation === "calls" && r.source) {
    const list = outgoing.get(r.source) ?? []; list.push(r); outgoing.set(r.source, list);
  }
  for (const list of outgoing.values()) list.sort((a, b) => a.site.file.localeCompare(b.site.file) || a.site.start - b.site.start);
  const distance = new Map([[target, 0]]), queue = [target], calls: SymbolRelation[] = [];
  let beyondDepth = 0, beyondBudget = 0, repeatedTargets = 0;
  for (let i = 0; i < queue.length; i++) for (const r of outgoing.get(queue[i]) ?? []) {
    if (distance.get(queue[i])! >= depth) { beyondDepth++; continue; }
    if (calls.length >= budget || (!distance.has(r.target) && queue.length >= budget)) { beyondBudget++; continue; }
    calls.push(r);
    if (distance.has(r.target)) repeatedTargets++;
    else { distance.set(r.target, distance.get(queue[i])! + 1); queue.push(r.target); }
  }
  const visited = new Set(queue), files = new Set(queue.map((id) => entities.get(id)!.site.file));
  const gaps = snapshot.behavior.gaps.filter((g) => g.source ? visited.has(g.source) : files.has(g.site.file));
  // Verified file dependencies provide witness paths for convention test files.
  // Naming alone never adds a candidate or establishes TESTS/coverage semantics.
  const predecessor = new Map<string, string | null>([[entities.get(target)!.site.file, null]]);
  const fileQueue = [...predecessor.keys()], incoming = new Map<string, CodeSnapshot["relationships"]>();
  for (const edge of snapshot.relationships) { const list = incoming.get(edge.target) ?? []; list.push(edge); incoming.set(edge.target, list); }
  let testSearchTruncated = false;
  for (let i = 0; i < fileQueue.length; i++) for (const edge of incoming.get(fileQueue[i]) ?? []) if (!predecessor.has(edge.source)) {
    if (fileQueue.length >= 200) { testSearchTruncated = true; continue; }
    predecessor.set(edge.source, edge.id); fileQueue.push(edge.source);
  }
  const byEdge = new Map(snapshot.relationships.map((r) => [r.id, r]));
  const testReferences = new Map<string, string[]>();
  for (const r of snapshot.behavior.relations) if (visited.has(r.target)) {
    const list = testReferences.get(r.site.file) ?? []; list.push(r.id); testReferences.set(r.site.file, list);
  }
  const testCandidates = snapshot.files.filter((f) => f.role === "test").flatMap((f) => {
    const references = testReferences.get(f.path) ?? [];
    const dependencyPath: string[] = []; let cursor = f.path;
    while (predecessor.get(cursor)) { const id = predecessor.get(cursor)!; dependencyPath.push(id); cursor = byEdge.get(id)!.target; }
    return references.length || dependencyPath.length ? [{ file: f.path, references: references.slice(0, 10), referencesOmitted: Math.max(0, references.length - 10), dependencyPath }] : [];
  });
  return {
    declarations: queue.map((id) => entities.get(id)!), calls,
    gaps: gaps.slice(0, budget), gapsOmitted: Math.max(0, gaps.length - budget),
    beyondDepth, beyondBudget, repeatedTargets,
    testCandidates: testCandidates.slice(0, budget), testsOmitted: Math.max(0, testCandidates.length - budget), testSearchTruncated,
  };
}
