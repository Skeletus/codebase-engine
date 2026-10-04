import type { ModelRole } from "../roles.ts";

export type ExplainResult =
  | { ok: true; body: string; model: string; cached: boolean; labelled: { role: ModelRole | null } | null; labelError: string | null }
  | { ok: false; error: string };
export type HeadResult = { ok: true; head: string; analysed: string } | { ok: false; error: string };
export type FileAtHead = { ok: true; state: "unchanged" | "changed" | "deleted" } | { ok: false; error: string };

/** UI capability interface. Only the legacy wrapper supplies cloud operations. */
export type AnalysisOperations = {
  explainFile: (path: string) => Promise<ExplainResult>;
  explainFolder: (dir: string) => Promise<ExplainResult>;
  repositoryHead: () => Promise<HeadResult>;
  fileAtHead: (path: string, head: string) => Promise<FileAtHead>;
  rerun: () => Promise<{ error: string | null }>;
};
