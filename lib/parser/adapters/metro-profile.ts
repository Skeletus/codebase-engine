import path from "node:path";
import { createHash } from "node:crypto";
import type { CodeSnapshot } from "../../engine/types.ts";
import type { Discovery, DiscoveredProject } from "../../engine/discovery.ts";
import { metadataWitness } from "../../engine/profiles.ts";
import type { StaticValue } from "../../engine/static-config.ts";
import { profileId, variantId, capabilityId, factId, type Witness, type GapReason, type FrameworkBinding } from "../../model/framework.ts";
import type { Site } from "../../model/behavior.ts";
import { decodeSource } from "../../model/positions.ts";
import { RepositoryReadError } from "../../repository/read-policy.ts";
import { AnalysisBoundaryError } from "../../engine/boundary.ts";
import { frameworkFact } from "../framework-budget.ts";
import { createMetroResolver } from "./metro-resolution.ts";
import { METRO_DEFAULTS } from "./metro-defaults.ts";
import { interpretMetroConfig } from "./metro-config.ts";

export type MetroMode = "android-development" | "ios-development";
const tuples = {
  "rn83-bare": {"react-native": "0.83.10", react: "19.2.0", metro: "0.83.8", "@react-navigation/native": "7.5.0", "@react-navigation/native-stack": "7.20.0"},
  "rn85-bare": {"react-native": "0.85.3", react: "19.2.3", metro: "0.84.6", "@react-navigation/native": "7.5.0", "@react-navigation/native-stack": "7.20.0"},
  expo55: {expo: "55.0.31", react: "19.2.0", "react-native": "0.83.10", "expo-router": "55.0.18", "@expo/metro": "55.1.2", "@expo/metro-config": "55.0.27"},
  expo56: {expo: "56.0.23", react: "19.2.3", "react-native": "0.85.3", "expo-router": "56.2.21", "@expo/metro": "56.0.2", "@expo/metro-config": "56.0.19"},
} as const;
export function metroTuple(versions: Readonly<Record<string, string>>): keyof typeof tuples | undefined {
  return (Object.keys(tuples) as (keyof typeof tuples)[]).find(tuple => Object.entries(tuples[tuple]).every(([key, version]) => versions[key] === version) && (tuple.startsWith("expo") || !versions.expo));
}
const property = (value: StaticValue | undefined, key: string) => value?.kind === "object" ? value.properties[key] : undefined;
const strings = (value: StaticValue | undefined): string[] | undefined => value?.kind === "array" && value.items.every(v => v.kind === "literal" && typeof v.value === "string") ? value.items.map(v => v.kind === "literal" ? String(v.value) : "") : undefined;

/** Framework profile over the accepted protected discovery inventory. Unknown
 * customer composition is withheld; no Metro tool is loaded during analysis.
 */
