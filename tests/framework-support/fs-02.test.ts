import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, realpathSync, symlinkSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { RepositoryReader } from "../../lib/repository/read-policy.ts";
import { selectFiles, parseRepository } from "../../lib/parser/index.ts";
import { typescriptAdapter, createTypescriptRefresh } from "../../lib/engine/adapters/typescript.ts";
import { ExtractorRegistry } from "../../lib/engine/registry.ts";
import { interpretConfig, CONFIG_LIMITS } from "../../lib/engine/static-config.ts";
import { ProtectedMetadataIndex } from "../../lib/engine/metadata.ts";
import { GenerationBoundary } from "../../lib/engine/boundary.ts";
import { expandInventoryGlobs } from "../../lib/engine/discovery.ts";
import { createResolutionProfile, PROFILE_NAMES } from "../../lib/engine/profiles.ts";
import { coordinateSnapshot } from "../../lib/engine/coordinator.ts";
import { queryStructure, readEvidence, readWitnessEvidence } from "../../lib/engine/index.ts";
import { serializeSnapshot, deserializeSnapshot, validateSnapshot } from "../../lib/engine/contract.ts";
import { snapshotJson } from "../../lib/engine/snapshot-identity.ts";
import { RepositoryRefresh, refreshInputClass } from "../../lib/engine/refresh.ts";
import { SqliteAnalysisStore } from "../../lib/storage/sqlite.ts";

const hash = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
function fixture(sources: Record<string, string | Buffer> = {}) {
  const root = realpathSync.native(mkdtempSync(path.join(tmpdir(), "cartograph FS-02 ")));
  const write = (file: string, source: string | Buffer) => { const target = path.join(root, file); mkdirSync(path.dirname(target), { recursive: true }); writeFileSync(target, source); };
  for (const [file, text] of Object.entries(sources)) write(file, text);
  return { root, write, cleanup() { assert(path.basename(root).startsWith("cartograph FS-02 ")); rmSync(root, { recursive: true, force: true }); } };
}
const mixed = {
  "package.json": '{"name":"workspace","workspaces":["packages/*"],"dependencies":{"next":"16.3.6","react":"19.2.8"}}',
  "entry.ts": 'import { value } from "./value"; export const entry = value;\n', "value.ts": 'export const value = 1;\n',
  "packages/web/package.json": '{"name":"web","dependencies":{"vite":"8.3.3","react":"19.2.8"}}',
  "packages/web/view.tsx": 'export function View() { return <div/>; }\n',
  "packages/mobile/package.json": '{"name":"mobile","dependencies":{"react":"19.2.8","react-native":"0.85.3","expo":"55.0.31"}}',
  "packages/mobile/view.tsx": 'export function View() { return <div/>; }\n',
  "packages/plain/package.json": '{"name":"plain"}', "packages/plain/tool.ts": 'export const tool = 1;\n',
  "server/pyproject.toml": '[project]\nname = "backend"\ndependencies = ["Django==6.0.9"]\n',
  "server/manage.py": 'raise RuntimeError("must never run")\n', "server/app/apps.py": 'raise RuntimeError("must never run")\n', "server/app/models.py": 'class Model: pass\n',
};

