import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { DatabaseSync } from "node:sqlite";
import { typescriptAdapter, createTypescriptRefresh } from "../../lib/engine/adapters/typescript.ts";
import { validateSnapshot, serializeSnapshot, deserializeSnapshot, inspectSnapshot } from "../../lib/engine/contract.ts";
import { validateLegacySnapshot, serializeLegacySnapshot, deserializeLegacySnapshot } from "../../lib/engine/legacy-contract.ts";
import { snapshotJson } from "../../lib/engine/snapshot-identity.ts";
import { queryStructure, readEvidence, readWitnessEvidence } from "../../lib/engine/index.ts";
import { projectAnalysis, projectSnapshot } from "../../lib/desktop/projection.ts";
import { validateRequest, validateEvent } from "../../lib/desktop/protocol.ts";
import { SqliteAnalysisStore } from "../../lib/storage/sqlite.ts";
import { factId, capabilityId, type Witness } from "../../lib/model/framework.ts";
import { decodeSource, normalizeRange } from "../../lib/model/positions.ts";
import type { CodeSnapshot } from "../../lib/engine/types.ts";
import { parseRepository } from "../../lib/parser/index.ts";
import { adjacency, reach } from "../../lib/graph/reach.ts";
import { createRequire } from "node:module";
import { transpileModule, ModuleKind, JsxEmit } from "typescript";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";

const fixtureRecord = JSON.parse(readFileSync("tests/fixtures/framework-support/F01-contract/fixture.json", "utf8")) as { id: string; sources: Record<string, string>; sourceHashes: Record<string, string>; oracle: { outputSha256: string } };

function fixture() {
  const root = realpathSync.native(mkdtempSync(path.join(tmpdir(), "cartograph FS-01 ")));
  for (const [file, source] of Object.entries({ "entry.ts": 'import type { Kind } from "./types"; import { service } from "./service"; export function entry(): Kind { return service(); }\r\n', "service.ts": 'export function service() { return "😀é"; }\r\n', "types.ts": "export type Kind = string;\n", "app/api/example/route.ts": 'import { service } from "../../../service"; export function GET() { return service(); }\n' })) { const p = path.join(root, file); mkdirSync(path.dirname(p), { recursive: true }); writeFileSync(p, source); }
  writeFileSync(path.join(root, "package.json"), '{"dependencies":{"next":"16.3.6"}}');
  const snapshot = typescriptAdapter.analyze(root);
  return { root, snapshot, cleanup() { assert(path.basename(root).startsWith("cartograph FS-01 ")); rmSync(root, { recursive: true, force: true }); } };
}
function assessed(base: CodeSnapshot) {
  const s = structuredClone(base), a = s.analysis, variant = a.variants[0], declaration = s.behavior.declarations.find(d => d.name === "service" && d.callable)!;
  a.status = "assessed"; a.resources.forEach(r => { r.encoding = "utf8"; });
  const c = { tupleId: "synthetic-contract-v1", capabilityId: "F01-contract", profileId: variant.profileId, variantId: variant.id };
  const capability = { ...c, id: capabilityId(c), state: "partial" as const, extractorVersion: "fs-01/1", qualificationRecord: null, gapIds: [] as string[] }; a.capabilities.push(capability);
  const route = a.registrations[0];
  const gap = { id: factId("gap", route.occurrence, variant.id, "unknown-method"), reason: "unknown-method" as const, occurrence: route.occurrence, variantId: variant.id, capabilityId: capability.id };
  if (!a.gaps.some(g => g.id === gap.id)) a.gaps.push(gap); capability.gapIds.push(gap.id);
  const registration = { ...route, id: factId("registration:http", route.occurrence, variant.id, "/synthetic"), rawPattern: "/synthetic", legacyRouteIndex: null, methodState: { state: "unknown" as const, values: [] as [] }, gapIds: [...new Set([...route.gapIds, gap.id])] }; a.registrations.push(registration);
  const bytes = readFileSync(path.join(s.origin.root, "package.json")), hash = createHash("sha256").update(bytes).digest("hex"), source = bytes.toString("utf8");
  a.resources.push({ path: "package.json", hash, bytes: bytes.length, utf16Length: source.length, lines: 1, encoding: "utf8", purpose: "metadata" });
  const configuration: Witness = { site: { file: "package.json", ...normalizeRange(source, 0, source.length, "utf16"), fileHash: hash, extractor: "synthetic/config", evidenceKind: "verified" }, role: "configuration", extractorVersion: "fs-01/1", variantId: variant.id };
  registration.witnesses.push(configuration);
  const owner = s.behavior.declarations.find(d => d.name === "entry" && d.callable)!;
  const referenceWitness: Witness = { site: owner.site, role: "reference", extractorVersion: "fs-01/1", variantId: variant.id };
  const declarationWitness: Witness = { site: declaration.site, role: "declaration", extractorVersion: "fs-01/1", variantId: variant.id };
  a.bindings.push({ id: factId("binding:event-handler", owner.site, variant.id, declaration.id), kind: "event-handler", sourceId: "entry.ts", targetId: declaration.id, variantId: variant.id, occurrence: owner.site, witnesses: [referenceWitness, declarationWitness, configuration] });
  a.candidates.push({ id: factId("candidate:request-endpoint", owner.site, variant.id, "entry.ts"), relationKind: "request-endpoint", sourceId: "entry.ts", targetIds: [registration.id], reasons: ["unknown-origin"], truncated: false, variantId: variant.id, occurrence: owner.site, witnesses: [referenceWitness, declarationWitness] });
  a.assumptions.push({ id: "synthetic-user-mapping", revision: 1, variantId: variant.id, service: "fixture", origin: "https://example.test", provenance: "user" });
  return validateSnapshot(s);
}

