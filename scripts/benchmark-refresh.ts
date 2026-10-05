import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";
import { createTypescriptRefresh, typescriptAdapter } from "../lib/engine/adapters/typescript.ts";
import { queryStructure } from "../lib/engine/index.ts";
import { SqliteAnalysisStore } from "../lib/storage/sqlite.ts";

// Numeric/local results only: no repository names, source or absolute paths.
const directory = mkdtempSync(path.join(tmpdir(), "refresh-benchmark "));
const records = [];
try {
  for (const files of [50, 500]) {
    const root = path.join(directory, String(files)); mkdirSync(root);
    const source = (i: number, value = 1) => `${i + 1 < files ? `import { f${i + 1} } from "./f${i + 1}";` : ""} export function f${i}() { return ${i + 1 < files ? `f${i + 1}()` : value}; }\n`;
    for (let i = 0; i < files; i++) writeFileSync(path.join(root, `f${i}.ts`), source(i));
    const adapter = createTypescriptRefresh(), database = path.join(directory, `${files}.sqlite`), store = new SqliteAnalysisStore(database), repo = store.register(root);
    function measure(full: boolean, job: string) {
      const start = performance.now(), candidate = adapter.analyze(root, full); assert(candidate.reader.stable());
      store.begin(repo.repositoryId, job); store.publish(repo.repositoryId, job, candidate.snapshot);
      const elapsedMs = Math.round(performance.now() - start), query = performance.now(); queryStructure(candidate.snapshot, { file: "f0.ts", direction: "dependencies", depth: 64 });
      return { mode: candidate.mode, parsed: candidate.parsed, reused: candidate.reused, elapsedMs, queryMs: Number((performance.now() - query).toFixed(2)), rssBytes: process.memoryUsage().rss, storageBytes: statSync(database).size, snapshotBytes: Buffer.byteLength(JSON.stringify(candidate.snapshot)), snapshot: candidate.snapshot };
    }
    try {
      const initial = measure(true, `initial-${files}`); writeFileSync(path.join(root, `f${files - 1}.ts`), source(files - 1, 2));
      const incremental = measure(false, `incremental-${files}`), full = measure(true, `full-${files}`);
      assert.deepEqual(incremental.snapshot, full.snapshot); assert.deepEqual(full.snapshot, typescriptAdapter.analyze(root));
      const numeric = ({ snapshot, ...metrics }: ReturnType<typeof measure>) => { void snapshot; return metrics; };
      records.push({ files, relationships: full.snapshot.relationships.length, initial: numeric(initial), incremental: numeric(incremental), full: numeric(full) });
    } finally { store.close(); }
  }
  const result = { platform: process.platform, architecture: process.arch, node: process.versions.node, records };
  if (process.argv[2]) writeFileSync(path.resolve(process.argv[2]), JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result, null, 2));
} finally { rmSync(directory, { recursive: true, force: true }); }
