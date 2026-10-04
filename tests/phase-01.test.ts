import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, symlinkSync, rmSync, realpathSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { analyzeLocalRepository, queryStructure, readEvidence } from "../lib/engine/index.ts";
import { typescriptAdapter } from "../lib/engine/adapters/typescript.ts";
import { validateSnapshot, serializeSnapshot, deserializeSnapshot } from "../lib/engine/contract.ts";
import { parseRepository, parseSelection } from "../lib/parser/index.ts";
import { serializeParseResult, deserializeParseResult } from "../lib/parser/contract.ts";
import { RepositoryReader, READ_LIMITS } from "../lib/repository/read-policy.ts";
import { walkRepository } from "../lib/parser/walk.ts";
import { findCycles } from "../lib/graph/insights.ts";
import { parseRepositoryUrl } from "../lib/pipeline/github.ts";

function fixture(contents: Record<string, string>, run: (root: string) => void) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), "cartograph-phase01-")));
  try {
    for (const [file, content] of Object.entries(contents)) {
      const absolute = path.join(root, file);
      mkdirSync(path.dirname(absolute), { recursive: true });
      writeFileSync(absolute, content);
    }
    run(root);
  } finally {
    // The literal root is created above, not read from a repository or test payload.
    assert(path.basename(root).startsWith("cartograph-phase01-"));
    rmSync(root, { recursive: true, force: true });
  }
}

const basic = {
  "package.json": '{"name":"fixture"}',
  "base.json": '{"compilerOptions":{"baseUrl":".","paths":{"@/*":["src/*"]}}}',
  "tsconfig.json": '{"extends":"./base.json"}',
  "src/a.ts": 'import type { B } from "@/b"; export { b } from "./b"; import("./b"); import(name); export const a = 1;\n',
  "src/b.ts": 'import { a } from "./a"; export type B = string; export const b = 2;\n',
  "src/c.cjs": 'const b = require("./b"); module.exports = { b }; require(variable);\n',
  "src/broken.ts": 'export const x = ;\n',
  "src/skipped-import.ts": 'import "./broken";\n',
};

test("local adapter preserves exact dependency evidence, diagnostics and round trips", () => {
  fixture(basic, (root) => {
    const parsed = parseRepository(root);
    const snapshot = analyzeLocalRepository(root, typescriptAdapter);
    assert.equal(snapshot.origin.kind, "local");
    assert.equal(snapshot.origin.root, root);
    assert.deepEqual(snapshot.files.map((file) => Object.fromEntries(Object.entries(file).filter(([key]) => key !== "id"))), parsed.files);
    assert.deepEqual(snapshot.relationships.map((r) => ({ source: r.source, target: r.target, kind: r.syntax, typeOnly: r.typeOnly, specifier: r.evidence.description, line: r.evidence.line })), parsed.edges);
    assert.equal(snapshot.relationships.filter((r) => r.source === "src/a.ts" && r.syntax === "import")[0]?.typeOnly, true);
    assert(snapshot.relationships.some((r) => r.syntax === "require"));
    assert(snapshot.relationships.some((r) => r.syntax === "dynamic-import"));
    assert(snapshot.diagnostics.some((d) => d.reason === "non-literal-dynamic-import"));
    assert(snapshot.diagnostics.some((d) => d.reason === "non-literal-require"));
    assert(snapshot.diagnostics.some((d) => d.reason === "syntax-error"));
    assert.equal(parsed.coverage.imports.excluded["target-skipped"], 1);
    assert.equal(serializeParseResult(deserializeParseResult(serializeParseResult(parsed))), serializeParseResult(parsed));
    assert.equal(serializeSnapshot(deserializeSnapshot(serializeSnapshot(snapshot))), serializeSnapshot(snapshot));
    assert.equal(readEvidence(snapshot, "src/a.ts").state, "current");
    writeFileSync(path.join(root, "src/a.ts"), "export const changed = true;\n");
    assert.equal(readEvidence(snapshot, "src/a.ts").state, "stale");
  });
});

