import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, mkdirSync, realpathSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { spawn } from "node:child_process";
import { typescriptAdapter } from "../lib/engine/adapters/typescript.ts";
import { readEvidence } from "../lib/engine/index.ts";
import { investigate, verifyInvestigation, validateInvestigation, type Intent, type InvestigationResult } from "../lib/engine/investigations.ts";
import { validateMeasurement } from "../lib/storage/measurements.ts";
import { SqliteAnalysisStore } from "../lib/storage/sqlite.ts";
import { validateStorageRequest } from "../lib/desktop/storage-protocol.ts";
import { validateEvent, validateRequest, type EngineEvent } from "../lib/desktop/protocol.ts";

function fixture(empty = false) {
  const directory = realpathSync.native(mkdtempSync(path.join(tmpdir(), "cartograph pilot test ")));
  const root = path.join(directory, "repository with spaces"); mkdirSync(root);
  if (!empty) {
    const sources = {
      "entry.ts": 'import "./a"; import "./b"; import type { Kind } from "./types"; export const entry = 1;',
      "a.ts": 'import "./common"; export const a = 1;', "b.ts": 'import "./common"; export const b = 1;',
      "common.ts": 'import "./a"; export const common = 1;', "types.ts": 'export type Kind = string;',
      "feature.test.ts": 'import type { Kind } from "./types"; export const test = 1;',
      "self.ts": 'import "./self"; export const self = 1;', "disconnected.ts": 'export const alone = 1;',
      "one/shared.ts": 'export const shared = 1;', "two/shared.ts": 'export const shared = 2;',
      "unresolved.ts": 'const name = "unknown"; export const promise = import(name);',
      "app/api/hello/route.ts": 'export function GET() { return new Response("hello"); }',
    };
    writeFileSync(path.join(root, "package.json"), '{"dependencies":{"next":"16.3.6"}}');
    for (const [file, source] of Object.entries(sources)) { const target = path.join(root, file); mkdirSync(path.dirname(target), { recursive: true }); writeFileSync(target, source); }
    writeFileSync(path.join(root, ".env"), "sensitive-input-must-not-enter-analysis");
  }
  const snapshot = typescriptAdapter.analyze(root);
  const ask = (intent: Intent, target = "entry.ts", depth = 64, budget = 200) => investigate(snapshot, { operation: "ask", intent, target, depth, budget });
  return { directory, root, snapshot, ask, cleanup() { assert(path.basename(directory).startsWith("cartograph pilot test ")); rmSync(directory, { recursive: true, force: true }); } };
}
function witnesses(f: ReturnType<typeof fixture>, result: InvestigationResult, incoming = false) {
  const edges = new Map(f.snapshot.relationships.map((r) => [r.id, r]));
  for (const row of result.rows) {
    assert.equal(row.witness.length, row.distance); let previous = incoming ? row.file : result.target;
    for (const id of row.witness) { const edge = edges.get(id); assert(edge, "every step must exist in the snapshot"); assert.equal(edge.source, previous); previous = edge.target; }
    assert.equal(previous, incoming ? result.target : row.file);
  }
}
test("pilot traces and impact have deterministic shortest verified witnesses across cycles and type-only edges", () => {
  const f = fixture();
  try {
    const trace = f.ask("trace"); witnesses(f, trace);
    assert.equal(trace.rows.find((r) => r.file === "common.ts")?.distance, 2);
    const impact = f.ask("dependents", "common.ts"); witnesses(f, impact, true);
    assert.equal(impact.rows.find((r) => r.file === "entry.ts")?.distance, 2);
    const types = f.ask("dependents", "types.ts"); witnesses(f, types, true);
    assert(types.rows.some((r) => r.file === "entry.ts")); assert(types.rows.some((r) => r.file === "feature.test.ts"));
    assert(types.rows.every((r) => r.witness.some((id) => f.snapshot.relationships.find((e) => e.id === id)?.typeOnly)));
    assert.equal(f.ask("trace", "self.ts").rows.length, 0);
    assert(f.snapshot.relationships.some((r) => r.source === "self.ts" && r.target === "self.ts"));
    assert.equal(f.ask("trace", "disconnected.ts").rows.length, 0);
    assert.deepEqual(f.ask("trace"), trace, "ties and output must be stable");
  } finally { f.cleanup(); }
});
test("depth and result budgets disclose exact omissions without truncating traversal truth", () => {
  const f = fixture();
  try {
    const all = f.ask("dependencies"), zero = f.ask("dependencies", "entry.ts", 0), one = f.ask("dependencies", "entry.ts", 64, 1);
    assert.equal(zero.rows.length, 0); assert.equal(zero.beyondDepth, all.rows.length);
    assert.equal(one.rows.length, 1); assert.equal(one.beyondBudget, all.rows.length - 1);
    const first = f.ask("dependencies", "entry.ts", 1); assert(first.beyondDepth > 0); witnesses(f, first);
    assert(f.snapshot.diagnostics.length > 0); assert.equal(first.boundaryIndices.length, f.snapshot.diagnostics.length);
    assert.doesNotMatch(JSON.stringify(all), /sensitive-input-must-not-enter-analysis/);
  } finally { f.cleanup(); }
});
test("search and structural Ask disambiguate real paths and export names and withhold unsupported answers", () => {
  const f = fixture();
  try {
    const before = JSON.stringify(f.snapshot);
    const search = investigate(f.snapshot, { operation: "search", text: "shared", scope: "exports", budget: 200 });
    assert.deepEqual(search.candidates, ["one/shared.ts", "two/shared.ts"]);
    for (const target of ["shared", "shared.ts"]) { const answer = f.ask("trace", target); assert.equal(answer.state, "ambiguous"); assert.equal(answer.target, null); assert.equal(answer.rows.length, 0); }
    assert.equal(f.ask("trace", "one/shared.ts").state, "ok");
    assert.equal(f.ask("trace", "absent.ts").state, "unknown");
    assert.equal(f.ask("unsupported", "how does execution work?").state, "unsupported");
    const routes = f.ask("routes", ""); assert(routes.routeIndices.length > 0);
    for (const index of routes.routeIndices) assert(f.snapshot.routes[index].evidence.fileHash);
    assert(f.ask("exports", "entry.ts").exportFiles.includes("entry.ts"));
    const entries = investigate(f.snapshot, { operation: "search", text: "", scope: "entries", budget: 200 });
    assert(entries.candidates.includes("app/api/hello/route.ts")); assert(!entries.candidates.includes("common.ts"));
    assert.equal(JSON.stringify(f.snapshot), before, "search cannot create relationships");
  } finally { f.cleanup(); }
});
test("empty snapshots and stale source do not turn missing or historical evidence into current truth", () => {
  const empty = fixture(true), f = fixture();
  try {
    assert.equal(empty.ask("dependencies").state, "unknown"); assert.deepEqual(empty.ask("routes", "").routeIndices, []);
    const old = f.ask("trace"); writeFileSync(path.join(f.root, "a.ts"), "export const changed = 1;");
    assert.equal(readEvidence(f.snapshot, "a.ts").state, "stale"); assert.deepEqual(f.ask("trace"), old); witnesses(f, old);
    rmSync(path.join(f.root, "a.ts")); assert.equal(readEvidence(f.snapshot, "a.ts").state, "stale");
  } finally { empty.cleanup(); f.cleanup(); }
});
test("investigation boundaries reject hostile query fields, unknown intents and forged witness IPC results", () => {
  const f = fixture();
  try {
    const query = { operation: "ask" as const, intent: "trace" as const, target: "entry.ts", depth: 2, budget: 50 };
    const result = investigate(f.snapshot, query); assert.deepEqual(verifyInvestigation(f.snapshot, query, result), result);
    const forged = structuredClone(result); forged.rows[0].witness = ["invented-edge"];
    assert.throws(() => verifyInvestigation(f.snapshot, query, forged));
    for (const q of [{ ...query, budget: 0 }, { ...query, depth: 65 }, { ...query, intent: "calls" }, { ...query, root: "C:/secret" }, { ...query, target: "x\0" }, { ...query, budget: NaN }]) assert.throws(() => validateInvestigation(q));
    assert.throws(() => validateRequest({ version: 1, requestId: "a", jobId: "b", type: "investigation", query, sql: "DROP" }));
    const forgedRoutes = structuredClone(f.ask("routes", "")); forgedRoutes.routeIndices = [999];
    assert.throws(() => verifyInvestigation(f.snapshot, { ...query, intent: "routes", target: "" }, forgedRoutes));
  } finally { f.cleanup(); }
});
test("pilot measurement allowlists reject strings, repository payloads and invalid numbers at every storage boundary", () => {
  const f = fixture(), file = path.join(f.directory, "analysis.sqlite"), store = new SqliteAnalysisStore(file);
  const input = { category: "impact" as const, elapsedMs: 1000, usefulness: 4, discovered: 3, missed: 1 };
  try {
    for (const hostile of [{ ...input, repositoryId: "secret" }, { ...input, path: f.root }, { ...input, prompt: "source" }, { ...input, elapsedMs: "1000" }, { ...input, category: "secret" }, { ...input, usefulness: 6 }, { ...input, missed: -1 }, { ...input, discovered: Infinity }]) {
      assert.throws(() => validateMeasurement(hostile)); assert.throws(() => store.recordMeasurement(hostile as typeof input, "0.1.0"));
      assert.throws(() => validateStorageRequest({ version: 1, type: "measurement", input: hostile, applicationVersion: "0.1.0" }));
    }
    store.recordMeasurement(input, "0.1.0"); assert.equal(store.measurements().total, 1);
    assert.deepEqual(Object.keys(store.measurements().records[0]), ["category", "elapsedMs", "usefulness", "discovered", "missed", "applicationVersion"]);
    assert.doesNotMatch(JSON.stringify(store.measurements()), /repository|source|prompt|secret/);
    assert.throws(() => store.recordMeasurement(input, "sk-secret"));
    const repo = store.register(f.root); store.begin(repo.repositoryId, "saved"); store.publish(repo.repositoryId, "saved", f.snapshot);
    const failure = new DatabaseSync(file);
    failure.exec("CREATE TRIGGER reject_measurement BEFORE INSERT ON pilot_measurements BEGIN SELECT RAISE(ABORT,'measurement failure'); END");
    assert.throws(() => store.recordMeasurement(input, "0.1.0"), /measurement failure/);
    assert.equal(investigate(store.load(repo.repositoryId)!, { operation: "ask", intent: "dependents", target: "common.ts", depth: 64, budget: 200 }).state, "ok");
    failure.exec("DROP TRIGGER reject_measurement"); failure.close();
    store.resetMeasurements(); assert.equal(store.measurements().total, 0); assert.deepEqual(store.load(repo.repositoryId), f.snapshot);
    const db = new DatabaseSync(file); db.exec("DROP TABLE explanation_cache; DROP TABLE pilot_measurements; PRAGMA user_version=1"); db.close(); store.close();
    const upgraded = new SqliteAnalysisStore(file); try { assert.deepEqual(upgraded.load(repo.repositoryId), f.snapshot); assert.equal(upgraded.measurements().total, 0); } finally { upgraded.close(); }
  } finally { try { store.close(); } catch { /* Already closed for upgrade test. */ } f.cleanup(); }
});
test("offline private engine investigations survive SQLite restart and expose real witness references", async () => {
  const f = fixture(), db = path.join(f.directory, "analysis.sqlite"), store = new SqliteAnalysisStore(db);
  const repo = store.register(f.root); store.begin(repo.repositoryId, "first"); store.publish(repo.repositoryId, "first", f.snapshot); store.close();
  try {
    const events = await new Promise<EngineEvent[]>((resolve, reject) => {
      const child = spawn(process.execPath, [path.resolve("scripts/sidecar.ts")], { env: { NODE_ENV: "production", PATH: "", CODE_INTELLIGENCE_ROOT: repo.root, CODE_INTELLIGENCE_DB: db, CODE_INTELLIGENCE_REPOSITORY: repo.repositoryId }, stdio: ["pipe", "pipe", "pipe"] });
      const timer = setTimeout(() => { child.kill(); reject(new Error("Offline investigation timed out")); }, 15000);
      let buffer = ""; const received: EngineEvent[] = [];
      child.on("error", reject); child.stdout.on("data", (bytes: Buffer) => { buffer += bytes.toString(); while (buffer.includes("\n")) {
        const end = buffer.indexOf("\n"); const event = validateEvent(JSON.parse(buffer.slice(0, end))); buffer = buffer.slice(end + 1); received.push(event);
        if (event.type === "complete") child.stdin.write(JSON.stringify({ version: 1, jobId: "reopened", requestId: "ask", type: "investigation", query: { operation: "ask", intent: "dependents", target: "common.ts", depth: 64, budget: 200 } }) + "\n");
        if (event.type === "investigation") child.stdin.end();
      } }); child.on("exit", (code) => { clearTimeout(timer); if (code !== 0) reject(new Error("Offline engine failed")); else resolve(received); });
      child.stdin.write(JSON.stringify({ version: 1, jobId: "reopened", requestId: "reopen", type: "reopen", snapshotVersion: 3 }) + "\n");
    });
    const answer = events.find((e) => e.type === "investigation"); assert(answer?.type === "investigation"); witnesses(f, answer.result, true);
    assert.deepEqual(answer.result, f.ask("dependents", "common.ts"));
  } finally { f.cleanup(); }
});
test("pilot measurement transport has no repository or remote payload affordance", () => {
  const code = readFileSync("components/pilot-measurements.tsx", "utf8");
  assert.doesNotMatch(code, /fetch\(|repositoryId|jobId|source:|prompt:|question:/);
  assert.doesNotMatch(readFileSync("lib/storage/measurements.ts", "utf8"), /fetch\(|https?:\/\//);
});