test("F02-profile: one protected inventory, deterministic nested ownership and compatible composition", () => {
  const f = fixture(mixed); try {
    const one = selectFiles(f.root), two = selectFiles(f.root), d = one.walk.discovery;
    const golden = { projects: [".", "packages/mobile", "packages/plain", "packages/web", "server", "server/app"], owned: { "packages/plain/tool.ts": "packages/plain", "server/manage.py": "server", "server/app/models.py": "server/app" } };
    assert.deepEqual(d.projects.map(p => p.path), golden.projects);
    for (const [file, owner] of Object.entries(golden.owned)) assert.equal(d.inventory.find(f => f.path === file)?.owner, owner);
    assert.equal(new Set(d.inventory.map(f => f.path)).size, d.inventory.length);
    assert.deepEqual(d.inventory, two.walk.discovery.inventory);
    assert.equal(d.metadata.digest(), two.walk.discovery.metadata.digest());
    assert.deepEqual(d.projects.find(p => p.path === "packages/web")!.composition.frameworks, ["React", "vite"]);
    const mobile = d.projects.find(p => p.path === "packages/mobile")!; assert(mobile.composition.frameworks.includes("react-native")); assert(mobile.composition.frameworks.includes("React")); assert.deepEqual(mobile.composition.extensions, ["expo"]);
    assert(d.projects.find(p => p.path === "server")!.composition.frameworks.includes("django"));
    assert.deepEqual(d.projects[0].workspaceMembers, ["packages/mobile", "packages/plain", "packages/web"]);
    const snapshot = typescriptAdapter.analyze(f.root), legacy = parseRepository(f.root);
    assert.deepEqual(snapshot.files.map(f => f.path), legacy.files.map(f => f.path));
    assert.equal(snapshot.coverage.files.parsed, 5); assert.equal(snapshot.coverage.files.skipped, 3); assert.equal(snapshot.coverage.files.found, 8);
    assert(snapshot.diagnostics.filter(d => d.reason === "language-not-implemented").length === 3);
    assert(snapshot.analysis.capabilities.every(c => c.state === "partial"));
    assert.equal(snapshotJson(snapshot), snapshotJson(typescriptAdapter.analyze(f.root)));
    assert.deepEqual(deserializeSnapshot(serializeSnapshot(snapshot)), snapshot);
    assert.equal(snapshot.relationships.length, 1); assert(queryStructure(snapshot, { file: "entry.ts", direction: "dependencies" }).steps.flat().includes("value.ts"));
    assert.deepEqual(snapshot.routes.map(r => [r.file, r.method, r.pattern]), legacy.routes.map(r => [r.file, r.method, r.pattern]));
  } finally { f.cleanup(); }
});

test("F02-profile: first-match legacy routes/roles remain stable while framework detection composes", () => {
  const f = fixture({ "package.json": '{"dependencies":{"next":"16.3.6","react":"19.2.8","express":"5.2.1"}}', "app/api/test/route.ts": 'export function GET() { return 1; }\n' });
  try { const p = parseRepository(f.root), s = typescriptAdapter.analyze(f.root), composition = selectFiles(f.root).walk.discovery.projects[0].composition; assert.equal(composition.legacy.name, "Next.js"); assert(composition.frameworks.includes("Express")); assert(composition.frameworks.includes("React")); assert.equal(s.routes.length, 1); assert.deepEqual(s.files.map(f => f.role), p.files.map(f => f.role)); } finally { f.cleanup(); }
});

test("F02-profile: registration conflict, dependency cycle and missing prerequisites fail before facts", () => {
  const r = new ExtractorRegistry(), entry = { id: "first", stage: "framework" as const, version: "1", requires: [] as string[], channel: "roles", priority: 0, detect: () => true };
  r.register(entry); assert.throws(() => r.register(entry), /Conflicting/); r.register({ ...entry, id: "second" }); assert.throws(() => r.compose({ dir: ".", dependencies: new Set() }, []), /Conflicting/);
  const cycle = new ExtractorRegistry(); cycle.register({ ...entry, id: "a", channel: "a", requires: ["b"] }); cycle.register({ ...entry, id: "b", channel: "b", requires: ["a"] }); assert.throws(() => cycle.compose({ dir: ".", dependencies: new Set() }, []), /Cyclic/);
  const missing = new ExtractorRegistry(); missing.register({ ...entry, requires: ["absent"] }); assert.throws(() => missing.compose({ dir: ".", dependencies: new Set() }, []), /Missing/);
});

test("F02-profile: static literals, constants, objects, arrays, property access, concatenation and syntactic wrapper", () => {
  const result = interpretConfig('import { defineConfig as config } from "vite"; const prefix = "/api"; const options = { path: prefix + "/v1", items: [1, true, null] }; export default config(options);', { wrappers: { defineConfig: "vite" } });
  assert.deepEqual(result.gaps, []); assert.equal(result.value.kind, "object"); if (result.value.kind === "object") { assert.deepEqual(result.value.properties.path, { kind: "literal", value: "/api/v1" }); assert.equal(result.value.properties.items.kind, "array"); }
  assert.deepEqual(interpretConfig('const opts = { path: "/x" }; export default opts.path;').value, { kind: "literal", value: "/x" });
  assert.equal(interpretConfig('{"path":"/x"}', { expression: true }).value.kind, "object");
});

