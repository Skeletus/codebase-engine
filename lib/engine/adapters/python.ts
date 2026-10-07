import { pythonPriorityModules } from "./python-module-priority.ts";
import path from "node:path";
import { pythonSource } from "./python-source.ts";
import { PythonParserWorker, ParserWorkerError } from "../parser-worker.ts";
import type { PythonSyntax, PythonImport } from "./python-syntax.ts";
import type { AsyncLanguageExtension } from "../coordinator.ts";
import { validateSnapshot } from "../contract.ts";
import { profileId, variantId, capabilityId, factId, type Witness } from "../../model/framework.ts";
import type { Site } from "../../model/behavior.ts";
import type { CodeSnapshot } from "../types.ts";
import type { Selection } from "../../parser/index.ts";
import { createResolutionProfile } from "../profiles.ts";
import { RepositoryReadError } from "../../repository/read-policy.ts";

type Parsed = { file: string; owner: string; source: ReturnType<typeof pythonSource>; bytes: number; syntax: PythonSyntax };
export type PythonOptions = { host: string; signal?: AbortSignal; moduleRoots?: Readonly<Record<string, readonly string[]>>; previousSnapshot?: () => CodeSnapshot | null };
export function pythonExtension(options: PythonOptions): AsyncLanguageExtension {
  const cache = new Map<string, { hash: string; syntax: PythonSyntax }>();
  let completedRoot: string | undefined;
  return { reset() { cache.clear(); completedRoot = undefined; }, async analyze(snapshot: CodeSnapshot, selection: Selection, full: boolean) {
    const discovery = selection.walk.discovery, inputs = discovery.inventory.filter(f => f.language === "python" && f.state !== "excluded");
    if (!inputs.length) return { snapshot, parsed: 0, reused: 0 };
    if (options.signal?.aborted) throw new ParserWorkerError("cancelled");
    if (full) cache.clear();
    let worker: PythonParserWorker | undefined, startupFailure: string | undefined, parsed = 0, reused = 0;
    const records: Parsed[] = [], failures: { file: string; reason: string }[] = [];
    const started = performance.now();
    try {
      for (const input of inputs) {
        if (options.signal?.aborted) throw new ParserWorkerError("cancelled");
        discovery.boundary.check(); if (performance.now() - started >= 120000) throw new ParserWorkerError("resource-limit");
        let bytes: Buffer, source: ReturnType<typeof pythonSource>;
        try { bytes = selection.reader.read(path.resolve(selection.root, input.path), "source"); }
        catch (error) { if (error instanceof RepositoryReadError && error.reason === "limit") throw new ParserWorkerError("resource-limit"); failures.push({ file: input.path, reason: error instanceof RepositoryReadError && error.reason === "policy" ? "policy-denied" : error instanceof RepositoryReadError && error.reason === "too-large" ? "resource-limit" : "unreadable" }); continue; }
        try { source = pythonSource(bytes); } catch { failures.push({ file: input.path, reason: "unsupported-encoding" }); continue; }
        let syntax: PythonSyntax;
        const previous = cache.get(input.path);
        if (previous?.hash === source.hash) { syntax = structuredClone(previous.syntax); reused++; }
        else {
          if (startupFailure) { failures.push({ file: input.path, reason: startupFailure }); continue; }
          if (!worker) { worker = new PythonParserWorker(options.host, options.signal); try { await worker.start(); } catch (error) { if (error instanceof ParserWorkerError && error.reason === "cancelled") throw error; startupFailure = "parser-unavailable"; failures.push({ file: input.path, reason: startupFailure }); continue; } }
          try { syntax = await worker.parse(input.path, bytes); parsed++; }
          catch (error) { if (error instanceof ParserWorkerError && ["cancelled", "resource-limit"].includes(error.reason)) throw error; const reason = error instanceof ParserWorkerError ? error.reason : "parser-unavailable"; if (reason === "parser-unavailable") startupFailure = reason; failures.push({ file: input.path, reason }); continue; }
          cache.set(input.path, { hash: source.hash, syntax: structuredClone(syntax) });
        }
        records.push({ file: input.path, owner: input.owner, source, bytes: bytes.length, syntax });
      }
    } finally { await worker?.close(); }
    if (options.signal?.aborted) throw new ParserWorkerError("cancelled");
    const previous = options.previousSnapshot?.();
    if (startupFailure && (completedRoot === selection.root || previous?.origin.root === selection.root && previous.files.some(f => f.path.endsWith(".py")))) throw new ParserWorkerError("parser-unavailable");
    const succeeded = new Set(records.map(r => r.file));
    snapshot.diagnostics = snapshot.diagnostics.filter(d => !(d.reason === "language-not-implemented" && inputs.some(i => i.path === d.path)));
    snapshot.diagnostics.push(...failures.map(f => ({ path: f.file, reason: f.reason, category: "skipped-file", detail: "Python analysis withheld; no source execution or runtime fallback" })));
    snapshot.coverage.files.parsed += records.length; snapshot.coverage.files.skipped -= records.length;
    for (const record of records) {
      const lines = Math.max(1, record.source.text.split("\n").length - (record.source.text.endsWith("\n") ? 1 : 0));
      snapshot.files.push({ id: record.file, path: record.file, module: path.posix.dirname(record.file), hash: record.source.hash, bytes: record.bytes, lines, fanIn: 0, fanOut: 0, role: null, reachedBy: null, exports: record.syntax.exports.map(e => e.name) });
      const resource = { path: record.file, hash: record.source.hash, bytes: record.bytes, lines, utf16Length: record.source.text.length, encoding: "utf8" as const, purpose: "source" as const };
      const existing = snapshot.analysis.resources.findIndex(r => r.path === record.file);
      if (existing >= 0) { if (snapshot.analysis.resources[existing].hash !== resource.hash) throw new Error("unstable_generation"); snapshot.analysis.resources[existing] = resource; } else snapshot.analysis.resources.push(resource);
      snapshot.behavior.declarations.push(...record.syntax.behavior.declarations); snapshot.behavior.relations.push(...record.syntax.behavior.relations); snapshot.behavior.gaps.push(...record.syntax.behavior.gaps);
    }
    for (const project of discovery.projects.filter(p => p.languages.includes("python"))) {
      const roots = [...new Set(options.moduleRoots?.[project.path] ?? [project.path])].sort();
      if (roots.length > 64 || roots.some(r => path.posix.isAbsolute(r) || /[\\:\0]/.test(r) || r !== "." && r.split("/").some(part => !part || part === "." || part === "..") || !(project.path === "." || r === project.path || r.startsWith(project.path + "/")))) throw new Error("Invalid Python module roots");
      const profile = { id: profileId(project.path, "python-static", "fs-05/1"), projectId: project.path, resolverId: "python-static", semanticsVersion: "fs-05/1", language: "python" };
      const conditions = roots.map(r => "module-root:" + r), id = variantId(profile.id, "static-python-declared-environment", null, conditions);
      const inherited = createResolutionProfile(discovery, project, "python-package").variant.configWitnesses;
      const variant = { id, projectId: project.path, profileId: profile.id, resolverId: profile.resolverId, environment: "static-python-declared-environment", platform: null, conditions, configWitnesses: inherited.map(w => ({ ...w, variantId: id })) as Witness[] };
      snapshot.analysis.profiles.push(profile); snapshot.analysis.variants.push(variant);
      const key = { tupleId: "python-unqualified", capabilityId: "python-foundation", profileId: profile.id, variantId: variant.id };
      const capability = { ...key, id: capabilityId(key), state: startupFailure ? "blocked" as const : "partial" as const, extractorVersion: "fs-05/1", qualificationRecord: null, gapIds: [] as string[] }; snapshot.analysis.capabilities.push(capability);
      const shared = snapshot.analysis.projects.find(p => p.projectId === project.path)!; shared.profileIds.push(profile.id); shared.extractors.push("python/fs-05/1");
      const modules = new Map<string, Parsed[]>();
      for (const record of records.filter(r => r.owner === project.path)) for (const root of roots) {
        const relative = path.posix.relative(root, record.file); if (relative.startsWith("../")) continue;
        const moduleKey = relative.replace(/(?:\/__init__)?\.py$/, "").replaceAll("/", ".");
        modules.set(moduleKey, [...modules.get(moduleKey) ?? [], record]);
      }
      const gap = (location: Site, reason: "ambiguous-target" | "external-boundary" | "missing-metadata" | "dynamic-expression" | "parse-error" | "policy-denied") => {
        const id = factId("gap", location, variant.id, reason); if (!snapshot.analysis.gaps.some(g => g.id === id)) { snapshot.analysis.gaps.push({ id, reason, occurrence: location, variantId: variant.id, capabilityId: capability.id }); capability.gapIds.push(id); }
      };
      const moduleName = (record: Parsed, entry: PythonImport): string | null => {
        let moduleKey = entry.module;
        const dots = /^\.+/.exec(moduleKey)?.[0].length ?? 0;
        if (dots) {
          const root = roots.find(r => !path.posix.relative(r, record.file).startsWith("../")); if (!root) return null;
          const parts = path.posix.relative(root, path.posix.dirname(record.file)).split("/").filter(s => s && s !== ".");
          if (dots > parts.length) return null;
          parts.splice(parts.length - dots + 1); moduleKey = [...parts, moduleKey.slice(dots)].filter(Boolean).join(".");
        }
        return moduleKey;
      };
      const resolve = (record: Parsed, entry: PythonImport) => { const moduleKey = moduleName(record, entry); return moduleKey === null || pythonPriorityModules.has(moduleKey) ? [] : modules.get(moduleKey) ?? []; };
      const packageCollision = (record: Parsed, name: string) => record.file.endsWith("/__init__.py") && [...modules].some(([moduleKey, candidates]) => candidates.some(candidate => candidate.file === record.file) && modules.has(moduleKey + "." + name));
      const unavailable = (record: Parsed, entry: PythonImport): "excluded" | "external" | "missing" | "missing-stub" => {
        const moduleKey = moduleName(record, entry); if (moduleKey === null) return "missing";
        if (pythonPriorityModules.has(moduleKey)) return "external";
        let stub = false;
        for (const root of roots) for (const suffix of [".py", "/__init__.py", ".pyi"]) {
          const candidate = path.posix.join(root, moduleKey.replaceAll(".", "/") + suffix);
          if (selection.walk.excludedDirectories.some(d => candidate === d.path || candidate.startsWith(d.path + "/")) || failures.some(f => f.reason === "policy-denied" && f.file === candidate)) return "excluded";
          const before = selection.reader.denials().length;
          const stat = selection.reader.stat(path.resolve(selection.root, candidate));
          if (selection.reader.denials().length > before) return "excluded";
          if (suffix === ".pyi" && stat?.isFile()) stub = true;
        }
        return stub ? "missing-stub" : project.languageDependencies.python?.includes(moduleKey.split(".")[0]) ? "external" : "missing";
      };
      const exported = (record: Parsed, name: string, seen = new Set<string>()): { id: string; witnesses: Witness[] } | null => {
        // Loading a same-named submodule can replace a package attribute in its
        // own namespace. An initializer declaration alone cannot prove that
        // attribute's callable target across an unknown module-load history.
        if (packageCollision(record,name)) return null;
        const key = JSON.stringify([record.file, name]); if (seen.has(key) || seen.size >= 64) return null;
        const next = new Set(seen); next.add(key);
        const local = record.syntax.exports.filter(e => e.name === name), imports = record.syntax.imports.filter(i => i.reexportable && !i.star && i.alias === name && i.name !== null);
        if (local.length === 1 && !imports.length) {
          const declaration = record.syntax.behavior.declarations.find(d => d.id === local[0].id)!;
          return { id: declaration.id, witnesses: [{ role: "declaration", site: declaration.site, variantId: variant.id, extractorVersion: "fs-05/1" }] };
        }
        if (!local.length && imports.length === 1) {
          const target = resolve(record, imports[0]); if (target.length !== 1) return null;
          const answer = exported(target[0], imports[0].name!, next);
          if (answer) return { id: answer.id, witnesses: [{ role: "reference", site: imports[0].site, variantId: variant.id, extractorVersion: "fs-05/1" }, ...answer.witnesses] };
        }
        return null;
      };
      for (const record of records.filter(r => r.owner === project.path)) {
        discovery.boundary.check();
        const uncertain = new Set(record.syntax.exports.filter(entry => packageCollision(record,entry.name)).map(entry => entry.id));
        const withheld = snapshot.behavior.relations.filter(relation => uncertain.has(relation.target));
        snapshot.behavior.relations = snapshot.behavior.relations.filter(relation => !uncertain.has(relation.target));
        for (const relation of withheld) { snapshot.behavior.gaps.push({ source:relation.source,reason:"package-attribute-submodule-boundary",site:relation.site });gap(relation.site,"ambiguous-target"); }
        for (const boundary of record.syntax.behavior.gaps) gap(boundary.site, boundary.reason === "parse-error" ? "parse-error" : "dynamic-expression");
        for (const decorator of record.syntax.decorated) {
          const declaration = record.syntax.behavior.declarations.find(d => d.id === decorator.id)!;
          snapshot.analysis.bindings.push({ id: factId("binding:wrapper", decorator.site, variant.id, decorator.id), kind: "wrapper", sourceId: record.file, targetId: decorator.id, variantId: variant.id, occurrence: decorator.site, witnesses: [{ role: "reference", site: decorator.site, variantId: variant.id, extractorVersion: "fs-05/1" }, { role: "declaration", site: declaration.site, variantId: variant.id, extractorVersion: "fs-05/1" }] });
        }
        for (const item of record.syntax.all ?? []) {
          const answer = exported(record, item.name);
          if (!answer) { gap(item.site, "ambiguous-target"); continue; }
          snapshot.analysis.bindings.push({ id: factId("binding:module-export", item.site, variant.id, answer.id), kind: "module-export", sourceId: record.file, targetId: answer.id, variantId: variant.id, occurrence: item.site, witnesses: [{ role: "reference", site: item.site, variantId: variant.id, extractorVersion: "fs-05/1" }, ...answer.witnesses] });
        }
        for (const entry of record.syntax.imports) {
          discovery.boundary.check();
          const targets = resolve(record, entry);
          const syntax = entry.name === null ? "python-import" : "python-from";
          const counts = snapshot.coverage.bySyntax[syntax] ??= { seen: 0, internal: 0, external: 0, excluded: 0, unresolved: 0 };
          counts.seen++; snapshot.coverage.relationships.seen++;
          if (targets.length !== 1) {
            const outcome = targets.length ? "missing" : unavailable(record, entry), status = outcome === "external" ? "external" : outcome === "excluded" ? "excluded" : "unresolved";
            counts[status]++; snapshot.coverage.relationships[status]++;
            if (status === "external") snapshot.coverage.external[entry.module] = (snapshot.coverage.external[entry.module] ?? 0) + 1;
            else if (status === "excluded") snapshot.coverage.excluded[entry.module] = (snapshot.coverage.excluded[entry.module] ?? 0) + 1;
            else { const reason = outcome === "missing-stub" ? "python-stub-implementation-unavailable" : "python-missing-or-ambiguous"; snapshot.coverage.unresolved[reason] = (snapshot.coverage.unresolved[reason] ?? 0) + 1; snapshot.diagnostics.push({ path: record.file, line: entry.site.line, category: "unresolved-import", reason, detail: "No unique authorized implementation; no runtime discovery or imports attempted" }); }
            gap(entry.site, status === "excluded" ? "policy-denied" : targets.length > 1 || entry.star ? "ambiguous-target" : status === "external" ? "external-boundary" : "missing-metadata"); continue;
          }
          counts.internal++; snapshot.coverage.relationships.internal++;
          const target = targets[0], witnesses: Witness[] = [{ role: "reference", site: entry.site, variantId: variant.id, extractorVersion: "fs-05/1" }];
          const importId = JSON.stringify([record.file, target.file, syntax]);
          if (!snapshot.relationships.some(r => r.id === importId)) snapshot.relationships.push({ id: importId, source: record.file, target: target.file, relation: "imports", typeOnly: false, syntax, evidence: { file: record.file, line: entry.site.line, fileHash: record.source.hash, extractor: "python/imports/fs-05/1", evidenceKind: "verified", occurrence: "first", description: entry.module } });
          const id = factId("binding:module-dependency", entry.site, variant.id, target.file);
          if (!snapshot.analysis.bindings.some(b => b.id === id)) snapshot.analysis.bindings.push({ id, kind: "module-dependency", sourceId: record.file, targetId: target.file, variantId: variant.id, occurrence: entry.site, witnesses });
          if (entry.star) { gap(entry.site, "ambiguous-target"); continue; }
          if (entry.reexportable && entry.name !== null) {
            const answer = exported(target, entry.name);
            if (answer) snapshot.analysis.bindings.push({ id: factId("binding:module-export", entry.site, variant.id, answer.id), kind: "module-export", sourceId: record.file, targetId: answer.id, variantId: variant.id, occurrence: entry.site, witnesses: [...witnesses, ...answer.witnesses] });
          }
          for (const call of record.syntax.importedCalls.filter(c => c.bindingStart === entry.site.start)) {
            const answer = call.name === null ? null : exported(target, call.name), declaration = answer ? snapshot.behavior.declarations.find(d => d.id === answer.id && d.callable) : undefined;
            if (!declaration) { gap(call.site, "ambiguous-target"); continue; }
            snapshot.behavior.relations.push({ id: JSON.stringify([record.file, call.site.start, "calls"]), source: call.source, target: declaration.id, relation: "calls", conditional: true, site: call.site });
          }
        }
      }
    }
    for (const file of snapshot.files.filter(f => succeeded.has(f.path))) { file.fanIn = new Set(snapshot.relationships.filter(r => r.target === file.path).map(r => r.source)).size; file.fanOut = new Set(snapshot.relationships.filter(r => r.source === file.path).map(r => r.target)).size; }
    snapshot.files.sort((a,b) => a.path.localeCompare(b.path)); snapshot.analysis.resources.sort((a,b) => a.path.localeCompare(b.path));
    if (Buffer.byteLength(JSON.stringify(snapshot)) > 31 * 1024 * 1024) throw new ParserWorkerError("resource-limit");
    const validated = validateSnapshot(snapshot); if (records.length) completedRoot = selection.root;
    return { snapshot: validated, parsed, reused };
  } };
}



