import { extractDjango } from "./django-syntax.ts";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { extractPython } from "./python-syntax.ts";

const require = createRequire(import.meta.url);
let buffer = Buffer.alloc(0), assigned = false, ready = false, processing = false;
function emit(value: unknown) { const bytes = Buffer.from(JSON.stringify(value) + "\n"); if (bytes.length > 8 * 1024 * 1024) { process.stdout.write('{"version":1,"error":"resource-limit"}\n'); return; } process.stdout.write(bytes); }
globalThis.fetch = () => { throw new Error("network-denied"); };
console.log = () => { throw new Error("protocol-only"); };
let parser: import("web-tree-sitter").Parser;
async function startup() {
  const runtime = require.resolve("web-tree-sitter/tree-sitter.wasm"), grammar = path.resolve(import.meta.dirname, "../assets/python/tree-sitter-python.wasm");
  for (const [file, expected] of [[runtime, "f38dcc4b43b818f9a0785bc1c6d5611a75ac4cdd428ff3f02757c34ca4e46d7f"], [path.join(path.dirname(runtime), "tree-sitter.js"), "d4fc466df6358055253bc4cdaab23cdf84fe00741fa5a4ff56506c06c533da42"], [grammar, "16108b50df4ee9a30168794252ab55e7c93bfc5765d7fa0aa3e335752c515f47"]]) if (createHash("sha256").update(readFileSync(file)).digest("hex") !== expected) throw new Error("parser-unavailable");
  // Load the exact ESM entry whose bytes were verified above; package export
  // conditions cannot redirect execution to an unchecked runtime entry.
  const { Parser, Language }: typeof import("web-tree-sitter") = await import(pathToFileURL(path.join(path.dirname(runtime), "tree-sitter.js")).href);
  await Parser.init({ locateFile: () => runtime });
  const language = await Language.load(readFileSync(grammar)); if (language.abiVersion !== 15) throw new Error("parser-unavailable");
  parser = new Parser(); parser.setLanguage(language); ready = true; emit({ version: 1, ready: true, abi: 15 }); consume();
}
function consume() {
  if (!ready || processing) return;
  processing = true;
  try {
    while (buffer.length >= 4) {
      const headerBytes = buffer.readUInt32BE(0); if (headerBytes > 4096) throw new Error("invalid-frame");
      if (buffer.length < 4 + headerBytes) return;
      const header: unknown = JSON.parse(buffer.subarray(4, 4 + headerBytes).toString("utf8"));
      if (!header || typeof header !== "object" || Array.isArray(header)) throw new Error("invalid-frame");
      const h = header as Record<string, unknown>;
      if (h.version !== 1 || typeof h.file !== "string" || !h.file || h.file.length > 4096 || !Number.isSafeInteger(h.bytes) || typeof h.bytes !== "number" || h.bytes < 0 || h.bytes > 1048576 || h.operation !== undefined && h.operation !== "django" || Object.keys(h).some(k => !["version", "file", "bytes", "operation"].includes(k))) throw new Error("invalid-frame");
      if (buffer.length < 4 + headerBytes + h.bytes) return;
      const source = buffer.subarray(4 + headerBytes, 4 + headerBytes + h.bytes); buffer = buffer.subarray(4 + headerBytes + h.bytes);
      try { emit({ version: 1, result: h.operation === "django" ? extractDjango(parser, h.file, source) : extractPython(parser, h.file, source) }); } catch (error) { parser.reset(); emit({ version: 1, error: error instanceof Error && ["resource-limit", "unsupported-encoding"].includes(error.message) ? error.message : "parse-error" }); }
    }
  } finally { processing = false; }
}
process.stdin.on("data", (chunk: Buffer) => {
  buffer = Buffer.concat([buffer, chunk]);
  if (buffer.length > 1048576 + 8192) process.exit(2);
  if (!assigned) {
    const newline = buffer.indexOf(10); if (newline < 0) return;
    if (buffer.subarray(0, newline).toString() !== "FS05-JOB-ASSIGNED") process.exit(2);
    assigned = true; buffer = buffer.subarray(newline + 1);
    void startup().catch(() => { emit({ version: 1, error: "parser-unavailable" }); process.exit(2); });
  } else consume();
});
process.stdin.on("end", () => { parser?.delete(); process.exit(0); });