test("F01-contract: v3 round trip, repeated analysis and incremental facts are deterministic", () => {
  const f = fixture(); try { const s = assessed(f.snapshot); assert.deepEqual(deserializeSnapshot(serializeSnapshot(s)), s); assert.equal(snapshotJson(typescriptAdapter.analyze(f.root)), snapshotJson(f.snapshot)); const session = createTypescriptRefresh(); const full = session.analyze(f.root, true), incremental = session.analyze(f.root, false); assert.equal(incremental.mode, "incremental"); assert(incremental.reused > 0); assert.deepEqual(incremental.snapshot, full.snapshot); const changed = structuredClone(s); changed.analysis.assumptions[0].revision++; assert.notEqual(snapshotJson(changed), snapshotJson(s)); assert.equal(changed.analysis.registrations[0].id, s.analysis.registrations[0].id); } finally { f.cleanup(); }
});

test("F01-contract: the retained real v2 baseline round trips and requires explicit reanalysis", () => {
  const bytes = gunzipSync(readFileSync("docs/fs-00/evidence/baseline-snapshot.json.gz")); const old = JSON.parse(bytes.toString()); const legacy = validateLegacySnapshot(old); assert.deepEqual(deserializeLegacySnapshot(serializeLegacySnapshot(legacy)), legacy); const inspected = inspectSnapshot(old); assert.equal(inspected.state, "reanalysis-required"); assert.equal(inspected.snapshot.version, 2); assert(!("analysis" in inspected.snapshot)); assert.throws(() => validateSnapshot(old), /version/); assert.throws(() => inspectSnapshot({ ...old, version: 4 }));
});

test("F01-contract: import projection and exact Impact remain equivalent to legacy parsing", () => {
  const f = fixture(); try { const s = assessed(f.snapshot), parse = parseRepository(f.root); const projected = projectSnapshot(s); assert.deepEqual(projected.edges, parse.edges); assert.deepEqual(projected.routes, parse.routes); for (const file of s.files) for (const direction of ["dependencies", "dependents"] as const) for (const depth of [0, 1, 64]) assert.deepEqual(queryStructure(s, { file: file.id, direction, depth }), reach(adjacency(f.snapshot.relationships), file.id, direction, depth)); assert.deepEqual(projectSnapshot(s), projectSnapshot(f.snapshot)); assert.equal(s.relationships.length, f.snapshot.relationships.length); assert(projected.edges.some(e => e.typeOnly)); } finally { f.cleanup(); }
});

