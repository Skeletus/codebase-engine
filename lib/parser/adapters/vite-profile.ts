import path from "node:path";
import { createHash } from "node:crypto";
import type { CodeSnapshot } from "../../engine/types.ts";
import type { Discovery, DiscoveredProject } from "../../engine/discovery.ts";
import { expandInventoryGlobs } from "../../engine/discovery.ts";
import { literalProperty } from "../../engine/metadata.ts";
import { metadataWitness } from "../../engine/profiles.ts";
import { profileId, variantId, factId, capabilityId, type Variant, type Resource, type Witness, type GapReason } from "../../model/framework.ts";
import { decodeSource } from "../../model/positions.ts";
import { directoryExclusion, RepositoryReadError } from "../../repository/read-policy.ts";
import type { StaticValue } from "../../engine/static-config.ts";
import type { Site } from "../../model/behavior.ts";
import { extractDevelopmentProxies } from "./vite-proxy.ts";
import { frameworkFact } from "../framework-budget.ts";
import { AnalysisBoundaryError } from "../../engine/boundary.ts";
import {reactPluginConfig} from "./vite-react-config.ts";

const property = (v: StaticValue | undefined, name: string): StaticValue | undefined => v?.kind === "object" ? v.properties[name] : undefined;
const strings = (v: StaticValue | undefined): string[] | undefined => v?.kind === "array" && v.items.every(i => i.kind === "literal" && typeof i.value === "string") ? v.items.map(i => i.kind === "literal" ? String(i.value) : "") : undefined;
const literal = (v: StaticValue | undefined): string | undefined => v?.kind === "literal" && typeof v.value === "string" ? v.value : undefined;
export type ViteResolution = { state: "resolved"; target: string; query: string; category: "module" | "asset" } | { state: "boundary"; reason: GapReason };

