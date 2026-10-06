import { extractBehavior } from "../../parser/behavior.ts";
import type { Behavior } from "../../model/behavior.ts";
import { createSyntaxSession, parseSelection, selectFiles, type Selection } from "../../parser/index.ts";
import { validateParseResult } from "../../parser/contract.ts";
import { validateSnapshot } from "../contract.ts";
import { legacyObservations } from "../compatibility.ts";
import type { LegacySnapshot } from "../types.ts";
import { SNAPSHOT_VERSION, type CodeSnapshot, type Evidence, type LanguageAdapter } from "../types.ts";

export const typescriptAdapter: LanguageAdapter = {
  id: "typescript-javascript",
  analyze: analyzeTypescript,
};
function analyzeTypescript(directory: string, onProgress?: (stage: "parse") => void, selection: Selection = selectFiles(directory), session?: ReturnType<typeof createSyntaxSession>): CodeSnapshot {
    onProgress?.("parse");
    let behavior: Behavior | undefined;
    const parsed = validateParseResult(parseSelection(selection, (sources, resolver, routes) => { behavior = extractBehavior(sources, resolver, routes); }, session));
    if (!behavior) throw new Error("Missing static symbol analysis");
    const byPath = new Map(parsed.files.map((f) => [f.path, f]));
    const evidence = (file: string, line: number, extractor: string, description: string): Evidence => {
      const f = byPath.get(file);
      if (!f) throw new Error("Extractor evidence names an unknown file");
      return { file, line, fileHash: f.hash, extractor, evidenceKind: "verified", occurrence: "first", description };
    };
    const snapshot: LegacySnapshot = {
      behavior,
      version: 2, origin: { kind: "local", root: parsed.root },
      adapter: { id: "typescript-javascript", version: parsed.schemaVersion },
      projects: parsed.projects.map((p) => ({ path: p.path, extractor: p.adapter })),
      files: parsed.files.map((f) => ({ id: f.path, ...f })),
      relationships: parsed.edges.map((e) => ({
        id: JSON.stringify([e.source, e.target, e.kind]), source: e.source, target: e.target,
        relation: "imports", typeOnly: e.typeOnly, syntax: e.kind,
        evidence: evidence(e.source, e.line, "typescript-javascript/imports", e.specifier),
      })),
      routes: parsed.routes.map((r) => {
        const project = [...parsed.projects].filter((p) => p.path === "." || r.file.startsWith(`${p.path}/`)).sort((a, b) => b.path.length - a.path.length)[0];
        return { file: r.file, method: r.method, pattern: r.pattern, evidence: evidence(r.file, r.line, `typescript-javascript/${project.adapter}/routes`, `${r.method} ${r.pattern}`) };
      }),
      coverage: {
        files: { found: parsed.coverage.files.found, parsed: parsed.coverage.files.parsed, skipped: parsed.coverage.files.skipped },
        relationships: parsed.coverage.imports.total, bySyntax: parsed.coverage.imports.byKind,
        external: parsed.coverage.imports.external, excluded: parsed.coverage.imports.excluded, unresolved: parsed.coverage.imports.unresolvedByReason,
      },
      diagnostics: [
        ...parsed.coverage.files.skippedFiles.map((f) => ({ path: f.path, category: "skipped-file", reason: f.reason, detail: f.detail })),
        ...parsed.coverage.files.excludedDirectories.map((d) => ({ path: d.path, category: "excluded-directory", reason: d.reason, detail: d.reason })),
        ...parsed.coverage.imports.unresolved.map((u) => ({ path: u.from, line: u.line, category: "unresolved-import", reason: u.reason, detail: `${u.kind} ${u.specifier}: ${u.detail}` })),
        ...parsed.coverage.routes.omitted.map((r) => ({ path: r.file, line: r.line, category: "omitted-route", reason: r.reason, detail: r.reason })),
        ...parsed.coverage.routes.withheld.map((r) => ({ path: r.project, category: "withheld-routes", reason: r.reason, detail: r.reason })),
        ...parsed.configs.flatMap((c) => c.errors.map((error) => ({ path: c.path, category: "config", reason: "config-diagnostic", detail: error }))),
      ],
    };
    const candidatesByPath = new Map(selection.walk.candidates.map(c => [c.path, c]));
    const resources = snapshot.files.map(f => { const candidate = candidatesByPath.get(f.path)!; return { path: f.path, hash: f.hash, bytes: f.bytes, lines: f.lines, utf16Length: candidate.content.length, encoding: "legacy-decoded" as const, purpose: "source" as const }; });
    return validateSnapshot({ ...snapshot, version: SNAPSHOT_VERSION, analysis: legacyObservations(snapshot, resources) });
}

/** Ephemeral adapter-owned ASTs; shared engine contracts never expose ts-morph. */
export function createTypescriptRefresh() {
  let session = createSyntaxSession(), previous: Selection | undefined;
  let unresolved = "";
  return {
    analyze(root: string, forceFull: boolean, progress?: (stage: "parse") => void) {
      const selection = selectFiles(root, root);
      const topology = (s: Selection) => JSON.stringify({ paths: s.walk.candidates.map((c) => [c.path, c.project]), skipped: s.walk.skipped, projects: s.walk.projects, excluded: s.walk.excludedDirectories });
      let full = forceFull || !previous || topology(previous) !== topology(selection);
      // Resolution-only package/config metadata is also authoritative. Rebuild
      // globally when it changes, even if no watcher event was delivered.
      if (previous && !previous.reader.metadataStable()) full = true;
      if (full) session = createSyntaxSession();
      let snapshot = analyzeTypescript(root, progress, selection, session);
      const currentUnresolved = JSON.stringify(snapshot.diagnostics.filter((d) => d.category === "unresolved-import" || d.category === "config"));
      if (!full && currentUnresolved !== unresolved) {
        full = true; session = createSyntaxSession();
        snapshot = analyzeTypescript(root, progress, selection, session);
      }
      unresolved = currentUnresolved;
      const candidate = { snapshot, reader: selection.reader, mode: full ? "full" as const : "incremental" as const, parsed: session.parsed, reused: session.reused };
      previous = selection;
      return candidate;
    },
    reset() { session = createSyntaxSession(); previous = undefined; unresolved = ""; },
  };
}
