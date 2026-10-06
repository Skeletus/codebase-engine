"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { belongsToJob, validateEvent, type EvidenceResult } from "@/lib/desktop/protocol";
import { projectSnapshot } from "@/lib/desktop/projection";
import { AnalysisContractsPanel } from "./analysis-contracts";
import type { CodeSnapshot } from "@/lib/engine/types";
import type { AnalysisOperations, ExplainResult } from "@/lib/analysis/operations";
import type { ExplanationSelection } from "@/lib/ai/selection";
import type { StoredRepository } from "@/lib/storage/types";
import { AnalysisView } from "./analysis-view";
import { ThemeControl } from "./theme-control";
import { Investigations } from "./investigations";
import { RankedInvestigation } from "./ranked-investigation";
import { PilotMeasurements } from "./pilot-measurements";
import { ExternalAi } from "./external-ai";
import { BehaviorTraces } from "./behavior-traces";
import { UiIcon, RepositoryPicker, Sidebar, PageHeading, StatusBadge, WarningBanner, FileSelector, type Workspace } from "./workspace-ui";

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
  const [analysisStage, setAnalysisStage] = useState("Starting local analysis");
  const [completion, setCompletion] = useState<string | null>(null);
  useEffect(() => {
    if (!completion) return;
    const timer = window.setTimeout(() => setCompletion(null), 6000);
    return () => window.clearTimeout(timer);
  }, [completion]);
  const watchingStarted = useRef<string | null>(null);
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [startupError, setStartupError] = useState(false);
  const [workspace, setWorkspace] = useState<Workspace>("map");
  const selectedRepository = useRef<Repository | null>(null), savedSnapshot = useRef<CodeSnapshot | null>(null);
  const reopening = useRef(false), recoveryMessage = useRef("");
  const [busy, setBusy] = useState(false), [picking, setPicking] = useState(false);
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
        else if (event.type === "progress") { setAnalysisStage(event.stage); setMessage(`${event.stage}: analyzing locally…`); }
        else if (event.type === "complete") {
          if (!recoveryMessage.current && !reopening.current) setCompletion(`Analysis ready · ${event.snapshot.files.length} files · ${event.snapshot.relationships.length} relationships`);
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
    setCompletion(null); setAnalysisStage(reopen ? "Loading stored snapshot" : "Starting local analysis");
    setBusy(true); setMessage(reopen ? "Loading stored analysis; no parsing…" : "Refreshing locally; previous analysis retained until publication…");
    try { await invoke(reopen ? "reopen_analysis" : "start_analysis", { repositoryId: selected.repositoryId, jobId: next }); }
    catch (error) { if (job.current === next) { setBusy(false); setMessage(`${String(error)}${savedSnapshot.current ? " Previous completed analysis is retained; choose Reopen to inspect it." : ""}`); } }
  }
  function select(selected: Repository) {
    job.current = null; selectedRepository.current = selected; savedSnapshot.current = null;
    setRepository(selected); setSnapshot(null);
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
  const projectName = repository?.root.split(/[\\/]/).filter(Boolean).at(-1) ?? "No repository selected";
  const warning = startupError || watchState === "degraded" || /failed|unavailable|invalid|incompatible|missing|cancelled|exited|denied|timed out/i.test(message);
  const statusLabel = startupError ? "Initialization unavailable" : busy ? "Analyzing locally" : watchState === "degraded" ? "Watcher unavailable" : snapshot ? "Stored analysis ready" : ready ? "Ready to open" : "Initializing";
  const content = (onReveal: (file: string, mode?: "map" | "evidence") => void, selectedFile: string | null) => <>
    <div className={workspace === "investigate" ? "workspace-page" : "hidden"}><PageHeading eyebrow="Local intelligence" title="Investigate" description="Describe what you want to find, then choose a related file. Get a prioritized list of connected files with evidence." />{snapshot && <RankedInvestigation snapshot={snapshot} jobId={displayJob} busy={busy} selectedFile={selectedFile} onReveal={onReveal} />}<details className="workspace-secondary"><summary>Structural Ask Codebase</summary>{snapshot && <Investigations snapshot={snapshot} jobId={displayJob} busy={busy} selectedFile={selectedFile} onReveal={onReveal} onExplain={operations.explainInvestigation} />}</details><details className="workspace-secondary"><summary>Static call traces</summary>{snapshot && <BehaviorTraces snapshot={snapshot} onReveal={onReveal} />}</details></div>
    <div className={workspace === "impact" ? "workspace-page" : "hidden"}><PageHeading eyebrow="Verified structure" title="Change impact" description="Inspect which files depend on a change, with deterministic reachability and verified witness paths." />{snapshot && <Investigations variant="impact" snapshot={snapshot} jobId={displayJob} busy={busy} selectedFile={selectedFile} onReveal={onReveal} onExplain={operations.explainInvestigation} />}</div>
    <div className={workspace === "evidence" ? "workspace-page" : "hidden"}><PageHeading eyebrow="Verified structure" title="Evidence" description="Inspect local source and relationship provenance. Source is shown only after its snapshot hash is verified." />{snapshot && <EvidenceWorkspace snapshot={snapshot} jobId={displayJob} busy={busy} selectedFile={selectedFile} onSelect={(file) => onReveal(file, "evidence")} />}</div>
    <div className={workspace === "laya" ? "workspace-page" : "hidden"}><PageHeading eyebrow="System-1 · local" title="Laya" description="Laya prioritizes which verified dependencies should be inspected first." /><div className="reading-panel"><h2>A guide through the graph</h2><p>Choose a goal and an exact starting file in Investigate. The local ranker scores existing candidates; the controller follows verified dependency witnesses. It never creates structural facts.</p><button className="button-primary" onClick={() => setWorkspace("investigate")}>Start an investigation</button><h2 className="mt-8">Always a deterministic path</h2><p>Choose deterministic mode at any time. Missing models, timeouts, unsupported goals or inference failures leave structural operations available. Every fallback is visible in the investigation result.</p><details className="mt-4"><summary>Model and qualification</summary><p className="mt-3">laya-nav-1 · 16-feature local scorer. Synthetic Windows qualification is not evidence of real developer productivity. Current model availability is established during an investigation, not assumed from installation.</p></details></div></div>
  </>;
  return <div className="desktop-workspace">
    <Sidebar active={workspace} onNavigate={setWorkspace} />
    <div className="workspace-body">
      <header className="project-header"><div className="repository-header-controls"><RepositoryPicker repositories={repositories} selectedId={repository?.repositoryId} disabled={!ready || busy || picking} onOpen={() => void open()} onSelect={(id) => void reopen(id)} /></div><div className="flex shrink-0 items-center gap-3"><StatusBadge compact tone={warning ? "warning" : snapshot ? "good" : "neutral"}>{statusLabel}</StatusBadge>{busy && <button className="button-danger" onClick={() => void invoke("cancel_analysis", { jobId: job.current }).catch((error) => setMessage(String(error)))}>Cancel analysis</button>}{repository && <details className="action-menu"><summary aria-label="Repository actions" title="Repository actions"><UiIcon name="more" /></summary><div className="action-menu-content"><button disabled={busy || picking || !repository.available} onClick={() => void analyze(repository)}><UiIcon name="refresh" />Full refresh</button><button disabled={busy || picking} onClick={() => void reopen(repository.repositoryId)}><UiIcon name="reopen" />Reopen stored analysis</button>{snapshot && <button disabled={busy || picking} onClick={() => void invoke("control_watching", { jobId: job.current, action: watchState === "watching" ? "stop" : "start" }).catch((error) => setMessage(String(error)))}><UiIcon name={watchState === "watching" ? "pause" : "play"} />{watchState === "watching" ? "Pause watching" : "Resume watching"}</button>}<button className="text-red-400" disabled={busy || picking} onClick={() => void forget()}><UiIcon name="trash" />Forget repository…</button></div></details>}</div></header>
      <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        {warning && <div className="px-5 pt-3"><WarningBanner title={statusLabel === "Stored analysis ready" ? "Operation needs attention" : statusLabel} details={message}>{watchState === "degraded" ? "Automatic watching is unavailable. Manual refresh remains available." : snapshot ? "Your stored analysis is retained. Review Diagnostics for details and recovery controls." : "The operation could not finish. Review Diagnostics for details and recovery controls."}{startupError && <button className="ml-3 underline" onClick={() => window.location.reload()}>Reload application</button>}</WarningBanner></div>}
        <div className={["map", "routes", "investigate", "impact", "evidence", "laya"].includes(workspace) ? "relative flex min-h-0 flex-1 flex-col" : "hidden"}>{snapshot && projection ? <AnalysisView key={displayJob + ":" + revision} {...projection} modelRoles={{}} workspace={workspace} onWorkspaceChange={setWorkspace} workspaceContent={content}
          repository={{ name: projectName, projects: snapshot.projects.map((p) => ({ path: p.path, adapter: p.extractor })), skipped: snapshot.coverage.files.skipped, unresolved: snapshot.coverage.relationships.unresolved }} operations={operations} analysisActivity={{ busy, stage: analysisStage, onCancel: () => void invoke("cancel_analysis", { jobId: job.current }).catch((error) => setMessage(String(error))) }} explanationSetup={{ provider: aiProvider, onConfigure: () => setWorkspace("ai") }} evidence={(file) => <SourceEvidence key={displayJob + ":" + file} file={file} jobId={displayJob} snapshot={snapshot} busy={busy} />} /> : <div className="empty-workspace">{busy && <AnalysisAnimation stage={analysisStage} />}<h1>{busy ? "Preparing your workspace" : "Understand your codebase."}</h1><p>{busy ? "Analysis runs locally. Your previous completed snapshot remains safe." : "Open a repository to explore its structure, investigate dependencies and inspect change impact."}</p>{!busy && <button className="button-primary" disabled={!ready || picking} onClick={() => void open()}>Open local repository</button>}<span className="eyebrow">Local-first · private by default</span>{!ready && <p className="text-xs">Launch the desktop app with pnpm start. Native repository selection is required.</p>}</div>}</div>
        <div className={workspace === "diagnostics" ? "workspace-page" : "hidden"}><PageHeading eyebrow="System" title="Diagnostics" description="Analysis coverage, local runtime status and recovery controls." /><details open className="workspace-secondary"><summary>Runtime status</summary><p className="mt-3 break-all font-mono text-xs">{message}</p><p className="mt-3 text-fg-muted">{repository?.updatedAt ? "Stored snapshot: " + repository.updatedAt : "No completed snapshot"}{repository?.lastJob ? " · Last refresh: " + repository.lastJob.state : ""}</p>{repository && !repository.available && <p className="mt-2">Repository root is unavailable. This graph is historical; restore the directory or open its new location.</p>}</details>{snapshot && <CoveragePanel key={displayJob + ":" + revision} snapshot={snapshot} jobId={displayJob} busy={busy} />}<details className="workspace-secondary"><summary>Developer controls</summary><p className="my-3 text-fg-muted">Simulating watcher loss stops automatic updates. Resume watching or run a full refresh to recover.</p><button disabled={!snapshot || busy || picking} className="button-secondary" onClick={() => void invoke("control_watching", { jobId: job.current, action: "simulate-loss" }).catch((error) => setMessage(String(error)))}>Simulate watcher loss</button></details></div>
        <div className={workspace === "measurements" ? "workspace-page" : "hidden"}><PageHeading eyebrow="System" title="Pilot measurements" description="Local task timing and numeric feedback. No repository identifiers or source are recorded." /><PilotMeasurements /></div>
        <div className={workspace === "settings" ? "workspace-page" : "hidden"}><PageHeading eyebrow="System" title="Settings" description="Make this workspace comfortable for daily use." /><div className="reading-panel"><h2>Appearance</h2><p className="mb-4">Follow your system or choose a persistent theme.</p><ThemeControl initial="system" /><h2 className="mt-8">Optional AI</h2><p>Provider credentials and models are configured separately from local analysis.</p><button className="button-secondary" onClick={() => setWorkspace("ai")}>Manage AI explanations</button></div></div>
        <div className={workspace === "ai" || explanation ? "workspace-page" : "hidden"}><PageHeading eyebrow="Optional · approved context" title="AI explanations" description="Choose remote BYOK or an installed local agent. Every explanation invocation requires exact-payload approval." /><ExternalAi key={displayJob + ":" + revision + ":" + (explanation ? "approval" : "settings")} showSettings={workspace === "ai"} provider={aiProvider} onProviderChange={setAiProvider} jobId={displayJob} pending={explanation} onResult={finishExplanation} /></div>
      </main>
      {completion && <div className="analysis-complete-toast" role="status"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg><span>{completion}</span><button type="button" aria-label="Dismiss analysis notification" onClick={() => setCompletion(null)}>×</button></div>}
      <footer className="workspace-status"><span role="status">{busy ? "Local analysis in progress" : snapshot ? snapshot.files.length + " files · " + snapshot.relationships.length + " relationships" : "Local engine"}</span><span>{watchState === "watching" ? "Watching" : watchState === "refreshing" ? "Refreshing" : "Watching paused"}</span><span className="ml-auto">Local analysis · no cloud required</span></footer>
    </div>
  </div>;
}
function EvidenceWorkspace({ snapshot, jobId, busy, selectedFile, onSelect }: { snapshot: CodeSnapshot; jobId: string; busy: boolean; selectedFile: string | null; onSelect: (file: string) => void }) {
  const chosen = selectedFile || "";
  return <div className="reading-panel"><FileSelector files={snapshot.files.map((f) => f.id)} label="Evidence file" value={chosen} onChange={onSelect} disabled={busy} />{chosen ? <SourceEvidence key={jobId + ":" + chosen} file={chosen} jobId={jobId} snapshot={snapshot} busy={busy} /> : <p className="mt-8 text-fg-muted">Select an analyzed file to inspect its verified evidence.</p>}</div>;
}

