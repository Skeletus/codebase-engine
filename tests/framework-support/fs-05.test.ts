import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { pythonSource } from "../../lib/engine/adapters/python-source.ts";
import path from "node:path";
import { PythonParserWorker } from "../../lib/engine/parser-worker.ts";
import { AnalysisCoordinator } from "../../lib/engine/coordinator.ts";
import { typescriptDriver } from "../../lib/engine/adapters/typescript.ts";
import { pythonExtension } from "../../lib/engine/adapters/python.ts";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync, symlinkSync, rmdirSync } from "node:fs";
import os from "node:os";
import { refreshInputClass, RepositoryRefresh } from "../../lib/engine/refresh.ts";
import { validatePythonSyntax } from "../../lib/engine/adapters/python-contract.ts";
import { createComposedRefresh } from "../../lib/engine/adapters/composed.ts";

test("FS05 original bytes, BOM, CRLF and Unicode ranges", () => {
  const bytes = Buffer.from('\uFEFF# coding: utf-8\r\nlabel = "😀é"; value = 1\r\n');
  const input = pythonSource(bytes), start = input.text.indexOf("value");
  const site = input.range(start, start + 5);
  assert.equal(input.hash, createHash("sha256").update(bytes).digest("hex"));
  assert.equal(input.parserText.length, input.text.length);
  assert.equal(site.line, 2); assert.equal(site.endLine, 2);
  assert.equal(bytes.subarray(site.byteStart, site.byteEnd).toString("utf8"), "value");
  assert.throws(() => input.range(input.text.indexOf("😀") + 1, start));
});

test("FS05 Windows contained parser accepts controlled syntax without executing it", async () => {
  const worker = new PythonParserWorker(path.resolve("src-tauri/target/debug/parser-host.exe"));
  try {
    await worker.start();
    const source = 'raise RuntimeError("MUST NEVER EXECUTE")\n' + 'type Pair[T] = tuple[T, T]\n' + 'def target(x):\n    return x\n' + 'async def caller():\n    target(1)\n';
    const parsed = await worker.parse("controlled.py", Buffer.from(source));
    assert(parsed.behavior.declarations.some(d => d.name === "target"));
    assert(parsed.behavior.relations.some(r => r.relation === "calls"));
    assert.deepEqual(await worker.parse("controlled.py", Buffer.from(source)), parsed);
    const malformed = await worker.parse("broken.py", Buffer.from("def broken(:\n return 1"));
    assert.equal(malformed.behavior.declarations.length, 0);
    assert(malformed.behavior.gaps.some(g => g.reason === "parse-error"));
    await assert.rejects(worker.parse("encoding.py", Buffer.from("# coding: latin-1\nx=1\n")), /unsupported-encoding/);
    assert((await worker.parse("recovered.py", Buffer.from("def recovered():\n    pass\n"))).behavior.declarations.some(d => d.name === "recovered"));
  } finally { worker.close(); }
});

test("FS05 unsupported encodings fail closed without replacement", () => {
  for (const bytes of [Buffer.from([0xff, 0xfe, 0x61, 0]), Buffer.from([0xc3, 0x28]), Buffer.from("# coding: latin-1\nx=1\n"), Buffer.from("# coding: ascii\nx='é'\n"), Buffer.from("\uFEFF# coding: ascii\nx=1\n")]) assert.throws(() => pythonSource(bytes));
  assert.equal(pythonSource(Buffer.from("# coding: ascii\nx=1\n")).text, "# coding: ascii\nx=1\n");
  assert.doesNotThrow(() => pythonSource(Buffer.from("x=1\n# coding: latin-1\n")));
  assert.throws(() => pythonSource(Buffer.from("#!/bin/python\n# coding: latin-1\nx=1\n")));
});

