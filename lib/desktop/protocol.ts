import { validateSnapshot } from "../engine/contract.ts";
import { validateSelection, type ExplanationSelection } from "../ai/selection.ts";
import { SNAPSHOT_VERSION, type CodeSnapshot, type StructuralQuery, type StructuralResult } from "../engine/types.ts";
import { validateInvestigation, validateInvestigationResult, type Investigation, type InvestigationResult } from "../engine/investigations.ts";
import type { RefreshStatus } from "../engine/refresh.ts";
import { validateRankingQuery, validateRankingResult, type RankingQuery, type RankingResult } from "./ranking.ts";

export const PROTOCOL_VERSION = 1;
export const MAX_REQUEST_BYTES = 16 * 1024;
export const MAX_EVENT_BYTES = 32 * 1024 * 1024;
export type EvidenceResult = { state: "current"; source: string } | { state: "stale" | "unavailable" };
type Identity = { version: 1; requestId: string; jobId: string };
export type EngineRequest = Identity & (
  { type: "analyze"; root: string; snapshotVersion: 3 } | { type: "reopen"; snapshotVersion: 3 } | { type: "watch"; action: "start" | "stop" | "simulate-loss" } | { type: "evidence"; file: string } | { type: "query"; query: StructuralQuery } | { type: "investigation"; query: Investigation } | { type: "explanation"; query: ExplanationSelection } | { type: "ranking"; query: RankingQuery } | { type: "ranking-cancel"; query: Record<string, never> }
);
export type EngineEvent = Identity & (
  { type: "watch"; status: RefreshStatus } |
  { type: "ranking"; result: RankingResult } |
  { type: "ranking-cancel"; result: { cancelled: boolean } } |
  { type: "progress"; stage: "select" | "parse" | "validate" } |
  { type: "complete"; snapshot: CodeSnapshot } |
  { type: "evidence"; evidence: EvidenceResult } |
  { type: "query"; result: StructuralResult } |
  { type: "investigation"; result: InvestigationResult } |
  { type: "explanation"; result: { payload: string; digest: string; ids: string[]; files: string[] } } |
  { type: "error"; code: string; message: string }
);
export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected protocol object");
  return Object.fromEntries(Object.entries(value));
}
export function identifier(value: unknown): string {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(value)) throw new Error("Invalid protocol identity");
  return value;
}
function text(value: unknown, limit: number): string {
  if (typeof value !== "string" || !value || value.length > limit || value.includes("\0")) throw new Error("Invalid protocol text");
  return value;
}
function identity(r: Record<string, unknown>): Identity {
  if (r.version !== PROTOCOL_VERSION) throw new Error("Unsupported protocol version");
  return { version: PROTOCOL_VERSION, requestId: identifier(r.requestId), jobId: identifier(r.jobId) };
}
function exact(r: Record<string, unknown>, keys: string[]) {
  if (Object.keys(r).some((key) => !["version", "requestId", "jobId", "type", ...keys].includes(key))) throw new Error("Unknown protocol field");
}
export function validateRequest(value: unknown): EngineRequest {
  const r = record(value), base = identity(r);
  if (r.type === "ranking") { exact(r, ["query"]); return { ...base, type: "ranking", query: validateRankingQuery(r.query) }; }
  if (r.type === "ranking-cancel") { exact(r, ["query"]); if (Object.keys(record(r.query)).length) throw new Error("Invalid cancellation"); return { ...base, type: "ranking-cancel", query: {} }; }
  if (r.type === "watch") { exact(r, ["action"]); if (r.action !== "start" && r.action !== "stop" && r.action !== "simulate-loss") throw new Error("Invalid watch action"); return { ...base, type: "watch", action: r.action }; }
  if (r.type === "analyze" || r.type === "reopen") {
    exact(r, r.type === "analyze" ? ["root", "snapshotVersion"] : ["snapshotVersion"]);
    if (r.snapshotVersion !== SNAPSHOT_VERSION) throw new Error("Snapshot contract handshake requires v3");
    return r.type === "analyze" ? { ...base, type: r.type, root: text(r.root, 4096), snapshotVersion: SNAPSHOT_VERSION } : { ...base, type: r.type, snapshotVersion: SNAPSHOT_VERSION };
  }
  if (r.type === "explanation") { exact(r, ["query"]); return { ...base, type: r.type, query: validateSelection(r.query) }; }
  if (r.type === "investigation") { exact(r, ["query"]); return { ...base, type: r.type, query: validateInvestigation(r.query) }; }
  if (r.type === "evidence") { exact(r, ["file"]); return { ...base, type: r.type, file: text(r.file, 4096) }; }
  if (r.type === "query") {
    exact(r, ["query"]);
    const q = record(r.query);
    if (Object.keys(q).some((key) => !["file", "direction", "depth"].includes(key)) || !["dependencies", "dependents"].includes(String(q.direction))) throw new Error("Invalid query");
    if (q.depth !== undefined && (typeof q.depth !== "number" || !Number.isSafeInteger(q.depth) || q.depth < 0 || q.depth > 64)) throw new Error("Invalid query depth");
    return { ...base, type: r.type, query: { file: text(q.file, 4096), direction: q.direction === "dependencies" ? "dependencies" : "dependents", ...(q.depth === undefined ? {} : { depth: q.depth as number }) } };
  }
  throw new Error("Unknown protocol operation");
}
export function validateEvent(value: unknown): EngineEvent {
  const r = record(value), base = identity(r);
  if (r.type === "ranking") { exact(r, ["result"]); return { ...base, type: "ranking", result: validateRankingResult(r.result) }; }
  if (r.type === "ranking-cancel") { exact(r, ["result"]); const result = record(r.result); if (Object.keys(result).join() !== "cancelled" || typeof result.cancelled !== "boolean") throw new Error("Invalid cancellation result"); return { ...base, type: "ranking-cancel", result: { cancelled: result.cancelled } }; }
  if (r.type === "watch") {
    exact(r, ["status"]); const s = record(r.status);
    const keys = ["state", "message", "mode", "parsed", "reused", "elapsedMs", "memoryBytes", "snapshotBytes"];
    if (Object.keys(s).length !== keys.length || !keys.every((k) => k in s) || !["watching", "paused", "degraded", "refreshing"].includes(String(s.state)) || !["full", "incremental"].includes(String(s.mode)) || typeof s.message !== "string" || s.message.length > 1024 || !keys.slice(3).every((k) => typeof s[k] === "number" && Number.isSafeInteger(s[k]) && Number(s[k]) >= 0)) throw new Error("Invalid refresh status");
    return { ...base, type: "watch", status: s as RefreshStatus };
  }
  if (r.type === "progress") {
    exact(r, ["stage"]);
    if (r.stage !== "select" && r.stage !== "parse" && r.stage !== "validate") throw new Error("Invalid progress");
    return { ...base, type: r.type, stage: r.stage };
  }
  if (r.type === "complete") { exact(r, ["snapshot"]); return { ...base, type: r.type, snapshot: validateSnapshot(r.snapshot) }; }
  if (r.type === "explanation") {
    exact(r, ["result"]); const result = record(r.result);
    if (Object.keys(result).some((k) => !["payload", "digest", "ids", "files"].includes(k)) || typeof result.payload !== "string" || result.payload.length > 6000 || typeof result.digest !== "string" || !/^[a-f0-9]{64}$/.test(result.digest) || !Array.isArray(result.ids) || result.ids.length > 40 || !result.ids.every((id) => typeof id === "string" && /^[FER][1-9][0-9]?$/.test(id)) || !Array.isArray(result.files) || result.files.length > 8 || !result.files.every((p) => typeof p === "string" && p.length <= 4096)) throw new Error("Invalid explanation package");
    return { ...base, type: r.type, result: { payload: result.payload, digest: result.digest, ids: result.ids as string[], files: result.files as string[] } };
  }
  if (r.type === "investigation") { exact(r, ["result"]); return { ...base, type: r.type, result: validateInvestigationResult(r.result) }; }
  if (r.type === "error") { exact(r, ["code", "message"]); return { ...base, type: r.type, code: text(r.code, 80), message: text(r.message, 1024) }; }
  if (r.type === "evidence") {
    exact(r, ["evidence"]); const e = record(r.evidence);
    if (e.state === "current" && typeof e.source === "string" && e.source.length <= 1024 * 1024 && Object.keys(e).every((key) => ["state", "source"].includes(key))) return { ...base, type: r.type, evidence: { state: e.state, source: e.source } };
    if ((e.state === "stale" || e.state === "unavailable") && Object.keys(e).length === 1) return { ...base, type: r.type, evidence: { state: e.state } };
    throw new Error("Invalid evidence response");
  }
  if (r.type === "query") {
    exact(r, ["result"]); const result = record(r.result);
    if (Object.keys(result).some((key) => !["steps", "beyond"].includes(key)) || !Array.isArray(result.steps) || result.steps.length > 64 || !result.steps.every((step) => Array.isArray(step) && step.every((p) => typeof p === "string")) || typeof result.beyond !== "number" || !Number.isSafeInteger(result.beyond) || result.beyond < 0) throw new Error("Invalid query result");
    return { ...base, type: r.type, result: { steps: result.steps as string[][], beyond: result.beyond } };
  }
  throw new Error("Unknown protocol event");
}
export function belongsToJob(event: { jobId: string }, jobId: string | null): boolean { return event.jobId === jobId; }
