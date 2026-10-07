import { watch, type FSWatcher } from "node:fs";
import path from "node:path";
import { directoryExclusion, RepositoryReader } from "../repository/read-policy.ts";
import type { CodeSnapshot } from "./types.ts";
import { publicMetadataName } from "../repository/metadata-policy.ts";

export function refreshInputClass(filename: string): "source" | "metadata" | "topology" {
  if (publicMetadataName(filename)) return "metadata";
  return /\.(?:[cm]?[jt]sx?)$/.test(filename) ? "source" : "topology";
}

export type RefreshCandidate = { snapshot: CodeSnapshot; reader: RepositoryReader; mode: "full" | "incremental"; parsed: number; reused: number };
export type RefreshStatus = { state: "watching" | "paused" | "degraded" | "refreshing"; message: string; mode: "full" | "incremental"; parsed: number; reused: number; elapsedMs: number; memoryBytes: number; snapshotBytes: number };
type Options = { begin?: () => void; analyze: (full: boolean) => RefreshCandidate; publish: (snapshot: CodeSnapshot) => void; status: (status: RefreshStatus) => void; debounceMs?: number; auditMs?: number };

/** One selected-root scheduler. ASTs belong to its adapter; SQLite owns publication.
 * Directory events are never used to construct evidence. */
export class RepositoryRefresh {
  private options: Options;
  private candidate: RefreshCandidate | null = null;
  private handles: FSWatcher[] = [];
  private timer: ReturnType<typeof setTimeout> | undefined;
  private audit: ReturnType<typeof setInterval> | undefined;
  private active = false;
  private stopped = false;
  private epoch = 0;
  private events = 0;
  private full = false;
  private retries = 0;
  private metrics = { mode: "full" as "full" | "incremental", parsed: 0, reused: 0, elapsedMs: 0, memoryBytes: 0, snapshotBytes: 0 };
  constructor(options: Options) { this.options = options; }
  private report(state: RefreshStatus["state"], message: string) { this.options.status({ state, message, ...this.metrics }); }
  run(full: boolean): CodeSnapshot {
    const generation = ++this.epoch, started = performance.now();
    this.options.begin?.();
    this.report("refreshing", full ? "Full rebuild; previous snapshot retained" : "Incremental refresh; recomputing all resolution and framework evidence");
    const next = this.options.analyze(full);
    if (this.stopped || generation !== this.epoch || !next.reader.stable()) throw new Error("unstable_generation");
    this.options.publish(next.snapshot);
    this.candidate = next;
    this.metrics = { mode: next.mode, parsed: next.parsed, reused: next.reused, elapsedMs: Math.round(performance.now() - started), memoryBytes: process.memoryUsage().rss, snapshotBytes: Buffer.byteLength(JSON.stringify(next.snapshot)) };
    this.retries = 0;
    if (this.active) this.attach();
    return next.snapshot;
  }
  start() {
    if (this.stopped) return;
    this.active = true;
    // A reopened snapshot has no resident ASTs/read observations. Bootstrap a
    // fresh full generation before trusting any watcher or starting reuse.
    if (!this.audit) this.audit = setInterval(() => {
      try { if (this.candidate && !this.candidate.reader.stable()) this.enqueue(true); }
      catch { this.loss(); }
    }, this.options.auditMs ?? 30000);
    if (!this.candidate) { this.enqueue(true); return; }
    this.attach();
    if (this.active) this.report("watching", "Watching selected root; protected stability audit every 30s");
  }
  private attach() {
    const previous = this.handles; this.handles = []; for (const h of previous) h.close();
    const reader = this.candidate?.reader;
    if (!reader || !this.active) return;
    try {
      for (const directory of reader.directories) {
        if (!reader.stat(directory)?.isDirectory() || reader.canonical(directory) !== directory) throw new Error("watch root changed");
        const handle = watch(directory, { persistent: false }, (kind, filename) => {
          if (!this.active) return;
          if (!filename) { this.enqueue(true); return; }
          // Nonrecursive directory watches never attach to excluded children.
          // Filenames are hints only; untrusted names cannot become read paths.
          if (filename.includes("/") || filename.includes("\\") || filename === "..") { this.enqueue(true); return; }
          if (directoryExclusion(filename)) return;
          try {
            const absolute = path.join(directory, filename);
            const stat = new RepositoryReader(reader.root).stat(absolute);
            if (stat?.isSymbolicLink()) { this.enqueue(true); return; }
            this.enqueue(kind !== "change" || refreshInputClass(filename) !== "source");
          } catch { this.loss(); }
        });
        handle.on("error", () => this.loss());
        handle.on("close", () => { if (this.active && this.handles.includes(handle)) this.loss(); });
        this.handles.push(handle);
      }
    } catch { this.loss(); }
  }
  /** Overflow, null filenames, metadata changes and branch-like bursts all
   * escalate. Input names never bypass the repository reader. */
  enqueue(full: boolean) {
    if (!this.active || this.stopped) return;
    this.full ||= full || ++this.events > 32;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = undefined; const force = this.full; this.full = false; this.events = 0;
      try { this.run(force); if (this.active) this.report("watching", "Refresh published; watching selected root"); }
      catch {
        if (++this.retries <= 2 && this.active) {
          this.report("paused", "Refresh unstable or failed; prior complete snapshot retained, retrying full analysis"); this.enqueue(true);
        } else this.loss();
      }
    }, this.options.debounceMs ?? 600);
  }
  pause() {
    this.active = false; ++this.epoch;
    if (this.timer) clearTimeout(this.timer); this.timer = undefined;
    if (this.audit) clearInterval(this.audit); this.audit = undefined;
    const handles = this.handles; this.handles = []; for (const h of handles) h.close();
    this.report("paused", "Watching paused; manual Full refresh remains available");
  }
  loss() {
    this.pause();
    this.report("degraded", "Watcher lost or refresh repeatedly failed. Previous complete snapshot retained. Use Full refresh, then Resume watching.");
  }
  close() { this.pause(); this.stopped = true; this.candidate = null; }
}
