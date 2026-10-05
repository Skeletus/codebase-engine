import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync, readFileSync, renameSync, existsSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";
import { record, validateEvent, MAX_EVENT_BYTES } from "../lib/desktop/protocol.ts";

const release = process.argv.includes("--release");
const resources = path.resolve(release ? "src-tauri/target/release/engine" : "src-tauri/resources/generated/engine");
const runtime = JSON.parse(readFileSync(path.join(resources, "runtime.json"), "utf8"));
const executable = path.resolve(release ? `src-tauri/target/release/code-engine${process.platform === "win32" ? ".exe" : ""}` : `src-tauri/binaries/code-engine-${runtime.target}${process.platform === "win32" ? ".exe" : ""}`);
const directory = realpathSync(mkdtempSync(path.join(tmpdir(), "cartograph smoke spaces ")));
const root = path.join(directory, "local repository"), database = path.toNamespacedPath(path.join(directory, "intelligence.sqlite"));
mkdirSync(root);
writeFileSync(path.join(root, "a.ts"), 'import { b } from "./b"; export const a = b;\n');
writeFileSync(path.join(root, "b.ts"), "export const b = 1;\n");

function run(script: "sidecar" | "storage", requests: unknown[], authority: Record<string, string> = {}): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    // Native tests cover the truly cleared Windows process environment.
    const child = spawn(executable, ["--disable-warning=ExperimentalWarning", path.join(resources, `scripts/${script}.ts`)], {
      cwd: resources, env: { NODE_ENV: "production", PATH: "", CODE_INTELLIGENCE_DB: database, ...authority }, stdio: ["pipe", "pipe", "pipe"],
    });
    const timeout = setTimeout(() => { child.kill(); reject(new Error("Packaged smoke test timed out")); }, 20000);
    let buffer = "", index = 0; const responses: unknown[] = [];
    child.stdin.on("error", (error) => { child.kill(); reject(error); });
    child.on("error", reject);
    child.stdout.on("data", (data: Buffer) => {
      try {
        buffer += data.toString();
        if (Buffer.byteLength(buffer) > MAX_EVENT_BYTES) throw new Error("Smoke-test event budget exceeded");
        while (buffer.includes("\n")) {
          const end = buffer.indexOf("\n"), raw: unknown = JSON.parse(buffer.slice(0, end)); buffer = buffer.slice(end + 1);
          let response: unknown;
          if (script === "storage") { const reply = record(raw); assert.equal(reply.ok, true, String(reply.error)); response = reply.result; }
          else { const event = validateEvent(raw); if (event.type === "progress") continue; assert.notEqual(event.type, "error"); response = event; }
          responses.push(response); index++;
          if (index < requests.length) child.stdin.write(JSON.stringify(requests[index]) + "\n"); else child.stdin.end();
        }
      } catch (error) { child.kill(); reject(error); }
    });
    child.on("exit", (code) => { clearTimeout(timeout); if (code !== 0 || index !== requests.length) reject(new Error(`Bundled ${script} failed (exit ${code})`)); else resolve(responses); });
    child.stdin.write(JSON.stringify(requests[0]) + "\n");
  });
}
try {
  const [registered] = await run("storage", [{ version: 1, type: "register" }], { CODE_INTELLIGENCE_ROOT: path.toNamespacedPath(root) });
  const repo = record(registered); assert.equal(typeof repo.repositoryId, "string"); assert.equal(typeof repo.root, "string");
  const authority = { CODE_INTELLIGENCE_REPOSITORY: String(repo.repositoryId), CODE_INTELLIGENCE_ROOT: String(repo.root) };
  const [analyzed] = await run("sidecar", [{ version: 1, jobId: "initial", requestId: "initial", type: "analyze", root: repo.root }], authority);
  const initial = validateEvent(analyzed); assert(initial.type === "complete");
  assert.equal(initial.snapshot.files.length, 2); assert.equal(initial.snapshot.relationships.length, 1);
  const prepared = await run("sidecar", [
    { version: 1, jobId: "ai-local", requestId: "ai-local", type: "reopen" },
    { version: 1, jobId: "ai-local", requestId: "ai-prepare", type: "explanation", query: { kind: "file", path: "a.ts" } },
  ], authority);
  const packageEvent = validateEvent(prepared[1]); assert(packageEvent.type === "explanation");
  const payload = JSON.parse(packageEvent.result.payload); assert.equal(payload.edges.length, 1); assert.equal(payload.files.length, 2);
  assert.doesNotMatch(packageEvent.result.payload, /export const|origin|root/);
  const [digest] = await run("storage", [{ version: 1, type: "explanation-digest", input: packageEvent.result.payload }]);
  assert.equal(digest, packageEvent.result.digest);
  const cacheKey = `openai:fake:structural-v1:${digest}`;
  const answer = JSON.stringify({ body: "Synthetic smoke explanation", citations: ["F1"] });
  const [cached] = await run("storage", [{ version: 1, type: "explanation-cache", repositoryId: repo.repositoryId, key: cacheKey, answer }]); assert.equal(cached, answer);
  assert.equal((await run("storage", [{ version: 1, type: "explanation-cache", repositoryId: repo.repositoryId, key: cacheKey }]))[0], answer);
  renameSync(root, root + " moved");
  const reopened = await run("sidecar", [
    { version: 1, jobId: "reopen", requestId: "reopen", type: "reopen" },
    { version: 1, jobId: "reopen", requestId: "evidence", type: "evidence", file: "a.ts" },
    { version: 1, jobId: "reopen", requestId: "impact", type: "investigation", query: { operation: "ask", intent: "dependents", target: "b.ts", depth: 2, budget: 50 } },
  ], authority);
  const restored = validateEvent(reopened[0]), evidence = validateEvent(reopened[1]);
  assert(restored.type === "complete"); assert.deepEqual(restored.snapshot, initial.snapshot);
  assert(evidence.type === "evidence" && evidence.evidence.state === "stale");
  const impact = validateEvent(reopened[2]); assert(impact.type === "investigation");
  assert.equal(impact.result.rows[0].file, "a.ts"); assert.deepEqual(impact.result.rows[0].witness, [initial.snapshot.relationships[0].id]);
  const [measurement] = await run("storage", [{ version: 1, type: "measurement", input: { category: "impact", elapsedMs: 1000, usefulness: 4, discovered: 1, missed: 0 }, applicationVersion: "0.1.0" }]);
  assert.equal(record(measurement).total, 1);
  const [reset] = await run("storage", [{ version: 1, type: "reset-measurements" }]); assert.equal(record(reset).total, 0);
  const [list] = await run("storage", [{ version: 1, type: "list" }]);
  assert(Array.isArray(list) && list.length === 1 && list[0].available === false);
  await run("storage", [{ version: 1, type: "forget", repositoryId: repo.repositoryId }]);
  assert.deepEqual((await run("storage", [{ version: 1, type: "list" }]))[0], []);
  assert(existsSync(path.join(root + " moved", "a.ts")), "forget must never delete source");
  console.log(`PASS: bundled Node ${runtime.node}; SQLite analyze/restart/historical reopen/stale evidence/impact witnesses/numeric measurement/reset/optional AI evidence digest/cache/forget; no PATH, cloud configuration or repository dependencies`);
} finally {
  assert(path.basename(directory).startsWith("cartograph smoke spaces "));
  rmSync(directory, { recursive: true, force: true });
}
