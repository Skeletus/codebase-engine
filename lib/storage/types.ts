import type { CodeSnapshot } from "../engine/types.ts";
import type { MeasurementInput, Measurement } from "./measurements.ts";

export type JobState = "running" | "complete" | "failed" | "cancelled" | "interrupted";
export type StoredRepository = {
  repositoryId: string; root: string; available: boolean;
  snapshotState: "none" | "compatible" | "incompatible";
  updatedAt: string | null; lastJob: { id: string; state: JobState } | null;
};
export interface AnalysisStore {
  register(root: string): StoredRepository;
  list(): StoredRepository[];
  repository(id: string): StoredRepository;
  load(id: string): CodeSnapshot | null;
  /** Historical format copy, never implicitly promoted to current analysis. */
  loadRetained(id: string, version: 2 | 3): ReturnType<typeof import("../engine/contract.ts").inspectSnapshot> | null;
  begin(id: string, job: string): void;
  publish(id: string, job: string, snapshot: CodeSnapshot): void;
  finish(job: string, state: "failed" | "cancelled" | "interrupted", ownerPid?: number): void;
  recover(): void;
  forget(id: string): void;
  settings(initialTheme?: "system" | "dark" | "light"): { theme: "system" | "dark" | "light" };
  setTheme(theme: "system" | "dark" | "light"): void;
  recordMeasurement(input: MeasurementInput, applicationVersion: string): void;
  measurements(): { records: Measurement[]; total: number };
  resetMeasurements(): void;
  close(): void;
}
