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
import {frameworkFact} from "../../parser/framework-budget.ts";
import {normalizeRange} from "../../model/positions.ts";

/** Flow syntax remains adapter-owned. Only validated neutral facts cross into
 * the shared snapshot. Imported callable targets require a stable unique Flow
 * export and agreement across every selected runtime profile. */
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
    const previousSnapshot=options.previousSnapshot?.();
    if (unavailable && (completedRoot === selection.root || previousSnapshot?.origin.root===selection.root&&previousSnapshot.analysis.projects.some(p => p.extractors.includes("flow/fs-07/1")))) throw new ParserWorkerError("parser-unavailable");
    snapshot.diagnostics = snapshot.diagnostics.filter(d => !(files.has(d.path) && d.reason === "flow-session-required"));
    snapshot.diagnostics.push(...failures.map(f => ({path: f.file, category: "skipped-file", reason: f.reason, detail: "Flow analysis withheld; no TS syntax or runtime execution fallback"})));
    snapshot.coverage.files.parsed += records.length; snapshot.coverage.files.skipped -= records.length;
    for (const record of records) {
      const lines = Math.max(1, record.text.split("\n").length - (record.text.endsWith("\n") ? 1 : 0));
      snapshot.files.push({id: record.file, path: record.file, module: path.posix.dirname(record.file), hash: record.hash, bytes: record.bytes, lines, fanIn: 0, fanOut: 0, role: null, reachedBy: null, exports: record.syntax.exports.map(e => e.name)});
      snapshot.analysis.resources.push({path: record.file, hash: record.hash, bytes: record.bytes, lines, utf16Length: record.text.length, encoding: "utf8", purpose: "source"});
      for(const d of record.syntax.behavior.declarations)frameworkFact(snapshot,record.file,d.id);
      for(const r of record.syntax.behavior.relations)frameworkFact(snapshot,record.file,r.id);
      for(const g of record.syntax.behavior.gaps)frameworkFact(snapshot,record.file,JSON.stringify(["flow-gap",g.site.start,g.reason]));
      snapshot.behavior.declarations.push(...record.syntax.behavior.declarations);
      snapshot.behavior.relations.push(...record.syntax.behavior.relations);
      snapshot.behavior.gaps.push(...record.syntax.behavior.gaps);
    }
    for (const project of selection.walk.discovery.projects.filter(p => selection.walk.discovery.inventory.some(i => i.owner === p.path && files.has(i.path)))) {
      const profiles=[...new Set(options.metroModes ?? ["android-development" as const])].map(mode=>metroProfile(snapshot,selection.walk.discovery,project,mode));
      for (const metro of profiles) {
        for (const record of records.filter(r => r.owner === project.path)) for (const entry of record.syntax.imports) {
          // Types have no runtime module dependency in Metro. Their static type
          // resolution remains an explicit unsupported boundary below.
          if (entry.typeOnly) { metro.gap(entry.site, "unsupported-syntax"); continue; }
          const answer = metro.resolve(record.file, entry.module);
          if (answer.state === "resolved") for (const target of answer.targets) metro.bind(entry.site, target, answer.category === "asset" ? "asset" : "module-dependency", answer.rule);
          else metro.gap(entry.site, answer.state === "boundary" ? answer.reason : "external-boundary");
        }
        for(const record of records.filter(r=>r.owner===project.path))for(const exported of record.syntax.exports){
          const target=record.syntax.behavior.declarations.find(d=>d.id===exported.id)!;
          frameworkFact(snapshot,record.file);
          const context={file:record.file,...normalizeRange(record.text,0,record.text.length-(/\r\n$/.test(record.text)?2:/[\r\n]$/.test(record.text)?1:0),"utf16"),fileHash:record.hash,extractor:"flow/syntax/fs-07/1",evidenceKind:"verified" as const};
          snapshot.analysis.bindings.push({id:factId("binding:module-export",exported.site,metro.variant.id,exported.id),kind:"module-export",sourceId:record.file,targetId:exported.id,variantId:metro.variant.id,occurrence:exported.site,witnesses:[{role:"reference",site:exported.site,variantId:metro.variant.id,extractorVersion:"fs-07/1"},{role:"reference",site:context,variantId:metro.variant.id,extractorVersion:"fs-07/1"},{role:"declaration",site:target.site,variantId:metro.variant.id,extractorVersion:"fs-07/1"},...metro.variant.configWitnesses]});
        }
      }
      const unresolvedCalls:FlowSyntax["importedCalls"] = [];
      // Lexical imports use the accepted language-neutral file graph only when
      // every selected runtime profile agrees. Framework dependencies remain
      // separately witnessed; incompatible platform targets never collapse.
      for(const record of records.filter(r=>r.owner===project.path))for(const entry of record.syntax.imports){
        if(entry.typeOnly)continue;
        const answers=profiles.map(metro=>metro.resolve(record.file,entry.module)),first=answers[0];
        const target=first?.state==="resolved"&&first.category==="module"&&first.targets.length===1?first.targets[0]:undefined;
        const agreed=target&&snapshot.files.some(f=>f.path===target)&&answers.every(a=>a.state==="resolved"&&a.category==="module"&&a.targets.length===1&&a.targets[0]===target);
        const state=agreed?"internal":answers.every(a=>a.state==="boundary"&&a.reason==="external-boundary")?"external":answers.some(a=>a.state==="boundary"&&a.reason==="policy-denied")?"excluded":"unresolved";
        const syntax="flow-import",counts=snapshot.coverage.bySyntax[syntax]??={seen:0,internal:0,external:0,excluded:0,unresolved:0};counts.seen++;counts[state]++;snapshot.coverage.relationships.seen++;snapshot.coverage.relationships[state]++;
        if(agreed){
          const id=JSON.stringify([record.file,target,syntax]);if(!snapshot.relationships.some(r=>r.id===id)){frameworkFact(snapshot,record.file,id);snapshot.relationships.push({id,source:record.file,target:target!,relation:"imports",typeOnly:false,syntax,evidence:{file:record.file,line:entry.site.line,fileHash:record.hash,extractor:"flow/imports/fs-07/1",evidenceKind:"verified",occurrence:"first",description:entry.module}});}
        }else if(state==="external")snapshot.coverage.external[entry.module]=(snapshot.coverage.external[entry.module]??0)+1;
        else if(state==="excluded")snapshot.coverage.excluded[entry.module]=(snapshot.coverage.excluded[entry.module]??0)+1;
        else{const reason="flow-runtime-target-unqualified";snapshot.coverage.unresolved[reason]=(snapshot.coverage.unresolved[reason]??0)+1;snapshot.diagnostics.push({path:record.file,line:entry.site.line,category:"unresolved-import",reason,detail:"Canonical lexical imports require one parsed code file shared by all selected Metro profiles"});for(const metro of profiles)metro.gap(entry.site,"ambiguous-target");}
      }
      for(const record of records.filter(r=>r.owner===project.path))for(const call of record.syntax.importedCalls){
        const answers=profiles.map(metro=>{
          const answer=metro.resolve(record.file,call.module),file=answer.state==="resolved"&&answer.category==="module"&&answer.targets.length===1?answer.targets[0]:undefined;
          const target=records.find(r=>r.file===file&&r.owner===project.path),exports=target?.syntax.exports.filter(e=>e.name===call.name)??[];
          return exports.length===1?target?.syntax.behavior.declarations.find(d=>d.id===exports[0].id&&d.callable):undefined;
        });
        if(answers.length&&answers.every(d=>d&&d.id===answers[0]?.id)){
          frameworkFact(snapshot,record.file);
          snapshot.behavior.relations.push({id:JSON.stringify([record.file,call.site.start,"calls"]),source:call.source,target:answers[0]!.id,relation:"calls",conditional:true,site:call.site});
        }else{frameworkFact(snapshot,record.file);snapshot.behavior.gaps.push({source:call.source,reason:"flow-imported-call-unqualified",site:call.site});unresolvedCalls.push(call);for(const metro of profiles)metro.gap(call.site,"ambiguous-target");}
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
        for (const location of [...record.syntax.behavior.gaps.map(g => g.site), ...unresolvedCalls.filter(c=>c.site.file===record.file).map(c => c.site)]) {
          const id = factId("gap", location, variant.id, "unsupported-syntax");
          if (!capability.gapIds.includes(id)) { snapshot.analysis.gaps.push({id, occurrence: location, variantId: variant.id, capabilityId: capability.id, reason: "unsupported-syntax"}); capability.gapIds.push(id); }
        }
      }
    }
    const flowPaths=new Set(records.map(r=>r.file));
    for(const file of snapshot.files){
      if(flowPaths.has(file.path)){file.fanIn=new Set(snapshot.relationships.filter(r=>r.target===file.path).map(r=>r.source)).size;file.fanOut=new Set(snapshot.relationships.filter(r=>r.source===file.path).map(r=>r.target)).size;}
      else file.fanIn+=new Set(snapshot.relationships.filter(r=>r.target===file.path&&flowPaths.has(r.source)).map(r=>r.source)).size;
    }
    snapshot.files.sort((a,b) => a.path.localeCompare(b.path)); snapshot.analysis.resources.sort((a,b) => a.path.localeCompare(b.path));
    if (Buffer.byteLength(JSON.stringify(snapshot)) > 31 * 1024 * 1024) throw new ParserWorkerError("resource-limit");
    const validated = validateSnapshot(snapshot); if (records.length) completedRoot = selection.root;
    return {snapshot: validated, parsed, reused};
  }};
}
