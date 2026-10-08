import { isBuiltin } from "node:module";
import path from "node:path";
import { ts } from "ts-morph";
import type { ConfigReport, EdgeKind, ExcludedDirectory, ImportStatus, SkippedFile } from "./types.ts";
import { isCodeFile, isDeclarationFile, toPosix } from "./walk.ts";
import { RepositoryReader, RepositoryReadError } from "../repository/read-policy.ts";

type Alias = {
  pattern: string;
  prefix: string;
  suffix: string;
  wildcard: boolean;
  targets: string[];
  base: string;
};

type LoadedConfig = {
  valid: boolean;
  options: ts.CompilerOptions;
  cache: ts.ModuleResolutionCache;
  aliases: Alias[];
  baseUrl: string | null;
};

export type RepositoryIndex = {
  root: string;
  reader: RepositoryReader;
  /** Repository-relative paths that became nodes. */
  nodes: Set<string>;
  skipped: Map<string, SkippedFile>;
  /** Protected source inventory delegated to another language session. */
  deferredSources?: ReadonlySet<string>;
  excludedDirectories: ExcludedDirectory[];
  workspacePackages: Set<string>;
};

export type Resolver = {
  resolve(fromAbsolute: string, specifier: string, kind: EdgeKind): ImportStatus;
  configs(): ConfigReport[];
};

const CONFIG_NAMES = ["tsconfig.json", "jsconfig.json"];
// "No inputs were found" is about the config's include globs, which the parser
// doesn't use; every other diagnostic is reported.
const IGNORED_CONFIG_CODES = new Set([18003]);
const NODE_ESM_RESOLUTION = new Set([
  ts.ModuleResolutionKind.Node16,
  ts.ModuleResolutionKind.NodeNext,
]);

