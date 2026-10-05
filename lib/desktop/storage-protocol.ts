import { identifier, record } from "./protocol.ts";
import { validateMeasurement, validateApplicationVersion, type MeasurementInput } from "../storage/measurements.ts";
export type StorageRequest = { version: 1 } & (
  { type: "list" } | { type: "register" } | { type: "lookup"; repositoryId: string } |
  { type: "forget"; repositoryId: string } | { type: "finish"; jobId: string; ownerPid: number; state: "cancelled" | "interrupted" } |
  { type: "settings"; initialTheme?: "system" | "dark" | "light" } | { type: "theme"; theme: "system" | "dark" | "light" }
  | { type: "measurement"; input: MeasurementInput; applicationVersion: string } | { type: "measurements" } | { type: "reset-measurements" }
  | { type: "explanation-cache"; repositoryId: string; key: string; answer?: string }
  | { type: "explanation-digest"; input: string }
);
export function validateStorageRequest(value: unknown): StorageRequest {
  const r = record(value);
  if (r.version !== 1) throw new Error("Unsupported storage protocol");
  const fields = r.type === "explanation-digest" ? ["input"] : r.type === "explanation-cache" ? ["repositoryId", "key", "answer"] : r.type === "lookup" || r.type === "forget" ? ["repositoryId"] : r.type === "finish" ? ["jobId", "ownerPid", "state"] : r.type === "theme" ? ["theme"] : r.type === "settings" ? ["initialTheme"] : r.type === "measurement" ? ["input", "applicationVersion"] : [];
  if (Object.keys(r).some((key) => !["version", "type", ...fields].includes(key))) throw new Error("Unknown storage field");
  const base = { version: 1 as const };
  if (r.type === "explanation-digest" && typeof r.input === "string" && r.input.length <= 32000) return { ...base, type: r.type, input: r.input };
  if (r.type === "explanation-cache" && typeof r.key === "string" && /^[a-zA-Z0-9_.:-]{1,240}$/.test(r.key) && (r.answer === undefined || (typeof r.answer === "string" && r.answer.length <= 10000))) return { ...base, type: r.type, repositoryId: identifier(r.repositoryId), key: r.key, ...(r.answer === undefined ? {} : { answer: r.answer }) };
  if (r.type === "list" || r.type === "register" || r.type === "measurements" || r.type === "reset-measurements") return { ...base, type: r.type };
  if (r.type === "measurement") return { ...base, type: r.type, input: validateMeasurement(r.input), applicationVersion: validateApplicationVersion(r.applicationVersion) };
  if (r.type === "settings") {
    if (r.initialTheme === undefined) return { ...base, type: r.type };
    if (r.initialTheme === "system" || r.initialTheme === "dark" || r.initialTheme === "light") return { ...base, type: r.type, initialTheme: r.initialTheme };
    throw new Error("Invalid initial theme");
  }
  if (r.type === "lookup" || r.type === "forget") return { ...base, type: r.type, repositoryId: identifier(r.repositoryId) };
  if (r.type === "finish" && (r.state === "cancelled" || r.state === "interrupted") && typeof r.ownerPid === "number" && Number.isSafeInteger(r.ownerPid) && r.ownerPid > 0) return { ...base, type: r.type, jobId: identifier(r.jobId), ownerPid: r.ownerPid, state: r.state };
  if (r.type === "theme" && (r.theme === "system" || r.theme === "dark" || r.theme === "light")) return { ...base, type: r.type, theme: r.theme };
  throw new Error("Unknown storage operation");
}
