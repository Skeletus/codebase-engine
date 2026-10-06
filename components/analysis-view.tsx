"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { AnalysisOperations } from "@/lib/analysis/operations";
import { foldDirectories } from "@/lib/graph/fold";
import type { Selection } from "@/lib/graph/highlight";
import type { Direction } from "@/lib/graph/reach";
import { clampOffset, groupId, MAX_ROWS, rankGroupFiles } from "@/lib/graph/view";
import type { Coverage, Edge, ParsedFile, Route } from "@/lib/parser/types";
import type { ModelRole } from "@/lib/roles";
import { CategoryRail } from "./category-rail";
import { DetailPane, type RepositoryFacts, type Tab } from "./detail-pane";
import { targetKey, type ExplainTarget, type ExplanationState } from "./explanation-panel";
import { DependencyMap } from "./map/dependency-map";
import { RouteTable } from "./route-table";
import { Shell } from "./shell";
import type { Workspace } from "./workspace-ui";

// Owns what the map, the rail and the pane share: which folders are open,
// what's selected, what's hovered, which category is picked, and what the pane
// has open. Everything either side
// shows is derived from the parse output already in the browser, so nothing
// here makes a request except the one Explain asks for.
export function AnalysisView({
  files,
  edges,
  routes,
  routeCoverage,
  modelRoles: storedModelRoles,
  repository,
  operations,
  evidence,
  investigations,
  workspace,
  onWorkspaceChange,
  workspaceContent,
  explanationSetup,
  analysisActivity,
}: {
  files: ParsedFile[];
  edges: Edge[];
  routes: Route[];
  routeCoverage: Coverage["routes"];
  /** Roles the model gave files no convention identified, by path. */
  modelRoles: Record<string, ModelRole>;
  repository: Omit<RepositoryFacts, "routes">;
  operations: AnalysisOperations;
  evidence?: (path: string) => ReactNode;
  explanationSetup?: { provider: string; onConfigure: () => void };
  analysisActivity?: { busy: boolean; stage: string; onCancel: () => void };
  investigations?: (onReveal: (path: string) => void, selectedFile: string | null) => ReactNode;
  workspace?: Workspace;
  onWorkspaceChange?: (workspace: Workspace) => void;
  workspaceContent?: (onReveal: (path: string, mode?: "map" | "evidence") => void, selectedFile: string | null) => ReactNode;
}) {
  const [revealing, setRevealing] = useState(Boolean(analysisActivity));
  useEffect(() => {
    const timer = window.setTimeout(() => setRevealing(false), window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 2200);
    return () => window.clearTimeout(timer);
  }, []);
  const mapLocked = Boolean(analysisActivity?.busy || revealing);
  const folding = useMemo(() => foldDirectories(files), [files]);
  const byPath = useMemo(() => new Map(files.map((f) => [f.path, f])), [files]);
  const [open, setOpen] = useState<ReadonlyMap<string, number>>(() => new Map());
  const [refit, setRefit] = useState(0);
  const [selection, setSelection] = useState<Selection>(null);
  const [hover, setHover] = useState<Selection>(null);
  // Held here rather than in the pane so it outlives every change of selection.
  const [tab, setTab] = useState<Tab>("structure");
  // Likewise, so the same walk shows for each file while comparing them.
  const [walk, setWalk] = useState<Direction | null>(null);
  const [insightsOpen, setInsightsOpen] = useState(false);
  const [category, setCategory] = useState<string | null>(null);
  // The centre column shows the map or the route table; the rail and the pane
  // keep working on either.
  const [centre, setCentre] = useState<"map" | "routes" | "investigations">("map");
  const current = workspace ?? centre;
  // Explanations fetched on this page, by file or folder, so moving the
  // selection away and back finds the answer still there without asking again.
  const [explanations, setExplanations] = useState<ReadonlyMap<string, ExplanationState>>(() => new Map());
  const [modelRoles, setModelRoles] = useState<ReadonlyMap<string, ModelRole>>(() => new Map(Object.entries(storedModelRoles)));

  const explain = useCallback(
    (target: ExplainTarget) => {
      const key = targetKey(target);
      setExplanations((prev) => new Map(prev).set(key, { status: "loading" }));

      void (async () => {
        const result = await (target.kind === "file" ? operations.explainFile(target.path) : operations.explainFolder(target.dir));
        setExplanations((prev) => new Map(prev).set(key, result.ok ? { status: "done", result } : { status: "error", error: result.error }));
        if (result.ok && target.kind === "file" && result.labelled?.role) {
          const role = result.labelled.role;
          setModelRoles((prev) => new Map(prev).set(target.path, role));
        }
      })();

    },
    [operations],
  );

  const toggleCategory = useCallback((c: string) => setCategory((prev) => (prev === c ? null : c)), []);

  // Clicking a folded node is the one click it has, so opening it also selects
  // the panel it becomes.
  const openGroup = useCallback((id: string) => {
    setOpen((prev) => new Map(prev).set(id, 0));
    setRefit((n) => n + 1);
    setSelection({ kind: "group", id });
  }, []);

  const closeGroup = useCallback(
    (id: string) => {
      setOpen((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
      // A selection inside a folded-away panel has nothing left to point at.
      setSelection((prev) => {
        if (prev?.kind === "group") return prev.id === id ? null : prev;
        if (prev?.kind === "file") {
          const dir = folding.groupOf.get(prev.path);
          return dir !== undefined && groupId(dir) === id ? null : prev;
        }
        return prev;
      });
    },
    [folding],
  );

  const toggleFile = useCallback((path: string) => {
    setSelection((prev) => (prev?.kind === "file" && prev.path === path ? null : { kind: "file", path }));
  }, []);

  const scroll = useCallback((id: string, offset: number) => {
    setOpen((prev) => (prev.has(id) ? new Map(prev).set(id, Math.max(0, offset)) : prev));
  }, []);

  // A path clicked in the pane becomes the selection on the map, and the map
  // shows it: its folder opens if it's folded, and scrolls if the row is
  // outside the window. A folder that's already showing the row stays put.
  const reveal = useCallback(
    (path: string) => {
      const dir = folding.groupOf.get(path);
      const group = folding.groups.find((g) => g.dir === dir);
      if (dir === undefined || !group) return;
      const id = groupId(dir);
      const ranked = rankGroupFiles(group, byPath);
      const index = ranked.indexOf(path);
      const current = open.get(id);
      const first = current === undefined ? null : clampOffset(current, ranked.length);
      if (first === null || index < first || index >= first + MAX_ROWS) {
        setOpen(new Map(open).set(id, index - Math.floor(MAX_ROWS / 2)));
        if (current === undefined) setRefit((n) => n + 1);
      }
      setSelection({ kind: "file", path });
      // The row under the pointer is about to be replaced, and a removed
      // element never reports the pointer leaving it.
      setHover(null);
    },
    [folding, byPath, open],
  );

  const deselect = useCallback(() => setSelection(null), []);

  return (
    <Shell
      compact={Boolean(workspace)}
      showDetail={current === "map" || current === "routes"}
      rail={
        <CategoryRail files={files} modelRoles={modelRoles} frameworks={repository.projects.map((p) => p.adapter)} active={category} onToggle={toggleCategory} />
      }
      map={
        <div className="absolute inset-0 flex flex-col">
          {!workspace && <div role="tablist" className="flex h-7 shrink-0 items-end gap-3 border-b border-line bg-surface px-3 text-[11px]">
            <CentreTab label="Map" on={centre === "map"} onClick={() => setCentre("map")} />
            <CentreTab label="Routes" count={routes.length} on={centre === "routes"} onClick={() => setCentre("routes")} />
            {investigations && <CentreTab label="Investigations / Ask" on={centre === "investigations"} onClick={() => setCentre("investigations")} />}
          </div>}
          <div className="relative min-h-0 flex-1">
            {workspaceContent && <div className={`absolute inset-0 min-h-0 flex-col ${current === "map" || current === "routes" ? "hidden" : "flex"}`}>{workspaceContent((file, mode = "map") => { reveal(file); setTab(mode === "evidence" ? "evidence" : "structure"); onWorkspaceChange?.(mode); }, selection?.kind === "file" ? selection.path : null)}</div>}
            {investigations && <div className={`absolute inset-0 ${centre === "investigations" ? "" : "invisible"}`}>
              {investigations((file) => { reveal(file); setCentre("map"); setTab("structure"); }, selection?.kind === "file" ? selection.path : null)}
            </div>}
            {/* Display removes the entire canvas from rendering; React Flow nodes
                explicitly set visibility and can override inherited invisibility.
                Keep it mounted to preserve the viewport when returning. */}
            <div className={`absolute inset-0 ${revealing && !analysisActivity?.busy ? "map-revealing" : ""}`} inert={mapLocked} style={{ display: current === "map" ? "block" : "none" }} aria-hidden={current !== "map"}>
              <DependencyMap
                files={files}
                edges={edges}
                modelRoles={modelRoles}
                folding={folding}
                open={open}
                selection={selection}
                hover={hover}
                refit={refit}
                category={category}
                onOpen={openGroup}
                onClose={closeGroup}
                onSelectFile={toggleFile}
                onScroll={scroll}
                onHover={setHover}
                onDeselect={deselect}
              />
            </div>
            {current === "map" && mapLocked && <div className="map-construction-overlay" role="status"><div><h2>{analysisActivity?.busy ? "Analyzing your repository" : "Drawing your verified map"}</h2><p>{analysisActivity?.busy ? analysisActivity.stage : "Analysis complete. Nodes and connections are appearing."}</p><p>Map and Overview unlock when ready.</p>{analysisActivity?.busy && <button className="button-danger" onClick={analysisActivity.onCancel}>Cancel analysis</button>}</div></div>}
            {current === "routes" && (
              <RouteTable
                routes={routes}
                coverage={routeCoverage}
                selection={selection}
                hover={hover}
                onReveal={reveal}
                onHover={setHover}
              />
            )}
          </div>
        </div>
      }
      detail={
        <div inert={mapLocked} aria-busy={mapLocked} className={mapLocked ? "opacity-40 pointer-events-none" : ""}><DetailPane
          files={files}
          byPath={byPath}
          edges={edges}
          folding={folding}
          repository={{ ...repository, routes: routes.length }}
          selection={selection}
          hover={hover}
          tab={tab}
          onTab={setTab}
          walk={walk}
          onWalk={setWalk}
          insightsOpen={insightsOpen}
          onInsightsOpen={setInsightsOpen}
          onReveal={reveal}
          onHover={setHover}
          modelRoles={modelRoles}
          explanations={explanations}
          onExplain={explain}
          explanationSetup={explanationSetup}
          evidence={evidence}
        /></div>
      }
    />
  );
}

function CentreTab({ label, count, on, onClick }: { label: string; count?: number; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={on}
      onClick={onClick}
      className={`-mb-px border-b pb-1.5 ${on ? "border-accent text-fg" : "border-transparent text-fg-muted hover:text-fg"}`}
    >
      {label}
      {count !== undefined && <span className="ml-1 text-fg-muted tabular-nums">{count}</span>}
    </button>
  );
}
