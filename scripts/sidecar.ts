import { realpathSync } from "node:fs";
import path from "node:path";
import { queryStructure, readEvidence } from "../lib/engine/index.ts";
import { typescriptAdapter } from "../lib/engine/adapters/typescript.ts";
import { validateSnapshot } from "../lib/engine/contract.ts";
import type { CodeSnapshot } from "../lib/engine/types.ts";
import { MAX_REQUEST_BYTES, MAX_EVENT_BYTES, validateRequest, type EngineEvent, type EngineRequest } from "../lib/desktop/protocol.ts";

// Root authorization is supplied by native code on a private pipe, never by
// argv, renderer paths or repository configuration. No inherited provider keys.
const authorizedRoot = process.env.CODE_INTELLIGENCE_ROOT;
if (!authorizedRoot || !path.isAbsolute(authorizedRoot)) process.exit(2);
// Rust canonicalization supplies extended-length Windows paths. Node's JS
// realpath implementation rejects these; its native implementation resolves
// them to the same canonical filesystem root without weakening authorization.
const root = realpathSync.native(authorizedRoot);
delete process.env.CODE_INTELLIGENCE_ROOT;
// This engine has no network capability; denied fetch catches accidental use.
globalThis.fetch = () => { throw new Error("Local engine network access denied"); };
console.log = () => { throw new Error("Engine logs cannot use the protocol channel"); };
let snapshot: CodeSnapshot | null = null;
let jobId: string | null = null;
const seen = new Set<string>();
function emit(event: EngineEvent) {
  const line = JSON.stringify(event);
  if (Buffer.byteLength(line) > MAX_EVENT_BYTES) {
    process.stdout.write(JSON.stringify({ version: 1, requestId: event.requestId, jobId: event.jobId, type: "error", code: "response_limit", message: "Analysis exceeds the desktop message budget" }) + "\n");
    return;
  }
  process.stdout.write(line + "\n");
}
function handle(request: EngineRequest) {
  const base = { version: 1 as const, requestId: request.requestId, jobId: request.jobId };
  if (seen.has(request.requestId) || seen.size >= 10000) throw new Error("Duplicate request or session request limit");
  seen.add(request.requestId);
  if (request.type === "analyze") {
    if (snapshot || jobId) throw new Error("A session accepts one analysis only");
    if (!path.isAbsolute(request.root) || realpathSync.native(request.root) !== root) throw new Error("Repository root is not authorized");
    jobId = request.jobId;
    emit({ ...base, type: "progress", stage: "select" });
    // The adapter remains authoritative; its staged callback reports work
    // without exposing parser-specific types to the native boundary.
    snapshot = validateSnapshot(typescriptAdapter.analyze(root, (stage) => emit({ ...base, type: "progress", stage })));
    emit({ ...base, type: "progress", stage: "validate" });
    emit({ ...base, type: "complete", snapshot });
  } else {
    if (!snapshot || request.jobId !== jobId) throw new Error("Unknown or incomplete analysis job");
    if (request.type === "evidence") emit({ ...base, type: request.type, evidence: readEvidence(snapshot, request.file) });
    else emit({ ...base, type: request.type, result: queryStructure(snapshot, request.query) });
  }
}
// Buffer bytes before JSON parsing, including unterminated/malicious frames.
let buffered = Buffer.alloc(0);
process.stdin.on("data", (chunk: Buffer) => {
  buffered = Buffer.concat([buffered, chunk]);
  for (;;) {
    const end = buffered.indexOf(10);
    if (end < 0) { if (buffered.length > MAX_REQUEST_BYTES) process.exit(2); return; }
    if (end > MAX_REQUEST_BYTES) process.exit(2);
    const line = buffered.subarray(0, end).toString("utf8"); buffered = buffered.subarray(end + 1);
    let request: EngineRequest;
    try { request = validateRequest(JSON.parse(line)); }
    catch { process.exit(2); }
    try { handle(request); }
    catch {
      // Raw errors may contain source/config expressions or machine paths.
      emit({ version: 1, requestId: request.requestId, jobId: request.jobId, type: "error", code: "operation_failed", message: "Local operation failed. Check directory access, coverage policy and analysis limits." });
    }
  }
});
process.stdin.on("end", () => process.exit(0));
