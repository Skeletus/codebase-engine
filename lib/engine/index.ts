import { createHash } from "node:crypto";
import path from "node:path";
import { lstatSync, realpathSync } from "node:fs";
import { adjacency, reach } from "../graph/reach.ts";
import { RepositoryReader } from "../repository/read-policy.ts";
import { validateSnapshot } from "./contract.ts";
import type { CodeSnapshot, LanguageAdapter, StructuralQuery, StructuralResult } from "./types.ts";

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
  const file = checked.files.find((f) => f.id === fileId);
  if (!file) throw new Error("Unknown snapshot file");
  try {
    if (path.toNamespacedPath(realpathSync.native(checked.origin.root)) !== path.toNamespacedPath(checked.origin.root)) return { state: "unavailable" };
    const reader = new RepositoryReader(checked.origin.root);
    for (const d of checked.diagnostics) if (d.category === "excluded-directory") reader.exclude(d.path);
    const bytes = reader.read(path.resolve(reader.root, file.path), "source");
    if (createHash("sha256").update(bytes).digest("hex") !== file.hash) return { state: "stale" };
    return { state: "current", source: bytes.toString("utf8") };
  } catch {
    // A deleted file/root is stale evidence, not proof that the relationship
    // disappeared. Do not read contents outside the repository policy.
    try { lstatSync(path.resolve(checked.origin.root, file.path)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT" || (error as NodeJS.ErrnoException).code === "ENOTDIR") return { state: "stale" }; }
    return { state: "unavailable" };
  }
}