/** Runtime Vite profile. TypeScript type-only resolution remains the legacy graph. */
export function viteProfile(snapshot: CodeSnapshot, discovery: Discovery, project: DiscoveredProject, mode: "browser-development" | "browser-production" | "ssr-production" = "browser-development", auxiliaryText = new Map<string,string>()) {
  const vite = project.versions.vite, react = project.versions.react;
  const tuple = vite === "7.3.7" && react === "18.3.1" ? "vite7-react18" : vite === "8.3.3" && react === "19.2.8" ? "vite8-react19" : "unqualified-version";
  const records = discovery.metadata.all().filter(r => path.posix.dirname(r.resource.path) === project.path && /^vite\.config\./.test(path.posix.basename(r.resource.path)));
  const packages=discovery.metadata.all().filter(r=>path.posix.dirname(r.resource.path)===project.path && path.posix.basename(r.resource.path)==="package.json");
  const plugin=records.length===1 ? reactPluginConfig(records[0].text,vite,project.versions["@vitejs/plugin-react"],discovery.boundary) : undefined;
  const config = records.length === 1 ? plugin!.config : undefined;
  const rootValue = config ? literalProperty(config, "root") : undefined;
  const projectRoot = project.path === "." ? "" : project.path;
  const root = path.posix.normalize(path.posix.join(projectRoot, rootValue ?? "."));
  const resolveConfig = property(config, "resolve"), alias = property(resolveConfig, "alias");
  const tsPaths = property(resolveConfig,"tsconfigPaths");
  const tsconfigRecords=discovery.metadata.all().filter(r=>/^tsconfig(?:\.[^/]+)?\.json$/.test(path.posix.basename(r.resource.path)) && [...discovery.projects].filter(p=>p.path === "." || r.resource.path.startsWith(p.path+"/")).sort((a,b)=>b.path.length-a.path.length)[0]?.path === project.path);
  if (packages.length+records.length+tsconfigRecords.length>64) throw new AnalysisBoundaryError("resource-limit");
  const conditionsValue = property(mode.startsWith("ssr") ? property(property(config,"ssr"),"resolve") : resolveConfig,"conditions");
  const explicitConditions = strings(conditionsValue);
  if (explicitConditions && (explicitConditions.length>100 || explicitConditions.some(c=>!c || c.length>16384))) throw new AnalysisBoundaryError("resource-limit");
  const conditions = [...new Set((explicitConditions ?? (mode.startsWith("ssr") ? ["module", "node", "production"] : ["module", "browser", mode.endsWith("production") ? "production" : "development"])).map(c=>c === "development|production" ? mode.endsWith("production") ? "production" : "development" : c))];
  const resolverId = mode.startsWith("ssr") ? "vite-ssr" : "vite-browser", semanticsVersion = "fs-03/1";
  const profile = { id: profileId(project.path, resolverId, semanticsVersion), projectId: project.path, resolverId, semanticsVersion, language: "typescript-javascript" };
  const id = variantId(profile.id, mode, null, conditions);
  const variant: Variant = { id, projectId: project.path, profileId: profile.id, resolverId, environment: mode, platform: null, conditions, configWitnesses: [...packages,...records,...tsconfigRecords].map(r => metadataWitness(r, id)).filter((w): w is Witness => w !== null) };
  if (!snapshot.analysis.profiles.some(p => p.id === profile.id)) { snapshot.analysis.profiles.push(profile); snapshot.analysis.projects.find(p => p.projectId === project.path)!.profileIds.push(profile.id); }
  if (!snapshot.analysis.variants.some(v => v.id === id)) snapshot.analysis.variants.push(variant);
  if (mode === "browser-development" && records.length === 1 && tuple !== "unqualified-version") extractDevelopmentProxies(snapshot,records[0],variant);
  const cap = { tupleId: tuple, capabilityId: "vite-react-runtime", profileId: profile.id, variantId: id };
  snapshot.analysis.capabilities.push({ ...cap, id: capabilityId(cap), state: tuple === "unqualified-version" || mode.startsWith("ssr") && tuple !== "vite8-react19" ? "blocked" : "partial", extractorVersion: "fs-03/1", qualificationRecord: null, gapIds: [] });
  const inventory = new Set(discovery.inventory.filter(f => f.owner === project.path && f.state === "selected").map(f => f.path));
  const auxiliary = new Set((discovery.auxiliaryPaths ?? []).filter(f => {
    const owner = [...discovery.projects].filter(p => p.path === "." || f.startsWith(p.path + "/")).sort((a, b) => b.path.length - a.path.length)[0]; return owner?.path === project.path;
  }));
  const configuredExtensions = strings(property(resolveConfig,"extensions"));
  const extensions = configuredExtensions ?? [".mjs", ".js", ".mts", ".ts", ".jsx", ".tsx", ".json"];
  const pluginValue=property(config,"plugins");
  const buildConfig=property(config,"build");
  const transforms=property(config,"define")||property(config,"esbuild")||property(config,"oxc")||property(config,"experimental")||property(property(config,"worker"),"plugins")||property(property(buildConfig,"rollupOptions"),"plugins")||property(property(buildConfig,"rolldownOptions"),"plugins");
  const unsafeConfig = transforms || records.length > 1 || config?.kind === "unknown" || config?.kind === "conditional" || resolveConfig && resolveConfig.kind!=="object" || property(config, "root") && rootValue === undefined || conditionsValue && !explicitConditions || property(resolveConfig,"extensions") && (!configuredExtensions || configuredExtensions.some(e=>!/^\.[a-z]+$/.test(e))) || pluginValue !== undefined && !plugin?.qualifiedPlugin && !(pluginValue.kind==="array"&&!pluginValue.items.length);
  const aliases: { find: string; replacement: string }[] = [];
  let aliasUnknown = false;
  if (alias?.kind === "object") for (const [find, value] of Object.entries(alias.properties)) { const replacement = literal(value); if (replacement !== undefined) aliases.push({ find, replacement }); else aliasUnknown = true; }
  else if (alias?.kind === "array") for (const item of alias.items) { const find = literal(property(item, "find")), replacement = literal(property(item, "replacement")); if (find && replacement !== undefined && item.kind==="object"&&Object.keys(item.properties).every(k=>["find","replacement"].includes(k))) aliases.push({ find, replacement }); else aliasUnknown = true; }
  else if (alias) aliasUnknown = true;
  const approved = (target: string) => target !== ".." && !target.startsWith("../") && !target.startsWith("/") && !target.includes(":") && !target.split("/").some(p => directoryExclusion(p));
  function readAuxiliary(target: string): Resource | undefined {
    const present = snapshot.analysis.resources.find(r => r.path === target); if (present) return present;
    if (!auxiliary.has(target) || !approved(target)) return;
    discovery.boundary.check();
    try {
      discovery.metadata.reader.countFile();
      const bytes = discovery.metadata.reader.read(path.resolve(discovery.metadata.reader.root, target), "source");
      let text = "";
      if (/\.(?:html|css|svg|txt|json)$/.test(target)) text = decodeSource(bytes);
      auxiliaryText.set(target, text);
      const resource: Resource = { path: target, hash: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.length, utf16Length: text.length, lines: text ? text.split(/\r\n|\r|\n/).length : 1, purpose: "framework-input", encoding: /\.(?:html|css|svg|txt|json)$/.test(target) ? "utf8" : "binary" };
      snapshot.analysis.resources.push(resource); return resource;
    } catch (error) { if (error instanceof RepositoryReadError && error.reason === "limit") throw error; return; }
  }
  function resolve(from: string, specifier: string): ViteResolution {
    discovery.boundary.check();
    if (!inventory.has(from) && !auxiliary.has(from)) return {state:"boundary",reason:"policy-denied"};
    if (discovery.sourceInputs.get(from)?.validUtf8 === false) return {state:"boundary",reason:"unsupported-encoding"};
    if (tuple === "unqualified-version" || mode.startsWith("ssr") && tuple !== "vite8-react19") return { state: "boundary", reason: "missing-metadata" };
    if (unsafeConfig || aliasUnknown) return { state: "boundary", reason: "custom-resolver" };
    if (root !== "." && !approved(root)) return { state: "boundary", reason: "policy-denied" };
    if (!specifier || specifier.length > 16384 || specifier.includes("\\") || specifier.includes("\0") || specifier.startsWith("\0")) return { state: "boundary", reason: "policy-denied" };
    if (specifier.startsWith("virtual:") || specifier.startsWith("/@")) return { state: "boundary", reason: "generated-code-unavailable" };
    const [raw, ...suffix] = specifier.split("?"), query = suffix.join("?");
    if (suffix.length > 1 || query && !/^(?:raw|url|worker|worker&inline|inline|no-inline)$/.test(query)) return { state: "boundary", reason: "unsupported-syntax" };
    let name = raw;
    const matched = aliases.find(a => name === a.find || name.startsWith(a.find + "/"));
    if (matched) name = matched.replacement + name.slice(matched.find.length);
    if (!matched && tsPaths && !name.startsWith(".") && !name.startsWith("/")) {
      if (vite !== "8.3.3" || tsPaths.kind !== "literal" || typeof tsPaths.value !== "boolean") return {state:"boundary",reason:"unsupported-syntax"};
      if (tsPaths.value) {
        // The qualified native resolver ignores tsconfigs in dependency directories.
        if(discovery.metadata.reader.root.split(/[\\/]/).some(segment=>segment.toLowerCase()==="node_modules")||property(config,"tsconfig"))return {state:"boundary",reason:"unsupported-syntax"};
        const applicable=tsconfigRecords.filter(r=>path.posix.basename(r.resource.path)==="tsconfig.json" && (path.posix.dirname(r.resource.path)==="." || from.startsWith(path.posix.dirname(r.resource.path)+"/"))).sort((a,b)=>b.resource.path.length-a.resource.path.length);
        const record=applicable[0], compiler=property(record?.config.value,"compilerOptions");
        if (!record || record.config.value.kind !== "object" || property(record.config.value,"extends") || property(record.config.value,"references")) return {state:"boundary",reason:"missing-metadata"};
        const paths=property(compiler,"paths"), base=literal(property(compiler,"baseUrl"));
        if (paths?.kind === "object") {
          const keys=Object.keys(paths.properties).filter(k=>k===name || k.split("*").length===2 && name.startsWith(k.split("*")[0]) && name.endsWith(k.split("*")[1])).sort((a,b)=>a===name ? -1 : b===name ? 1 : b.split("*")[0].length-a.split("*")[0].length);
          if (keys.length) {
            const key=keys[0], values=strings(paths.properties[key]);
            if (!values || values.length!==1 || key.split("*").length>2 || values[0].split("*").length>2) return {state:"boundary",reason:"ambiguous-target"};
            const variable=key.includes("*") ? name.slice(key.split("*")[0].length,name.length-key.split("*")[1].length) : "";
            const target=path.posix.normalize(path.posix.join(path.posix.dirname(record.resource.path),base ?? ".",values[0].replace("*",variable)));
            if (!approved(target)) return {state:"boundary",reason:"policy-denied"};
            return resolve(from,"/"+path.posix.relative(root,target)+(query ? "?"+query : ""));
          }
        } else if (paths) return {state:"boundary",reason:"dynamic-expression"};
        if (base !== undefined) return {state:"boundary",reason:"unsupported-syntax"};
      }
    }
    if (path.isAbsolute(name) && matched) {
      const relative = path.relative(discovery.metadata.reader.root, name).split(path.sep).join("/");
      if (!approved(relative)) return { state: "boundary", reason: "policy-denied" };
      name = "/" + relative;
    }
    if (!name.startsWith(".") && !name.startsWith("/")) {
      if(name.includes(":"))return {state:"boundary",reason:"policy-denied"};
      const parts=name.split("/"),packageName=name.startsWith("@") ? parts.slice(0,2).join("/") : parts[0],subpath="."+name.slice(packageName.length);
      const metadata=discovery.metadata.all().filter(r=>path.posix.basename(r.resource.path)==="package.json"&&literal(property(r.config.value,"name"))===packageName);
      if(!metadata.length)return {state:"boundary",reason:"external-boundary"};
      if(metadata.length!==1)return {state:"boundary",reason:"ambiguous-target"};
      const record=metadata[0],exports=property(record.config.value,"exports");
      // Selected sibling package metadata does not prove a package-manager link.
      // Only the current package's Node/Vite self-reference is qualified here.
      if(path.posix.dirname(record.resource.path)!==project.path)return {state:"boundary",reason:"external-boundary"};
      let selected=exports;
      if(exports?.kind==="object"&&Object.keys(exports.properties).some(k=>k.startsWith("."))&&Object.keys(exports.properties).some(k=>!k.startsWith(".")))return {state:"boundary",reason:"unsupported-syntax"};
      if(exports?.kind==="object"&&Object.keys(exports.properties).some(k=>k.startsWith(".")))selected=exports.properties[subpath];
      else if(subpath!==".")return {state:"boundary",reason:"unsupported-syntax"};
      for(let depth=0;selected?.kind==="object"&&depth<32;depth++) {
        discovery.boundary.check();const allowed=new Set([...conditions,"import","default"]);
        if(Object.keys(selected.properties).some(k=>/^\d+$/.test(k)||k.startsWith(".")))return {state:"boundary",reason:"unsupported-syntax"};
        const key=Object.keys(selected.properties).find(k=>allowed.has(k));selected=key ? selected.properties[key] : undefined;
      }
      const value=literal(selected);
      if(!value||!value.startsWith("./")||value.includes("*")||value.includes("\\"))return {state:"boundary",reason:"unsupported-syntax"};
      const entry=path.posix.normalize(path.posix.join(path.posix.dirname(record.resource.path),value));
      if(!approved(entry))return {state:"boundary",reason:"policy-denied"};
      if(!discovery.inventory.some(f=>f.path===entry&&f.state==="selected"))return {state:"boundary",reason:"missing-metadata"};
      if(discovery.sourceInputs.get(entry)?.validUtf8===false)return {state:"boundary",reason:"unsupported-encoding"};
      const proof=metadataWitness(record,id);if(proof&&!variant.configWitnesses.some(w=>w.role!=="framework-rule"&&w.site.file===record.resource.path)) {
        if(variant.configWitnesses.length>=64)throw new AnalysisBoundaryError("resource-limit");variant.configWitnesses.push(proof);
      }
      return {state:"resolved",target:entry,query,category:"module"};
    }
    const target = path.posix.normalize(name.startsWith("/") ? matched && path.isAbsolute(matched.replacement) ? name.slice(1) : path.posix.join(root, name.slice(1)) : path.posix.join(path.posix.dirname(from), name));
    if (!approved(target)) return { state: "boundary", reason: "policy-denied" };
    const publicValue=property(config,"publicDir"),publicDir=literal(publicValue)??"public";
    if(!matched&&raw.startsWith("/")&&!(publicValue?.kind==="literal"&&publicValue.value===false)) {
      if(publicValue&&literal(publicValue)===undefined)return {state:"boundary",reason:"dynamic-expression"};
      const publicTarget=path.posix.normalize(path.posix.join(root,publicDir,raw.slice(1)));
      if(!approved(publicTarget))return {state:"boundary",reason:"policy-denied"};
      if(auxiliary.has(publicTarget))return query==="url" && readAuxiliary(publicTarget) ? {state:"resolved",target:publicTarget,query,category:"asset"} : {state:"boundary",reason:"unsupported-syntax"};
    }
    if (inventory.has(target)) return discovery.sourceInputs.get(target)?.validUtf8 === false ? {state:"boundary",reason:"unsupported-encoding"} : { state: "resolved", target, query, category: "module" };
    if (auxiliary.has(target)) return query.startsWith("worker") ? {state:"boundary",reason:"unsupported-syntax"} : readAuxiliary(target)?.purpose === "framework-input" ? { state: "resolved", target, query, category: "asset" } : { state: "boundary", reason: "policy-denied" };
    // Vite's documented extension preference, separate from TS paths.
    for (const extension of extensions) if (inventory.has(target + extension)) return discovery.sourceInputs.get(target+extension)?.validUtf8 === false ? {state:"boundary",reason:"unsupported-encoding"} : { state: "resolved", target: target + extension, query, category: "module" };
    for (const extension of extensions) if (inventory.has(target + "/index" + extension)) return discovery.sourceInputs.get(target+"/index"+extension)?.validUtf8 === false ? {state:"boundary",reason:"unsupported-encoding"} : { state: "resolved", target: target + "/index" + extension, query, category: "module" };
    return { state: "boundary", reason: "missing-metadata" };
  }
  function gap(site: Site, reason: GapReason) {
    const gapId = factId("gap", site, id, reason);
    if (!snapshot.analysis.gaps.some(g => g.id === gapId)) {frameworkFact(snapshot,site.file);snapshot.analysis.gaps.push({ id: gapId, occurrence: site, reason, variantId: id, capabilityId: capabilityId(cap) });}
    const assessment = snapshot.analysis.capabilities.find(c => c.id === capabilityId(cap))!;
    if (!assessment.gapIds.includes(gapId)) assessment.gapIds.push(gapId);
  }
  function bind(site: Site, target: string, kind: "entry-point" | "module-dependency" | "asset" | "worker", rule: string) {
    const bindingId = factId("binding:" + kind, site, id, target);
    if (!snapshot.analysis.bindings.some(b => b.id === bindingId)) {frameworkFact(snapshot,site.file);snapshot.analysis.bindings.push({ id: bindingId, kind, sourceId: site.file, targetId: target, variantId: id, occurrence: site, witnesses: [{ role: "reference", site, extractorVersion: "fs-03/1", variantId: id }, ...variant.configWitnesses, { role: "framework-rule", tupleId: tuple, ruleId: rule, extractor: "vite", extractorVersion: "fs-03/1", variantId: id }] });}
  }
  function glob(from: string, patterns: string[]) {
    const includes = patterns.filter(p => !p.startsWith("!")), excludes = patterns.filter(p => p.startsWith("!")).map(p => p.slice(1));
    if (patterns.length > 100) return {matches:[] as string[],reason:"resource-limit" as GapReason};
    if (!includes.length) return { matches: [] as string[], reason: "unsupported-syntax" as GapReason };
    const normalized = (p: string) => p.startsWith("/") ? path.posix.join(root, p.slice(1)) : p.startsWith("./") || p.startsWith("../") ? path.posix.normalize(path.posix.join(path.posix.dirname(from), p)) : "\0";
    const all = [...inventory, ...auxiliary].sort(), positive = expandInventoryGlobs(includes.map(normalized), all, discovery.boundary), negative = expandInventoryGlobs(excludes.map(normalized), all, discovery.boundary);
    const removed = new Set(negative.matches);
    return { matches: positive.matches.filter(m => !removed.has(m)), reason: positive.reasons[0] ?? negative.reasons[0] };
  }
  const frameworkSafe=!unsafeConfig && !aliasUnknown && !aliases.some(a=>["react","react-dom","react-router","react/jsx-runtime","react/jsx-dev-runtime"].some(name=>name===a.find || name.startsWith(a.find+"/") || a.find.startsWith(name+"/"))) && !property(config,"esbuild") && !property(config,"oxc") && !tsconfigRecords.some(r=>r.config.value.kind!=="object" || property(property(r.config.value,"compilerOptions"),"jsxFactory") || property(property(r.config.value,"compilerOptions"),"jsxImportSource"));
  function htmlEntryState(file:string):boolean|undefined {
    if (mode !== "browser-production") return true;
    const build=property(config,"build"),rollup=property(build,"rollupOptions"),rolldown=property(build,"rolldownOptions");
    if (build && build.kind !== "object" || rollup && rollup.kind !== "object" || rolldown && rolldown.kind !== "object"
      || property(build,"lib") || property(build,"ssr")) return undefined;
    const input=property(rolldown,"input")??property(rollup,"input");
    if(input){
      const values=literal(input)!==undefined ? [literal(input)!] : strings(input) ?? (input.kind==="object"&&Object.values(input.properties).every(v=>literal(v)!==undefined) ? Object.values(input.properties).map(v=>literal(v)!) : undefined);
      if(!values||values.length>100)return undefined;
      const paths=values.map(v=>path.isAbsolute(v) ? path.relative(discovery.metadata.reader.root,v).split(path.sep).join("/") : path.posix.normalize(path.posix.join(projectRoot,v)));
      if(paths.some(p=>!approved(p)||!auxiliary.has(p)||!p.endsWith(".html")))return undefined;
      return paths.includes(file);
    }
    return file === path.posix.join(root,"index.html");
  }
  return { variant, tuple, root, inventory, auxiliary, resolve, readAuxiliary, auxiliaryText, frameworkSafe, automaticJsx:plugin?.automatic??false, htmlEntryState, gap, bind, glob };
}
