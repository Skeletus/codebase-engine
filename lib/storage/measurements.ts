export const TASK_CATEGORIES = ["understanding", "impact", "ask"] as const;
export type MeasurementInput = { category: (typeof TASK_CATEGORIES)[number]; elapsedMs: number; usefulness: number; discovered: number; missed: number };
export type Measurement = MeasurementInput & { applicationVersion: string };
export function validateMeasurement(value: unknown): MeasurementInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid measurement");
  const r = Object.fromEntries(Object.entries(value));
  const keys = ["category", "elapsedMs", "usefulness", "discovered", "missed"];
  if (Object.keys(r).length !== keys.length || keys.some((key) => !(key in r))) throw new Error("Unknown measurement fields");
  if (r.category !== "understanding" && r.category !== "impact" && r.category !== "ask") throw new Error("Invalid task category");
  function number(key: string, min: number, max: number) {
    const n = r[key]; if (typeof n !== "number" || !Number.isSafeInteger(n) || n < min || n > max) throw new Error("Invalid numeric measurement"); return n;
  }
  return { category: r.category, elapsedMs: number("elapsedMs", 1, 86400000), usefulness: number("usefulness", 1, 5), discovered: number("discovered", 0, 100000), missed: number("missed", 0, 100000) };
}
export function validateApplicationVersion(value: unknown): string {
  if (typeof value !== "string" || !/^\d{1,4}\.\d{1,4}\.\d{1,4}(?:-[a-zA-Z0-9.-]{1,32})?$/.test(value)) throw new Error("Invalid application version");
  return value;
}