test("F01-contract: fixture source/output hashes and semantic golden are executable", () => {
  const f = fixture(); try { assert.equal(fixtureRecord.id, "F01-contract"); for (const [file, source] of Object.entries(fixtureRecord.sources)) { assert.equal(createHash("sha256").update(source).digest("hex"), fixtureRecord.sourceHashes[file]); assert.equal(readFileSync(path.join(f.root, file), "utf8"), source); } const bytes = readFileSync("tests/fixtures/framework-support/F01-contract/expected.json"); assert.equal(createHash("sha256").update(bytes).digest("hex"), fixtureRecord.oracle.outputSha256); const expected = JSON.parse(bytes.toString()); assert.equal(f.snapshot.version, expected.snapshotVersion); const facts = f.snapshot.relationships.map(r => [r.source, r.target, r.typeOnly]).sort(); assert.deepEqual(facts, expected.importFacts.sort()); assert.deepEqual(f.snapshot.routes.map(r => ({ file: r.file, method: r.method, pattern: r.pattern })), expected.routes); assert(f.snapshot.analysis.capabilities.every(c => c.state === expected.legacyCapability)); assert(f.snapshot.analysis.registrations.every(r => r.matcher.state === expected.matcher)); } finally { f.cleanup(); }
});

test("F01-contract: supported HTTP, dispatch-dependent, page and navigation contracts remain separate", () => {
  const f = fixture(); try { const s = assessed(f.snapshot), r = s.analysis.registrations.at(-1)!; r.matcher = { state: "supported", segments: [{ kind: "literal", value: "synthetic" }, { kind: "parameter", name: "id", converter: "integer" }], trailingSlash: "optional", caseSensitive: true, decodingPolicy: "percent-decode-segments" }; r.methodState = { state: "all", values: [] }; assert(validateSnapshot(s)); r.methodState = { state: "dispatch-dependent", values: [], gapId: r.gapIds.find(id => s.analysis.gaps.find(g => g.id === id)?.reason === "unknown-method")! }; assert(validateSnapshot(s)); for (const kind of ["page", "navigation"] as const) { r.kind = kind; r.id = factId("registration:" + kind, r.occurrence, r.variantId, r.rawPattern); r.methodState = null; s.analysis.candidates = []; assert(validateSnapshot(s)); assert.equal(projectAnalysis(s).registrations.at(-1)!.method, "navigation"); } } finally { f.cleanup(); }
});

test("F01-contract: multi-file registration/declaration/config witnesses open current original source", () => {
  const f = fixture(); try { const s = assessed(f.snapshot), r = s.analysis.registrations.at(-1)!; assert.equal(new Set(r.witnesses.filter(w => w.role !== "framework-rule").map(w => w.site.file)).size, 2); for (const w of [...r.witnesses, ...s.analysis.bindings[0].witnesses]) { const opened = readWitnessEvidence(s, w); assert.equal(opened.state, "current"); if (opened.state === "current") assert(opened.source.slice(opened.start, opened.end).length > 0); } writeFileSync(path.join(f.root, "package.json"), '{}'); assert.equal(readWitnessEvidence(s, r.witnesses.at(-1)!).state, "stale"); rmSync(path.join(f.root, "service.ts")); assert.equal(readEvidence(s, "service.ts").state, "stale"); } finally { f.cleanup(); }
});

