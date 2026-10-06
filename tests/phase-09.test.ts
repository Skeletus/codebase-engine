import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { features, forward, scoreGradient, validateModel, infer, PARAMETERS, random } from "../lib/laya/model.ts";
import { validateLayaInput } from "../lib/laya/input.ts";
import { LAYA_ARTIFACT } from "../lib/laya/artifact.ts";
import { LocalLaya } from "../lib/laya/runtime.ts";
import { rankedInvestigation } from "../lib/laya/investigation.ts";
import { orderCandidates, snapshotIdentity, type RankInput } from "../lib/engine/ranking.ts";
import { investigate } from "../lib/engine/investigations.ts";
import { typescriptAdapter } from "../lib/engine/adapters/typescript.ts";
import { validateRequest, validateEvent } from "../lib/desktop/protocol.ts";
import { verifyRanking, validateRankingQuery } from "../lib/desktop/ranking.ts";
import { train } from "../scripts/laya-training.ts";
import { verifySplits, type Dataset, type DatasetCase } from "../scripts/laya-dataset.ts";
import { snapshotJson } from "../lib/engine/snapshot-identity.ts";
import { RepositoryRefresh } from "../lib/engine/refresh.ts";

const input: RankInput = { goal: "Locate authentication implementation", snapshotId: "a".repeat(64), contextId: "b".repeat(64), candidates: [
  { id: "utility/index.ts", depth: 1, fanIn: 1, fanOut: 1, witness: ["a"] },
  { id: "authentication/service.ts", depth: 2, fanIn: 2, fanOut: 0, witness: ["a", "b"] },
] };
const model = validateModel(JSON.parse(readFileSync(LAYA_ARTIFACT.file, "utf8")));
function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "phase09 spaces "));
  writeFileSync(path.join(root, "entry.ts"), 'import "./utility"; import "./authentication";');
  writeFileSync(path.join(root, "utility.ts"), "export const utility = 1;");
  writeFileSync(path.join(root, "authentication.ts"), "export const authentication = 1;");
  const snapshot = typescriptAdapter.analyze(root);
  return { root, snapshot, clean() { rmSync(root, { recursive: true, force: true }); } };
}
test("analytic neural gradient matches finite differences for every parameter", () => {
  const rng = random(42), weights = Array.from({ length: PARAMETERS }, () => rng() - 0.5), x = features(input, input.candidates[1]);
  const gradient = scoreGradient(weights, x), epsilon = 1e-6;
  for (let i = 0; i < weights.length; i++) { const a = weights.slice(), b = weights.slice(); a[i] += epsilon; b[i] -= epsilon; const numeric = (forward(a, x).score - forward(b, x).score) / (2 * epsilon); assert(Math.abs(numeric - gradient[i]) < 1e-6, `gradient ${i}`); }
});
test("bundled artifact pin, finite shape, bounded vocabulary-free features and scores", () => {
  assert.equal(createHash("sha256").update(readFileSync(LAYA_ARTIFACT.file)).digest("hex"), LAYA_ARTIFACT.hash);
  for (const variant of [{ ...model, weights: [] }, { ...model, inputs: 17 }, { ...model, version: 2 }, { ...model, weights: model.weights.map(() => Infinity) }, { ...model, extra: "source" }]) assert.throws(() => validateModel(variant));
  for (const c of input.candidates) assert(features(input, c).every((f) => Number.isFinite(f) && f >= 0 && f <= 1));
  assert.deepEqual(infer(model, input), infer(model, input));
  assert.deepEqual(infer(model, input).scores.map((s) => s.id), input.candidates.map((c) => c.id));
  assert.throws(() => infer(model, { ...input, goal: "unrelated" }), /outside_domain/);
});
test("worker input excludes source, arbitrary paths, duplicate nodes and stale identity formats", () => {
  assert.deepEqual(validateLayaInput(input), input);
  for (const invalid of [{ ...input, source: "code" }, { ...input, snapshotId: "old" }, { ...input, candidates: [input.candidates[0], input.candidates[0]] }, { ...input, candidates: [{ ...input.candidates[0], id: "C:/secret.ts" }] }]) assert.throws(() => validateLayaInput(invalid));
});
test("real isolated worker inference is offline, repeatable and terminable", async () => {
  const runtime = new LocalLaya(LAYA_ARTIFACT), prior = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("Egress denied"); };
  try {
    await runtime.prepare(); const before = JSON.stringify(input);
    assert.deepEqual(await runtime.ranker(input, new AbortController().signal), infer(model, input));
    assert.deepEqual(await runtime.ranker(input, new AbortController().signal), infer(model, input));
    assert.equal(JSON.stringify(input), before);
    const pending = new LocalLaya(LAYA_ARTIFACT); const preparation = pending.prepare(); pending.close(); await assert.rejects(preparation, /cancelled/);
  } finally { runtime.close(); globalThis.fetch = prior; }
});
test("missing, corrupt, wrong pin and unqualified artifacts use deterministic fallback", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "phase09 artifact "));
  try {
    const file = pathToFileURL(path.join(root, "missing.json"));
    for (const [artifact, expected] of [[{ file, hash: LAYA_ARTIFACT.hash, qualified: true }, "model_unavailable"], [{ ...LAYA_ARTIFACT, qualified: false }, "model_not_qualified"], [{ ...LAYA_ARTIFACT, hash: "0".repeat(64) }, "model_corrupt"]] as const) {
      const local = new LocalLaya(artifact); try { assert.equal((await orderCandidates(input, local.ranker, undefined, 1000)).fallback, expected); } finally { local.close(); }
    }
    const bytes = Buffer.from('{"weights": [1]}'); writeFileSync(file, bytes);
    const local = new LocalLaya({ file, hash: createHash("sha256").update(bytes).digest("hex"), qualified: true });
    try { assert.equal((await orderCandidates(input, local.ranker, undefined, 1000)).fallback, "model_corrupt"); } finally { local.close(); }
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test("worker timeout and cancellation terminate inference and preserve deterministic ordering", async () => {
  const large: RankInput = { ...input, goal: Array.from({ length: 60 }, (_, i) => `authentication${i}`).join(" ").slice(0, 256), candidates: Array.from({ length: 200 }, (_, i) => ({ id: `authentication${i}/service.ts`, depth: 1, fanIn: 1, fanOut: 0, witness: ["x"] })) };
  const runtime = new LocalLaya(LAYA_ARTIFACT);
  try { await runtime.prepare(); const result = await orderCandidates(large, runtime.ranker, undefined, 1); assert.equal(result.fallback, "timeout"); assert.equal(result.ordered.length, 200); assert.equal((await orderCandidates(input, runtime.ranker)).fallback, "inference_failure"); } finally { runtime.close(); }
  const local = new LocalLaya(LAYA_ARTIFACT), controller = new AbortController();
  try { await local.prepare(); const pending = orderCandidates(large, local.ranker, controller.signal, 1000); queueMicrotask(() => controller.abort()); assert.equal((await pending).fallback, "cancelled"); } finally { local.close(); }
});

test("cold worker initialization timeout is failure, never cancellation, and retains deterministic candidates", async (t) => {
  const originalTimer = globalThis.setTimeout, local = new LocalLaya(LAYA_ARTIFACT);
  const timer = t.mock.method(globalThis, "setTimeout", (callback: () => void, delay?: number) => {
    if (delay === 1000) { queueMicrotask(callback); return originalTimer(() => {}, 0); }
    return originalTimer(callback, delay);
  });
  try {
    await assert.rejects(local.prepare(), /inference_failure/);
    timer.mock.restore();
    const fallback = await orderCandidates(input, local.ranker, undefined, 1000);
    assert.equal(fallback.fallback, "inference_failure");
    assert.deepEqual(fallback.ordered.map((c) => c.id), ["utility/index.ts", "authentication/service.ts"]);
  } finally { timer.mock.restore(); local.close(); }
});
test("desktop ranking validates current snapshot and witnesses, keeps graph and Impact byte-identical", async () => {
  const f = fixture(); try {
    const before = JSON.stringify(f.snapshot), snapshotId = snapshotIdentity(f.snapshot), query = { goal: "Locate authentication", start: "entry.ts", mode: "laya", depth: 8, budget: 1, snapshotId } as const;
    const impactQuery = { operation: "ask", intent: "dependents", target: "authentication.ts", depth: 64, budget: 200 } as const, impact = investigate(f.snapshot, impactQuery);
    const result = await rankedInvestigation(f.snapshot, query); assert.equal(result.steps[0].id, "authentication.ts"); assert.equal(result.fallbacks.length, 0);
    verifyRanking(f.snapshot, query, result); assert.equal(JSON.stringify(f.snapshot), before); assert.deepEqual(investigate(f.snapshot, impactQuery), impact);
    await assert.rejects(rankedInvestigation(f.snapshot, { ...query, snapshotId: "0".repeat(64) }), /stale_snapshot/);
    assert.throws(() => verifyRanking(f.snapshot, query, { ...result, steps: [{ ...result.steps[0], witness: ["invented"] }] }));
    const fallback = await rankedInvestigation(f.snapshot, { ...query, goal: "quuxword" }); assert.deepEqual(fallback.fallbacks, ["outside_domain"]);
    const control = new AbortController(); control.abort(); assert.equal((await rankedInvestigation(f.snapshot, query, control.signal)).cancelled, true);
  } finally { f.clean(); }
});
test("desktop protocol rejects renderer artifact/runtime paths and excessive limits", () => {
  const query = { goal: "Locate authentication", start: "entry.ts", mode: "laya", depth: 8, budget: 4, snapshotId: "a".repeat(64) };
  validateRankingQuery(query); validateRequest({ version: 1, requestId: "r", jobId: "j", type: "ranking", query });
  for (const q of [{ ...query, file: "model.json" }, { ...query, budget: 51 }, { ...query, depth: 17 }, { ...query, start: "../secret" }, { ...query, mode: "provider" }]) assert.throws(() => validateRankingQuery(q));
  validateRequest({ version: 1, requestId: "r", jobId: "j", type: "ranking-cancel", query: {} });
  assert.throws(() => validateRequest({ version: 1, requestId: "r", jobId: "j", type: "ranking-cancel", query: { file: "x" } }));
  validateEvent({ version: 1, requestId: "r", jobId: "j", type: "ranking-cancel", result: { cancelled: true } });
});
test("documented Windows fixture produces the declared bounded model/baseline witnesses", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "phase09 manual fixture "));
  try {
    const { mkdirSync } = await import("node:fs"); mkdirSync(path.join(root, "z-authentication"));
    for (const [file, text] of Object.entries({ "entry.ts": 'import "./a-noise"; import "./z-authentication/index";', "a-noise.ts": 'import "./noise"; export const noiseEntry = 1;', "noise.ts": "export const noise = 1;", "z-authentication/index.ts": 'import "./service"; import "./service.test";', "z-authentication/service.ts": "export function authenticate() { return true; }", "z-authentication/service.test.ts": 'import "./service"; export const testMarker = 1;' })) writeFileSync(path.join(root, file), text);
    const snapshot = typescriptAdapter.analyze(root), query = { goal: "Locate authentication implementation", start: "entry.ts", mode: "laya", depth: 8, budget: 2, snapshotId: snapshotIdentity(snapshot) } as const;
    assert.equal(snapshot.files.length, 6); assert.equal(snapshot.relationships.length, 6);
    assert.deepEqual((await rankedInvestigation(snapshot, { ...query, mode: "baseline" })).steps.map((s) => s.id), ["a-noise.ts", "z-authentication/index.ts"]);
    const transported = validateEvent({ version: 1, jobId: "fixture", requestId: "fixture", type: "complete", snapshot: JSON.parse(snapshotJson(snapshot)) });
    assert(transported.type === "complete");
    assert.notEqual(JSON.stringify(transported.snapshot), JSON.stringify(snapshot), "native object ordering must be exercised");
    const browserHash = Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(snapshotJson(transported.snapshot)))).toString("hex");
    assert.equal(browserHash, query.snapshotId);
    const refresh = new RepositoryRefresh({ analyze: () => { throw new Error("Ranking must not request a refresh"); }, publish() {}, status() {} });
    try {
      for (const state of ["paused", "unavailable"] as const) {
        if (state === "paused") refresh.pause(); else refresh.loss();
        const result = await rankedInvestigation(snapshot, { ...query, snapshotId: browserHash });
        assert.deepEqual(result.steps.map((s) => s.id), ["z-authentication/index.ts", "z-authentication/service.ts"]);
        assert.equal(result.model, "laya-nav-1"); assert.deepEqual(result.fallbacks, []);
      }
      const changed = structuredClone(snapshot); changed.files[0].hash = "0".repeat(64);
      assert.notEqual(snapshotIdentity(changed), browserHash);
      await assert.rejects(rankedInvestigation(changed, query), /stale_snapshot/);
    } finally { refresh.close(); }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("every renderer command is declared and narrowly authorized by the native manifest/capability", () => {
  const main = readFileSync(new URL("../src-tauri/src/main.rs", import.meta.url), "utf8");
  const handler = main.match(/generate_handler!\[([\s\S]*?)\]/)![1].match(/\b[a-z_]+\b/g)!;
  const manifest = readFileSync(new URL("../src-tauri/build.rs", import.meta.url), "utf8");
  const commands = [...manifest.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
  const capability = JSON.parse(readFileSync(new URL("../src-tauri/capabilities/main.json", import.meta.url), "utf8"));
  assert.deepEqual([...commands].sort(), [...handler].sort());
  for (const command of commands) assert(capability.permissions.includes("allow-" + command.replaceAll("_", "-")), command);
  assert.deepEqual(capability.windows, ["main"]);
  assert(!capability.permissions.some((p: string) => /shell|fs:|allow-all/.test(p)));
});
test("seeded small training repeats exactly and held-out labels cannot enter fitting", async () => {
  const f = fixture(); try {
    const item: DatasetCase = { repository: "training-1", task: "training-task", family: "train", split: "training", opaque: false, target: "authentication.ts", input: { version: 1, split: "development", snapshot: f.snapshot, options: { goal: "Locate authentication", start: "entry.ts", depth: 8, budget: 4, timeoutMs: 200 }, relevant: ["authentication.ts"], judgmentsComplete: true, assessment: "success", timeToEvidenceMs: null, ranker: "baseline" } };
    const data: Dataset = { version: 1, seed: 20261005, license: "project-owned", provenance: "synthetic-only-user-authorized", cases: [structuredClone(item), { ...structuredClone(item), split: "development", repository: "development-1", task: "dev-task", family: "dev" }, { ...structuredClone(item), split: "held-out", repository: "held-1", task: "held-task", family: "held" }] };
    const a = await train(data, "a".repeat(64)); data.cases[2].target = "DO-NOT-READ-HELD-OUT"; data.cases[2].input.relevant = ["DO-NOT-READ"];
    assert.deepEqual(await train(data, "a".repeat(64)), a);
    const leak = structuredClone(data); leak.cases[0].input.snapshot.origin.root = "/synthetic/laya/training-1"; leak.cases[1].input.snapshot.origin.root = "/synthetic/laya/development-1"; leak.cases[2].input.snapshot.origin.root = "/synthetic/laya/held-1"; leak.cases[2].family = "train"; assert.throws(() => verifySplits(leak), /leakage/);
  } finally { f.clean(); }
});

