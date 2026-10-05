import { realpathSync } from "node:fs";
import path from "node:path";
import { queryStructure, readEvidence } from "../lib/engine/index.ts";
import { typescriptAdapter } from "../lib/engine/adapters/typescript.ts";
import { validateSnapshot } from "../lib/engine/contract.ts";
import type { CodeSnapshot } from "../lib/engine/types.ts";
import { investigate } from "../lib/engine/investigations.ts";
import { explanationEvidence } from "../lib/ai/evidence.ts";
import { SqliteAnalysisStore, StorageError } from "../lib/storage/sqlite.ts";
import { MAX_REQUEST_BYTES, MAX_EVENT_BYTES, validateRequest, type EngineEvent, type EngineRequest } from "../lib/desktop/protocol.ts";

// Root authorization is supplied by native code on a private pipe, never by
// argv, renderer paths or repository configuration. No inherited provider keys.
const authorizedRoot = process.env.CODE_INTELLIGENCE_ROOT;
if (!authorizedRoot || !path.isAbsolute(authorizedRoot)) process.exit(2);
const authority = authorizedRoot;
// Rust canonicalization supplies extended-length Windows paths. Node's JS
// realpath implementation rejects these; its native implementation resolves
// them to the same canonical filesystem root without weakening authorization.
const database = process.env.CODE_INTELLIGENCE_DB;
const repositoryId = process.env.CODE_INTELLIGENCE_REPOSITORY;
const store = database ? new SqliteAnalysisStore(database) : null;
if (store && !repositoryId) process.exit(2);
const root = store && repositoryId ? store.repository(repositoryId).root : realpathSync.native(authorizedRoot);
if (path.toNamespacedPath(root) !== path.toNamespacedPath(authorizedRoot)) process.exit(2);
delete process.env.CODE_INTELLIGENCE_ROOT;
delete process.env.CODE_INTELLIGENCE_DB;
delete process.env.CODE_INTELLIGENCE_REPOSITORY;
// This engine has no network capability; denied fetch catches accidental use.
globalThis.fetch = () => { throw new Error("Local engine network access denied"); };
console.log = () => { throw new Error("Engine logs cannot use the protocol channel"); };
let snapshot: CodeSnapshot | null = null;
let jobId: string | null = null;
let ownsJob = false;
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
  if (request.type === "reopen") {
    if (!store || !repositoryId || snapshot || jobId) throw new Error("No stored repository session");
    snapshot = store.load(repositoryId);
    if (!snapshot) throw new Error("No completed snapshot; analyze this repository first");
    jobId = request.jobId;
    emit({ ...base, type: "complete", snapshot });
  } else if (request.type === "analyze") {
    if (snapshot || jobId) throw new Error("A session accepts one analysis only");
    if (!path.isAbsolute(request.root) || path.toNamespacedPath(request.root) !== path.toNamespacedPath(authority)) throw new Error("Repository root is not authorized");
    jobId = request.jobId;
    if (store && repositoryId) { store.begin(repositoryId, jobId); ownsJob = true; }
    if (realpathSync.native(request.root) !== root) throw new Error("Repository root changed; select its current location");
    emit({ ...base, type: "progress", stage: "select" });
    // The adapter remains authoritative; its staged callback reports work
    // without exposing parser-specific types to the native boundary.
    snapshot = validateSnapshot(typescriptAdapter.analyze(root, (stage) => emit({ ...base, type: "progress", stage })));
    emit({ ...base, type: "progress", stage: "validate" });
    if (store && repositoryId) store.publish(repositoryId, jobId, snapshot);
    emit({ ...base, type: "complete", snapshot });
  } else {
    if (!snapshot || request.jobId !== jobId) throw new Error("Unknown or incomplete analysis job");
    if (request.type === "evidence") emit({ ...base, type: request.type, evidence: readEvidence(snapshot, request.file) });
    else if (request.type === "explanation") {
      const result = explanationEvidence(snapshot, request.query);
      if (result.files.some((file) => readEvidence(snapshot!, file).state !== "current")) throw new Error("Explanation evidence is stale or unavailable");
      emit({ ...base, type: request.type, result });
    }
    else if (request.type === "investigation") emit({ ...base, type: request.type, result: investigate(snapshot, request.query) });
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
    catch (error) {
      if (store && ownsJob && jobId === request.jobId && request.type === "analyze") store.finish(request.jobId, "failed");
      // Raw errors may contain source/config expressions or machine paths.
      emit({ version: 1, requestId: request.requestId, jobId: request.jobId, type: "error", code: error instanceof StorageError ? error.code : "operation_failed", message: error instanceof StorageError ? error.message : "Local operation failed. Check directory access, coverage policy and analysis limits. The previous completed snapshot is retained." });
    }
  }
});
process.stdin.on("end", () => { if (store && ownsJob && jobId) store.finish(jobId, "interrupted"); store?.close(); process.exit(0); });
