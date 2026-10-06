import { createHash } from "node:crypto";
import type { CodeSnapshot } from "./types.ts";
import { snapshotJson } from "./snapshot-identity.ts";

export type Candidate = { id: string; depth: number; fanIn: number; fanOut: number; witness: string[] };
export type RankInput = { goal: string; snapshotId: string; contextId: string; candidates: Candidate[] };
export type RankOutput = { snapshotId: string; contextId: string; scores: { id: string; score: number }[] };
/** Trusted local adapter only. No repository plugins, graph writes, network or credentials. */
export type Ranker = (input: Readonly<RankInput>, signal: AbortSignal) => Promise<unknown>;
export type RankingOptions = { goal: string; start: string; budget: number; depth: number; timeoutMs: number };
export type RankingRun = { snapshotId: string; options: RankingOptions; steps: Candidate[];
  decisions: { contextId: string; candidates: Candidate[]; order: string[]; fallback: string | null }[];
  cancelled: boolean; truncated: boolean; elapsedMs: number };
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
export function snapshotIdentity(snapshot: CodeSnapshot): string {
  return createHash("sha256").update(snapshotJson(snapshot)).digest("hex");
}
export function validateRankingOptions(q: RankingOptions): RankingOptions {
  if (!q || Object.keys(q).sort().join() !== "budget,depth,goal,start,timeoutMs" || typeof q.goal !== "string" || !q.goal.trim() || q.goal.length > 256 || q.goal.includes("\0") || typeof q.start !== "string" || q.start.length > 4096) throw new Error("Invalid ranking goal/start");
  for (const [value, min, max] of [[q.budget, 1, 200], [q.depth, 0, 64], [q.timeoutMs, 1, 1000]]) if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error("Invalid ranking limits");
  return { ...q };
}
function validateScores(value: unknown, input: RankInput): Map<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_output");
  const r = Object.fromEntries(Object.entries(value));
  if (Object.keys(r).sort().join() !== "contextId,scores,snapshotId" || r.snapshotId !== input.snapshotId || r.contextId !== input.contextId) throw new Error("stale_or_invalid_identity");
  if (!Array.isArray(r.scores) || r.scores.length !== input.candidates.length) throw new Error("invalid_candidate_count");
  const allowed = new Set(input.candidates.map((c) => c.id)), scores = new Map<string, number>();
  for (const item of r.scores) {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("invalid_score");
    const score = Object.fromEntries(Object.entries(item));
    if (Object.keys(score).sort().join() !== "id,score" || typeof score.id !== "string" || !allowed.has(score.id) || scores.has(score.id) || typeof score.score !== "number" || !Number.isFinite(score.score)) throw new Error("invalid_score_or_candidate");
    scores.set(score.id, score.score);
  }
  return scores;
}
export async function orderCandidates(input: RankInput, ranker?: Ranker, signal?: AbortSignal, timeoutMs = 100) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 1000 || input.candidates.length > 200 || new Set(input.candidates.map((c) => c.id)).size !== input.candidates.length) throw new Error("Invalid ordering limits/candidates");
  const baseline = [...input.candidates].sort((a, b) => a.depth - b.depth || compare(a.id, b.id));
  if (signal?.aborted) return { ordered: baseline, fallback: "cancelled" };
  if (!ranker) return { ordered: baseline, fallback: null };
  if (Buffer.byteLength(JSON.stringify(input)) > 4 * 1024 * 1024) return { ordered: baseline, fallback: "input_limit" };
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: (() => void) | undefined;
  try {
    // Clone and freeze each field: an adapter cannot mutate controller candidates.
    const safe = structuredClone(input);
    for (const c of safe.candidates) { Object.freeze(c.witness); Object.freeze(c); }
    Object.freeze(safe.candidates); Object.freeze(safe);
    const interrupted = new Promise<never>((_, reject) => {
      timer = setTimeout(() => { reject(new Error("timeout")); controller.abort(); }, timeoutMs);
      abort = () => { reject(new Error("cancelled")); controller.abort(); };
      signal?.addEventListener("abort", abort, { once: true });
    });
    const value = await Promise.race([Promise.resolve().then(() => ranker(safe, controller.signal)), interrupted]);
    const scores = validateScores(value, input);
    return { ordered: baseline.sort((a, b) => scores.get(b.id)! - scores.get(a.id)! || a.depth - b.depth || compare(a.id, b.id)), fallback: null };
  } catch (error) {
    // Never expose arbitrary adapter exception text (could contain secrets/source).
    const known = new Set(["timeout", "cancelled", "invalid_output", "stale_or_invalid_identity", "invalid_candidate_count", "invalid_score_or_candidate", "invalid_score", "outside_domain", "input_limit", "model_unavailable", "model_corrupt", "model_not_qualified", "inference_failure"]);
    return { ordered: baseline, fallback: error instanceof Error && known.has(error.message) ? error.message : "ranker_failure" };
  } finally { if (timer) clearTimeout(timer); if (abort) signal?.removeEventListener("abort", abort); controller.abort(); }
}
/** Bounded outgoing dependency investigation. Impact and exhaustive queries are untouched. */
export async function rankInvestigation(snapshot: CodeSnapshot, options: RankingOptions, ranker?: Ranker, signal?: AbortSignal): Promise<RankingRun> {
  const q = validateRankingOptions(options), identity = snapshotIdentity(snapshot), began = performance.now();
  const files = new Map(snapshot.files.map((f) => [f.id, f]));
  if (!files.has(q.start)) throw new Error("Choose an exact snapshot file");
  const adjacent = new Map<string, CodeSnapshot["relationships"]>();
  for (const edge of [...snapshot.relationships].sort((a, b) => compare(a.id, b.id))) {
    const list = adjacent.get(edge.source) ?? []; list.push(edge); adjacent.set(edge.source, list);
  }
  const discovered = new Set([q.start]), frontier = new Map<string, Candidate>();
  const result: RankingRun = { snapshotId: identity, options: q, steps: [], decisions: [], cancelled: false, truncated: false, elapsedMs: 0 };
  function expand(id: string, depth: number, witness: string[]) {
    if (depth >= q.depth) { if ((adjacent.get(id) ?? []).some((e) => !discovered.has(e.target))) result.truncated = true; return; }
    for (const edge of adjacent.get(id) ?? []) if (!discovered.has(edge.target)) {
      // Stop at an explicit resource boundary rather than silently dropping candidates.
      if (discovered.size >= 1001) { result.truncated = true; continue; }
      discovered.add(edge.target);
      const file = files.get(edge.target);
      if (!file) throw new Error("Invalid graph endpoint");
      frontier.set(edge.target, { id: edge.target, depth: depth + 1, fanIn: file.fanIn, fanOut: file.fanOut, witness: [...witness, edge.id] });
    }
  }
  expand(q.start, 0, []);
  while (frontier.size && result.steps.length < q.budget && !signal?.aborted) {
    const candidates = [...frontier.values()].sort((a, b) => a.depth - b.depth || compare(a.id, b.id));
    // A ranker sees a deterministic window; the remainder remains in the frontier.
    const window = candidates.slice(0, 200);
    const contextId = createHash("sha256").update(JSON.stringify({ identity, q, steps: result.steps.map((s) => s.id), window })).digest("hex");
    const ordered = await orderCandidates({ goal: q.goal, snapshotId: identity, contextId, candidates: window }, ranker, signal, q.timeoutMs);
    result.decisions.push({ contextId, candidates: window, order: ordered.ordered.map((c) => c.id), fallback: ordered.fallback });
    if (signal?.aborted || ordered.fallback === "cancelled") { result.cancelled = true; break; }
    const selected = ordered.ordered[0]; frontier.delete(selected.id); result.steps.push(selected); expand(selected.id, selected.depth, selected.witness);
  }
  result.cancelled ||= signal?.aborted ?? false;
  result.truncated ||= frontier.size > 0;
  result.elapsedMs = performance.now() - began;
  if (snapshotIdentity(snapshot) !== identity) throw new Error("Snapshot changed during ranking; discard investigation");
  return result;
}

/** Supplied synthetic test adapters, not production inference or learned models. */
export const testRankers: Record<"reverse" | "failure" | "timeout" | "invalid", Ranker> = {
  reverse: async (q) => ({ snapshotId: q.snapshotId, contextId: q.contextId, scores: [...q.candidates].sort((a, b) => compare(b.id, a.id)).map((c, i) => ({ id: c.id, score: -i })) }),
  failure: async () => { throw new Error("Synthetic failure"); },
  timeout: async () => new Promise(() => {}),
  invalid: async (q) => ({ snapshotId: q.snapshotId, contextId: q.contextId, scores: [{ id: "not-a-candidate", score: 1 }] }),
};
