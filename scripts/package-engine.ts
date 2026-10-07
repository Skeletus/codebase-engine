import { cpSync, copyFileSync, mkdirSync, readFileSync, writeFileSync, realpathSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { SNAPSHOT_VERSION } from "../lib/engine/types.ts";

const root = path.resolve(import.meta.dirname, "..");
const target = execFileSync("rustc", ["--print", "host-tuple"], { encoding: "utf8" }).trim();
if (Number(process.versions.node.split(".")[0]) < 24) throw new Error("Packaging requires Node 24 or later");
if (!(target.startsWith(process.arch === "x64" ? "x86_64-" : "aarch64-"))) throw new Error("Node and Rust target architectures differ");
// "generated" is already excluded by the repository read policy, so opening
// this checkout does not index a second copy of the packaged engine.
const resources = path.join(root, "src-tauri/resources/generated/engine");
mkdirSync(path.join(resources, "scripts"), { recursive: true });
mkdirSync(path.join(root, "src-tauri/binaries"), { recursive: true });
for (const dir of ["engine", "parser", "repository", "graph", "desktop", "storage", "ai", "model", "laya"]) cpSync(path.join(root, "lib", dir), path.join(resources, "lib", dir), { recursive: true, dereference: true });
copyFileSync(path.join(root, "lib/roles.ts"), path.join(resources, "lib/roles.ts"));
copyFileSync(path.join(root, "scripts/sidecar.ts"), path.join(resources, "scripts/sidecar.ts"));
copyFileSync(path.join(root, "scripts/storage.ts"), path.join(resources, "scripts/storage.ts"));
copyFileSync(path.join(root, "scripts/evaluate-ranking.ts"), path.join(resources, "scripts/evaluate-ranking.ts"));
writeFileSync(path.join(resources, "package.json"), '{"type":"module"}\n');
// Copy only ts-morph's installed runtime dependency closure, never .env,
// application cloud packages, or the repository selected for analysis.
function copyPackage(name: string, from: string, destination: string, ancestry: string[] = []) {
  const require = createRequire(from);
  // Some packages do not export package.json. Resolve their entry first and
  // locate the owning manifest without bypassing Node's entry resolution.
  let source = path.dirname(realpathSync(require.resolve(name)));
  while (!existsSync(path.join(source, "package.json")) || JSON.parse(readFileSync(path.join(source, "package.json"), "utf8")).name !== name) {
    const parent = path.dirname(source);
    if (parent === source) throw new Error(`Cannot locate runtime package ${name}`);
    source = parent;
  }
  if (ancestry.includes(source)) throw new Error("Cyclic runtime dependency packaging");
  const output = path.join(destination, "node_modules", name);
  cpSync(source, output, { recursive: true, dereference: true, filter: (file) => !path.relative(source, file).split(path.sep).includes("node_modules") });
  const pkg = JSON.parse(readFileSync(path.join(source, "package.json"), "utf8"));
  for (const dependency of Object.keys(pkg.dependencies ?? {})) copyPackage(dependency, path.join(source, "package.json"), output, [...ancestry, source]);
}
copyPackage("ts-morph", path.join(root, "package.json"), resources);
copyPackage("web-tree-sitter", path.join(root, "package.json"), resources);
if (process.platform === "win32") {
execFileSync("cargo", ["build", "--release", "--locked", "--offline", "--manifest-path", path.join(root, "src-tauri/Cargo.toml"), "--bin", "parser-host"], { stdio: "inherit" });
mkdirSync(path.join(resources, "bin"), { recursive: true });
copyFileSync(path.join(root, "src-tauri/target/release/parser-host.exe"), path.join(resources, "bin/parser-host.exe"));
}
const parserAssets = ["lib/engine/assets/python/tree-sitter-python.wasm", "lib/engine/assets/python/LICENSE", "node_modules/web-tree-sitter/tree-sitter.wasm", "node_modules/web-tree-sitter/tree-sitter.js", "node_modules/web-tree-sitter/LICENSE", "node_modules/web-tree-sitter/package.json", ...(process.platform === "win32" ? ["bin/parser-host.exe"] : [])].map(file => ({ file, sha256: createHash("sha256").update(readFileSync(path.join(resources, file))).digest("hex") }));
writeFileSync(path.join(resources, "python-runtime.json"), JSON.stringify({ version: 1, runtime: "web-tree-sitter@0.25.10", grammar: "tree-sitter-python@0.25.0", abi: 15, assets: parserAssets, memoryBytes: 536870912, oldSpaceMiB: 128, startupMs: 5000, fileMs: 2000 }) + "\n");
const binary = path.join(root, `src-tauri/binaries/code-engine-${target}${process.platform === "win32" ? ".exe" : ""}`);
copyFileSync(process.execPath, binary);
const license = process.env.CODE_INTELLIGENCE_NODE_LICENSE ?? path.join(path.dirname(process.execPath), "LICENSE");
if (!existsSync(license)) throw new Error("Set CODE_INTELLIGENCE_NODE_LICENSE to the bundled Node distribution's LICENSE file before packaging");
copyFileSync(license, path.join(resources, "NODE-LICENSE"));
writeFileSync(path.join(resources, "runtime.json"), JSON.stringify({ node: process.versions.node, target, protocol: 1, snapshotVersion: SNAPSHOT_VERSION, historicalSnapshotVersions: [2] }) + "\n");
console.log(`Packaged Node ${process.versions.node} and TS/JS engine for ${target}`);
