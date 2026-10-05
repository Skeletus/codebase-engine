import type { CodeSnapshot } from "./types.ts";

export const INTENTS = ["dependencies", "dependents", "trace", "routes", "exports", "unsupported"] as const;
export type Intent = (typeof INTENTS)[number];
export type Investigation = { operation: "search"; text: string; scope: "all" | "paths" | "exports" | "entries"; budget: number }
  | { operation: "ask"; intent: Intent; target: string; depth: number; budget: number };
export type InvestigationResult = {
  state: "ok" | "ambiguous" | "unknown" | "unsupported";
  message: string;
  target: string | null;
  candidates: string[];
  rows: { file: string; distance: number; witness: string[] }[];
  routeIndices: number[];
  exportFiles: string[];
  beyondDepth: number;
  beyondBudget: number;
  boundaryIndices: number[];
  boundariesOmitted: number;
};
const ENTRY_ROLES = new Set(["page-route", "api-endpoint", "server-action", "router", "controller", "resolver", "gateway", "middleware", "instrumentation"]);
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected investigation object");
  return Object.fromEntries(Object.entries(value));
}
function exact(value: Record<string, unknown>, keys: string[]) {
  if (Object.keys(value).length !== keys.length || keys.some((key) => !(key in value))) throw new Error("Unexpected investigation fields");
}
function text(value: unknown, limit = 256): string { if (typeof value !== "string" || value.length > limit || value.includes("\0")) throw new Error("Invalid investigation text"); return value; }
function integer(value: unknown, maximum: number): number { if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > maximum) throw new Error("Invalid investigation limit"); return value; }
export function validateInvestigation(value: unknown): Investigation {
  const q = object(value);
  const budget = integer(q.budget, 200);
  if (!budget) throw new Error("Investigation budget must be positive");
  if (q.operation === "search") {
    exact(q, ["operation", "text", "scope", "budget"]);
    if (q.scope !== "all" && q.scope !== "paths" && q.scope !== "exports" && q.scope !== "entries") throw new Error("Invalid search scope");
    return { operation: q.operation, text: text(q.text), scope: q.scope, budget };
  }
  exact(q, ["operation", "intent", "target", "depth", "budget"]);
  if (q.operation !== "ask" || !INTENTS.some((intent) => intent === q.intent)) throw new Error("Invalid structural intent");
  return { operation: q.operation, intent: q.intent as Intent, target: text(q.target, 4096), depth: integer(q.depth, 64), budget };
}
function strings(value: unknown, limit: number): string[] {
  if (!Array.isArray(value) || value.length > limit || !value.every((v) => typeof v === "string" && v.length <= 16400)) throw new Error("Invalid investigation references");
  return value.map((v) => String(v));
}
function indices(value: unknown, limit: number): number[] {
  if (!Array.isArray(value) || value.length > limit) throw new Error("Invalid evidence indices");
  return value.map((v) => integer(v, 1000000));
}
export function validateInvestigationResult(value: unknown): InvestigationResult {
  const r = object(value);
  exact(r, ["state", "message", "target", "candidates", "rows", "routeIndices", "exportFiles", "beyondDepth", "beyondBudget", "boundaryIndices", "boundariesOmitted"]);
  if (r.state !== "ok" && r.state !== "ambiguous" && r.state !== "unknown" && r.state !== "unsupported") throw new Error("Invalid investigation state");
  if (typeof r.message !== "string" || r.message.length > 1024 || (r.target !== null && typeof r.target !== "string")) throw new Error("Invalid investigation summary");
  if (!Array.isArray(r.rows) || r.rows.length > 200) throw new Error("Invalid investigation rows");
  const rows = r.rows.map((value) => { const row = object(value); exact(row, ["file", "distance", "witness"]); const [file] = strings([row.file], 1); return { file, distance: integer(row.distance, 64), witness: strings(row.witness, 64) }; });
  return { state: r.state, message: r.message, target: r.target, candidates: strings(r.candidates, 200), rows,
    routeIndices: indices(r.routeIndices, 200), exportFiles: strings(r.exportFiles, 200), beyondDepth: integer(r.beyondDepth, 1000000), beyondBudget: integer(r.beyondBudget, 1000000), boundaryIndices: indices(r.boundaryIndices, 100), boundariesOmitted: integer(r.boundariesOmitted, 1000000) };
}
function compare(a: string, b: string) { return a < b ? -1 : a > b ? 1 : 0; }
/** Pure retrieval over canonical evidence, independent of canvas/layout and language. */
export function investigate(snapshot: CodeSnapshot, input: Investigation): InvestigationResult {
  const q = validateInvestigation(input);
  const result: InvestigationResult = { state: "ok", message: "", target: null, candidates: [], rows: [], routeIndices: [], exportFiles: [], beyondDepth: 0, beyondBudget: 0,
    boundaryIndices: snapshot.diagnostics.slice(0, 100).map((_, i) => i), boundariesOmitted: Math.max(0, snapshot.diagnostics.length - 100) };
  const files = [...snapshot.files].sort((a, b) => compare(a.id, b.id));
  if (q.operation === "search") {
    const needle = q.text.trim().toLowerCase(), routeFiles = new Set(snapshot.routes.map((r) => r.file));
    const found = files.filter((f) => {
      const entry = routeFiles.has(f.id) || ENTRY_ROLES.has(f.role ?? "");
      if (q.scope === "entries" && !entry) return false;
      return q.scope === "exports" ? f.exports.some((name) => name.toLowerCase().includes(needle))
        : f.path.toLowerCase().includes(needle) || (q.scope === "all" && f.exports.some((name) => name.toLowerCase().includes(needle)));
    });
    result.candidates = found.slice(0, q.budget).map((f) => f.id);
    result.beyondBudget = Math.max(0, found.length - q.budget);
    result.message = `${found.length} matching snapshot files. Entry points are adapter conventions or route declarations; search does not establish relationships.`;
    return result;
  }
  if (q.intent === "unsupported") { result.state = "unsupported"; result.message = "Supported intents are dependencies, dependents, dependency traces, routes and export names. Execution flow, runtime calls and unrestricted natural-language questions are not supported."; return result; }
  const target = q.target.trim();
  if (target) {
    const exact = files.find((f) => f.id === target);
    const matches = exact ? [exact] : files.filter((f) => f.path.split("/").at(-1) === target || f.exports.includes(target));
    if (matches.length !== 1) {
      result.state = matches.length ? "ambiguous" : "unknown";
      result.candidates = matches.slice(0, q.budget).map((f) => f.id);
      result.beyondBudget = Math.max(0, matches.length - q.budget);
      result.message = matches.length ? "Several files match. Select an exact snapshot path; no target was chosen automatically." : "No known snapshot file matches. Inspect coverage before concluding a file is absent.";
      return result;
    }
    result.target = matches[0].id;
  }
  if (q.intent === "routes") {
    const routes = snapshot.routes.map((r, i) => ({ r, i })).filter(({ r }) => !result.target || r.file === result.target);
    result.routeIndices = routes.slice(0, q.budget).map(({ i }) => i); result.beyondBudget = Math.max(0, routes.length - q.budget);
    result.message = `${routes.length} route declarations in this snapshot selection. A route declaration does not prove a request or handler execution path.`; return result;
  }
  if (q.intent === "exports") {
    const exported = files.filter((f) => (!result.target || f.id === result.target) && f.exports.length);
    result.exportFiles = exported.slice(0, q.budget).map((f) => f.id); result.beyondBudget = Math.max(0, exported.length - q.budget);
    result.message = `${exported.length} files with reported export names. These are names, not recovered symbol references or calls.`; return result;
  }
  if (!result.target) { result.state = "unknown"; result.message = "Select a snapshot file for this investigation."; return result; }
  const incoming = q.intent === "dependents";
  const adjacent = new Map<string, { file: string; edge: string }[]>();
  for (const edge of [...snapshot.relationships].sort((a, b) => compare(a.id, b.id))) {
    const from = incoming ? edge.target : edge.source, to = incoming ? edge.source : edge.target;
    const list = adjacent.get(from) ?? []; list.push({ file: to, edge: edge.id }); adjacent.set(from, list);
  }
  for (const list of adjacent.values()) list.sort((a, b) => compare(a.file, b.file) || compare(a.edge, b.edge));
  const queue = [result.target], distance = new Map([[result.target, 0]]), parent = new Map<string, { file: string; edge: string }>();
  for (let i = 0; i < queue.length; i++) {
    const current = queue[i];
    for (const next of adjacent.get(current) ?? []) if (!distance.has(next.file)) {
      distance.set(next.file, distance.get(current)! + 1); parent.set(next.file, { file: current, edge: next.edge }); queue.push(next.file);
    }
  }
  const reachable = queue.slice(1).filter((file) => distance.get(file)! <= q.depth);
  result.beyondDepth = queue.length - 1 - reachable.length;
  result.beyondBudget = Math.max(0, reachable.length - q.budget);
  result.rows = reachable.slice(0, q.budget).map((file) => {
    const witness: string[] = []; let current = file;
    while (current !== result.target) { const step = parent.get(current)!; witness.push(step.edge); current = step.file; }
    // Incoming walks are returned in import direction: dependent -> changed file.
    if (!incoming) witness.reverse();
    return { file, distance: distance.get(file)!, witness };
  });
  result.message = `${queue.length - 1} transitive ${incoming ? "dependents" : "dependencies"} in the verified file graph. Shortest dependency witnesses include type-only edges. This is compile-time structure, not runtime execution; the starting file is not counted again through cycles.`;
  return result;
}
/** Reject references that would turn malformed IPC output into structural claims. */
export function verifyInvestigation(snapshot: CodeSnapshot, query: Investigation, value: unknown): InvestigationResult {
  const result = validateInvestigationResult(value);
  // Recompute only to verify the canonical answer, never from canvas state.
  if (JSON.stringify(result) !== JSON.stringify(investigate(snapshot, query))) throw new Error("Investigation response does not match snapshot evidence");
  return result;
}
