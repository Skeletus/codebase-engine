import path from "node:path";
import { profileId, variantId, type Profile, type Variant, type Witness, type GapReason } from "../model/framework.ts";
import { normalizeRange } from "../model/positions.ts";
import type { Discovery, DiscoveredProject } from "./discovery.ts";
import type { MetadataRecord } from "./metadata.ts";
import { directoryExclusion } from "../repository/read-policy.ts";

export const PROFILE_NAMES = ["node-esm", "node-commonjs", "vite-browser", "vite-ssr", "metro-android", "metro-ios", "python-package"] as const;
export type ProfileName = typeof PROFILE_NAMES[number];
export type ResolutionOutcome = { status: "internal"; target: string; reason: "authorized-literal-file"; witnesses: Witness[] } | { status: "external"; name: string; reason: "package-boundary"; witnesses: Witness[] } | { status: "excluded" | "unresolved"; reason: GapReason; detail: string; witnesses: Witness[] };
export type ProfileContext = { profile: Profile; variant: Variant; state: "partial"; resolve: (from: string, specifier: string, sourceHash: string) => ResolutionOutcome; cacheIdentity: (sourceHash: string) => string };

export function metadataWitness(record: MetadataRecord, variant: string): Witness | null {
  if (!record.text.length || !record.resource.lines) return null;
  const end = record.text.length - (/\r\n$/.test(record.text) ? 2 : /[\r\n]$/.test(record.text) ? 1 : 0);
  if (!end) return null;
  return { role: "configuration", extractorVersion: "fs-02/1", variantId: variant, site: { file: record.resource.path, ...normalizeRange(record.text, 0, end, "utf16"), fileHash: record.resource.hash, extractor: "discovery/config", evidenceKind: "verified" } };
}

