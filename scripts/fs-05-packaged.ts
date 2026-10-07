import assert from "node:assert/strict";
import { cpSync, copyFileSync, mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import path from "node:path";
import os from "node:os";

const temporary = mkdtempSync(path.join(os.tmpdir(), "cartograph FS05 packaged "));
const engine = path.join(temporary, "engine"), root = path.join(temporary, "selected source"), node = path.join(temporary, "node.exe");
try {
  cpSync("src-tauri/resources/generated/engine", engine, { recursive: true });
  copyFileSync("src-tauri/binaries/code-engine-x86_64-pc-windows-msvc.exe", node);
  mkdirSync(root);
  const sources = { "pyproject.toml": '[project]\nname = "controlled"\nrequires-python = "==3.12.15"\ndependencies = ["requests==2.32.5"]\n', "target.py": "def target(value):\n    return value\n__all__ = ['target']\n", "main.py": "raise RuntimeError('MUST NEVER EXECUTE')\nfrom target import target as run\ndef caller():\n    return run(1)\n", "settings.py": "# Controlled source/metadata deduplication fixture\ndef command():\n    pass\n", "main.ts": "export const accepted = 1;\n" };
  for (const [file, text] of Object.entries(sources)) writeFileSync(path.join(root, file), text);
  const url = (file: string) => JSON.stringify(pathToFileURL(path.join(engine, file)).href);
  const probe = `import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {readFileSync,writeFileSync} from 'node:fs';import net from 'node:net';const require=createRequire(import.meta.url);for(const tool of ['next','react','typescript','pnpm'])assert.throws(()=>require.resolve(tool));assert.equal(process.env.PATH,'');globalThis.fetch=()=>{throw Error('denied egress')};net.connect=()=>{throw Error('denied egress')};net.createConnection=net.connect;
const {createComposedRefresh}=await import(${url("lib/engine/adapters/composed.ts")});const {serializeSnapshot,deserializeSnapshot}=await import(${url("lib/engine/contract.ts")});const {readEvidence,queryStructure}=await import(${url("lib/engine/index.ts")});const {SqliteAnalysisStore}=await import(${url("lib/storage/sqlite.ts")});
const driver=createComposedRefresh({host:${JSON.stringify(path.join(engine,"bin/parser-host.exe"))}}),root=${JSON.stringify(root)},first=await driver.analyze(root,true),snapshot=first.snapshot;assert.equal(snapshot.version,3);assert.equal(snapshot.files.length,4);assert.equal(snapshot.analysis.resources.filter(r=>r.path==='settings.py').length,1);assert(snapshot.behavior.relations.some(r=>r.relation==='calls'&&r.site.file==='main.py'));assert(snapshot.analysis.bindings.some(b=>b.kind==='module-export'));assert.deepEqual(queryStructure(snapshot,{file:'main.py',direction:'dependencies',depth:1}).steps,[['target.py']]);assert.equal(readEvidence(snapshot,'main.py').state,'current');assert.equal(serializeSnapshot(deserializeSnapshot(serializeSnapshot(snapshot))),serializeSnapshot(snapshot));assert.deepEqual((await driver.analyze(root,false)).snapshot,snapshot);
const store=new SqliteAnalysisStore(${JSON.stringify(path.join(temporary,"snapshot.sqlite"))});const repository=store.register(root);store.begin(repository.repositoryId,'fs05');store.publish(repository.repositoryId,'fs05',snapshot);assert.deepEqual(store.load(repository.repositoryId),snapshot);store.close();writeFileSync(${JSON.stringify(path.join(root,"main.py"))},readFileSync(${JSON.stringify(path.join(root,"main.py"))},'utf8')+'# edit\\n');assert.equal(readEvidence(snapshot,'main.py').state,'stale');process.stdout.write(JSON.stringify({status:'PASS',node:process.version,files:snapshot.files.length,imports:snapshot.relationships.length,bindings:snapshot.analysis.bindings.length,checks:['offline','empty PATH','no Python or development tooling','execution sentinel','Python/TS composition','metadata/source deduplication','direct calls','structural dependencies','snapshot round trip','full/incremental','SQLite persistence','evidence staleness']})+'\\n');`;
  const entry = path.join(engine, "packaged-probe.mjs"); writeFileSync(entry, probe);
  const environment: NodeJS.ProcessEnv = { NODE_ENV: "production", PATH: "", SystemRoot: process.env.SystemRoot };
  const output = execFileSync(node, ["--disable-warning=ExperimentalWarning", entry], { env: environment, timeout: 30000 });
  const record = JSON.parse(output.toString("utf8"));
  writeFileSync("docs/fs-05/evidence/packaged.json", JSON.stringify({ ...record, fixtureHash: createHash("sha256").update(JSON.stringify(sources)).digest("hex"), runtimeManifest: JSON.parse(readFileSync(path.join(engine,"python-runtime.json"),"utf8")), harnessHash: createHash("sha256").update(readFileSync(import.meta.filename)).digest("hex") }, null, 2) + "\n");
  process.stdout.write(output);
} finally { assert(path.basename(temporary).startsWith("cartograph FS05 packaged ")); rmSync(temporary, { recursive: true, force: true }); }

