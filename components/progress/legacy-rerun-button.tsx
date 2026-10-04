"use client";

import { rerunAnalysis } from "@/app/(workspace)/actions";
import { RerunButton } from "./rerun-button";

export function LegacyRerunButton({ analysisId, ...props }: { analysisId: string; onStarted: () => void; label?: string }) {
  return <RerunButton {...props} rerun={() => rerunAnalysis(analysisId)} />;
}