/** Runtime-specific search/exports/aliases are deliberately absent until stack phases. */
export function createResolutionProfile(discovery: Discovery, project: DiscoveredProject, name: ProfileName, environment?: "development" | "production"): ProfileContext {
  if (!PROFILE_NAMES.includes(name) || !discovery.projects.includes(project)) throw new Error("Unknown profile/project");
  const profile: Profile = { id: profileId(project.path, name, "infrastructure-1"), projectId: project.path, resolverId: name, semanticsVersion: "infrastructure-1", language: name === "python-package" ? "python" : "typescript-javascript" };
  const env = environment ?? "development", platform = name.startsWith("metro-") ? name.slice(6) : null;
  const label = name === "python-package" ? "static-python" : name.startsWith("vite-") ? (name === "vite-ssr" ? "ssr-" : "browser-") + env : name.startsWith("metro-") ? platform + "-" + env : "node-" + env;
  const id = variantId(profile.id, label, platform, []);
  const metadata = discovery.metadata.all().filter(r => {
    const dir = path.posix.dirname(r.resource.path), basename = path.posix.basename(r.resource.path);
    if (dir !== project.path && !(project.path === "." && dir === ".")) return false;
    if (name === "python-package") return /^(?:pyproject\.toml|requirements.*\.txt|poetry\.lock|uv\.lock|settings\.py)$/.test(basename);
    if (/^(?:package\.json|package-lock\.json|npm-shrinkwrap\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lock|(?:tsconfig|jsconfig)(?:\.[^/]+)?\.json)$/.test(basename)) return true;
    if (name.startsWith("vite-")) return /^vite\.config\./.test(basename);
    if (name.startsWith("metro-")) return /^metro\.config\./.test(basename);
    return /^next\.config\./.test(basename);
  });
  const included = new Set(metadata.map(r => r.resource.path));
  for (let index = 0; index < metadata.length; index++) {
    for (const dependency of metadata[index].dependencies) {
      const record = discovery.metadata.all().find(r => r.resource.path === dependency);
      if (record && !included.has(dependency)) { included.add(dependency); metadata.push(record); }
    }
    if (metadata.length > 64) throw new Error("resource-limit: profile metadata dependencies");
  }
  const witnesses = metadata.map(r => metadataWitness(r, id)).filter((w): w is Witness => w !== null);
  const variant: Variant = { id, projectId: project.path, profileId: profile.id, resolverId: name, environment: label, platform, conditions: [], configWitnesses: witnesses };
  const cache = new Map<string, ResolutionOutcome>();
  const cacheIdentity = (sourceHash: string) => JSON.stringify([profile.id, id, sourceHash, discovery.metadata.digest(), discovery.metadata.reader.metadataDigest()]);
  return { profile, variant, state: "partial", cacheIdentity, resolve(from, specifier, sourceHash) {
    discovery.boundary.check();
    const reader = discovery.metadata.reader;
    const input = discovery.sourceInputs.get(from);
    const file = discovery.inventory.find(f => f.path === from);
    if (!file || file.owner !== project.path || !/^[a-f0-9]{64}$/.test(sourceHash) || !input || input.hash !== sourceHash) return { status: "unresolved", reason: "ambiguous-target", detail: "unknown or conflicting source owner/hash", witnesses };
    const sourceEnd = input.text.length - (/\r\n$/.test(input.text) ? 2 : /[\r\n]$/.test(input.text) ? 1 : 0);
    const reference: Witness[] = sourceEnd > 0 ? [{ role: "reference", variantId: id, extractorVersion: "fs-02/1", site: { file: from, ...normalizeRange(input.text, 0, sourceEnd, "utf16"), fileHash: sourceHash, extractor: "resolution/input", evidenceKind: "verified" } }] : [];
    const proof = [...reference, ...witnesses];
    if (file.language !== profile.language) return { status: "unresolved", reason: "unsupported-syntax", detail: "source language incompatible with profile", witnesses: proof };
    if (!reader.metadataStable()) return { status: "unresolved", reason: "stale-evidence", detail: "metadata changed; rediscovery required", witnesses };
    const key = JSON.stringify([cacheIdentity(sourceHash), from, specifier]);
    const cached = cache.get(key); if (cached) return structuredClone(cached);
    let outcome: ResolutionOutcome;
    if (!specifier || specifier.includes("\\") || specifier.includes(":" ) || path.posix.isAbsolute(specifier)) outcome = { status: "excluded", reason: "policy-denied", detail: "unsupported or absolute module path", witnesses };
    else if (!specifier.startsWith(".")) {
      const packageName = specifier.startsWith("@") ? specifier.split("/").slice(0, 2).join("/") : specifier.split("/")[0];
      const owners = discovery.projects.filter(p => p.declarations.some(d => { const r = discovery.metadata.all().find(r => r.resource.path === d); return !!r?.json && typeof r.json === "object" && "name" in r.json && r.json.name === packageName; }));
      outcome = owners.length ? { status: "unresolved", reason: owners.length > 1 ? "ambiguous-target" : "unsupported-syntax", detail: owners.length > 1 ? "duplicate first-party package names" : "first-party package found; profile entry semantics deferred", witnesses } : project.languageDependencies[profile.language]?.includes(packageName) ? { status: "external", name: packageName, reason: "package-boundary", witnesses } : { status: "unresolved", reason: "missing-metadata", detail: "package or alias interpretation is not established", witnesses };
    } else {
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(from), specifier));
      if (target === ".." || target.startsWith("../") || target.split("/").slice(0, -1).some(p => directoryExclusion(p))) outcome = { status: "excluded", reason: "policy-denied", detail: "target denied by protected inventory", witnesses };
      else {
        const denials = reader.denials().length;
        const stat = reader.stat(path.resolve(reader.root, target));
        const selected = discovery.inventory.find(f => f.path === target);
        outcome = reader.denials().length !== denials || selected?.state === "excluded" ? { status: "excluded", reason: "policy-denied", detail: "target denied by protected reader", witnesses } : stat?.isFile() && selected?.state === "selected" ? { status: "internal", target, reason: "authorized-literal-file", witnesses } : { status: "unresolved", reason: stat ? "unsupported-syntax" : "missing-metadata", detail: "literal file unavailable; runtime/profile search deferred", witnesses };
      }
    }
    outcome.witnesses = proof; cache.set(key, outcome); return structuredClone(outcome);
  } };
}
