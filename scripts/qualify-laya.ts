import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { datasetHash, verifySplits, type Dataset } from "./laya-dataset.ts";
import { LocalLaya } from "../lib/laya/runtime.ts";
import { validateModel, features } from "../lib/laya/model.ts";
import { rankInvestigation, type Ranker } from "../lib/engine/ranking.ts";
import { metrics } from "../lib/engine/evaluation.ts";
import { investigate } from "../lib/engine/investigations.ts";
import { TRAINING, type train } from "./laya-training.ts";

globalThis.fetch = async () => { throw new Error("Qualification egress denied"); };
const directory = new URL("../artifacts/laya-nav-1/", import.meta.url);
const data: Dataset = JSON.parse(readFileSync(new URL("generated/dataset.json", directory), "utf8"));
verifySplits(data);
const bytes = readFileSync(new URL("generated/candidate.json", directory));
const model = validateModel(JSON.parse(bytes.toString("utf8"))), hash = createHash("sha256").update(bytes).digest("hex");
if (model.datasetHash !== datasetHash(data)) throw new Error("Dataset/model mismatch");
const trained: Awaited<ReturnType<typeof train>> = JSON.parse(readFileSync(new URL("generated/training.json", directory), "utf8"));
if (createHash("sha256").update(JSON.stringify(trained.model)).digest("hex") !== hash || JSON.stringify(trained.configuration) !== JSON.stringify(TRAINING) || createHash("sha256").update(JSON.stringify(trained.trace)).digest("hex") !== trained.trainingTraceHash) throw new Error("Training provenance/configuration mismatch");
const runtime = new LocalLaya({ file: new URL("generated/candidate.json", directory), hash, qualified: true });
await runtime.prepare();
const lexical: Ranker = async (q) => ({ snapshotId: q.snapshotId, contextId: q.contextId, scores: q.candidates.map((c) => { const f = features(q, c); return { id: c.id, score: f[0] + f[1] - f[11] + f[10] }; }) });
const rows = [];
try {
  for (const item of data.cases.filter((c) => c.split === "held-out")) {
    const snapshot = item.input.snapshot, original = JSON.stringify(snapshot);
    const impactQuery = { operation: "ask", intent: "dependents", target: item.input.options.start, depth: 64, budget: 200 } as const;
    const impact = JSON.stringify(investigate(snapshot, impactQuery));
    for (const budget of [2, 4, 8, 16, 32, 64]) for (const [name, ranker] of [["baseline", undefined], ["lexical", lexical], ["laya", runtime.ranker]] as const) {
      const input = { ...item.input, options: { ...item.input.options, budget } };
      const run = await rankInvestigation(snapshot, input.options, ranker);
      if (JSON.stringify(snapshot) !== original || JSON.stringify(investigate(snapshot, impactQuery)) !== impact) throw new Error("Structural invariance failed");
      const first = run.steps.findIndex((s) => item.input.relevant.includes(s.id));
      rows.push({ repository: item.repository, task: item.task, family: item.family, opaque: item.opaque, ranker: name, ...metrics(run, input), assessment: item.opaque ? "unsupported" : first < 0 ? "failure" : "success", firstEvidenceNode: first < 0 ? null : first + 1, decisions: run.decisions.length, invariant: true });
    }
  }
} finally { runtime.close(); }
const summaries: { k: number; ranker: string; tasks: number; recallAtK: number; mrr: number; pathEfficiency: number; inspectedNodes: number; reachedTasks: number; meanNodesUntilEvidenceWhenReached: number | null; controllerMs: number; decisions: number; fallbackDecisions: number; technicalFallbackRate: number; outsideDomainRate: number; totalFallbackRate: number }[] = [];
for (const k of [2, 4, 8, 16, 32, 64]) for (const ranker of ["baseline", "lexical", "laya"]) {
  const subset = rows.filter((r) => r.k === k && r.ranker === ranker);
  const mean = (key: "recallAtK" | "reciprocalRank" | "pathEfficiency" | "inspectedNodes" | "elapsedControllerMs") => subset.reduce((sum, r) => sum + (r[key] ?? 0), 0) / subset.length;
  const fallbacks = subset.flatMap((r) => r.fallbacks), decisions = subset.reduce((sum, r) => sum + r.decisions, 0);
  const reached = subset.filter((r) => r.firstEvidenceNode !== null);
  summaries.push({ k, ranker, tasks: subset.length, recallAtK: mean("recallAtK"), mrr: mean("reciprocalRank"), pathEfficiency: mean("pathEfficiency"), inspectedNodes: mean("inspectedNodes"), reachedTasks: reached.length, meanNodesUntilEvidenceWhenReached: reached.length ? reached.reduce((sum, r) => sum + r.firstEvidenceNode!, 0) / reached.length : null, controllerMs: mean("elapsedControllerMs"), decisions,
    fallbackDecisions: fallbacks.length, technicalFallbackRate: fallbacks.filter((f) => f !== "outside_domain").length / decisions, outsideDomainRate: fallbacks.filter((f) => f === "outside_domain").length / decisions, totalFallbackRate: fallbacks.length / decisions });
}
const benchmark = JSON.parse(execFileSync(process.execPath, ["scripts/benchmark-laya.ts"], { encoding: "utf8" }));
const primary = (name: string) => summaries.find((r) => r.k === 4 && r.ranker === name)!;
const b = primary("baseline"), l = primary("laya"), lexicalControl = primary("lexical");
const gates = { recallGain: l.recallAtK - b.recallAtK >= 0.10, mrrGain: l.mrr - b.mrr >= 0.10, pathEfficiency: l.pathEfficiency >= b.pathEfficiency,
  lexicalRecall: l.recallAtK >= lexicalControl.recallAtK - 0.02, lexicalMrr: l.mrr >= lexicalControl.mrr - 0.02, structuralInvariance: rows.every((r) => r.invariant), technicalFallback: l.technicalFallbackRate <= 0.01,
  warmP95: benchmark.p95Ms <= 50, cold: benchmark.coldMs <= 1000, memory: benchmark.incrementalRssBytes <= 128 * 1024 * 1024 };
