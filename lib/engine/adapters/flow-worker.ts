import { createRequire } from "node:module";
import { verifyFlowRuntime } from "./flow-runtime.ts";
import { extractFlow, type FlowParser } from "./flow-syntax.ts";

let buffer = Buffer.alloc(0), assigned = false, ready = false, processing = false;
let parser: FlowParser;
function emit(value: unknown) {
  const bytes = Buffer.from(JSON.stringify(value) + "\n");
  if (bytes.length > 8 * 1024 * 1024) { process.stdout.write('{"version":1,"error":"resource-limit"}\n'); return; }
  process.stdout.write(bytes);
}
globalThis.fetch = () => { throw Error("network-denied"); };
console.log = () => { throw Error("protocol-only"); };
function startup() {
  const entry = verifyFlowRuntime();
  parser = createRequire(import.meta.url)(entry) as FlowParser;
  parser.parse("", {flow: "all", babel: false, sourceType: "module"});
  ready = true; emit({version: 1, ready: true, runtime: "hermes-parser@0.25.1"}); consume();
}
function consume() {
  if (!ready || processing) return;
  processing = true;
  try {
    while (buffer.length >= 4) {
      const headerBytes = buffer.readUInt32BE(0); if (headerBytes > 4096) throw Error("invalid-frame");
      if (buffer.length < 4 + headerBytes) return;
      const header: unknown = JSON.parse(buffer.subarray(4, 4 + headerBytes).toString("utf8"));
      if (!header || typeof header !== "object" || Array.isArray(header)) throw Error("invalid-frame");
      const h = header as Record<string, unknown>;
      if (h.version !== 1 || typeof h.file !== "string" || !h.file || h.file.length > 4096 || !Number.isSafeInteger(h.bytes) || typeof h.bytes !== "number" || h.bytes < 0 || h.bytes > 1048576 || Object.keys(h).some(k => !["version", "file", "bytes"].includes(k))) throw Error("invalid-frame");
      if (buffer.length < 4 + headerBytes + h.bytes) return;
      const source = buffer.subarray(4 + headerBytes, 4 + headerBytes + h.bytes); buffer = buffer.subarray(4 + headerBytes + h.bytes);
      try { emit({version: 1, result: extractFlow(parser, h.file, source)}); }
      catch (error) { emit({version: 1, error: error instanceof Error && ["resource-limit", "unsupported-encoding"].includes(error.message) ? error.message : "parse-error"}); }
    }
  } finally { processing = false; }
}
process.stdin.on("data", (chunk: Buffer) => {
  buffer = Buffer.concat([buffer, chunk]);
  if (buffer.length > 1048576 + 8192) process.exit(2);
  try {
    if (!assigned) {
      const newline = buffer.indexOf(10); if (newline < 0) return;
      if (buffer.subarray(0, newline).toString() !== "FS05-JOB-ASSIGNED") process.exit(2);
      assigned = true; buffer = buffer.subarray(newline + 1); startup();
    } else consume();
  } catch { emit({version: 1, error: "parser-unavailable"}); process.exit(2); }
});
process.stdin.on("end", () => process.exit(0));
