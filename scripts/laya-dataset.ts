import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { typescriptAdapter } from "../lib/engine/adapters/typescript.ts";
import { validateSnapshot } from "../lib/engine/contract.ts";
import { random } from "../lib/laya/model.ts";
import type { EvaluationCase } from "../lib/engine/evaluation.ts";
export type DatasetCase = { repository: string; task: string; family: string; split: "training" | "development" | "held-out"; opaque: boolean; input: EvaluationCase; target: string };
export type Dataset = { version: 1; seed: 20261005; provenance: "synthetic-only-user-authorized"; license: "project-owned"; cases: DatasetCase[] };
const WORDS = {
  training: "account catalog invoice profile session storage queue audit cache checkout document image payment worker token permission logging export search upload".split(" "),
  development: "receipt notification translation favorites project organization metrics calendar address comment analytics archive download delivery discount itinerary event inventory location feature".split(" "),
  "held-out": "booking shipment billing subscription identity authentication authorization messaging synchronization reservation purchase enrollment encryption localization recommendation moderation fulfillment scheduling attachment validation".split(" "),
};
export function datasetHash(data: Dataset): string { return createHash("sha256").update(JSON.stringify(data)).digest("hex"); }
export async function buildDataset(): Promise<Dataset> {
  const data: Dataset = { version: 1, seed: 20261005, provenance: "synthetic-only-user-authorized", license: "project-owned", cases: [] };
  const temporary = mkdtempSync(path.join(tmpdir(), "laya synthetic "));
  try {
    for (const split of ["training", "development", "held-out"] as const) for (let index = 0; index < (split === "training" ? 60 : 20); index++) {
      const repository = `${split}-${index}`, rng = random(20261005 + index + (split === "training" ? 0 : split === "development" ? 10000 : 20000));
      const root = path.join(temporary, repository), topic = WORDS[split][index % WORDS[split].length], opaque = index % 10 === 0;
      mkdirSync(root);
      const family = split === "training" ? ["fork", "diamond", "chain"][index % 3] : split === "development" ? ["dev-hub", "dev-branch"][index % 2] : ["held-cycle", "held-layer", "held-wide"][index % 3];
      const implementations: string[] = [], tests: string[] = [], rootImports: string[] = [];
      const count = split === "held-out" && index % 3 === 2 ? 18 : 8 + Math.floor(rng() * 5);
      for (let node = 0; node < count; node++) {
        const matches = node === 0 || node === 1;
        const prefix = `n${Math.floor(rng() * 100000).toString().padStart(5, "0")}`;
        const folder = `${prefix}-${matches && !opaque ? topic : "utility"}`;
        mkdirSync(path.join(root, folder));
        const bridge = `${folder}/index.ts`, implementation = `${folder}/service.ts`, test = `${folder}/service.test.ts`;
        const length = split === "held-out" ? index % 3 === 1 ? 3 : 2 : index % 3 === 2 ? 3 : 1;
        const middle = `${folder}/adapter.ts`;
        writeFileSync(path.join(root, bridge), `import "./${length === 3 ? "adapter" : "service"}";${node === 1 ? ' import "./service.test";' : ""} export const node = ${node};`);
        if (length === 3) {
          if (split === "held-out" && index % 3 === 1) {
            writeFileSync(path.join(root, middle), 'import "./mapping";');
            writeFileSync(path.join(root, `${folder}/mapping.ts`), 'import "./service";');
          } else writeFileSync(path.join(root, middle), 'import "./service";');
        }
        // Decoys with matching words are tests/hubs; oracle labels come from the
        // generated task owner and actual verified reachability, not token overlap.
        writeFileSync(path.join(root, implementation), `${split === "held-out" && index % 3 === 0 ? 'import "./index";' : family === "diamond" ? 'import "../shared";' : family === "dev-hub" ? 'import "../common";' : ""} export function service() { return ${node}; }`);
        writeFileSync(path.join(root, test), 'import "./service"; export const test = true;');
        rootImports.push(`import "./${bridge.replace(/\.ts$/, "")}";`);
        if (matches) { implementations.push(implementation); tests.push(test); }
      }
      if (family === "diamond") writeFileSync(path.join(root, "shared.ts"), "export const shared = 1;");
      if (family === "dev-hub") { writeFileSync(path.join(root, "common.ts"), 'import "./support";'); writeFileSync(path.join(root, "support.ts"), "export const support = 1;"); rootImports.push('import "./common";'); }
      writeFileSync(path.join(root, "entry.ts"), rootImports.join("\n"));
      const snapshot = typescriptAdapter.analyze(root); snapshot.origin.root = `/synthetic/laya/${repository}`;
      validateSnapshot(snapshot);
      for (const kind of ["implementation", "tests"] as const) {
        const target = kind === "implementation" ? implementations[0] : tests[1];
        const task = `${split}:${topic}:${kind}:${index}`;
        data.cases.push({ repository, task, family, split, opaque, target, input: {
          version: 1, split: split === "held-out" ? "held-out" : "development", snapshot,
          options: { goal: split === "held-out" ? `Locate ${topic} ${kind === "tests" ? "tests" : "code path"}` : `Inspect ${topic} ${kind}`, start: "entry.ts", budget: 4, depth: 8, timeoutMs: 200 },
          relevant: [target], judgmentsComplete: true, assessment: opaque ? "unsupported" : "success", timeToEvidenceMs: null, ranker: "baseline",
        } });
      }
    }
  } finally { rmSync(temporary, { recursive: true, force: true }); }
  return data;
}
export function verifySplits(data: Dataset): void {
  if (data.version !== 1 || data.seed !== 20261005 || data.provenance !== "synthetic-only-user-authorized" || data.license !== "project-owned") throw new Error("Dataset provenance mismatch");
  const repositories = new Map<string, string>(), tasks = new Set<string>(), families = new Map<string, string>();
  for (const item of data.cases) {
    validateSnapshot(item.input.snapshot);
    if (item.input.snapshot.origin.root !== `/synthetic/laya/${item.repository}` || !["training", "development", "held-out"].includes(item.split)) throw new Error("Dataset repository provenance mismatch");
    if (repositories.has(item.repository) && repositories.get(item.repository) !== item.split || families.has(item.family) && families.get(item.family) !== item.split || tasks.has(item.task)) throw new Error("Dataset split leakage");
    repositories.set(item.repository, item.split); families.set(item.family, item.split); tasks.add(item.task);
  }
}
