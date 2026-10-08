import path from "node:path";
import { createRequire } from "node:module";
import { readFileSync, readdirSync, realpathSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";

const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const root = path.resolve(import.meta.dirname, "..");
const baseline = JSON.parse(readFileSync("docs/fs-07/evidence/starting-inventory.json", "utf8")) as {head: string; files: {path: string; sha256: string}[]};
// Explicit FS-07 extension surfaces. All other accepted files remain hashed;
// additions to this list require reviewing their FS-07 scope, never a glob.
const authorized = new Set(["package.json", "pnpm-lock.yaml", "scripts/package-engine.ts", "lib/engine/parser-worker.ts", "lib/engine/adapters/composed.ts", "lib/engine/adapters/typescript.ts", "lib/engine/coordinator.ts", "lib/parser/adapters/vite-calls.ts", "lib/parser/adapters/vite-react.ts", "lib/parser/framework-bindings.ts"]);
const differences = baseline.files.filter(f => !existsSync(f.path) || hash(readFileSync(f.path)) !== f.sha256);
const regeneratedEvidence = differences.filter(f => /^docs\/fs-06\/evidence\/qualification\/[^/]+\.json$/.test(f.path) || f.path === "docs/fs-06/evidence/watch-statuses.json");
const changes = differences.filter(f => !regeneratedEvidence.includes(f)).map(f => f.path);
assert(changes.every(file => authorized.has(file)), `Unexpected accepted-source change: ${changes.join(", ")}`);
for (const file of regeneratedEvidence) {
  const record: unknown = JSON.parse(readFileSync(file.path, "utf8"));
  if (file.path.includes("/qualification/")) {
    assert(record && typeof record === "object" && "status" in record && record.status === "PASS");
    assert("testHash" in record && record.testHash === hash(readFileSync("tests/framework-support/fs-06.test.ts")));
  }
}
const require = createRequire(path.join(root, "package.json"));
const hermesRoot = path.dirname(path.dirname(realpathSync(require.resolve("hermes-parser"))));
const hermesRequire = createRequire(path.join(hermesRoot, "package.json"));
const estreeRoot = path.dirname(path.dirname(realpathSync(hermesRequire.resolve("hermes-estree"))));
mkdirSync("docs/fs-07/licenses", {recursive: true});
const packages = [["hermes-parser", hermesRoot], ["hermes-estree", estreeRoot]].map(([name, packageRoot]) => {
  const pkg = JSON.parse(readFileSync(path.join(packageRoot, "package.json"), "utf8")) as {name: string; version: string; license: string; dependencies?: Record<string, string>};
  assert.equal(pkg.name, name); assert.equal(pkg.version, "0.25.1"); assert.equal(pkg.license, "MIT");
  assert.deepEqual(pkg.dependencies ?? {}, name === "hermes-parser" ? {"hermes-estree": "0.25.1"} : {});
  const assets: {file: string; sha256: string; bytes: number}[] = [];
  const stack = [packageRoot];
  while (stack.length) {
    const directory = stack.pop()!;
    for (const entry of readdirSync(directory, {withFileTypes: true})) {
      if (entry.name === "node_modules") continue;
      const target = path.join(directory, entry.name);
      assert(!entry.isSymbolicLink(), "Unexpected runtime package symlink");
      if (entry.isDirectory()) stack.push(target);
      else if (entry.isFile() && (entry.name.endsWith(".js") || entry.name === "package.json" || /^LICEN[CS]E$/.test(entry.name))) {
        const bytes = readFileSync(target); assets.push({file: path.relative(packageRoot, target).split(path.sep).join("/"), sha256: hash(bytes), bytes: bytes.length});
        if (/^LICEN[CS]E$/.test(entry.name)) writeFileSync(`docs/fs-07/licenses/${name}-MIT.txt`, bytes);
      }
    }
  }
  assert(assets.some(a => /^LICEN[CS]E$/.test(a.file)), "Missing MIT license");
  return {name, version: pkg.version, dependencies: pkg.dependencies ?? {}, assets: assets.sort((a, b) => a.file.localeCompare(b.file))};
});
const oracleLocks = ["rn83-bare", "rn85-bare", "expo55", "expo56"].map(tuple => {
  const file = `node_modules/.fs07-experiments/oracles/${tuple}/package-lock.json`;
  const bytes = readFileSync(file);
  return {tuple, lockHash: hash(bytes), lock: JSON.parse(bytes.toString())};
});
// Retain dependency integrity pins, but never publish isolated package source.
writeFileSync("docs/fs-07/evidence/oracle-locks.json", JSON.stringify(oracleLocks, null, 2) + "\n");
writeFileSync("docs/fs-07/evidence/package-audit.json", JSON.stringify({baselineHead: baseline.head, acceptedFilesCompared: baseline.files.length, acceptedSourceChanges: changes, regeneratedFS06Evidence: regeneratedEvidence.map(f => ({file: f.path, acceptedHash: f.sha256, rerunHash: hash(readFileSync(f.path))})), protectedSourcePreserved: true, runtimeClosure: packages, oracleLockHashes: oracleLocks.map(({tuple, lockHash}) => ({tuple, lockHash})), installScripts: false, supervisorQualified: false, stagedWindowsQualified: false}, null, 2) + "\n");
console.log("Approved parser runtime closure/licenses audited; accepted baseline preserved outside authorized dependency/packaging files.");
