import assert from "node:assert/strict";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, mkdirSync, realpathSync, writeFileSync, rmSync, readFileSync, existsSync, renameSync } from "node:fs";
import { spawn } from "node:child_process";
import { once } from "node:events";
import path from "node:path";
import { tmpdir } from "node:os";
import { SqliteAnalysisStore, migrate } from "../lib/storage/sqlite.ts";
import { analyzeLocalRepository, readEvidence } from "../lib/engine/index.ts";
import { typescriptAdapter } from "../lib/engine/adapters/typescript.ts";
import { validateEvent, type EngineEvent } from "../lib/desktop/protocol.ts";
import { validateStorageRequest } from "../lib/desktop/storage-protocol.ts";
import { runInNewContext } from "node:vm";

function fixture() {
  const directory = realpathSync(mkdtempSync(path.join(tmpdir(), "cartograph durable test ")));
  const root = path.join(directory, "repository with spaces"), file = path.join(directory, "analysis.sqlite");
  mkdirSync(root);
  writeFileSync(path.join(root, "a.ts"), 'import { b } from "./b"; export const a = b;\n');
  writeFileSync(path.join(root, "b.ts"), "export const b = 1;\n");
  writeFileSync(path.join(root, "tsconfig.json"), '{"extends":"./missing-config.json"}');
  const store = new SqliteAnalysisStore(file), repo = store.register(root);
  const snapshot = analyzeLocalRepository(root, typescriptAdapter);
  return { directory, root, file, store, repo, snapshot, cleanup() { store.close(); assert(path.basename(directory).startsWith("cartograph durable test ")); rmSync(directory, { recursive: true, force: true }); } };
}
test("SQLite round trips canonical evidence, full diagnostics, registrations, settings and outcomes", () => {
  const f = fixture();
  try {
    assert(f.snapshot.diagnostics.some((d) => d.category.includes("config")), "fixture must exercise config diagnostics");
    assert.equal(f.store.register(f.root).repositoryId, f.repo.repositoryId);
    assert.equal(f.store.settings("light").theme, "light");
    assert.equal(f.store.settings("dark").theme, "light", "browser cache is imported once, never authoritative after SQLite initialization");
    f.store.begin(f.repo.repositoryId, "first"); f.store.publish(f.repo.repositoryId, "first", f.snapshot);
    f.store.setTheme("dark");
    const reopened = new SqliteAnalysisStore(f.file);
    try {
      assert.deepEqual(reopened.load(f.repo.repositoryId), f.snapshot);
      assert.equal(reopened.settings().theme, "dark");
      assert.equal(reopened.list()[0].lastJob?.state, "complete");
      assert.equal(reopened.list()[0].snapshotState, "compatible");
      const raw = readFileSync(f.file);
      assert(!raw.includes(Buffer.from('export const b = 1;')), "source contents must not be archived");
    } finally { reopened.close(); }
  } finally { f.cleanup(); }
});
test("failed/cancelled refresh, ownership conflicts and failed publication preserve the last complete result", () => {
  const f = fixture(), other = new SqliteAnalysisStore(f.file);
  try {
    f.store.begin(f.repo.repositoryId, "first"); f.store.publish(f.repo.repositoryId, "first", f.snapshot);
    f.store.begin(f.repo.repositoryId, "refresh");
    assert.throws(() => other.begin(f.repo.repositoryId, "conflict"), /Another refresh/);
    assert.throws(() => other.forget(f.repo.repositoryId), /Cancel/);
    other.finish("refresh", "cancelled", process.pid + 1);
    assert.equal(f.store.repository(f.repo.repositoryId).lastJob?.state, "running", "a different engine cannot revoke ownership");
    other.finish("refresh", "cancelled");
    assert.throws(() => f.store.publish(f.repo.repositoryId, "refresh", f.snapshot), /ownership/);
    assert.deepEqual(f.store.load(f.repo.repositoryId), f.snapshot);
    f.store.begin(f.repo.repositoryId, "failure"); f.store.finish("failure", "failed");
    assert.equal(f.store.repository(f.repo.repositoryId).lastJob?.state, "failed");
    const injection = new DatabaseSync(f.file);
    injection.exec("CREATE TRIGGER reject_publish BEFORE UPDATE ON snapshots BEGIN SELECT RAISE(ABORT,'simulated disk failure'); END");
    f.store.begin(f.repo.repositoryId, "publish-failure");
    const changed = structuredClone(f.snapshot); changed.files[0].exports.push("new_export");
    assert.throws(() => f.store.publish(f.repo.repositoryId, "publish-failure", changed), /simulated/);
    assert.deepEqual(f.store.load(f.repo.repositoryId), f.snapshot);
    assert.equal(f.store.repository(f.repo.repositoryId).lastJob?.state, "running", "job and snapshot transaction must roll back together");
    f.store.finish("publish-failure", "failed"); injection.close();
  } finally { other.close(); f.cleanup(); }
});
test("schema upgrade failure rolls back and future versions/incomplete snapshots are retained and rejected", () => {
  const f = fixture();
  try {
    f.store.begin(f.repo.repositoryId, "first"); f.store.publish(f.repo.repositoryId, "first", f.snapshot);
    const db = new DatabaseSync(f.file);
    try {
      const schemaVersion = Number(db.prepare("PRAGMA user_version").get()?.user_version);
      assert.throws(() => migrate(db, [...Array<string>(schemaVersion).fill(""), "CREATE TABLE new_table(id TEXT); INVALID SQL"]));
      assert.equal(db.prepare("PRAGMA user_version").get()?.user_version, schemaVersion);
      assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name='new_table'").get(), undefined);
      const old = JSON.stringify(f.snapshot);
      db.prepare("UPDATE snapshots SET version=99 WHERE repository_id=?").run(f.repo.repositoryId);
      assert.throws(() => f.store.load(f.repo.repositoryId), /incompatible/);
      assert.equal(db.prepare("SELECT payload FROM snapshots").get()?.payload, old);
      db.prepare("UPDATE snapshots SET version=1,payload=?").run('{"version":1}');
      assert.equal(f.store.repository(f.repo.repositoryId).snapshotState, "incompatible");
      assert.throws(() => f.store.load(f.repo.repositoryId), /incompatible/);
      db.exec("PRAGMA user_version=99");
      assert.throws(() => new SqliteAnalysisStore(f.file), /newer application/);
      assert.equal(db.prepare("PRAGMA user_version").get()?.user_version, 99);
    } finally { db.close(); }
  } finally { f.cleanup(); }
});
test("missing roots and changed/deleted evidence remain historical; forgetting cascades local records only", () => {
  const f = fixture();
  try {
    f.store.begin(f.repo.repositoryId, "first"); f.store.publish(f.repo.repositoryId, "first", f.snapshot);
    writeFileSync(path.join(f.root, "b.ts"), "export const b = 2;\n");
    assert.equal(readEvidence(f.store.load(f.repo.repositoryId)!, "b.ts").state, "stale");
    rmSync(path.join(f.root, "b.ts"));
    assert.equal(readEvidence(f.snapshot, "b.ts").state, "stale");
    renameSync(f.root, f.root + " moved");
    assert(!f.store.repository(f.repo.repositoryId).available);
    assert.deepEqual(f.store.load(f.repo.repositoryId), f.snapshot);
    assert.equal(readEvidence(f.snapshot, "a.ts").state, "stale");
    const db = new DatabaseSync(f.file);
    db.prepare("INSERT INTO repository_settings VALUES (?,'example','value')").run(f.repo.repositoryId);
    f.store.forget(f.repo.repositoryId);
    for (const table of ["repositories", "snapshots", "jobs", "repository_settings"]) assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()?.n, 0);
    db.close();
    assert(existsSync(path.join(f.root + " moved", "a.ts")));
  } finally { f.cleanup(); }
});
test("crashing during a SQLite publication rolls back and dead job owners recover as interrupted", async () => {
  const f = fixture();
  try {
    f.store.begin(f.repo.repositoryId, "first"); f.store.publish(f.repo.repositoryId, "first", f.snapshot);
    const child = spawn(process.execPath, ["--input-type=module", "-e", `import {DatabaseSync} from 'node:sqlite';
      const db=new DatabaseSync(process.env.TEST_DB); db.exec('PRAGMA foreign_keys=ON');
      db.prepare("INSERT INTO jobs VALUES (?,?, 'running',?, 'now',NULL)").run('crash',process.env.TEST_REPO,process.pid);
      db.exec('BEGIN IMMEDIATE'); db.prepare('UPDATE snapshots SET payload=?').run('{}');
      process.stdout.write('transaction-open\\n'); setInterval(()=>{},1000);`], { env: { NODE_ENV: "production", TEST_DB: f.file, TEST_REPO: f.repo.repositoryId }, stdio: ["ignore", "pipe", "pipe"] });
    const watchdog = setTimeout(() => child.kill(), 10000);
    try {
      await once(child.stdout, "data"); const exit = once(child, "exit"); child.kill("SIGKILL"); await exit;
    } finally { clearTimeout(watchdog); }
    f.store.recover();
    assert.equal(f.store.repository(f.repo.repositoryId).lastJob?.state, "interrupted");
    assert.deepEqual(f.store.load(f.repo.repositoryId), f.snapshot);
    f.store.begin(f.repo.repositoryId, "retry"); f.store.publish(f.repo.repositoryId, "retry", f.snapshot);
    assert.equal(f.store.repository(f.repo.repositoryId).lastJob?.state, "complete");
  } finally { f.cleanup(); }
});
async function sidecar(f: ReturnType<typeof fixture>, reopen: boolean, identity: string) {
  const child = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", path.resolve("scripts/sidecar.ts")], {
    env: { NODE_ENV: "production", PATH: "", CODE_INTELLIGENCE_ROOT: f.repo.root, CODE_INTELLIGENCE_DB: f.file, CODE_INTELLIGENCE_REPOSITORY: f.repo.repositoryId }, stdio: ["pipe", "pipe", "pipe"],
  });
  let buffer = "", complete: EngineEvent | undefined;
  child.stdout.on("data", (bytes: Buffer) => { buffer += bytes.toString(); while (buffer.includes("\n")) {
    const end = buffer.indexOf("\n"), event = validateEvent(JSON.parse(buffer.slice(0, end))); buffer = buffer.slice(end + 1);
    if (event.type === "complete" || event.type === "error") { complete = event; child.stdin.end(); }
  } });
  const timeout = setTimeout(() => child.kill(), 20000), exit = once(child, "exit");
  child.stdin.write(JSON.stringify({ version: 1, requestId: identity, jobId: identity, ...(reopen ? { type: "reopen" } : { type: "analyze", root: f.repo.root }) }) + "\n");
  const [code] = await exit; clearTimeout(timeout);
  assert.equal(code, 0); assert(complete?.type === "complete", JSON.stringify(complete));
  return complete.snapshot;
}
test("private process restart reopens SQLite offline without parsing, including an unavailable root", async () => {
  const f = fixture();
  try {
    const original = await sidecar(f, false, "initial");
    rmSync(path.join(f.root, "a.ts"));
    assert.deepEqual(await sidecar(f, true, "reopen"), original, "reopen cannot reparse changed files");
    renameSync(f.root, f.root + " moved");
    assert.deepEqual(await sidecar(f, true, "historical"), original);
    assert.equal(f.store.repository(f.repo.repositoryId).lastJob?.state, "complete");
  } finally { f.cleanup(); }
});
test("cancelling the actual persistent engine preserves its previous complete snapshot and records the owner outcome", async () => {
  const f = fixture();
  let child: ReturnType<typeof spawn> | undefined;
  try {
    f.store.begin(f.repo.repositoryId, "first"); f.store.publish(f.repo.repositoryId, "first", f.snapshot);
    for (let i = 0; i < 500; i++) writeFileSync(path.join(f.root, `file-${i}.ts`), "export const x = 1;\n");
    child = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", path.resolve("scripts/sidecar.ts")], {
      env: { NODE_ENV: "production", PATH: "", CODE_INTELLIGENCE_ROOT: f.repo.root, CODE_INTELLIGENCE_DB: f.file, CODE_INTELLIGENCE_REPOSITORY: f.repo.repositoryId }, stdio: ["pipe", "pipe", "pipe"],
    });
    const ownerPid = child.pid; assert.equal(typeof ownerPid, "number");
    assert(child.stdout && child.stdin);
    const progress = once(child.stdout, "data"), exit = once(child, "exit");
    child.stdin.write(JSON.stringify({ version: 1, requestId: "cancel", jobId: "cancel", type: "analyze", root: f.repo.root }) + "\n");
    const watchdog = setTimeout(() => child?.kill(), 15000);
    try {
      const [bytes] = await progress;
      assert(String(bytes).includes('"stage":"select"'));
      child.kill("SIGKILL"); await exit;
    } finally { clearTimeout(watchdog); }
    f.store.finish("cancel", "cancelled", ownerPid);
    assert.equal(f.store.repository(f.repo.repositoryId).lastJob?.state, "cancelled");
    assert.deepEqual(f.store.load(f.repo.repositoryId), f.snapshot);
  } finally { if (child?.exitCode === null && child.signalCode === null) child.kill(); f.cleanup(); }
});
test("storage protocol denies arbitrary filesystem/SQL/provider operations and injected roots", () => {
  for (const request of [ { version: 99, type: "list" }, { version: 1, type: "sql", sql: "DROP" }, { version: 1, type: "register", root: "C:/private" }, { version: 1, type: "lookup", repositoryId: "../../outside" }, { version: 1, type: "theme", theme: "secret" }, { version: 1, type: "list", database: "outside.sqlite" } ]) assert.throws(() => validateStorageRequest(request));
  assert.equal(validateStorageRequest({ version: 1, type: "forget", repositoryId: "local-1" }).type, "forget");
});

