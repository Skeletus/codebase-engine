import path from "node:path";
import { createHash } from "node:crypto";
import { RepositoryReader, RepositoryReadError, directoryExclusion } from "../repository/read-policy.ts";
import { publicMetadataName } from "../repository/metadata-policy.ts";
import { decodeSource } from "../model/positions.ts";
import type { Resource, GapReason } from "../model/framework.ts";
import { interpretConfig, CONFIG_LIMITS, type ConfigResult, type StaticValue } from "./static-config.ts";
import { GenerationBoundary, AnalysisBoundaryError } from "./boundary.ts";
import { interpretDeclarativeMetadata } from "./declarative-metadata.ts";

export type MetadataRecord = { resource: Resource; text: string; config: ConfigResult; json: unknown; dependencies: string[] };
export type MetadataIssue = { path: string; reason: GapReason; detail: string };

/** Ephemeral text cache. Durable snapshots retain hashes/ranges, never config bytes. */
export class ProtectedMetadataIndex {
  readonly reader: RepositoryReader;
  readonly boundary: GenerationBoundary;
  private readonly records = new Map<string, MetadataRecord>();
  readonly issues: MetadataIssue[] = [];
  constructor(reader: RepositoryReader, boundary = new GenerationBoundary()) { this.reader = reader; this.boundary = boundary; }
  read(relative: string): MetadataRecord | undefined {
    this.boundary.check();
    if (this.records.has(relative)) return this.records.get(relative);
    if (!publicMetadataName(path.posix.basename(relative)) || path.isAbsolute(relative) || relative.includes("\\") || relative.includes(":") || relative.split("/").some(p => !p || p === "." || p === "..") || relative.split("/").slice(0, -1).some(p => directoryExclusion(p))) { this.issues.push({ path: ".", reason: "policy-denied", detail: "metadata path is not authorized" }); return; }
    try {
      const bytes = this.reader.readPublicMetadata(path.resolve(this.reader.root, relative));
      const raw = bytes, text = decodeSource(raw);
      const hash = createHash("sha256").update(raw).digest("hex");
      let json: unknown = null, config: ConfigResult;
      if (relative.endsWith(".json")) {
        try { json = JSON.parse(text); config = interpretConfig(text, { expression: true, boundary: this.boundary }); }
        catch (error) { if (error instanceof AnalysisBoundaryError) throw error; config = { value: { kind: "unknown", reason: "parse-error" }, gaps: [{ reason: "parse-error", start: 0, end: text.length, detail: "malformed JSON metadata" }], visited: 0, sites: [] }; }
      } else if (/\.config\.[cm]?[jt]s$/.test(relative)) config = interpretConfig(text, { boundary: this.boundary, wrappers: { defineConfig: "vite" } });
      else if (path.posix.basename(relative) === "pyproject.toml") config = interpretDeclarativeMetadata(text, "pyproject", this.boundary);
      else if (/^requirements(?:[.-][\w-]+)?\.txt$/.test(path.posix.basename(relative))) config = interpretDeclarativeMetadata(text, "requirements", this.boundary);
      else config = { value: { kind: "unknown", reason: "unsupported-syntax" }, gaps: [{ reason: "unsupported-syntax", start: 0, end: text.length, detail: "metadata recorded; stack-specific interpretation deferred" }], visited: 0, sites: [] };
      const resource: Resource = { path: relative, hash, bytes: raw.length, utf16Length: text.length, lines: text ? text.split(/\r\n|\r|\n/).length - (/\r\n$|[\r\n]$/.test(text) ? 1 : 0) : 0, encoding: "utf8", purpose: "metadata" };
      const record = { resource, text, config, json, dependencies: [] as string[] }; this.records.set(relative, record); return record;
    } catch (error) {
      if (error instanceof AnalysisBoundaryError) throw error;
      if (error instanceof RepositoryReadError && error.reason === "limit") throw error;
      this.reader.stat(path.resolve(this.reader.root, relative));
      this.issues.push({ path: relative, reason: error instanceof RepositoryReadError ? error.reason === "policy" ? "policy-denied" : error.reason === "too-large" ? "resource-limit" : "missing-metadata" : "unsupported-encoding", detail: "metadata unavailable through protected reader" });
    }
  }
  all(): MetadataRecord[] { return [...this.records.values()].sort((a, b) => a.resource.path.localeCompare(b.resource.path)); }
  /** Follow only explicit root-local JSON extends; no dependency symlinks or helpers. */
  follow(relative: string, active = new Set<string>(), followed = new Set<string>()): void {
    this.boundary.check();
    if (active.has(relative)) { this.issues.push({ path: relative, reason: "config-cycle", detail: "metadata extends cycle" }); return; }
    if (followed.has(relative)) return;
    if (followed.size >= CONFIG_LIMITS.dependencies) { this.issues.push({ path: relative, reason: "resource-limit", detail: "metadata dependency budget" }); return; }
    followed.add(relative); active.add(relative);
    const record = this.read(relative);
    if (record && record.json && typeof record.json === "object" && "extends" in record.json) {
      const entries = record.json.extends;
      const names = typeof entries === "string" ? [entries] : Array.isArray(entries) && entries.every(e => typeof e === "string") ? entries : null;
      if (!names || names.length > CONFIG_LIMITS.dependencies) this.issues.push({ path: relative, reason: "dynamic-expression", detail: "unsupported metadata extends" });
      else for (const name of names) {
        this.boundary.check();
        if (!name.startsWith(".") || name.includes("\\") || name.includes(":")) { this.issues.push({ path: relative, reason: "policy-denied", detail: "only explicit local metadata extends" }); continue; }
        const target = path.posix.normalize(path.posix.join(path.posix.dirname(relative), name));
        if (target === ".." || target.startsWith("../")) { this.issues.push({ path: relative, reason: "policy-denied", detail: "metadata dependency escapes root" }); continue; }
        const approved = target.endsWith(".json") ? target : target + ".json";
        record.dependencies.push(approved); this.follow(approved, active, followed);
      }
    }
    active.delete(relative);
  }
  digest(): string { return createHash("sha256").update(JSON.stringify(this.all().map(r => [r.resource.path, r.resource.hash, r.dependencies]))).digest("hex"); }
}

export function literalProperty(value: StaticValue, name: string): string | undefined { const p = value.kind === "object" ? value.properties[name] : undefined; return p?.kind === "literal" && typeof p.value === "string" ? p.value : undefined; }
