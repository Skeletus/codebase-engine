import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, writeFileSync, rmSync, realpathSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { typescriptAdapter } from "../lib/engine/adapters/typescript.ts";
import { explanationEvidence } from "../lib/ai/evidence.ts";
import { validateSelection } from "../lib/ai/selection.ts";
import { SqliteAnalysisStore } from "../lib/storage/sqlite.ts";
import { validateRequest } from "../lib/desktop/protocol.ts";
import { validateStorageRequest } from "../lib/desktop/storage-protocol.ts";
function fixture() {
  const root = realpathSync.native(mkdtempSync(path.join(tmpdir(), "cartograph byok evidence ")));
  writeFileSync(path.join(root, "entry.ts"), 'import type { Kind } from "./types"; export const entry = "raw-source-should-not-be-transmitted";');
  writeFileSync(path.join(root, "types.ts"), "export type Kind = string;");
  writeFileSync(path.join(root, ".env"), "secret-never-selected");
  return { root, snapshot: typescriptAdapter.analyze(root), cleanup() { assert(path.basename(root).startsWith("cartograph byok evidence ")); rmSync(root, { recursive: true, force: true }); } };
}
test("explanation packages contain bounded verified metadata, hashes and gaps, never source or roots", () => {
  const f = fixture();
  try {
    const before = JSON.stringify(f.snapshot), result = explanationEvidence(f.snapshot, { kind: "file", path: "entry.ts" });
    const payload = JSON.parse(result.payload);
    assert.deepEqual(result.files, ["entry.ts", "types.ts"]);
    assert.equal(payload.edges[0].typeOnly, true); assert.equal(payload.edges[0].hash, f.snapshot.files.find((f) => f.path === "entry.ts")!.hash);
    assert(payload.limits.includes("not calls")); assert.equal(result.digest.length, 64);
    assert.doesNotMatch(result.payload, /raw-source-should-not-be-transmitted|secret-never-selected|origin|root/);
    assert.equal(JSON.stringify(f.snapshot), before); assert.equal(result.digest, explanationEvidence(f.snapshot, { kind: "file", path: "entry.ts" }).digest);
    const changed = structuredClone(f.snapshot); changed.files[0].hash = "f".repeat(64);
    assert.notEqual(result.digest, explanationEvidence(changed, { kind: "file", path: "entry.ts" }).digest);
    assert.throws(() => explanationEvidence(f.snapshot, { kind: "file", path: ".env" }));
    const sensitive = structuredClone(f.snapshot); sensitive.files[0].exports = ["sk-abcdefghijklmnopqrstuvwxyz"];
    assert.throws(() => explanationEvidence(sensitive, { kind: "file", path: "entry.ts" }), /Sensitive/);
    sensitive.files[0].exports = ["gsk_synthetic_secret_do_not_send"];
    assert.throws(() => explanationEvidence(sensitive, { kind: "file", path: "entry.ts" }), /Sensitive/);
  } finally { f.cleanup(); }
});
test("folder/investigation selection is explicit, bounded and cannot manufacture evidence", () => {
  const f = fixture();
  try {
    const folder = explanationEvidence(f.snapshot, { kind: "folder", path: "" }); assert.equal(folder.files.length, 2);
    const search = explanationEvidence(f.snapshot, { kind: "investigation", query: { operation: "search", text: "entry", scope: "exports", budget: 10 } }); assert.deepEqual(search.files, ["entry.ts"]);
    const impact = explanationEvidence(f.snapshot, { kind: "investigation", query: { operation: "ask", intent: "dependents", target: "types.ts", depth: 4, budget: 10 } });
    assert.equal(JSON.parse(impact.payload).goal.intent, "dependents");
    assert.throws(() => explanationEvidence(f.snapshot, { kind: "investigation", query: { operation: "ask", intent: "unsupported", target: "", depth: 4, budget: 10 } }));
    for (const hostile of [{ kind: "file", path: "../outside" }, { kind: "file", path: "C:\\secret" }, { kind: "folder", path: "", endpoint: "https://backend" }, { kind: "file", path: "entry.ts", source: "payload" }]) assert.throws(() => validateSelection(hostile));
    assert.equal(validateRequest({ version: 1, requestId: "prepare", jobId: "job", type: "explanation", query: { kind: "file", path: "entry.ts" } }).type, "explanation");
    const many = structuredClone(f.snapshot);
    for (let i = 0; i < 20; i++) many.files.push({ ...many.files[0], id: `extra${i}.ts`, path: `extra${i}.ts` });
    const bounded = JSON.parse(explanationEvidence(many, { kind: "folder", path: "" }).payload); assert.equal(bounded.files.length, 8); assert.equal(bounded.omissions.files, 14);
  } finally { f.cleanup(); }
});
test("local explanation cache separates approved provenance/model/prompt and cascades on forgetting", () => {
  const f = fixture(), dbFile = path.join(f.root, "local.sqlite");
  let store = new SqliteAnalysisStore(dbFile);
  try {
    const repo = store.register(f.root); store.begin(repo.repositoryId, "snapshot"); store.publish(repo.repositoryId, "snapshot", f.snapshot);
    store.close();
    const version2 = new DatabaseSync(dbFile); version2.exec("DROP TABLE explanation_cache; PRAGMA user_version=2"); version2.close();
    store = new SqliteAnalysisStore(dbFile); assert.deepEqual(store.load(repo.repositoryId), f.snapshot);
    const evidence = explanationEvidence(f.snapshot, { kind: "file", path: "entry.ts" });
    const key = `openai:model:structural-v1:${evidence.digest}`, answer = JSON.stringify({ body: "Generated", citations: ["F1"] });
    store.explanationCache(repo.repositoryId, key, answer); store.close(); store = new SqliteAnalysisStore(dbFile);
    assert.equal(store.explanationCache(repo.repositoryId, key), answer); assert.equal(store.explanationCache(repo.repositoryId, key.replace("model", "different")), null);
    assert.equal(store.explanationCache(repo.repositoryId, key.replace("v1", "v2")), null);
    const groqKey = key.replace("openai:", "groq:");
    assert.equal(store.explanationCache(repo.repositoryId, groqKey), null);
    store.explanationCache(repo.repositoryId, groqKey, JSON.stringify({ body: "Groq result", citations: ["F1"] }));
    assert.equal(store.explanationCache(repo.repositoryId, key), answer);
    assert.notEqual(store.explanationCache(repo.repositoryId, groqKey), answer);
    assert.throws(() => store.explanationCache(repo.repositoryId, "../file", answer));
    assert.throws(() => validateStorageRequest({ version: 1, type: "explanation-cache", repositoryId: repo.repositoryId, key, credential: "sk-secret" }));
    for (let i = 0; i < 105; i++) store.explanationCache(repo.repositoryId, `bounded:${i}`, answer);
    assert.equal(store.explanationCache(repo.repositoryId, key), null);
    store.forget(repo.repositoryId);
    const db = new DatabaseSync(dbFile); try { assert.equal(Number(db.prepare("SELECT count(*) AS n FROM explanation_cache").get()!.n), 0); } finally { db.close(); }
  } finally { store.close(); f.cleanup(); }
});
test("native-only provider transport preserves the restrictive renderer and local engine boundary", () => {
  const rust = readFileSync("src-tauri/src/explanations.rs", "utf8"), ui = readFileSync("components/external-ai.tsx", "utf8");
  assert(rust.includes('https://api.openai.com/v1/chat/completions')); assert(rust.includes('https://api.groq.com/openai/v1/chat/completions')); assert(rust.includes("Policy::none()")); assert(rust.includes(".no_proxy()")); assert(rust.includes("retry::never()"));
  assert.doesNotMatch(ui, /fetch\(|localStorage|sessionStorage|console\.|process\.env|Authorization/);
  assert.doesNotMatch(readFileSync("scripts/sidecar.ts", "utf8"), /api\.openai|Bearer|reqwest|keyring/);
  assert(readFileSync("src-tauri/tauri.conf.json", "utf8").includes("connect-src ipc: http://ipc.localhost;"));
  assert(ui.includes("Approve this exact payload")); assert(ui.includes("no provider call"));
  const details = readFileSync("components/detail-pane.tsx", "utf8");
  assert(details.includes('tab="evidence" label="Evidence"')); assert(details.includes('tab="explanation" label="Explain"'));
  assert.doesNotMatch(details, /props\.evidence\s*\?\s*\(target\.kind/);
});

test("provider choice survives the approval dialog and citations do not depend on provider wire JSON", () => {
  const ui = readFileSync("components/external-ai.tsx", "utf8"), desktop = readFileSync("components/desktop-explorer.tsx", "utf8");
  assert(ui.includes("onProviderChange(e.target.value)"));
  assert(desktop.includes("provider={aiProvider}"));
  assert(ui.includes("const references = prepared.references"));
  assert.doesNotMatch(ui, /JSON.parse|messages\[|api\.openai|api\.groq|gpt-4|OpenAI|Groq/);
  assert(ui.includes("provider, model: remove"));
  assert(ui.includes("directly to {prepared.provider}"));
});

test("installed agents have bounded native adapters, no renderer CLI/root/key authority or structural writes", () => {
  const native = readFileSync("src-tauri/src/local_agents.rs", "utf8"), explanations = readFileSync("src-tauri/src/explanations.rs", "utf8"), ui = readFileSync("components/external-ai.tsx", "utf8");
  const production = native.split("#[cfg(test)]\nmod tests")[0];
  assert(production.includes("command.env_clear()"));
  assert(production.includes("Command::new(exe)"));
  assert(production.includes("--ignore-user-config"));
  assert(production.includes("--safe-mode")); assert(production.includes("--restricted"));
  assert(production.includes("AssignProcessToJobObject")); assert(production.includes("CloseHandle(self.job)"));
  assert(production.includes("switches_disabled"));
  assert(production.includes("missing_options")); assert(production.includes("empty_input_validated"));
  assert(production.includes("model_from_catalog")); assert(production.includes("process_failure"));
  assert.doesNotMatch(production, /version\.trim\(\)\s*==\s*"codex-cli|285\.\.=/);
  assert(!production.includes('"tools.view_image=false"'));
  assert(!production.includes('"gpt-5.4"'));
  assert.doesNotMatch(production, /crate::(?:request|storage_request)|CODE_INTELLIGENCE_ROOT|OPENAI_API_KEY|ANTHROPIC_API_KEY|\.arg\("(?:cmd|powershell)"\)/);
  assert(explanations.includes("enum ExplanationAdapter"));
  assert(explanations.includes("Installed agents own authentication"));
  assert(explanations.includes("matching_package(&ticket.package, &current)"));
  assert(ui.includes('optgroup label="Remote providers"')); assert(ui.includes('optgroup label="Local agents"'));
  assert(ui.includes("not guaranteed offline"));
  assert(readFileSync("components/explanation-panel.tsx", "utf8").includes("Generated explanation — not structural evidence"));
});

test("dense long-path evidence fits the unchanged budget without losing the selected file", () => {
  const f = fixture();
  try {
    const snapshot = structuredClone(f.snapshot);
    const selected = snapshot.files[0];
    snapshot.files = Array.from({ length: 8 }, (_, i) => ({ ...selected, id: `src/${"long-folder/".repeat(15)}file-${i}.ts`, path: `src/${"long-folder/".repeat(15)}file-${i}.ts`, exports: Array.from({ length: 20 }, (_, j) => `ExportedSymbol${j}${"X".repeat(50)}`) }));
    snapshot.relationships = Array.from({ length: 24 }, (_, i) => ({ ...snapshot.relationships[0], id: `dense-${i}`, source: snapshot.files[0].path, target: snapshot.files[1 + i % 7].path }));
    const before = JSON.stringify(snapshot);
    const result = explanationEvidence(snapshot, { kind: "file", path: snapshot.files[0].path });
    const payload = JSON.parse(result.payload);
    assert(Buffer.byteLength(result.payload) <= 6000);
    assert(result.files.includes(snapshot.files[0].path));
    assert(payload.omissions.edges > 0);
    assert.equal(payload.omissions.files, 8 - result.files.length);
    assert.equal(JSON.stringify(snapshot), before);
    assert.equal(result.digest, explanationEvidence(snapshot, { kind: "file", path: snapshot.files[0].path }).digest);
  } finally { f.cleanup(); }
});