test("FS05 Python composes with TS/JS through shared v3 snapshots", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "cartograph FS05 composition "));
  try {
    mkdirSync(path.join(root, "pkg"));
    writeFileSync(path.join(root, "pkg", "__init__.py"), "");
    writeFileSync(path.join(root, "pkg", "target.py"), "def target(x):\n    return x\n");
    writeFileSync(path.join(root, "pkg", "caller.py"), "from .target import target as run\ndef caller():\n    run(1)\n");
    writeFileSync(path.join(root, "main.ts"), "export const value = 1;\n");
    const coordinator = new AnalysisCoordinator(typescriptDriver());
    const extension = pythonExtension({ host: path.resolve("src-tauri/target/debug/parser-host.exe") });
    const first = await coordinator.analyzeAsync(root, true, [extension]);
    assert.equal(first.snapshot.version, 3);
    assert.equal(first.snapshot.files.length, 4);
    assert(first.snapshot.behavior.relations.some(r => r.relation === "calls" && r.site.file === "pkg/caller.py"));
    assert(first.snapshot.analysis.bindings.some(b => b.kind === "module-dependency" && b.targetId === "pkg/target.py"));
    assert.deepEqual((await coordinator.analyzeAsync(root, false, [extension])).snapshot, first.snapshot);
  } finally { assert(path.basename(root).startsWith("cartograph FS05 composition ")); rmSync(root, { recursive: true, force: true }); }
});

test("FS05 decorators, reassignment, attributes and dynamic binding never guess calls", async () => {
  const worker = new PythonParserWorker(path.resolve("src-tauri/target/debug/parser-host.exe"));
  try {
    await worker.start();
    for (const source of [
      "@decorate\ndef target():\n    pass\ntarget()\n",
      "def target():\n    pass\ntarget = other\ntarget()\n",
      "class Service:\n    def run(self):\n        pass\nservice.run()\n",
      "def target():\n    pass\nfrom unknown import *\ntarget()\n",
      "def target():\n    pass\nfor target in values:\n    pass\ntarget()\n",
      "def target():\n    pass\nexec(source)\ntarget()\n",
    ]) {
      const facts = await worker.parse("negative.py", Buffer.from(source));
      assert.equal(facts.behavior.relations.filter(r => r.relation === "calls").length, 0);
      assert(facts.behavior.gaps.length > 0);
    }
    const positive = await worker.parse("alias.py", Buffer.from("def target():\n    pass\nrun = target\nrun()\n"));
    assert.equal(positive.behavior.relations.filter(r => r.relation === "calls").length, 1);
  } finally { worker.close(); }
});

test("FS05 cancellation refuses worker work and supports a fresh session", async () => {
  const controller = new AbortController(); controller.abort();
  const worker = new PythonParserWorker(path.resolve("src-tauri/target/debug/parser-host.exe"), controller.signal);
  await assert.rejects(worker.start(), /cancelled/);
  worker.close();
  const fresh = new PythonParserWorker(path.resolve("src-tauri/target/debug/parser-host.exe"));
  try { await fresh.start(); assert.equal((await fresh.parse("fresh.py", Buffer.from("def fresh():\n    pass\n"))).behavior.declarations[0].name, "fresh"); } finally { fresh.close(); }
});

test("FS05 controlled semantic fixture verifies exact calls and forbidden guesses", async () => {
  const fixture = JSON.parse(readFileSync("tests/fixtures/framework-support/F05-python/semantics.json", "utf8")) as { cases: { id: string; source: string; calls: string[]; gap: boolean; all?: string[] | null; mro?: string[] | null }[] };
  const worker = new PythonParserWorker(path.resolve("src-tauri/target/debug/parser-host.exe"));
  try {
    await worker.start();
    for (const c of fixture.cases) {
      const facts = await worker.parse(c.id + ".py", Buffer.from(c.source));
      const byId = new Map(facts.behavior.declarations.map(d => [d.id, d.name]));
      assert.deepEqual(facts.behavior.relations.filter(r => r.relation === "calls").map(r => byId.get(r.target)), c.calls, c.id);
      assert.equal(facts.behavior.gaps.length > 0, c.gap, c.id);
      if ("all" in c) assert.deepEqual(facts.all?.map(e => e.name) ?? null, c.all, c.id);
      if ("mro" in c) assert.deepEqual(facts.inheritance.at(-1)?.mro?.map(id => byId.get(id)) ?? null, c.mro, c.id);
      assert.deepEqual(await worker.parse(c.id + ".py", Buffer.from(c.source)), facts);
    }
  } finally { worker.close(); }
});