test("deduplication reports first occurrence and retains type-only aggregation", () => {
  fixture({ "a.ts": 'import type { B } from "./b";\nimport { b } from "./b";\n', "b.ts": "export type B = string; export const b = 1;\n" }, (root) => {
    const snapshot = analyzeLocalRepository(root, typescriptAdapter);
    assert.equal(snapshot.relationships.length, 1);
    assert.equal(snapshot.relationships[0].evidence.line, 1);
    assert.equal(snapshot.relationships[0].evidence.occurrence, "first");
    assert.equal(snapshot.relationships[0].typeOnly, false);
    assert.equal(snapshot.coverage.relationships.internal, 2);
  });
});

test("structural queries include type-only dependents and terminate on cycles", () => {
  fixture({ "a.ts": 'import type { B } from "./b";\n', "b.ts": 'export type B = string; import "./c";\n', "c.ts": 'import "./b";\n' }, (root) => {
    const snapshot = analyzeLocalRepository(root, typescriptAdapter);
    assert.deepEqual(queryStructure(snapshot, { file: "b.ts", direction: "dependents" }).steps[0], ["a.ts", "c.ts"]);
    const parsed = parseRepository(root);
    const cycles = findCycles(parsed.files, parsed.edges);
    assert.equal(cycles.length, 1);
    assert.deepEqual(cycles[0].files, ["b.ts", "c.ts"]);
    assert.throws(() => queryStructure(snapshot, { file: "missing", direction: "dependencies" }), /Unknown/);
    assert.throws(() => queryStructure(snapshot, { file: "a.ts", direction: "dependencies", depth: -1 }), /depth/);
  });
});

test("snapshot validator rejects incompatible, dangling, escaped and forged evidence", () => {
  fixture(basic, (root) => {
    const snapshot = analyzeLocalRepository(root, typescriptAdapter);
    assert.throws(() => validateSnapshot({ ...snapshot, version: 99 }), /version/);
    const dangling = structuredClone(snapshot);
    dangling.relationships[0].target = "missing.ts";
    assert.throws(() => validateSnapshot(dangling), /Dangling/);
    const forged = structuredClone(snapshot);
    forged.relationships[0].evidence.fileHash = "0".repeat(64);
    assert.throws(() => validateSnapshot(forged), /evidence/);
    const escaped = structuredClone(snapshot);
    escaped.files[0].path = "../outside.ts";
    assert.throws(() => validateSnapshot(escaped), /relative/);
    const counts = structuredClone(snapshot);
    counts.coverage.files.found++;
    assert.throws(() => validateSnapshot(counts), /coverage/);
    assert.throws(() => deserializeSnapshot("null"), /object/);
  });
});

test("read policy excludes sensitive sources and common output directories", () => {
  fixture({
    "a.ts": 'import "./secrets"; import "./dist/output";\n',
    "secrets.ts": "export const secret = 1;\n", ".env.ts": "export const secret = 1;\n",
    "private.key": "secret", "credentials.json": "{}", "safe.ts": "export const safe = 1;\n",
    ...Object.fromEntries(["node_modules", "dist", "build", "out", "coverage", "target", "bin", "obj", "vendor", "generated", "__generated__", ".cache"].map((dir) => [`${dir}/output.ts`, "export const generated = 1;\n"])),
  }, (root) => {
    const snapshot = analyzeLocalRepository(root, typescriptAdapter);
    assert.deepEqual(snapshot.files.map((f) => f.path), ["a.ts", "safe.ts"]);
    assert(snapshot.diagnostics.some((d) => d.path === "secrets.ts" && d.category === "skipped-file"));
    assert(snapshot.diagnostics.some((d) => d.path === "dist" && d.category === "excluded-directory"));
    assert.equal(snapshot.relationships.length, 0);
    const reader = new RepositoryReader(root);
    assert.throws(() => reader.read(path.join(root, "private.key"), "source"), /sensitive/);
    assert.equal(reader.readMetadata(path.join(root, "credentials.json")), undefined);
  });
});

