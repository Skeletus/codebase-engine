import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync, readFileSync, renameSync, existsSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";
import { record, validateEvent, MAX_EVENT_BYTES } from "../lib/desktop/protocol.ts";
import { snapshotIdentity } from "../lib/engine/ranking.ts";
import { snapshotJson } from "../lib/engine/snapshot-identity.ts";
import { verifyRanking } from "../lib/desktop/ranking.ts";
import { LAYA_ARTIFACT } from "../lib/laya/artifact.ts";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

const release = process.argv.includes("--release");
const resources = path.resolve(release ? "src-tauri/target/release/engine" : "src-tauri/resources/generated/engine");
const runtime = JSON.parse(readFileSync(path.join(resources, "runtime.json"), "utf8"));
assert.equal(runtime.snapshotVersion, 3, "Packaged engine must advertise the current contract");
const executable = path.resolve(release ? `src-tauri/target/release/code-engine${process.platform === "win32" ? ".exe" : ""}` : `src-tauri/binaries/code-engine-${runtime.target}${process.platform === "win32" ? ".exe" : ""}`);
assert.equal(createHash("sha256").update(readFileSync(path.join(resources, "lib/laya/laya-nav-1.json"))).digest("hex"), LAYA_ARTIFACT.hash);
// Packaged Phase 08 harness is independent of providers, PATH and engine IPC.
for (const ranker of ["reverse", "failure"]) {
  const output = execFileSync(executable, ["--disable-warning=ExperimentalWarning", path.join(resources, "scripts/evaluate-ranking.ts"), "synthetic", "--ranker", ranker, "--budget", "1"], {
    cwd: resources, env: { NODE_ENV: "production", PATH: "", SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP, TMP: process.env.TMP }, encoding: "utf8", timeout: 15000,
  });
  const evaluation = JSON.parse(output);
  assert.equal(evaluation.structuralRecall, 1);
  assert.equal(evaluation.supplied.steps[0].id, ranker === "reverse" ? "z.ts" : "a.ts");
  if (ranker === "failure") assert.equal(evaluation.supplied.decisions[0].fallback, "ranker_failure");
}
const directory = realpathSync(mkdtempSync(path.join(tmpdir(), "cartograph smoke spaces ")));
const root = path.join(directory, "local repository"), database = path.toNamespacedPath(path.join(directory, "intelligence.sqlite"));
mkdirSync(root);
// Fault checks run the bundled runtime/worker under a cleared environment;
// only disposable test artifacts are altered, never the packaged/source model.
const corruptFile = path.join(directory, "corrupt-model.json"); writeFileSync(corruptFile, "{}");
for (const [file, reason] of [[path.join(directory, "missing-model.json"), "model_unavailable"], [corruptFile, "model_corrupt"]]) {
  const probe = `
    const { LocalLaya } = await import(${JSON.stringify(pathToFileURL(path.join(resources, "lib/laya/runtime.ts")).href)});
    const { orderCandidates } = await import(${JSON.stringify(pathToFileURL(path.join(resources, "lib/engine/ranking.ts")).href)});
    globalThis.fetch = async () => { throw new Error("Denied egress"); };
    const local = new LocalLaya({ file: new URL(${JSON.stringify(pathToFileURL(file).href)}), hash: ${JSON.stringify(LAYA_ARTIFACT.hash)}, qualified: true });
    try { const result = await orderCandidates({ goal: "Locate authentication", snapshotId: "a".repeat(64), contextId: "b".repeat(64), candidates: [{id:"authentication.ts",depth:1,fanIn:1,fanOut:0,witness:["edge"]}] }, local.ranker, undefined, 1000); console.log(JSON.stringify({ fallback: result.fallback, id: result.ordered[0].id })); } finally { local.close(); }
  `;
  const result = JSON.parse(execFileSync(executable, ["--disable-warning=ExperimentalWarning", "--input-type=module", "--eval", probe], { cwd: resources, env: { NODE_ENV: "production", PATH: "" }, encoding: "utf8", timeout: 5000 }));
  assert.equal(result.fallback, reason); assert.equal(result.id, "authentication.ts");
}
writeFileSync(path.join(root, "a.ts"), 'import { b as helper } from "./b"; export function a() { return helper(); }\n');
writeFileSync(path.join(root, "b.ts"), "export function b() { return 1; }\n");
writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "static-smoke", dependencies: { next: "16.3.6" } }));
mkdirSync(path.join(root, "app/api/smoke"), { recursive: true });
writeFileSync(path.join(root, "app/api/smoke/route.ts"), 'import { a } from "../../../a"; export function GET() { return a(); }\n');

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
          else {
            const event = validateEvent(raw);
            if (event.type === "progress") continue;
            if (index >= requests.length) continue;
            const pending = record(requests[index]);
            if (event.type === "watch") {
              const expectedState = pending.action === "start" ? "watching" : pending.action === "stop" ? "paused" : "degraded";
              if (pending.type !== "watch" || event.status.state !== expectedState) continue;
            } else if (event.requestId !== pending.requestId) continue;
            assert.notEqual(event.type, "error"); response = event;
          }
          responses.push(response); index++;
          if (index < requests.length) child.stdin.write(JSON.stringify(requests[index]) + "\n"); else child.stdin.end();
        }
      } catch (error) { child.kill(); reject(error); }
    });
    child.on("exit", (code) => { clearTimeout(timeout); if (code !== 0 || index !== requests.length) reject(new Error(`Bundled ${script} failed (exit ${code})`)); else resolve(responses); });
    child.stdin.write(JSON.stringify(requests[0]) + "\n");
  });
}
async function watchSmoke(authority: Record<string, string>) {
  const original = readFileSync(path.join(root, "b.ts"), "utf8");
  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(executable, ["--disable-warning=ExperimentalWarning", path.join(resources, "scripts/sidecar.ts")], { cwd: resources, env: { NODE_ENV: "production", PATH: "", CODE_INTELLIGENCE_DB: database, ...authority }, stdio: ["pipe", "pipe", "pipe"] });
      let buffer = "", stage = 0, request = 0;
      const timer = setTimeout(() => { child.kill(); reject(new Error("Packaged watcher smoke timed out")); }, 20000);
      function send(action: "start" | "simulate-loss") { child.stdin.write(JSON.stringify({ version: 1, jobId: "watch-smoke", requestId: `watch-${++request}`, type: "watch", action }) + "\n"); }
      child.on("error", reject); child.stdin.on("error", reject);
      child.stdout.on("data", (data: Buffer) => {
        try {
          buffer += data.toString(); if (Buffer.byteLength(buffer) > MAX_EVENT_BYTES) throw new Error("Watcher event budget");
          while (buffer.includes("\n")) {
            const end = buffer.indexOf("\n"), event = validateEvent(JSON.parse(buffer.slice(0, end))); buffer = buffer.slice(end + 1);
            assert.notEqual(event.type, "error");
            if (stage === 0 && event.type === "complete") { stage = 1; send("start"); }
            else if (stage === 1 && event.type === "watch" && event.status.state === "watching") { stage = 2; writeFileSync(path.join(root, "b.ts"), "export function b() { return 2; }\n"); }
            else if (stage === 2 && event.type === "complete") { assert.equal(event.snapshot.files.length, 3); stage = 3; }
            else if (stage === 3 && event.type === "watch" && event.status.state === "watching") { assert.equal(event.status.mode, "incremental"); assert.equal(event.status.parsed, 1); assert.equal(event.status.reused, 2); stage = 4; send("simulate-loss"); }
            else if (stage === 4 && event.type === "watch" && event.status.state === "degraded") { stage = 5; child.stdin.end(); }
          }
        } catch (error) { child.kill(); reject(error); }
      });
      child.on("exit", (code) => { clearTimeout(timer); if (code === 0 && stage === 5) resolve(); else reject(new Error(`Packaged watcher failed (${code}, stage ${stage})`)); });
      child.stdin.write(JSON.stringify({ version: 1, jobId: "watch-smoke", requestId: "watch-smoke", type: "analyze", snapshotVersion: 3, root: authority.CODE_INTELLIGENCE_ROOT }) + "\n");
    });
  } finally { writeFileSync(path.join(root, "b.ts"), original); }
}
try {
  const rankingRoot = path.join(directory, "Phase 09 ranking fixture");
  mkdirSync(path.join(rankingRoot, "z-authentication"), { recursive: true });
  for (const [file, text] of Object.entries({ "entry.ts": 'import "./a-noise"; import "./z-authentication/index";', "a-noise.ts": 'import "./noise"; export const noiseEntry = 1;', "noise.ts": "export const noise = 1;", "z-authentication/index.ts": 'import "./service"; import "./service.test";', "z-authentication/service.ts": "export function authenticate() { return true; }", "z-authentication/service.test.ts": 'import "./service"; export const testMarker = 1;' })) writeFileSync(path.join(rankingRoot, file), text);
  const [rankingRegistration] = await run("storage", [{ version: 1, type: "register" }], { CODE_INTELLIGENCE_ROOT: path.toNamespacedPath(rankingRoot) });
  const rankingRepo = record(rankingRegistration), rankingAuthority = { CODE_INTELLIGENCE_ROOT: String(rankingRepo.root), CODE_INTELLIGENCE_REPOSITORY: String(rankingRepo.repositoryId) };
  const [fixtureEvent] = await run("sidecar", [{ version: 1, jobId: "fixture", requestId: "fixture", type: "analyze", snapshotVersion: 3, root: rankingRepo.root }], rankingAuthority);
  const fixture = validateEvent(fixtureEvent); assert(fixture.type === "complete");
  assert.equal(fixture.snapshot.files.length, 6); assert.equal(fixture.snapshot.relationships.length, 6);
  // Native serde_json orders object keys; the browser must hash the same content.
  const transported = JSON.parse(snapshotJson(fixture.snapshot));
  const fixtureQuery = { goal: "Locate authentication implementation", start: "entry.ts", depth: 8, budget: 2, mode: "laya", snapshotId: createHash("sha256").update(snapshotJson(transported)).digest("hex") };
  const fixtureReplies = await run("sidecar", [
    { version: 1, jobId: "fixture-session", requestId: "open", type: "reopen", snapshotVersion: 3 },
    { version: 1, jobId: "fixture-session", requestId: "baseline", type: "ranking", query: { ...fixtureQuery, mode: "baseline" } },
    { version: 1, jobId: "fixture-session", requestId: "watch-start", type: "watch", action: "start" },
    { version: 1, jobId: "fixture-session", requestId: "watch-stop", type: "watch", action: "stop" },
    { version: 1, jobId: "fixture-session", requestId: "paused-ranking", type: "ranking", query: fixtureQuery },
    { version: 1, jobId: "fixture-session", requestId: "watch-loss", type: "watch", action: "simulate-loss" },
    { version: 1, jobId: "fixture-session", requestId: "unavailable-ranking", type: "ranking", query: fixtureQuery },
  ], rankingAuthority);
  const fixtureBaseline = validateEvent(fixtureReplies[1]); assert(fixtureBaseline.type === "ranking");
  assert.deepEqual(fixtureBaseline.result.steps.map((s) => s.id), ["a-noise.ts", "z-authentication/index.ts"]);
  for (const index of [4, 6]) { const result = validateEvent(fixtureReplies[index]); assert(result.type === "ranking"); assert.deepEqual(result.result.steps.map((s) => s.id), ["z-authentication/index.ts", "z-authentication/service.ts"]); assert.equal(result.result.model, "laya-nav-1"); assert.deepEqual(result.result.fallbacks, []); }
  const watchStarted = validateEvent(fixtureReplies[2]); assert(watchStarted.type === "watch" && watchStarted.status.state === "watching");
  const watchPaused = validateEvent(fixtureReplies[3]); assert(watchPaused.type === "watch" && watchPaused.status.state === "paused");
  const watchLost = validateEvent(fixtureReplies[5]); assert(watchLost.type === "watch" && watchLost.status.state === "degraded");
  await run("storage", [{ version: 1, type: "forget", repositoryId: rankingRepo.repositoryId }]);
  const [registered] = await run("storage", [{ version: 1, type: "register" }], { CODE_INTELLIGENCE_ROOT: path.toNamespacedPath(root) });
  const repo = record(registered); assert.equal(typeof repo.repositoryId, "string"); assert.equal(typeof repo.root, "string");
  const authority = { CODE_INTELLIGENCE_REPOSITORY: String(repo.repositoryId), CODE_INTELLIGENCE_ROOT: String(repo.root) };
  await watchSmoke(authority);
  const [analyzed] = await run("sidecar", [{ version: 1, jobId: "initial", requestId: "initial", type: "analyze", snapshotVersion: 3, root: repo.root }], authority);
  const initial = validateEvent(analyzed); assert(initial.type === "complete");
  assert.equal(initial.snapshot.files.length, 3); assert.equal(initial.snapshot.relationships.length, 2);
  assert.equal(initial.snapshot.version, 3);
  const symbolCall = initial.snapshot.behavior.relations.find((r) => r.relation === "calls"); assert(symbolCall);
  assert.equal(symbolCall.site.file, "a.ts");
  assert.equal(initial.snapshot.behavior.declarations.find((d) => d.id === symbolCall.target)?.name, "b");
  assert.equal(initial.snapshot.routes.length, 1); assert(initial.snapshot.behavior.handlers[0].target);
  assert.equal(initial.snapshot.behavior.declarations.find((d) => d.id === initial.snapshot.behavior.handlers[0].target)?.name, "GET");
  const rankingQuery = { goal: "Locate b", start: "a.ts", depth: 8, budget: 4, mode: "laya", snapshotId: snapshotIdentity(initial.snapshot) } as const;
  const ranked = await run("sidecar", [
    { version: 1, jobId: "rank-local", requestId: "rank-local", type: "reopen", snapshotVersion: 3 },
    { version: 1, jobId: "rank-local", requestId: "rank-model", type: "ranking", query: rankingQuery },
    { version: 1, jobId: "rank-local", requestId: "rank-outside", type: "ranking", query: { ...rankingQuery, goal: "unrelatedword" } },
    { version: 1, jobId: "rank-local", requestId: "rank-baseline", type: "ranking", query: { ...rankingQuery, mode: "baseline" } },
    { version: 1, jobId: "rank-local", requestId: "rank-cancel", type: "ranking-cancel", query: {} },
  ], authority);
  const rankedEvent = validateEvent(ranked[1]); assert(rankedEvent.type === "ranking");
  const checked = verifyRanking(initial.snapshot, rankingQuery, rankedEvent.result); assert.equal(checked.steps[0].id, "b.ts"); assert.deepEqual(checked.fallbacks, []);
  const outside = validateEvent(ranked[2]); assert(outside.type === "ranking"); assert.deepEqual(outside.result.fallbacks, ["outside_domain"]);
  const baseline = validateEvent(ranked[3]); assert(baseline.type === "ranking"); assert.deepEqual(baseline.result.steps, checked.steps); assert.equal(baseline.result.mode, "baseline");
  const cancellation = validateEvent(ranked[4]); assert(cancellation.type === "ranking-cancel");
  const prepared = await run("sidecar", [
    { version: 1, jobId: "ai-local", requestId: "ai-local", type: "reopen", snapshotVersion: 3 },
    { version: 1, jobId: "ai-local", requestId: "ai-prepare", type: "explanation", query: { kind: "file", path: "a.ts" } },
  ], authority);
  const packageEvent = validateEvent(prepared[1]); assert(packageEvent.type === "explanation");
  const payload = JSON.parse(packageEvent.result.payload); assert.equal(payload.edges.length, 2); assert.equal(payload.files.length, 3);
  assert.equal(payload.behavior.handlers[0].target.name, "GET");
  assert.doesNotMatch(packageEvent.result.payload, /export function|return helper|origin|root/);
  assert.equal(payload.behavior.relations.find((r: { relation: string }) => r.relation === "calls").target, "b");
  const [digest] = await run("storage", [{ version: 1, type: "explanation-digest", input: packageEvent.result.payload }]);
  assert.equal(digest, packageEvent.result.digest);
  const cacheKey = `openai:fake:structural-v1:${digest}`;
  const answer = JSON.stringify({ body: "Synthetic smoke explanation", citations: ["F1"] });
  const [cached] = await run("storage", [{ version: 1, type: "explanation-cache", repositoryId: repo.repositoryId, key: cacheKey, answer }]); assert.equal(cached, answer);
  assert.equal((await run("storage", [{ version: 1, type: "explanation-cache", repositoryId: repo.repositoryId, key: cacheKey }]))[0], answer);
  renameSync(root, root + " moved");
  const reopened = await run("sidecar", [
    { version: 1, jobId: "reopen", requestId: "reopen", type: "reopen", snapshotVersion: 3 },
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
  console.log(`PASS: bundled Node ${runtime.node}; pinned local Laya worker inference/baseline/outside-domain/cancellation protocol; real watcher/incremental update/loss/shutdown; SQLite analyze/restart/historical reopen/stale evidence/impact witnesses/static symbol calls/richer approved AI metadata/numeric measurement/reset/evidence digest/cache/forget; no PATH, cloud configuration or repository dependencies`);
} finally {
  assert(path.basename(directory).startsWith("cartograph smoke spaces "));
  rmSync(directory, { recursive: true, force: true });
}