for (const [name, code, reason] of [
  ["getter", 'export default { get alias() { throw new Error("EXECUTED"); } };', "dynamic-expression"],
  ["helper", 'export default arbitraryHelper();', "dynamic-expression"],
  ["env", 'export default { alias: process.env.SECRET, stable: "/fixed" };', "dynamic-expression"],
  ["computed", 'export default { [computed]: "/x" };', "dynamic-expression"],
  ["spread", 'export default { ...imported };', "dynamic-expression"],
  ["cycle", 'const a = b; const b = a; export default a;', "config-cycle"],
  ["shadowed wrapper", 'const defineConfig = custom; export default defineConfig({ alias: "/x" });', "dynamic-expression"],
  ["malformed", 'export default { broken:', "parse-error"],
  ["mutation", 'const a = { alias: "/x" }; a.alias = arbitrary(); export default a;', "dynamic-expression"],
  ["initializer mutation", 'const a = { alias: "/x" }; const ignored = arbitrary(a); export default a;', "dynamic-expression"],
  ["prefix mutation", 'const a = { count: 0 }; const ignored = ++a.count; export default a;', "dynamic-expression"],
  ["delete mutation", 'const a = { alias: "/x" }; const ignored = delete a.alias; export default a;', "dynamic-expression"],
  ["tag helper", 'const a = { alias: "/x" }; const ignored = helper`side effect`; export default a;', "dynamic-expression"],
  ["ambiguous wrapper", 'import { defineConfig as cfg } from "vite"; import { helper as cfg } from "other"; export default cfg({ alias: "/x" });', "ambiguous-target"],
] as const) test("F02-profile: " + name + " never manufactures configuration", () => {
  const result = interpretConfig(code, { wrappers: { defineConfig: "vite" } }); assert(result.gaps.some(g => g.reason === reason));
  if (name === "env") { assert.equal(result.value.kind, "object"); if (result.value.kind === "object") { assert.equal(result.value.properties.alias.kind, "unknown"); assert.deepEqual(result.value.properties.stable, { kind: "literal", value: "/fixed" }); } }
  else assert.equal(result.value.kind, "unknown");
});

test("F02-profile: unknown environment branches retain conditions and never collapse into defaults", () => {
  const value = interpretConfig('export default process.env.MODE === "production" ? { origin: "/prod" } : { origin: "/dev" };').value;
  assert.equal(value.kind, "conditional"); if (value.kind === "conditional") { assert.match(value.condition, /process.env.MODE/); assert.notDeepEqual(value.whenTrue, value.whenFalse); }
});

test("F02-profile: executable config sentinel is read as text and never creates its file", () => {
  const f = fixture({ "entry.ts": "export const value = 1;\n" }); try {
    const sentinel = path.join(f.root, "EXECUTED.txt");
    f.write("vite.config.js", `require("node:fs").writeFileSync(${JSON.stringify(sentinel)}, "executed"); module.exports = { alias: "/unsafe" };\n`);
    const s = typescriptAdapter.analyze(f.root); assert.equal(existsSync(sentinel), false); assert(s.diagnostics.some(d => d.path === "vite.config.js" && d.reason === "dynamic-expression")); assert(s.analysis.bindings.length === 0); assert(s.analysis.resources.some(r => r.path === "vite.config.js"));
  } finally { f.cleanup(); }
});

test("F02-profile: public metadata names do not open secrets, dependency code, generated source or arbitrary configs", () => {
  const f = fixture({ "entry.ts": "export const value = 1;\n", ".env": "SECRET=do-not-read", "secrets/settings.py": "PRIVATE", "generated/settings.py": "PRIVATE", "node_modules/x/vite.config.js": "PRIVATE", "node_modules/x/package.json": '{"name":"x"}', "other.config.js": "PRIVATE", "pyproject.toml": '[project]\nname = "safe"\n' });
  try { const reader = new RepositoryReader(f.root), index = new ProtectedMetadataIndex(reader); for (const name of [".env", "secrets/settings.py", "generated/settings.py", "node_modules/x/vite.config.js", "node_modules/x/package.json", "other.config.js", "../settings.py"]) assert.equal(index.read(name), undefined, name); assert(index.read("pyproject.toml")); assert(index.issues.some(i => i.reason === "policy-denied")); const selection = selectFiles(f.root); assert(!selection.walk.discovery.metadata.all().some(r => /secret|generated|node_modules/.test(r.resource.path))); } finally { f.cleanup(); }
});

