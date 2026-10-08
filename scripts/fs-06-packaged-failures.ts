import assert from "node:assert/strict";
import { cpSync, copyFileSync, mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, unlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import path from "node:path";
import os from "node:os";

const temporary = mkdtempSync(path.join(os.tmpdir(), "cartograph FS05 failures "));
try {
  const engine = path.join(temporary, "engine"), root = path.join(temporary, "source"), node = path.join(temporary, "node.exe");
  cpSync("src-tauri/resources/generated/engine", engine, { recursive: true });
  copyFileSync("src-tauri/binaries/code-engine-x86_64-pc-windows-msvc.exe", node);
  mkdirSync(root); writeFileSync(path.join(root, "main.ts"), "export const accepted = 1;\n");
  writeFileSync(path.join(root, "main.py"), "def target():\n    pass\ntarget()\n");
  const files = ["python-runtime.json", "lib/engine/assets/python/tree-sitter-python.wasm", "node_modules/web-tree-sitter/tree-sitter.wasm", "node_modules/web-tree-sitter/tree-sitter.js", "node_modules/web-tree-sitter/package.json", "bin/parser-host.exe"];
  const probe = `import assert from 'node:assert/strict';const {createComposedRefresh}=await import(${JSON.stringify(pathToFileURL(path.join(engine,"lib/engine/adapters/composed.ts")).href)});const driver=createComposedRefresh({host:${JSON.stringify(path.join(engine,"bin/parser-host.exe"))}});const result=await driver.analyze(${JSON.stringify(root)},true);assert.deepEqual(result.snapshot.files.map(f=>f.path),['main.ts']);assert(result.snapshot.diagnostics.some(d=>d.path==='main.py'&&d.reason==='parser-unavailable'));assert.equal(result.snapshot.behavior.relations.filter(r=>r.site.file==='main.py').length,0);process.stdout.write('PASS');`;
  const entry = path.join(engine, "failure-probe.mjs"); writeFileSync(entry, probe);
  const records = [];
  for (const file of files) {
    const target = path.join(engine, file), original = readFileSync(target);
    for (const failure of ["missing", "corrupt"] as const) {
      try {
        if (failure === "missing") unlinkSync(target); else writeFileSync(target, "corrupt controlled asset");
        const output = execFileSync(node, [entry], { env: { NODE_ENV: "production", PATH: "", SystemRoot: process.env.SystemRoot }, timeout: 15000 }).toString();
        assert.equal(output, "PASS"); records.push({ file, failure, status: "PASS", originalHash: createHash("sha256").update(original).digest("hex") });
      } finally { writeFileSync(target, original); }
    }
  }
  writeFileSync("docs/fs-06/evidence/packaged-failures.json", JSON.stringify({ platform: process.platform, checks: "Typed Python refusal, no Python facts and usable TS/JS under empty PATH", records, harnessHash: createHash("sha256").update(readFileSync(import.meta.filename)).digest("hex") }, null, 2) + "\n");
  process.stdout.write(`PASS ${records.length} packaged missing/corrupt asset cases\n`);
} finally { assert(path.basename(temporary).startsWith("cartograph FS05 failures ")); rmSync(temporary, { recursive: true, force: true }); }