export function metroProfile(snapshot: CodeSnapshot, discovery: Discovery, project: DiscoveredProject, mode: MetroMode) {
  if (!["android-development", "ios-development"].includes(mode)) throw Error("Unsupported Metro variant");
  const tuple = metroTuple(project.versions), platform = mode === "android-development" ? "android" : "ios";
  const defaults = tuple ? METRO_DEFAULTS[tuple] : undefined;
  const records = discovery.metadata.all().filter(r => path.posix.dirname(r.resource.path) === project.path && (path.posix.basename(r.resource.path) === "package.json" || /^metro\.config\./.test(path.posix.basename(r.resource.path))));
  if (records.length > 64) throw new AnalysisBoundaryError("resource-limit");
  const configs = records.filter(r => /^metro\.config\./.test(path.posix.basename(r.resource.path)));
  const config = configs.length === 1 ? tuple ? interpretMetroConfig(configs[0].text,tuple,discovery.boundary).value : configs[0].config.value : undefined, resolverConfig = property(config, "resolver");
  let configSafe = configs.length <= 1 && (!config || config.kind === "object") && (!resolverConfig || resolverConfig.kind === "object");
  if (config?.kind === "object" && Object.keys(config.properties).some(k => k !== "resolver")) configSafe = false;
  const allowed = new Set(["sourceExts", "assetExts", "resolverMainFields", "unstable_conditionNames", "unstable_conditionsByPlatform", "unstable_enablePackageExports"]);
  if (resolverConfig?.kind === "object" && Object.keys(resolverConfig.properties).some(k => !allowed.has(k))) configSafe = false;
  const list = (key: string, fallback: readonly string[]) => {
    const value = property(resolverConfig, key); if (!value) return [...fallback];
    const parsed = strings(value); if (!parsed) { configSafe = false; return [...fallback]; }
    if (parsed.length > 100 || parsed.some(s => !s || s.length > 4096)) throw new AnalysisBoundaryError("resource-limit"); return parsed;
  };
  const sourceExts = list("sourceExts", defaults?.sourceExts ?? []), assetExts = list("assetExts", defaults?.assetExts ?? []);
  if (sourceExts.some(e => !/^[a-z0-9]+$/.test(e)) || assetExts.some(e => !/^[a-z0-9]+$/.test(e))) configSafe = false;
  const mainFields = list("resolverMainFields", defaults?.resolverMainFields ?? []), conditions = list("unstable_conditionNames", defaults?.unstable_conditionNames ?? []);
  const configuredPlatforms=property(resolverConfig,"unstable_conditionsByPlatform");
  if(configuredPlatforms){
    if(configuredPlatforms.kind!=="object")configSafe=false;
    else for(const [key,value]of Object.entries(configuredPlatforms.properties)){
      const parsed=strings(value);if(!parsed||parsed.length>100)configSafe=false;else if(key===platform)conditions.push(...parsed);
    }
  } else if (defaults && "unstable_conditionsByPlatform" in defaults) {
    const byPlatform = defaults.unstable_conditionsByPlatform as Readonly<Record<string, readonly string[]>>;
    conditions.push(...byPlatform[platform] ?? []);
  }
  const exportsValue = property(resolverConfig, "unstable_enablePackageExports");
  if (exportsValue && !(exportsValue.kind === "literal" && typeof exportsValue.value === "boolean")) configSafe = false;
  const exportsEnabled = exportsValue?.kind === "literal" && typeof exportsValue.value === "boolean" ? exportsValue.value : defaults?.unstable_enablePackageExports ?? true;
  const resolverId = "metro-" + platform, profile = {id: profileId(project.path, resolverId, "fs-07/1"), projectId: project.path, resolverId, semanticsVersion: "fs-07/1", language: "typescript-javascript"};
  const variant = {id: variantId(profile.id, mode, platform, [...new Set(conditions)]), projectId: project.path, profileId: profile.id, resolverId, environment: mode, platform, conditions: [...new Set(conditions)], configWitnesses: [] as Witness[]};
  variant.configWitnesses = records.map(r => metadataWitness(r, variant.id)).filter((w): w is Witness => !!w);
  if (!snapshot.analysis.profiles.some(p => p.id === profile.id)) snapshot.analysis.profiles.push(profile);
  if (!snapshot.analysis.variants.some(v => v.id === variant.id)) snapshot.analysis.variants.push(variant);
  const sharedProject = snapshot.analysis.projects.find(p => p.projectId === project.path)!;
  if (!sharedProject.profileIds.includes(profile.id)) sharedProject.profileIds.push(profile.id);
  const key = {tupleId: tuple ?? "unqualified-version", capabilityId: "react-native-app", profileId: profile.id, variantId: variant.id};
  const cap = snapshot.analysis.capabilities.find(c => c.id === capabilityId(key)) ?? {...key, id: capabilityId(key), state: tuple ? "partial" as const : "blocked" as const, extractorVersion: "fs-07/1", qualificationRecord: null, gapIds: [] as string[]};
  if (!snapshot.analysis.capabilities.some(c => c.id === cap.id)) snapshot.analysis.capabilities.push(cap);
  const sources = new Set(discovery.inventory.filter(f => f.owner === project.path && f.state === "selected").map(f => f.path));
  const auxiliary = new Set((discovery.auxiliaryPaths ?? []).filter(file => [...discovery.projects].filter(p => p.path === "." || file.startsWith(p.path + "/")).sort((a, b) => b.path.length - a.path.length)[0]?.path === project.path));
  const files = new Set([...sources, ...auxiliary]);
  // Package name resemblance and declared workspace membership do not establish
  // an installed link. Relative package directories retain their metadata.
  const packages = discovery.metadata.all().filter(r => path.posix.basename(r.resource.path) === "package.json" && path.posix.dirname(r.resource.path) === project.path).map(r => ({root: path.posix.dirname(r.resource.path), json: r.json}));
  const kernel = createMetroResolver({files, packages, packageLinks: new Map()}, {platform, sourceExts: configSafe ? sourceExts : [], assetExts: new Set(assetExts), mainFields, conditions: variant.conditions, exportsEnabled, preferNativePlatform: true, customResolver: !configSafe}, discovery.boundary);
  function ensureResource(file: string) {
    if (snapshot.analysis.resources.some(r => r.path === file)) return true;
    if (!auxiliary.has(file)) return false;
    try {
      discovery.metadata.reader.countFile();
      const bytes = discovery.metadata.reader.read(path.resolve(discovery.metadata.reader.root, file), "source");
      const isText = /\.(?:json|css|svg|txt|html)$/.test(file), text = isText ? decodeSource(bytes) : "";
      snapshot.analysis.resources.push({path: file, hash: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.length, utf16Length: text.length, lines: text ? Math.max(1, text.split(/\r\n|\r|\n/).length - (/\r\n$|[\r\n]$/.test(text) ? 1 : 0)) : 1, encoding: isText ? "utf8" : "binary", purpose: "framework-input"}); return true;
    } catch (error) { if (error instanceof RepositoryReadError && error.reason === "limit") throw error; return false; }
  }
  function resolve(from: string, specifier: string, isImport = true) {
    discovery.boundary.check();
    if (!tuple) return {state: "boundary" as const, reason: "missing-metadata" as const};
    if (!discovery.metadata.reader.metadataStable()) return {state: "boundary" as const, reason: "stale-evidence" as const};
    const outcome = kernel.resolve(from, specifier, isImport);
    if (outcome.state === "resolved") for (const target of outcome.targets) {
      if (discovery.sourceInputs.get(target)?.validUtf8 === false) return {state: "boundary" as const, reason: "unsupported-encoding" as const};
      if (!ensureResource(target)) return {state: "boundary" as const, reason: "missing-metadata" as const};
    }
    return outcome;
  }
  function gap(site: Site, reason: GapReason) {
    const id = factId("gap", site, variant.id, reason);
    if (snapshot.analysis.gaps.some(g => g.id === id)) return;
    frameworkFact(snapshot, site.file); snapshot.analysis.gaps.push({id, occurrence: site, reason, variantId: variant.id, capabilityId: cap.id}); cap.gapIds.push(id);
  }
  function bind(site: Site, target: string, kind: FrameworkBinding["kind"], rule: string) {
    const id = factId("binding:" + kind, site, variant.id, target);
    if (snapshot.analysis.bindings.some(b => b.id === id)) return;
    frameworkFact(snapshot, site.file); snapshot.analysis.bindings.push({id, kind, sourceId: site.file, targetId: target, variantId: variant.id, occurrence: site, witnesses: [{role: "reference", site, variantId: variant.id, extractorVersion: "fs-07/1"}, ...variant.configWitnesses, {role: "framework-rule", tupleId: tuple ?? "unqualified-version", ruleId: rule, extractor: "react-native", extractorVersion: "fs-07/1", variantId: variant.id}]});
  }
  return {variant, tuple, configSafe, sources, resolve, gap, bind};
}