test("F02-profile: symlink/workspace junctions and escaped aliases are denied without target reads", () => {
  const outside = fixture({ "package.json": '{"name":"outside"}', "private.ts": 'throw new Error("PRIVATE");\n' }), f = fixture({ "entry.ts": 'export const value = 1;\n', "package.json": '{"workspaces":["../*","linked/*"]}' });
  try { symlinkSync(outside.root, path.join(f.root, "linked"), "junction"); const selection = selectFiles(f.root); assert(!selection.walk.candidates.some(c => c.path.includes("linked"))); assert(!selection.walk.discovery.projects.some(p => p.path.includes("linked"))); assert(selection.walk.discovery.issues.some(i => i.reason === "policy-denied")); const reader = selection.reader; assert.throws(() => reader.read(path.join(f.root, "linked/private.ts"), "source"), /symbolic link/); const p = createResolutionProfile(selection.walk.discovery, selection.walk.discovery.projects[0], "node-esm"); assert.equal(p.resolve("entry.ts", "../../private.ts", hash("export const value = 1;\n")).status, "excluded"); assert.equal(p.resolve("entry.ts", "./linked/private.ts", hash("export const value = 1;\n")).status, "excluded"); } finally { f.cleanup(); outside.cleanup(); }
});

test("F02-profile: explicit variants have independent keys/witnesses; platform/SSR/production semantics stay deferred", () => {
  const f = fixture({ "package.json": '{"dependencies":{"vite":"8.3.3","react":"19.2.8","react-native":"0.85.3"}}', "entry.ts": "export const value = 1;\n", "value.ts": "export const other = 2;\n", "entry.ios.ts": "export const value = 2;\n" });
  try { const selection = selectFiles(f.root), d = selection.walk.discovery, project = d.projects[0], keys = new Set<string>();
    for (const name of PROFILE_NAMES) { const p = createResolutionProfile(d, project, name); keys.add(p.cacheIdentity(hash("export const value = 1;\n"))); assert(p.variant.configWitnesses.every(w => w.variantId === p.variant.id)); assert.equal(p.resolve("entry.ts", "./value.ts", hash("export const value = 1;\n")).status, name === "python-package" ? "unresolved" : "internal"); assert.equal(p.resolve("entry.ts", "./value", hash("export const value = 1;\n")).status, "unresolved"); }
    assert.equal(keys.size, PROFILE_NAMES.length);
    const android = createResolutionProfile(d, project, "metro-android"), ios = createResolutionProfile(d, project, "metro-ios"); assert.notEqual(android.variant.id, ios.variant.id); assert.equal(android.variant.platform, "android"); assert.equal(ios.variant.platform, "ios"); assert.equal(android.resolve("entry.ts", "./entry", hash("export const value = 1;\n")).status, "unresolved"); assert.equal(ios.resolve("entry.ts", "./entry", hash("export const value = 1;\n")).status, "unresolved");
    const production = createResolutionProfile(d, project, "vite-browser", "production"); assert.equal(production.variant.environment, "browser-production"); assert.notEqual(production.cacheIdentity(hash("export const value = 1;\n")), createResolutionProfile(d, project, "vite-browser").cacheIdentity(hash("export const value = 1;\n")));
    const snapshot = typescriptAdapter.analyze(f.root); assert(!snapshot.analysis.variants.some(v => v.platform === "ios" || v.environment.includes("production") || v.environment.includes("ssr")));
    const explicit = coordinateSnapshot(typescriptAdapter.analyze(f.root), selectFiles(f.root), [{ project: ".", profile: "metro-ios" }, { project: ".", profile: "vite-ssr", environment: "production" }]); assert(explicit.analysis.variants.some(v => v.platform === "ios")); assert(explicit.analysis.variants.some(v => v.environment === "ssr-production")); assert.deepEqual(explicit.relationships, snapshot.relationships);
  } finally { f.cleanup(); }
});

