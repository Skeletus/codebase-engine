import type { Candidate, RankInput, RankOutput } from "../engine/ranking.ts";

export const FEATURE_VERSION = 1;
export const INPUTS = 16;
export const HIDDEN = 16;
export const PARAMETERS = INPUTS * HIDDEN + HIDDEN + HIDDEN + 1;
export type Model = { version: 1; name: "laya-nav-1"; featureVersion: 1; inputs: 16; hidden: 16; weights: number[]; datasetHash: string; license: "project-owned" };
const STOP = new Set("a an and are at code dependency dependencies does find for from how implementation inspect investigate locate of path the this to trace understand where which with work works".split(" "));
export function tokens(text: string): string[] {
  return [...new Set(text.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((s) => s && !STOP.has(s) && !["ts", "tsx", "js", "jsx", "mjs", "cjs"].includes(s)))].slice(0, 64);
}
const bounded = (n: number) => Math.max(0, Math.min(1, n));
/** Fixed, vocabulary-free features: no source, pretrained embeddings or label input. */
export function features(input: RankInput, c: Candidate): number[] {
  const goal = tokens(input.goal), path = tokens(c.id), filename = tokens(c.id.split("/").at(-1) ?? ""), folders = tokens(c.id.split("/").slice(0, -1).join("/"));
  const match = (terms: string[]) => goal.filter((g) => terms.includes(g)).length / Math.max(1, goal.length);
  const test = /(^|[./_-])(test|tests|spec)([./_-]|$)/i.test(c.id) ? 1 : 0;
  const wantsTests = /\b(tests?|testing|specs?)\b/i.test(input.goal) ? 1 : 0;
  const minDepth = Math.min(...input.candidates.map((n) => n.depth));
  return [match(path), match(filename), match(folders),
    goal.filter((g) => path.some((p) => p.length > 3 && g.length > 3 && (p.startsWith(g) || g.startsWith(p)))).length / Math.max(1, goal.length),
    bounded(c.depth / 16), bounded((c.depth - minDepth) / 16),
    bounded(Math.log1p(c.fanIn) / Math.log(65)), bounded(Math.log1p(c.fanOut) / Math.log(65)),
    test, wantsTests, test * wantsTests, test * (1 - wantsTests),
    bounded(c.witness.length / 16), bounded(input.candidates.length / 200),
    bounded(c.id.split("/").length / 16), bounded(goal.length / 64)];
}
export function validateModel(value: unknown): Model {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("model_corrupt");
  const m = Object.fromEntries(Object.entries(value));
  if (Object.keys(m).sort().join() !== "datasetHash,featureVersion,hidden,inputs,license,name,version,weights" || m.version !== 1 || m.name !== "laya-nav-1" || m.featureVersion !== FEATURE_VERSION || m.inputs !== INPUTS || m.hidden !== HIDDEN || m.license !== "project-owned" || typeof m.datasetHash !== "string" || !/^[a-f0-9]{64}$/.test(m.datasetHash) || !Array.isArray(m.weights) || m.weights.length !== PARAMETERS || !m.weights.every((n) => typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= 100)) throw new Error("model_corrupt");
  return { version: 1, name: "laya-nav-1", featureVersion: 1, inputs: 16, hidden: 16, license: "project-owned", datasetHash: m.datasetHash, weights: m.weights.map((n) => Number(n)) };
}
export function forward(weights: readonly number[], x: readonly number[]) {
  if (weights.length !== PARAMETERS || x.length !== INPUTS) throw new Error("Invalid network dimensions");
  const hidden = Array.from({ length: HIDDEN }, (_, j) => {
    let value = weights[INPUTS * HIDDEN + j];
    for (let i = 0; i < INPUTS; i++) value += weights[j * INPUTS + i] * x[i];
    return Math.tanh(value);
  });
  let score = weights[PARAMETERS - 1];
  for (let j = 0; j < HIDDEN; j++) score += hidden[j] * weights[INPUTS * HIDDEN + HIDDEN + j];
  return { hidden, score };
}
export function scoreGradient(weights: readonly number[], x: readonly number[]): number[] {
  const { hidden } = forward(weights, x), gradient = Array.from({ length: PARAMETERS }, () => 0);
  for (let j = 0; j < HIDDEN; j++) {
    const chain = weights[INPUTS * HIDDEN + HIDDEN + j] * (1 - hidden[j] ** 2);
    for (let i = 0; i < INPUTS; i++) gradient[j * INPUTS + i] = chain * x[i];
    gradient[INPUTS * HIDDEN + j] = chain;
    gradient[INPUTS * HIDDEN + HIDDEN + j] = hidden[j];
  }
  gradient[PARAMETERS - 1] = 1;
  return gradient;
}
export function infer(model: Model, input: RankInput): RankOutput {
  if (!input.candidates.length || input.candidates.length > 200 || input.goal.length > 256 || input.candidates.some((c) => c.id.length > 4096)) throw new Error("input_limit");
  const vectors = input.candidates.map((c) => features(input, c));
  if (!vectors.some((x) => x[0] > 0 || x[3] > 0)) throw new Error("outside_domain");
  return { snapshotId: input.snapshotId, contextId: input.contextId, scores: input.candidates.map((c, i) => ({ id: c.id, score: forward(model.weights, vectors[i]).score })) };
}
export function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
}
