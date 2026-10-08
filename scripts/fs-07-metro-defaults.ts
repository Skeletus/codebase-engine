import path from "node:path";
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";

/** Framework-owned defaults over the application-owned isolated synthetic root.
 * This never calls a config loader or any serializer/transformer callback.
 */
const hash = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
for (const tuple of ["rn83-bare", "rn85-bare", "expo55", "expo56"]) {
  const root = path.resolve("node_modules/.fs07-experiments/oracles", tuple);
  for (const file of ["metro.config.js", "metro.config.ts", "app.config.js", "app.config.ts", "app.json", "babel.config.js"]) assert(!existsSync(path.join(root, file)), "Oracle directory unexpectedly contains executable/configuration input");
  const require = createRequire(path.join(root, "package.json"));
  const tool = tuple.startsWith("expo") ? "@expo/metro-config" : "@react-native/metro-config";
  const defaultsTool = require(tool) as {getDefaultConfig: (root: string) => {resolver: Record<string, unknown>}};
  const defaults = defaultsTool.getDefaultConfig(root).resolver;
  const fields = ["sourceExts", "assetExts", "resolverMainFields", "unstable_conditionNames", "unstable_conditionsByPlatform", "unstable_enablePackageExports", "platforms"];
  const output = Object.fromEntries(fields.map(key => [key, defaults[key] ?? null]));
  const source = require.resolve(tool);
  writeFileSync(`docs/fs-07/evidence/${tuple}-metro-defaults.json`, JSON.stringify({tuple, tool, version: require(tool + "/package.json").version, entryHash: hash(readFileSync(source)), syntheticManifestHash: hash(readFileSync(path.join(root, "package.json"))), outputHash: hash(JSON.stringify(output)), output, inspectedConfigExecution: false, inspectedApplicationExecution: false, transformerExecution: false}, null, 2) + "\n");
  console.log(tuple, JSON.stringify(output.sourceExts));
}
