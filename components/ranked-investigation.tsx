"use client";

import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { CodeSnapshot } from "@/lib/engine/types";
import { snapshotJson } from "@/lib/engine/snapshot-identity";
import { FileSelector, StatusBadge, WarningBanner } from "./workspace-ui";
import { verifyRanking, type RankingQuery, type RankingResult } from "@/lib/desktop/ranking";

export function RankedInvestigation({ snapshot, jobId, busy, selectedFile, onReveal }: { snapshot: CodeSnapshot; jobId: string; busy: boolean; selectedFile: string | null; onReveal: (file: string, mode?: "map" | "evidence") => void }) {
  const [goal, setGoal] = useState(""), [start, setStart] = useState(""), [mode, setMode] = useState<"baseline" | "laya">("laya");
  const [budget, setBudget] = useState(4), [depth, setDepth] = useState(8), [pending, setPending] = useState(false);
  const [result, setResult] = useState<RankingResult | null>(null), [error, setError] = useState("");
  const [definition, setDefinition] = useState<{ goal: string; start: string } | null>(null);
  const sequence = useRef(0);
  useEffect(() => () => { sequence.current++; }, []);
  async function run() {
    const current = ++sequence.current; setPending(true); setResult(null); setError("");
    try {
      const bytes = new TextEncoder().encode(snapshotJson(snapshot));
      const hash = await crypto.subtle.digest("SHA-256", bytes);
      const snapshotId = Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
      if (current !== sequence.current) return;
      const query: RankingQuery = { goal, start, mode, depth, budget, snapshotId };
      const answer = verifyRanking(snapshot, query, await invoke<unknown>("rank_snapshot", { jobId, query }));
      if (current === sequence.current) { setResult(answer); setDefinition({ goal: query.goal, start: query.start }); }
    } catch { if (current === sequence.current) setError("Ranking unavailable or snapshot changed. Choose an exact file, retry, or use deterministic Ask Codebase below."); }
    finally { if (current === sequence.current) setPending(false); }
  }
  async function cancel() {
    try { await invoke("cancel_ranking", { jobId }); } catch { setError("Cancellation unavailable; reopen the stored repository if the engine stopped."); }
  }
  const edges = new Map(snapshot.relationships.map((e) => [e.id, e]));
  const fallbackText: Record<string, string> = { outside_domain: "The goal was outside the model's supported domain. Deterministic ordering was used.", model_unavailable: "The local model was unavailable. Investigation continued with deterministic ranking.", model_corrupt: "The local model could not be verified. Deterministic ranking was used.", model_not_qualified: "The model is not qualified for use. Deterministic ranking was used.", timeout: "Local ranking exceeded its time limit. Deterministic ordering was used.", cancelled: "Ranking was cancelled. The verified results already inspected are retained.", stale_or_invalid_identity: "The ranking response did not match this snapshot. Deterministic ordering was used." };
  return <section aria-label="Local Laya investigation" className="investigation-workspace">
    <div className="investigation-composer">
      <fieldset disabled={pending || busy}>
        <label className="field-label">1. What do you want to find?<textarea maxLength={256} rows={2} value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Locate authentication implementation…" className="goal-input" /></label>
        <p className="mt-2 text-xs text-fg-muted">Describe a feature, for example “Locate user authentication and JWT validation.” This guides which connected files to inspect first.</p>
        <div className="mt-5"><FileSelector files={snapshot.files.map((f) => f.id)} label="2. Choose a file to begin (required)" guidance="Pick a controller, module or service related to your goal. The investigation follows this file’s verified dependencies." value={start} onChange={setStart} />{selectedFile && <button className="mt-2 text-accent" onClick={() => setStart(selectedFile)}>Start from the file selected on the map</button>}</div>
        <details className="advanced-controls mt-5"><summary>Exploration options <span className="ml-auto text-fg-muted">{mode === "laya" ? "Laya Local" : "Deterministic"} · up to {budget} files · {depth} connections deep</span></summary><div className="flex flex-wrap gap-4 pt-4">
          <label className="field-label">Prioritize files using<select aria-label="Prioritize files using" value={mode} onChange={(e) => setMode(e.target.value === "laya" ? "laya" : "baseline")}><option value="laya">Laya — local relevance ranking</option><option value="baseline">Deterministic — fixed ordering</option></select></label>
          <label className="field-label">How far to explore<select aria-label="How far to explore" value={depth} onChange={(e) => setDepth(Number(e.target.value))}>{[0,2,4,8,16].map((n)=><option key={n} value={n}>{n} dependency connections</option>)}</select><span className="text-xs font-normal text-fg-muted">Maximum number of import links from your chosen file.</span></label>
          <label className="field-label">Maximum files to inspect<select aria-label="Maximum files to inspect" value={budget} onChange={(e) => setBudget(Number(e.target.value))}>{[1,2,4,8,16,32,50].map((n)=><option key={n} value={n}>{n} files</option>)}</select><span className="text-xs font-normal text-fg-muted">A smaller limit gives a shorter list. It does not limit repository analysis.</span></label>
        </div></details>
        <button disabled={!goal.trim() || !snapshot.files.some((f)=>f.id===start)} className="button-primary mt-5" onClick={()=>void run()}>Find files to inspect <span aria-hidden="true">↗</span></button>
      </fieldset>
      {pending && <div role="status" className="mt-4 flex items-center gap-3"><StatusBadge>Ranking locally</StatusBadge><button className="text-accent" onClick={()=>void cancel()}>Cancel local ranking</button></div>}
      {error && <div className="mt-4"><WarningBanner title="Investigation unavailable">{error}</WarningBanner></div>}
    </div>
    <div className="investigation-results" aria-label="Local ranking result">
      {!result && !pending && <div className="result-placeholder"><span className="eyebrow">Evidence before inference</span><h2 className="mt-3">Follow a verified path.</h2><p className="mt-2">Your prioritized inspection order and the evidence behind each step will appear here.</p></div>}
      {result && <>
        <div className="result-header"><span className="eyebrow">Investigation</span><h2 className="mt-2">{definition?.goal}</h2><div className="mt-3 flex flex-wrap items-center gap-3"><StatusBadge>{result.mode === "baseline" ? "Deterministic" : "Laya Local"}</StatusBadge><span>{result.steps.length} files inspected</span><span className="text-fg-muted">{result.model}</span>{result.truncated && <StatusBadge tone="warning">More files may be available</StatusBadge>}<span className="text-fg-muted">{Math.round(result.elapsedMs)} ms</span>{result.cancelled && <StatusBadge tone="warning">Cancelled</StatusBadge>}</div><p className="mt-3 text-xs text-fg-muted">Inspection order is prioritized. Each path below is independently verified; consecutive inspected files are not necessarily connected.</p></div>
        {result.fallbacks.length ? <WarningBanner title="Deterministic fallback">{result.fallbacks.map((reason)=><p key={reason}>{fallbackText[reason] ?? "Local ranking returned an unusable result. Deterministic ordering was used."}</p>)}<details className="mt-2"><summary>Fallback details</summary><p className="mt-2 font-mono text-xs">{result.fallbacks.join(", ")}</p></details></WarningBanner> : <p className="my-4 text-xs text-fg-muted">Fallback: none</p>}
        <ol className="inspection-path">{result.steps.map((s,i)=><li key={s.id}><span className="path-number">{i+1}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-start justify-between gap-2"><span className="break-all font-mono font-medium">{s.id}</span><span className="text-xs text-fg-muted">{s.depth} import connections away</span></div><div className="mt-3 flex gap-4 text-xs"><button className="text-accent" onClick={()=>onReveal(s.id)}>Open file</button><button className="text-accent" onClick={()=>onReveal(s.id,"evidence")}>Inspect evidence</button></div><details className="mt-3"><summary>Why this file is connected</summary><div className="witness-path"><p className="break-all font-mono">{definition?.start}</p>{s.witness.map((id)=>{const e=edges.get(id)!;return <div key={id} className="witness-step"><p className="text-xs text-fg-muted">↓ verified {e.typeOnly ? "type-only import" : "import"} · line {e.evidence.line}</p><p className="mt-1 break-all font-mono">{e.target}</p><button className="mt-2 text-xs text-accent" onClick={()=>onReveal(e.source,"evidence")}>Inspect witness source</button><details className="mt-2 text-xs"><summary>Provenance</summary><p className="mt-1 break-all">{e.evidence.description} · {e.evidence.extractor}</p></details></div>;})}</div></details></div></li>)}</ol>
        {!result.steps.length && <p className="my-5">No files were inspected within these limits.</p>}
        <details className="result-details"><summary>Analysis limits &amp; model details</summary><p className="mt-3">Model: {result.model} · {result.qualified ? "synthetic qualification passed" : "not qualified"}. Timing measures controller work.</p><p className="mt-2">{result.truncated ? "Inspection budget or depth left additional candidates. A missed dependency is not proof of absence." : "Reachable frontier exhausted within the depth limit."}</p><p className="mt-2">{snapshot.coverage.relationships.unresolved} unresolved imports · {snapshot.coverage.files.skipped} skipped files. Graph facts and exhaustive Impact remain deterministic. Goals and results stay local and in memory.</p></details>
      </>}
    </div>
  </section>;
}
