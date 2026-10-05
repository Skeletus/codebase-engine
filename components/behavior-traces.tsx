"use client";
import { useMemo, useState } from "react";
import type { CodeSnapshot } from "@/lib/engine/types";
import type { Site } from "@/lib/model/behavior";
import { traceCalls } from "@/lib/engine/behavior";

export function BehaviorTraces({ snapshot, onReveal }: { snapshot: CodeSnapshot; onReveal: (file: string) => void }) {
  const [open, setOpen] = useState(false), [search, setSearch] = useState(""), [selected, setSelected] = useState(""), [depth, setDepth] = useState(8), [budget, setBudget] = useState(100);
  const callable = useMemo(() => snapshot.behavior.declarations.filter((d) => d.callable), [snapshot]);
  const names = useMemo(() => new Map(snapshot.behavior.declarations.map((d) => [d.id, d])), [snapshot]);
  const choices = callable.filter((d) => `${d.name} ${d.site.file}`.toLowerCase().includes(search.toLowerCase()));
  const trace = useMemo(() => selected ? traceCalls(snapshot, selected, depth, budget) : null, [snapshot, selected, depth, budget]);
  const bindings = snapshot.behavior.handlers.filter((h) => h.target === selected);
  const references = snapshot.behavior.relations.filter((r) => r.relation === "references" && r.target === selected);
  function witness(site: Site) { return <span><button className="text-accent underline" onClick={() => onReveal(site.file)}>{site.file}:{site.line}–{site.endLine}</button><span className="block break-all text-fg-muted">UTF-16 range [{site.start}, {site.end}) · SHA-256 {site.fileHash} · {site.extractor}</span></span>; }
  return <section aria-label="Static call traces" className="border-b border-line p-3 text-[11px]">
    <button className="text-accent" aria-expanded={open} onClick={() => setOpen(!open)}>Static call traces ({callable.length} callable declarations)</button>
    {open && <>
      <p className="my-2 text-fg-muted">Verified lexical calls are static possibilities, not guaranteed execution or temporal order. Receiver dispatch, DI, callbacks and unsupported exports may remain gaps. Every link opens Details; use Read / recheck source to verify its hash.</p>
      <label className="block">Handler <select aria-label="Route handler" className="w-full border border-line bg-canvas" value="" onChange={(e) => setSelected(e.target.value)}><option value="">Select a supported route handler…</option>{snapshot.behavior.handlers.filter((h) => h.target).map((h) => <option key={h.route} value={h.target!}>{snapshot.routes[h.route].method} {snapshot.routes[h.route].pattern} · {names.get(h.target!)?.name}</option>)}</select></label>
      {snapshot.behavior.handlers.filter((h) => !h.target).slice(0, 100).map((h) => <p key={h.route} className="my-2">Unbound route: {snapshot.routes[h.route].method} {snapshot.routes[h.route].pattern} · {h.reason}{witness(h.site)}</p>)}
      {snapshot.behavior.handlers.filter((h) => !h.target).length > 100 && <p>Unbound route list limited to 100; inspect route declarations in the route table.</p>}
      <label className="mt-2 block">Find callable <input className="w-full border border-line bg-canvas px-1" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or relative path" /></label>
      <select aria-label="Callable declaration" className="my-1 w-full border border-line bg-canvas" value={selected} onChange={(e) => setSelected(e.target.value)}><option value="">Choose a declaration…</option>{selected && !choices.slice(0, 200).some((d) => d.id === selected) && <option value={selected}>{names.get(selected)?.name} · {names.get(selected)?.site.file}</option>}{choices.slice(0, 200).map((d) => <option key={d.id} value={d.id}>{d.name} · {d.site.file}:{d.site.line}</option>)}</select>
      {choices.length > 200 && <p>First 200 of {choices.length} choices; narrow your search.</p>}
      <label>Depth <input aria-label="Call trace depth" type="number" min={0} max={32} className="mx-1 w-12 border border-line bg-canvas" value={depth} onChange={(e) => setDepth(Math.min(32, Math.max(0, Math.floor(Number(e.target.value) || 0))))} /></label>
      <label>Budget <input aria-label="Call trace budget" type="number" min={1} max={200} className="mx-1 w-14 border border-line bg-canvas" value={budget} onChange={(e) => setBudget(Math.min(200, Math.max(1, Math.floor(Number(e.target.value) || 1))))} /></label>
      {trace && <div className="mt-2 max-h-96 overflow-auto">
        <h3>Handler/declaration evidence</h3>{witness(names.get(selected)!.site)}
        {bindings.map((h) => <p className="my-2" key={h.route}>HANDLES_ROUTE: {snapshot.routes[h.route].method} {snapshot.routes[h.route].pattern}{witness(h.site)}</p>)}
        <p className="my-2">{trace.declarations.length} declarations reached · {trace.calls.length} call sites · {trace.repeatedTargets} repeated targets (recursion or converging branches). Traversal terminates at visited declarations.</p>
        <p>Omitted: {trace.beyondDepth} outgoing sites at depth limit · {trace.beyondBudget} sites at budget limit · {trace.gapsOmitted} gaps. Missing/skipped/external dependencies can hide additional calls; inspect Coverage & diagnostics.</p>
        {trace.calls.map((r) => <p key={r.id} className="my-3">{names.get(r.source!)?.name} → {names.get(r.target)?.name} · {r.conditional ? "conditional possibility" : "static possibility"}{witness(r.site)}<span className="block">Target: {witness(names.get(r.target)!.site)}</span></p>)}
        <h3>Resolved references to selected declaration ({references.length})</h3>
        {references.slice(0, budget).map((r) => <p key={r.id} className="my-2">{r.source ? names.get(r.source)?.name : "Module / unowned lexical scope"} references {names.get(r.target)?.name}; a reference is not execution.{witness(r.site)}</p>)}
        {references.length > budget && <p>{references.length - budget} references omitted by budget.</p>}
        <h3>Unresolved boundaries ({trace.gaps.length})</h3>
        {trace.gaps.map((g, i) => <p key={i} className="my-3">{g.source ? names.get(g.source)?.name : "File-level / unsupported callback ownership; not attributed to this handler"} · {g.reason}{witness(g.site)}</p>)}
        {!trace.gaps.length && <p>No gaps in this bounded selection; this does not prove complete runtime coverage.</p>}
        <h3>Structurally related test candidates</h3>
        <p>Verified references/import paths only. These do not establish TESTS semantics or executed coverage. {trace.testsOmitted} candidates omitted.{trace.testSearchTruncated ? " Dependency search capped at 200 files." : ""}</p>
        {trace.testCandidates.map((c) => <div key={c.file} className="my-2"><button className="text-accent underline" onClick={() => onReveal(c.file)}>{c.file}</button>{c.references.map((id) => { const r = snapshot.behavior.relations.find((r) => r.id === id)!; return <p key={id}>Verified {r.relation} to {names.get(r.target)?.name}{witness(r.site)}</p>; })}{c.referencesOmitted > 0 && <p>{c.referencesOmitted} additional references omitted (10 witnesses per candidate).</p>}{c.dependencyPath.map((id) => { const r = snapshot.relationships.find((r) => r.id === id)!; return <p key={id}><button className="text-accent underline" onClick={() => onReveal(r.source)}>{r.source}:{r.evidence.line}</button> imports {r.target}{r.typeOnly ? " (type-only)" : ""} · {r.evidence.fileHash}</p>; })}</div>)}
        {!trace.testCandidates.length && <p>No structurally linked test candidates in this bounded selection.</p>}
      </div>}
    </>}
  </section>;
}