test("F02-profile: every protected resolution is classified; duplicate workspace names stay ambiguous", () => {
  const f = fixture({ "entry.ts": "export const value = 1;\n", "value.ts": "export const value = 2;\n", "package.json": '{"dependencies":{"external":"1.2.3"}}', "a/package.json": '{"name":"duplicate"}', "b/package.json": '{"name":"duplicate"}' });
  try { const d = selectFiles(f.root).walk.discovery, p = createResolutionProfile(d, d.projects[0], "node-esm");
    assert.equal(p.resolve("entry.ts", "./value.ts", hash("export const value = 1;\n")).status, "internal"); assert.equal(p.resolve("entry.ts", "external", hash("export const value = 1;\n")).status, "external"); assert.equal(p.resolve("entry.ts", "./node_modules/x.ts", hash("export const value = 1;\n")).status, "excluded"); assert.equal(p.resolve("entry.ts", "unknown", hash("export const value = 1;\n")).status, "unresolved"); const duplicate = p.resolve("entry.ts", "duplicate", hash("export const value = 1;\n")); assert.equal(duplicate.status, "unresolved"); assert.equal(duplicate.reason, "ambiguous-target");
    const key = p.cacheIdentity(hash("export const value = 1;\n")); f.write("package.json", '{"dependencies":{"external":"2.0.0"}}'); assert.equal(p.resolve("entry.ts", "external", hash("export const value = 1;\n")).reason, "stale-evidence"); const fresh = selectFiles(f.root).walk.discovery; assert.notEqual(key, createResolutionProfile(fresh, fresh.projects[0], "node-esm").cacheIdentity(hash("export const value = 1;\n")));
  } finally { f.cleanup(); }
});

test("F00-resource: node/depth/string/config-dependency/glob bounds and deterministic cycle diagnostics", () => {
  const at = interpretConfig("export default [" + Array.from({ length: CONFIG_LIMITS.nodes - 1 }, () => "0").join(",") + "];"), over = interpretConfig("export default [" + Array.from({ length: CONFIG_LIMITS.nodes }, () => "0").join(",") + "];"); assert.equal(at.gaps.length, 0); assert.equal(over.value.kind, "unknown"); assert.equal(over.gaps[0].reason, "resource-limit");
  const depth = interpretConfig("export default " + "[".repeat(34) + "0" + "]".repeat(34)); assert.equal(depth.gaps[0].reason, "resource-limit");
  const huge = interpretConfig('const a = "' + "a".repeat(600000) + '"; export default a + a;'); assert.equal(huge.gaps[0].reason, "resource-limit");
  assert.deepEqual(expandInventoryGlobs(["packages/*", "**/value.ts"], ["packages/web", "packages/mobile", "src/value.ts"]), { matches: ["packages/mobile", "packages/web", "src/value.ts"], reasons: [], truncated: false });
  assert(expandInventoryGlobs(Array.from({ length: 101 }, () => "*"), []).truncated); assert(expandInventoryGlobs(["*"], Array.from({ length: 20001 }, (_, i) => String(i))).truncated); assert.equal(expandInventoryGlobs(["../*"], ["safe"]).matches.length, 0);
  const f = fixture({ "tsconfig.json": '{"extends":"./tsconfig.base.json"}', "tsconfig.base.json": '{"extends":"./tsconfig.json"}' }); try { const index = new ProtectedMetadataIndex(new RepositoryReader(f.root)); index.follow("tsconfig.json"); assert(index.issues.some(i => i.reason === "config-cycle")); assert.deepEqual(index.all().map(r => r.dependencies), [["tsconfig.json"], ["tsconfig.base.json"]]); for (let i = 0; i < 65; i++) f.write(`tsconfig.${i}.json`, JSON.stringify({ extends: `./tsconfig.${i + 1}.json` })); const limited = new ProtectedMetadataIndex(new RepositoryReader(f.root)); limited.follow("tsconfig.0.json"); assert(limited.issues.some(i => i.reason === "resource-limit")); assert.equal(limited.all().length, 64); } finally { f.cleanup(); }
});

