import { realpathSync } from "node:fs";
import path from "node:path";
import { queryStructure, readEvidence } from "../lib/engine/index.ts";
import { createTypescriptRefresh } from "../lib/engine/adapters/typescript.ts";
import { createComposedRefresh } from "../lib/engine/adapters/composed.ts";
import { RepositoryRefresh } from "../lib/engine/refresh.ts";
import { validateSnapshot } from "../lib/engine/contract.ts";
import type { CodeSnapshot } from "../lib/engine/types.ts";
import { investigate } from "../lib/engine/investigations.ts";
import { explanationEvidence } from "../lib/ai/evidence.ts";
import { SqliteAnalysisStore, StorageError } from "../lib/storage/sqlite.ts";
import { rankedInvestigation } from "../lib/laya/investigation.ts";
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
let activeRanking: AbortController | null = null;
let jobId: string | null = null;
let ownsJob = false;
let reopened = false;
const mobileProfiles=["android-development","ios-development"] as const;
const adapter = createTypescriptRefresh({metroModes:mobileProfiles});
const parserCancellation = new AbortController();
const composedAdapter = createComposedRefresh({ host: path.resolve(import.meta.dirname, "../bin/parser-host.exe"), signal: parserCancellation.signal, previousSnapshot: () => snapshot, metroModes:mobileProfiles });
let generation = 0;
let storageJob: string | null = null;
const refresher = new RepositoryRefresh({
  begin() {
    activeRanking?.abort();
    if (!jobId) throw new Error("Missing session");
    storageJob = generation++ === 0 ? jobId : `refresh-${generation}-${jobId}`;
    if (store && repositoryId) { store.begin(repositoryId, storageJob); ownsJob = true; }
    if (generation === 1 && !reopened) emit({ version: 1, requestId: jobId, jobId, type: "progress", stage: "select" });
  },
  analyze(full) {
    if (!jobId) throw new Error("Missing session");
    emit({ version: 1, requestId: jobId, jobId, type: "progress", stage: "select" });
    try { return adapter.analyze(root, full, (stage) => emit({ version: 1, requestId: jobId!, jobId: jobId!, type: "progress", stage })); }
    catch (error) { if (store && storageJob) store.finish(storageJob, "failed"); throw error; }
  },
  async analyzeAsync(full) {
    if (!jobId) throw new Error("Missing session");
    emit({ version: 1, requestId: jobId, jobId, type: "progress", stage: "select" });
    try { return await composedAdapter.analyze(root, full, stage => emit({ version: 1, requestId: jobId!, jobId: jobId!, type: "progress", stage })); }
    catch (error) { if (store && storageJob) store.finish(storageJob, "failed"); throw error; }
  },
  publish(next) {
    if (!jobId) throw new Error("Missing session");
    try { if (store && repositoryId && storageJob) store.publish(repositoryId, storageJob, next); }
    catch (error) { if (store && storageJob) store.finish(storageJob, "failed"); throw error; }
    snapshot = validateSnapshot(next);
    emit({ version: 1, requestId: jobId, jobId, type: "complete", snapshot });
  },
  status(status) {
    if (status.state === "paused" || status.state === "degraded") { if (store && storageJob) store.finish(storageJob, "failed"); }
    if (jobId) emit({ version: 1, requestId: jobId, jobId, type: "watch", status });
  },
});
const seen = new Set<string>();
function emit(event: EngineEvent) {
  const line = JSON.stringify(event);
  if (Buffer.byteLength(line) > MAX_EVENT_BYTES) {
    process.stdout.write(JSON.stringify({ version: 1, requestId: event.requestId, jobId: event.jobId, type: "error", code: "response_limit", message: "Analysis exceeds the desktop message budget" }) + "\n");
    return;
  }
  process.stdout.write(line + "\n");
}
async function handle(request: EngineRequest) {
  const base = { version: 1 as const, requestId: request.requestId, jobId: request.jobId };
  if (seen.has(request.requestId) || seen.size >= 10000) throw new Error("Duplicate request or session request limit");
  seen.add(request.requestId);
  if (request.type === "reopen") {
    if (!store || !repositoryId || snapshot || jobId) throw new Error("No stored repository session");
    snapshot = store.load(repositoryId);
    if (!snapshot) throw new Error("No completed snapshot; analyze this repository first");
    jobId = request.jobId;
    reopened = true;
    emit({ ...base, type: "complete", snapshot });
    // Watching is explicitly started by the desktop after a completed response.
  } else if (request.type === "analyze") {
    if (snapshot || jobId) throw new Error("A session accepts one analysis only");
    if (!path.isAbsolute(request.root) || path.toNamespacedPath(request.root) !== path.toNamespacedPath(authority)) throw new Error("Repository root is not authorized");
    jobId = request.jobId;
    if (realpathSync.native(request.root) !== root) throw new Error("Repository root changed; select its current location");
    // The adapter remains authoritative; its staged callback reports work
    // without exposing parser-specific types to the native boundary.
    await refresher.runAsync(true);
  } else {
    if (!snapshot || request.jobId !== jobId) throw new Error("Unknown or incomplete analysis job");
    if (request.type === "ranking-cancel") { const cancelled = activeRanking !== null; activeRanking?.abort(); emit({ ...base, type: "ranking-cancel", result: { cancelled } }); }
    else if (request.type === "ranking") {
      if (activeRanking) throw new Error("An investigation is already running");
      const captured = snapshot, controller = new AbortController(); activeRanking = controller;
      void rankedInvestigation(captured, request.query, controller.signal).then((result) => {
        if (captured !== snapshot) throw new Error("stale_snapshot");
        emit({ ...base, type: "ranking", result });
      }).catch(() => emit({ ...base, type: "error", code: "ranking_unavailable", message: "Ranking unavailable or snapshot changed. Use deterministic investigations or retry with the current snapshot." }))
        .finally(() => { if (activeRanking === controller) activeRanking = null; });
    }
    else if (request.type === "watch") {
      if (request.action === "start") refresher.start(); else if (request.action === "stop") refresher.pause(); else refresher.loss();
    }
    else if (request.type === "evidence") emit({ ...base, type: request.type, evidence: readEvidence(snapshot, request.file) });
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
let requests = Promise.resolve();
let queuedRequests = 0;
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
    if (++queuedRequests > 10000) process.exit(2);
    requests = requests.then(() => handle(request)).catch(error => {
      if (store && ownsJob && storageJob && jobId === request.jobId && request.type === "analyze") store.finish(storageJob, "failed");
      // Raw errors may contain source/config expressions or machine paths.
      const safeExplanationErrors = ["Explanation evidence is stale or unavailable", "Selected evidence exceeds explanation budget; select a smaller scope", "Sensitive-looking evidence excluded", "No snapshot evidence selected", "Choose an unambiguous supported investigation first"];
      const explanationError = request.type === "explanation" && error instanceof Error && safeExplanationErrors.includes(error.message) ? error.message : null;
      emit({ version: 1, requestId: request.requestId, jobId: request.jobId, type: "error", code: error instanceof StorageError ? error.code : "operation_failed", message: error instanceof StorageError ? error.message : explanationError ?? "Local operation failed. Check directory access, coverage policy and analysis limits. The previous completed snapshot is retained." });
    }).finally(() => { queuedRequests--; });
  }
});
process.stdin.on("end", () => { parserCancellation.abort(); activeRanking?.abort(); refresher.close(); if (store && ownsJob && storageJob) store.finish(storageJob, "interrupted"); store?.close(); process.exit(0); });