test("outside config inheritance is reported and cannot yield approximate edges", () => {
  fixture({ "outer.json": '{"compilerOptions":{"paths":{"@x":["./x"]}}}', "repo/tsconfig.json": '{"extends":"../outer.json"}', "repo/a.ts": 'import "./b";\n', "repo/b.ts": "export const b = 1;\n" }, (root) => {
    const result = analyzeLocalRepository(path.join(root, "repo"), typescriptAdapter);
    assert.equal(result.relationships.length, 0);
    assert(result.diagnostics.some((d) => d.category === "config"));
    assert(result.diagnostics.some((d) => d.category === "unresolved-import" && d.detail.includes("withheld")));
    assert.equal(new RepositoryReader(path.join(root, "repo")).readMetadata(path.join(root, "outer.json")), undefined);
  });
});

test("JSON dependency config inheritance remains static and inside the root", () => {
  fixture({ "node_modules/config/tsconfig.json": '{"compilerOptions":{"baseUrl":"../..","paths":{"@x":["./b.ts"]}}}', "tsconfig.json": '{"extends":"./node_modules/config/tsconfig.json"}', "a.ts": 'import "@x";\n', "b.ts": "export const b = 1;\n" }, (root) => {
    const result = analyzeLocalRepository(root, typescriptAdapter);
    assert.equal(result.relationships.length, 1);
    assert.equal(result.relationships[0].target, "b.ts");
    assert(!result.files.some((f) => f.path.startsWith("node_modules/")));
  });
});

test("symlink escapes are never selected, resolved or read as evidence", (t) => {
  fixture({ "outside.ts": "export const outside = 1;\n", "repo/a.ts": 'import "./link/value";\n' }, (root) => {
    try { symlinkSync(root, path.join(root, "repo/link"), "junction"); }
    catch (error) {
      if (error instanceof Error && "code" in error && error.code === "EPERM") { t.skip("Host does not permit creating symlinks"); return; }
      throw error;
    }
    const result = analyzeLocalRepository(path.join(root, "repo"), typescriptAdapter);
    assert.equal(result.relationships.length, 0);
    assert(result.diagnostics.some((d) => d.path === "link" && d.category === "excluded-directory"));
    const reader = new RepositoryReader(path.join(root, "repo"));
    assert.throws(() => reader.read(path.join(root, "repo/link/outside.ts"), "source"), /symbolic|excluded/);
  });
});

test("resource and enumeration failures are explicit; large files are not partially parsed", () => {
  fixture({ "a.ts": "export const a = 1;\n", "b.ts": "export const b = 2;\n", "large.ts": " ".repeat(READ_LIMITS.fileBytes + 1) }, (root) => {
    const parsed = parseRepository(root);
    assert.equal(parsed.coverage.files.skippedFiles[0].reason, "too-large");
    assert.throws(() => walkRepository(root, new RepositoryReader(root, { files: 1 })), /code-file limit/);
    assert.throws(() => walkRepository(root, new RepositoryReader(root, { totalBytes: 1 })), /aggregate/);
    assert.throws(() => walkRepository(root, new RepositoryReader(root, { entries: 1 })), /entry limit/);
    assert.throws(() => new RepositoryReader(root).list(path.join(root, "a.ts")), /Cannot enumerate/);
    mkdirSync(path.join(root, "deep/nested"), { recursive: true });
    assert.throws(() => walkRepository(root, new RepositoryReader(root, { depth: 1 })), /nesting limit/);
  });
});

test("binary and declaration files have explicit coverage", () => {
  fixture({ "binary.ts": "\0secret", "types.d.ts": "export type X = string;\n", "a.ts": "export const a = 1;\n" }, (root) => {
    const parsed = parseRepository(root);
    assert.deepEqual(parsed.coverage.files.skippedFiles.map((f) => f.reason), ["binary", "declaration-file"]);
    assert.equal(parsed.coverage.files.found, 3);
  });
});