test("F00-resource: cancellation/deadline/read limits never publish partial generations", () => {
  const f = fixture({ "entry.ts": "export const value = 1;\n" }); try {
    const signal = new AbortController(); signal.abort(); assert.throws(() => selectFiles(f.root, f.root, new GenerationBoundary(signal.signal)), /cancelled/); assert.throws(() => interpretConfig("export default {};", { boundary: new GenerationBoundary(signal.signal) }), /cancelled/); assert.throws(() => expandInventoryGlobs(["*"], [], new GenerationBoundary(signal.signal)), /cancelled/);
    let now = 0; const boundary = new GenerationBoundary(undefined, 10, () => now); boundary.check(); now = 10; assert.throws(() => boundary.check(), /resource-limit/);
    const reader = new RepositoryReader(f.root, { entries: 1 }); f.write("second.py", "pass\n"); assert.throws(() => reader.list(f.root), /entry limit/);
    const store = new SqliteAnalysisStore(path.join(f.root, "local.sqlite")), repo = store.register(f.root); try { store.begin(repo.repositoryId, "initial"); const snapshot = typescriptAdapter.analyze(f.root); store.publish(repo.repositoryId, "initial", snapshot); const prior = store.load(repo.repositoryId); const refresh = new RepositoryRefresh({ analyze: () => { throw new Error("resource-limit"); }, publish: s => store.publish(repo.repositoryId, "failed", s), status() {} }); assert.throws(() => refresh.run(true), /resource-limit/); assert.deepEqual(store.load(repo.repositoryId), prior); refresh.close(); } finally { store.close(); }
  } finally { f.cleanup(); }
});

test("F02-profile: configuration dependencies refresh/invalidate without changing graph or exact Impact", () => {
  const f = fixture({ "entry.ts": 'import { value } from "./value"; export const entry = value;\n', "value.ts": "export const value = 1;\n", "vite.config.js": 'module.exports = { root: "src" };\n', "pyproject.toml": '[project]\nname = "backend"\n' });
  try { const session = createTypescriptRefresh(), first = session.analyze(f.root, true), second = session.analyze(f.root, false); assert.deepEqual(second.snapshot, first.snapshot); assert.equal(second.mode, "incremental");
    const before = snapshotJson(first.snapshot), impact = queryStructure(first.snapshot, { file: "value.ts", direction: "dependents" });
    f.write("vite.config.js", 'module.exports = { root: "changed", unknown: process.env.SECRET };\n'); assert.equal(first.reader.stable(), false); const changed = session.analyze(f.root, false); assert.equal(changed.mode, "full"); assert.notEqual(snapshotJson(changed.snapshot), before); assert.deepEqual(changed.snapshot.relationships, first.snapshot.relationships); assert.deepEqual(queryStructure(changed.snapshot, { file: "value.ts", direction: "dependents" }), impact); assert.deepEqual(changed.snapshot, typescriptAdapter.analyze(f.root));
    f.write("server/pyproject.toml", '[project]\nname = "nested"\n'); f.write("server/app.py", "pass\n"); const topology = session.analyze(f.root, false); assert.equal(topology.mode, "full"); assert.deepEqual(topology.snapshot, typescriptAdapter.analyze(f.root)); rmSync(path.join(f.root, "server"), { recursive: true }); assert.deepEqual(session.analyze(f.root, false).snapshot, typescriptAdapter.analyze(f.root));
    for (const name of ["vite.config.ts", "metro.config.js", "pyproject.toml", "settings.py", "package-lock.json"]) assert.equal(refreshInputClass(name), "metadata"); assert.equal(refreshInputClass("view.tsx"), "source"); assert.equal(refreshInputClass("new.py"), "topology");
  } finally { f.cleanup(); }
});

test("F02-profile: public metadata evidence survives persistence, checks Unicode ranges and becomes stale", () => {
  const f = fixture({ "entry.ts": "export const value = 1;\n", "package.json": '{"description":"😀é","dependencies":{"vite":"8.3.3"}}\r\n', "vite.config.ts": 'export default { root: "src" };\r\n' });
  try { const snapshot = typescriptAdapter.analyze(f.root), store = new SqliteAnalysisStore(path.join(f.root, "local.sqlite")), repo = store.register(f.root); try { store.begin(repo.repositoryId, "generation"); store.publish(repo.repositoryId, "generation", snapshot); const loaded = store.load(repo.repositoryId)!; assert.deepEqual(loaded, snapshot); const witness = loaded.analysis.variants.find(v => v.resolverId === "vite-browser")!.configWitnesses.find(w => w.role !== "framework-rule" && w.site.file === "package.json")!; const current = readWitnessEvidence(loaded, witness); assert.equal(current.state, "current"); if (current.state === "current") assert(current.source.slice(current.start, current.end).includes("😀é")); f.write("package.json", '{}'); assert.equal(readWitnessEvidence(loaded, witness).state, "stale"); assert.equal(readEvidence(loaded, "package.json").state, "stale"); store.forget(repo.repositoryId); assert.throws(() => store.load(repo.repositoryId), /no longer registered/); } finally { store.close(); } } finally { f.cleanup(); }
});

