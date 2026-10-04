import { createHash } from "node:crypto";
import path from "node:path";
import { directoryExclusion, RepositoryReader, RepositoryReadError, READ_LIMITS } from "../repository/read-policy.ts";
import { fallbackAdapter } from "./adapters/fallback.ts";
import { selectAdapter, type FrameworkAdapter } from "./adapters/index.ts";
import type { ExcludedDirectory, Project, SkippedFile } from "./types.ts";

export const CODE_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"];
const DECLARATION = /\.d\.(ts|mts|cts)$|\.d\.[^/.]+\.ts$/;

// Generated bundles and vendored blobs run past this; hand-written modules don't.
// A file over it is skipped and counted, never partially read.
export const MAX_FILE_BYTES = READ_LIMITS.fileBytes;

export type CandidateFile = {
  path: string;
  absolutePath: string;
  module: string;
  content: string;
  bytes: number;
  lines: number;
  hash: string;
  reachedBy: string | null;
  /** Path of the project the file belongs to. */
  project: string;
};

export type WalkResult = {
  candidates: CandidateFile[];
  skipped: SkippedFile[];
  excludedDirectories: ExcludedDirectory[];
  /** Every code file seen, parsed or skipped. */
  found: number;
  /** Package names declared by package.json files inside the repository. */
  workspacePackages: Set<string>;
  projects: Project[];
  /** Each project's adapter, by project path. */
  adapters: Map<string, FrameworkAdapter>;
  /** The project of every file found, parsed or skipped. */
  projectOf: Map<string, string>;
};

type CurrentProject = { path: string; adapter: FrameworkAdapter };

// Paths handed to an adapter are relative to its project.
export function withinProject(project: string, relativePath: string): string {
  return project === "." ? relativePath : relativePath.slice(project.length + 1);
}

export function toPosix(p: string): string {
  return p.split(path.sep).join("/");
}

export function isCodeFile(p: string): boolean {
  return CODE_EXTENSIONS.includes(path.extname(p));
}

export function isDeclarationFile(p: string): boolean {
  return DECLARATION.test(p);
}

// The module is the containing folder: the finest grouping that is a fact
// about the repository rather than a judgement about it.
export function moduleOf(relativePath: string): string {
  const dir = path.posix.dirname(relativePath);
  return dir === "" ? "." : dir;
}

function countLines(content: string): number {
  if (content.length === 0) return 0;
  const breaks = content.split("\n").length;
  return content.endsWith("\n") ? breaks - 1 : breaks;
}

