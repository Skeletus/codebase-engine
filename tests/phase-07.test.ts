import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createTypescriptRefresh, typescriptAdapter } from "../lib/engine/adapters/typescript.ts";
import { RepositoryRefresh, type RefreshStatus } from "../lib/engine/refresh.ts";
import { SqliteAnalysisStore } from "../lib/storage/sqlite.ts";
import { explanationEvidence } from "../lib/ai/evidence.ts";
import { createBehaviorFixture } from "../scripts/phase06-fixture.ts";
import { validateRequest, validateEvent } from "../lib/desktop/protocol.ts";
import { RepositoryReader } from "../lib/repository/read-policy.ts";

function fixture() {
  const dir = mkdtempSync(path.join(tmpdir(), "phase07 spaces ")), root = path.join(dir, "repo");
  createBehaviorFixture(root);
  return { root, dir, write(file: string, text: string) { writeFileSync(path.join(root, file), text); }, cleanup() { rmSync(dir, { recursive: true, force: true }); } };
}
async function until(predicate: () => boolean) {
  const deadline = Date.now() + 15000;
  while (!predicate()) { if (Date.now() > deadline) throw new Error("Watcher deadline exceeded"); await new Promise((resolve) => setTimeout(resolve, 30)); }
}
test("incremental syntax reuse equals every full snapshot fact after aliases/reexports/conditional call changes", () => {
  const f = fixture();
  try {
    const adapter = createTypescriptRefresh(); adapter.analyze(f.root, true);
    for (const [file, contents] of [
      ["logic/core.ts", 'export function leaf() { return 5; } export function work() { return leaf(); }'],
      ["logic/barrel.ts", 'export { leaf as process } from "./core";'],
      ["app/api/demo/route.ts", 'import { work as run } from "../../../logic/core"; export function GET() { if (true) return run(); }'],
    ]) {
      f.write(file, contents);
      const next = adapter.analyze(f.root, false);
      assert.equal(next.mode, "incremental"); assert.equal(next.parsed, 1); assert(next.reused > 5);
      assert(next.reader.stable()); assert.deepEqual(next.snapshot, typescriptAdapter.analyze(f.root));
    }
  } finally { f.cleanup(); }
});
test("add/delete/rename, syntax skips, config/package/global-framework changes safely rebuild and match full analysis", () => {
  const f = fixture();
  try {
    const adapter = createTypescriptRefresh(); adapter.analyze(f.root, true);
    const mutations = [
      () => f.write("logic/new.ts", "export function newer(){ return 1; }"),
      () => renameSync(path.join(f.root, "logic/core.ts"), path.join(f.root, "logic/renamed.ts")),
      () => rmSync(path.join(f.root, "logic/new.ts")),
      () => f.write("logic/renamed.ts", "export function {"),
      () => f.write("tsconfig.json", JSON.stringify({ compilerOptions: { baseUrl: ".", paths: { "@logic/*": ["moved/*"] } } })),
      () => f.write("package.json", JSON.stringify({ name: "changed", dependencies: {} })),
    ];
    for (const [index, mutate] of mutations.entries()) {
      mutate(); const next = adapter.analyze(f.root, false);
      // A syntax error is parsed incrementally but withheld as a skipped file;
      // topology/config/package changes must escalate without a forced flag.
      assert.equal(next.mode, index === 3 ? "incremental" : "full");
      if (next.mode === "full") assert.equal(next.reused, 0);
      assert.deepEqual(next.snapshot, typescriptAdapter.analyze(f.root));
    }
  } finally { f.cleanup(); }
});
test("protected observations reject concurrent writes, missing-target additions and directory changes", () => {
  const f = fixture();
  try {
    const adapter = createTypescriptRefresh(), first = adapter.analyze(f.root, true);
    assert(first.reader.stable()); f.write("logic/core.ts", "export function leaf(){ return 42; }"); assert.equal(first.reader.stable(), false);
    const second = adapter.analyze(f.root, false); f.write("tsconfig.json", "{}"); assert.equal(second.reader.stable(), false);
    const third = adapter.analyze(f.root, true); f.write("logic/absent.ts", "export function absent(){}"); assert.equal(third.reader.stable(), false);
  } finally { f.cleanup(); }
});
test("a replaced selected root cannot be read through an existing authorized reader", () => {
  const f = fixture();
  try {
    const reader = new RepositoryReader(f.root, {}, f.root);
    renameSync(f.root, f.root + " moved"); mkdirSync(f.root); f.write("a.ts", "export const replacement = 1;");
    assert.equal(reader.stable(), false); assert.equal(reader.metadataStable(), false);
    assert.throws(() => reader.read(path.join(f.root, "a.ts"), "source"), /root changed/);
    assert.throws(() => new RepositoryReader(f.root + " moved", {}, f.root), /identity changed/);
  } finally { f.cleanup(); }
});
test("atomic scheduler rejects stale/cancelled generations and concurrent changes before publication", () => {
  const f = fixture();
  try {
    const adapter = createTypescriptRefresh(); let published = 0;
    const scheduler = new RepositoryRefresh({ analyze: (full) => { const next = adapter.analyze(f.root, full); f.write("logic/core.ts", "export function leaf(){ return 55; }"); return next; }, publish: () => published++, status: () => {} });
    assert.throws(() => scheduler.run(true), /unstable/); assert.equal(published, 0); scheduler.close();
    const cancelled = new RepositoryRefresh({ analyze: (full) => { const next = adapter.analyze(f.root, full); cancelled.pause(); return next; }, publish: () => published++, status: () => {} });
    assert.throws(() => cancelled.run(true), /unstable/); assert.equal(published, 0); cancelled.close();
  } finally { f.cleanup(); }
});
test("actual Windows/platform watcher coalesces edits, handles rename/config/new directories, pauses/loss and full recovery", async () => {
  const f = fixture(), adapter = createTypescriptRefresh(), statuses: RefreshStatus[] = []; let publications = 0;
  const scheduler = new RepositoryRefresh({ analyze: (full) => adapter.analyze(f.root, full), publish: (snapshot) => { assert.deepEqual(snapshot, typescriptAdapter.analyze(f.root)); publications++; }, status: (s) => statuses.push(s), debounceMs: 60, auditMs: 60000 });
  try {
    scheduler.run(true); scheduler.start();
    f.write("logic/core.ts", "export function leaf(){ return 2; } export function work(){ return leaf(); }");
    f.write("logic/core.ts", "export function leaf(){ return 3; } export function work(){ return leaf(); }");
    await until(() => publications >= 2); assert(statuses.some((s) => s.mode === "incremental" && s.reused > 0));
    renameSync(path.join(f.root, "logic/core.ts"), path.join(f.root, "logic/moved.ts")); await until(() => publications >= 3);
    f.write("tsconfig.json", "{}"); await until(() => publications >= 4);
    mkdirSync(path.join(f.root, "new-dir")); f.write("new-dir/a.ts", "export const a = 1"); await until(() => publications >= 5);
    scheduler.loss(); const count = publications; f.write("logic/moved.ts", "export const changed = 1;"); await new Promise((resolve) => setTimeout(resolve, 200)); assert.equal(publications, count); assert.equal(statuses.at(-1)?.state, "degraded");
    scheduler.run(true); scheduler.start(); assert.equal(statuses.at(-1)?.state, "watching");
    scheduler.pause(); assert.equal(statuses.at(-1)?.state, "paused");
  } finally { scheduler.close(); f.cleanup(); }
});
test("unknown/overflow/burst event hints force full analysis; repeated failure degrades without losing prior publication", async () => {
  const f = fixture(); const adapter = createTypescriptRefresh(); let fail = false, published = 0; const statuses: RefreshStatus[] = [];
  const scheduler = new RepositoryRefresh({ analyze: (full) => { if (fail) throw new Error("secret should never be exposed"); return adapter.analyze(f.root, full); }, publish: () => published++, status: (s) => statuses.push(s), debounceMs: 10 });
  try {
    scheduler.run(true); scheduler.start(); for (let i = 0; i < 40; i++) scheduler.enqueue(false);
    await until(() => published === 2); assert.equal(statuses.at(-1)?.mode, "full");
    scheduler.enqueue(true); await until(() => published === 3); assert.equal(statuses.at(-1)?.reused, 0);
    fail = true; scheduler.enqueue(true); await until(() => statuses.at(-1)?.state === "degraded"); assert.equal(published, 3); assert(!JSON.stringify(statuses).includes("secret"));
  } finally { scheduler.close(); f.cleanup(); }
});
test("PID/session cancellation rejects later generation publication and cache digests preserve only matching evidence", () => {
  const f = fixture(); const store = new SqliteAnalysisStore(path.join(f.dir, "local.sqlite"));
  try {
    const repo = store.register(f.root), adapter = createTypescriptRefresh(); const first = adapter.analyze(f.root, true).snapshot;
    store.begin(repo.repositoryId, "session"); store.publish(repo.repositoryId, "session", first);
    const selection = { kind: "file" as const, path: "logic/core.ts" }, old = explanationEvidence(first, selection);
    store.explanationCache(repo.repositoryId, `groq:model:${old.digest}`, "cached");
    const unchanged = adapter.analyze(f.root, false).snapshot; assert.equal(explanationEvidence(unchanged, selection).digest, old.digest);
    f.write("logic/core.ts", readFileSync(path.join(f.root, "logic/core.ts"), "utf8") + "\n// changed\n");
    const next = adapter.analyze(f.root, false).snapshot, digest = explanationEvidence(next, selection).digest;
    assert.notEqual(digest, old.digest); assert.equal(store.explanationCache(repo.repositoryId, `groq:model:${digest}`), null);
    store.begin(repo.repositoryId, "refresh-2-session"); store.finishSession("session", "cancelled", process.pid);
    assert.throws(() => store.publish(repo.repositoryId, "refresh-2-session", next)); assert.deepEqual(store.load(repo.repositoryId), first);
  } finally { store.close(); f.cleanup(); }
});
test("watch transport accepts only bounded authorized-session operations and metrics", () => {
  const base = { version: 1, requestId: "req", jobId: "job" };
  assert.equal(validateRequest({ ...base, type: "watch", action: "start" }).type, "watch");
  assert.throws(() => validateRequest({ ...base, type: "watch", action: "start", root: "C:/private" }));
  const status = { state: "watching", message: "local", mode: "full", parsed: 1, reused: 0, elapsedMs: 10, memoryBytes: 100, snapshotBytes: 500 };
  assert.equal(validateEvent({ ...base, type: "watch", status }).type, "watch");
  assert.throws(() => validateEvent({ ...base, type: "watch", status: { ...status, source: "private" } }));
  assert.throws(() => validateEvent({ ...base, type: "watch", status: { ...status, parsed: -1 } }));
});