export function createResolver(index: RepositoryIndex): Resolver {
  const { root, reader } = index;
  const host: ts.ModuleResolutionHost & ts.ParseConfigHost = {
    useCaseSensitiveFileNames: process.platform !== "win32",
    fileExists: (p) => reader.stat(p)?.isFile() ?? false,
    directoryExists: (p) => reader.stat(p)?.isDirectory() ?? false,
    readFile: (p) => reader.readMetadata(p),
    realpath: (p) => reader.canonical(p),
    // File selection is controlled by the walker, never config include globs.
    readDirectory: () => [],
    getCurrentDirectory: () => root,
  };
  const nearestConfig = new Map<string, string | null>();
  const loaded = new Map<string, LoadedConfig>();
  const reports = new Map<string, ConfigReport>();
  const noConfig = loadDefaults(root);

  const findConfig = (dir: string): string | null => {
    const cached = nearestConfig.get(dir);
    if (cached !== undefined) return cached;
    let found: string | null = null;
    for (const name of CONFIG_NAMES) {
      // Selected repositories exist only at runtime; they are not deployment assets.
      const candidate = path.join(/* turbopackIgnore: true */ dir, name);
      const before = reader.denials().length;
      if (reader.stat(candidate)?.isFile()) {
        found = candidate;
        break;
      }
      if (reader.denials().length !== before) throw new RepositoryReadError("policy", "Applicable configuration is blocked by the repository read policy");
    }
    if (!found && dir !== root) {
      const parent = path.dirname(dir);
      // Never read a config from outside the repository: it isn't part of what was handed over.
      found = isInside(root, parent) ? findConfig(parent) : null;
    }
    nearestConfig.set(dir, found);
    return found;
  };

  const configFor = (fromAbsolute: string): LoadedConfig => {
    const configPath = findConfig(path.dirname(fromAbsolute));
    if (!configPath) return noConfig;
    const existing = loaded.get(configPath);
    if (existing) return existing;
    const { config, report } = loadConfig(root, configPath, host, reader);
    loaded.set(configPath, config);
    reports.set(configPath, report);
    return config;
  };

  // Where a resolved path lands inside the repository decides its status.
  const classifyInRepository = (relativePath: string): ImportStatus => {
    if (index.nodes.has(relativePath)) return { status: "internal", target: relativePath };
    if(index.deferredSources?.has(relativePath))return{status:"excluded",reason:"target-skipped",detail:`${relativePath} (syntax delegated to composed language session)`};

    if (isDeclarationFile(relativePath)) {
      // TypeScript prefers foo.d.ts over foo.js; at runtime foo.js is what loads.
      const runtime = runtimeSiblings(relativePath).filter((sibling) => index.nodes.has(sibling));
      if (runtime.length === 1) return { status: "internal", target: runtime[0] };
      return { status: "excluded", reason: "declaration-file", detail: relativePath };
    }

    const skipped = index.skipped.get(relativePath);
    if (skipped) {
      return { status: "excluded", reason: "target-skipped", detail: `${relativePath} (${skipped.reason})` };
    }

    const excludedDir = index.excludedDirectories.find(
      (dir) => relativePath === dir.path || relativePath.startsWith(`${dir.path}/`),
    );
    if (excludedDir) {
      return { status: "excluded", reason: "in-excluded-directory", detail: `${excludedDir.path} (${excludedDir.reason})` };
    }

    if (!isCodeFile(relativePath)) {
      return { status: "excluded", reason: "non-code-file", detail: relativePath };
    }

    // A code file inside the repository that the walker neither kept, skipped nor
    // excluded means the walk and the resolver disagree. That's a parser bug.
    throw new Error(`Resolved to ${relativePath}, which the walk never accounted for`);
  };

  const classifyExistingPath = (absolute: string): ImportStatus | null => {
    if (!isInside(root, absolute)) return { status: "external", external: "outside-root" };
    const stat = reader.stat(absolute);
    if (!stat) return null;
    const relativePath = toPosix(path.relative(root, absolute));
    if (stat.isDirectory()) {
      return { status: "unresolved", reason: "directory-without-index", detail: `${relativePath || "."}/ has no index file` };
    }
    return classifyInRepository(relativePath);
  };

  const resolve = (fromAbsolute: string, specifier: string, kind: EdgeKind): ImportStatus => {
    if (isBuiltin(specifier)) return { status: "external", external: "builtin" };

    const config = configFor(fromAbsolute);
    if (!config.valid) return { status: "unresolved", reason: "file-not-found", detail: "module resolution withheld because the applicable configuration could not be read completely; see config diagnostics" };
    const mode = resolutionMode(fromAbsolute, kind, config.options);
    const result = ts.resolveModuleName(specifier, fromAbsolute, config.options, host, config.cache, undefined, mode);
    const resolved = result.resolvedModule;

    if (resolved) {
      const absolute = path.resolve(resolved.resolvedFileName);
      const relativePath = toPosix(path.relative(root, absolute));
      const inNodeModules = relativePath.split("/").includes("node_modules");
      // A linked workspace package resolves through node_modules to a real path in
      // the repository; that's an internal edge, whatever the resolver flags it as.
      if (isInside(root, absolute) && !inNodeModules) return classifyInRepository(relativePath);
      if (resolved.isExternalLibraryImport || inNodeModules) return { status: "external", external: "package" };
      return { status: "external", external: "outside-root" };
    }

    const bare = specifier.split("?")[0];

    if (bare.startsWith(".") || path.isAbsolute(bare)) {
      const absolute = path.resolve(path.dirname(fromAbsolute), bare);
      const existing = classifyExistingPath(absolute);
      if (existing) return existing;
      return {
        status: "unresolved",
        reason: "file-not-found",
        detail: path.extname(bare)
          ? `no file at ${toPosix(path.relative(root, absolute))}`
          : `nothing at ${toPosix(path.relative(root, absolute))} with any extension or index`,
      };
    }

    if (bare.startsWith("#")) {
      return { status: "unresolved", reason: "subpath-import-not-found", detail: `no package.json "imports" entry resolves ${bare}` };
    }

    const matching = config.aliases.filter((alias) => matchAlias(alias, bare) !== null);
    if (matching.length > 0) {
      const tried: string[] = [];
      for (const alias of matching) {
        const captured = matchAlias(alias, bare) ?? "";
        for (const target of alias.targets) {
          const absolute = path.resolve(alias.base, target.replace("*", captured));
          const existing = classifyExistingPath(absolute);
          if (existing && existing.status !== "unresolved") return existing;
          tried.push(toPosix(path.relative(root, absolute)));
        }
      }
      return {
        status: "unresolved",
        reason: "alias-target-not-found",
        detail: `matched ${matching.map((a) => a.pattern).join(", ")}; nothing at ${tried.join(", ")}`,
      };
    }

    const packageName = packageNameOf(bare);
    if (index.workspacePackages.has(packageName)) {
      return {
        status: "unresolved",
        reason: "workspace-package-not-linked",
        detail: `${packageName} is declared by a package.json in this repository but isn't linked (dependencies not installed)`,
      };
    }

    if (config.baseUrl) {
      // With baseUrl, "components/x" can mean a folder in the repository. If the
      // first segment exists there, this is a broken local path, not a package.
      const absolute = path.resolve(config.baseUrl, bare);
      const existing = classifyExistingPath(absolute);
      if (existing) return existing;
      if (isInside(root, absolute) && reader.stat(path.resolve(config.baseUrl, bare.split("/")[0]))) {
        return {
          status: "unresolved",
          reason: "file-not-found",
          detail: `resolves against baseUrl to ${toPosix(path.relative(root, absolute))}, which doesn't exist`,
        };
      }
    }

    return { status: "external", external: "package" };
  };

  return {
    resolve,
    configs: () => [...reports.values()].sort((a, b) => a.path.localeCompare(b.path)),
  };
}

