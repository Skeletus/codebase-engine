import path from "node:path";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";

/** Opt-in developer oracle: installed framework-owned resolver and synthetic data only.
 * No filesystem-based project/config/plugin/application loader is invoked.
 */
const digest = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const fixtureBytes = readFileSync("tests/fixtures/framework-support/F07-rn/metro.json");
const fixture = JSON.parse(fixtureBytes.toString()) as {files: string[]; packages: {root: string; json: Record<string, unknown>}[]; links: Record<string, string>; sourceExts: string[]; cases: {id: string; specifier: string; isImport?: boolean}[]};
const manifest = JSON.parse(readFileSync("docs/fs-00/support-manifest.json", "utf8")) as {tuples: {id: string; phase: string; versions: Record<string, string>}[]};
const root = path.resolve("node_modules/.fs07-experiments/virtual-oracle");
const absolute = (file: string) => path.resolve(root, file);
const relative = (file: string) => path.relative(root, file).split(path.sep).join("/");
const files = new Set(fixture.files.map(absolute));
const directories = new Set([root]);
for (const file of files) { let dir = path.dirname(file); while (dir.startsWith(root)) { directories.add(dir); if (dir === root) break; dir = path.dirname(dir); } }
const packages = fixture.packages.map(p => ({rootPath: absolute(p.root), packageJson: p.json})).sort((a, b) => b.rootPath.length - a.rootPath.length);
mkdirSync("docs/fs-07/evidence", {recursive: true});
for (const tuple of manifest.tuples.filter(t => t.phase === "FS-07")) {
  const installedRoot = path.resolve("node_modules/.fs07-experiments/oracles", tuple.id);
  const require = createRequire(path.join(installedRoot, "package.json"));
  for (const [name, version] of Object.entries(tuple.versions)) {
    if (name === "node") { if (process.versions.node !== version) throw Error("Wrong Node oracle version"); continue; }
    const actual = JSON.parse(readFileSync(path.join(installedRoot, "node_modules", name, "package.json"), "utf8")).version;
    if (actual !== version) throw Error(`${tuple.id}: ${name} ${actual} != ${version}`);
  }
  const name = tuple.id.startsWith("expo") ? "@expo/metro/metro-resolver" : "metro-resolver";
  const resolver = require(name) as {resolve: (context: unknown, specifier: string, platform: string) => {type: string; filePath?: string; filePaths?: string[]}};
  const resolverPath = require.resolve(name);
  const packageSource = require.resolve("metro-resolver/package.json");
  const resolverVersion = JSON.parse(readFileSync(packageSource, "utf8")).version as string;
  const defaults = JSON.parse(readFileSync(`docs/fs-07/evidence/${tuple.id}-metro-defaults.json`, "utf8")) as {outputHash: string; output: {sourceExts: string[]; assetExts: string[]; resolverMainFields: string[]; unstable_conditionNames: string[]; unstable_conditionsByPlatform: Record<string, string[]>; unstable_enablePackageExports: boolean}};
  if (defaults.outputHash !== digest(JSON.stringify(defaults.output))) throw Error("Corrupt defaults record");
  for (const contextProfile of ["controlled", "defaults"] as const) for (const platform of ["android", "ios"] as const) {
    const warnings: string[] = [];
    const started = performance.now();
    const outputs = fixture.cases.map(c => {
      const context = {
        originModulePath: absolute("index.js"), sourceExts: contextProfile === "controlled" ? fixture.sourceExts : defaults.output.sourceExts, assetExts: new Set(contextProfile === "controlled" ? ["png"] : defaults.output.assetExts), mainFields: contextProfile === "controlled" ? ["react-native", "browser", "main"] : defaults.output.resolverMainFields,
        preferNativePlatform: true, allowHaste: false, disableHierarchicalLookup: true, nodeModulesPaths: [], extraNodeModules: Object.fromEntries(Object.entries(fixture.links).map(([name, p]) => [name, absolute(p)])),
        unstable_enablePackageExports: contextProfile === "controlled" ? true : defaults.output.unstable_enablePackageExports, unstable_conditionNames: contextProfile === "controlled" ? ["react-native"] : defaults.output.unstable_conditionNames, unstable_conditionsByPlatform: contextProfile === "controlled" ? {} : defaults.output.unstable_conditionsByPlatform, isESMImport: c.isImport !== false,
        doesFileExist: (file: string) => files.has(file),
        fileSystemLookup: (file: string) => files.has(file) ? {exists: true, type: "f", realPath: file} : directories.has(file) ? {exists: true, type: "d", realPath: file} : {exists: false},
        getPackage: (file: string) => packages.find(p => path.join(p.rootPath, "package.json") === file)?.packageJson ?? null,
        getPackageForModule: (file: string) => { const pkg = packages.find(p => file === p.rootPath || file.startsWith(p.rootPath + path.sep)); return pkg ? {...pkg, packageRelativePath: path.relative(pkg.rootPath, file)} : null; },
        resolveAsset: (dir: string, name: string, extension: string) => [...files].filter(file => path.dirname(file) === dir && (path.basename(file) === name + extension || path.basename(file).startsWith(name + "@") && path.basename(file).endsWith(extension))).sort(),
        unstable_logWarning: (message: string) => warnings.push(message),
      };
      const outcome = resolver.resolve(context, c.specifier, platform);
      return {id: c.id, type: outcome.type, targets: (outcome.filePaths ?? (outcome.filePath ? [outcome.filePath] : [])).map(relative).sort()};
    });
    const record = {tuple: tuple.id, versions: tuple.versions, profile: platform + "-development", contextProfile, ...(contextProfile === "defaults" ? {defaultsHash: defaults.outputHash} : {}), platform, resolver: name, resolverVersion, resolverEntryHash: digest(readFileSync(resolverPath)), fixtureHash: digest(fixtureBytes), outputHash: digest(JSON.stringify(outputs)), outputs, warnings, elapsedMs: performance.now() - started, resources: process.memoryUsage(), applicationExecution: false, configExecution: false};
    writeFileSync(`docs/fs-07/evidence/${tuple.id}-${platform}-metro${contextProfile === "defaults" ? "-defaults-oracle" : ""}.json`, JSON.stringify(record, null, 2) + "\n");
    console.log(tuple.id, contextProfile, platform, outputs.length, warnings.length);
  }
}
