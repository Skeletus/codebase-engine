import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, realpathSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createBehaviorFixture } from "../scripts/phase06-fixture.ts";
import { typescriptAdapter } from "../lib/engine/adapters/typescript.ts";
import { validateSnapshot, serializeSnapshot, deserializeSnapshot } from "../lib/engine/contract.ts";
import { traceCalls } from "../lib/engine/behavior.ts";
import { readEvidence } from "../lib/engine/index.ts";
import { explanationEvidence } from "../lib/ai/evidence.ts";
import { SqliteAnalysisStore } from "../lib/storage/sqlite.ts";

function fixture() {
  const directory = realpathSync.native(mkdtempSync(path.join(tmpdir(), "phase06 static spaces "))), root = path.join(directory, "repository with spaces");
  createBehaviorFixture(root);
  const snapshot = typescriptAdapter.analyze(root);
  const entity = (name: string, file?: string) => { const d = snapshot.behavior.declarations.filter((d) => d.name === name && (!file || d.site.file === file)); assert.equal(d.length, 1, `unique ${name} in ${file}`); return d[0]; };
  return { directory, root, snapshot, entity, cleanup() { assert(path.basename(directory).startsWith("phase06 static spaces ")); rmSync(directory, { recursive: true, force: true }); } };
}
test("static calls resolve local/imported aliases, named reexports, defaults and JavaScript without type dependencies", () => {
  const f = fixture(); try {
    const { snapshot: s, entity } = f, calls = s.behavior.relations.filter((r) => r.relation === "calls");
    assert(calls.some((r) => r.source === entity("GET", "app/api/demo/route.ts").id && r.target === entity("work").id));
    assert(calls.some((r) => r.source === entity("work").id && r.target === entity("leaf", "logic/core.ts").id && r.conditional));
    assert(calls.some((r) => r.source === entity("invoke", "logic/default-use.ts").id && r.target === entity("defaultWork").id));
    assert(calls.some((r) => r.source === entity("jsCaller").id && r.target === entity("jsLeaf").id));
    assert(s.behavior.relations.some((r) => r.relation === "references" && r.target === entity("work").id));
    assert(s.relationships.some((r) => r.source === "app/api/demo/route.ts" && r.target === "logic/barrel.ts"));
    assert.equal(serializeSnapshot(deserializeSnapshot(serializeSnapshot(s))), serializeSnapshot(s));
    assert.deepEqual(typescriptAdapter.analyze(f.root).behavior, s.behavior, "snapshot-scoped identities and ordering are stable");
  } finally { f.cleanup(); }
});
test("shadowed, duplicated, mutable, skipped, missing and receiver bindings never become fabricated calls", () => {
  const f = fixture(); try {
    const calls = f.snapshot.behavior.relations.filter((r) => r.relation === "calls");
    for (const [name, file] of [["shadow", "logic/shadow.ts"], ["invoke", "logic/duplicate.ts"], ["invoke", "logic/mutable.ts"], ["invoke", "logic/missing.ts"], ["POST", "app/api/demo/route.ts"]]) {
      const d = f.entity(name, file); assert(!calls.some((r) => r.source === d.id), file);
      assert(f.snapshot.behavior.gaps.some((g) => g.source === d.id), file);
    }
    const nested = f.entity("nested"); const call = calls.find((r) => r.source === nested.id)!;
    assert(call); assert.notEqual(call.target, f.entity("leaf", "logic/core.ts").id);
    assert(f.snapshot.diagnostics.some((d) => d.path === "logic/hidden.d.ts"));
    assert(f.snapshot.coverage.relationships.unresolved > 0);
    writeFileSync(path.join(f.root, "logic/star.ts"), 'export * from "./core"; export * from "./default";');
    writeFileSync(path.join(f.root, "logic/star-use.ts"), 'import { leaf } from "./star"; export function starCaller() { leaf(); }');
    const star = typescriptAdapter.analyze(f.root); const d = star.behavior.declarations.find((d) => d.name === "starCaller")!;
    assert(!star.behavior.relations.some((r) => r.source === d.id && r.relation === "calls")); assert(star.behavior.gaps.some((g) => g.source === d.id));
  } finally { f.cleanup(); }
});
test("existing Next and Nest route declarations bind uniquely; computed handlers remain explicit gaps", () => {
  const f = fixture(); try {
    const s = f.snapshot, bindings = s.behavior.handlers;
    assert.equal(bindings.length, s.routes.length); assert(s.routes.length >= 5);
    for (const h of bindings) {
      assert.equal(h.site.file, s.routes[h.route].file);
      if (s.routes[h.route].file === "app/api/gap/route.ts") { assert.equal(h.target, null); assert(h.reason); }
      else { assert(h.target); assert.equal(h.reason, null); }
    }
    assert(bindings.some((h) => s.routes[h.route].file === "app/api/alias/route.ts" && h.target === f.entity("work").id));
    assert(bindings.some((h) => s.routes[h.route].file === "nest/controller.ts" && h.target === f.entity("read").id));
  } finally { f.cleanup(); }
});
test("same-line handlers retain exact binding ranges and duplicate methods/indirect reassignments remain withheld", () => {
  const f = fixture(); try {
    writeFileSync(path.join(f.root, "app/api/alias/route.ts"), 'export function GET() { return 1; } export function POST() { return 2; }');
    writeFileSync(path.join(f.root, "nest/controller.ts"), 'import { Controller, Get } from "@nestjs/common";\n@Controller("demo")\nexport class Demo {\n@Get("leaf") read() { return 1; }\nread() { return 2; }\n}');
    writeFileSync(path.join(f.root, "logic/mutable.ts"), 'function original() { return 1; }\n[original] = [() => 2];\nexport function invoke() { return original(); }');
    const s = typescriptAdapter.analyze(f.root);
    for (const h of s.behavior.handlers.filter((h) => s.routes[h.route].file === "app/api/alias/route.ts")) {
      const text = readFileSync(path.join(f.root, h.site.file), "utf8").slice(h.site.start, h.site.end);
      assert(text.startsWith(`export function ${s.routes[h.route].method}()`)); assert(h.target);
    }
    const nest = s.behavior.handlers.find((h) => s.routes[h.route].file === "nest/controller.ts")!; assert(nest); assert.equal(nest.target, null);
    const invoke = s.behavior.declarations.find((d) => d.name === "invoke" && d.site.file === "logic/mutable.ts")!;
    assert(!s.behavior.relations.some((r) => r.source === invoke.id && r.relation === "calls"));
    assert(s.behavior.gaps.some((g) => g.source === invoke.id));
  } finally { f.cleanup(); }
});
test("reference initializers retain lexical targets while receiver type guesses never establish method references/calls", () => {
  const f = fixture(); try {
    writeFileSync(path.join(f.root, "logic/receiver.ts"), 'import { leaf } from "./core";\nexport const alias = leaf;\nclass Service { run() { return 1; } }\nexport function invoke(service: Service) { return service.run(); }');
    const s = typescriptAdapter.analyze(f.root), run = s.behavior.declarations.find((d) => d.name === "run")!;
    assert(run); assert(!s.behavior.relations.some((r) => r.target === run.id));
    const references = s.behavior.relations.filter((r) => r.site.file === "logic/receiver.ts" && r.relation === "references");
    const leaf = s.behavior.declarations.find((d) => d.name === "leaf" && d.site.file === "logic/core.ts")!;
    assert(references.some((r) => r.target === leaf.id && r.site.line === 2));
    assert(!references.some((r) => r.target === leaf.id && r.site.line === 1), "an import binding is not a usage reference");
    assert(s.behavior.gaps.some((g) => g.site.file === "logic/receiver.ts" && g.reason.includes("receiver")));
  } finally { f.cleanup(); }
});
test("decorators, class initializers, getters and default parameters never become enclosing handler/body calls", () => {
  const f = fixture(); try {
    writeFileSync(path.join(f.root, "nest/controller.ts"), 'import { Controller, Get } from "@nestjs/common";\nimport { leaf } from "../logic/core";\n@Controller("demo")\nexport class Demo {\n@Get("leaf") @leaf() read() { return 1; }\n}');
    writeFileSync(path.join(f.root, "logic/ownership.ts"), 'import { leaf } from "./core";\nexport function outer(value = leaf()) {\nclass Nested { field = leaf(); get read() { return leaf(); } }\nreturn Nested;\n}\n');
    const s = typescriptAdapter.analyze(f.root), read = s.behavior.declarations.find((d) => d.name === "read" && d.site.file === "nest/controller.ts")!, outer = s.behavior.declarations.find((d) => d.name === "outer")!;
    assert(s.behavior.handlers.some((h) => h.target === read.id));
    for (const d of [read, outer]) {
      const trace = traceCalls(s, d.id); assert.equal(trace.calls.length, 0);
      assert(trace.gaps.some((g) => g.source === null && g.reason.includes("ownership")));
    }
    assert(s.behavior.relations.filter((r) => r.relation === "calls" && r.site.file === "logic/ownership.ts").every((r) => r.source === null));
  } finally { f.cleanup(); }
});
test("route bindings follow actual framework provenance and exact verb imports, including same-line decorators", () => {
  const f = fixture(); try {
    writeFileSync(path.join(f.root, "nest/route.ts"), 'import { Controller, Get, Post as Write } from "@nestjs/common";\n@Controller("extra")\nexport class Example { @Get("same") @Write("same") action() { return 1; } }');
    const s = typescriptAdapter.analyze(f.root), bindings = s.behavior.handlers.filter((h) => h.site.file === "nest/route.ts");
    assert.equal(bindings.length, 2);
    const text = readFileSync(path.join(f.root, "nest/route.ts"), "utf8");
    for (const h of bindings) { assert(h.target); assert.equal(s.behavior.declarations.find((d) => d.id === h.target)?.name, "action"); assert.equal(text.slice(h.site.start, h.site.end), s.routes[h.route].method === "GET" ? '@Get("same")' : '@Write("same")'); }
  } finally { f.cleanup(); }
});
test("a shared virtual compiler namespace never manufactures implicit cross-file/package global calls", () => {
  const f = fixture(); try {
    writeFileSync(path.join(f.root, "logic/global-one.ts"), 'function globalLeaf() { return 1; }');
    writeFileSync(path.join(f.root, "logic/global-two.ts"), 'function localLeaf() { return 2; }\nfunction globalCaller() { globalLeaf(); localLeaf(); }');
    const s = typescriptAdapter.analyze(f.root), caller = s.behavior.declarations.find((d) => d.name === "globalCaller")!, leaf = s.behavior.declarations.find((d) => d.name === "localLeaf")!;
    const calls = traceCalls(s, caller.id).calls;
    assert.equal(calls.length, 1); assert.equal(calls[0].target, leaf.id);
    assert(s.behavior.gaps.some((g) => g.source === caller.id && g.reason.includes("implicit cross-file global")));
  } finally { f.cleanup(); }
});
test("bounded traces terminate on recursion, disclose limits and preserve canonical source witnesses and test candidates", () => {
  const f = fixture(); try {
    const s = f.snapshot, target = f.entity("GET", "app/api/demo/route.ts").id, result = traceCalls(s, target);
    assert(result.repeatedTargets > 0); assert(result.calls.length >= 5);
    for (const r of result.calls) {
      assert(s.behavior.relations.includes(r)); assert(result.declarations.some((d) => d.id === r.target));
      const source = readFileSync(path.join(f.root, r.site.file), "utf8"); assert(source.slice(r.site.start, r.site.end).includes("("));
      assert.equal(readEvidence(s, r.site.file).state, "current"); assert.equal(r.site.fileHash, s.files.find((f) => f.path === r.site.file)!.hash);
    }
    assert(traceCalls(s, target, 0).beyondDepth > 0); assert(traceCalls(s, target, 8, 1).beyondBudget > 0);
    assert.throws(() => traceCalls(s, "unknown")); assert.throws(() => traceCalls(s, target, 33));
    assert(result.testCandidates.some((c) => c.file === "logic/route.test.ts" && c.dependencyPath.length));
    assert(!result.testCandidates.some((c) => c.file === "logic/unrelated.test.ts"));
    const post = traceCalls(s, f.entity("POST", "app/api/demo/route.ts").id); assert.equal(post.calls.length, 0); assert(post.gaps.some((g) => g.reason.includes("receiver")));
    writeFileSync(path.join(f.root, "app/api/demo/route.ts"), "changed"); assert.equal(readEvidence(s, "app/api/demo/route.ts").state, "stale");
  } finally { f.cleanup(); }
});
test("symbol validator rejects forged provenance/owners/targets and missing rich snapshots; SQLite retains old complete data until refresh", () => {
  const f = fixture(); const file = path.join(f.directory, "local.sqlite"), store = new SqliteAnalysisStore(file);
  try {
    const s = f.snapshot;
    for (const mutate of [
      (v: typeof s) => { v.behavior.declarations[0].site.fileHash = "f".repeat(64); },
      (v: typeof s) => { v.behavior.relations[0].target = "missing"; },
      (v: typeof s) => { v.behavior.relations[0].site.end = 9999999; },
      (v: typeof s) => { v.behavior.handlers.pop(); },
    ]) { const forged = structuredClone(s); mutate(forged); assert.throws(() => validateSnapshot(forged)); }
    const repo = store.register(f.root); store.begin(repo.repositoryId, "initial"); store.publish(repo.repositoryId, "initial", s);
    assert.deepEqual(store.load(repo.repositoryId)?.behavior, s.behavior);
    const old = { ...s, version: 1, behavior: undefined }, raw = JSON.stringify(old), db = new DatabaseSync(file);
    db.prepare("UPDATE snapshots SET version=1,payload=? WHERE repository_id=?").run(raw, repo.repositoryId); db.close();
    assert.equal(store.repository(repo.repositoryId).snapshotState, "incompatible"); assert.throws(() => store.load(repo.repositoryId), /incompatible/);
    store.begin(repo.repositoryId, "failed"); store.finish("failed", "failed");
    const retained = new DatabaseSync(file); assert.equal(retained.prepare("SELECT payload FROM snapshots WHERE repository_id=?").get(repo.repositoryId)!.payload, raw); retained.close();
    store.begin(repo.repositoryId, "refresh"); store.publish(repo.repositoryId, "refresh", s); assert.equal(store.repository(repo.repositoryId).snapshotState, "compatible");
  } finally { store.close(); f.cleanup(); }
});
test("optional richer explanations are bounded, metadata-only, cited through hash-checked files and exact-payload digest", () => {
  const f = fixture(); try {
    const result = explanationEvidence(f.snapshot, { kind: "file", path: "app/api/demo/route.ts" }), body = JSON.parse(result.payload);
    assert.equal(body.version, 2); assert(body.behavior.symbols.length > 0); assert(body.behavior.handlers.length > 0);
    assert(body.behaviorOmissions.symbols >= 0); assert(Buffer.byteLength(result.payload) <= 6000);
    assert.doesNotMatch(result.payload, /return perform|const receiver|D:\\|origin|"root"/); assert(!result.payload.includes(f.root));
    for (const symbol of body.behavior.symbols) { assert(result.ids.includes(symbol.citation)); assert(result.files.includes(symbol.file)); }
    assert(body.limits.includes("never temporal order"));
    assert.notEqual(result.digest, explanationEvidence(f.snapshot, { kind: "file", path: "logic/core.ts" }).digest);
  } finally { f.cleanup(); }
});
