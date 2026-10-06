import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { buildDataset, datasetHash, verifySplits, type Dataset } from "./laya-dataset.ts";
import { train } from "./laya-training.ts";
import { infer, features } from "../lib/laya/model.ts";
import { rankInvestigation, type Ranker } from "../lib/engine/ranking.ts";
import { metrics } from "../lib/engine/evaluation.ts";

globalThis.fetch = async () => { throw new Error("Local training egress denied"); };
const output = path.resolve("artifacts/laya-nav-1/generated"); mkdirSync(output, { recursive: true });
const file = path.join(output, "dataset.json");
const data: Dataset = process.argv.includes("--reuse-dataset") && existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : await buildDataset();
verifySplits(data); const hash = datasetHash(data); writeFileSync(file, JSON.stringify(data));
console.log(`Synthetic corpus ${hash}: ${data.cases.length} tasks / ${new Set(data.cases.map((c) => c.repository)).size} repositories`);
const began = performance.now(), trained = await train(data, hash);
writeFileSync(path.join(output, "training.json"), JSON.stringify({ ...trained, elapsedMs: performance.now() - began }, null, 2));
writeFileSync(path.join(output, "candidate.json"), JSON.stringify(trained.model));
console.log(JSON.stringify({ configuration: trained.configuration, trainingPairs: trained.trainingPairs, developmentPairs: trained.developmentPairs, initialLoss: trained.initialLoss, bestEpoch: trained.bestEpoch, final: trained.trace.at(-1), best: trained.trace[trained.bestEpoch - 1], modelHash: createHash("sha256").update(JSON.stringify(trained.model)).digest("hex"), elapsedMs: performance.now() - began }));
// Development-only feedback. No held-out access for fitting or model selection.
const scorer: Ranker = async (q) => infer(trained.model, q);
const lexical: Ranker = async (q) => ({ snapshotId: q.snapshotId, contextId: q.contextId, scores: q.candidates.map((c) => { const f = features(q, c); return { id: c.id, score: f[0] + f[1] - f[11] + f[10] }; }) });
for (const [name, ranker] of [["baseline", undefined], ["lexical", lexical], ["candidate", scorer]] as const) {
  const measurements: ReturnType<typeof metrics>[] = [];
  for (const item of data.cases.filter((c) => c.split === "development")) measurements.push(metrics(await rankInvestigation(item.input.snapshot, item.input.options, ranker), item.input));
  const mean = (key: "recallAtK" | "reciprocalRank" | "pathEfficiency") => measurements.reduce((sum, m) => sum + (m[key] ?? 0), 0) / measurements.length;
  console.log(JSON.stringify({ developmentOnly: name, cases: measurements.length, recallAtK: mean("recallAtK"), mrr: mean("reciprocalRank"), pathEfficiency: mean("pathEfficiency") }));
}