export function walkRepository(root: string, reader = new RepositoryReader(root)): WalkResult {
  const result: WalkResult = {
    candidates: [],
    skipped: [],
    excludedDirectories: [],
    found: 0,
    workspacePackages: new Set(),
    projects: [],
    adapters: new Map(),
    projectOf: new Map(),
  };

  const within = (project: CurrentProject, relativePath: string) => withinProject(project.path, relativePath);

  const visit = (absoluteDir: string, parent: CurrentProject | null): void => {
    const entries = reader.list(absoluteDir);

    // The root is always a project. Below it, a package.json starts one only
    // when a framework is detected there; otherwise the folder stays in its
    // parent's project and keeps its conventions.
    let project = parent;
    const manifest = entries.find((entry) => entry.isFile() && entry.name === "package.json");
    if (!parent || manifest) {
      const pkg = manifest ? readPackage(path.join(absoluteDir, manifest.name), reader) : null;
      if (pkg?.name) result.workspacePackages.add(pkg.name);
      const adapter = selectAdapter({ dir: absoluteDir, dependencies: pkg?.dependencies ?? new Set() });
      if (!parent || adapter !== fallbackAdapter) {
        project = { path: toPosix(path.relative(root, absoluteDir)) || ".", adapter };
        result.projects.push({ path: project.path, adapter: adapter.name });
        result.adapters.set(project.path, adapter);
      }
    }
    if (!project) throw new Error(`No project for ${absoluteDir}`);

    for (const entry of entries) {
      const absolutePath = path.join(absoluteDir, entry.name);
      const relativePath = toPosix(path.relative(root, absolutePath));

      if (entry.isDirectory()) {
        const reason = directoryExclusion(entry.name) ?? project.adapter.excludeDirectory(within(project, relativePath));
        if (reason) {
          result.excludedDirectories.push({ path: relativePath, reason });
          reader.exclude(relativePath);
          continue;
        }
        visit(absolutePath, project);
        continue;
      }

      if (entry.isSymbolicLink()) {
        // Following links can leave the repository or loop; neither is walked.
        if (isCodeFile(entry.name)) {
          reader.countFile();
          result.found++;
          result.projectOf.set(relativePath, project.path);
          result.skipped.push({ path: relativePath, reason: "symlink", detail: "symbolic link not followed" });
        } else result.excludedDirectories.push({ path: relativePath, reason: "symbolic link not followed" });
        continue;
      }

      if (!entry.isFile() || !isCodeFile(entry.name)) continue;
      reader.countFile();
      result.found++;
      result.projectOf.set(relativePath, project.path);

      if (isDeclarationFile(entry.name)) {
        result.skipped.push({ path: relativePath, reason: "declaration-file", detail: "types only, no runtime imports" });
        continue;
      }

      const candidate = readCandidate(absolutePath, relativePath, project.path, project.adapter.reachedBy(within(project, relativePath)), reader);
      if ("reason" in candidate) result.skipped.push(candidate);
      else result.candidates.push(candidate);
    }
  };

  visit(root, null);
  return result;
}

function readPackage(absolutePath: string, reader: RepositoryReader): { name: string | null; dependencies: Set<string> } | null {
  let parsed: unknown;
  try {
    const text = reader.readMetadata(absolutePath);
    if (text === undefined) throw new Error("metadata denied or unreadable");
    parsed = JSON.parse(text);
  } catch (error) {
    if (error instanceof RepositoryReadError && error.reason === "limit") throw error;
    // Unknown manifest contents can change framework interpretation globally.
    throw new RepositoryReadError("unreadable", `Cannot read static package metadata at ${reader.relative(absolutePath)}`);
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const dependencies = new Set<string>();
  for (const field of ["dependencies", "devDependencies"]) {
    const block: unknown = field in parsed ? Reflect.get(parsed, field) : undefined;
    if (typeof block === "object" && block !== null) for (const name of Object.keys(block)) dependencies.add(name);
  }
  const name = "name" in parsed && typeof parsed.name === "string" ? parsed.name : null;
  return { name, dependencies };
}

function readCandidate(
  absolutePath: string,
  relativePath: string,
  project: string,
  reachedBy: string | null,
  reader: RepositoryReader,
): CandidateFile | SkippedFile {
  let buffer: Buffer;
  try {
    buffer = reader.read(absolutePath, "source");
  } catch (error) {
    if (error instanceof RepositoryReadError && error.reason === "limit") throw error;
    return { path: relativePath, reason: error instanceof RepositoryReadError && error.reason === "too-large" ? "too-large" : "unreadable", detail: error instanceof Error ? error.message : String(error) };
  }
  if (buffer.byteLength > MAX_FILE_BYTES) {
    return {
      path: relativePath,
      reason: "too-large",
      detail: `${buffer.byteLength} bytes, limit ${MAX_FILE_BYTES}`,
    };
  }
  if (buffer.includes(0)) {
    return { path: relativePath, reason: "binary", detail: "contains NUL bytes" };
  }
  const content = buffer.toString("utf8");
  return {
    path: relativePath,
    absolutePath,
    module: moduleOf(relativePath),
    content,
    bytes: buffer.byteLength,
    lines: countLines(content),
    hash: createHash("sha256").update(buffer).digest("hex"),
    reachedBy,
    project,
  };
}
