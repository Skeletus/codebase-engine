import { SNAPSHOT_VERSION, type CodeSnapshot, type OutcomeCounts, type Evidence } from "./types.ts";

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected snapshot object");
  return Object.fromEntries(Object.entries(value));
}
function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error("Expected snapshot array");
  return value;
}
function string(value: unknown): string {
  if (typeof value !== "string") throw new Error("Expected snapshot string");
  return value;
}
function count(value: unknown): number {
  if (!Number.isSafeInteger(value) || typeof value !== "number" || value < 0) throw new Error("Expected nonnegative snapshot count");
  return value;
}
function nullable(value: unknown): string | null { return value === null ? null : string(value); }
function relative(value: unknown): string {
  const p = string(value);
  if (!p || p.startsWith("/") || p.includes("\\") || p.includes(":") || p.split("/").some((s) => !s || s === "..") || (p !== "." && p.split("/").includes("."))) {
    throw new Error("Invalid repository-relative snapshot path");
  }
  return p;
}
function hash(value: unknown): string {
  const h = string(value);
  if (!/^[a-f0-9]{64}$/.test(h)) throw new Error("Invalid snapshot file hash");
  return h;
}
function counts(value: unknown): OutcomeCounts {
  const o = object(value);
  const result = { seen: count(o.seen), internal: count(o.internal), external: count(o.external), excluded: count(o.excluded), unresolved: count(o.unresolved) };
  if (result.seen !== result.internal + result.external + result.excluded + result.unresolved) throw new Error("Snapshot outcome counts disagree");
  return result;
}
function numbers(value: unknown): Record<string, number> {
  return Object.fromEntries(Object.entries(object(value)).map(([k, v]) => [k, count(v)]));
}
function evidence(value: unknown): Evidence {
  const o = object(value);
  if (o.evidenceKind !== "verified" || o.occurrence !== "first") throw new Error("Unsupported snapshot evidence");
  const line = count(o.line);
  if (line === 0) throw new Error("Evidence line must be positive");
  return { file: relative(o.file), line, fileHash: hash(o.fileHash), extractor: string(o.extractor), evidenceKind: o.evidenceKind, occurrence: o.occurrence, description: string(o.description) };
}

export function validateSnapshot(value: unknown): CodeSnapshot {
  const o = object(value);
  if (o.version !== SNAPSHOT_VERSION) throw new Error(`Unsupported snapshot version: ${String(o.version)}`);
  const origin = object(o.origin);
  if (origin.kind !== "local") throw new Error("Only local snapshots belong to the local engine");
  const adapter = object(o.adapter);
  const coverage = object(o.coverage);
  const files = object(coverage.files);
  const snapshot: CodeSnapshot = {
    version: SNAPSHOT_VERSION,
    origin: { kind: "local", root: string(origin.root) },
    adapter: { id: string(adapter.id), version: count(adapter.version) },
    projects: array(o.projects).map((v) => { const p = object(v); return { path: relative(p.path), extractor: string(p.extractor) }; }),
    files: array(o.files).map((v) => {
      const f = object(v);
      return { id: relative(f.id), path: relative(f.path), module: relative(f.module), hash: hash(f.hash), lines: count(f.lines), bytes: count(f.bytes), fanIn: count(f.fanIn), fanOut: count(f.fanOut), role: nullable(f.role), reachedBy: nullable(f.reachedBy), exports: array(f.exports).map(string) };
    }),
    relationships: array(o.relationships).map((v) => {
      const r = object(v);
      if (r.relation !== "imports" || typeof r.typeOnly !== "boolean") throw new Error("Unsupported snapshot relationship");
      return { id: string(r.id), source: relative(r.source), target: relative(r.target), relation: r.relation, typeOnly: r.typeOnly, syntax: string(r.syntax), evidence: evidence(r.evidence) };
    }),
    routes: array(o.routes).map((v) => { const r = object(v); return { file: relative(r.file), method: string(r.method), pattern: string(r.pattern), evidence: evidence(r.evidence) }; }),
    coverage: {
      files: { found: count(files.found), parsed: count(files.parsed), skipped: count(files.skipped) },
      relationships: counts(coverage.relationships),
      bySyntax: Object.fromEntries(Object.entries(object(coverage.bySyntax)).map(([k, v]) => [k, counts(v)])),
      external: numbers(coverage.external), excluded: numbers(coverage.excluded), unresolved: numbers(coverage.unresolved),
    },
    diagnostics: array(o.diagnostics).map((v) => {
      const d = object(v);
      return { path: relative(d.path), category: string(d.category), reason: string(d.reason), detail: string(d.detail), ...(d.line === undefined ? {} : { line: count(d.line) }) };
    }),
  };
  const byId = new Map(snapshot.files.map((f) => [f.id, f]));
  if (byId.size !== snapshot.files.length || snapshot.files.some((f) => f.id !== f.path)) throw new Error("Duplicate or inconsistent snapshot file identity");
  const relationIds = new Set(snapshot.relationships.map((r) => r.id));
  if (relationIds.size !== snapshot.relationships.length) throw new Error("Duplicate snapshot relationship");
  const checkEvidence = (e: ReturnType<typeof evidence>) => {
    const f = byId.get(e.file);
    if (!f || f.hash !== e.fileHash || e.line > f.lines || !e.extractor) throw new Error("Snapshot evidence does not match its file");
  };
  for (const r of snapshot.relationships) {
    if (!byId.has(r.source) || !byId.has(r.target) || r.evidence.file !== r.source) throw new Error("Dangling snapshot relationship");
    checkEvidence(r.evidence);
  }
  for (const r of snapshot.routes) {
    if (r.file !== r.evidence.file || !r.pattern.startsWith("/") || !/^[A-Z]+$/.test(r.method)) throw new Error("Invalid route declaration");
    checkEvidence(r.evidence);
  }
  const c = snapshot.coverage.files;
  if (c.parsed !== snapshot.files.length || c.found !== c.parsed + c.skipped || c.skipped !== snapshot.diagnostics.filter((d) => d.category === "skipped-file").length) throw new Error("Snapshot file coverage disagrees");
  if (snapshot.projects[0]?.path !== ".") throw new Error("Snapshot has no root project");
  if (snapshot.coverage.relationships.unresolved !== snapshot.diagnostics.filter((d) => d.category === "unresolved-import").length) throw new Error("Snapshot unresolved coverage disagrees");
  return snapshot;
}

export function serializeSnapshot(snapshot: CodeSnapshot): string { return `${JSON.stringify(validateSnapshot(snapshot), null, 2)}\n`; }
export function deserializeSnapshot(text: string): CodeSnapshot { return validateSnapshot(JSON.parse(text)); }
