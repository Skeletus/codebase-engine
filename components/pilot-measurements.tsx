"use client";

import { useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { TASK_CATEGORIES, validateMeasurement, type Measurement, type MeasurementInput } from "@/lib/storage/measurements";

export function PilotMeasurements() {
  const [category, setCategory] = useState<MeasurementInput["category"]>("understanding");
  const [elapsed, setElapsed] = useState<number | null>(null), [running, setRunning] = useState(false);
  const [usefulness, setUsefulness] = useState(""), [discovered, setDiscovered] = useState(0), [missed, setMissed] = useState(0);
  const [pending, setPending] = useState(false), [message, setMessage] = useState("");
  const [saved, setSaved] = useState<{ records: Measurement[]; total: number } | null>(null);
  const started = useRef(0);
  async function records(reset = false) {
    if (reset && !window.confirm("Reset local pilot measurements only? Repository analyses and source files are unaffected.")) return;
    setPending(true);
    try { setSaved(await invoke("pilot_measurements", { reset })); setMessage(reset ? "Local measurements reset." : "Local measurements loaded."); }
    catch { setMessage("Measurement storage unavailable. Repository intelligence remains available; retry later."); }
    finally { setPending(false); }
  }
  async function save() {
    setPending(true);
    try {
      const input = validateMeasurement({ category, elapsedMs: elapsed, usefulness: Number(usefulness), discovered, missed });
      setSaved(await invoke("record_measurement", { input })); setMessage("Numeric measurement saved locally. No repository information was recorded."); setElapsed(null); setUsefulness("");
    } catch { setMessage("Measurement was not saved. Check timing/rating/numeric counts or retry storage; intelligence remains available."); }
    finally { setPending(false); }
  }
  return <section aria-label="Local pilot measurements" className="max-h-64 shrink-0 overflow-auto border-b border-line p-3 text-xs">
    <p>Optional pilot task timer and manual feedback. Only category, elapsed milliseconds, usefulness (1–5), application version and discovered/missed counts are saved locally. No repository identifiers, paths, questions, prompts or free text. Compare baseline/product trials outside these records.</p>
    <div className="my-2 flex flex-wrap items-center gap-3">
      <select aria-label="Pilot task category" disabled={running || elapsed !== null || pending} value={category} onChange={(e) => { const next = TASK_CATEGORIES.find((c) => c === e.target.value); if (next) setCategory(next); }} className="rounded border border-line bg-canvas p-1">{TASK_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
      <button disabled={running || pending} onClick={() => { started.current = performance.now(); setRunning(true); setElapsed(null); setMessage("Task timer running locally. Finish after reaching your task answer."); }} className="text-accent">Start task timer</button>
      <button disabled={!running || pending} onClick={() => { setElapsed(Math.max(1, Math.round(performance.now() - started.current))); setRunning(false); }} className="text-accent">Finish task</button>
      {elapsed !== null && <span>{(elapsed / 1000).toFixed(1)} seconds</span>}
      <label>Usefulness <select aria-label="Answer usefulness" value={usefulness} onChange={(e) => setUsefulness(e.target.value)} className="rounded border border-line bg-canvas p-1"><option value="">Choose rating</option>{[1, 2, 3, 4, 5].map((n) => <option key={n}>{n}</option>)}</select></label>
      <label>Discovered <input aria-label="Manually assessed discovered dependencies" type="number" min={0} max={100000} value={discovered} onChange={(e) => setDiscovered(Number(e.target.value))} className="w-20 rounded border border-line bg-canvas p-1" /></label>
      <label>Missed <input aria-label="Manually assessed missed dependencies" type="number" min={0} max={100000} value={missed} onChange={(e) => setMissed(Number(e.target.value))} className="w-20 rounded border border-line bg-canvas p-1" /></label>
      <button disabled={elapsed === null || !usefulness || pending || running} onClick={() => void save()} className="text-accent">Save numeric feedback</button>
      <button disabled={pending} onClick={() => void records()} className="text-accent">View local records</button>
      <button disabled={pending} onClick={() => void records(true)} className="text-accent">Reset local records</button>
    </div>
    <p role="status">{message}</p>
    {saved && <><p>{saved.total} saved measurements; latest {saved.records.length} shown.</p><table className="my-2 w-full text-left"><thead><tr>{["Task", "Seconds", "Useful / 5", "Discovered", "Missed", "Version"].map((h) => <th key={h}>{h}</th>)}</tr></thead><tbody>{saved.records.map((r, i) => <tr key={i}><td>{r.category}</td><td>{(r.elapsedMs / 1000).toFixed(1)}</td><td>{r.usefulness}</td><td>{r.discovered}</td><td>{r.missed}</td><td>{r.applicationVersion}</td></tr>)}</tbody></table></>}
  </section>;
}
