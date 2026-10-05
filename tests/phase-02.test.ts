import assert from "node:assert/strict";
import { test } from "node:test";
import { spawn } from "node:child_process";
import { mkdtempSync, realpathSync, writeFileSync, mkdirSync, rmSync, readFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { once } from "node:events";
import { MAX_REQUEST_BYTES, MAX_EVENT_BYTES, validateRequest, validateEvent, belongsToJob, type EngineEvent } from "../lib/desktop/protocol.ts";
import { analyzeLocalRepository } from "../lib/engine/index.ts";
import { typescriptAdapter } from "../lib/engine/adapters/typescript.ts";
import { projectSnapshot } from "../lib/desktop/projection.ts";

function fixture() {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), "cartograph-desktop-test-")));
  mkdirSync(path.join(root, "src"));
  writeFileSync(path.join(root, "src/a.ts"), 'import { b } from "./b"; export const a = b;\n');
  writeFileSync(path.join(root, "src/b.ts"), "export const b = 1;\n");
  return root;
}
function session(root: string, executable = process.execPath, entry = path.resolve("scripts/sidecar.ts")) {
  const child = spawn(executable, ["--disable-warning=ExperimentalWarning", entry], { env: { NODE_ENV: "production", CODE_INTELLIGENCE_ROOT: root }, stdio: ["pipe", "pipe", "pipe"] });
  child.stdin.on("error", () => { /* A rejected frame can close the pipe while writing. */ });
  let buffer = ""; const waiting: { accept: (event: EngineEvent) => boolean; resolve: (event: EngineEvent) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }[] = [];
  const queued: EngineEvent[] = [];
  child.stdout.on("data", (data: Buffer) => {
    buffer += data.toString();
    while (buffer.includes("\n")) {
      const end = buffer.indexOf("\n"), line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
      assert(Buffer.byteLength(line) <= MAX_EVENT_BYTES);
      const event = validateEvent(JSON.parse(line));
      const index = waiting.findIndex((w) => w.accept(event));
      if (index >= 0) { const [w] = waiting.splice(index, 1); clearTimeout(w.timer); w.resolve(event); }
      else queued.push(event);
    }
  });
  child.on("exit", () => { for (const w of waiting.splice(0)) { clearTimeout(w.timer); w.reject(new Error("Engine exited")); } });
  return {
    child,
    send(value: unknown) { child.stdin.write(JSON.stringify(value) + "\n"); },
    event(accept: (event: EngineEvent) => boolean): Promise<EngineEvent> {
      const index = queued.findIndex(accept); if (index >= 0) return Promise.resolve(queued.splice(index, 1)[0]);
      return new Promise((resolve, reject) => {
        const w = { accept, resolve, reject, timer: setTimeout(() => { const i = waiting.indexOf(w); if (i >= 0) waiting.splice(i, 1); reject(new Error("Engine event timed out")); }, 20000) };
        waiting.push(w);
      });
    },
    async close() { const done = once(child, "exit"); child.stdin.end(); await done; },
  };
}
const base = { version: 1, requestId: "job-1", jobId: "job-1" };

test("desktop protocol rejects malformed versions, arbitrary commands, fields and query budgets", () => {
  for (const request of [null, {}, { ...base, version: 2, type: "analyze", root: "x" }, { ...base, type: "shell", command: "run" }, { ...base, type: "analyze", root: "x", executable: "x" }, { ...base, type: "evidence", file: "x\0" }, { ...base, type: "query", query: { file: "x", direction: "guess" } }, { ...base, type: "query", query: { file: "x", direction: "dependents", depth: 65 } }]) assert.throws(() => validateRequest(request));
  assert.throws(() => validateEvent({ ...base, type: "progress", stage: "invent" }));
  assert.throws(() => validateEvent({ ...base, type: "evidence", evidence: { state: "current", source: "x".repeat(1024 * 1024 + 1) } }));
  assert(!belongsToJob({ jobId: "old" }, "current"));
  assert(!belongsToJob({ jobId: "old" }, null));
});

