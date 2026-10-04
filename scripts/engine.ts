import { readFileSync, writeFileSync } from "node:fs";
import { analyzeLocalRepository, queryStructure } from "../lib/engine/index.ts";
import { typescriptAdapter } from "../lib/engine/adapters/typescript.ts";
import { deserializeSnapshot, serializeSnapshot } from "../lib/engine/contract.ts";

const args = process.argv.slice(2);
const read = args.indexOf("--read");
const out = args.indexOf("--out");
const from = args.indexOf("--from");
const directory = args[0];
if (!directory || (read >= 0 && !args[read + 1]) || (out >= 0 && !args[out + 1]) || (from >= 0 && !args[from + 1])) {
  throw new Error("usage: pnpm engine <directory> [--out snapshot.json] [--from file] | pnpm engine --read snapshot.json [--from file]");
}
const snapshot = read >= 0
  ? deserializeSnapshot(readFileSync(args[read + 1], "utf8"))
  : analyzeLocalRepository(directory, typescriptAdapter);
console.log(`Local snapshot v${snapshot.version}: ${snapshot.files.length} files, ${snapshot.relationships.length} relationships, ${snapshot.routes.length} route declarations`);
console.log(JSON.stringify(snapshot.coverage, null, 2));
for (const diagnostic of snapshot.diagnostics) console.log(`${diagnostic.category}: ${diagnostic.path} ${diagnostic.reason}: ${diagnostic.detail}`);
if (from >= 0) for (const direction of ["dependencies", "dependents"] as const) {
  console.log(direction, queryStructure(snapshot, { file: args[from + 1], direction }));
}
if (out >= 0) {
  const serialized = serializeSnapshot(snapshot);
  writeFileSync(args[out + 1], serialized);
  if (serializeSnapshot(deserializeSnapshot(readFileSync(args[out + 1], "utf8"))) !== serialized) throw new Error("Snapshot round trip changed");
}
