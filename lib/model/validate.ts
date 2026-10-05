import type { Behavior, Site } from "./behavior.ts";
export function validateBehavior(value: unknown, files: { path: string; hash: string; lines: number; bytes: number }[], routeFiles: string[]): Behavior {
  function record(v: unknown): Record<string, unknown> { if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("Invalid symbol evidence object"); return Object.fromEntries(Object.entries(v)); }
  function list(v: unknown): unknown[] { if (!Array.isArray(v)) throw new Error("Invalid symbol evidence array"); return v; }
  function text(v: unknown): string { if (typeof v !== "string" || !v || v.includes("\0")) throw new Error("Invalid symbol evidence string"); return v; }
  function integer(v: unknown): number { if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 0) throw new Error("Invalid symbol evidence number"); return v; }
  function bool(v: unknown): boolean { if (typeof v !== "boolean") throw new Error("Invalid symbol evidence flag"); return v; }
  const byFile = new Map(files.map((f) => [f.path, f]));
  function site(v: unknown): Site {
    const s = record(v), file = text(s.file), f = byFile.get(file);
    const start = integer(s.start), end = integer(s.end), line = integer(s.line), endLine = integer(s.endLine);
    if (!f || s.fileHash !== f.hash || s.evidenceKind !== "verified" || !line || endLine < line || endLine > f.lines || end <= start || end > f.bytes) throw new Error("Symbol evidence range/hash does not match file");
    return { file, start, end, line, endLine, fileHash: f.hash, extractor: text(s.extractor), evidenceKind: "verified" };
  }
  const b = record(value);
  const declarations: Behavior["declarations"] = list(b.declarations).map((v) => {
    const d = record(v), kind = d.kind;
    if (kind !== "function" && kind !== "method" && kind !== "class" && kind !== "value" && kind !== "parameter") throw new Error("Invalid declaration kind");
    return { id: text(d.id), name: text(d.name), kind, callable: bool(d.callable), site: site(d.site) };
  });
  const entities = new Map(declarations.map((d) => [d.id, d]));
  if (entities.size !== declarations.length) throw new Error("Duplicate declaration identity");
  for (const d of declarations) if (d.id !== JSON.stringify([d.site.file, d.site.start, d.kind])) throw new Error("Declaration identity does not match source provenance");
  const source = (v: unknown) => { if (v === null) return null; const id = text(v); if (!entities.get(id)?.callable) throw new Error("Unknown/non-callable symbol owner"); return id; };
  const relations: Behavior["relations"] = list(b.relations).map((v) => {
    const r = record(v), relation = r.relation;
    if (relation !== "references" && relation !== "calls") throw new Error("Unsupported symbol relation");
    const target = text(r.target);
    if (!entities.has(target) || (relation === "calls" && !entities.get(target)?.callable)) throw new Error("Dangling/non-callable symbol target");
    return { id: text(r.id), source: source(r.source), target, relation, conditional: bool(r.conditional), site: site(r.site) };
  });
  if (new Set(relations.map((r) => r.id)).size !== relations.length) throw new Error("Duplicate symbol relationship");
  for (const r of relations) if (r.id !== JSON.stringify([r.site.file, r.site.start, r.relation])) throw new Error("Relationship identity does not match source provenance");
  function owned(source: string | null, location: Site) {
    const owner = source ? entities.get(source) : null;
    if (owner && (owner.site.file !== location.file || owner.site.start > location.start || owner.site.end < location.end)) throw new Error("Symbol relationship provenance disagrees with owner");
  }
  for (const r of relations) owned(r.source, r.site);
  const gaps = list(b.gaps).map((v) => { const g = record(v); return { source: source(g.source), reason: text(g.reason), site: site(g.site) }; });
  for (const g of gaps) owned(g.source, g.site);
  const handlers = list(b.handlers).map((v) => {
    const h = record(v), route = integer(h.route), target = h.target === null ? null : text(h.target), reason = h.reason === null ? null : text(h.reason), location = site(h.site);
    if (routeFiles[route] !== location.file || (target !== null && (!entities.get(target)?.callable || reason !== null)) || (target === null && reason === null)) throw new Error("Invalid route handler binding");
    return { route, target, reason, site: location };
  });
  if (handlers.length !== routeFiles.length || new Set(handlers.map((h) => h.route)).size !== handlers.length) throw new Error("Missing/duplicate route handler outcome");
  if (declarations.length + relations.length + gaps.length > 200000) throw new Error("Symbol evidence budget exceeded");
  return { declarations, relations, gaps, handlers };
}