const mutations: [string, (s: CodeSnapshot) => void][] = [
  ["duplicate registration", s => s.analysis.registrations.push(s.analysis.registrations[0])],
  ["dangling profile", s => { s.analysis.variants[0].profileId = "absent"; }],
  ["unsupported variant", s => { s.analysis.registrations[0].variantId = "absent"; }],
  ["dangling target", s => { s.analysis.bindings[0].targetId = "absent"; }],
  ["source ownership mismatch", s => { s.analysis.bindings[0].sourceId = "types.ts"; }],
  ["noncallable endpoint", s => { s.analysis.registrations[0].handlerId = "entry.ts"; }],
  ["unknown enum", s => { s.analysis.gaps[0].reason = "guess" as never; }],
  ["fabricated position", s => { s.analysis.registrations[0].occurrence.end = 999999; }],
  ["wrong evidence hash", s => { s.analysis.registrations[0].occurrence.fileHash = "f".repeat(64); }],
  ["missing declaration witness", s => { s.analysis.registrations[0].witnesses = s.analysis.registrations[0].witnesses.filter(w => w.role !== "declaration"); }],
  ["unknown method guessed GET", s => { s.analysis.registrations.at(-1)!.methodState = { state: "unknown", values: ["GET"] } as never; }],
  ["navigation carries HTTP method", s => { const r = s.analysis.registrations.at(-1)!; r.kind = "navigation"; r.id = factId("registration:navigation", r.occurrence, r.variantId, r.rawPattern); s.analysis.candidates = []; }],
  ["unsupported matcher without gap", s => { s.analysis.registrations[0].matcher = { state: "unsupported", gapId: "absent" }; }],
  ["candidate promoted to import", s => { s.relationships.push({ ...s.relationships[0], id: s.analysis.candidates[0].id }); }],
  ["candidate missing uncertainty", s => { s.analysis.candidates[0].reasons = []; }],
  ["candidate overflow hidden", s => { s.analysis.candidates[0].truncated = true; }],
  ["qualified without ledger", s => { s.analysis.capabilities.at(-1)!.state = "qualified"; }],
  ["forbidden config evidence", s => { s.analysis.resources.at(-1)!.path = ".env"; }],
  ["forbidden sensitive directory witness", s => { s.analysis.resources.at(-1)!.path = "secrets/package.json"; for (const r of s.analysis.registrations) for (const w of r.witnesses) if (w.role === "configuration") w.site.file = "secrets/package.json"; for (const b of s.analysis.bindings) for (const w of b.witnesses) if (w.role === "configuration") w.site.file = "secrets/package.json"; }],
  ["source archive field", s => { Object.assign(s.analysis.resources[0], { source: "archived" }); }],
  ["user assumption disguised as verified", s => { s.analysis.assumptions[0].provenance = "verified" as never; }],
];
for (const [name, mutate] of mutations) test("F01-contract rejects " + name, () => { const f = fixture(); try { const s = assessed(f.snapshot); mutate(s); assert.throws(() => validateSnapshot(s)); } finally { f.cleanup(); } });

test("F01-contract: only a matching complete positive/negative/Windows ledger can qualify", () => {
  const f = fixture(); try { const s = assessed(f.snapshot), c = s.analysis.capabilities.at(-1)!; s.analysis.qualifications.push({ id: "fixture-qualification", tupleId: c.tupleId, capabilityId: c.capabilityId, profileId: c.profileId, variantId: c.variantId, extractorVersion: c.extractorVersion, status: "complete", fixtureIds: ["F01-positive", "F01-negative", "F01-windows"], outputHashes: ["a".repeat(64)], gates: { positive: true, negative: true, windows: true } }); c.state = "qualified"; c.qualificationRecord = "fixture-qualification"; assert(validateSnapshot(s)); const mismatch = structuredClone(s); mismatch.analysis.qualifications[0].tupleId = "other-version"; assert.throws(() => validateSnapshot(mismatch)); const incomplete = structuredClone(s); incomplete.analysis.qualifications[0].gates.windows = false as never; assert.throws(() => validateSnapshot(incomplete)); } finally { f.cleanup(); }
});

test("F00-position: original Unicode/BOM/combining/CRLF byte and UTF-16 ranges agree", () => {
  for (const source of ['const label = "😀é"; const value = 1;\r\n', '\uFEFFconst label = "😀é"; const value = 1;\r\n', 'const label = "e\u0301";\r\nconst value = 1;\n']) { const start = source.indexOf("value"), end = start + 5; assert.deepEqual(normalizeRange(source, Buffer.byteLength(source.slice(0, start)), Buffer.byteLength(source.slice(0, end)), "utf8"), normalizeRange(source, start, end, "utf16")); assert.equal(decodeSource(Buffer.from(source)), source); }
  assert.throws(() => normalizeRange("😀", 1, 2, "utf16")); assert.throws(() => normalizeRange("😀", 1, 4, "utf8")); assert.throws(() => normalizeRange("a", 0, 2, "utf16")); assert.throws(() => decodeSource(Uint8Array.of(0xff))); assert.throws(() => decodeSource(Buffer.from('# coding: latin-1\nlabel = "é"'), true)); assert.equal(decodeSource(Buffer.from('# coding: utf-8\nlabel = "é"'), true).includes("é"), true);
});

