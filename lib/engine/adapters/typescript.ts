import { parseSelection, selectFiles } from "../../parser/index.ts";
import { validateParseResult } from "../../parser/contract.ts";
import { validateSnapshot } from "../contract.ts";
import { SNAPSHOT_VERSION, type CodeSnapshot, type Evidence, type LanguageAdapter } from "../types.ts";

export const typescriptAdapter: LanguageAdapter = {
  id: "typescript-javascript",
  analyze(directory, onProgress) {
    const selection = selectFiles(directory);
    onProgress?.("parse");
    const parsed = validateParseResult(parseSelection(selection));
    const byPath = new Map(parsed.files.map((f) => [f.path, f]));
    const evidence = (file: string, line: number, extractor: string, description: string): Evidence => {
      const f = byPath.get(file);
      if (!f) throw new Error("Extractor evidence names an unknown file");
      return { file, line, fileHash: f.hash, extractor, evidenceKind: "verified", occurrence: "first", description };
    };
    const snapshot: CodeSnapshot = {
      version: SNAPSHOT_VERSION, origin: { kind: "local", root: parsed.root },
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
    return validateSnapshot(snapshot);
  },
};