function loadDefaults(root: string): LoadedConfig {
  const options = normaliseOptions({});
  return { valid: true, options, cache: ts.createModuleResolutionCache(root, (x) => x, options), aliases: [], baseUrl: null };
}

function loadConfig(root: string, configPath: string, host: ts.ParseConfigHost, reader: RepositoryReader): { config: LoadedConfig; report: ConfigReport } {
  const before = new Set(reader.denials());
  const read = ts.readConfigFile(configPath, host.readFile);
  const dir = path.dirname(configPath);
  const parsed = ts.parseJsonConfigFileContent(read.config ?? {}, host, dir, undefined, configPath);
  const errors = [read.error, ...parsed.errors]
    .filter((d): d is ts.Diagnostic => d !== undefined && !IGNORED_CONFIG_CODES.has(d.code))
    .map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"));
  errors.push(...reader.denials().filter((d) => !before.has(d)).map((d) => `Read policy: ${d}`));

  const options = normaliseOptions(parsed.options);
  // pathsBasePath is where TypeScript itself anchors `paths` (the config that
  // declared them, through `extends`). It isn't in the public type.
  const pathsBase = parsed.options.pathsBasePath;
  const base = typeof pathsBase === "string" ? pathsBase : (options.baseUrl ?? dir);
  const aliases = Object.entries(options.paths ?? {}).map(([pattern, targets]) => toAlias(pattern, targets, base));

  return {
    config: {
      valid: errors.length === 0,
      options,
      cache: ts.createModuleResolutionCache(dir, (x) => x, options),
      aliases,
      baseUrl: options.baseUrl ?? null,
    },
    report: { path: toPosix(path.relative(root, configPath)), errors },
  };
}

function normaliseOptions(options: ts.CompilerOptions): ts.CompilerOptions {
  const next: ts.CompilerOptions = { ...options, allowJs: true, resolveJsonModule: true };
  const moduleKind = options.module;
  const nodeModule =
    moduleKind === ts.ModuleKind.Node16 || moduleKind === ts.ModuleKind.Node18 || moduleKind === ts.ModuleKind.Node20 || moduleKind === ts.ModuleKind.NodeNext;
  // Classic resolution ignores node_modules and index files; nothing modern
  // relies on it, so an unset or classic setting resolves the way bundlers do.
  if (!nodeModule && (options.moduleResolution === undefined || options.moduleResolution === ts.ModuleResolutionKind.Classic)) {
    next.moduleResolution = ts.ModuleResolutionKind.Bundler;
    next.module = ts.ModuleKind.ESNext;
  }
  return next;
}

function resolutionMode(fromAbsolute: string, kind: EdgeKind, options: ts.CompilerOptions): ts.ResolutionMode {
  const resolution = options.moduleResolution;
  if (resolution === undefined || !NODE_ESM_RESOLUTION.has(resolution)) return undefined;
  // require() resolves with the "require" conditions whatever the file's own
  // format. The other kinds keep exactly the modes they had before it existed.
  if (kind === "require") return ts.ModuleKind.CommonJS;
  const ext = path.extname(fromAbsolute);
  if (ext === ".cts" || ext === ".cjs") return kind === "dynamic-import" ? ts.ModuleKind.ESNext : ts.ModuleKind.CommonJS;
  if (ext === ".mts" || ext === ".mjs" || kind === "dynamic-import") return ts.ModuleKind.ESNext;
  return undefined;
}

function toAlias(pattern: string, targets: string[], base: string): Alias {
  const star = pattern.indexOf("*");
  return star === -1
    ? { pattern, prefix: pattern, suffix: "", wildcard: false, targets, base }
    : { pattern, prefix: pattern.slice(0, star), suffix: pattern.slice(star + 1), wildcard: true, targets, base };
}

function matchAlias(alias: Alias, specifier: string): string | null {
  if (!alias.wildcard) return specifier === alias.prefix ? "" : null;
  if (specifier.length < alias.prefix.length + alias.suffix.length) return null;
  if (!specifier.startsWith(alias.prefix) || !specifier.endsWith(alias.suffix)) return null;
  return specifier.slice(alias.prefix.length, specifier.length - alias.suffix.length);
}

function packageNameOf(specifier: string): string {
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

function runtimeSiblings(declarationPath: string): string[] {
  const match = /^(.*)\.d\.(ts|mts|cts)$/.exec(declarationPath);
  if (!match) return [];
  const [, stem, ext] = match;
  if (ext === "mts") return [`${stem}.mjs`];
  if (ext === "cts") return [`${stem}.cjs`];
  return [`${stem}.js`, `${stem}.jsx`];
}

function isInside(root: string, absolute: string): boolean {
  const relative = path.relative(root, absolute);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
