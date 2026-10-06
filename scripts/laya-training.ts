import { createHash } from "node:crypto";
import { features, forward, scoreGradient, random, PARAMETERS, INPUTS, HIDDEN, type Model } from "../lib/laya/model.ts";
import { rankInvestigation, type RankInput } from "../lib/engine/ranking.ts";
import type { Dataset, DatasetCase } from "./laya-dataset.ts";
export type Pair = { positive: number[]; negative: number[] };
export const TRAINING = { seed: 42, epochs: 32, batch: 64, learningRate: 0.003, beta1: 0.9, beta2: 0.999, epsilon: 1e-8, l2: 0.0001 };
function ancestors(item: DatasetCase): Set<string> {
  const seen = new Set([item.target]), queue = [item.target];
  for (let i = 0; i < queue.length; i++) for (const edge of item.input.snapshot.relationships) if (edge.target === queue[i] && !seen.has(edge.source)) { seen.add(edge.source); queue.push(edge.source); }
  return seen;
}
export async function pairs(items: DatasetCase[]): Promise<Pair[]> {
  const result: Pair[] = [], rng = random(1024);
  for (const item of items.filter((c) => !c.opaque)) {
    const positive = ancestors(item), run = await rankInvestigation(item.input.snapshot, { ...item.input.options, budget: 200 });
    for (const d of run.decisions) {
      const input: RankInput = { goal: item.input.options.goal, snapshotId: run.snapshotId, contextId: d.contextId, candidates: d.candidates };
      const combinations: Pair[] = [];
      for (const a of d.candidates) for (const b of d.candidates) {
        const grade = (id: string) => id === item.target ? 2 : positive.has(id) ? 1 : 0;
        if (grade(a.id) > grade(b.id)) combinations.push({ positive: features(input, a), negative: features(input, b) });
      }
      for (let i = combinations.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [combinations[i], combinations[j]] = [combinations[j], combinations[i]]; }
      result.push(...combinations.slice(0, 8));
    }
  }
  return result;
}
export function pairLoss(weights: number[], pair: Pair): number {
  const delta = forward(weights, pair.positive).score - forward(weights, pair.negative).score;
  return Math.max(0, -delta) + Math.log1p(Math.exp(-Math.abs(delta)));
}
export async function train(data: Dataset, hash: string) {
  const training = await pairs(data.cases.filter((c) => c.split === "training")), development = await pairs(data.cases.filter((c) => c.split === "development"));
  if (!training.length || !development.length) throw new Error("Empty training/development pairs");
  const rng = random(TRAINING.seed), weights = Array.from({ length: PARAMETERS }, (_, i) => i < INPUTS * HIDDEN ? (rng() * 2 - 1) * Math.sqrt(6 / (INPUTS + HIDDEN)) : i < INPUTS * HIDDEN + HIDDEN ? 0 : (rng() * 2 - 1) * Math.sqrt(6 / (HIDDEN + 1)));
  const first = weights.slice(), m = Array.from({ length: PARAMETERS }, () => 0), v = m.slice();
  let updates = 0, best = Infinity, bestWeights = weights.slice(), bestEpoch = 0;
  const trace: { epoch: number; trainingLoss: number; developmentLoss: number }[] = [];
  for (let epoch = 1; epoch <= TRAINING.epochs; epoch++) {
    const indices = Array.from({ length: training.length }, (_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [indices[i], indices[j]] = [indices[j], indices[i]]; }
    for (let offset = 0; offset < indices.length; offset += TRAINING.batch) {
      const batch = indices.slice(offset, offset + TRAINING.batch), gradient = Array.from({ length: PARAMETERS }, () => 0);
      for (const index of batch) {
        const p = training[index], delta = forward(weights, p.positive).score - forward(weights, p.negative).score;
        const derivative = -1 / (1 + Math.exp(Math.max(-40, Math.min(40, delta))));
        const a = scoreGradient(weights, p.positive), b = scoreGradient(weights, p.negative);
        for (let i = 0; i < PARAMETERS; i++) gradient[i] += derivative * (a[i] - b[i]);
      }
      updates++;
      for (let i = 0; i < PARAMETERS; i++) {
        const g = gradient[i] / batch.length + TRAINING.l2 * weights[i];
        m[i] = TRAINING.beta1 * m[i] + (1 - TRAINING.beta1) * g; v[i] = TRAINING.beta2 * v[i] + (1 - TRAINING.beta2) * g * g;
        weights[i] -= TRAINING.learningRate * (m[i] / (1 - TRAINING.beta1 ** updates)) / (Math.sqrt(v[i] / (1 - TRAINING.beta2 ** updates)) + TRAINING.epsilon);
      }
    }
    const trainingLoss = training.reduce((sum, p) => sum + pairLoss(weights, p), 0) / training.length;
    const developmentLoss = development.reduce((sum, p) => sum + pairLoss(weights, p), 0) / development.length;
    trace.push({ epoch, trainingLoss, developmentLoss });
    if (developmentLoss < best) { best = developmentLoss; bestWeights = weights.slice(); bestEpoch = epoch; }
  }
  const model: Model = { version: 1, name: "laya-nav-1", featureVersion: 1, inputs: 16, hidden: 16, weights: bestWeights, datasetHash: hash, license: "project-owned" };
  return { model, configuration: TRAINING, trainingPairs: training.length, developmentPairs: development.length, initialLoss: training.reduce((sum, p) => sum + pairLoss(first, p), 0) / training.length, bestEpoch, trace,
    trainingTraceHash: createHash("sha256").update(JSON.stringify(trace)).digest("hex") };
}
