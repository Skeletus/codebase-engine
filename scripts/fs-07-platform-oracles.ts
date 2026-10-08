import assert from "node:assert/strict";
import {readFileSync, writeFileSync} from "node:fs";
import {createHash} from "node:crypto";
import vm from "node:vm";
import {createRequire} from "node:module";
import path from "node:path";
import type {FlowParser} from "../lib/engine/adapters/flow-syntax.ts";

// Execute only the approved framework-owned select expression, with controlled
// data in a VM. Never import RN native modules, an application or customer config.
const require = createRequire(import.meta.url), hermes = require("hermes-parser") as FlowParser;
type Ast = {type: string; range: [number,number]; [key: string]: unknown};
const isNode = (v: unknown): v is Ast => !!v && typeof v === "object" && "type" in v && "range" in v;
const bytes = readFileSync("tests/fixtures/framework-support/F07-rn/platform.json"), fixture = JSON.parse(bytes.toString()) as {cases: {id:string; spec: Record<string,string>}[]};
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
for (const tuple of ["rn83-bare", "rn85-bare", "expo55", "expo56"]) for (const platform of ["android", "ios"]) {
  const root = path.resolve("node_modules/.fs07-experiments/oracles", tuple, "node_modules/react-native"), pkg = JSON.parse(readFileSync(path.join(root,"package.json"),"utf8")) as {version:string};
  const source = readFileSync(path.join(root,"Libraries/Utilities/Platform."+platform+".js"),"utf8"), ast = hermes.parse(source,{flow:"all",enableExperimentalComponentSyntax:true});
  let body: Ast | undefined;
  const pending: unknown[] = [ast];
  while (pending.length) {
    const n = pending.pop(); if (!isNode(n)) continue;
    if (n.type === "Property" && isNode(n.key) && n.key.name === "select" && isNode(n.value) && n.value.type === "ArrowFunctionExpression" && isNode(n.value.body)) body = n.value.body;
    for (const key of hermes.FlowVisitorKeys[n.type] ?? []) {const child=n[key]; if(Array.isArray(child))pending.push(...child);else pending.push(child);}
  }
  assert(body); const expression=source.slice(body.range[0],body.range[1]);
  const outputs=fixture.cases.map(c=>({id:c.id,selected:vm.runInNewContext("("+expression+")",{spec:structuredClone(c.spec)},{timeout:1000}) ?? null}));
  writeFileSync(`docs/fs-07/evidence/${tuple}-${platform}-platform.json`,JSON.stringify({tuple,platform,rnVersion:pkg.version,sourceHash:hash(source),expressionHash:hash(expression),fixtureHash:hash(bytes),outputHash:hash(JSON.stringify(outputs)),outputs,inspectedExecution:false,scope:"approved framework-owned select expression only"},null,2)+"\n");
}
console.log("PASS eight independent RN Platform.select oracles");
