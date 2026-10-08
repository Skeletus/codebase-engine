import { createHash } from "node:crypto";
import path from "node:path";
import { FlowParserWorker, ParserWorkerError } from "../parser-worker.ts";
import type { AsyncLanguageExtension } from "../coordinator.ts";
import type { PythonOptions } from "./python.ts";
import type { FlowSyntax } from "./flow-syntax.ts";
import { flowFiles } from "../../parser/flow-dialect.ts";
import { validateSnapshot } from "../contract.ts";
import { capabilityId, factId, profileId, variantId } from "../../model/framework.ts";
import { metroProfile, type MetroMode } from "../../parser/adapters/metro-profile.ts";

/** Flow syntax remains adapter-owned. Only validated neutral facts cross into
 * the shared snapshot; imported callable targets are deliberately withheld. */
export function flowExtension(options: PythonOptions & {metroModes?: readonly MetroMode[]}): AsyncLanguageExtension {
  const cache = new Map<string, {hash: string; syntax: FlowSyntax}>();
  let completedRoot: string | undefined;
  return {stage: "before-project", reset() { cache.clear(); completedRoot = undefined; }, async analyze(snapshot, selection, full) {
    const files = flowFiles(selection);
    if (!files.size) return {snapshot, parsed: 0, reused: 0};
    if (full) cache.clear();
    let worker: FlowParserWorker | undefined, parsed = 0, reused = 0, unavailable = false;
    const started = performance.now();
    const records: {file: string; owner: string; hash: string; text: string; bytes: number; syntax: FlowSyntax}[] = [];
    const failures: {file: string; reason: string}[] = [];
    try {
      for (const candidate of selection.walk.candidates.filter(c => files.has(c.path))) {
        selection.walk.discovery.boundary.check();
        if (options.signal?.aborted) throw new ParserWorkerError("cancelled");
        if (performance.now() - started >= 120000) throw new ParserWorkerError("resource-limit");
        // Reuse the already protected source read. Verify that UTF-8 roundtrip
        // retains the original bytes; no extra repository read or execution.
        const bytes = Buffer.from(candidate.content, "utf8"), hash = createHash("sha256").update(bytes).digest("hex");
        if (candidate.validUtf8 === false || hash !== candidate.hash) { failures.push({file: candidate.path, reason: "unsupported-encoding"}); continue; }
        const previous = cache.get(candidate.path);
        let syntax: FlowSyntax;
        if (previous?.hash === hash) { syntax = structuredClone(previous.syntax); reused++; }
        else {
          if (unavailable) { failures.push({file: candidate.path, reason: "parser-unavailable"}); continue; }
          if (!worker) {
            worker = new FlowParserWorker(options.host, options.signal);
            try { await worker.start(); }
            catch (error) { if (error instanceof ParserWorkerError && error.reason === "cancelled") throw error; unavailable = true; failures.push({file: candidate.path, reason: "parser-unavailable"}); continue; }
          }
          try { syntax = await worker.parse(candidate.path, bytes); parsed++; }
          catch (error) {
            if (error instanceof ParserWorkerError && ["cancelled", "resource-limit"].includes(error.reason)) throw error;
            const reason = error instanceof ParserWorkerError ? error.reason : "parser-unavailable";
            if (reason === "parser-unavailable") unavailable = true;
            failures.push({file: candidate.path, reason}); continue;
          }
          cache.set(candidate.path, {hash, syntax: structuredClone(syntax)});
        }
        const owner = selection.walk.discovery.inventory.find(i => i.path === candidate.path)!.owner;
        records.push({file: candidate.path, owner, hash, text: candidate.content, bytes: bytes.length, syntax});
      }
    } finally { await worker?.close(); }
    selection.walk.discovery.boundary.check();
    if (unavailable && (completedRoot === selection.root || options.previousSnapshot?.()?.analysis.projects.some(p => p.extractors.includes("flow/fs-07/1")))) throw new ParserWorkerError("parser-unavailable");
    snapshot.diagnostics = snapshot.diagnostics.filter(d => !(files.has(d.path) && d.reason === "flow-session-required"));
    snapshot.diagnostics.push(...failures.map(f => ({path: f.file, category: "skipped-file", reason: f.reason, detail: "Flow analysis withheld; no TS syntax or runtime execution fallback"})));
    snapshot.coverage.files.parsed += records.length; snapshot.coverage.files.skipped -= records.length;
    for (const record of records) {
      const lines = Math.max(1, record.text.split("\n").length - (record.text.endsWith("\n") ? 1 : 0));
      snapshot.files.push({id: record.file, path: record.file, module: path.posix.dirname(record.file), hash: record.hash, bytes: record.bytes, lines, fanIn: 0, fanOut: 0, role: null, reachedBy: null, exports: record.syntax.exports.map(e => e.name)});
      snapshot.analysis.resources.push({path: record.file, hash: record.hash, bytes: record.bytes, lines, utf16Length: record.text.length, encoding: "utf8", purpose: "source"});
      snapshot.behavior.declarations.push(...record.syntax.behavior.declarations);
      snapshot.behavior.relations.push(...record.syntax.behavior.relations);
      snapshot.behavior.gaps.push(...record.syntax.behavior.gaps);
      for (const call of record.syntax.importedCalls) snapshot.behavior.gaps.push({source: call.source, reason: "flow-imported-call-unqualified", site: call.site});
    }
    for (const project of selection.walk.discovery.projects.filter(p => selection.walk.discovery.inventory.some(i => i.owner === p.path && files.has(i.path)))) {
      for (const mode of [...new Set(options.metroModes ?? ["android-development" as const])]) {
        const metro = metroProfile(snapshot, selection.walk.discovery, project, mode);
        for (const record of records.filter(r => r.owner === project.path)) for (const entry of record.syntax.imports) {
          // Types have no runtime module dependency in Metro. Their static type
          // resolution remains an explicit unsupported boundary below.
          if (entry.typeOnly) { metro.gap(entry.site, "unsupported-syntax"); continue; }
          const answer = metro.resolve(record.file, entry.module);
          if (answer.state === "resolved") for (const target of answer.targets) metro.bind(entry.site, target, answer.category === "asset" ? "asset" : "module-dependency", answer.rule);
          else metro.gap(entry.site, answer.state === "boundary" ? answer.reason : "external-boundary");
        }
      }
      const profile = {id: profileId(project.path, "flow-static", "fs-07/1"), projectId: project.path, resolverId: "flow-static", semanticsVersion: "fs-07/1", language: "flow"};
      const variant = {id: variantId(profile.id, "static-flow-syntax", null, []), projectId: project.path, profileId: profile.id, resolverId: profile.resolverId, environment: "static-flow-syntax", platform: null, conditions: [], configWitnesses: []};
      snapshot.analysis.profiles.push(profile); snapshot.analysis.variants.push(variant);
      const key = {tupleId: "hermes-parser@0.25.1", capabilityId: "flow-foundation", profileId: profile.id, variantId: variant.id};
      const capability = {...key, id: capabilityId(key), state: unavailable ? "blocked" as const : "partial" as const, extractorVersion: "fs-07/1", qualificationRecord: null, gapIds: [] as string[]};
      snapshot.analysis.capabilities.push(capability);
      const shared = snapshot.analysis.projects.find(p => p.projectId === project.path)!;
      shared.languages.push("flow"); shared.profileIds.push(profile.id); shared.extractors.push("flow/fs-07/1");
      for (const record of records.filter(r => r.owner === project.path)) {
        for (const location of [...record.syntax.behavior.gaps.map(g => g.site), ...record.syntax.importedCalls.map(c => c.site)]) {
          const id = factId("gap", location, variant.id, "unsupported-syntax");
          if (!capability.gapIds.includes(id)) { snapshot.analysis.gaps.push({id, occurrence: location, variantId: variant.id, capabilityId: capability.id, reason: "unsupported-syntax"}); capability.gapIds.push(id); }
        }
      }
    }
    snapshot.files.sort((a,b) => a.path.localeCompare(b.path)); snapshot.analysis.resources.sort((a,b) => a.path.localeCompare(b.path));
    if (Buffer.byteLength(JSON.stringify(snapshot)) > 31 * 1024 * 1024) throw new ParserWorkerError("resource-limit");
    const validated = validateSnapshot(snapshot); if (records.length) completedRoot = selection.root;
    return {snapshot: validated, parsed, reused};
  }};
}
