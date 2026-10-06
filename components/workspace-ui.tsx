"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

export function RepositoryPicker({ repositories, selectedId, disabled, onOpen, onSelect }: {
  repositories: { repositoryId: string; root: string; available: boolean; snapshotState: string }[];
  selectedId?: string; disabled: boolean; onOpen: () => void; onSelect: (id: string) => void;
}) {
  const menu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !menu.current?.contains(event.target) && menu.current) menu.current.open = false;
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, []);
  const name = (root: string) => root.split(/[\\/]/).filter(Boolean).at(-1) ?? root;
  const selected = repositories.find((repository) => repository.repositoryId === selectedId);
  const folder = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M3 7V5a1 1 0 0 1 1-1h5l2 3h9a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7Z" /></svg>;
  const close = () => { if (menu.current) menu.current.open = false; };
  return <details ref={menu} className="repository-picker" onKeyDown={(event) => {
    if (event.key === "Escape") { close(); menu.current?.querySelector("summary")?.focus(); }
  }}>
    <summary aria-label="Choose repository" aria-disabled={disabled} onClick={(event) => { if (disabled) event.preventDefault(); }}>
      {folder}<span className="truncate">{selected ? name(selected.root) : "Open repository"}</span><span className="ml-auto" aria-hidden="true">▾</span>
    </summary>
    <div className="repository-picker-menu">
      <button disabled={disabled} onClick={() => { close(); onOpen(); }}><span className="repository-picker-icon" aria-hidden="true">+</span><span>Open repository</span></button>
      <p className="repository-picker-label eyebrow">Recent repositories</p>
      <div className="repository-picker-list">
        {repositories.length === 0 && <p className="px-3 py-2 text-xs text-fg-muted">No recent repositories</p>}
        {repositories.map((repository) => <button key={repository.repositoryId} disabled={disabled} aria-current={repository.repositoryId === selectedId ? "true" : undefined} title={repository.root} onClick={() => { close(); onSelect(repository.repositoryId); }}>
          {folder}<span className="truncate">{name(repository.root)}{!repository.available ? " · unavailable" : ""}{repository.snapshotState === "incompatible" ? " · refresh needed" : ""}</span>
        </button>)}
      </div>
    </div>
  </details>;
}

