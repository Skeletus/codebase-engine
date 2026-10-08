import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createMetroResolver, type MetroPackage } from "../../lib/parser/adapters/metro-resolution.ts";
import { GenerationBoundary } from "../../lib/engine/boundary.ts";
import { createRequire } from "node:module";
import { extractFlow, type FlowParser } from "../../lib/engine/adapters/flow-syntax.ts";
import { validateFlowSyntax } from "../../lib/engine/adapters/flow-contract.ts";
import { FlowParserWorker, PythonParserWorker } from "../../lib/engine/parser-worker.ts";
import path from "node:path";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { createTypescriptRefresh } from "../../lib/engine/adapters/typescript.ts";
import { serializeSnapshot, deserializeSnapshot } from "../../lib/engine/contract.ts";
import { readWitnessEvidence } from "../../lib/engine/index.ts";
import { createComposedRefresh } from "../../lib/engine/adapters/composed.ts";
import { flowPragma } from "../../lib/parser/flow-dialect.ts";

const bytes = readFileSync(new URL("../fixtures/framework-support/F07-rn/metro.json", import.meta.url));
const fixture = JSON.parse(bytes.toString()) as {files: string[]; packages: MetroPackage[]; links: Record<string, string>; sourceExts: string[]; cases: {id: string; specifier: string; isImport?: boolean}[]};
const digest = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");
test("Flow dialect selection accepts leading pragmas only", () => {
  for (const text of ["// @flow\nfunction f(){}", "\uFEFF#!/usr/bin/env node\n/* @flow strict */\nfunction f(){}", "/* first */\n// @flow\n"]) assert(flowPragma(text));
  for (const text of ["const text='@flow';", "function f(){} // @flow", "// @noflow\n// @flow", "/* unterminated @flow"]) assert(!flowPragma(text));
});
test("Flow shared pipeline: neutral facts, safe unresolved imports, cache and full equivalence", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "cartograph FS07 "));
  try {
    writeFileSync(path.join(root, "package.json"), JSON.stringify({dependencies: {"react-native": "0.83.10", react: "19.2.0", metro: "0.83.8", "@react-navigation/native": "7.5.0", "@react-navigation/native-stack": "7.20.0"}}));
    const text = "\uFEFF// @flow\r\nimport {foreign} from './missing';\r\nexport function local(x:number){return x;}\r\nexport function caller(){local(1);foreign();}\r\n";
    writeFileSync(path.join(root, "Flow.js"), text);
    writeFileSync(path.join(root, "ordinary.ts"), "export function ordinary(){}\n");
    const options = {host: path.resolve("src-tauri/target/debug/parser-host.exe")};
    const refresh = createComposedRefresh(options), first = await refresh.analyze(root, true);
    const s = first.snapshot;
    assert(s.files.some(f => f.path === "Flow.js")); assert(s.files.some(f => f.path === "ordinary.ts"));
    assert.equal(s.coverage.files.parsed, 2); assert.equal(s.coverage.files.skipped, 0);
    assert(!s.diagnostics.some(d => d.reason === "flow-session-required"));
    assert(s.analysis.projects.some(p => p.languages.includes("flow") && p.extractors.includes("flow/fs-07/1")));
    const calls = s.behavior.relations.filter(r => r.relation === "calls" && r.site.file === "Flow.js");
    assert.equal(calls.length, 1); assert.equal(s.behavior.declarations.find(d => d.id === calls[0].target)?.name, "local");
    assert(s.behavior.gaps.some(g => g.reason === "flow-imported-call-unqualified"));
    assert.equal(s.files.find(f => f.path === "Flow.js")!.hash, digest(Buffer.from(text)));
    assert.deepEqual(deserializeSnapshot(serializeSnapshot(s)), s);
    const cached = await refresh.analyze(root, false); assert(cached.reused >= 1); assert.deepEqual(cached.snapshot, s);
    writeFileSync(path.join(root, "Flow.js"), text.replace("local(1)", "local(2)"));
    assert.deepEqual((await refresh.analyze(root, false)).snapshot, (await createComposedRefresh(options).analyze(root, true)).snapshot);
  } finally { assert(path.basename(root).startsWith("cartograph FS07 ")); rmSync(root, {recursive: true, force: true}); }
});
function resolver(platform: "android" | "ios", customResolver = false, budget?: GenerationBoundary) {
  return createMetroResolver({files: new Set(fixture.files), packages: fixture.packages, packageLinks: new Map(Object.entries(fixture.links))}, {platform, sourceExts: fixture.sourceExts, assetExts: new Set(["png"]), mainFields: ["react-native", "browser", "main"], conditions: ["react-native"], exportsEnabled: true, preferNativePlatform: true, customResolver}, budget);
}
for (const tuple of ["rn83-bare", "rn85-bare", "expo55", "expo56"]) for (const platform of ["android", "ios"] as const) test(`Metro static kernel ${tuple}/${platform}: pinned synthetic oracle parity`, () => {
  const oracle = JSON.parse(readFileSync(new URL(`../../docs/fs-07/evidence/${tuple}-${platform}-metro.json`, import.meta.url), "utf8")) as {tuple: string; versions: Record<string, string>; resolverVersion: string; resolverEntryHash: string; platform: string; fixtureHash: string; outputHash: string; outputs: {id: string; type: string; targets: string[]}[]; warnings: string[]; configExecution: boolean; applicationExecution: boolean};
  assert.equal(oracle.tuple, tuple); assert.equal(oracle.platform, platform);
  const manifest = JSON.parse(readFileSync(new URL("../../docs/fs-00/support-manifest.json", import.meta.url), "utf8")) as {tuples: {id: string; versions: Record<string, string>}[]};
  assert.deepEqual(oracle.versions, manifest.tuples.find(t => t.id === tuple)!.versions);
  assert.equal(oracle.resolverVersion, tuple === "rn85-bare" ? "0.84.6" : tuple === "expo56" ? "0.84.5" : "0.83.8");
  assert.match(oracle.resolverEntryHash, /^[a-f0-9]{64}$/);
  assert.equal(oracle.fixtureHash, digest(bytes)); assert.equal(oracle.outputHash, digest(JSON.stringify(oracle.outputs)));
  assert.deepEqual(oracle.warnings, []); assert.equal(oracle.configExecution, false); assert.equal(oracle.applicationExecution, false);
  const profile = resolver(platform);
  for (const c of fixture.cases) {
    const actual = profile.resolve("index.js", c.specifier, c.isImport !== false);
    const expected = oracle.outputs.find(o => o.id === c.id)!;
    assert(expected, c.id);
    assert.equal(actual.state, expected.type === "empty" ? "empty" : "resolved", c.id);
    if (actual.state === "resolved") { assert.deepEqual(actual.targets, expected.targets, c.id); assert.equal(actual.category, expected.type === "assetFiles" ? "asset" : "module", c.id); }
  }
  assert.deepEqual(profile.resolve("index.js", "./src/Choice"), {state: "resolved", targets: [`src/Choice.${platform}.js`], category: "module", rule: "metro/source-extension-platform"});
});
test("Metro static kernel: policy, custom resolver and missing exports targets stay explicit", () => {
  const normal = resolver("ios");
  for (const specifier of ["../../outside", "C:/outside", "/outside", "./src/../node_modules/secret", "./private\\file", "./bad\0file"]) assert.deepEqual(normal.resolve("index.js", specifier), {state: "boundary", reason: "policy-denied"});
  assert.deepEqual(normal.resolve("not-authorized.js", "./src/Choice"), {state: "boundary", reason: "policy-denied"});
  assert.deepEqual(normal.resolve("index.js", "external"), {state: "boundary", reason: "external-boundary"});
  assert.deepEqual(normal.resolve("index.js", "dep/not-exported"), {state: "boundary", reason: "unsupported-syntax"});
  assert.deepEqual(normal.resolve("index.js", "#private"), {state: "boundary", reason: "unsupported-syntax"});
  assert.deepEqual(resolver("android", true).resolve("index.js", "./src/Choice"), {state: "boundary", reason: "custom-resolver"});
  const files = new Set(fixture.files.filter(f => f !== "packages/dep/import.js"));
  const profile = createMetroResolver({files, packages: fixture.packages, packageLinks: new Map(Object.entries(fixture.links))}, {platform: "android", sourceExts: fixture.sourceExts, assetExts: new Set(), mainFields: ["main"], conditions: ["react-native"], exportsEnabled: true, preferNativePlatform: true, customResolver: false});
  assert.deepEqual(profile.resolve("index.js", "dep"), {state: "boundary", reason: "missing-metadata"});
});
test("Metro static kernel: cooperative cancellation and deadline remain enforced", () => {
  const controller = new AbortController(); controller.abort();
  assert.throws(() => resolver("android", false, new GenerationBoundary(controller.signal)).resolve("index.js", "./src/Choice"), /cancelled/);
  assert.throws(() => resolver("ios", false, new GenerationBoundary(undefined, 0)).resolve("index.js", "./src/Choice"), /resource-limit/);
  assert.throws(() => createMetroResolver({files: new Set(Array.from({length: 20001}, (_, i) => `src/${i}.js`)), packages: [], packageLinks: new Map()}, {platform: "ios", sourceExts: ["js"], assetExts: new Set(), mainFields: ["main"], conditions: [], exportsEnabled: true, preferNativePlatform: true, customResolver: false}), /resource-limit/);
});
test("Flow syntax experiment: pinned grammar records preserve original BOM/CRLF/Unicode offsets", () => {
  const fixtureBytes = readFileSync(new URL("../fixtures/framework-support/F07-rn/flow.json", import.meta.url));
  const f = JSON.parse(fixtureBytes.toString()) as {cases: {id: string; source: string; requiredTypes?: string[]; error?: boolean}[]};
  const record = JSON.parse(readFileSync(new URL("../../docs/fs-07/evidence/hermes-syntax-experiment.json", import.meta.url), "utf8")) as {parser: string; fixtureHash: string; outputHash: string; outputs: {id: string; sourceHash: string; outcome: string; elapsedMs: number; nodes: {type: string; start: number; end: number; text: string; line: number}[]}[]; scopeQualification: boolean; productionSupervisionQualification: boolean};
  assert.equal(record.parser, "hermes-parser@0.25.1"); assert.equal(record.fixtureHash, digest(fixtureBytes));
  assert.equal(record.outputHash, digest(JSON.stringify(record.outputs.map(({elapsedMs, ...o}) => { void elapsedMs; return o; }))));
  assert.equal(record.scopeQualification, false); assert.equal(record.productionSupervisionQualification, false);
  for (const c of f.cases) {
    const output = record.outputs.find(o => o.id === c.id)!; assert(output); assert.equal(output.sourceHash, digest(c.source));
    assert.equal(output.outcome, c.error ? "parse-error" : "parsed");
    for (const type of c.requiredTypes ?? []) assert(output.nodes.some(n => n.type === type));
    for (const n of output.nodes) assert.equal(c.source.slice(n.start, n.end), n.text);
    if (c.id === "position") { const call = output.nodes.find(n => n.type === "CallExpression")!; assert.equal(call.start, c.source.indexOf("helper(1)")); assert.equal(call.line, 4); }
  }
});
const hermes = createRequire(import.meta.url)("hermes-parser") as FlowParser;
for (const tuple of ["rn83-bare", "rn85-bare", "expo55", "expo56"]) for (const platform of ["android", "ios"] as const) test(`Metro default-context kernel ${tuple}/${platform}: source-backed defaults oracle parity`, () => {
  const defaults = JSON.parse(readFileSync(new URL(`../../docs/fs-07/evidence/${tuple}-metro-defaults.json`, import.meta.url), "utf8")) as {outputHash: string; output: {sourceExts: string[]; assetExts: string[]; resolverMainFields: string[]; unstable_conditionNames: string[]; unstable_conditionsByPlatform: Record<string, string[]>; unstable_enablePackageExports: boolean}};
  const oracle = JSON.parse(readFileSync(new URL(`../../docs/fs-07/evidence/${tuple}-${platform}-metro-defaults-oracle.json`, import.meta.url), "utf8")) as {defaultsHash: string; fixtureHash: string; outputHash: string; outputs: {id: string; type: string; targets: string[]}[]; warnings: string[]};
  assert.equal(defaults.outputHash, digest(JSON.stringify(defaults.output))); assert.equal(oracle.defaultsHash, defaults.outputHash);
  assert.equal(oracle.fixtureHash, digest(bytes)); assert.equal(oracle.outputHash, digest(JSON.stringify(oracle.outputs))); assert.deepEqual(oracle.warnings, []);
  const settings = defaults.output;
  const profile = createMetroResolver({files: new Set(fixture.files), packages: fixture.packages, packageLinks: new Map(Object.entries(fixture.links))}, {platform, sourceExts: settings.sourceExts, assetExts: new Set(settings.assetExts), mainFields: settings.resolverMainFields, conditions: [...settings.unstable_conditionNames, ...settings.unstable_conditionsByPlatform[platform] ?? []], exportsEnabled: settings.unstable_enablePackageExports, preferNativePlatform: true, customResolver: false});
  for (const c of fixture.cases) {
    const actual = profile.resolve("index.js", c.specifier, c.isImport !== false), expected = oracle.outputs.find(o => o.id === c.id)!;
    assert.equal(actual.state, expected.type === "empty" ? "empty" : "resolved", c.id);
    if (actual.state === "resolved") assert.deepEqual(actual.targets, expected.targets, c.id);
  }
  const choice = profile.resolve("index.js", "./src/Choice"); assert.equal(choice.state, "resolved");
  if (choice.state === "resolved") assert.deepEqual(choice.targets, tuple.startsWith("expo") ? ["src/Choice.ts"] : [`src/Choice.${platform}.js`]);
});
test("Flow neutral extraction: lexical functions, immutable aliases and import requests are distinct", () => {
  const source = "// @flow\nimport {external as remote} from './external'; export function helper(x:number):number {return x;} const alias=helper; export function outer(){alias(1);remote(2);}\n";
  const result = extractFlow(hermes, "source.js", Buffer.from(source));
  assert.deepEqual(validateFlowSyntax(result, "source.js", Buffer.from(source)), result);
  const helper = result.behavior.declarations.find(d => d.name === "helper")!;
  const outer = result.behavior.declarations.find(d => d.name === "outer")!;
  const call = result.behavior.relations.find(r => r.relation === "calls")!;
  assert.equal(call.source, outer.id); assert.equal(call.target, helper.id); assert.equal(source.slice(call.site.start, call.site.end), "alias(1)");
  assert.deepEqual(result.exports.map(e => e.name), ["helper", "outer"]);
  assert.equal(result.imports[0].alias, "remote"); assert.equal(result.importedCalls[0].module, "./external"); assert.equal(result.importedCalls[0].name, "external");
  assert.equal(result.behavior.relations.filter(r => r.relation === "calls").length, 1);
});
test("Flow neutral protocol rejects AST leakage, forged source ranges, owners and imported targets", () => {
  const source = Buffer.from("// @flow\nimport {remote} from './external'; function helper(){remote();}\n");
  const syntax = extractFlow(hermes, "source.js", source);
  assert.deepEqual(validateFlowSyntax(syntax, "source.js", source), syntax);
  assert.throws(() => validateFlowSyntax({...syntax, ast: {}}, "source.js", source));
  for (const mutate of [
    (copy: typeof syntax) => { copy.behavior.declarations[0].site.fileHash = "0".repeat(64); },
    (copy: typeof syntax) => { copy.behavior.declarations[0].site.start = 100000; },
    (copy: typeof syntax) => { copy.importedCalls[0].source = "invented"; },
    (copy: typeof syntax) => { copy.importedCalls[0].module = "invented"; },
  ]) { const copy = structuredClone(syntax); mutate(copy); assert.throws(() => validateFlowSyntax(copy, "source.js", source)); }
});
test("Flow supervised parser: neutral fixture parity, Python shared lease and malformed recovery", {timeout: 30000, skip: process.platform !== "win32"}, async () => {
  const host = path.resolve("src-tauri/target/debug/parser-host.exe"), worker = new FlowParserWorker(host);
  const f = JSON.parse(readFileSync(new URL("../fixtures/framework-support/F07-rn/flow.json", import.meta.url), "utf8")) as {cases: {id: string; source: string; error?: boolean}[]};
  try {
    await worker.start();
    const other = new PythonParserWorker(host);
    await assert.rejects(other.start(), /parser-unavailable/); await other.close();
    for (const c of f.cases) if (c.error) await assert.rejects(worker.parse(c.id + ".js", Buffer.from(c.source)), /parse-error/);
    else assert.deepEqual(await worker.parse(c.id + ".js", Buffer.from(c.source)), extractFlow(hermes, c.id + ".js", Buffer.from(c.source)));
    await assert.rejects(worker.parse("bad.js", Buffer.from([0xff])), /unsupported-encoding/);
    assert((await worker.parse("again.js", Buffer.from("// @flow\nfunction helper(){}"))).behavior.declarations.length);
  } finally { await worker.close(); }
  const python = new PythonParserWorker(host);
  try { await python.start(); assert((await python.parse("healthy.py", Buffer.from("def helper():\n    pass\n"))).behavior.declarations.length); } finally { await python.close(); }
});
test("Flow supervised parser: cancellation releases lease and a new worker recovers", {timeout: 20000, skip: process.platform !== "win32"}, async () => {
  const host = path.resolve("src-tauri/target/debug/parser-host.exe"), controller = new AbortController(), worker = new FlowParserWorker(host, controller.signal);
  try {
    await worker.start();
    const pending = worker.parse("large.js", Buffer.from("// @flow\nconst values=[" + Array.from({length: 30000}, () => "0").join(",") + "];"));
    controller.abort(); await assert.rejects(pending, /cancelled/);
  } finally { await worker.close(); }
  const recovered = new FlowParserWorker(host);
  try { await recovered.start(); assert((await recovered.parse("okay.js", Buffer.from("// @flow\nfunction okay(){}"))).behavior.declarations.length); } finally { await recovered.close(); }
});
test("Metro production profile: platform dependencies/assets retain shared witnesses and incremental equivalence", () => {
  const root = mkdtempSync(path.join(tmpdir(), "cartograph FS07 "));
  const sources: Record<string, string> = {
    "package.json": JSON.stringify({name: "controlled-rn", dependencies: {"react-native": "0.83.10", react: "19.2.0", metro: "0.83.8", "@react-navigation/native": "7.5.0", "@react-navigation/native-stack": "7.20.0"}}),
    "index.ts": "import {choice} from './src/Choice'; const logo=require('./src/logo.png'); export function entry(){return choice();}\n",
    "src/Choice.android.js": "export function choice(){return 'android';}\n",
    "src/Choice.ios.js": "export function choice(){return 'ios';}\n",
    "src/Choice.ts": "export function choice(){return 'plain';}\n",
    "src/logo.png": "synthetic image bytes", "src/logo@2x.png": "synthetic density bytes",
  };
  try {
    for (const [file, text] of Object.entries(sources)) { mkdirSync(path.dirname(path.join(root, file)), {recursive: true}); writeFileSync(path.join(root, file), text); }
    const driver = createTypescriptRefresh({metroModes: ["android-development", "ios-development"]}), snapshot = driver.analyze(root, true).snapshot;
    for (const platform of ["android", "ios"]) {
      const variant = snapshot.analysis.variants.find(v => v.platform === platform && v.profileId.includes("fs-07/1"))!; assert(variant);
      const dependencies = snapshot.analysis.bindings.filter(b => b.variantId === variant.id && b.kind === "module-dependency");
      assert(dependencies.some(b => b.targetId === `src/Choice.${platform}.js`));
      assert(!dependencies.some(b => b.targetId === `src/Choice.${platform === "ios" ? "android" : "ios"}.js`));
      assert.equal(snapshot.analysis.bindings.filter(b => b.variantId === variant.id && b.kind === "asset").length, 2);
      for (const binding of snapshot.analysis.bindings.filter(b => b.variantId === variant.id)) for (const witness of binding.witnesses) assert(["current", "rule"].includes(readWitnessEvidence(snapshot, witness).state));
      assert(snapshot.analysis.gaps.some(g => g.variantId === variant.id && g.occurrence.file === "index.ts")); // Legacy plain call is not promoted into this differing runtime.
    }
    assert.deepEqual(deserializeSnapshot(serializeSnapshot(snapshot)), snapshot);
    assert.deepEqual(driver.analyze(root, false).snapshot, snapshot);
    writeFileSync(path.join(root, "src/Choice.ios.js"), "export function choice(){return 'changed';}\n");
    assert.deepEqual(driver.analyze(root, false).snapshot, createTypescriptRefresh({metroModes: ["android-development", "ios-development"]}).analyze(root, true).snapshot);
  } finally { assert(path.basename(root).startsWith("cartograph FS07 ")); rmSync(root, {recursive: true, force: true}); }
});
test("RN shared React projection: AppRegistry, composition, native events, effects and context stay distinct from calls", () => {
  const root = mkdtempSync(path.join(tmpdir(), "cartograph FS07 "));
  const sources = {
    "package.json": JSON.stringify({name: "controlled-rn", dependencies: {"react-native": "0.83.10", react: "19.2.0", metro: "0.83.8", "@react-navigation/native": "7.5.0", "@react-navigation/native-stack": "7.20.0"}}),
    "index.ts": "import {AppRegistry} from 'react-native'; import App from './App'; AppRegistry.registerComponent('Controlled',()=>App);\n",
    "App.tsx": "import {Pressable,Text} from 'react-native'; import {createContext,useContext,useEffect,memo} from 'react'; export const Ctx=createContext(null); export function Child(){return <Text/>;} export function handle(){} export function cleanup(){} const Memo=memo(Child); export default function App(){useEffect(()=>{handle();return ()=>cleanup();},[]);useContext(Ctx);return <Ctx.Provider value={null}><Pressable onPress={handle}><Memo/><Child/></Pressable></Ctx.Provider>;}\n",
  };
  try {
    for (const [file, text] of Object.entries(sources)) writeFileSync(path.join(root, file), text);
    const s = createTypescriptRefresh({metroModes: ["android-development", "ios-development"]}).analyze(root, true).snapshot;
    for (const variant of s.analysis.variants.filter(v => v.profileId.includes("fs-07/1"))) {
      const bindings = s.analysis.bindings.filter(b => b.variantId === variant.id);
      const rules = bindings.flatMap(b => b.witnesses.filter(w => w.role === "framework-rule").map(w => w.ruleId));
      for (const rule of ["rn/app-registry-provider:Controlled", "rn/native-ui-event:Pressable:onPress", "react/jsx", "react/memo", "react/useEffect/callback", "react/context-provider", "react/context-consumer"]) assert(rules.includes(rule), rule);
      const event = bindings.find(b => b.kind === "event-handler")!;
      assert.equal(s.behavior.declarations.find(d => d.id === event.targetId)?.name, "handle");
      assert(!s.analysis.gaps.some(g => g.variantId === variant.id && g.occurrence.start === event.occurrence.start && g.occurrence.file === event.occurrence.file));
      const entry = bindings.find(b => b.kind === "entry-point")!; assert.equal(s.behavior.declarations.find(d => d.id === entry.targetId)?.name, "App");
      for (const binding of bindings) for (const witness of binding.witnesses) assert(["current", "rule"].includes(readWitnessEvidence(s, witness).state));
    }
    assert(s.behavior.relations.some(r => r.relation === "calls" && s.behavior.declarations.find(d => d.id === r.target)?.name === "handle"));
    assert(!s.behavior.relations.some(r => r.relation === "calls" && r.site.file === "index.ts"));
    writeFileSync(path.join(root, "index.ts"), "import {AppRegistry} from 'react-native';import App from './App';AppRegistry.registerComponent(name,()=>App);\n");
    const dynamic = createTypescriptRefresh().analyze(root, true).snapshot;
    assert(!dynamic.analysis.bindings.some(b => b.kind === "entry-point")); assert(dynamic.analysis.gaps.some(g => g.reason === "dynamic-expression" && g.occurrence.file === "index.ts"));
    writeFileSync(path.join(root, "App.tsx"), sources["App.tsx"].replace("onPress={handle}", "onPress={handle} {...props}"));
    assert(!createTypescriptRefresh().analyze(root, true).snapshot.analysis.bindings.some(b => b.kind === "event-handler"));
  } finally { assert(path.basename(root).startsWith("cartograph FS07 ")); rmSync(root, {recursive: true, force: true}); }
});
test("Flow neutral extraction: parameter shadowing, mutations, eval and receiver dispatch never guess calls", () => {
  for (const source of [
    "function helper(){} function outer(helper:number){helper();}",
    "function helper(){} helper = other; function outer(){helper();}",
    "function helper(){} function outer(){eval('helper = other');helper();}",
    "function helper(){} function outer(receiver:unknown){receiver.helper();}",
    "function helper(){} function outer(){alias(); const alias=helper;}",
    "import type {helper} from './external'; function outer(){helper();}",
  ]) {
    const result = extractFlow(hermes, "source.js", Buffer.from("// @flow\n" + source));
    assert.equal(result.behavior.relations.filter(r => r.relation === "calls").length, 0, source);
    assert.equal(result.importedCalls.length, 0, source); assert(result.behavior.gaps.length, source);
  }
});
test("Flow neutral extraction: component/hook scopes, JSX calls, conditional evidence and original coordinates", () => {
  const source = "\uFEFF// @flow\r\nconst emoji='😀é';\r\nfunction helper(x:number){return x;}\r\nhook useValue(value:number){return helper(value);}\r\ncomponent Screen(title:number){return <Text>{helper(title)}</Text>;}\r\nfunction outer(){if(flag){helper(1);}}\r\n";
  const result = extractFlow(hermes, "source.js", Buffer.from(source));
  assert.deepEqual(validateFlowSyntax(result, "source.js", Buffer.from(source)), result);
  assert.equal(result.behavior.relations.filter(r => r.relation === "calls").length, 3);
  const last = result.behavior.relations.find(r => r.relation === "calls" && r.conditional)!;
  assert.equal(source.slice(last.site.start, last.site.end), "helper(1)"); assert.equal(last.site.line, 6);
  for (const d of result.behavior.declarations) assert(d.site.end <= source.length);
  assert(result.behavior.declarations.some(d => d.name === "Screen" && d.kind === "function"));
  assert(result.behavior.declarations.some(d => d.name === "useValue" && d.kind === "function"));
  assert.throws(() => extractFlow(hermes, "bad.js", Buffer.from("function broken(x:number {}")));
  assert.throws(() => extractFlow(hermes, "bad.js", Buffer.from([0xff])), /unsupported-encoding/);
  assert.throws(() => extractFlow(hermes, "big.js", Buffer.alloc(1048577)), /resource-limit/);
});