test("F02-profile: malformed and unsupported metadata stays explicit; invalid byte encodings are not evidence", () => {
  const f = fixture({ "entry.ts": "export const value = 1;\n", "pyproject.toml": "invalid TOML here\n", "settings.py": 'raise RuntimeError("do not execute")\n', "requirements.txt": "Django==6.0.9\n-r ../private.txt\n", "yarn.lock": "unknown lock syntax\n", "tsconfig.extra.json": '{broken:', "uv.lock": Buffer.from([255, 254, 65, 0]) });
  try { const s = typescriptAdapter.analyze(f.root); assert(s.diagnostics.some(d => d.path === "pyproject.toml" && d.reason === "unsupported-syntax")); assert(s.diagnostics.some(d => d.path === "tsconfig.extra.json" && d.reason === "parse-error")); assert(s.diagnostics.some(d => d.path === "uv.lock" && d.reason === "unsupported-encoding")); assert(!s.analysis.resources.some(r => r.path === "uv.lock")); assert(s.analysis.qualifications.length === 0); assert(validateSnapshot(s)); } finally { f.cleanup(); }
});

test("F02-profile: fixture/oracle hashes and exact infrastructure tuple are mandatory", () => {
  const record = JSON.parse(readFileSync("tests/fixtures/framework-support/F02-profile/fixture.json", "utf8")) as { tuple: { node: string; typescript: string; tsMorph: string }; sources: Record<string, string>; sourceHashes: Record<string, string>; oracle: { outputSha256: string }; expected: unknown };
  assert.equal(record.tuple.node, process.versions.node); assert.equal(record.tuple.typescript, JSON.parse(readFileSync("node_modules/typescript/package.json", "utf8")).version); assert.equal(record.tuple.tsMorph, JSON.parse(readFileSync("node_modules/ts-morph/package.json", "utf8")).version);
  for (const [name, source] of Object.entries(record.sources)) assert.equal(hash(source), record.sourceHashes[name]); assert.equal(hash(JSON.stringify(record.expected)), record.oracle.outputSha256);
  const f = fixture(record.sources); try { const s = typescriptAdapter.analyze(f.root), observed = { projects: s.projects.map(p => p.path), parsed: s.coverage.files.parsed, skipped: s.coverage.files.skipped, imports: s.relationships.map(r => [r.source, r.target]), profile: s.analysis.variants.filter(v => v.resolverId === "python-package").map(v => v.environment), qualified: s.analysis.capabilities.filter(c => c.state === "qualified").length, forbiddenBindings: s.analysis.bindings.length }; assert.deepEqual(observed, record.expected); } finally { f.cleanup(); }
});

test("F02-profile: Python environments are excluded and dependency families cannot create false framework detection", () => {
  const f = fixture({ "package.json": '{"dependencies":{"django":"6.0.9"}}', "entry.ts": "export const value = 1;\n", "app.py": "pass\n", "venv/settings.py": "PRIVATE", "site-packages/package/app.py": "PRIVATE", "__pycache__/cached.py": "PRIVATE" });
  try { const selection = selectFiles(f.root); assert(!selection.walk.discovery.projects[0].composition.frameworks.includes("django")); assert.equal(selection.walk.discovery.inventory.length, 2); assert.equal(selection.walk.excludedDirectories.filter(d => /venv|site-packages|__pycache__/.test(d.path)).length, 3); const index = selection.walk.discovery.metadata; assert.equal(index.read("venv/settings.py"), undefined); const snapshot = typescriptAdapter.analyze(f.root); assert.equal(snapshot.coverage.files.skipped, 1); } finally { f.cleanup(); }
});

