import { selectFiles, type Selection } from "../parser/index.ts";
import { GenerationBoundary } from "./boundary.ts";
import { coordinateSnapshot } from "./composition.ts";
import type { CodeSnapshot } from "./types.ts";
import type { RefreshCandidate } from "./refresh.ts";

export { coordinateSnapshot } from "./composition.ts";
export type LanguageDriver = { id: string; analyze: (selection: Selection, full: boolean, progress?: (stage: "parse") => void) => { snapshot: CodeSnapshot; mode: "full" | "incremental"; parsed: number; reused: number }; project?: (snapshot: CodeSnapshot, selection: Selection) => CodeSnapshot; reset: () => void };
export type AsyncLanguageExtension = { analyze: (snapshot: CodeSnapshot, selection: Selection, full: boolean) => Promise<{ snapshot: CodeSnapshot; parsed: number; reused: number }>; reset: () => void };

/** Owns one generation/inventory. Syntax sessions and parser ASTs stay in drivers;
 * composition owns the additive neutral model, storage owns publication. */
export class AnalysisCoordinator {
  private previous: Selection | undefined;
  private readonly driver: LanguageDriver;
  private readonly signal: AbortSignal | undefined;
  constructor(driver: LanguageDriver, options: { signal?: AbortSignal } = {}) { this.driver = driver; this.signal = options.signal; }
  analyze(root: string, forceFull: boolean, progress?: (stage: "parse") => void): RefreshCandidate {
    const selection = selectFiles(root, root, new GenerationBoundary(this.signal));
    const topology = (s: Selection) => JSON.stringify({ paths: s.walk.candidates.map(c => [c.path, c.project]), skipped: s.walk.skipped, projects: s.walk.projects, excluded: s.walk.excludedDirectories, ownership: s.walk.discovery.inventory, discoveryProjects: s.walk.discovery.projects.map(p => [p.path, p.declarations, p.languages]) });
    const full = forceFull || !this.previous || topology(this.previous) !== topology(selection) || !this.previous.reader.metadataStable();
    const parsed = this.driver.analyze(selection, full, progress);
    const composed = coordinateSnapshot(parsed.snapshot, selection);
    const snapshot = this.driver.project?.(composed, selection) ?? composed;
    this.previous = selection;
    return { ...parsed, snapshot, reader: selection.reader };
  }
  reset(): void { this.previous = undefined; this.driver.reset(); }
  /** Async extensions share the protected inventory and publication candidate.
   * The synchronous TS/JS entry remains an unchanged compatibility surface. */
  async analyzeAsync(root: string, forceFull: boolean, extensions: readonly AsyncLanguageExtension[], progress?: (stage: "parse") => void): Promise<RefreshCandidate> {
    const selection = selectFiles(root, root, new GenerationBoundary(this.signal));
    const topology = (s: Selection) => JSON.stringify({ inventory: s.walk.discovery.inventory, projects: s.walk.discovery.projects, skipped: s.walk.skipped, excluded: s.walk.excludedDirectories });
    const full = forceFull || !this.previous || topology(this.previous) !== topology(selection) || !this.previous.reader.metadataStable();
    const result = this.driver.analyze(selection, full, progress);
    let snapshot = coordinateSnapshot(result.snapshot, selection), parsed = result.parsed, reused = result.reused;
    snapshot = this.driver.project?.(snapshot, selection) ?? snapshot;
    for (const extension of extensions) { selection.walk.discovery.boundary.check(); const next = await extension.analyze(snapshot, selection, full); snapshot = next.snapshot; parsed += next.parsed; reused += next.reused; }
    selection.walk.discovery.boundary.check();
    this.previous = selection;
    return { snapshot, mode: result.mode, parsed, reused, reader: selection.reader };
  }
}
