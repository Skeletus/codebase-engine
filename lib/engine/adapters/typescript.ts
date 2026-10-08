import { extractBehavior } from "../../parser/behavior.ts";
import type { Behavior } from "../../model/behavior.ts";
import { createSyntaxSession, parseSelection, selectFiles, type Selection } from "../../parser/index.ts";
import { validateParseResult } from "../../parser/contract.ts";
import { validateSnapshot } from "../contract.ts";
import { legacyObservations } from "../compatibility.ts";
import { AnalysisCoordinator } from "../coordinator.ts";
import { extractVite } from "../../parser/adapters/vite.ts";
import { extractNodeNext } from "../../parser/adapters/node-next.ts";
import type { NodeMode } from "../../parser/adapters/node-profile.ts";
import type { ViteMode } from "../../parser/adapters/vite.ts";
import { extractReactNative } from "../../parser/adapters/react-native.ts";
import type { MetroMode } from "../../parser/adapters/metro-profile.ts";
import { metroTuple } from "../../parser/adapters/metro-profile.ts";
import { flowFiles } from "../../parser/flow-dialect.ts";
import type { FrameworkSource } from "../../parser/framework-bindings.ts";
import type { LegacySnapshot } from "../types.ts";
import { SNAPSHOT_VERSION, type CodeSnapshot, type Evidence, type LanguageAdapter } from "../types.ts";

export const typescriptAdapter: LanguageAdapter = {
  id: "typescript-javascript",
  analyze: (directory, progress) => new AnalysisCoordinator(typescriptDriver()).analyze(directory, true, progress).snapshot,
};
function analyzeTypescript(directory: string, onProgress?: (stage: "parse") => void, selection: Selection = selectFiles(directory), session?: ReturnType<typeof createSyntaxSession>, capture?: (inputs: FrameworkSource[]) => void): CodeSnapshot {
    onProgress?.("parse");
    let behavior: Behavior | undefined;
    const deferred = flowFiles(selection);
    const typedSelection = deferred.size ? {...selection, walk: {...selection.walk, found: selection.walk.found - deferred.size, candidates: selection.walk.candidates.filter(c => !deferred.has(c.path))}} : selection;
    const parsed = validateParseResult(parseSelection(typedSelection, (sources, resolver, routes) => {
      const nativeProjects=new Set(selection.walk.discovery.metadata.all().filter(r=>r.resource.path.endsWith("package.json")&&r.config.value.kind==="object"&&r.config.value.properties.engines?.kind==="object"&&r.config.value.properties.engines.properties.node?.kind==="literal"&&["22.23.3","24.19.0"].includes(String(r.config.value.properties.engines.properties.node.value))).map(r=>r.resource.path==="package.json" ? "." : r.resource.path.slice(0,-"/package.json".length)));
      const projects = selection.walk.discovery.projects.filter(p => p.versions.vite === "7.3.7" && p.versions.react === "18.3.1" || p.versions.vite === "8.3.3" && p.versions.react === "19.2.8" || ["15.5.27","16.3.6","16.3.8"].includes(p.versions.next) || nativeProjects.has(p.path) || metroTuple(p.versions));
      const eligible=new Set(projects.length ? sources.filter(s=>s.sourceFile.getDescendants().length<=100000).map(s=>s.candidate.path) : []);
      const callbacks = new Set(selection.walk.discovery.inventory.filter(f => eligible.has(f.path) && projects.some(p => p.path === f.owner) && selection.walk.candidates.find(c=>c.path===f.path)?.validUtf8 !== false).map(f => f.path));
      behavior = extractBehavior(sources, resolver, routes, callbacks); capture?.(sources);
    }, session, deferred));
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
    if (deferred.size) {
      snapshot.coverage.files.found += deferred.size; snapshot.coverage.files.skipped += deferred.size;
      snapshot.diagnostics.push(...[...deferred].map(file => ({path: file, category: "skipped-file", reason: "flow-session-required", detail: "Explicit Flow source requires the supervised language session; TS/JS syntax is not substituted"})));
    }
    const resources = snapshot.files.map(f => { const candidate = candidatesByPath.get(f.path)!; return { path: f.path, hash: f.hash, bytes: f.bytes, lines: f.lines, utf16Length: candidate.content.length, encoding: "legacy-decoded" as const, purpose: "source" as const }; });
    return validateSnapshot({ ...snapshot, version: SNAPSHOT_VERSION, analysis: legacyObservations(snapshot, resources) });
}

/** Ephemeral adapter-owned ASTs; shared engine contracts never expose ts-morph. */
export function createTypescriptRefresh(options: { signal?: AbortSignal; viteModes?: readonly ViteMode[]; nodeModes?:readonly NodeMode[]; metroModes?: readonly MetroMode[] } = {}) {
  return new AnalysisCoordinator(typescriptDriver(options.viteModes,options.nodeModes,options.metroModes), options);
}

export function typescriptDriver(modes?: readonly ViteMode[],nodeModes?:readonly NodeMode[],metroModes?:readonly MetroMode[]) {
  let inputs: FrameworkSource[] = [];
  let session = createSyntaxSession();
  let unresolved = "";
  return {
    id: "typescript-javascript",
    analyze(selection: Selection, forceFull: boolean, progress?: (stage: "parse") => void) {
      const root = selection.root;
      let full = forceFull;
      if (full) session = createSyntaxSession();
      let snapshot = analyzeTypescript(root, progress, selection, session, sources => { inputs = sources; });
      const currentUnresolved = JSON.stringify(snapshot.diagnostics.filter((d) => d.category === "unresolved-import" || d.category === "config"));
      if (!full && currentUnresolved !== unresolved) {
        full = true; session = createSyntaxSession();
        snapshot = analyzeTypescript(root, progress, selection, session, sources => { inputs = sources; });
      }
      unresolved = currentUnresolved;
      const candidate = { snapshot, mode: full ? "full" as const : "incremental" as const, parsed: session.parsed, reused: session.reused };
      return candidate;
    },
    project(snapshot: CodeSnapshot, selection: Selection) { return extractReactNative(extractNodeNext(extractVite(snapshot, selection, inputs, modes),selection,inputs,nodeModes),selection,inputs,metroModes); },
    reset() { session = createSyntaxSession(); unresolved = ""; inputs = []; },
  };
}