test("sidecar analyzes a non-Git directory, reports stages, scopes queries and detects stale evidence offline", async () => {
  const root = fixture(), nativeRoot = path.toNamespacedPath(root), engine = session(nativeRoot);
  try {
    // Match Rust canonicalize() on Windows, including its extended prefix.
    engine.send({ ...base, type: "analyze", root: nativeRoot });
    const selected = await engine.event((e) => e.type === "progress" && e.stage === "select");
    assert.equal(selected.jobId, "job-1");
    await engine.event((e) => e.type === "progress" && e.stage === "parse");
    const complete = await engine.event((e) => e.type === "complete"); assert.equal(complete.type, "complete");
    if (complete.type !== "complete") throw new Error("Missing snapshot");
    const view = projectSnapshot(complete.snapshot);
    assert.equal(view.files.length, 2); assert.equal(view.edges.length, 1);
    engine.send({ ...base, requestId: "evidence-1", type: "evidence", file: "src/a.ts" });
    const source = await engine.event((e) => e.requestId === "evidence-1");
    assert(source.type === "evidence" && source.evidence.state === "current");
    writeFileSync(path.join(root, "src/a.ts"), "export const changed = true;\n");
    engine.send({ ...base, requestId: "evidence-2", type: "evidence", file: "src/a.ts" });
    const stale = await engine.event((e) => e.requestId === "evidence-2");
    assert(stale.type === "evidence" && stale.evidence.state === "stale");
    engine.send({ ...base, requestId: "query-1", type: "query", query: { file: "src/b.ts", direction: "dependents", depth: 4 } });
    const query = await engine.event((e) => e.requestId === "query-1");
    assert(query.type === "query" && query.result.steps[0][0] === "src/a.ts");
    engine.send({ ...base, requestId: "escape-1", type: "evidence", file: "../outside.ts" });
    assert.equal((await engine.event((e) => e.requestId === "escape-1")).type, "error");
    engine.send({ ...base, requestId: "stale-job", jobId: "old", type: "evidence", file: "src/b.ts" });
    assert.equal((await engine.event((e) => e.requestId === "stale-job")).type, "error");
  } finally { await engine.close(); assert(path.basename(root).startsWith("cartograph-desktop-test-")); rmSync(root, { recursive: true, force: true }); }
});

test("sidecar refuses an unselected root and bounded framing rejects oversized or invalid input", async () => {
  const root = fixture();
  try {
    const engine = session(root);
    engine.send({ ...base, type: "analyze", root: path.dirname(root) });
    assert.equal((await engine.event((e) => e.type === "error")).type, "error");
    await engine.close();
    for (const input of ["x".repeat(MAX_REQUEST_BYTES + 1), JSON.stringify({ ...base, version: 99, type: "analyze", root }) + "\n", "not-json\n"]) {
      const bad = session(root); const done = once(bad.child, "exit"); bad.child.stdin.write(input);
      const [code] = await done; assert.equal(code, 2);
    }
  } finally { assert(path.basename(root).startsWith("cartograph-desktop-test-")); rmSync(root, { recursive: true, force: true }); }
});

test("cancel and crash can terminate a busy process and a fresh engine can retry", async () => {
  const root = fixture();
  try {
    // Create enough input that cancellation lands while selection/parsing is
    // underway. Wait for progress, not a timing guess, before killing it.
    for (let i = 0; i < 500; i++) writeFileSync(path.join(root, `src/file-${i}.ts`), "export const x = 1;\n");
    for (const signal of ["SIGTERM", "SIGKILL"] as const) {
      const engine = session(root); engine.send({ ...base, type: "analyze", root });
      await engine.event((e) => e.type === "progress");
      const done = once(engine.child, "exit"); engine.child.kill(signal); await done;
      assert(engine.child.exitCode !== null || engine.child.signalCode !== null);
    }
    const retry = session(root); retry.send({ ...base, jobId: "retry", requestId: "retry", type: "analyze", root });
    const result = await retry.event((e) => e.type === "complete"); assert.equal(result.jobId, "retry"); await retry.close();
  } finally { assert(path.basename(root).startsWith("cartograph-desktop-test-")); rmSync(root, { recursive: true, force: true }); }
});

test("empty directory produces an honest empty snapshot and projection does not fabricate edges", () => {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), "cartograph-desktop-test-")));
  try {
    const snapshot = analyzeLocalRepository(root, typescriptAdapter);
    assert.equal(snapshot.files.length, 0); assert.equal(projectSnapshot(snapshot).edges.length, 0);
    assert.equal(snapshot.coverage.files.found, 0);
  } finally { assert(path.basename(root).startsWith("cartograph-desktop-test-")); rmSync(root, { recursive: true, force: true }); }
});

test("desktop capability/config prevents broad renderer native access and cloud frontend startup", () => {
  const capability = JSON.parse(readFileSync("src-tauri/capabilities/main.json", "utf8"));
  assert.deepEqual(capability.permissions, ["core:event:allow-listen", "core:event:allow-unlisten", "allow-select-repository", "allow-start-analysis", "allow-cancel-analysis", "allow-read-evidence", "allow-query-structure"]);
  const config = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8"));
  assert(!config.build.devUrl, "desktop runs packaged static assets, not a Next server");
  assert.deepEqual(config.bundle.resources, { "resources/generated/engine/": "engine/" }, "packaged engine copies stay in an excluded generated directory");
  assert(config.app.security.csp.includes("connect-src ipc: http://ipc.localhost;"));
  for (const file of ["app/layout.tsx", "app/page.tsx", "components/desktop-explorer.tsx", "next.config.ts"]) {
    assert.doesNotMatch(readFileSync(file, "utf8"), /@clerk|@supabase|openai|next\/headers|next\/font\/google|assertEnv|use server/);
  }
  assert.doesNotMatch(readFileSync("components/theme-control.tsx", "utf8"), /document\.cookie/);
});
