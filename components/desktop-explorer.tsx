"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { belongsToJob, validateEvent, type EvidenceResult } from "@/lib/desktop/protocol";
import { projectSnapshot } from "@/lib/desktop/projection";
import type { CodeSnapshot } from "@/lib/engine/types";
import type { AnalysisOperations } from "@/lib/analysis/operations";
import { AnalysisView } from "./analysis-view";
import { ThemeControl } from "./theme-control";

type Repository = { repositoryId: string; root: string };
export function DesktopExplorer() {
  const [ready, setReady] = useState(false), [repository, setRepository] = useState<Repository | null>(null);
  const [snapshot, setSnapshot] = useState<CodeSnapshot | null>(null), [message, setMessage] = useState("Open a local repository to begin.");
  const [displayJob, setDisplayJob] = useState("");
  const [busy, setBusy] = useState(false), [picking, setPicking] = useState(false), [coverage, setCoverage] = useState(false);
  const job = useRef<string | null>(null);
  useEffect(() => {
    let disposed = false; let unlisten: (() => void) | undefined;
    if (!isTauri()) return;
    void listen<unknown>("engine-event", ({ payload }) => {
      if (disposed) return;
      try {
        const event = validateEvent(payload);
        if (!belongsToJob(event, job.current)) return;
        if (event.type === "progress") setMessage(`${event.stage}: analyzing locally…`);
        else if (event.type === "complete") { setSnapshot(event.snapshot); setBusy(false); setMessage(`Analyzed ${event.snapshot.files.length} files locally.`); }
        else if (event.type === "error") { setSnapshot(null); setBusy(false); setMessage(event.message); }
      } catch { setSnapshot(null); setBusy(false); setMessage("Invalid engine response; retry analysis."); }
    }).then((dispose) => { if (disposed) dispose(); else { unlisten = dispose; setReady(true); } })
      .catch(() => setMessage("Native events unavailable; restart the application."));
    return () => { disposed = true; unlisten?.(); };
  }, []);
  async function analyze(selected: Repository) {
    const next = crypto.randomUUID(); job.current = next; setDisplayJob(next);
    setBusy(true); setSnapshot(null); setMessage("Starting local engine…");
    try { await invoke("start_analysis", { repositoryId: selected.repositoryId, jobId: next }); }
    catch (error) { if (job.current === next) { setBusy(false); setMessage(String(error)); } }
  }
  async function open() {
    setPicking(true);
    try {
      const selected = await invoke<Repository | null>("select_repository");
      if (selected) { job.current = null; setRepository(selected); setCoverage(false); await analyze(selected); }
    } catch (error) { setMessage(String(error)); }
    finally { setPicking(false); }
  }
  const projection = useMemo(() => snapshot ? projectSnapshot(snapshot) : null, [snapshot]);
  const operations: AnalysisOperations = {
    explainFile: async () => ({ ok: false, error: "External explanations are not enabled in this phase" }),
    explainFolder: async () => ({ ok: false, error: "External explanations are not enabled in this phase" }),
    repositoryHead: async () => ({ ok: false, error: "Local analysis has no GitHub HEAD" }),
    fileAtHead: async () => ({ ok: false, error: "Use local evidence hash verification" }),
    rerun: async () => { if (repository) await analyze(repository); return { error: null }; },
  };
  return <>
    <header className="flex h-10 shrink-0 items-center gap-3 border-b border-line px-3 text-xs">
      <strong>Codebase Intelligence</strong>
      <button className="rounded border border-line px-2 py-1 disabled:opacity-40" disabled={!ready || busy || picking} onClick={() => void open()}>Open repository</button>
      {repository && <button className="rounded border border-line px-2 py-1 disabled:opacity-40" disabled={busy || picking} onClick={() => void analyze(repository)}>Analyze again</button>}
      {busy && <button className="rounded border border-line px-2 py-1" onClick={() => void invoke("cancel_analysis", { jobId: job.current }).catch((error) => setMessage(String(error)))}>Cancel</button>}
      <span className="min-w-0 flex-1 truncate font-mono text-fg-muted" title={repository?.root}>{repository?.root}</span>
      <ThemeControl initial="system" />
    </header>
    <div role="status" className="flex shrink-0 items-center gap-3 border-b border-line px-3 py-1 text-[11px]">
      {message}
      {snapshot && <button className="ml-auto text-accent" onClick={() => setCoverage(!coverage)} aria-expanded={coverage}>Coverage & diagnostics ({snapshot.diagnostics.length})</button>}
    </div>
    {!ready && <p className="p-4 text-xs text-fg-muted">Repository selection requires the desktop app. Start it with pnpm desktop:dev.</p>}
    {snapshot && !snapshot.files.length && <p className="border-b border-line p-3 text-xs">No supported TypeScript/JavaScript files were parsed. This directory may be empty, contain unsupported languages, or have skipped files; inspect coverage for details.</p>}
    {snapshot && coverage && <CoveragePanel snapshot={snapshot} />}
    {snapshot && projection && <AnalysisView key={displayJob} {...projection} modelRoles={{}} analysisId={displayJob} commitSha="local"
      repository={{ name: repository?.root.split(/[\\/]/).filter(Boolean).at(-1) ?? "Repository", projects: snapshot.projects.map((p) => ({ path: p.path, adapter: p.extractor })), skipped: snapshot.coverage.files.skipped, unresolved: snapshot.coverage.relationships.unresolved }}
      operations={operations} evidence={(file) => <SourceEvidence key={`${displayJob}:${file}`} file={file} jobId={displayJob} snapshot={snapshot} />} />}
    {ready && !snapshot && !busy && <p className="p-4 text-xs text-fg-muted">Choose any local directory. Git metadata, accounts, and network access are unnecessary. Analyses are held in memory until the app closes.</p>}
  </>;
}
function CoveragePanel({ snapshot }: { snapshot: CodeSnapshot }) {
  const [page, setPage] = useState(0);
  const diagnostics = snapshot.diagnostics.slice(page * 100, (page + 1) * 100);
  return <section aria-label="Coverage and diagnostics" className="max-h-72 shrink-0 overflow-auto border-b border-line p-3 text-xs">
    <p>{snapshot.coverage.files.found} files found · {snapshot.coverage.files.parsed} parsed · {snapshot.coverage.files.skipped} skipped</p>
    <p>{snapshot.coverage.relationships.seen} import occurrences · {snapshot.coverage.relationships.internal} resolved internally · {snapshot.coverage.relationships.external} external · {snapshot.coverage.relationships.excluded} excluded · {snapshot.coverage.relationships.unresolved} unresolved</p>
    <pre className="my-2 whitespace-pre-wrap text-[10px]">{JSON.stringify({ bySyntax: snapshot.coverage.bySyntax, external: snapshot.coverage.external, excluded: snapshot.coverage.excluded, unresolved: snapshot.coverage.unresolved }, null, 2)}</pre>
    {diagnostics.map((d, i) => <p key={page * 100 + i} className="my-1 break-all"><span className="font-mono">{d.path}{d.line ? `:${d.line}` : ""}</span> · {d.category} · {d.reason}: {d.detail}</p>)}
    {snapshot.diagnostics.length === 0 && <p>No diagnostics reported.</p>}
    {snapshot.diagnostics.length > 100 && <div className="flex gap-3"><button disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button><span>Showing {page * 100 + 1}–{Math.min((page + 1) * 100, snapshot.diagnostics.length)} of {snapshot.diagnostics.length}</span><button disabled={(page + 1) * 100 >= snapshot.diagnostics.length} onClick={() => setPage(page + 1)}>Next</button></div>}
  </section>;
}
function SourceEvidence({ file, jobId, snapshot }: { file: string; jobId: string; snapshot: CodeSnapshot }) {
  const [result, setResult] = useState<EvidenceResult | null>(null), [error, setError] = useState<string | null>(null), [page, setPage] = useState(0);
  async function read() {
    setError(null); setResult(null);
    try {
      const response = await invoke<unknown>("read_evidence", { jobId, file });
      const event = validateEvent({ version: 1, requestId: "ui-evidence", jobId, type: "evidence", evidence: response });
      if (event.type === "evidence") setResult(event.evidence);
    } catch (error) { setError(String(error)); }
  }
  const relationships = snapshot.relationships.filter((r) => r.source === file);
  const routes = snapshot.routes.filter((r) => r.file === file);
  const lines = result?.state === "current" ? result.source.split("\n") : [];
  return <section className="p-3 text-[11px]">
    <button className="rounded border border-line px-2 py-1" onClick={() => void read()}>Read / recheck source</button>
    <p className="mt-1 text-fg-muted">Source is read locally and must match this snapshot&apos;s SHA-256 hash.</p>
    {error && <p role="alert" className="mt-2">{error}</p>}
    {result?.state === "stale" && <p role="alert" className="mt-2">Source changed since analysis. Analyze again to inspect matching evidence.</p>}
    {result?.state === "unavailable" && <p role="alert" className="mt-2">Source is missing, unreadable, or denied by the read policy.</p>}
    {result?.state === "current" && <><p className="mt-2">Hash verified · current source</p><pre className="mt-1 overflow-auto whitespace-pre text-[10px]">{lines.slice(page * 200, (page + 1) * 200).map((line, i) => `${page * 200 + i + 1}  ${line}`).join("\n")}</pre>{lines.length > 200 && <div className="mt-2 flex gap-3"><button disabled={page === 0} onClick={() => setPage(page - 1)}>Previous lines</button><button disabled={(page + 1) * 200 >= lines.length} onClick={() => setPage(page + 1)}>Next lines</button><span>{page * 200 + 1}–{Math.min((page + 1) * 200, lines.length)} / {lines.length}</span></div>}</>}
    <h3 className="mt-3">Verified relationship provenance</h3>
    {relationships.map((r) => <p key={r.id} className="my-2 break-all font-mono">{r.target} · {r.syntax}{r.typeOnly ? " · type-only" : ""}<br />line {r.evidence.line} · {r.evidence.description}<br />{r.evidence.extractor} · first occurrence</p>)}
    {routes.map((r, i) => <p key={i} className="my-2 break-all font-mono">{r.method} {r.pattern} · line {r.evidence.line}<br />{r.evidence.extractor} · declaration evidence</p>)}
    {!relationships.length && !routes.length && <p className="text-fg-muted">No outgoing import or route evidence reported for this file.</p>}
  </section>;
}