test("F01-contract: request pins reject old/missing contracts before publication", () => {
  const f = fixture(); try { const base = { version: 1, requestId: "test", jobId: "test", type: "analyze", root: f.root }; assert.throws(() => validateRequest(base)); assert.throws(() => validateRequest({ ...base, snapshotVersion: 2 })); assert.equal(validateRequest({ ...base, snapshotVersion: 3 }).type, "analyze"); assert.equal(validateEvent({ version: 1, requestId: "test", jobId: "test", type: "complete", snapshot: f.snapshot }).type, "complete"); } finally { f.cleanup(); }
});

test("F01-contract: interrupted/failed v2 reanalysis retains payload; atomic v3 publication and future-version protection", () => {
  const f = fixture(), file = path.join(f.root, "analysis.sqlite"), store = new SqliteAnalysisStore(file), db = new DatabaseSync(file);
  try { const repo = store.register(f.root), { analysis: unused, ...base } = f.snapshot; void unused; const payload = JSON.stringify({ ...base, version: 2 }); db.prepare("INSERT INTO snapshots(repository_id,version,payload,updated_at) VALUES (?,2,?,'baseline')").run(repo.repositoryId, payload); assert.equal(store.repository(repo.repositoryId).snapshotState, "incompatible"); assert.throws(() => store.load(repo.repositoryId), /retained/); for (const state of ["cancelled", "failed", "interrupted"] as const) { store.begin(repo.repositoryId, state); store.finish(state, state); assert.equal(db.prepare("SELECT payload FROM snapshots").get()!.payload, payload); }
    store.begin(repo.repositoryId, "rollback"); db.exec("CREATE TRIGGER reject_v3 BEFORE UPDATE ON snapshots BEGIN SELECT RAISE(ABORT,'simulated disk failure'); END"); assert.throws(() => store.publish(repo.repositoryId, "rollback", f.snapshot)); assert.equal(db.prepare("SELECT payload FROM snapshots").get()!.payload, payload); assert.equal(store.loadRetained(repo.repositoryId, 3), null); assert.equal(store.repository(repo.repositoryId).lastJob!.state, "running"); store.finish("rollback", "failed"); db.exec("DROP TRIGGER reject_v3"); store.begin(repo.repositoryId, "v3"); store.publish(repo.repositoryId, "v3", f.snapshot); assert.deepEqual(store.load(repo.repositoryId), f.snapshot); assert.equal(store.loadRetained(repo.repositoryId, 2)!.state, "reanalysis-required"); assert.equal(db.prepare("SELECT value FROM repository_settings WHERE key='retained-snapshot-v2'").get()!.value, payload); assert.deepEqual(store.loadRetained(repo.repositoryId, 3)!.snapshot, f.snapshot); const wrongRoot = structuredClone(f.snapshot); wrongRoot.origin.root = path.dirname(f.root); db.prepare("UPDATE repository_settings SET value=? WHERE key='retained-snapshot-v3'").run(JSON.stringify(wrongRoot)); assert.throws(() => store.loadRetained(repo.repositoryId, 3), /root disagrees/); db.prepare("UPDATE repository_settings SET value=? WHERE key='retained-snapshot-v3'").run(JSON.stringify(f.snapshot));
    db.prepare("UPDATE snapshots SET version=2,payload=?").run(payload); assert.equal(store.repository(repo.repositoryId).snapshotState, "incompatible"); assert.deepEqual(store.loadRetained(repo.repositoryId, 3)!.snapshot, f.snapshot, "v2 writer cannot destroy retained v3"); db.prepare("UPDATE snapshots SET version=4").run(); store.begin(repo.repositoryId, "downgrade"); assert.throws(() => store.publish(repo.repositoryId, "downgrade", f.snapshot), /newer snapshot/); assert.equal(db.prepare("SELECT version FROM snapshots").get()!.version, 4); store.finish("downgrade", "failed"); store.forget(repo.repositoryId); assert.equal(db.prepare("SELECT COUNT(*) AS count FROM repository_settings").get()!.count, 0);
  } finally { db.close(); store.close(); f.cleanup(); }
});