test("FS05 namespace/src roots, re-exports and shadowed import sites remain distinct", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "cartograph FS05 resolution "));
  try {
    mkdirSync(path.join(root, "src/ns"), { recursive: true });
    writeFileSync(path.join(root, "src/ns/target.py"), "def target():\n    pass\n");
    writeFileSync(path.join(root, "src/ns/public.py"), "from .target import target as exported\n__all__ = ['exported']\n");
    writeFileSync(path.join(root, "src/ns/caller.py"), "from ns.public import exported\ndef caller():\n    exported()\ndef hidden():\n    from unavailable import exported\n    exported()\n");
    const coordinator = new AnalysisCoordinator(typescriptDriver()), extension = pythonExtension({ host: path.resolve("src-tauri/target/debug/parser-host.exe"), moduleRoots: { ".": ["src"] } });
    const first = await coordinator.analyzeAsync(root, true, [extension]);
    const calls = first.snapshot.behavior.relations.filter(r => r.relation === "calls");
    assert.equal(calls.length, 1); assert.equal(calls[0].site.file, "src/ns/caller.py"); assert.equal(calls[0].site.line, 3);
    const reexport = first.snapshot.analysis.bindings.find(b => b.kind === "module-export" && b.occurrence.file === "src/ns/caller.py")!;
    assert(reexport.witnesses.some(w => w.role !== "framework-rule" && w.site.file === "src/ns/public.py"));
    assert(reexport.witnesses.some(w => w.role === "declaration" && w.site.file === "src/ns/target.py"));
    writeFileSync(path.join(root, "src/ns/public.py"), "from .target import target as exported\nexported = other\n");
    const changed = await coordinator.analyzeAsync(root, false, [extension]);
    assert.equal(changed.snapshot.behavior.relations.filter(r => r.relation === "calls").length, 0);
    assert.deepEqual((await coordinator.analyzeAsync(root, true, [extension])).snapshot, changed.snapshot);
    await assert.rejects(coordinator.analyzeAsync(root, true, [pythonExtension({ host: path.resolve("src-tauri/target/debug/parser-host.exe"), moduleRoots: { ".": ["../escape"] } })]), /Invalid Python module roots/);
  } finally { assert(path.basename(root).startsWith("cartograph FS05 resolution ")); rmSync(root, { recursive: true, force: true }); }
});

test("FS05 protected exclusions and failed parser retain TS/JS", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "cartograph FS05 exclusions "));
  try {
    writeFileSync(path.join(root, "main.ts"), "export const value = 1;\n");
    writeFileSync(path.join(root, "main.py"), "def present():\n    pass\n");
    for (const directory of ["venv", "__pycache__", "site-packages", "__pypackages__", ".venv"]) { mkdirSync(path.join(root, directory)); writeFileSync(path.join(root, directory, "never.py"), "raise RuntimeError('MUST NEVER EXECUTE')\n"); }
    writeFileSync(path.join(root, "secrets.py"), "raise RuntimeError('MUST NEVER READ')\n");
    const coordinator = new AnalysisCoordinator(typescriptDriver());
    const candidate = await coordinator.analyzeAsync(root, true, [pythonExtension({ host: path.join(root, "unavailable-host.exe") })]);
    assert.deepEqual(candidate.snapshot.files.map(f => f.path), ["main.ts"]);
    assert(candidate.snapshot.diagnostics.some(d => d.path === "main.py" && d.reason === "parser-unavailable"));
    assert(!candidate.snapshot.analysis.resources.some(r => /never\.py|secrets\.py/.test(r.path)));
    assert(candidate.snapshot.diagnostics.some(d => d.path === "secrets.py" && d.reason === "policy-denied"));
  } finally { assert(path.basename(root).startsWith("cartograph FS05 exclusions ")); rmSync(root, { recursive: true, force: true }); }
});