test("framework route evidence and withheld routes survive normalization", () => {
  fixture({ "package.json": '{"dependencies":{"next":"1"}}', "app/api/items/route.ts": "export function GET() { return null; }\n", "next.config.ts": 'export default { basePath: "/base" };\n' }, (root) => {
    const result = analyzeLocalRepository(root, typescriptAdapter);
    assert.equal(result.routes[0]?.pattern, "/base/api/items");
    assert.equal(result.routes[0]?.evidence.fileHash, result.files.find((f) => f.path === "app/api/items/route.ts")?.hash);
    writeFileSync(path.join(root, "next.config.ts"), "export default { basePath: computed };\n");
    const withheld = analyzeLocalRepository(root, typescriptAdapter);
    assert.equal(withheld.routes.length, 0);
    assert(withheld.diagnostics.some((d) => d.category === "withheld-routes"));
  });
  fixture({ "package.json": '{"dependencies":{"express":"1"}}', "routes.ts": 'app.get("/x", handler);\n' }, (root) => {
    const result = analyzeLocalRepository(root, typescriptAdapter);
    assert.equal(result.routes.length, 0);
    assert(result.diagnostics.some((d) => d.category === "withheld-routes"));
  });
});

test("local analysis never requests network or executes repository configuration/scripts", () => {
  fixture({ "package.json": '{"scripts":{"postinstall":"DO_NOT_EXECUTE","build":"DO_NOT_EXECUTE"}}', "next.config.ts": 'throw new Error("DO_NOT_EXECUTE");\n', "a.ts": 'throw new Error("DO_NOT_EXECUTE");\n' }, (root) => {
    const original = globalThis.fetch;
    globalThis.fetch = () => { throw new Error("Network egress denied"); };
    try {
      const result = analyzeLocalRepository(root, typescriptAdapter);
      queryStructure(result, { file: "a.ts", direction: "dependencies" });
      assert.equal(readEvidence(result, "a.ts").state, "current");
    } finally { globalThis.fetch = original; }
  });
});

test("legacy GitHub ingestion rejects local root inputs", () => {
  for (const root of ["C:\\Projects\\private", "/tmp/private", "file:///tmp/private", "../repo"]) {
    assert.throws(() => parseRepositoryUrl(root));
  }
  assert.deepEqual(parseRepositoryUrl("https://github.com/owner/name"), { owner: "owner", name: "name" });
});