const qualified = Object.values(gates).every(Boolean);
const report = { version: 1, qualification: "Synthetic next-node ranking only; no human/product or cross-platform benefit claim", qualified, gates,
  datasetHash: model.datasetHash, modelHash: hash, artifactBytes: bytes.length, node: process.version, platform: process.platform, architecture: process.arch,
  split: { trainingRepositories: 60, trainingTasks: 120, developmentRepositories: 20, developmentTasks: 40, heldOutRepositories: 20, heldOutTasks: 40, opaqueHeldOutTasks: 4 },
  metricPolicy: "K counts inspected nodes; start excluded. Missed targets contribute zero path efficiency. Human time-to-evidence unmeasured. Technical fallback excludes disclosed outside-domain baseline decisions.", benchmark, summaries, rows };
mkdirSync(directory, { recursive: true });
writeFileSync(new URL("report.json", directory), JSON.stringify(report, null, 2));
writeFileSync(new URL("training.json", directory), JSON.stringify({ configuration: trained.configuration, trainingPairs: trained.trainingPairs, developmentPairs: trained.developmentPairs, initialLoss: trained.initialLoss, bestEpoch: trained.bestEpoch, trace: trained.trace, trainingTraceHash: trained.trainingTraceHash, datasetHash: model.datasetHash }, null, 2));
writeFileSync(new URL("dataset-manifest.json", directory), JSON.stringify({ version: data.version, seed: data.seed, provenance: data.provenance, license: data.license, datasetHash: model.datasetHash, cases: data.cases.map(({ repository, task, family, split, opaque, target }) => ({ repository, task, family, split, opaque, target })) }, null, 2));
writeFileSync(new URL("../../lib/laya/laya-nav-1.json", directory), bytes);
writeFileSync(new URL("../../lib/laya/artifact.ts", directory), `// Frozen artifact-backed qualification; changing weights requires requalification.\nexport const LAYA_ARTIFACT = { file: new URL("./laya-nav-1.json", import.meta.url), hash: "${hash}", qualified: ${qualified} } as const;\n`);
console.log(JSON.stringify({ qualified, gates, primary: summaries.filter((r) => r.k === 4), benchmark, modelHash: hash, artifactBytes: bytes.length }, null, 2));