test("FS05 async refresh preserves previous publication after failure or pause", async () => {
  assert.equal(refreshInputClass("main.py", [".py"]), "source"); assert.equal(refreshInputClass("settings.py", [".py"]), "metadata");
  const root = mkdtempSync(path.join(os.tmpdir(), "cartograph FS05 refresh "));
  try {
    writeFileSync(path.join(root, "main.ts"), "export const value = 1;\n");
    const coordinator = new AnalysisCoordinator(typescriptDriver()), candidate = coordinator.analyze(root, true);
    let published = 0, fail = false;
    const refresh = new RepositoryRefresh({ analyze: () => candidate, analyzeAsync: async () => { if (fail) throw new Error("resource-limit"); return candidate; }, publish: () => { published++; }, status: () => {} });
    await refresh.runAsync(true); assert.equal(published, 1); fail = true;
    await assert.rejects(refresh.runAsync(false), /resource-limit/); assert.equal(published, 1);
    refresh.close();
  } finally { assert(path.basename(root).startsWith("cartograph FS05 refresh ")); rmSync(root, { recursive: true, force: true }); }
});

test("FS05 active cancellation releases the single-worker lease and source byte limits recover", async () => {
  const host = path.resolve("src-tauri/target/debug/parser-host.exe"), controller = new AbortController();
  const worker = new PythonParserWorker(host, controller.signal);
  await worker.start();
  await assert.rejects(new PythonParserWorker(host).start(), /parser-unavailable/);
  const pending = worker.parse("active.py",Buffer.from("#"+"a".repeat(1048574)+"\n"));
  controller.abort(); await assert.rejects(pending,/cancelled/); await worker.close();
  await assert.rejects(worker.parse("cancelled.py", Buffer.from("x=1\n")), /parser-unavailable|cancelled/);
  const fresh = new PythonParserWorker(host);
  try {
    await fresh.start();
    for (const size of [1048575, 1048576]) {
      const source = Buffer.from("#" + "a".repeat(size - 2) + "\n");
      assert.equal(source.length, size);
      const result = await fresh.parse("boundary.py", source);
      assert.equal(result.behavior.declarations.length, 0);
      assert.equal(result.behavior.gaps.length, 0);
    }
    await assert.rejects(fresh.parse("above.py", Buffer.alloc(1048577)), /resource-limit/);
    assert.equal((await fresh.parse("fresh.py", Buffer.from("def fresh():\n    pass\n"))).behavior.declarations[0].name, "fresh");
  } finally { await fresh.close(); }
});

test("FS05 a paused asynchronous generation cannot publish late", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "cartograph FS05 late "));
  try {
    writeFileSync(path.join(root, "main.ts"), "export const value = 1;\n");
    const candidate = new AnalysisCoordinator(typescriptDriver()).analyze(root, true);
    let release!: () => void, published = 0;
    const barrier = new Promise<void>(resolve => { release = resolve; });
    const refresh = new RepositoryRefresh({ analyze: () => candidate, analyzeAsync: async () => { await barrier; return candidate; }, publish: () => { published++; }, status: () => {} });
    const pending = refresh.runAsync(true);
    refresh.pause(); release();
    await assert.rejects(pending, /unstable_generation/); assert.equal(published, 0);
    refresh.close();
  } finally { assert(path.basename(root).startsWith("cartograph FS05 late ")); rmSync(root, { recursive: true, force: true }); }
});

