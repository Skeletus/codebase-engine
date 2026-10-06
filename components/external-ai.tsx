"use client";

import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ExplanationSelection } from "@/lib/ai/selection";
import { PayloadPreview } from "./payload-preview";
import { UiIcon } from "./workspace-ui";
import type { ExplainResult } from "@/lib/analysis/operations";

type ProviderOption = { id: string; label: string; endpoint: string; models: string[]; kind: "remote-byok" | "local-agent"; available: boolean; status: string };
type Configuration = { configured: boolean; provider: string; model?: string; catalog: ProviderOption[]; error?: string };
type Prepared = { ticket: string; provider: string; model: string; endpoint: string; kind: "remote-byok" | "local-agent"; payload: string; files: string[]; ids: string[]; references: { id: string; path: string }[]; cached: { body: string; citations: string[] } | null };
type Answer = { answer: { body: string; citations: string[] }; provider: string; model: string; cached: boolean; cacheSaved?: boolean };
export function ExternalAi({ provider, onProviderChange, jobId, pending, onResult, showSettings = false }: { provider: string; onProviderChange: (provider: string) => void; jobId: string; pending: ExplanationSelection | null; onResult: (result: ExplainResult) => void; showSettings?: boolean }) {
  const [catalog, setCatalog] = useState<ProviderOption[]>([]), [configuring, setConfiguring] = useState(false);
  const selected = catalog.find((p) => p.id === provider);
  const [settings, setSettings] = useState(false), [model, setModel] = useState(""), [key, setKey] = useState("");
  const [status, setStatus] = useState("External AI is optional and off until configured"), [error, setError] = useState("");
  const [prepared, setPrepared] = useState<Prepared | null>(null), [sending, setSending] = useState(false), [preparing, setPreparing] = useState(Boolean(pending));
  const sequence = useRef(0);
  const [payloadView, setPayloadView] = useState<"preview" | "raw">("preview");
  useEffect(() => {
    let live = true;
    void invoke<Configuration>("provider_configuration", { provider: provider || null, model: null, key: null, remove: false }).then((c) => {
      if (!live) return;
      setCatalog(c.catalog);
      if (!provider) onProviderChange(c.provider);
      const option = c.catalog.find((p) => p.id === c.provider);
      setModel(c.model ?? option?.models[0] ?? "");
      setStatus(c.error ?? (option?.kind === "local-agent" ? `${option.label} / ${option.status} / existing tool authentication` : c.configured ? `${option?.label} / ${c.model} / native credential configured` : `${option?.label} / no credential configured`));
    }).catch(() => { if (live) setStatus("Native storage unavailable or locked; external operations fail closed"); });
    return () => { live = false; };
  }, [provider, onProviderChange]);
  useEffect(() => {
    if (!pending || !provider) return;
    const guard = sequence;
    const n = ++guard.current;
    void invoke<Prepared>("prepare_explanation", { jobId, selection: pending, provider }).then((p) => { if (sequence.current === n) setPrepared(p); }).catch((e: unknown) => { if (sequence.current === n) setError(typeof e === "string" ? e.slice(0, 300) : "Cannot prepare: check provider availability, reopen the analysis, or refresh stale evidence. No evidence sent."); }).finally(() => { if (sequence.current === n) setPreparing(false); });
    return () => { guard.current++; void invoke("cancel_explanation").catch(() => {}); };
  }, [jobId, pending, provider]);
  async function configure(remove: boolean) {
    setError(""); setPrepared(null); sequence.current++; setConfiguring(true);
    const secret = key; setKey("");
    try {
      const result = await invoke<Configuration>("provider_configuration", { provider, model: remove ? null : model, key: remove ? null : secret, remove });
      setStatus(result.configured ? `${selected?.label} · ${result.model} · stored in native credential storage` : `${selected?.label} disabled; its credential removed`);
      if (pending) onResult({ ok: false, error: "Provider configuration changed; prepare the explanation again" });
    } catch { setError("Secure storage/configuration failed. External operations remain disabled; unlock native storage and retry. No plaintext fallback."); }
    finally { setConfiguring(false); }
  }
  async function send(approved: boolean) {
    if (!prepared) return;
    const n = ++sequence.current; setSending(true); setError("");
    try {
      const result = await invoke<Answer>("send_explanation", { ticket: prepared.ticket, approved });
      if (n !== sequence.current) return;
      const references = prepared.references;
      onResult({ ok: true, body: result.answer.body, model: `${result.provider} · ${result.model}`, cached: result.cached, labelled: null, labelError: null, citations: references.filter((r) => result.answer.citations.includes(r.id)), cacheSaved: result.cacheSaved });
    } catch (error) { if (n === sequence.current) { setPrepared(null); setError(typeof error === "string" ? error.slice(0, 300) : "Explanation failed. Prepare again. Structural exploration remains available."); } }
    finally { if (n === sequence.current) setSending(false); }
  }
  async function cancel() { sequence.current++; setSending(false); setPrepared(null); await invoke("cancel_explanation").catch(() => {}); onResult({ ok: false, error: "Explanation cancelled; no new send is authorized" }); }
  return <>
    {!showSettings && <button className="button-secondary" onClick={() => setSettings(!settings)}>Optional AI settings</button>}
    {(showSettings || settings) && <section className="ai-configuration reading-panel" aria-label="Optional AI configuration">
      <p>{status}</p><p className="my-2">Optional explanations use approved evidence only. Configuring a provider does not approve transmission. No backend relay.</p>
      <label>AI explanation provider <select disabled={configuring} className="my-1 w-full border border-line bg-canvas p-1" value={provider} onChange={(e) => { sequence.current++; setPrepared(null); setKey(""); setError(""); setStatus("Reading selected provider configuration…"); void invoke("cancel_explanation").catch(() => {}); onProviderChange(e.target.value); }}>
        <optgroup label="Remote providers">{catalog.filter((p) => p.kind === "remote-byok").map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</optgroup>
        <optgroup label="Local agents">{catalog.filter((p) => p.kind === "local-agent").map((p) => <option key={p.id} value={p.id}>{p.label} — {p.available ? "Available" : "Not available"}</option>)}</optgroup>
      </select></label><p>{selected?.endpoint}</p>
      {selected?.kind === "local-agent" ? <>
        <p className="my-2">{selected.status}. Uses the installed tool’s existing authentication; no application API key. The tool may communicate with its vendor according to its account and policies. This is not guaranteed offline.</p>
        <p>Only the approved bounded context is supplied. Repository access, commands and custom integrations are restricted. No tool is installed or authenticated automatically.</p>
        <p>Explanation model: {model}</p>
      </> : <>
      <label>Supported model <select disabled={configuring} className="my-1 w-full border border-line bg-canvas p-1" value={model} onChange={(e) => setModel(e.target.value)}>{selected?.models.map((m) => <option key={m} value={m}>{m}</option>)}</select></label>
      <p>Local supported-model list; no discovery request. Account access and quotas are checked only after approving an explanation.</p>
      <label>API key <input type="password" autoComplete="off" className="my-1 w-full border border-line bg-canvas p-1" maxLength={256} value={key} onChange={(e) => setKey(e.target.value)} /></label>
      <div className="flex gap-3"><button disabled={configuring || !selected} onClick={() => void configure(false)}>Save securely</button><button disabled={configuring || !selected} onClick={() => void configure(true)}>Remove credential / disable</button></div>
      </>}
      {error && !pending && <p role="alert" className="mt-2">{error}</p>}
    </section>}
    {pending && <div role="dialog" aria-modal="true" aria-labelledby="external-request-title" className="fixed inset-8 z-40 flex flex-col gap-3 border border-line bg-canvas p-5 text-sm shadow-xl">
      <header className="flex items-center justify-between gap-4"><h2 id="external-request-title" className="text-lg font-semibold">External AI Request</h2><button type="button" aria-label={sending ? "Cancel and close request" : "Close request without sending"} title="Close" className="p-2 hover:bg-raised" onClick={() => void cancel()}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6" /></svg></button></header>
      <p className="text-center text-fg-muted">Generated explanations are unverified interpretation. Verified graph relationships stay unchanged. No raw source text is included.</p>
      {preparing && <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 text-center" role="status"><p>Preparing local evidence; no network request…</p><div className="explanation-skeleton" aria-hidden="true"><span /><span /><span /></div></div>}
      {prepared && <>
        <p className="break-all">{prepared.provider} · {prepared.model} · {prepared.endpoint}</p>
        {prepared.kind === "local-agent" && <p role="note">Approval invokes the installed agent. It may transmit this context to its vendor. Only these instructions and this bounded evidence are supplied; no repository root or independent repository access is granted.</p>}
        <details className="evidence-relationships"><summary className="overview-section-heading"><svg className="section-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg>Files ({prepared.files.length})</summary><ul className="mt-2 max-h-32 overflow-auto">{prepared.files.map((file) => <li key={file} title={file} className="flex items-center gap-2 py-1"><UiIcon name="file" /><span className="font-mono">{file.split("/").pop()}</span></li>)}</ul></details>
        <p className="text-fg-muted">Evidence IDs: {prepared.ids.join(", ")}. Hashes and coverage are included; source contents and absolute roots are omitted.</p>
        <div role="tablist" aria-label="Payload view" className="flex border-b border-line"><button role="tab" aria-selected={payloadView === "preview"} className={`px-4 py-2 ${payloadView === "preview" ? "border-b-2 border-accent" : "text-fg-muted"}`} onClick={() => setPayloadView("preview")}>Preview</button><button role="tab" aria-selected={payloadView === "raw"} className={`px-4 py-2 ${payloadView === "raw" ? "border-b-2 border-accent" : "text-fg-muted"}`} onClick={() => setPayloadView("raw")}>Raw JSON</button></div>
        <div role="tabpanel" className="min-h-0 flex-1 overflow-auto">{payloadView === "raw" ? <pre className="whitespace-pre-wrap break-all font-mono text-xs">{prepared.payload}</pre> : <PayloadPreview payload={prepared.payload} />}</div>
        {prepared.cached && <button disabled={sending} className="text-left underline" onClick={() => void send(false)}>Use matching local cache — no provider call</button>}
      </>}
      {sending && <div role="status" className="text-center"><p>Waiting for provider. Cancellation cannot retract bytes already sent.</p><div className="explanation-skeleton mx-auto mt-3" aria-hidden="true"><span /><span /></div></div>}
      {error && <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center"><p role="alert" className="max-w-lg">{error}</p><button className="bg-raised px-6 py-3" onClick={() => void cancel()}>Close without sending</button></div>}
      {!error && <footer className={`flex flex-wrap justify-center gap-3 border-t border-line pt-4 ${!prepared ? "mx-auto w-full max-w-lg" : ""}`}>
        {prepared && <button disabled={sending} className="flex-1 bg-accent px-4 py-3 font-semibold text-white disabled:opacity-40" onClick={() => void send(true)}>Approve this exact payload and send directly to {prepared.provider}</button>}
        <button className="flex-1 bg-raised px-4 py-3 font-medium" onClick={() => void cancel()}>{sending ? "Cancel request" : "Close without sending"}</button>
      </footer>}
    </div>}

  </>;
}