test("F02-profile: wrong source hashes and cross-project/profile sources never resolve internally", () => {
  const f = fixture({ "entry.ts": "export const value = 1;\n", "value.ts": "export const value = 2;\n", "nested/package.json": '{"name":"nested"}', "nested/entry.ts": "export const value = 1;\n" });
  try { const d = selectFiles(f.root).walk.discovery, profile = createResolutionProfile(d, d.projects[0], "node-esm"); assert.equal(profile.resolve("entry.ts", "./value.ts", hash("wrong")).status, "unresolved"); assert.equal(profile.resolve("nested/entry.ts", "../value.ts", hash("export const value = 1;\n")).reason, "ambiguous-target"); const result = profile.resolve("entry.ts", "./value.ts", hash("export const value = 1;\n")); assert.equal(result.status, "internal"); assert(result.witnesses.some(w => w.role === "reference" && w.site.fileHash === hash("export const value = 1;\n"))); const python = createResolutionProfile(d, d.projects[0], "python-package"); assert.equal(python.resolve("entry.ts", "./value.ts", hash("export const value = 1;\n")).reason, "unsupported-syntax"); } finally { f.cleanup(); }
});

test("F02-profile: config uncertainty is scoped to its profile and cannot alter unrelated verified imports", () => {
  const f = fixture({ "package.json": '{"dependencies":{"vite":"8.3.3"}}', "entry.ts": 'import "./value";\n', "value.ts": "export const value = 1;\n", "vite.config.js": 'module.exports = { alias: process.env.UNKNOWN };\n', "pyproject.toml": '[project]\nname = "backend"\n' });
  try { const s = typescriptAdapter.analyze(f.root); assert.equal(s.relationships.length, 1); const vite = s.analysis.variants.find(v => v.resolverId === "vite-browser")!, node = s.analysis.variants.find(v => v.resolverId === "node-esm")!, python = s.analysis.variants.find(v => v.resolverId === "python-package")!; assert(s.analysis.gaps.some(g => g.variantId === vite.id && g.reason === "dynamic-expression")); assert(!s.analysis.gaps.some(g => g.variantId === node.id || g.variantId === python.id)); assert(!node.configWitnesses.some(w => w.role !== "framework-rule" && w.site.file === "vite.config.js")); assert(!python.configWitnesses.some(w => w.role !== "framework-rule" && w.site.file === "package.json")); } finally { f.cleanup(); }
});

test("F00-resource: safe globs check cancellation inside adversarial matching and retain no truncated singleton", () => {
  let ticks = 0; const boundary = new GenerationBoundary(undefined, 500, () => ++ticks);
  assert.throws(() => expandInventoryGlobs(["*a".repeat(100) + "z"], ["a".repeat(250)], boundary), /resource-limit/);
  assert.equal(expandInventoryGlobs(Array.from({ length: 100 }, () => "*"), ["known"]).matches.length, 1);
  assert.equal(expandInventoryGlobs(["*"], Array.from({ length: 20000 }, (_, i) => String(i))).matches.length, 20000);
  const truncated = expandInventoryGlobs(["*"], Array.from({ length: 20001 }, (_, i) => String(i))); assert(truncated.truncated); assert.deepEqual(truncated.matches, []);
});

test("F00-resource: cancellation between discovery and parsing preserves the current stored snapshot", () => {
  const f = fixture({ "entry.ts": "export const value = 1;\n" }); try { const controller = new AbortController(), session = createTypescriptRefresh({ signal: controller.signal }); const complete = session.analyze(f.root, true); assert.equal(complete.parsed, 1); assert.throws(() => session.analyze(f.root, true, () => controller.abort()), /cancelled/); assert.equal(complete.snapshot.files.length, 1); assert.equal(complete.reader.stable(), true); } finally { f.cleanup(); }
});

test("F02-profile: inherited configuration cycles and missing metadata have typed capability gaps and source proof", () => {
  const f = fixture({ "entry.ts": "export const value = 1;\n", "tsconfig.json": '{"extends":"./tsconfig.base.json"}', "tsconfig.base.json": '{"extends":"./tsconfig.json"}' });
  try { const cycle = typescriptAdapter.analyze(f.root); assert(cycle.analysis.gaps.some(g => g.reason === "config-cycle")); f.write("tsconfig.base.json", '{"extends":"./tsconfig.missing.json"}'); const missing = typescriptAdapter.analyze(f.root); assert(missing.analysis.gaps.some(g => g.reason === "missing-metadata" && g.occurrence.file === "tsconfig.base.json")); for (const c of missing.analysis.capabilities.filter(c => c.capabilityId.startsWith("resolution-infrastructure/"))) assert(c.gapIds.some(id => missing.analysis.gaps.find(g => g.id === id)?.reason === "missing-metadata")); } finally { f.cleanup(); }
});