test("FS05 Python import exclusions, stubs, external packages and root escapes stay separate", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "cartograph FS05 boundaries ")), outside = mkdtempSync(path.join(os.tmpdir(), "cartograph FS05 outside "));
  try {
    writeFileSync(path.join(root,"pyproject.toml"), '[project]\nname="controlled"\ndependencies=["requests==2.32.5"]\n');
    writeFileSync(path.join(root,"main.py"), "import requests\nimport missing\nimport stub\nimport secrets\nfrom escape.payload import target\nfrom ..unknown import target\n");
    writeFileSync(path.join(root,"stub.pyi"), "def target(): ...\n");
    writeFileSync(path.join(root,"secrets.py"), "raise RuntimeError('MUST NEVER READ')\n");
    writeFileSync(path.join(outside,"payload.py"), "def target():\n    pass\n");
    symlinkSync(outside,path.join(root,"escape"),"junction");
    const result = await new AnalysisCoordinator(typescriptDriver()).analyzeAsync(root,true,[pythonExtension({host:path.resolve("src-tauri/target/debug/parser-host.exe")})]);
    assert.equal(result.snapshot.relationships.length,0);
    assert.equal(result.snapshot.coverage.external.requests,1);
    assert.equal(result.snapshot.coverage.excluded.secrets,1);
    assert(!result.snapshot.files.some(f=>f.path.startsWith("escape/") || f.path.endsWith(".pyi")));
    assert(!result.snapshot.analysis.resources.some(r=>r.path.startsWith("escape/")));
    assert(result.snapshot.diagnostics.some(d=>d.reason === "python-stub-implementation-unavailable"));
    assert.equal(result.snapshot.behavior.relations.filter(r=>r.relation==="calls").length,0);
  } finally {
    // Remove the junction itself before recursive cleanup; never traverse its target.
    rmdirSync(path.join(root,"escape"));
    for (const directory of [root,outside]) { assert(path.basename(directory).startsWith("cartograph FS05 ")); rmSync(directory,{recursive:true,force:true}); }
  }
});

test("FS05 neutral output rejects AST leakage, wrong hashes and fact/node budget overflow", () => {
  const bytes=Buffer.from("import local\n"), input=pythonSource(bytes);
  const site={file:"boundary.py",start:7,end:12,line:1,endLine:1,fileHash:input.hash,extractor:"python/syntax/fs-05/1",evidenceKind:"verified"};
  const entry={module:"local",name:null,alias:"local",site,star:false,topLevel:true,reexportable:true};
  const empty={behavior:{declarations:[],relations:[],gaps:[],handlers:[]},imports:[],exports:[],importedCalls:[],decorated:[],inheritance:[],all:null,visited:0};
  for (const count of [19999,20000]) assert.equal(validatePythonSyntax({...empty,imports:Array.from({length:count},()=>entry),visited:100000},"boundary.py",bytes).imports.length,count);
  assert.throws(()=>validatePythonSyntax({...empty,imports:Array.from({length:20001},()=>entry)},"boundary.py",bytes));
  assert.throws(()=>validatePythonSyntax({...empty,visited:100001},"boundary.py",bytes));
  assert.throws(()=>validatePythonSyntax({...empty,tree:{type:"module"}},"boundary.py",bytes));
  assert.throws(()=>validatePythonSyntax({...empty,imports:[{...entry,site:{...site,fileHash:"0".repeat(64)}}]},"boundary.py",bytes));
});

test("FS05 reopened Python generation is retained when parser startup fails", async () => {
  const root=mkdtempSync(path.join(os.tmpdir(),"cartograph FS05 retain "));
  try {
    writeFileSync(path.join(root,"main.py"),"def original():\n    pass\n");
    const previous=(await createComposedRefresh({host:path.resolve("src-tauri/target/debug/parser-host.exe")}).analyze(root,true)).snapshot;
    const unavailable=createComposedRefresh({host:path.join(root,"missing.exe"),previousSnapshot:()=>previous});
    await assert.rejects(unavailable.analyze(root,true),/parser-unavailable/);
    assert.equal(previous.files[0].path,"main.py"); assert.equal(previous.behavior.declarations[0].name,"original");
  } finally {assert(path.basename(root).startsWith("cartograph FS05 retain "));rmSync(root,{recursive:true,force:true});}
});