test("F01-contract: uncertainty projection keeps unknown methods, unsupported matcher and user assumptions distinct", () => { const f = fixture(); try { const s = assessed(f.snapshot), p = projectAnalysis(s); assert.equal(p.registrations.at(-1)!.method, "unknown"); assert.equal(p.registrations.at(-1)!.matcher, "unsupported"); assert.equal(p.assumptions[0].label, "User assumption"); assert.equal(p.candidates[0].reasons[0], "unknown-origin"); assert.equal(p.capabilities.at(-1)!.state, "partial"); } finally { f.cleanup(); } });

test("F01-contract: diagnostics render uncertainty and actual evidence buttons check current/stale source", async () => {
  const f = fixture(); try {
    const s = assessed(f.snapshot), require = createRequire(import.meta.url), changes: { state: string; excerpt?: string }[] = [], calls: { command: string; file: string; jobId: string }[] = [];
    let stale = false;
    const source = readFileSync("components/analysis-contracts.tsx", "utf8");
    const compiled = transpileModule(source, { compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.ReactJSX } }).outputText;
    const componentModule = { exports: {} as { AnalysisContractsPanel: (props: { snapshot: CodeSnapshot; jobId: string; busy: boolean }) => ReactElement } };
    const controlledRequire = (name: string): unknown => {
      if (name === "react") return { useState: () => [null, (state: { state: string; excerpt?: string } | null) => { if (state) changes.push(state); }] };
      if (name === "@tauri-apps/api/core") return { invoke: async (command: string, args: { file: string; jobId: string }) => { calls.push({ command, ...args }); return stale ? { state: "stale" } : readEvidence(s, args.file); } };
      if (name.startsWith("@/")) return require(path.resolve(name.replace("@/", "") + ".ts"));
      return require(name);
    };
    // Execute application-owned component code only, with controlled local native API.
    new Function("require", "module", "exports", compiled)(controlledRequire, componentModule, componentModule.exports);
    const tree = componentModule.exports.AnalysisContractsPanel({ snapshot: s, jobId: "fixture-job", busy: false });
    const markup = renderToStaticMarkup(tree); assert.match(markup, /unknown/); assert.match(markup, /matcher unsupported/); assert.match(markup, /Candidate/); assert.match(markup, /User assumption/); assert.match(markup, /partial/);
    const buttons: ReactElement<{ onClick?: () => void; children?: unknown }>[] = [];
    function walk(node: unknown) { if (Array.isArray(node)) { node.forEach(walk); return; } if (!node || typeof node !== "object" || !("props" in node)) return; const element = node as ReactElement<{ onClick?: () => void; children?: unknown }>; if (element.type === "button") buttons.push(element); walk(element.props.children); }
    walk(tree); const configuration = buttons.find(b => String(b.props.children).includes("package.json")); assert(configuration?.props.onClick);
    configuration.props.onClick(); await new Promise<void>(resolve => setImmediate(resolve)); assert.match(changes.at(-1)!.state, /current source/); assert.equal(changes.at(-1)!.excerpt, readFileSync(path.join(f.root, "package.json"), "utf8")); assert.deepEqual(calls.at(-1), { command: "read_evidence", file: "package.json", jobId: "fixture-job" });
    stale = true; configuration.props.onClick(); await new Promise<void>(resolve => setImmediate(resolve)); assert.match(changes.at(-1)!.state, /Stale evidence/); assert.equal(changes.at(-1)!.excerpt, undefined);
  } finally { f.cleanup(); }
});
