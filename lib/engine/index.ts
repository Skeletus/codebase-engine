import { createHash } from "node:crypto";
import path from "node:path";
import { lstatSync, realpathSync } from "node:fs";
import { adjacency, reach } from "../graph/reach.ts";
import { RepositoryReader } from "../repository/read-policy.ts";
import { validateSnapshot } from "./contract.ts";
import type { CodeSnapshot, LanguageAdapter, StructuralQuery, StructuralResult } from "./types.ts";
import type { Witness } from "../model/framework.ts";
import { normalizeRange, decodeSource } from "../model/positions.ts";

/** No cloud/persistence/provider capability belongs to this local interface. */
export function analyzeLocalRepository(directory: string, adapter: LanguageAdapter): CodeSnapshot {
  return validateSnapshot(adapter.analyze(directory));
}

export function queryStructure(snapshot: CodeSnapshot, query: StructuralQuery): StructuralResult {
  const checked = validateSnapshot(snapshot);
  if (!checked.files.some((f) => f.id === query.file)) throw new Error("Unknown snapshot file");
  if (query.direction !== "dependencies" && query.direction !== "dependents") throw new Error("Invalid query direction");
  if (query.depth !== undefined && (!Number.isSafeInteger(query.depth) || query.depth < 0 || query.depth > 64)) throw new Error("Query depth must be between 0 and 64");
  return reach(adjacency(checked.relationships), query.file, query.direction, query.depth);
}

export function readEvidence(snapshot: CodeSnapshot, fileId: string): { state: "current"; source: string } | { state: "stale" | "unavailable" } {
  const checked = validateSnapshot(snapshot);
  const file = checked.analysis.resources.find((f) => f.path === fileId);
  if (!file) throw new Error("Unknown snapshot file");
  try {
    if (path.toNamespacedPath(realpathSync.native(checked.origin.root)) !== path.toNamespacedPath(checked.origin.root)) return { state: "unavailable" };
    const reader = new RepositoryReader(checked.origin.root, {}, checked.origin.root);
    for (const d of checked.diagnostics) if (d.category === "excluded-directory") reader.exclude(d.path);
    const bytes = reader.read(path.resolve(reader.root, file.path), file.purpose === "framework-input" ? "source" : file.purpose);
    if (createHash("sha256").update(bytes).digest("hex") !== file.hash) return { state: "stale" };
    if (file.encoding === "binary") return { state: "unavailable" };
    return { state: "current", source: file.encoding === "utf8" ? decodeSource(bytes) : bytes.toString("utf8") };
  } catch {
    // A deleted file/root is stale evidence, not proof that the relationship
    // disappeared. Do not read contents outside the repository policy.
    try { lstatSync(path.resolve(checked.origin.root, file.path)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT" || (error as NodeJS.ErrnoException).code === "ENOTDIR") return { state: "stale" }; }
    return { state: "unavailable" };
  }
}

/** Every composed witness is independently checked; no durable source archive. */
export function readWitnessEvidence(snapshot: CodeSnapshot, witness: Witness): { state: "current"; source: string; start: number; end: number } | { state: "stale" | "unavailable" | "rule" } {
  const checked = validateSnapshot(snapshot);
  const witnesses = [...checked.analysis.variants.flatMap(v => v.configWitnesses), ...checked.analysis.registrations.flatMap(r => [...r.witnesses, ...r.prefixWitnesses]), ...checked.analysis.bindings.flatMap(b => b.witnesses), ...checked.analysis.candidates.flatMap(c => c.witnesses), ...(checked.analysis.developmentProxies ?? []).flatMap(p=>p.witnesses)];
  const same = witnesses.some(w => JSON.stringify(Object.entries(w).sort()) === JSON.stringify(Object.entries(witness).sort()));
  if (!same) throw new Error("Unknown snapshot witness");
  if (witness.role === "framework-rule") return { state: "rule" };
  const result = readEvidence(checked, witness.site.file);
  if (result.state !== "current") return result;
  try { const range = normalizeRange(result.source, witness.site.start, witness.site.end, "utf16"); if (range.line !== witness.site.line || range.endLine !== witness.site.endLine) return { state: "unavailable" }; return { ...result, start: range.start, end: range.end }; } catch { return { state: "unavailable" }; }
}
