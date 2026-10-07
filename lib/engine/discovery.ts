import path from "node:path";
import type { Dirent } from "node:fs";
import { publicMetadataName } from "../repository/metadata-policy.ts";
import { RepositoryReader } from "../repository/read-policy.ts";
import { ProtectedMetadataIndex } from "./metadata.ts";
import { defaultRegistry, type Composition, type ExtractorRegistry } from "./registry.ts";
import { GenerationBoundary } from "./boundary.ts";
import type { GapReason } from "../model/framework.ts";

export type DiscoveredProject = { path: string; declarations: string[]; dependencies: string[]; languageDependencies: Record<string, string[]>; versions: Record<string, string>; languages: string[]; composition: Composition; workspaceMembers: string[] };
export type InventoryFile = { path: string; language: string; owner: string; state: "selected" | "unsupported" | "excluded" };
export type Discovery = { projects: DiscoveredProject[]; inventory: InventoryFile[]; auxiliaryPaths?: readonly string[]; sourceInputs: ReadonlyMap<string, { hash: string; text: string; validUtf8?: boolean }>; metadata: ProtectedMetadataIndex; issues: { path: string; reason: GapReason; detail: string }[]; boundary: GenerationBoundary };
const LANGUAGES: Readonly<Record<string, string>> = { ".ts": "typescript-javascript", ".tsx": "typescript-javascript", ".mts": "typescript-javascript", ".cts": "typescript-javascript", ".js": "typescript-javascript", ".jsx": "typescript-javascript", ".mjs": "typescript-javascript", ".cjs": "typescript-javascript", ".py": "python", ".java": "java", ".kt": "kotlin", ".swift": "swift", ".m": "objective-c", ".mm": "objective-c++" };
export function languageOf(name: string): string | undefined { return LANGUAGES[path.posix.extname(name)]; }

/** Discovery observes the existing protected walk; it never starts another traversal. */
export class ProjectDiscovery {
  readonly reader: RepositoryReader;
  readonly boundary: GenerationBoundary;
  private readonly registry: ExtractorRegistry;
  readonly metadata: ProtectedMetadataIndex;
  private declarations = new Map<string, string[]>();
  private files: { path: string; language: string; state: InventoryFile["state"] }[] = [];
  private sources = new Map<string, { hash: string; text: string; validUtf8?: boolean }>();
  private auxiliaryPaths: string[] = [];
  private issues: Discovery["issues"] = [];
  constructor(reader: RepositoryReader, boundary = new GenerationBoundary(), registry: ExtractorRegistry = defaultRegistry()) { this.reader = reader; this.boundary = boundary; this.registry = registry; this.metadata = new ProtectedMetadataIndex(reader, boundary); }
  directory(absolute: string, entries: readonly Dirent[]): void {
    this.boundary.check();
    const dir = this.reader.relative(absolute) || ".", declarations: string[] = [];
    for (const e of entries) {
      this.boundary.check();
      const relative = this.reader.relative(path.join(absolute, e.name));
      if (publicMetadataName(e.name) && (e.isFile() || e.isSymbolicLink())) {
        const record = this.metadata.read(relative);
        if (record && ["package.json", "pyproject.toml", "manage.py", "apps.py"].includes(e.name)) declarations.push(relative);
      }
      // Python app ownership is source-local convention discovery, not Django analysis.
      if (e.isFile() && (e.name === "apps.py" || e.name === "manage.py")) declarations.push(relative);
    }
    if (dir === "." || declarations.length) this.declarations.set(dir, declarations);
  }
  file(relative: string, symlink = false): void {
    if (!symlink && /\.(?:html|css|svg|png|jpe?g|gif|webp|ico|woff2?|ttf|mp4|webm|txt|json)$/.test(relative)) this.auxiliaryPaths.push(relative);
    const language = languageOf(relative); if (!language) return;
    this.boundary.check();
    this.files.push({ path: relative, language, state: symlink ? "excluded" : language === "typescript-javascript" ? "selected" : "unsupported" });
    if (language !== "typescript-javascript") this.reader.countFile();
  }
  skip(relative: string): void { const file = this.files.find(f => f.path === relative); if (file) file.state = "excluded"; }
  source(relative: string, hash: string, text: string, validUtf8?:boolean): void { this.sources.set(relative, { hash, text, validUtf8 }); }
  finish(): Discovery {
    const roots = [...this.declarations.keys()].sort((a, b) => a.localeCompare(b)), rootSet = new Set(roots);
    const owner = (file: string) => { let dir = path.posix.dirname(file); while (!rootSet.has(dir)) dir = path.posix.dirname(dir); return dir; };
    const inventory = this.files.map(f => ({ ...f, owner: owner(f.path) })).sort((a, b) => a.path.localeCompare(b.path));
    const projects = roots.map(dir => {
      this.boundary.check();
      const declarations = this.declarations.get(dir)!, dependencies = new Set<string>(), nodeDependencies = new Set<string>(), pythonDependencies = new Set<string>(), versions: Record<string, string> = Object.create(null);
      const pkg = this.metadata.all().find(r => r.resource.path === (dir === "." ? "package.json" : dir + "/package.json"));
      if (pkg?.config.value.kind === "object" && pkg.json && typeof pkg.json === "object" && !Array.isArray(pkg.json)) {
        for (const field of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
          const block: unknown = Reflect.get(pkg.json, field);
          if (block && typeof block === "object" && !Array.isArray(block)) for (const [name, version] of Object.entries(block)) { dependencies.add(name); nodeDependencies.add(name); if (typeof version === "string") versions[name] = version; }
        }
      }
      const py = this.metadata.all().find(r => r.resource.path === (dir === "." ? "pyproject.toml" : dir + "/pyproject.toml"));
      if (py?.config.value.kind === "object") {
        const declared = py.config.value.properties["project.dependencies"];
        if (declared?.kind === "array") for (const value of declared.items) {
          const match = value.kind === "literal" && typeof value.value === "string" ? /^([A-Za-z0-9][A-Za-z0-9._-]*)==([\w.+-]+)$/.exec(value.value) : null;
          if (match) { const name = match[1].toLowerCase().replaceAll("_", "-"); dependencies.add(name); pythonDependencies.add(name); versions[name] = match[2]; }
          else this.issues.push({ path: py.resource.path, reason: "unsupported-syntax", detail: "Python dependency version declaration is not exact or supported" });
        }
      }
      for (const record of this.metadata.all().filter(r => path.posix.dirname(r.resource.path) === dir || dir === "." && path.posix.dirname(r.resource.path) === ".")) if (/^requirements/.test(path.posix.basename(record.resource.path)) && record.config.value.kind === "object") for (const [name, value] of Object.entries(record.config.value.properties)) if (value.kind === "literal" && typeof value.value === "string") { dependencies.add(name); pythonDependencies.add(name); versions[name] = value.value; }
      const languages = [...new Set(inventory.filter(f => f.owner === dir).map(f => f.language))].sort();
      const workspaceMembers: string[] = [];
      if (pkg?.config.value.kind === "object" && pkg.json && typeof pkg.json === "object" && "workspaces" in pkg.json) {
        const block = pkg.json.workspaces, patterns = Array.isArray(block) ? block : block && typeof block === "object" && "packages" in block ? block.packages : null;
        if (Array.isArray(patterns) && patterns.every(p => typeof p === "string")) {
          const expanded = expandInventoryGlobs(patterns, roots.filter(r => r !== dir).map(r => dir === "." ? r : r.startsWith(dir + "/") ? r.slice(dir.length + 1) : "../" + r), this.boundary);
          workspaceMembers.push(...expanded.matches.map(r => dir === "." ? r : dir + "/" + r));
          for (const reason of expanded.reasons) this.issues.push({ path: pkg.resource.path, reason, detail: "workspace membership is incomplete" });
        } else this.issues.push({ path: pkg.resource.path, reason: "dynamic-expression", detail: "unsupported workspace declaration" });
      }
      const languageDependencies = { "typescript-javascript": [...nodeDependencies].sort(), python: [...pythonDependencies].sort() };
      return { path: dir, declarations, dependencies: [...dependencies].sort(), languageDependencies, versions, languages, composition: this.registry.compose({ dir: path.resolve(this.reader.root, dir), dependencies, languageDependencies: { "typescript-javascript": nodeDependencies, python: pythonDependencies } }, languages), workspaceMembers };
    }).sort((a, b) => a.path.localeCompare(b.path));
    for (const r of this.metadata.all()) if (/^(?:tsconfig|jsconfig)/.test(path.posix.basename(r.resource.path))) this.metadata.follow(r.resource.path);
    return { projects, inventory, auxiliaryPaths: this.auxiliaryPaths.sort(), sourceInputs: this.sources, metadata: this.metadata, issues: [...this.issues, ...this.metadata.issues], boundary: this.boundary };
  }
}