function CoveragePanel({ snapshot, jobId, busy }: { snapshot: CodeSnapshot; jobId: string; busy: boolean }) {
  const [page, setPage] = useState(0);
  const diagnostics = snapshot.diagnostics.slice(page * 100, (page + 1) * 100);
  return <section aria-label="Coverage and diagnostics" className="workspace-secondary text-xs">
    <h2 className="mb-3 text-sm font-medium">Analysis coverage</h2>
    <AnalysisContractsPanel snapshot={snapshot} jobId={jobId} busy={busy} />
    <p>{snapshot.coverage.files.found} files found · {snapshot.coverage.files.parsed} parsed · {snapshot.coverage.files.skipped} skipped</p>
    <p>{snapshot.coverage.relationships.seen} import occurrences · {snapshot.coverage.relationships.internal} resolved internally · {snapshot.coverage.relationships.external} external · {snapshot.coverage.relationships.excluded} excluded · {snapshot.coverage.relationships.unresolved} unresolved</p>
    <details className="my-4"><summary>Resolution and syntax details</summary><pre className="my-2 whitespace-pre-wrap text-[11px]">{JSON.stringify({ bySyntax: snapshot.coverage.bySyntax, external: snapshot.coverage.external, excluded: snapshot.coverage.excluded, unresolved: snapshot.coverage.unresolved }, null, 2)}</pre></details>
    {diagnostics.map((d, i) => <p key={page * 100 + i} className="my-1 break-all"><span className="font-mono">{d.path}{d.line ? `:${d.line}` : ""}</span> · {d.category} · {d.reason}: {d.detail}</p>)}
    {snapshot.diagnostics.length === 0 && <p>No diagnostics reported.</p>}
    {snapshot.diagnostics.length > 100 && <div className="flex gap-3"><button disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button><span>Showing {page * 100 + 1}–{Math.min((page + 1) * 100, snapshot.diagnostics.length)} of {snapshot.diagnostics.length}</span><button disabled={(page + 1) * 100 >= snapshot.diagnostics.length} onClick={() => setPage(page + 1)}>Next</button></div>}
  </section>;
}
function SourceEvidence({ file, jobId, snapshot, busy }: { file: string; jobId: string; snapshot: CodeSnapshot; busy: boolean }) {
  const [result, setResult] = useState<EvidenceResult | null>(null), [error, setError] = useState<string | null>(null), [page, setPage] = useState(0);
  async function read() {
    setError(null); setResult(null); setPage(0);
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
    <button className="rounded border border-line px-2 py-1 disabled:opacity-40" disabled={busy} onClick={() => void read()}>Check source / recheck</button>
    <p className="mt-1 text-fg-muted">Checks this file locally against the analyzed snapshot. Nothing is sent outside your machine.</p>
    {!result && !error && <p className="mt-2 text-fg-muted">Freshness not checked. Findings below belong to the analyzed snapshot.</p>}
    {error && <p role="alert" className="mt-2">Source check failed: {error}</p>}
    {result?.state === "stale" && <p role="alert" className="mt-2">Source changed or was deleted since this snapshot. Refresh to inspect matching evidence. The stored relationship remains historical evidence.</p>}
    {result?.state === "unavailable" && <p role="alert" className="mt-2">Source is missing, unreadable, or denied by the read policy.</p>}
    {result?.state === "current" && <><p className="mt-2 text-incoming">Source matched the analysis at the last check.</p><details className="mt-2"><summary>Show source with line numbers</summary><pre className="mt-1 overflow-auto whitespace-pre text-[10px]">{lines.slice(page * 200, (page + 1) * 200).map((line, i) => `${page * 200 + i + 1}  ${line}`).join("\n")}</pre>{lines.length > 200 && <div className="mt-2 flex gap-3"><button disabled={page === 0} onClick={() => setPage(page - 1)}>Previous lines</button><button disabled={(page + 1) * 200 >= lines.length} onClick={() => setPage(page + 1)}>Next lines</button><span>{page * 200 + 1}–{Math.min((page + 1) * 200, lines.length)} / {lines.length}</span></div>}</details></>}
    <details open className="mt-4 evidence-relationships"><summary className="overview-section-heading"><svg className="section-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg>Relationships ({relationships.length})</summary>
    {relationships.map((r) => <div key={r.id} className="border-b border-line py-3">
      <p>Imports <span className="font-mono" title={r.target}>{r.target.split("/").pop()}</span>{r.typeOnly ? " · type-only dependency" : ""}</p>
      <p className="mt-1 text-fg-muted">Found in {file.split("/").pop()}, line {r.evidence.line}.</p>
      <details className="mt-1 text-fg-muted"><summary>Technical details</summary><p className="break-all font-mono">Target: {r.target}<br />Syntax: {r.syntax}<br />Import string: {r.evidence.description}<br />Extractor: {r.evidence.extractor}<br />First recorded occurrence · snapshot evidence</p></details>
    </div>)}
    </details>
    {routes.length > 0 && <details open className="mt-4 evidence-relationships"><summary className="overview-section-heading"><svg className="section-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg>Route declarations ({routes.length})</summary>
    {routes.map((r, i) => <div key={i} className="border-b border-line py-3"><p className="break-all font-mono">{r.method} {r.pattern}</p><p className="mt-1 text-fg-muted">Declared in {file.split("/").pop()}, line {r.evidence.line}.</p><details className="mt-1 text-fg-muted"><summary>Technical details</summary>{r.evidence.extractor} · declaration evidence</details></div>)}
    </details>}
    <details className="mt-4"><summary className="text-sm font-semibold">Symbols ({declarations.length})</summary>
    {declarations.slice(0, 50).map((d) => <div key={d.id} className="border-b border-line py-3"><p>{d.kind} <span className="font-mono">{d.name}</span>{d.callable ? " · callable" : ""}</p><p className="mt-1 text-fg-muted">Declared at lines {d.site.line}–{d.site.endLine}.</p><details className="mt-1 text-fg-muted"><summary>Technical details</summary><p className="break-all font-mono">UTF-16 [{d.site.start}, {d.site.end})<br />{d.site.fileHash}<br />{d.site.extractor}</p></details></div>)}
    </details>
    <details className="mt-4"><summary className="text-sm font-semibold">References and static calls ({symbolRelations.length})</summary>
    <p className="mt-2 text-fg-muted">Static calls are possible connections, not proof of runtime execution.</p>
    {symbolRelations.slice(0, 50).map((r) => <div key={r.id} className="border-b border-line py-3"><p>{r.relation}: <span className="font-mono">{names.get(r.target)?.name ?? "Unresolved display name"}</span></p><p className="mt-1 text-fg-muted">Found at lines {r.site.line}–{r.site.endLine}{r.conditional ? " · conditional possibility" : ""}.</p><p className="break-all font-mono text-fg-muted">Target: {names.get(r.target)?.site.file}:{names.get(r.target)?.site.line}</p><details className="mt-1 text-fg-muted"><summary>Technical details</summary><p className="break-all font-mono">UTF-16 [{r.site.start}, {r.site.end})<br />{r.site.fileHash}<br />{r.site.extractor}</p></details></div>)}
    </details>
    {(declarations.length > 50 || symbolRelations.length > 50) && <p>Details lists show the first 50 of each kind. Use Static call traces to select a callable and bound its evidence separately.</p>}
    {!relationships.length && !routes.length && <p className="text-fg-muted">No outgoing import or route evidence reported for this file.</p>}
  </section>;
}

function AnalysisAnimation({ stage }: { stage: string }) {
  const nodes = [[30, 90], [120, 35], [120, 145], [220, 60], [220, 125], [310, 90]];
  const links = [[0, 1], [0, 2], [1, 3], [2, 4], [3, 5], [4, 5]];
  return <div className="analysis-animation"><svg viewBox="0 0 340 180" aria-hidden="true">{links.map(([from, to], i) => <path key={i} className="analysis-loading-edge" style={{ animationDelay: `${i * 180}ms` }} d={`M${nodes[from][0]} ${nodes[from][1]} L${nodes[to][0]} ${nodes[to][1]}`} pathLength="1" />)}{nodes.map(([x, y], i) => <rect key={i} className="analysis-loading-node" style={{ animationDelay: `${i * 180}ms` }} x={x - 14} y={y - 10} width="28" height="20" />)}</svg><p role="status">{stage}</p><p className="text-xs text-fg-muted">Loading illustration · verified map appears when analysis completes</p></div>;
}
