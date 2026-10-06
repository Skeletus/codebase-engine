import type { CodeSnapshot } from "../engine/types.ts";
import type { Candidate } from "../engine/ranking.ts";

export type RankingQuery = { goal: string; start: string; depth: number; budget: number; mode: "baseline" | "laya"; snapshotId: string };
export type RankingResult = { snapshotId: string; mode: "baseline" | "laya"; model: string; qualified: boolean; steps: Candidate[]; fallbacks: string[]; cancelled: boolean; truncated: boolean; elapsedMs: number };
const reasons = ["timeout", "cancelled", "invalid_output", "stale_or_invalid_identity", "invalid_candidate_count", "invalid_score_or_candidate", "invalid_score", "outside_domain", "input_limit", "model_unavailable", "model_corrupt", "model_not_qualified", "inference_failure", "ranker_failure"];
function object(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid ranking object");
  return Object.fromEntries(Object.entries(value));
}
function relative(value: unknown): value is string { return typeof value === "string" && value.length > 0 && value.length <= 4096 && !value.startsWith("/") && !value.split("/").includes("..") && !/[\\:\0]/.test(value); }
export function validateRankingQuery(value: unknown): RankingQuery {
  const q = object(value);
  if (Object.keys(q).sort().join() !== "budget,depth,goal,mode,snapshotId,start" || typeof q.goal !== "string" || !q.goal.trim() || q.goal.length > 256 || q.goal.includes("\0") || !relative(q.start) || typeof q.snapshotId !== "string" || !/^[a-f0-9]{64}$/.test(q.snapshotId) || (q.mode !== "baseline" && q.mode !== "laya") || typeof q.budget !== "number" || !Number.isSafeInteger(q.budget) || q.budget < 1 || q.budget > 50 || typeof q.depth !== "number" || !Number.isSafeInteger(q.depth) || q.depth < 0 || q.depth > 16) throw new Error("Invalid ranking query");
  return { goal: q.goal, start: q.start, depth: q.depth, budget: q.budget, mode: q.mode, snapshotId: q.snapshotId };
}
export function validateRankingResult(value: unknown): RankingResult {
  const r = object(value);
  if (Object.keys(r).sort().join() !== "cancelled,elapsedMs,fallbacks,mode,model,qualified,snapshotId,steps,truncated" || typeof r.snapshotId !== "string" || !/^[a-f0-9]{64}$/.test(r.snapshotId) || (r.mode !== "baseline" && r.mode !== "laya") || r.model !== "laya-nav-1" || typeof r.qualified !== "boolean" || typeof r.cancelled !== "boolean" || typeof r.truncated !== "boolean" || typeof r.elapsedMs !== "number" || !Number.isFinite(r.elapsedMs) || r.elapsedMs < 0 || !Array.isArray(r.steps) || r.steps.length > 50 || !Array.isArray(r.fallbacks) || r.fallbacks.length > reasons.length || !r.fallbacks.every((f) => reasons.includes(f))) throw new Error("Invalid ranking result");
  const steps: Candidate[] = r.steps.map((value) => {
    const c = object(value);
    if (Object.keys(c).sort().join() !== "depth,fanIn,fanOut,id,witness" || !relative(c.id) || typeof c.depth !== "number" || !Number.isSafeInteger(c.depth) || c.depth < 1 || c.depth > 16 || typeof c.fanIn !== "number" || !Number.isSafeInteger(c.fanIn) || c.fanIn < 0 || typeof c.fanOut !== "number" || !Number.isSafeInteger(c.fanOut) || c.fanOut < 0 || !Array.isArray(c.witness) || c.witness.length !== c.depth || !c.witness.every((e) => typeof e === "string" && e.length <= 16400)) throw new Error("Invalid ranking step");
    return { id: c.id, depth: c.depth, fanIn: c.fanIn, fanOut: c.fanOut, witness: c.witness };
  });
  if (new Set(steps.map((s) => s.id)).size !== steps.length) throw new Error("Duplicate ranking step");
  return { snapshotId: r.snapshotId, mode: r.mode, model: r.model, qualified: r.qualified, cancelled: r.cancelled, truncated: r.truncated, elapsedMs: r.elapsedMs, steps, fallbacks: r.fallbacks };
}
export function verifyRanking(snapshot: CodeSnapshot, query: RankingQuery, value: unknown): RankingResult {
  const r = validateRankingResult(value), files = new Map(snapshot.files.map((f) => [f.id, f])), edges = new Map(snapshot.relationships.map((e) => [e.id, e]));
  if (r.snapshotId !== query.snapshotId || r.mode !== query.mode || r.steps.length > query.budget || !files.has(query.start)) throw new Error("Stale or invalid ranking identity");
  for (const step of r.steps) {
    const f = files.get(step.id); let previous = query.start;
    if (!f || step.id === query.start || step.depth > query.depth || f.fanIn !== step.fanIn || f.fanOut !== step.fanOut) throw new Error("Invalid ranked file");
    for (const id of step.witness) { const e = edges.get(id); if (!e || e.source !== previous) throw new Error("Invalid ranking witness"); previous = e.target; }
    if (previous !== step.id) throw new Error("Invalid ranking endpoint");
  }
  return r;
}
