import { createRequire } from "node:module";
import { readFileSync, realpathSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { FLOW_RESOURCE_PIN } from "./flow-resource-pin.ts";

/** Only application-owned runtime files are read. No customer path is accepted. */
export function verifyFlowRuntime(): string {
  const bytes = readFileSync(path.resolve(import.meta.dirname, "../assets/flow/runtime.json"));
  const hash = (value: Buffer) => createHash("sha256").update(value).digest("hex");
  if (hash(bytes) !== FLOW_RESOURCE_PIN) throw Error("parser-unavailable");
  const manifest = JSON.parse(bytes.toString()) as {version: number; runtime: string; dependencies: {name: string; version: string; dependencies: Record<string, string>; assets: {file: string; sha256: string; bytes: number}[]}[]};
  if (manifest.version !== 1 || manifest.runtime !== "hermes-parser@0.25.1" || manifest.dependencies.length !== 2) throw Error("parser-unavailable");
  let require = createRequire(import.meta.url), entry = "";
  for (const pkg of manifest.dependencies) {
    if (!["hermes-parser", "hermes-estree"].includes(pkg.name) || pkg.version !== "0.25.1") throw Error("parser-unavailable");
    const resolved = realpathSync(require.resolve(pkg.name));
    const packageRoot = path.dirname(path.dirname(resolved));
    for (const asset of pkg.assets) {
      if (!asset.file || /[\\:\0]/.test(asset.file) || asset.file.startsWith("/") || asset.file.split("/").some(p => !p || p === "." || p === "..") || hash(readFileSync(path.join(packageRoot, asset.file))) !== asset.sha256) throw Error("parser-unavailable");
    }
    const actual = JSON.parse(readFileSync(path.join(packageRoot, "package.json"), "utf8")) as {name: string; version: string; dependencies?: Record<string, string>};
    if (actual.name !== pkg.name || actual.version !== pkg.version || JSON.stringify(actual.dependencies ?? {}) !== JSON.stringify(pkg.dependencies)) throw Error("parser-unavailable");
    if (pkg.name === "hermes-parser") { entry = resolved; require = createRequire(path.join(packageRoot, "package.json")); }
  }
  if (!entry) throw Error("parser-unavailable"); return entry;
}
