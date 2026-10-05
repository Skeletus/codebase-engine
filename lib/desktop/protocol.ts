import { validateSnapshot } from "../engine/contract.ts";
import type { CodeSnapshot, StructuralQuery, StructuralResult } from "../engine/types.ts";

export const PROTOCOL_VERSION = 1;
export const MAX_REQUEST_BYTES = 16 * 1024;
export const MAX_EVENT_BYTES = 32 * 1024 * 1024;
export type EvidenceResult = { state: "current"; source: string } | { state: "stale" | "unavailable" };
type Identity = { version: 1; requestId: string; jobId: string };
export type EngineRequest = Identity & (
  { type: "analyze"; root: string } | { type: "evidence"; file: string } | { type: "query"; query: StructuralQuery }
);
export type EngineEvent = Identity & (
  { type: "progress"; stage: "select" | "parse" | "validate" } |
  { type: "complete"; snapshot: CodeSnapshot } |
  { type: "evidence"; evidence: EvidenceResult } |
  { type: "query"; result: StructuralResult } |
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
  if (r.type === "analyze") { exact(r, ["root"]); return { ...base, type: r.type, root: text(r.root, 4096) }; }
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
  if (r.type === "progress") {
    exact(r, ["stage"]);
    if (r.stage !== "select" && r.stage !== "parse" && r.stage !== "validate") throw new Error("Invalid progress");
    return { ...base, type: r.type, stage: r.stage };
  }
  if (r.type === "complete") { exact(r, ["snapshot"]); return { ...base, type: r.type, snapshot: validateSnapshot(r.snapshot) }; }
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