export type Workspace = "map" | "investigate" | "impact" | "routes" | "evidence" | "laya" | "ai" | "diagnostics" | "measurements" | "settings";
export const WORKSPACE_LABELS: Record<Workspace, string> = { map: "Map", investigate: "Investigate", impact: "Impact", routes: "Routes", evidence: "Evidence", laya: "Laya", ai: "AI explanations", diagnostics: "Diagnostics", measurements: "Pilot measurements", settings: "Settings" };
export function Sidebar({ active, onNavigate }: { active: Workspace; onNavigate: (view: Workspace) => void }) {
  const [collapsed, setCollapsed] = useState(false);
  const [closedGroups, setClosedGroups] = useState<Record<string, boolean>>({});
  const groups: { name: string; items: Workspace[] }[] = [{ name: "Workspace", items: ["map", "investigate", "impact", "routes", "evidence"] }, { name: "Intelligence", items: ["laya", "ai"] }, { name: "System", items: ["diagnostics", "measurements", "settings"] }];
  return <aside className={`workspace-sidebar flex min-h-0 flex-col bg-surface${collapsed ? " collapsed" : ""}`}>
    <div className="brand">
      {!collapsed && <><span className="brand-mark" aria-hidden="true">⌘</span><span>Codebase<br /><strong>Intelligence</strong></span></>}
      <button className="sidebar-toggle" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} title={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!collapsed} aria-controls="sidebar-content" onClick={() => setCollapsed((value) => !value)}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /><path d={collapsed ? "m13 9 3 3-3 3" : "m16 9-3 3 3 3"} /></svg>
      </button>
    </div>
    <div id="sidebar-content" className="flex min-h-0 flex-1 flex-col">
      <nav aria-label="Workspace navigation" className="sidebar-navigation min-h-0 flex-1 overflow-auto px-3 py-3">{groups.map((g) => <div key={g.name} className="nav-group">
        {!collapsed && <button className="nav-group-toggle eyebrow" aria-expanded={!closedGroups[g.name]} aria-controls={`navigation-${g.name}`} onClick={() => setClosedGroups((current) => ({ ...current, [g.name]: !current[g.name] }))}><span>{g.name}</span><span aria-hidden="true">{closedGroups[g.name] ? "▸" : "▾"}</span></button>}
        <div id={`navigation-${g.name}`} hidden={!collapsed && !!closedGroups[g.name]}>{g.items.map((view) => <button key={view} aria-label={WORKSPACE_LABELS[view]} title={collapsed ? WORKSPACE_LABELS[view] : undefined} aria-current={view === active ? "page" : undefined} className={`nav-item ${view === active ? "active" : ""}`} onClick={() => onNavigate(view)}><span className="nav-mark" aria-hidden="true">{view === "map" ? "◇" : view === "investigate" ? "↗" : view === "impact" ? "◎" : view === "routes" ? "⇄" : view === "evidence" ? "≡" : view === "laya" ? "✧" : view === "ai" ? "◌" : view === "diagnostics" ? "◉" : view === "settings" ? "⚙" : "◷"}</span>{!collapsed && WORKSPACE_LABELS[view]}</button>)}</div>
      </div>)}</nav>
    </div>
  </aside>;
}
export function PageHeading({ eyebrow, title, description, children }: { eyebrow?: string; title: string; description: string; children?: ReactNode }) {
  return <header className="workspace-heading"><div>{eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}<h1>{title}</h1><p className="mt-2 max-w-2xl text-fg-muted">{description}</p></div>{children}</header>;
}
export function StatusBadge({ children, tone = "neutral", compact = false }: { children: ReactNode; tone?: "neutral" | "good" | "warning"; compact?: boolean }) { return <span className={`status-badge ${tone}${compact ? " compact-status" : ""}`} tabIndex={compact ? 0 : undefined} role={compact ? "status" : undefined}><span aria-hidden="true" className="status-dot" />{compact ? <><span className="sr-only">{children}</span><span className="status-tooltip" aria-hidden="true">{children}</span></> : children}</span>; }
export function UiIcon({ name }: { name: "impact" | "more" | "refresh" | "reopen" | "pause" | "play" | "trash" | "file" | "imports" | "routes" }) {
  const paths = { impact: "M12 8v8m-4-4h8M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2", more: "M12 5v.01M12 12v.01M12 19v.01", refresh: "M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 12-2l2 2M4 17l2 2a7 7 0 0 0 12-2", reopen: "M3 9V4m0 5h5M3 9a9 9 0 1 1 0 7M12 7v5l3 2", pause: "M8 5v14M16 5v14", play: "m8 5 11 7-11 7V5Z", trash: "M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7", file: "M14 3H5v18h14V8l-5-5Zm0 0v5h5", imports: "M4 5h6v6H4ZM14 13h6v6h-6ZM10 8h7v5M14 10l3 3 3-3", routes: "M4 6h9a5 5 0 0 1 0 10H4M7 3 4 6l3 3M7 13l-3 3 3 3" };
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={name === "more" ? 3 : 1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
export function WarningBanner({ title, children, details }: { title: string; children: ReactNode; details?: string }) { return <section className="warning-banner" role="alert"><strong>{title}</strong><div className="mt-1">{children}</div>{details && <details className="mt-2"><summary>Technical details</summary><p className="mt-2 break-all font-mono text-xs">{details}</p></details>}</section>; }
export function FileSelector({ files, value, onChange, label = "Starting point", disabled = false, guidance }: { files: string[]; value: string; onChange: (value: string) => void; label?: string; disabled?: boolean; guidance?: string }) {
  const [search, setSearch] = useState("");
  const id = useId();
  const matches = files.filter((f) => f.toLowerCase().includes(search.toLowerCase()));
  const choices = matches.slice(0, 200);
  return <div className="file-selector">
    <label className="field-label">Search files (optional)<input aria-describedby={`${id}-search`} disabled={disabled} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="e.g. auth.controller.ts or modules/auth" maxLength={256} /><span id={`${id}-search`} className="text-xs font-normal leading-relaxed text-fg-muted">Type part of a filename or folder to narrow the list. You can leave this blank.</span></label>
    <label className="field-label">{label}<select aria-describedby={guidance ? `${id}-choice` : undefined} disabled={disabled} value={value} onChange={(e) => onChange(e.target.value)}><option value="">Select a file…</option>{value && !choices.includes(value) && <option value={value}>{value}</option>}{choices.map((f) => <option key={f} value={f}>{f}</option>)}</select>{guidance && <span id={`${id}-choice`} className="text-xs font-normal leading-relaxed text-fg-muted">{guidance}</span>}</label>
    {matches.length > 200 && <p className="text-xs text-fg-muted">Showing 200 of {matches.length} files. Search above to find a specific file.</p>}
    {!matches.length && <p role="status" className="text-xs text-fg-muted">No matching files. Try a different filename or folder.</p>}
  </div>;
}
