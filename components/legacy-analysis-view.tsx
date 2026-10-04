"use client";

import { useMemo, type ComponentProps } from "react";
import { explainFileAction, explainFolderAction, fileAtHeadAction, repositoryHeadAction } from "@/app/(workspace)/analyses/[id]/actions";
import { rerunAnalysis } from "@/app/(workspace)/actions";
import type { AnalysisOperations } from "@/lib/analysis/operations";
import { AnalysisView } from "./analysis-view";

/** Existing public-GitHub UI only: it accepts a stored analysis ID, never a local root/snapshot. */
export function LegacyAnalysisView(props: Omit<ComponentProps<typeof AnalysisView>, "operations">) {
  const id = props.analysisId;
  const operations = useMemo<AnalysisOperations>(() => ({
    explainFile: (path) => explainFileAction(id, path),
    explainFolder: (dir) => explainFolderAction(id, dir),
    repositoryHead: () => repositoryHeadAction(id),
    fileAtHead: (path, head) => fileAtHeadAction(id, path, head),
    rerun: () => rerunAnalysis(id),
  }), [id]);
  return <AnalysisView {...props} operations={operations} />;
}