test("protected import graph and visualization cannot reach cloud/server capabilities", () => {
  const visited = new Set<string>();
  function scan(file: string, adapter = false) {
    const absolute = path.resolve(file);
    if (visited.has(absolute)) return;
    visited.add(absolute);
    const text = readFileSync(absolute, "utf8");
    assert(!text.includes('from "langsmith'), absolute);
    const imports = [...text.matchAll(/(?:from\s+|import\s*)["']([^"']+)["']/g)].map((m) => m[1]);
    for (const specifier of imports) {
      assert(!/^(next(?:\/|$)|react(?:\/|$)|@clerk|@supabase|openai|langsmith|node:(?:http|https|net|tls|child_process))/.test(specifier), `${absolute} -> ${specifier}`);
      if (!adapter) assert(!/^(ts-morph|typescript)$/.test(specifier), `${absolute} must be language neutral`);
      if (specifier.startsWith(".")) {
        const target = path.resolve(path.dirname(absolute), specifier);
        assert(!/[/\\](pipeline|supabase|ai)[/\\]/.test(target), `${absolute} -> ${target}`);
        scan(target, adapter);
      }
    }
    assert(!/\b(?:fetch|eval)\s*\(/.test(text), absolute);
  }
  scan("lib/engine/index.ts");
  scan("lib/engine/adapters/typescript.ts", true);
  for (const file of ["components/analysis-view.tsx", "components/explanation-panel.tsx", "components/detail-pane.tsx", "components/progress/rerun-button.tsx"]) {
    assert(!readFileSync(file, "utf8").includes('@/app/'), `${file} imports server actions`);
  }
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  assert.equal(pkg.dependencies.langsmith, undefined);
  assert(!readFileSync(".env.example", "utf8").includes("LANGSMITH"));
});

test("existing parser and graph verification scripts work against fixture output", () => {
  fixture(basic, (root) => {
    const parsed = parseRepository(root);
    const output = path.join(root, "analysis.json");
    writeFileSync(output, serializeParseResult(parsed));
    for (const [script, args] of [
      ["scripts/parse.ts", ["--read", output]],
      ["scripts/map-counts.ts", [output]],
      ["scripts/insights.ts", [output, "src/a.ts"]],
    ] as const) {
      const result = spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
      assert.equal(result.status, 0, `${script}: ${result.stderr}\n${result.stdout}`);
      if (script.includes("map-counts")) assert(!/missing (?:node|row): [1-9]/.test(result.stdout));
    }
  });
});

test("selection can use bounded reader without hidden process-current-directory reads", () => {
  fixture({ "a.ts": "export const a = 1;\n" }, (root) => {
    const reader = new RepositoryReader(root);
    const parsed = parseSelection({ root, reader, walk: walkRepository(root, reader) });
    assert.equal(parsed.files.length, 1);
    assert.equal(reader.denials().length, 0);
  });
});

test("fresh migrations explicitly authorize every audited legacy writer operation", () => {
  const migrations = readdirSync("supabase/migrations").filter((name) => name.endsWith(".sql")).sort();
  const repairs = migrations.filter((name) => name.endsWith("_legacy_writer_grants.sql"));
  assert.equal(repairs.length, 1);
  assert.equal(migrations.at(-1), repairs[0], "repair must follow the original schema migrations");
  const sql = migrations.map((name) => readFileSync(path.join("supabase/migrations", name), "utf8")).join("\n");
  // Evaluate explicit grants from the migration chain, starting with no
  // service_role table defaults, as on the failing fresh development project.
  const grants = new Map<string, Set<string>>();
  for (const match of sql.matchAll(/grant\s+([a-z,\s]+?)\s+on\s+((?:public\.\w+\s*,?\s*)+)to\s+service_role\s*;/gi)) {
    for (const table of match[2].match(/public\.\w+/g) ?? []) {
      const permissions = grants.get(table) ?? new Set<string>();
      for (const permission of match[1].split(",")) permissions.add(permission.trim().toLowerCase());
      grants.set(table, permissions);
    }
  }
  // Includes submission, claims/progress/failure, reruns, invoker RPCs, the
  // legacy CLI's count reads, model-role upserts and explanation-cache writes.
  const required = {
    organizations: ["insert", "select"], projects: ["insert", "select"],
    analyses: ["insert", "select", "update"], files: ["delete", "insert", "select"],
    edges: ["insert", "select"], routes: ["insert"],
    file_roles: ["insert", "select"], ai_cache: ["insert", "select"],
  };
  assert.deepEqual([...grants.keys()].sort(), Object.keys(required).map((table) => `public.${table}`).sort());
  for (const [table, permissions] of Object.entries(required)) {
    assert.deepEqual([...(grants.get(`public.${table}`) ?? [])].sort(), permissions, table);
  }
  for (const rpc of ["insert_edges", "insert_routes", "insert_file_roles"]) {
    assert.match(sql, new RegExp(`grant execute on function public\\.${rpc}\\(uuid, jsonb\\) to service_role;`, "i"));
    assert.match(sql, new RegExp(`revoke execute on function public\\.${rpc}\\(uuid, jsonb\\) from public, anon, authenticated;`, "i"));
  }
  assert.doesNotMatch(sql, /\b(?:create\s+sequence|nextval\s*\(|(?:big|small)?serial|generated\s+(?:always|by default)\s+as\s+identity)\b/i);
});

test("legacy writer repair contains only scoped grants without altering reader or RLS security", () => {
  const repair = readdirSync("supabase/migrations").find((name) => name.endsWith("_legacy_writer_grants.sql"));
  assert(repair);
  const statements = readFileSync(path.join("supabase/migrations", repair), "utf8")
    .replace(/--[^\n]*/g, "").split(";").map((statement) => statement.trim()).filter(Boolean);
  assert.equal(statements.length, 7);
  for (const statement of statements) {
    assert.match(statement, /^grant\s+(?:usage on schema public|(?:select|insert|update|delete)(?:,\s*(?:select|insert|update|delete))* on public\.\w+(?:,\s*public\.\w+)*) to service_role$/i);
  }
  assert.doesNotMatch(statements.join("\n"), /\b(?:all|authenticated|anon|insights|explanations|default|realtime)\b/i);
});
