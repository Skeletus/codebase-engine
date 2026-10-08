import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";

/** Opt-in developer pinning; production does not read qualification docs. */
const targets = ["rn83-bare", "rn85-bare", "expo55", "expo56"];
const defaults = Object.fromEntries(targets.map(tuple => {
  const row = JSON.parse(readFileSync(`docs/fs-07/evidence/${tuple}-metro-defaults.json`, "utf8")) as {output: Record<string, unknown>; outputHash: string; tool: string; version: string; entryHash: string};
  assert.equal(row.outputHash, createHash("sha256").update(JSON.stringify(row.output)).digest("hex"));
  return [tuple, {tool: row.tool, version: row.version, sourceHash: row.entryHash, outputHash: row.outputHash, ...row.output}];
}));
writeFileSync("lib/parser/adapters/metro-defaults.ts", "/** Pinned application-owned Metro profiles; see FS-07 independent defaults oracles. */\nexport const METRO_DEFAULTS = " + JSON.stringify(defaults, null, 2) + " as const;\n");
console.log("Pinned independently verified Metro profile defaults", targets.join(", "));
