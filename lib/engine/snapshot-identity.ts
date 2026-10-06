import type { CodeSnapshot } from "./types.ts";

/** JSON object key order is not preserved by native transport. Array order and
 * every snapshot value remain part of the identity; only object keys are sorted. */
export function snapshotJson(snapshot: CodeSnapshot): string {
  function ordered(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(ordered);
    if (value !== null && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => [key, ordered(item)]));
    }
    return value;
  }
  return JSON.stringify(ordered(snapshot));
}
