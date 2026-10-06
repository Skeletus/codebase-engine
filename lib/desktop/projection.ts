import type { CodeSnapshot } from "../engine/types.ts";
import { EDGE_KINDS, type ParsedFile, type Edge, type Coverage } from "../parser/types.ts";
import { ROLE_IDS } from "../roles.ts";

/** Preserve the canvas's existing file/import projection without guessing
 * how a future adapter's relationship should look in this TS/JS-only view. */
export function projectSnapshot(snapshot: CodeSnapshot) {
  const files: ParsedFile[] = snapshot.files.map((f) => {
    if (f.role !== null && !ROLE_IDS.includes(f.role as ParsedFile["role"] & string)) throw new Error("Unsupported role projection");
    return { ...f, role: f.role as ParsedFile["role"] };
  });
  const edges: Edge[] = snapshot.relationships.map((r) => {
    if (!EDGE_KINDS.includes(r.syntax as Edge["kind"])) throw new Error("Unsupported relationship projection");
    return { source: r.source, target: r.target, kind: r.syntax as Edge["kind"], typeOnly: r.typeOnly, specifier: r.evidence.description, line: r.evidence.line };
  });
  const routeCoverage: Coverage["routes"] = {
    omitted: snapshot.diagnostics.filter((d) => d.category === "omitted-route").map((d) => ({ file: d.path, line: d.line ?? 1, reason: d.reason })),
    withheld: snapshot.diagnostics.filter((d) => d.category === "withheld-routes").map((d) => ({ project: d.path, reason: d.reason })),
  };
  return { files, edges, routeCoverage, routes: snapshot.routes.map((r) => ({ file: r.file, method: r.method, pattern: r.pattern, line: r.evidence.line })) };
}

/** Presentation-only: these records never enter the canvas/import projection. */
export function projectAnalysis(snapshot: CodeSnapshot) {
  return {
    status: snapshot.analysis.status,
    capabilities: snapshot.analysis.capabilities,
    variants: snapshot.analysis.variants,
    registrations: snapshot.analysis.registrations.map(r => ({ id: r.id, kind: r.kind, pattern: r.rawPattern, method: r.methodState === null ? "navigation" : r.methodState.state === "known" ? r.methodState.values.join(", ") : r.methodState.state, matcher: r.matcher.state, variantId: r.variantId, witnesses: r.witnesses, gapIds: r.gapIds })),
    gaps: snapshot.analysis.gaps,
    bindings: snapshot.analysis.bindings,
    candidates: snapshot.analysis.candidates,
    assumptions: snapshot.analysis.assumptions.map(a => ({ ...a, label: "User assumption" })),
  };
}
