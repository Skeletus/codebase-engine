import { investigate } from "./investigations.ts";
import { rankInvestigation, snapshotIdentity, testRankers, validateRankingOptions, type RankingOptions, type RankingRun } from "./ranking.ts";
import type { CodeSnapshot } from "./types.ts";

export type EvaluationCase = { version: 1; split: "development" | "held-out"; snapshot: CodeSnapshot;
  options: RankingOptions; relevant: string[]; judgmentsComplete: boolean;
  assessment: "success" | "failure" | "unsupported"; timeToEvidenceMs: number | null;
  ranker: "baseline" | keyof typeof testRankers };
function distances(snapshot: CodeSnapshot, start: string, depth: number): Map<string, number> {
  const adjacent = new Map<string, string[]>();
  for (const edge of snapshot.relationships) { const targets = adjacent.get(edge.source) ?? []; targets.push(edge.target); adjacent.set(edge.source, targets); }
  const distance = new Map([[start, 0]]), queue = [start];
  for (let i = 0; i < queue.length; i++) {
    const currentDepth = distance.get(queue[i])!; if (currentDepth >= depth) continue;
    for (const target of adjacent.get(queue[i]) ?? []) if (!distance.has(target)) { distance.set(target, currentDepth + 1); queue.push(target); }
  }
  return distance;
}
export function validateEvaluationCase(input: EvaluationCase): void {
  if (!input || Object.keys(input).sort().join() !== "assessment,judgmentsComplete,options,ranker,relevant,snapshot,split,timeToEvidenceMs,version") throw new Error("Invalid evaluation fields");
  validateRankingOptions(input.options);
  if (input.version !== 1 || !["development", "held-out"].includes(input.split) || !["success", "failure", "unsupported"].includes(input.assessment) || !["baseline", ...Object.keys(testRankers)].includes(input.ranker) || typeof input.judgmentsComplete !== "boolean") throw new Error("Invalid evaluation case");
  if (!Array.isArray(input.relevant) || input.relevant.length > 200 || new Set(input.relevant).size !== input.relevant.length || input.relevant.some((id) => typeof id !== "string" || !input.snapshot.files.some((f) => f.id === id))) throw new Error("Invalid relevance judgments");
  if (input.timeToEvidenceMs !== null && (!Number.isSafeInteger(input.timeToEvidenceMs) || input.timeToEvidenceMs < 1 || input.timeToEvidenceMs > 86400000)) throw new Error("Invalid human evidence time");
  // Relevance applies only to outgoing reachable candidates within the depth limit.
  const seen = distances(input.snapshot, input.options.start, input.options.depth);
  if (input.relevant.some((id) => id === input.options.start || !seen.has(id))) throw new Error("Relevant IDs must be verified reachable candidates");
}
/** Aggregate only within a declared split; unknown/incomplete judgments stay excluded. */
export function meanReciprocalRank(values: (number | null)[]) {
  const supported = values.filter((v): v is number => v !== null);
  if (supported.some((v) => !Number.isFinite(v) || v < 0 || v > 1)) throw new Error("Invalid reciprocal rank");
  return { mrr: supported.length ? supported.reduce((a, b) => a + b, 0) / supported.length : null, denominator: supported.length, unsupported: values.length - supported.length };
}
export function metrics(run: RankingRun, input: EvaluationCase) {
  const relevant = new Set(input.relevant), hit = run.steps.findIndex((s) => relevant.has(s.id)), found = run.steps.filter((s) => relevant.has(s.id)).length;
  const distance = distances(input.snapshot, input.options.start, input.options.depth);
  const shortest = input.relevant.length ? Math.min(...input.relevant.map((id) => distance.get(id) ?? Infinity)) : Infinity;
  return { k: input.options.budget, recallAtK: input.judgmentsComplete && relevant.size ? found / relevant.size : null,
    reciprocalRank: input.judgmentsComplete && relevant.size ? hit < 0 ? 0 : 1 / (hit + 1) : null,
    inspectedNodes: run.steps.length, timeToEvidenceMs: input.assessment === "success" ? input.timeToEvidenceMs : null,
    pathEfficiency: input.judgmentsComplete && hit >= 0 && Number.isFinite(shortest) ? shortest / (hit + 1) : null,
    assessment: input.assessment, cancelled: run.cancelled, truncated: run.truncated,
    fallbacks: run.decisions.filter((d) => d.fallback).map((d) => d.fallback), elapsedControllerMs: run.elapsedMs };
}
export async function evaluate(input: EvaluationCase) {
  validateEvaluationCase(input);
  const before = JSON.stringify(input.snapshot), identity = snapshotIdentity(input.snapshot);
  const impactBefore = investigate(input.snapshot, { operation: "ask", intent: "dependents", target: input.options.start, depth: 64, budget: 200 });
  const baseline = await rankInvestigation(input.snapshot, input.options);
  const supplied = await rankInvestigation(input.snapshot, input.options, input.ranker === "baseline" ? undefined : testRankers[input.ranker]);
  const impactAfter = investigate(input.snapshot, { operation: "ask", intent: "dependents", target: input.options.start, depth: 64, budget: 200 });
  if (before !== JSON.stringify(input.snapshot) || JSON.stringify(impactBefore) !== JSON.stringify(impactAfter)) throw new Error("Ranking changed structural truth");
  return { identity, baseline, supplied, baselineMetrics: metrics(baseline, { ...input, assessment: "unsupported", timeToEvidenceMs: null }), suppliedMetrics: metrics(supplied, input),
    structuralRecall: 1, structuralCheck: "Byte-identical canonical graph and unchanged deterministic impact; not a claim of complete parser coverage." };
}
