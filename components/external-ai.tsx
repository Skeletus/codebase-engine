"use client";

import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ExplanationSelection } from "@/lib/ai/selection";
import type { ExplainResult } from "@/lib/analysis/operations";

type ProviderOption = { id: string; label: string; endpoint: string; models: string[] };
type Configuration = { configured: boolean; provider: string; model?: string; catalog: ProviderOption[]; error?: string };
type Prepared = { ticket: string; provider: string; model: string; endpoint: string; payload: string; files: string[]; ids: string[]; references: { id: string; path: string }[]; cached: { body: string; citations: string[] } | null };
type Answer = { answer: { body: string; citations: string[] }; provider: string; model: string; cached: boolean; cacheSaved?: boolean };
export function ExternalAi({ provider, onProviderChange, jobId, pending, onResult }: { provider: string; onProviderChange: (provider: string) => void; jobId: string; pending: ExplanationSelection | null; onResult: (result: ExplainResult) => void }) {
  const [catalog, setCatalog] = useState<ProviderOption[]>([]), [configuring, setConfiguring] = useState(false);
  const selected = catalog.find((p) => p.id === provider);
  const [settings, setSettings] = useState(false), [model, setModel] = useState(""), [key, setKey] = useState("");
  const [status, setStatus] = useState("External AI is optional and off until configured"), [error, setError] = useState("");
  const [prepared, setPrepared] = useState<Prepared | null>(null), [sending, setSending] = useState(false), [preparing, setPreparing] = useState(Boolean(pending));
  const sequence = useRef(0);
  useEffect(() => {
    let live = true;
    void invoke<Configuration>("provider_configuration", { provider: provider || null, model: null, key: null, remove: false }).then((c) => {
      if (!live) return;
      setCatalog(c.catalog);
      if (!provider) onProviderChange(c.provider);
      const option = c.catalog.find((p) => p.id === c.provider);
      setModel(c.model ?? option?.models[0] ?? "");
      setStatus(c.error ?? (c.configured ? `${option?.label} / ${c.model} / native credential configured` : `${option?.label} / no credential configured`));
    }).catch(() => { if (live) setStatus("Native storage unavailable or locked; external operations fail closed"); });
    return () => { live = false; };
  }, [provider, onProviderChange]);
  useEffect(() => {
    if (!pending || !provider) return;
    const guard = sequence;
    const n = ++guard.current;
    void invoke<Prepared>("prepare_explanation", { jobId, selection: pending, provider }).then((p) => { if (sequence.current === n) setPrepared(p); }).catch(() => { if (sequence.current === n) setError("Cannot prepare: configure/unlock native credentials, reopen the analysis, or refresh stale/excluded evidence. No evidence sent."); }).finally(() => { if (sequence.current === n) setPreparing(false); });
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
    <button className="rounded border border-line px-2 py-1 text-xs" onClick={() => setSettings(!settings)}>Optional AI settings</button>
    {settings && <section className="absolute right-4 top-14 z-30 w-96 rounded border border-line bg-canvas p-3 text-xs shadow-lg" aria-label="Optional AI configuration">
      <p>{status}</p><p className="my-2">Direct BYOK to the selected provider. Configuring a key does not approve evidence transmission. No backend relay.</p>
      <label>Provider <select disabled={configuring} className="my-1 w-full border border-line bg-canvas p-1" value={provider} onChange={(e) => { sequence.current++; setPrepared(null); setKey(""); setError(""); setStatus("Reading selected provider configuration…"); void invoke("cancel_explanation").catch(() => {}); onProviderChange(e.target.value); }}>
        {catalog.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
      </select></label><p>{selected?.endpoint}</p>
      <label>Supported model <select disabled={configuring} className="my-1 w-full border border-line bg-canvas p-1" value={model} onChange={(e) => setModel(e.target.value)}>{selected?.models.map((m) => <option key={m} value={m}>{m}</option>)}</select></label>
      <p>Local supported-model list; no discovery request. Account access and quotas are checked only after approving an explanation.</p>
      <label>API key <input type="password" autoComplete="off" className="my-1 w-full border border-line bg-canvas p-1" maxLength={256} value={key} onChange={(e) => setKey(e.target.value)} /></label>
      <div className="flex gap-3"><button disabled={configuring || !selected} onClick={() => void configure(false)}>Save securely</button><button disabled={configuring || !selected} onClick={() => void configure(true)}>Remove credential / disable</button></div>
      {error && !pending && <p role="alert" className="mt-2">{error}</p>}
    </section>}
    {pending && <div role="dialog" aria-modal="true" aria-label="Approve external evidence" className="fixed inset-8 z-40 flex flex-col gap-2 rounded border border-line bg-canvas p-4 text-xs shadow-xl">
      <h2>Inspect optional external explanation</h2><p>Generated explanations are unverified interpretation. Verified graph relationships stay unchanged. No raw source text is included.</p>
      {preparing && <p>Preparing local evidence; no network request…</p>}
      {prepared && <><p>{prepared.provider} · {prepared.model} · {prepared.endpoint}</p><p>Files: {prepared.files.join(", ")}</p><p>Evidence IDs: {prepared.ids.join(", ")}. Hashes and coverage are included; source contents and absolute roots are omitted.</p><pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap border border-line p-2">{prepared.payload}</pre>
        <button disabled={sending} className="border border-line p-2 disabled:opacity-40" onClick={() => void send(true)}>Approve this exact payload and send directly to {prepared.provider}</button>
        {prepared.cached && <button disabled={sending} onClick={() => void send(false)}>Use matching local cache — no provider call</button>}</>}
      {sending && <p>Waiting for provider; structural intelligence is independent. Cancellation cannot retract bytes already sent.</p>}
      {error && <p role="alert">{error}</p>}<button onClick={() => void cancel()}>{sending ? "Cancel request" : "Close without sending"}</button>
    </div>}
  </>;
}
