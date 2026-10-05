import { performance } from "node:perf_hooks";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { typescriptAdapter } from "../lib/engine/adapters/typescript.ts";
import { investigate } from "../lib/engine/investigations.ts";
import { READ_LIMITS } from "../lib/repository/read-policy.ts";

globalThis.fetch = () => { throw new Error("Benchmark engine network access denied"); };
const directory = mkdtempSync(path.join(tmpdir(), "cartograph pilot benchmark "));
try {
  const generated = path.join(directory, "500 file chain"); mkdirSync(generated);
  for (let i = 0; i < 500; i++) writeFileSync(path.join(generated, `file-${i}.ts`), `${i ? `import "./file-${i - 1}"; ` : ""}export const item${i} = ${i};\n`);
  const targets = [{ category: "checkout", root: path.resolve(import.meta.dirname, "..") }, { category: "synthetic-chain", root: generated }];
  for (const target of targets) {
    const start = performance.now(); const snapshot = typescriptAdapter.analyze(target.root); const analyzed = performance.now();
    const file = target.category === "synthetic-chain" ? "file-0.ts" : "lib/engine/types.ts";
    const answer = investigate(snapshot, { operation: "ask", intent: "dependents", target: file, depth: 64, budget: 200 });
    console.log(JSON.stringify({ category: target.category, found: snapshot.coverage.files.found, parsed: snapshot.files.length, sourceBytes: snapshot.files.reduce((n, f) => n + f.bytes, 0), edges: snapshot.relationships.length, skipped: snapshot.coverage.files.skipped,
      analyzeMs: Math.round(analyzed - start), queryMs: Math.round(performance.now() - analyzed), engineFirstAnswerMs: Math.round(performance.now() - start), resultFiles: answer.rows.length, beyondDepth: answer.beyondDepth, beyondBudget: answer.beyondBudget }));
  }
  console.log(JSON.stringify({ enforcedReadLimits: READ_LIMITS, note: "Terminal engine timings only, not installed-UI pilot trials or performance guarantees" }));
} finally { assert(path.basename(directory).startsWith("cartograph pilot benchmark ")); rmSync(directory, { recursive: true, force: true }); }
