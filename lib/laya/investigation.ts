import { LocalLaya } from "./runtime.ts";
import { LAYA_ARTIFACT } from "./artifact.ts";
import { rankInvestigation, snapshotIdentity } from "../engine/ranking.ts";
import type { CodeSnapshot } from "../engine/types.ts";
import { validateRankingQuery, verifyRanking, type RankingQuery } from "../desktop/ranking.ts";

/** Immutable snapshot capture; model artifact is selected by the host, never by the renderer. */
export async function rankedInvestigation(snapshot: CodeSnapshot, query: RankingQuery, signal?: AbortSignal) {
  const q = validateRankingQuery(query);
  if (q.snapshotId !== snapshotIdentity(snapshot)) throw new Error("stale_snapshot");
  const local = new LocalLaya(LAYA_ARTIFACT);
  const abort = () => local.close(); signal?.addEventListener("abort", abort, { once: true });
  let preparationFailure: string | null = null;
  try {
    if (q.mode === "laya" && !signal?.aborted) try { await local.prepare(); } catch (error) { preparationFailure = error instanceof Error ? error.message : "inference_failure"; }
    const ranker = q.mode === "baseline" ? undefined : preparationFailure ? async () => { throw new Error(preparationFailure!); } : local.ranker;
    const run = await rankInvestigation(snapshot, { goal: q.goal, start: q.start, budget: q.budget, depth: q.depth, timeoutMs: 200 }, ranker, signal);
    return verifyRanking(snapshot, q, { snapshotId: run.snapshotId, mode: q.mode, model: "laya-nav-1", qualified: LAYA_ARTIFACT.qualified, steps: run.steps,
      fallbacks: [...new Set(run.decisions.flatMap((d) => d.fallback ? [d.fallback] : []))], cancelled: run.cancelled, truncated: run.truncated, elapsedMs: run.elapsedMs });
  } finally { signal?.removeEventListener("abort", abort); local.close(); }
}
