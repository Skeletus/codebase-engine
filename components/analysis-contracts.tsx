"use client";

import type { CodeSnapshot } from "@/lib/engine/types";
import { projectAnalysis } from "@/lib/desktop/projection";
import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { validateEvent } from "@/lib/desktop/protocol";
import { normalizeRange } from "@/lib/model/positions";
import type { Witness } from "@/lib/model/framework";

/** Reuses the accepted diagnostics surface; never adds graph edges. */
export function AnalysisContractsPanel({ snapshot, jobId, busy }: { snapshot: CodeSnapshot; jobId: string; busy: boolean }) {
  const projection = projectAnalysis(snapshot);
  const [checked, setChecked] = useState<{ state: string; excerpt?: string } | null>(null);
  async function openWitness(witness: Witness) {
    setChecked(null);
    if (witness.role === "framework-rule") { setChecked({ state: "Pinned framework rule; no source location" }); return; }
    try {
      const response = await invoke<unknown>("read_evidence", { jobId, file: witness.site.file });
      const event = validateEvent({ version: 1, requestId: "shared-evidence", jobId, type: "evidence", evidence: response });
      if (event.type !== "evidence") throw new Error("Unexpected evidence response");
      if (event.evidence.state !== "current") { setChecked({ state: event.evidence.state === "stale" ? "Stale evidence — refresh before opening" : "Evidence unavailable under the read policy" }); return; }
      const range = normalizeRange(event.evidence.source, witness.site.start, witness.site.end, "utf16");
      if (range.line !== witness.site.line || range.endLine !== witness.site.endLine) throw new Error("Source coordinates disagree");
      setChecked({ state: `${witness.site.file}:${range.line} · current source at last check`, excerpt: event.evidence.source.slice(range.start, range.end) });
    } catch { setChecked({ state: "Evidence unavailable or source coordinates disagree" }); }
  }
  return <details className="workspace-secondary text-xs"><summary>Capabilities and analysis boundaries</summary>
    {projection.status === "legacy-observations" && <p className="my-3 text-fg-muted">Existing TS/JS observations. Expanded framework capabilities have not been qualified.</p>}
    <p>{projection.variants.length} analysis variants · {projection.candidates.length} candidates · {projection.gaps.length} explicit gaps</p>
    {projection.capabilities.slice(0, 100).map(c => <p key={c.id} className="my-2 break-all">{c.capabilityId} · {c.state} · {c.tupleId}</p>)}
    {projection.variants.slice(0, 100).map(v => <p key={v.id} className="my-2">{v.projectId} · {v.environment}{v.platform ? " · " + v.platform : ""}</p>)}
    {projection.registrations.slice(0, 100).map(r => <details key={r.id} className="my-2"><summary>{r.kind} · {r.method} {r.pattern} · matcher {r.matcher}</summary>{r.witnesses.map((w, i) => <p key={i}><button className="underline disabled:opacity-40" disabled={busy} onClick={() => void openWitness(w)}>{w.role === "framework-rule" ? `${w.tupleId} · ${w.ruleId}` : `${w.role}: ${w.site.file}:${w.site.line} · check source`}</button></p>)}</details>)}
    {projection.bindings.slice(0, 100).map(b => <details key={b.id} className="my-2"><summary>Framework binding · {b.kind}</summary>{b.witnesses.map((w, i) => <button key={i} className="block underline disabled:opacity-40" disabled={busy} onClick={() => void openWitness(w)}>{w.role === "framework-rule" ? w.ruleId : `${w.role}: ${w.site.file}:${w.site.line}`}</button>)}</details>)}
    {projection.gaps.slice(0, 100).map(g => <p key={g.id} className="my-2">{g.reason} · <button className="underline disabled:opacity-40" disabled={busy} onClick={() => void openWitness({ site: g.occurrence, role: "reference", variantId: g.variantId, extractorVersion: "3" })}>{g.occurrence.file}:{g.occurrence.line}</button></p>)}
    {projection.candidates.slice(0, 100).map(c => <details key={c.id} className="my-2"><summary>Candidate · {c.relationKind} · {c.reasons.join(", ")}{c.truncated ? " · alternatives truncated" : ""}</summary>{c.witnesses.map((w, i) => <button key={i} className="block underline disabled:opacity-40" disabled={busy} onClick={() => void openWitness(w)}>{w.role === "framework-rule" ? w.ruleId : `${w.role}: ${w.site.file}:${w.site.line}`}</button>)}</details>)}
    {projection.assumptions.slice(0, 100).map(a => <p key={a.id} className="my-2">{a.label} · {a.service} · {a.origin} · revision {a.revision}</p>)}
    {checked && <div role="status" className="my-3"><p>{checked.state}</p>{checked.excerpt && <pre className="overflow-auto whitespace-pre-wrap">{checked.excerpt}</pre>}</div>}
    {[projection.capabilities, projection.variants, projection.registrations, projection.bindings, projection.gaps, projection.candidates, projection.assumptions].some(items => items.length > 100) && <p className="my-2">Showing the first 100 records per collection.</p>}
  </details>;
}
