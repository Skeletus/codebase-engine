import type { ModelRole } from "../roles.ts";
import type { Investigation } from "../engine/investigations.ts";

export type ExplainResult =
  | { ok: true; body: string; model: string; cached: boolean; labelled: { role: ModelRole | null } | null; labelError: string | null; citations?: { id: string; path: string }[]; cacheSaved?: boolean }
  | { ok: false; error: string };

/** Provider-independent UI capability interface; external explanations remain disabled. */
export type AnalysisOperations = {
  explainFile: (path: string) => Promise<ExplainResult>;
  explainFolder: (dir: string) => Promise<ExplainResult>;
  explainInvestigation: (query: Investigation) => Promise<ExplainResult>;
};
