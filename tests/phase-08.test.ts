import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { typescriptAdapter } from "../lib/engine/adapters/typescript.ts";
import { rankInvestigation, orderCandidates, testRankers, type RankInput, type Ranker } from "../lib/engine/ranking.ts";
import { evaluate, meanReciprocalRank, type EvaluationCase } from "../lib/engine/evaluation.ts";
import { EvaluationStore } from "../lib/storage/evaluations.ts";
import { investigate } from "../lib/engine/investigations.ts";

const input: RankInput = { goal: "Inspect evidence", snapshotId: "snapshot", contextId: "context", candidates: [
  { id: "a", depth: 1, fanIn: 1, fanOut: 0, witness: ["edge-a"] },
  { id: "z", depth: 1, fanIn: 1, fanOut: 0, witness: ["edge-z"] },
] };
const output = (q: RankInput) => ({ snapshotId: q.snapshotId, contextId: q.contextId, scores: q.candidates.map((c) => ({ id: c.id, score: 1 })) });
function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "phase08 spaces "));
  for (const [file, contents] of Object.entries({ "entry.ts": 'import "./a"; import "./z";', "a.ts": 'import "./b";', "b.ts": 'import "./entry";', "z.ts": "export const evidence = 1;" })) writeFileSync(path.join(root, file), contents);
  const snapshot = typescriptAdapter.analyze(root);
  const evaluation: EvaluationCase = { version: 1, split: "development", snapshot, options: { goal: "Find evidence", start: "entry.ts", budget: 2, depth: 8, timeoutMs: 20 }, relevant: ["z.ts"], judgmentsComplete: true, assessment: "success", timeToEvidenceMs: 1000, ranker: "reverse" };
  return { root, evaluation, clean() { rmSync(root, { recursive: true, force: true }); } };
}
test("model-free ordering and stable score ties use depth then exact ID", async () => {
  assert.deepEqual((await orderCandidates(input)).ordered.map((c) => c.id), ["a", "z"]);
  assert.deepEqual((await orderCandidates(input, async (q) => output(q))).ordered.map((c) => c.id), ["a", "z"]);
  assert.deepEqual((await orderCandidates(input, testRankers.reverse)).ordered.map((c) => c.id), ["z", "a"]);
});
test("unknown/duplicate/missing candidates, nonfinite scores, extra fields and stale identities fall back", async () => {
  const variants = [
    { ...output(input), snapshotId: "old" }, { ...output(input), contextId: "old" },
    { ...output(input), scores: [{ id: "bad", score: 1 }, { id: "z", score: 2 }] },
    { ...output(input), scores: [{ id: "a", score: 1 }, { id: "a", score: 2 }] },
    { ...output(input), scores: [{ id: "a", score: Infinity }, { id: "z", score: 2 }] },
    { ...output(input), scores: [] }, { ...output(input), edges: [] },
  ];
  for (const value of variants) { const ordered = await orderCandidates(input, async () => value); assert(ordered.fallback); assert.deepEqual(ordered.ordered.map((c) => c.id), ["a", "z"]); }
  await assert.rejects(orderCandidates({ ...input, candidates: [input.candidates[0], input.candidates[0]] }));
});
test("timeouts, failures and cancellation abort adapter and do not leak exception text", async () => {
  assert.equal((await orderCandidates(input, testRankers.timeout, undefined, 5)).fallback, "timeout");
  assert.equal((await orderCandidates(input, async () => { throw new Error("secret"); })).fallback, "ranker_failure");
  const control = new AbortController(); const pending = orderCandidates(input, async (_, signal) => new Promise((resolve) => signal.addEventListener("abort", () => resolve(null))), control.signal, 100);
  setTimeout(() => control.abort(), 5); assert.equal((await pending).fallback, "cancelled");
  assert.equal((await orderCandidates(input, testRankers.reverse, control.signal)).fallback, "cancelled");
});
test("adapter inputs are immutable and output cannot change candidates/witnesses", async () => {
  const before = JSON.stringify(input);
  assert.equal((await orderCandidates(input, async (q) => { q.candidates[0].witness.push("invented"); return output(q); })).fallback, "ranker_failure");
  assert.equal(JSON.stringify(input), before);
});
test("bounded ranking changes only inspection order, retains verified witnesses and unchanged impact", async () => {
  const f = fixture(); try {
    const before = JSON.stringify(f.evaluation.snapshot), impact = investigate(f.evaluation.snapshot, { operation: "ask", intent: "dependents", target: "z.ts", depth: 64, budget: 200 });
    const result = await evaluate(f.evaluation);
    assert.deepEqual(result.baseline.steps.map((c) => c.id), ["a.ts", "z.ts"]);
    assert.deepEqual(result.supplied.steps.map((c) => c.id), ["z.ts", "a.ts"]);
    for (const step of result.supplied.steps) {
      let cursor = "entry.ts";
      for (const id of step.witness) { const edge = f.evaluation.snapshot.relationships.find((r) => r.id === id)!; assert.equal(edge.source, cursor); cursor = edge.target; }
      assert.equal(cursor, step.id);
    }
    assert.equal(JSON.stringify(f.evaluation.snapshot), before); assert.deepEqual(investigate(f.evaluation.snapshot, { operation: "ask", intent: "dependents", target: "z.ts", depth: 64, budget: 200 }), impact);
    assert.equal(result.structuralRecall, 1); assert.equal(result.suppliedMetrics.recallAtK, 1); assert.equal(result.suppliedMetrics.reciprocalRank, 1); assert.equal(result.baselineMetrics.reciprocalRank, .5); assert.equal(result.suppliedMetrics.pathEfficiency, 1);
  } finally { f.clean(); }
});
test("budget/depth/cycles, disabled ranking and cancellation preserve bounded model-free behavior", async () => {
  const f = fixture(); try {
    const { snapshot, options } = f.evaluation;
    const one = await rankInvestigation(snapshot, { ...options, budget: 1 }); assert.equal(one.steps.length, 1); assert(one.truncated);
    assert.equal((await rankInvestigation(snapshot, { ...options, depth: 0 })).steps.length, 0);
    const all = await rankInvestigation(snapshot, { ...options, budget: 200 }); assert.equal(all.steps.length, 3); assert.equal(new Set(all.steps.map((s) => s.id)).size, 3);
    const cancel = new AbortController(); cancel.abort(); assert((await rankInvestigation(snapshot, options, undefined, cancel.signal)).cancelled);
    for (const budget of [0, 201, NaN]) await assert.rejects(rankInvestigation(snapshot, { ...options, budget }));
    await assert.rejects(rankInvestigation(snapshot, { ...options, start: "absent" }));
  } finally { f.clean(); }
});
test("snapshot mutation during await is rejected instead of returning stale evidence", async () => {
  const f = fixture(); try {
    const ranker: Ranker = async (q) => { f.evaluation.snapshot.files[0].exports.push("changed"); return output(q); };
    await assert.rejects(rankInvestigation(f.evaluation.snapshot, f.evaluation.options, ranker), /Snapshot changed/);
  } finally { f.clean(); }
});
test("repeatable replay, consent and secure local record deletion without telemetry or source", async () => {
  const f = fixture(), store = new EvaluationStore(path.join(f.root, "local-evaluation.sqlite"));
  try {
    const result = await evaluate(f.evaluation);
    await assert.rejects(store.save(f.evaluation, false), /consent/);
    const id = await store.save(f.evaluation, true), read = store.read(id), replay = await evaluate(read.input);
    assert.deepEqual(replay.supplied.steps, result.supplied.steps); assert.deepEqual(replay.supplied.decisions, result.supplied.decisions);
    assert.equal(replay.identity, result.identity); assert.deepEqual(store.list(), [id]);
    assert(!JSON.stringify(read).includes('export const evidence = 1;')); store.delete(id); assert.deepEqual(store.list(), []); assert.throws(() => store.read(id), /Unknown/);
  } finally { store.close(); f.clean(); }
});
test("incomplete/no-ground-truth judgments are null and MRR declares denominator", async () => {
  const f = fixture(); try {
    const result = await evaluate({ ...f.evaluation, judgmentsComplete: false, assessment: "unsupported", timeToEvidenceMs: null });
    assert.equal(result.suppliedMetrics.recallAtK, null); assert.equal(result.suppliedMetrics.pathEfficiency, null); assert.equal(result.suppliedMetrics.timeToEvidenceMs, null);
    assert.deepEqual(meanReciprocalRank([1, 0, .5, null]), { mrr: .5, denominator: 3, unsupported: 1 });
    await assert.rejects(evaluate({ ...f.evaluation, relevant: ["entry.ts"] }));
  } finally { f.clean(); }
});
test("denied egress still supports baseline and records visible failure fallback", async () => {
  const original = globalThis.fetch, f = fixture(); globalThis.fetch = async () => { throw new Error("egress denied"); };
  try {
    const result = await evaluate({ ...f.evaluation, ranker: "failure", assessment: "failure" });
    assert.deepEqual(result.supplied.steps, result.baseline.steps); assert(result.suppliedMetrics.fallbacks.every((v) => v === "ranker_failure"));
    assert.equal(result.suppliedMetrics.assessment, "failure");
  } finally { globalThis.fetch = original; f.clean(); }
});
test("stored CLI summary separates held-out cases and includes failures rather than favorable-only MRR", async () => {
  const f = fixture(), file = path.join(f.root, "evaluation.sqlite"), store = new EvaluationStore(file);
  try {
    await store.save(f.evaluation, true);
    await store.save({ ...f.evaluation, ranker: "failure", assessment: "failure" }, true);
    await store.save({ ...f.evaluation, split: "held-out", ranker: "baseline", assessment: "unsupported" }, true);
    const summary = execFileSync(process.execPath, ["scripts/evaluate-ranking.ts", "summary", "--db", file], { encoding: "utf8", timeout: 10000 });
    const mrr = [...summary.matchAll(/"mrr": ([\d.]+)/g)].map((m) => Number(m[1]));
    assert.deepEqual(mrr, [.5, .75, .5, .5]); assert(summary.includes('"failures": 1')); assert(summary.includes('"unsupported": 1')); assert(summary.includes('"split": "held-out"'));
  } finally { store.close(); f.clean(); }
});