test("FS05 Python edits are watched through the shared protected refresh scheduler", async () => {
  const root=mkdtempSync(path.join(os.tmpdir(),"cartograph FS05 watch "));
  let refresh:RepositoryRefresh|undefined;
  try {
    writeFileSync(path.join(root,"main.py"),"def before():\n    pass\n");
    const driver=createComposedRefresh({host:path.resolve("src-tauri/target/debug/parser-host.exe")});
    let changed!:()=>void;
    const published=new Promise<void>(resolve=>{changed=resolve;});
    refresh=new RepositoryRefresh({analyze:()=>{throw Error("async only");},analyzeAsync:full=>driver.analyze(root,full),publish:snapshot=>{if(snapshot.behavior.declarations.some(d=>d.name==="after"))changed();},status:()=>{},debounceMs:10,auditMs:50});
    await refresh.runAsync(true);refresh.start();
    writeFileSync(path.join(root,"main.py"),"def after():\n    pass\n");
    let timeout:ReturnType<typeof setTimeout>|undefined;
    try {await Promise.race([published,new Promise<never>((_,reject)=>{timeout=setTimeout(()=>reject(Error("Python watcher timeout")),10000);})]);}
    finally {if(timeout)clearTimeout(timeout);}
  } finally {refresh?.close();assert(path.basename(root).startsWith("cartograph FS05 watch "));rmSync(root,{recursive:true,force:true});}
});

test("FS05 package/submodule attribute collisions cannot prove a callable export", async () => {
  const root=mkdtempSync(path.join(os.tmpdir(),"cartograph FS05 package-collision "));
  try{
    mkdirSync(path.join(root,"pkg"));
    writeFileSync(path.join(root,"pkg/__init__.py"),"def target():\n    pass\nimport pkg.target\ntarget()\n");
    writeFileSync(path.join(root,"pkg/target.py"),"# A module load can replace the package target attribute\n");
    writeFileSync(path.join(root,"caller.py"),"import pkg.target\nfrom pkg import target\ntarget()\n");
    const snapshot=(await createComposedRefresh({host:path.resolve("src-tauri/target/debug/parser-host.exe")}).analyze(root,true)).snapshot;
    assert.equal(snapshot.behavior.relations.filter(relation=>relation.relation==="calls").length,0);
    assert(snapshot.behavior.gaps.some(gap=>gap.reason==="package-attribute-submodule-boundary"));
    assert(snapshot.analysis.gaps.some(gap=>gap.reason==="ambiguous-target"&&gap.occurrence.file==="caller.py"));
    assert(snapshot.relationships.some(edge=>edge.source==="caller.py"&&edge.target==="pkg/target.py"));
  }finally{assert(path.basename(root).startsWith("cartograph FS05 package-collision "));rmSync(root,{recursive:true,force:true});}
});

test("FS05 cancellation cannot bypass retained neutral syntax reuse", async () => {
  const root=mkdtempSync(path.join(os.tmpdir(),"cartograph FS05 cached-cancel "));
  try{
    writeFileSync(path.join(root,"main.py"),"def original():\n    pass\n");
    const controller=new AbortController(),host=path.resolve("src-tauri/target/debug/parser-host.exe"),driver=createComposedRefresh({host,signal:controller.signal});
    const previous=(await driver.analyze(root,true)).snapshot;
    controller.abort();await assert.rejects(driver.analyze(root,false),/cancelled/);
    assert.deepEqual((await createComposedRefresh({host}).analyze(root,true)).snapshot,previous);
  }finally{assert(path.basename(root).startsWith("cartograph FS05 cached-cancel "));rmSync(root,{recursive:true,force:true});}
});

test("FS05 built-in and frozen imports cannot resolve to shadowing project files", async () => {
  const root=mkdtempSync(path.join(os.tmpdir(),"cartograph FS05 priority "));
  try {
    for(const name of ["sys","builtins","os"])writeFileSync(path.join(root,name+".py"),"def target():\n    pass\n");
    writeFileSync(path.join(root,"main.py"),"from sys import target\nfrom builtins import target as second\nimport os\ntarget()\nsecond()\n");
    const snapshot=(await createComposedRefresh({host:path.resolve("src-tauri/target/debug/parser-host.exe")}).analyze(root,true)).snapshot;
    assert.equal(snapshot.relationships.filter(edge=>edge.source==="main.py").length,0);
    assert.equal(snapshot.behavior.relations.filter(edge=>edge.relation==="calls").length,0);
    for(const name of ["sys","builtins","os"]) assert.equal(snapshot.coverage.external[name],1);
  } finally {assert(path.basename(root).startsWith("cartograph FS05 priority "));rmSync(root,{recursive:true,force:true});}
});
