"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { belongsToJob, validateEvent, type EvidenceResult } from "@/lib/desktop/protocol";
import { projectSnapshot } from "@/lib/desktop/projection";
import type { CodeSnapshot } from "@/lib/engine/types";
import type { AnalysisOperations, ExplainResult } from "@/lib/analysis/operations";
import type { ExplanationSelection } from "@/lib/ai/selection";
import type { StoredRepository } from "@/lib/storage/types";
import { AnalysisView } from "./analysis-view";
import { ThemeControl } from "./theme-control";
import { Investigations } from "./investigations";
import { PilotMeasurements } from "./pilot-measurements";
import { ExternalAi } from "./external-ai";
import { BehaviorTraces } from "./behavior-traces";

type Repository = StoredRepository;
export function DesktopExplorer() {
  const [aiProvider, setAiProvider] = useState("");
  const [explanation, setExplanation] = useState<ExplanationSelection | null>(null);
  const explanationReply = useRef<((result: ExplainResult) => void) | null>(null);
  function finishExplanation(result: ExplainResult) { explanationReply.current?.(result); explanationReply.current = null; setExplanation(null); }
  function explain(selection: ExplanationSelection): Promise<ExplainResult> {
    if (explanationReply.current) return Promise.resolve({ ok: false, error: "Finish the active explanation first" });
    return new Promise((resolve) => { explanationReply.current = resolve; setExplanation(selection); });
  }
  const [ready, setReady] = useState(false), [repository, setRepository] = useState<Repository | null>(null);
  const [snapshot, setSnapshot] = useState<CodeSnapshot | null>(null), [message, setMessage] = useState("Initializing native events and local storage…");
  const [displayJob, setDisplayJob] = useState("");
  const [revision, setRevision] = useState(0);
  const [watchState, setWatchState] = useState("paused");
  const watchingStarted = useRef<string | null>(null);
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [startupError, setStartupError] = useState(false);
  const [measurementsOpen, setMeasurementsOpen] = useState(false);
  const selectedRepository = useRef<Repository | null>(null), savedSnapshot = useRef<CodeSnapshot | null>(null);
  const reopening = useRef(false), recoveryMessage = useRef("");
  const [busy, setBusy] = useState(false), [picking, setPicking] = useState(false), [coverage, setCoverage] = useState(false);
  const job = useRef<string | null>(null);
  useEffect(() => {
    window.dispatchEvent(new Event("desktop-ui-ready"));
    let disposed = false; let unlisten: (() => void) | undefined;
    if (!isTauri()) return;
    const startupDeadline = setTimeout(() => {
      if (!disposed && !unlisten) { setStartupError(true); setMessage("Native event initialization timed out. Reload the application to retry."); }
    }, 10000);
    void listen<unknown>("engine-event", ({ payload }) => {
      if (disposed) return;
      try {
        const event = validateEvent(payload);
        if (!belongsToJob(event, job.current)) return;
        if (event.type === "watch") {
          setWatchState(event.status.state); setBusy(event.status.state === "refreshing");
          setMessage(`${event.status.message} · ${event.status.mode} · parsed ${event.status.parsed}, reused ${event.status.reused} · ${event.status.elapsedMs}ms · RSS ${Math.round(event.status.memoryBytes / 1048576)}MiB · snapshot ${event.status.snapshotBytes} bytes`);
          if (event.status.state === "refreshing") { explanationReply.current?.({ ok: false, error: "Snapshot refreshing; prepare again after publication" }); explanationReply.current = null; setExplanation(null); }
        }
        else if (event.type === "progress") setMessage(`${event.stage}: analyzing locally…`);
        else if (event.type === "complete") {
          savedSnapshot.current = event.snapshot; setSnapshot(event.snapshot); setDisplayJob(event.jobId); setBusy(false);
          setRevision((n) => n + 1);
          if (!recoveryMessage.current && watchingStarted.current !== event.jobId && selectedRepository.current?.available) {
            watchingStarted.current = event.jobId;
            void invoke("control_watching", { jobId: event.jobId, action: "start" }).catch((error) => { setWatchState("degraded"); setMessage(`Watcher unavailable: ${String(error)}. Full refresh remains available.`); });
          }
          setMessage(recoveryMessage.current || (reopening.current ? `Reopened stored analysis (${event.snapshot.files.length} files); source freshness is checked when inspected.` : `Published ${event.snapshot.files.length} files locally.`));
          recoveryMessage.current = "";
          void invoke<Repository[]>("list_repositories").then((list) => { if (!disposed) { setRepositories(list); const current = list.find((r) => r.repositoryId === selectedRepository.current?.repositoryId); if (current) { selectedRepository.current = current; setRepository(current); } } }).catch((error) => setMessage(`Analysis ready; repository list failed: ${String(error)}`));
        }
        else if (event.type === "error") {
          setMessage(event.message); setBusy(false); setWatchState("paused");
          void invoke<Repository[]>("list_repositories").then((list) => { if (!disposed) { setRepositories(list); const current = list.find((r) => r.repositoryId === selectedRepository.current?.repositoryId); if (current) { selectedRepository.current = current; setRepository(current); } } }).catch(() => { /* The original operation error remains visible; Reopen retries storage. */ });
          if (!reopening.current && savedSnapshot.current && selectedRepository.current) {
            const next = crypto.randomUUID(); job.current = next; reopening.current = true; recoveryMessage.current = `${event.message} Showing the stored completed analysis.`; setBusy(true);
            void invoke("reopen_analysis", { repositoryId: selectedRepository.current.repositoryId, jobId: next }).catch((error) => { setBusy(false); setMessage(`${event.message} Stored analysis retained; reopen it to retry: ${String(error)}`); });
          }
        }
      } catch { setBusy(false); setMessage("Invalid engine response; stored analysis retained. Reopen it to retry."); }
    }).then((dispose) => {
      if (disposed) dispose(); else {
        clearTimeout(startupDeadline); unlisten = dispose; setReady(true);
        void invoke<Repository[]>("list_repositories").then((list) => { if (!disposed) { setRepositories(list); setStartupError(false); if (!job.current) setMessage("Open a local repository or choose a stored analysis."); } }).catch((error) => { if (!disposed) { setStartupError(true); setMessage(`Local storage initialization failed: ${String(error).slice(0, 500)}. Reload to retry; stored data has not been deleted.`); } });
      }
    })
      .catch(() => { clearTimeout(startupDeadline); if (!disposed) { setStartupError(true); setMessage("Native events unavailable; reload the application to retry."); } });
    return () => { disposed = true; clearTimeout(startupDeadline); unlisten?.(); };
  }, []);
  async function analyze(selected: Repository, reopen = false) {
    const next = crypto.randomUUID(); job.current = next; reopening.current = reopen; recoveryMessage.current = "";
    setBusy(true); setMessage(reopen ? "Loading stored analysis; no parsing…" : "Refreshing locally; previous analysis retained until publication…");
    try { await invoke(reopen ? "reopen_analysis" : "start_analysis", { repositoryId: selected.repositoryId, jobId: next }); }
    catch (error) { if (job.current === next) { setBusy(false); setMessage(`${String(error)}${savedSnapshot.current ? " Previous completed analysis is retained; choose Reopen to inspect it." : ""}`); } }
  }
  function select(selected: Repository) {
    job.current = null; selectedRepository.current = selected; savedSnapshot.current = null;
    setRepository(selected); setSnapshot(null); setCoverage(false);
  }
  async function reopen(repositoryId: string) {
    setPicking(true);
    try {
      const selected = await invoke<Repository>("open_repository", { repositoryId });
      select(selected);
      if (selected.snapshotState === "compatible") await analyze(selected, true);
      else setMessage(selected.snapshotState === "incompatible" ? "Stored analysis is incompatible. Refresh to reanalyze; stored data is retained." : "No completed analysis yet. Refresh this repository to analyze it.");
    } catch (error) { setMessage(String(error)); }
    finally { setPicking(false); }
  }
  async function forget() {
    if (!repository || !window.confirm("Forget this repository and delete its local analysis/job/settings records? Source files remain untouched.")) return;
    setPicking(true);
    try {
      await invoke("forget_repository", { repositoryId: repository.repositoryId });
      selectedRepository.current = null; savedSnapshot.current = null; job.current = null;
      setRepository(null); setSnapshot(null); setMessage("Local records deleted. Repository source files were not changed.");
      setRepositories(await invoke<Repository[]>("list_repositories"));
    } catch (error) { setMessage(String(error)); }
    finally { setPicking(false); }
  }
  async function open() {
    setPicking(true);
    try {
      const selected = await invoke<Repository | null>("select_repository");
      if (selected) { select(selected); setRepositories(await invoke<Repository[]>("list_repositories")); if (selected.snapshotState === "compatible") await analyze(selected, true); else await analyze(selected); }
    } catch (error) { setMessage(String(error)); }
    finally { setPicking(false); }
  }
  const projection = useMemo(() => snapshot ? projectSnapshot(snapshot) : null, [snapshot]);
  const operations: AnalysisOperations = {
    explainFile: (path) => explain({ kind: "file", path }),
    explainFolder: (path) => explain({ kind: "folder", path: path === "." ? "" : path }),
    explainInvestigation: (query) => explain({ kind: "investigation", query }),
  };
  return <>
    <header className="flex h-10 shrink-0 items-center gap-3 border-b border-line px-3 text-xs">
      <strong>Codebase Intelligence</strong>
      <button className="rounded border border-line px-2 py-1 disabled:opacity-40" disabled={!ready || busy || picking} onClick={() => void open()}>Open repository</button>
      {repositories.length > 0 && <select aria-label="Stored repositories" className="max-w-64 rounded border border-line bg-canvas px-2 py-1" value={repository?.repositoryId ?? ""} disabled={!ready || busy || picking} onChange={(event) => { if (event.target.value) void reopen(event.target.value); }}><option value="">Stored repositories…</option>{repositories.map((r) => <option key={r.repositoryId} value={r.repositoryId}>{r.root}{!r.available ? " · root unavailable" : ""}{r.snapshotState === "incompatible" ? " · reanalysis required" : ""}</option>)}</select>}
      {repository && <><button className="rounded border border-line px-2 py-1 disabled:opacity-40" disabled={busy || picking || !repository.available} onClick={() => void analyze(repository)}>Full refresh</button><button className="rounded border border-line px-2 py-1 disabled:opacity-40" disabled={busy || picking} onClick={() => void reopen(repository.repositoryId)}>Reopen</button><button className="rounded border border-line px-2 py-1 disabled:opacity-40" disabled={busy || picking} onClick={() => void forget()}>Forget</button></>}
      {snapshot && <><button disabled={busy || picking} onClick={() => void invoke("control_watching", { jobId: job.current, action: watchState === "watching" ? "stop" : "start" }).catch((error) => setMessage(String(error)))}>{watchState === "watching" ? "Pause watching" : "Resume watching"}</button><button disabled={busy || picking} onClick={() => void invoke("control_watching", { jobId: job.current, action: "simulate-loss" }).catch((error) => setMessage(String(error)))}>Simulate watcher loss</button></>}
      {busy && <button className="rounded border border-line px-2 py-1" onClick={() => void invoke("cancel_analysis", { jobId: job.current }).catch((error) => setMessage(String(error)))}>Cancel</button>}
      <span className="min-w-0 flex-1 truncate font-mono text-fg-muted" title={repository?.root}>{repository?.root}</span>
      <ThemeControl initial="system" />
      <ExternalAi key={`${displayJob}:${revision}:${explanation ? "approval" : "settings"}`} provider={aiProvider} onProviderChange={setAiProvider} jobId={displayJob} pending={explanation} onResult={finishExplanation} />
      <button className="text-accent" onClick={() => setMeasurementsOpen(!measurementsOpen)} aria-expanded={measurementsOpen}>Pilot measurements</button>
    </header>
    {repository && <p className="shrink-0 border-b border-line px-3 py-1 text-[11px] text-fg-muted">{repository.updatedAt ? `Stored snapshot: ${repository.updatedAt}` : "No completed snapshot"}{repository.lastJob ? ` · Last refresh: ${repository.lastJob.state}` : ""}{!repository.available ? " · Root missing, moved or inaccessible. Historical graph only; restore the directory at its registered path or open its new location." : " · Source is checked against the snapshot before display."}</p>}
    <div role="status" className="flex shrink-0 items-center gap-3 border-b border-line px-3 py-1 text-[11px]">
      {message}
      {startupError && <button className="text-accent" onClick={() => window.location.reload()}>Reload application</button>}
      {snapshot && <button className="ml-auto text-accent" onClick={() => setCoverage(!coverage)} aria-expanded={coverage}>Coverage & diagnostics ({snapshot.diagnostics.length})</button>}
    </div>
    <div className={measurementsOpen ? "contents" : "hidden"}><PilotMeasurements /></div>
    {!ready && <p className="p-4 text-xs text-fg-muted">Repository selection requires the desktop app. Start it with pnpm desktop:dev.</p>}
    {snapshot && !snapshot.files.length && <p className="border-b border-line p-3 text-xs">No supported TypeScript/JavaScript files were parsed. This directory may be empty, contain unsupported languages, or have skipped files; inspect coverage for details.</p>}
    {snapshot && coverage && <CoveragePanel snapshot={snapshot} />}
    {snapshot && projection && <AnalysisView key={`${displayJob}:${revision}`} {...projection} modelRoles={{}}
      repository={{ name: repository?.root.split(/[\\/]/).filter(Boolean).at(-1) ?? "Repository", projects: snapshot.projects.map((p) => ({ path: p.path, adapter: p.extractor })), skipped: snapshot.coverage.files.skipped, unresolved: snapshot.coverage.relationships.unresolved }}
      operations={operations} evidence={(file) => <SourceEvidence key={`${displayJob}:${file}`} file={file} jobId={displayJob} snapshot={snapshot} busy={busy} />}
      investigations={(onReveal, selectedFile) => <div className="h-full overflow-auto"><BehaviorTraces snapshot={snapshot} onReveal={onReveal} /><Investigations snapshot={snapshot} jobId={displayJob} busy={busy} selectedFile={selectedFile} onReveal={onReveal} onExplain={operations.explainInvestigation} /></div>} />}
    {ready && !snapshot && !busy && <p className="p-4 text-xs text-fg-muted">Choose a local directory or reopen a stored repository. Complete analyses are saved in application-owned SQLite storage; Git metadata, accounts, and network access are unnecessary.</p>}
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
function SourceEvidence({ file, jobId, snapshot, busy }: { file: string; jobId: string; snapshot: CodeSnapshot; busy: boolean }) {
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
  const declarations = snapshot.behavior.declarations.filter((d) => d.site.file === file);
  const symbolRelations = snapshot.behavior.relations.filter((r) => r.site.file === file);
  const names = new Map(snapshot.behavior.declarations.map((d) => [d.id, d]));
  const lines = result?.state === "current" ? result.source.split("\n") : [];
  return <section className="p-3 text-[11px]">
    <button className="rounded border border-line px-2 py-1 disabled:opacity-40" disabled={busy} onClick={() => void read()}>Read / recheck source</button>
    <p className="mt-1 text-fg-muted">Source is read locally and must match this snapshot&apos;s SHA-256 hash.</p>
    {error && <p role="alert" className="mt-2">{error}</p>}
    {result?.state === "stale" && <p role="alert" className="mt-2">Source changed or was deleted since this snapshot. Refresh to inspect matching evidence. The stored relationship remains historical evidence.</p>}
    {result?.state === "unavailable" && <p role="alert" className="mt-2">Source is missing, unreadable, or denied by the read policy.</p>}
    {result?.state === "current" && <><p className="mt-2">Hash verified · current source</p><pre className="mt-1 overflow-auto whitespace-pre text-[10px]">{lines.slice(page * 200, (page + 1) * 200).map((line, i) => `${page * 200 + i + 1}  ${line}`).join("\n")}</pre>{lines.length > 200 && <div className="mt-2 flex gap-3"><button disabled={page === 0} onClick={() => setPage(page - 1)}>Previous lines</button><button disabled={(page + 1) * 200 >= lines.length} onClick={() => setPage(page + 1)}>Next lines</button><span>{page * 200 + 1}–{Math.min((page + 1) * 200, lines.length)} / {lines.length}</span></div>}</>}
    <h3 className="mt-3">Verified relationship provenance</h3>
    {relationships.map((r) => <p key={r.id} className="my-2 break-all font-mono">{r.target} · {r.syntax}{r.typeOnly ? " · type-only" : ""}<br />line {r.evidence.line} · {r.evidence.description}<br />{r.evidence.extractor} · first occurrence</p>)}
    {routes.map((r, i) => <p key={i} className="my-2 break-all font-mono">{r.method} {r.pattern} · line {r.evidence.line}<br />{r.evidence.extractor} · declaration evidence</p>)}
    <h3 className="mt-3">Symbol declarations ({declarations.length})</h3>
    {declarations.slice(0, 50).map((d) => <p key={d.id} className="my-2 break-all font-mono">{d.kind} {d.name}{d.callable ? " · callable" : ""} · lines {d.site.line}–{d.site.endLine} · UTF-16 [{d.site.start}, {d.site.end})<br />{d.site.fileHash} · {d.site.extractor}</p>)}
    <h3 className="mt-3">Verified references / static calls ({symbolRelations.length})</h3>
    {symbolRelations.slice(0, 50).map((r) => <p key={r.id} className="my-2 break-all font-mono">{r.relation}: {names.get(r.target)?.name} · {names.get(r.target)?.site.file}:{names.get(r.target)?.site.line}<br />Site lines {r.site.line}–{r.site.endLine} · UTF-16 [{r.site.start}, {r.site.end}) · {r.conditional ? "conditional possibility" : "static evidence"}<br />{r.site.fileHash} · {r.site.extractor}</p>)}
    {(declarations.length > 50 || symbolRelations.length > 50) && <p>Details lists show the first 50 of each kind. Use Static call traces to select a callable and bound its evidence separately.</p>}
    {!relationships.length && !routes.length && <p className="text-fg-muted">No outgoing import or route evidence reported for this file.</p>}
  </section>;
}
