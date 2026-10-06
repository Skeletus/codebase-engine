import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { LocalLaya } from "../lib/laya/runtime.ts";
import type { RankInput } from "../lib/engine/ranking.ts";
globalThis.fetch = async () => { throw new Error("Inference egress denied"); };
const file = path.resolve(process.argv[2] ?? "artifacts/laya-nav-1/generated/candidate.json"), hash = createHash("sha256").update(readFileSync(file)).digest("hex");
const rssBefore = process.memoryUsage().rss, runtime = new LocalLaya({ file: pathToFileURL(file), hash, qualified: true });
try {
  await runtime.prepare();
  const input: RankInput = { goal: "Inspect authentication implementation", snapshotId: "1".repeat(64), contextId: "2".repeat(64), candidates: Array.from({ length: 200 }, (_, i) => ({ id: `modules/${i}-authentication/service.ts`, depth: 1 + i % 8, fanIn: i % 12, fanOut: i % 10, witness: ["verified-benchmark-edge"] })) };
  const endToEnd: number[] = [], compute: number[] = [];
  for (let i = 0; i < 120; i++) {
    const began = performance.now(); await runtime.ranker(input, new AbortController().signal);
    if (i >= 20) { endToEnd.push(performance.now() - began); compute.push(runtime.measurements.lastInferenceMs); }
  }
  const percentile = (values: number[], p: number) => [...values].sort((a, b) => a - b)[Math.ceil(p * values.length) - 1];
  console.log(JSON.stringify({ node: process.versions.node, platform: process.platform, arch: process.arch, candidates: 200, warmup: 20, samples: 100,
    coldMs: runtime.measurements.coldMs, p50Ms: percentile(endToEnd, .5), p95Ms: percentile(endToEnd, .95), computeP95Ms: percentile(compute, .95),
    rssBefore, peakRssBytes: runtime.measurements.peakRssBytes, incrementalRssBytes: Math.max(0, runtime.measurements.peakRssBytes - rssBefore), peakWorkerHeapBytes: runtime.measurements.peakHeapBytes }, null, 2));
} finally { runtime.close(); }
