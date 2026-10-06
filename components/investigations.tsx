"use client";

import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { CodeSnapshot } from "@/lib/engine/types";
import { INTENTS, verifyInvestigation, type Intent, type Investigation, type InvestigationResult } from "@/lib/engine/investigations";
import type { ExplainResult } from "@/lib/analysis/operations";
import { ExplanationText } from "./explanation-text";

export function Investigations({ snapshot, jobId, busy, selectedFile, onReveal, onExplain, variant = "ask" }: {
  snapshot: CodeSnapshot; jobId: string; busy: boolean; selectedFile: string | null; onReveal: (file: string) => void;
  onExplain: (query: Investigation) => Promise<ExplainResult>;
  variant?: "ask" | "impact";
}) {
  const [search, setSearch] = useState(""), [scope, setScope] = useState<"all" | "paths" | "exports" | "entries">("all");
  const [target, setTarget] = useState(""), [intent, setIntent] = useState<Intent>("dependents");
  const [depth, setDepth] = useState(2), [budget, setBudget] = useState(50);
  const [pending, setPending] = useState(false), [error, setError] = useState("");
  const [result, setResult] = useState<InvestigationResult | null>(null);
  const [answeredQuery, setAnsweredQuery] = useState<Investigation | null>(null), [explanation, setExplanation] = useState<ExplainResult | null>(null);
  const sequence = useRef(0);
  useEffect(() => () => { sequence.current++; }, []);
  async function run(query: Investigation) {
    const current = ++sequence.current;
    setPending(true); setError(""); setResult(null); setAnsweredQuery(null); setExplanation(null);
    try {
      const raw = await invoke<unknown>("investigate_snapshot", { jobId, query });
      const checked = verifyInvestigation(snapshot, query, raw);
      if (sequence.current === current) { setResult(checked); setAnsweredQuery(query); }
    } catch (error) { if (sequence.current === current) setError(`Investigation unavailable: ${String(error).slice(0, 500)}. Reopen the stored analysis if the engine stopped.`); }
    finally { if (sequence.current === current) setPending(false); }
  }
  const files = new Map(snapshot.files.map((f) => [f.id, f]));
  const edges = new Map(snapshot.relationships.map((r) => [r.id, r]));
  return <section aria-label="Codebase investigations" className="structural-ask p-5 text-[13px]">
    <h2 className="section-title">{variant === "impact" ? "Inspect dependents" : "Ask from verified structure"}</h2>
    <p className="my-2 text-fg-muted">Offline, deterministic file structure. Dependency traces are not execution flows. Every result belongs to the displayed stored snapshot; inspect current source through its hash check.</p>
    <fieldset disabled={busy || pending} className="space-y-3 disabled:opacity-50">
      <div className={variant === "impact" ? "hidden" : "flex flex-wrap items-center gap-3 pb-4"}>
        <label>Search <input aria-label="Search known code" maxLength={256} value={search} onChange={(e) => setSearch(e.target.value)} className="rounded border border-line bg-canvas px-2 py-1" /></label>
        <select aria-label="Search scope" value={scope} onChange={(e) => { const v = e.target.value; if (v === "all" || v === "paths" || v === "exports" || v === "entries") setScope(v); }} className="rounded border border-line bg-canvas p-1"><option value="all">Paths and export names</option><option value="paths">Paths</option><option value="exports">Export names</option><option value="entries">Convention entry points</option></select>
        <button className="rounded border border-line px-2 py-1" onClick={() => void run({ operation: "search", text: search, scope, budget })}>Search snapshot</button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className={variant === "impact" ? "hidden" : "field-label"}>Ask Codebase <select aria-label="Supported question" value={intent} onChange={(e) => { const v = INTENTS.find((i) => i === e.target.value); if (v) setIntent(v); }} className="ml-2 rounded border border-line bg-canvas p-1">{INTENTS.map((i) => <option key={i} value={i}>{i === "dependents" ? "Change impact / dependents" : i === "trace" ? "Dependency trace" : i === "unsupported" ? "Other question (unsupported)" : i}</option>)}</select></label>
        <label className="field-label">{variant === "impact" ? "Changed file" : "Target"} <input aria-label="Question target" maxLength={4096} value={target} onChange={(e) => setTarget(e.target.value)} placeholder="Exact path, filename or export name" className="w-72 rounded border border-line bg-canvas px-2 py-1 font-mono" /></label>
        {selectedFile && <button className="text-accent" onClick={() => setTarget(selectedFile)}>Use selected file</button>}
        <details className="advanced-controls"><summary>Depth and result limits</summary><div className="flex flex-wrap gap-4 py-3">        <label>Depth <select aria-label="Investigation depth" value={depth} onChange={(e) => setDepth(Number(e.target.value))} className="rounded border border-line bg-canvas p-1">{[0, 1, 2, 4, 8, 16, 32, 64].map((d) => <option key={d} value={d}>{d}</option>)}</select></label>
        <label>Result budget <select aria-label="Investigation result budget" value={budget} onChange={(e) => setBudget(Number(e.target.value))} className="rounded border border-line bg-canvas p-1">{[10, 50, 100, 200].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
</div></details>
        <button className="rounded border border-line px-2 py-1" onClick={() => void run({ operation: "ask", intent: variant === "impact" ? "dependents" : intent, target, depth, budget })}>{variant === "impact" ? "Inspect change impact" : "Answer from evidence"}</button>
      </div>
    </fieldset>
    <p className="my-2 text-fg-muted">{variant === "impact" ? "Choose the changed file. Incoming dependency paths identify possible structural impact, including type-only imports; they do not prove runtime effects." : "Blank target lists all routes/export names. Other intents require a file. Duplicate filenames/export names require choosing an exact path. Arbitrary natural-language comprehension is not offered."}</p>
    {pending && <p role="status">Retrieving snapshot evidence…</p>}
    {error && <p role="alert" className="my-3">{error}</p>}
    {result && <div aria-label="Investigation answer" className="space-y-3 border-t border-line pt-3">
      <p role="status">{result.message}</p>
      {result.state === "ok" && answeredQuery && <button disabled={busy} className="text-accent" onClick={() => { const n = sequence.current; void onExplain(answeredQuery).then((answer) => { if (n === sequence.current) setExplanation(answer); }); }}>Explain this investigation — inspect external payload first</button>}
      {explanation && <section className="border border-line p-2"><p>Generated, unverified interpretation — verified results below remain authoritative.</p>{explanation.ok ? <><ExplanationText text={explanation.body} isPath={(p) => files.has(p)} onPath={(p) => <button className="text-accent" onClick={() => onReveal(p)}>{p}</button>} /><p>{explanation.model} · {explanation.cached ? "matching local cache; no provider call" : "new answer"}</p>{explanation.citations?.map((c) => <p key={c.id}>[{c.id}] <button className="text-accent" onClick={() => onReveal(c.path)}>{c.path}</button></p>)}</> : <p role="alert">{explanation.error}</p>}</section>}
      <p>Omitted beyond depth: {result.beyondDepth} · Omitted by result budget: {result.beyondBudget}. Depth/budget cap the answer; reachability counts scan the full stored file graph.</p>
      {result.candidates.map((file) => <div key={file} className="flex gap-2"><button className="text-accent" onClick={() => setTarget(file)}>Choose exact target</button><button className="font-mono text-accent" onClick={() => onReveal(file)}>{file}</button><span className="text-fg-muted">{files.get(file)?.role ?? "no convention role"}</span></div>)}
      {result.rows.map((row) => <details key={row.file} className="rounded border border-line p-2">
        <summary><span className="font-mono">{row.file}</span> · {row.distance} dependency steps</summary>
        <button className="my-2 text-accent" onClick={() => onReveal(row.file)}>Inspect file on graph</button>
        {row.witness.map((id, i) => { const edge = edges.get(id)!; return <div key={id} className="my-2 border-l border-line pl-2">
          <p className="break-all font-mono">{i + 1}. {edge.source} → {edge.target} {edge.typeOnly ? "· type-only" : "· import"}</p>
          <p>Line {edge.evidence.line} · {edge.evidence.description} · {edge.evidence.extractor} · verified first occurrence</p>
          <button className="text-accent" onClick={() => onReveal(edge.source)}>Inspect source and recheck hash</button>
        </div>; })}
      </details>)}
      {result.routeIndices.map((index) => { const r = snapshot.routes[index]; return <p key={index}><span className="font-mono">{r.method} {r.pattern}</span> · <button className="text-accent" onClick={() => onReveal(r.file)}>{r.file}:{r.evidence.line}</button> · {r.evidence.extractor}</p>; })}
      {result.exportFiles.map((file) => <p key={file}><button className="font-mono text-accent" onClick={() => onReveal(file)}>{file}</button> · {files.get(file)!.exports.join(", ")}</p>)}
      <details aria-label="Investigation coverage limits" className="border-t border-line pt-3"><summary>Coverage and analysis boundaries</summary>
        <h3>Analysis gaps and boundaries</h3>
        <p>{snapshot.coverage.files.skipped} skipped files · {snapshot.coverage.relationships.unresolved} unresolved imports · {snapshot.coverage.relationships.excluded} excluded imports · {snapshot.coverage.relationships.external} external imports. Missing relationships in incomplete analysis are not proof of absence.</p>
        {result.boundaryIndices.map((index) => { const d = snapshot.diagnostics[index]; return <p key={index} className="my-1 break-all font-mono">{d.path}{d.line ? `:${d.line}` : ""} · {d.category}: {d.reason} · {d.detail}</p>; })}
        <p>{result.boundariesOmitted} additional diagnostics omitted here; inspect Diagnostics for the complete report.</p>
      </details>
    </div>}
  </section>;
}
