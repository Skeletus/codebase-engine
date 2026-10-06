import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { analyzeLocalRepository } from "../lib/engine/index.ts";
import { typescriptAdapter } from "../lib/engine/adapters/typescript.ts";
import { evaluate, meanReciprocalRank, type EvaluationCase } from "../lib/engine/evaluation.ts";
import { EvaluationStore } from "../lib/storage/evaluations.ts";

// Evaluation has no providers and denies accidental fetch, even with BYOK configured.
globalThis.fetch = async () => { throw new Error("Evaluation egress denied"); };
const args = process.argv.slice(2), action = args[0] ?? "synthetic";
function arg(name: string): string | undefined { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; }
const database = arg("--db");
if (["list", "inspect", "replay", "delete", "summary"].includes(action)) {
  if (!database) throw new Error("Specify --db <absolute local database path>");
  const store = new EvaluationStore(database);
  try {
    if (action === "list") console.log(JSON.stringify(store.list(), null, 2));
    else if (action === "summary") {
      for (const split of ["development", "held-out"] as const) {
        const results = [];
        for (const id of store.list()) { const record = store.read(id); if (record.input.split === split) results.push(await evaluate(record.input)); }
        console.log(JSON.stringify({ split, cases: results.length,
          baseline: meanReciprocalRank(results.map((r) => r.baselineMetrics.reciprocalRank)),
          supplied: meanReciprocalRank(results.map((r) => r.suppliedMetrics.reciprocalRank)),
          failures: results.filter((r) => r.suppliedMetrics.assessment === "failure").length,
          unsupported: results.filter((r) => r.suppliedMetrics.assessment === "unsupported").length }, null, 2));
      }
    }
    else {
      const id = arg("--id"); if (!id) throw new Error("Specify --id <record ID from list>");
      if (action === "delete") { store.delete(id); console.log("Deleted local record; repository/source unchanged."); }
      else { const record = store.read(id); console.log(JSON.stringify(action === "inspect" ? record : await evaluate(record.input), null, 2)); }
    }
  } finally { store.close(); }
} else if (action === "synthetic" || action === "local") {
  let temporary: string | undefined;
  try {
    let root = arg("--root");
    if (action === "synthetic") {
      temporary = mkdtempSync(path.join(tmpdir(), "ranking synthetic ")); root = path.join(temporary, "repo"); mkdirSync(root);
      writeFileSync(path.join(root, "entry.ts"), 'import "./a"; import "./z";');
      writeFileSync(path.join(root, "a.ts"), 'import "./b";'); writeFileSync(path.join(root, "b.ts"), "export const b = 1;");
      writeFileSync(path.join(root, "z.ts"), "export const evidence = 1;");
    }
    if (!root) throw new Error("local requires --root <local repository> --start <exact snapshot file> --goal <goal>");
    const ranker = arg("--ranker") ?? "reverse";
    if (!["baseline", "reverse", "failure", "timeout", "invalid"].includes(ranker)) throw new Error("Unknown supplied test ranker");
    const split = arg("--split") ?? "development";
    if (split !== "development" && split !== "held-out") throw new Error("Invalid evaluation split");
    const assessment = arg("--assessment") ?? "unsupported";
    if (!["success", "failure", "unsupported"].includes(assessment)) throw new Error("Invalid evidence-success assessment");
    const input: EvaluationCase = { version: 1, split, snapshot: analyzeLocalRepository(root, typescriptAdapter),
      options: { goal: arg("--goal") ?? "Inspect evidence", start: arg("--start") ?? "entry.ts", budget: Number(arg("--budget") ?? 2), depth: 8, timeoutMs: 50 },
      relevant: action === "synthetic" ? ["z.ts"] : (arg("--relevant") ?? "").split(",").filter(Boolean),
      judgmentsComplete: action === "synthetic" || args.includes("--complete-judgments"), assessment: assessment as EvaluationCase["assessment"], timeToEvidenceMs: arg("--time-ms") ? Number(arg("--time-ms")) : null,
      ranker: ranker as EvaluationCase["ranker"] };
    const result = await evaluate(input);
    console.log(JSON.stringify(result, null, 2));
    if (database) {
      if (!args.includes("--consent-local-record")) throw new Error("Review local goals/candidates/judgments before saving; explicit --consent-local-record required");
      const store = new EvaluationStore(database); try { console.log("Saved local evaluation ID:", await store.save(input, true)); } finally { store.close(); }
    }
  } finally { if (temporary) rmSync(temporary, { recursive: true, force: true }); }
} else throw new Error("Commands: synthetic | local | list | inspect | replay | summary | delete");
