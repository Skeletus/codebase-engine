import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import os from "node:os";
import { createComposedRefresh } from "../lib/engine/adapters/composed.ts";

const tuple = process.argv.find(arg => arg.startsWith("--tuple="))?.slice(8);
assert(tuple === "python31215" || tuple === "python31316");
const fixtureBytes = readFileSync("tests/fixtures/framework-support/F05-python/semantics.json");
const fixture = JSON.parse(fixtureBytes.toString("utf8")) as { cases: { id: string; source: string }[] };
const qualified = (JSON.parse(readFileSync("docs/fs-05/evidence/qualification.json","utf8")) as {tuple:string;semanticFixtureHash:string;patterns:{visitedNodes:number}[]}[]).find(record=>record.tuple===tuple);
assert(qualified&&qualified.semanticFixtureHash===createHash("sha256").update(fixtureBytes).digest("hex"));
const parserNodes = 1 + qualified.patterns.reduce((sum,pattern)=>sum+pattern.visitedNodes,0); // empty package initializer adds one module node
const root = mkdtempSync(path.join(os.tmpdir(), "cartograph FS05 measurement "));
try {
  mkdirSync(path.join(root, "pkg")); writeFileSync(path.join(root,"pkg/__init__.py"), "");
  for (const c of fixture.cases) writeFileSync(path.join(root, "pkg", c.id + ".py"), c.source);
  writeFileSync(path.join(root,"pyproject.toml"), `[project]\nname="controlled"\nrequires-python="==${tuple === "python31215" ? "3.12.15" : "3.13.16"}"\n`);
  const driver = createComposedRefresh({ host: path.resolve("src-tauri/target/release/parser-host.exe") });
  const warm = process.argv.includes("--warm"), samples = [];
  if (warm) await driver.analyze(root,true);
  for (let n = 0; n < (warm ? 20 : 1); n++) {
    const started = performance.now(), result = await driver.analyze(root,!warm);
    assert(result.snapshot.files.some(f=>f.path.endsWith("direct.py")));
    samples.push({ elapsedMs: performance.now()-started, files:result.snapshot.files.length, parserNodes, facts:result.snapshot.behavior.declarations.length+result.snapshot.behavior.relations.length+result.snapshot.behavior.gaps.length+result.snapshot.relationships.length+result.snapshot.analysis.bindings.length+result.snapshot.analysis.gaps.length, sourceBytes: result.snapshot.files.reduce((sum,f)=>sum+f.bytes,0), snapshotBytes: Buffer.byteLength(JSON.stringify(result.snapshot)), declarations: result.snapshot.behavior.declarations.length, relations: result.snapshot.behavior.relations.length, gaps: result.snapshot.behavior.gaps.length, parsed: result.parsed, reused: result.reused });
  }
  process.stdout.write(JSON.stringify({tuple,profile:"static-python-declared-environment",fixtureHash:createHash("sha256").update(fixtureBytes).digest("hex"),node:process.version,samples,deadlineFailures:0,scope:"Parent engine counters; separately retained Windows job probe supplies parser commit ceiling"}));
} finally { assert(path.basename(root).startsWith("cartograph FS05 measurement ")); rmSync(root,{recursive:true,force:true}); }