test("native startup watchdog displays bounded recovery when hydration fails and clears after readiness", () => {
  const script = readFileSync("lib/desktop/startup.js", "utf8");
  function harness() {
    let timer: (() => void) | undefined, ready: (() => void) | undefined;
    let milliseconds = 0, reloaded = false, cleared = false;
    class Element {
      id = ""; textContent = ""; style = { cssText: "" }; removed = false;
      children: Element[] = []; click?: () => void;
      setAttribute() {} append(...items: Element[]) { this.children.push(...items); }
      addEventListener(_event: string, callback: () => void) { this.click = callback; }
      remove() { this.removed = true; }
    }
    const body = new Element();
    runInNewContext(script, {
      document: { body, createElement: () => new Element() },
      window: { addEventListener: (_event: string, callback: () => void) => { ready = callback; } },
      location: { reload: () => { reloaded = true; } },
      setTimeout: (callback: () => void, ms: number) => { timer = callback; milliseconds = ms; return 1; },
      clearTimeout: () => { cleared = true; },
    });
    return { body, tick: () => timer?.(), ready: () => ready?.(), state: () => ({ milliseconds, reloaded, cleared }) };
  }
  const failed = harness(); assert.equal(failed.state().milliseconds, 15000);
  failed.tick(); assert.equal(failed.body.children[0].id, "desktop-startup-error");
  assert.match(failed.body.children[0].children[1].textContent, /have not been deleted/);
  failed.body.children[0].children[2].click?.(); assert(failed.state().reloaded);
  failed.ready(); assert(failed.state().cleared); assert(failed.body.children[0].removed);
  const healthy = harness(); healthy.ready(); healthy.tick(); assert.equal(healthy.body.children.length, 0);
});