/** Deliberately small glob dialect: literal segments, * and whole-segment **. */
export function expandInventoryGlobs(patterns: readonly string[], inventory: readonly string[], boundary = new GenerationBoundary()): { matches: string[]; reasons: GapReason[]; truncated: boolean } {
  boundary.check();
  if (patterns.length > 100 || inventory.length > 20000) return { matches: [], reasons: ["resource-limit"], truncated: true };
  const matches = new Set<string>(), reasons = new Set<GapReason>();
  for (const pattern of patterns) {
    boundary.check();
    if (!pattern || pattern.length > 16384 || pattern.includes("\\") || pattern.includes(":") || pattern.startsWith("/") || pattern.split("/").length > 64 || pattern.split("/").some(p => !p || p === "." || p === "..") || /[?\[\]{}()!]/.test(pattern) || pattern.split("/").some(p => p.includes("**") && p !== "**")) { reasons.add("policy-denied"); continue; }
    for (const file of inventory) { boundary.check(); if (file.length > 16384 || file.split("/").length > 64 || file.split("/").some(p => p === ".." || p === "." || !p)) { reasons.add("policy-denied"); continue; } if (matchSegments(pattern.split("/"), file.split("/"), boundary)) matches.add(file); }
  }
  return { matches: [...matches].sort(), reasons: [...reasons].sort(), truncated: false };
}

// Dynamic programming replaces backtracking regular expressions: an adversarial
// glob cannot monopolize one uninterruptible regex evaluation.
function matchSegments(pattern: string[], parts: string[], boundary: GenerationBoundary): boolean {
  let row = Array.from({ length: parts.length + 1 }, (_, i) => i === 0);
  for (const segment of pattern) {
    const next = Array<boolean>(parts.length + 1).fill(false);
    if (segment === "**") next[0] = row[0];
    for (let i = 1; i <= parts.length; i++) { boundary.check(); next[i] = segment === "**" ? row[i] || next[i - 1] : row[i - 1] && matchSegment(segment, parts[i - 1], boundary); }
    row = next;
  }
  return row[parts.length];
}
function matchSegment(pattern: string, value: string, boundary: GenerationBoundary): boolean {
  let p = 0, v = 0, star = -1, after = 0;
  while (v < value.length) {
    boundary.check();
    if (pattern[p] === value[v]) { p++; v++; }
    else if (pattern[p] === "*") { star = p++; after = v; }
    else if (star !== -1) { p = star + 1; v = ++after; }
    else return false;
  }
  while (pattern[p] === "*") p++;
  return p === pattern.length;
}
