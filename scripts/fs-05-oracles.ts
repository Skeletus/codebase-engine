import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { PythonParserWorker, ParserWorkerError } from "../lib/engine/parser-worker.ts";

// Explicit developer command only. Controlled JSON strings are parsed, never run.
const fixturePath = "tests/fixtures/framework-support/F05-python/syntax.json";
const fixtureBytes = readFileSync(fixturePath);
const fixture = JSON.parse(fixtureBytes.toString("utf8")) as { cases: { id: string; valid: boolean; source: string }[] };
const oracle = `import ast,json,sys
records=json.loads(sys.stdin.buffer.read())
out=[]
for case in records:
    data=case['source'].encode('utf-8')
    try:
        tree=ast.parse(data)
        text=data.decode('utf-8-sig')
        lines=text.splitlines(keepends=True)
        def offset(line,col):
            prefix=''.join(lines[:line-1])+lines[line-1].encode('utf-8')[:col].decode('utf-8')
            return len(prefix.encode('utf-16-le'))//2+(1 if data.startswith(b'\\xef\\xbb\\xbf') else 0)
        declarations=[]
        for node in ast.walk(tree):
            if isinstance(node,(ast.FunctionDef,ast.AsyncFunctionDef,ast.ClassDef)):
                declarations.append(dict(name=node.name,start=offset(node.lineno,node.col_offset),end=offset(node.end_lineno,node.end_col_offset)))
        out.append(dict(id=case['id'],valid=True,declarations=declarations))
    except (SyntaxError,UnicodeError,LookupError): out.append(dict(id=case['id'],valid=False,declarations=[]))
print(json.dumps(dict(version='.'.join(map(str,sys.version_info[:3])),records=out)))`;
const versions = [{ id: "python31215", version: "3.12.15", executable: "node_modules/.fs05-experiments/Python-3.12.15/PCbuild/amd64/python.exe" }, { id: "python31316", version: "3.13.16", executable: "node_modules/.fs05-experiments/cpython31316/python.exe" }];
const worker = new PythonParserWorker(path.resolve("src-tauri/target/debug/parser-host.exe"));
const results = [];
try {
  await worker.start();
  for (const tuple of versions) {
    const output = execFileSync(path.resolve(tuple.executable), ["-I", "-S", "-c", oracle], { input: JSON.stringify(fixture.cases), timeout: 10000 });
    const observed = JSON.parse(output.toString("utf8")) as { version: string; records: { id: string; valid: boolean; declarations: { name: string; start: number; end: number }[] }[] };
    assert.equal(observed.version, tuple.version);
    const records = [];
    for (const c of fixture.cases) {
      const expected = observed.records.find(r => r.id === c.id)!; assert.equal(expected.valid, c.valid);
      try {
        const syntax = await worker.parse(c.id + ".py", Buffer.from(c.source));
        const parseError = syntax.behavior.gaps.some(g => g.reason === "parse-error"); assert.equal(!parseError, c.valid, c.id);
        const actual = syntax.behavior.declarations.filter(d => ["function", "method", "class"].includes(d.kind)).map(d => ({ name: d.name.normalize("NFKC"), start: d.site.start, end: d.site.end })).sort((a,b) => a.start-b.start || a.end-b.end);
        assert.deepEqual(actual, [...expected.declarations].sort((a,b) => a.start-b.start || a.end-b.end), c.id + ": exact declarations and original-source positions");
        records.push({ id: c.id, status: "PASS", sourceHash: createHash("sha256").update(c.source).digest("hex"), outputHash: createHash("sha256").update(JSON.stringify(syntax)).digest("hex"), declarations: expected.declarations.length });
      } catch (error) {
        if (!c.valid && error instanceof ParserWorkerError && error.reason === "unsupported-encoding") records.push({ id: c.id, status: "PASS", boundary: error.reason });
        else throw error;
      }
    }
    results.push({ tuple: tuple.id, python: observed.version, profile: "static-python-declared-environment", parser: "web-tree-sitter@0.25.10", grammar: "tree-sitter-python@0.25.0", abi: 15, executableHash: createHash("sha256").update(readFileSync(tuple.executable)).digest("hex"), fixtureHash: createHash("sha256").update(fixtureBytes).digest("hex"), oracleOutputHash: createHash("sha256").update(output).digest("hex"), records });
  }
  writeFileSync("docs/fs-05/evidence/syntax-oracles.json", JSON.stringify(results, null, 2) + "\n");
  process.stdout.write(JSON.stringify(results.map(r => ({ tuple: r.tuple, cases: r.records.length, status: "PASS" }))) + "\n");
} finally { worker.close(); }

