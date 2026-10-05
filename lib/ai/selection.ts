import { validateInvestigation, type Investigation } from "../engine/investigations.ts";
export type ExplanationSelection = { kind: "file" | "folder"; path: string } | { kind: "investigation"; query: Investigation };
export function validateSelection(value: unknown): ExplanationSelection {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid explanation selection");
  const r = Object.fromEntries(Object.entries(value));
  if (r.kind === "investigation" && Object.keys(r).length === 2) return { kind: r.kind, query: validateInvestigation(r.query) };
  if ((r.kind === "file" || r.kind === "folder") && Object.keys(r).length === 2 && typeof r.path === "string" && r.path.length <= 4096 && !/[\\:\0]/.test(r.path) && !r.path.startsWith("/") && r.path.split("/").every((p) => p !== ".." && p !== ".")) return { kind: r.kind, path: r.path };
  throw new Error("Invalid explanation selection");
}

