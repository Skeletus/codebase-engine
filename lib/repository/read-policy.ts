import { closeSync, fstatSync, lstatSync, openSync, readSync, readdirSync, realpathSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

export const READ_LIMITS = {
  fileBytes: 1024 * 1024,
  totalBytes: 128 * 1024 * 1024,
  files: 20_000,
  entries: 200_000,
  depth: 64,
} as const;

export type ReadLimits = { [K in keyof typeof READ_LIMITS]: number };
export type ReadPurpose = "source" | "metadata" | "probe";

const OUTPUTS = new Set(["node_modules", "dist", "build", "out", "coverage", "target", "bin", "obj", "vendor", "generated", "__generated__"]);
const SENSITIVE = /^(?:\.env(?:\..*)?|credentials(?:\..*)?|secrets?(?:\..*)?|id_(?:rsa|dsa|ecdsa|ed25519)(?:\..*)?|.*\.(?:pem|key|p12|pfx|keystore))$/i;

export class RepositoryReadError extends Error {
  readonly reason: "policy" | "too-large" | "limit" | "unreadable";
  constructor(reason: "policy" | "too-large" | "limit" | "unreadable", message: string) {
    super(message);
    this.reason = reason;
    this.name = "RepositoryReadError";
  }
}

export function inside(root: string, absolute: string): boolean {
  const relative = path.relative(root, absolute);
  return relative === "" || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`));
}

export function directoryExclusion(name: string): string | null {
  if (OUTPUTS.has(name.toLowerCase())) return "dependency, build, vendored or generated directory";
  if (name.startsWith(".")) return "dot-directory";
  if (SENSITIVE.test(name)) return "sensitive directory";
  return null;
}

/** One budget and authorization boundary for selection, resolution, configs and evidence. */
export class RepositoryReader {
  readonly root: string;
  readonly limits: ReadLimits;
  private bytes = 0;
  private entries = 0;
  private files = 0;
  private metadata = new Map<string, string>();
  private denied = new Set<string>();
  private excluded = new Set<string>();
  private rootIdentity: { ino: number; dev: number };
  private observations = new Map<string, { input: string; kind: "stat" | "list" | "source" | "metadata"; signature: string }>();
  readonly directories = new Set<string>();
  private observe(input: string, kind: "stat" | "list" | "source" | "metadata", signature: string): void {
    const key = `${kind}:${input}`;
    const previous = this.observations.get(key);
    if (previous && previous.signature !== signature) throw new RepositoryReadError("unreadable", "Repository changed during analysis");
    this.observations.set(key, { input, kind, signature });
  }
  metadataDigest(): string {
    return JSON.stringify([...this.observations.values()].filter((o) => o.kind === "metadata").sort((a, b) => a.input.localeCompare(b.input)));
  }
  metadataStable(): boolean {
    try {
      this.authorize(this.root, "probe");
      const fresh = new RepositoryReader(this.root);
      for (const excluded of this.excluded) fresh.exclude(excluded);
      for (const o of this.observations.values()) if (o.kind === "metadata") {
        fresh.read(o.input, "metadata");
        if (fresh.observations.get(`metadata:${o.input}`)?.signature !== o.signature) return false;
      }
      return true;
    } catch { return false; }
  }
  /** Replay every successful read and resolution probe, including missing targets.
   * Watch events are hints; these protected observations establish stability. */
  stable(): boolean {
    try {
      this.authorize(this.root, "probe");
      if (realpathSync.native(this.root) !== this.root) return false;
      const fresh = new RepositoryReader(this.root);
      for (const excluded of this.excluded) fresh.exclude(excluded);
      for (const o of this.observations.values()) {
        if (o.kind === "stat") fresh.stat(o.input);
        else if (o.kind === "list") fresh.list(o.input);
        else fresh.read(o.input, o.kind);
        if (fresh.observations.get(`${o.kind}:${o.input}`)?.signature !== o.signature) return false;
      }
      return true;
    } catch { return false; }
  }

  constructor(directory: string, limits: Partial<ReadLimits> = {}, authorizedRoot?: string) {
    this.root = realpathSync(path.resolve(directory));
    if (authorizedRoot && path.toNamespacedPath(this.root) !== path.toNamespacedPath(authorizedRoot)) throw new RepositoryReadError("policy", "Selected root identity changed; select it again");
    const rootStat = lstatSync(this.root);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new RepositoryReadError("unreadable", "Repository root is not a directory");
    this.rootIdentity = { ino: rootStat.ino, dev: rootStat.dev };
    this.limits = { ...READ_LIMITS, ...limits };
    for (const value of Object.values(this.limits)) {
      if (!Number.isSafeInteger(value) || value <= 0) throw new Error("Read limits must be positive safe integers");
    }
  }

  exclude(relative: string): void { this.excluded.add(relative); }
  denials(): string[] { return [...this.denied].sort(); }

  relative(absolute: string): string { return path.relative(this.root, absolute).split(path.sep).join("/"); }

  private authorize(input: string, purpose: ReadPurpose): string {
    const rootStat = lstatSync(this.root);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink() || rootStat.ino !== this.rootIdentity.ino || rootStat.dev !== this.rootIdentity.dev) throw new RepositoryReadError("policy", "Selected root changed during analysis");
    const absolute = path.resolve(input);
    if (!inside(this.root, absolute)) throw new RepositoryReadError("policy", "outside selected repository");
    const relative = this.relative(absolute);
    const parts = relative ? relative.split("/") : [];
    if (parts.length > this.limits.depth) throw new RepositoryReadError("limit", "Repository nesting limit exceeded");
    const dependency = parts.includes("node_modules");
    for (const [i, part] of parts.entries()) {
      if (SENSITIVE.test(part)) throw new RepositoryReadError("policy", "sensitive path");
      const reason = i < parts.length - 1 ? directoryExclusion(part) : null;
      // Dependencies may supply resolution metadata, never source. pnpm's metadata
      // lives below .pnpm; this exception is limited to dependency paths inside root.
      if (reason && !(dependency && purpose !== "source" && (part === "node_modules" || part === ".pnpm"))) {
        throw new RepositoryReadError("policy", reason);
      }
    }
    for (const dir of this.excluded) {
      if ((relative === dir || relative.startsWith(`${dir}/`)) && !(dependency && purpose !== "source" && dir === "node_modules")) {
        throw new RepositoryReadError("policy", "excluded directory");
      }
    }
    if (purpose === "metadata" && path.extname(absolute).toLowerCase() !== ".json") {
      throw new RepositoryReadError("policy", "only JSON metadata may be read by resolution");
    }
    let current = this.root;
    for (const part of parts) {
      current = path.join(current, part);
      const stat = lstatSync(current, { throwIfNoEntry: false });
      if (!stat) break;
      if (stat.isSymbolicLink()) throw new RepositoryReadError("policy", "symbolic link not followed");
    }
    return absolute;
  }

  private attempt<T>(input: string, purpose: ReadPurpose, operation: (absolute: string) => T): T | undefined {
    try { return operation(this.authorize(input, purpose)); }
    catch (error) {
      if (error instanceof RepositoryReadError && error.reason === "limit") throw error;
      const relative = inside(this.root, path.resolve(input)) ? this.relative(path.resolve(input)) : "<outside-root>";
      const reason = error instanceof RepositoryReadError ? error.message : "unreadable path";
      // Missing candidates are normal module-resolution probes, not policy failures.
      if (error instanceof RepositoryReadError || !(error instanceof Error && "code" in error && error.code === "ENOENT")) {
        this.denied.add(`${relative}: ${reason}`);
      }
      return undefined;
    }
  }

  stat(input: string) {
    const result = this.attempt(input, "probe", (absolute) => lstatSync(absolute, { throwIfNoEntry: false }));
    this.observe(input, "stat", result ? `${result.isDirectory() ? "dir" : "file"}:${result.size}:${result.mtimeMs}:${result.ino}:${result.dev}` : "absent-or-denied");
    return result;
  }

  canonical(input: string): string {
    return this.attempt(input, "probe", (absolute) => {
      const real = realpathSync(absolute);
      this.authorize(real, "probe");
      return real;
    }) ?? input;
  }

  list(input: string) {
    const absolute = this.authorize(input, "source");
    try {
      const entries = readdirSync(absolute, { withFileTypes: true });
      this.entries += entries.length;
      if (this.entries > this.limits.entries) throw new RepositoryReadError("limit", "Repository entry limit exceeded");
      this.observe(input, "list", JSON.stringify(entries.map((e) => [e.name, e.isDirectory(), e.isFile(), e.isSymbolicLink()]).sort((a, b) => String(a[0]).localeCompare(String(b[0])))));
      this.directories.add(absolute);
      return entries.sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
      if (error instanceof RepositoryReadError) throw error;
      throw new RepositoryReadError("unreadable", `Cannot enumerate repository directory ${this.relative(absolute) || "."}`);
    }
  }

  countFile(): void {
    if (++this.files > this.limits.files) throw new RepositoryReadError("limit", "Repository code-file limit exceeded");
  }

  read(input: string, purpose: "source" | "metadata"): Buffer {
    const absolute = this.authorize(input, purpose);
    let fd: number;
    try { fd = openSync(absolute, "r"); }
    catch { throw new RepositoryReadError("unreadable", "Cannot open repository file"); }
    try {
      // Recheck path identity after opening. Repository edits must not turn a probe
      // into an unbounded read or silently substitute a symlink target.
      this.authorize(absolute, purpose);
      const stat = fstatSync(fd);
      const current = lstatSync(absolute);
      if (!stat.isFile() || current.isSymbolicLink() || stat.ino !== current.ino || stat.dev !== current.dev) {
        throw new RepositoryReadError("policy", "file changed during read");
      }
      if (stat.size > this.limits.fileBytes) throw new RepositoryReadError("too-large", `File exceeds ${this.limits.fileBytes} byte limit`);
      const buffer = Buffer.alloc(Math.min(stat.size + 1, this.limits.fileBytes + 1));
      let length = 0;
      while (length < buffer.length) {
        const n = readSync(fd, buffer, length, buffer.length - length, null);
        if (!n) break;
        length += n;
      }
      this.authorize(absolute, purpose);
      const after = fstatSync(fd);
      const pathAfter = lstatSync(absolute);
      if (length !== stat.size || after.size !== stat.size || after.mtimeMs !== stat.mtimeMs || pathAfter.ino !== stat.ino || pathAfter.dev !== stat.dev) throw new RepositoryReadError("unreadable", "file changed during read");
      this.bytes += length;
      if (this.bytes > this.limits.totalBytes) throw new RepositoryReadError("limit", "Repository aggregate read limit exceeded");
      this.observe(input, purpose, createHash("sha256").update(buffer.subarray(0, length)).digest("hex"));
      this.observe(input, "stat", `file:${after.size}:${after.mtimeMs}:${after.ino}:${after.dev}`);
      return buffer.subarray(0, length);
    } finally { closeSync(fd); }
  }

  readMetadata(input: string): string | undefined {
    const cached = this.metadata.get(input);
    if (cached !== undefined) return cached;
    const value = this.attempt(input, "metadata", (absolute) => this.read(absolute, "metadata").toString("utf8"));
    if (value === undefined) this.stat(input);
    if (value !== undefined) this.metadata.set(input, value);
    return value;
  }
}
