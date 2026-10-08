import path from "node:path";
import type { GapReason } from "../../model/framework.ts";
import { GenerationBoundary, AnalysisBoundaryError } from "../../engine/boundary.ts";
import { directoryExclusion } from "../../repository/read-policy.ts";

export type MetroPlatform = "android" | "ios";
export type MetroResolution = { state: "resolved"; targets: string[]; category: "module" | "asset"; rule: string } | { state: "empty"; rule: string } | { state: "boundary"; reason: GapReason };
export type MetroPackage = { root: string; json: unknown };
export type MetroInventory = {
  /** Only paths already authorized by discovery may be provided. No filesystem lookup. */
  files: ReadonlySet<string>;
  packages: readonly MetroPackage[];
  /** Bare package links must be explicitly established by the caller's ownership policy. */
  packageLinks: ReadonlyMap<string, string>;
};
export type MetroSettings = {
  platform: MetroPlatform; sourceExts: readonly string[]; assetExts: ReadonlySet<string>;
  mainFields: readonly string[]; conditions: readonly string[]; exportsEnabled: boolean;
  preferNativePlatform: boolean; customResolver: boolean;
};
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const safe = (value: string) => !!value && value.length <= 16384 && !value.includes("\\") && !value.includes("\0") && !value.includes(":") && !value.startsWith("/") && !value.split("/").some((p,index,parts) => p === ".." || index < parts.length - 1 && directoryExclusion(p));
const boundary = (reason: GapReason): MetroResolution => ({ state: "boundary", reason });

/** Static Metro search kernel. Inputs are data, never config modules or resolver callbacks.
 * Unsupported export fallback and package-map shapes stay boundaries pending qualification.
 */
export function createMetroResolver(inventory: MetroInventory, settings: MetroSettings, budget = new GenerationBoundary()) {
  if (!["android", "ios"].includes(settings.platform)) throw new Error("Unsupported Metro platform");
  if (inventory.files.size > 20000 || inventory.packages.length > 20000 || settings.sourceExts.length > 100 || settings.mainFields.length > 100 || settings.conditions.length > 100) throw new AnalysisBoundaryError("resource-limit");
  if (settings.sourceExts.some(e => !/^[a-z0-9]+$/.test(e)) || settings.assetExts.size > 1000) throw new Error("Invalid Metro extensions");
  const packages = [...inventory.packages].sort((a, b) => b.root.length - a.root.length);
  const containing = (file: string) => packages.find(p => p.root === "." || file.startsWith(p.root + "/"));
  function redirect(file: string): string | false | undefined {
    budget.check();
    const pkg = containing(file);
    if (!pkg || !object(pkg.json)) return file;
    const relative = "./" + path.posix.relative(pkg.root, file);
    for (const key of [relative, relative + ".js", relative + ".json"]) for (const field of settings.mainFields) {
      const map = pkg.json[field];
      if (!object(map) || !Object.hasOwn(map, key)) continue;
      const replacement = map[key];
      if (replacement === false) return false;
      if (typeof replacement !== "string") return undefined;
      if (replacement.startsWith("/") || replacement.split("/").some(p => p === "..")) return undefined;
      const target = path.posix.normalize(path.posix.join(pkg.root, replacement));
      return safe(target) ? target : undefined;
    }
    return file;
  }
  function assets(file: string): MetroResolution {
    // Density selection records the whole family; no runtime device-density claim.
    const ext = path.posix.extname(file), stem = file.slice(0, -ext.length), targets: string[] = [];
    for (const candidate of inventory.files) {
      budget.check();
      if (!safe(candidate) || path.posix.extname(candidate) !== ext) continue;
      if (candidate === file || candidate.startsWith(stem + "@") && /^\d+(?:\.\d+)?x$/.test(candidate.slice(stem.length + 1, -ext.length))) targets.push(candidate);
    }
    return targets.length ? { state: "resolved", targets: targets.sort(), category: "asset", rule: "metro/asset-family" } : boundary("missing-metadata");
  }
  function file(target: string): MetroResolution {
    budget.check();
    if (!safe(target)) return boundary("policy-denied");
    if (settings.assetExts.has(path.posix.extname(target).slice(1))) return assets(target);
    if (inventory.files.has(target)) return { state: "resolved", targets: [target], category: "module", rule: "metro/exact-file" };
    for (const extension of settings.sourceExts) for (const suffix of ["." + settings.platform + "." + extension, ...(settings.preferNativePlatform ? [".native." + extension] : []), "." + extension]) {
      budget.check();
      const redirected = redirect(target + suffix);
      if (redirected === false) return { state: "empty", rule: "metro/package-redirect-disabled" };
      if (redirected === undefined) return boundary("dynamic-expression");
      if (inventory.files.has(redirected)) return { state: "resolved", targets: [redirected], category: "module", rule: "metro/source-extension-platform" };
    }
    return boundary("missing-metadata");
  }
  function exportTarget(value: unknown, isImport: boolean, depth = 0): string | null | undefined {
    budget.check();
    if (depth >= 32) throw new AnalysisBoundaryError("resource-limit");
    if (typeof value === "string" || value === null) return value;
    if (!object(value)) return undefined;
    const enabled = new Set(["default", isImport ? "import" : "require", ...settings.conditions]);
    for (const [key, child] of Object.entries(value)) if (enabled.has(key)) return exportTarget(child, isImport, depth + 1);
    return undefined;
  }
  function packagePath(pkg: MetroPackage, subpath: string, isImport: boolean, useExports=true): MetroResolution {
    if (!object(pkg.json)) return boundary("missing-metadata");
    const fallback=()=>{const result=packagePath(pkg,subpath,isImport,false);return result.state==="resolved"?{...result,rule:"metro/exports-file-fallback"}:result;};
    if (useExports && settings.exportsEnabled && pkg.json.exports !== undefined) {
      const rawExports = pkg.json.exports;
      const exports = Array.isArray(rawExports)?rawExports.every(v=>typeof v==="string")?rawExports.find(v=>v.startsWith("./")):rawExports[0]:rawExports;
      let selected: unknown = exports;
      let replacement: string | undefined;
      if (object(exports) && Object.keys(exports).some(k => k.startsWith("."))) {
        if (Object.keys(exports).some(k => !k.startsWith("."))) return fallback();
        selected = exports[subpath];
        if (selected === undefined) {
          const patterns = Object.keys(exports).filter(k => k.split("*").length === 2 && subpath.startsWith(k.split("*")[0]) && subpath.endsWith(k.split("*")[1]) && subpath.length >= k.length - 1).sort((a, b) => b.indexOf("*") - a.indexOf("*") || b.length - a.length);
          if (patterns.length) { const key = patterns[0]; replacement = subpath.slice(key.indexOf("*"), subpath.length - key.split("*")[1].length); selected = exports[key]; }
        }
      } else if (subpath !== ".") return fallback();
      if(Array.isArray(selected))selected=selected[0];
      const target = exportTarget(selected, isImport);
      if (!target || !target.startsWith("./")) return fallback();
      const value = replacement === undefined ? target : target.replaceAll("*", replacement);
      if (value.includes("*") || value.slice(2).split("/").some(p => !p || p === "." || p === "..")) return boundary("policy-denied");
      const absolute = path.posix.normalize(path.posix.join(pkg.root, value));
      if (!safe(absolute)) return boundary("policy-denied");
      if (settings.assetExts.has(path.posix.extname(absolute).slice(1))) return assets(absolute);
      return inventory.files.has(absolute) ? { state: "resolved", targets: [absolute], category: "module", rule: "metro/exports-exact-target" } : fallback();
    }
    if (subpath !== ".") return file(path.posix.join(pkg.root, subpath.slice(2)));
    let entry = "index";
    for (const field of settings.mainFields) if (typeof pkg.json[field] === "string" && pkg.json[field]) { entry = pkg.json[field]; break; }
    const variants=[entry,entry.startsWith("./")?entry.slice(2):"./"+entry].flatMap(v=>[v,v+".js",v+".json",v.replace(/\.(?:js|json)$/,"")]);
    for(const key of variants){const map=settings.mainFields.map(f=>object(pkg.json)?pkg.json[f]:null).find(m=>object(m)&&Object.hasOwn(m,key));if(object(map)&&typeof map[key]==="string"){entry=map[key];break;}}
    if (entry.split("/").some(p => p === "..") || entry.includes("\\") || entry.startsWith("/") || entry.includes(":")) return boundary("policy-denied");
    const main = path.posix.normalize(path.posix.join(pkg.root, entry));
    const resolved = file(main);
    return resolved.state !== "boundary" ? resolved : file(path.posix.join(main, "index"));
  }
  function resolve(from: string, specifier: string, isImport = true, active=new Set<string>()): MetroResolution {
    budget.check();
    if(active.has(specifier))return boundary("config-cycle");if(active.size>=64)throw new AnalysisBoundaryError("resource-limit");const next=new Set(active).add(specifier);
    if (settings.customResolver) return boundary("custom-resolver");
    if (!safe(from) || !inventory.files.has(from) || !specifier || specifier.length > 16384 || specifier.includes("\\") || specifier.includes("\0") || specifier.includes(":" ) || specifier.startsWith("/")) return boundary("policy-denied");
    if (specifier.startsWith("#")) {
      const pkg=containing(from),map=pkg&&object(pkg.json)?pkg.json.imports:undefined;
      if(!object(map))return boundary("unsupported-syntax");
      const patterns=Object.keys(map).filter(k=>k.split("*").length===2&&specifier.startsWith(k.split("*")[0])&&specifier.endsWith(k.split("*")[1])).sort((a,b)=>b.indexOf("*")-a.indexOf("*")||b.length-a.length),key=Object.hasOwn(map,specifier)?specifier:patterns[0];
      const target=key?exportTarget(map[key],isImport):undefined;
      if(!target||!target.startsWith("./"))return boundary("missing-metadata");
      if(target.slice(2).split("/").some(p=>p===".."||p==="."))return boundary("policy-denied");
      const replacement=key.includes("*")?specifier.slice(key.indexOf("*"),specifier.length-key.split("*")[1].length):"",selected=path.posix.normalize(path.posix.join(pkg!.root,target.replaceAll("*",replacement)));
      if(!safe(selected))return boundary("policy-denied");
      if(settings.assetExts.has(path.posix.extname(selected).slice(1)))return assets(selected);
      return inventory.files.has(selected)?{state:"resolved",targets:[selected],category:"module",rule:"metro/imports-exact-target"}:boundary("missing-metadata");
    }
    if (/^\.\.?(?:\/|$)/.test(specifier)) {
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(from), specifier));
      if (!safe(target)) return boundary("policy-denied");
      const redirected = redirect(target);
      if (redirected === false) return { state: "empty", rule: "metro/package-redirect-disabled" };
      if (redirected === undefined) return boundary("dynamic-expression");
      const direct = file(redirected);
      if (direct.state !== "boundary" || direct.reason !== "missing-metadata") return direct;
      const pkg = packages.find(p => p.root === redirected);
      return pkg ? packagePath(pkg, ".", isImport,false) : file(path.posix.join(redirected, "index"));
    }
    const origin=containing(from);
    if(origin&&object(origin.json))for(const field of settings.mainFields){const map=origin.json[field];if(!object(map)||!Object.hasOwn(map,specifier))continue;const target=map[specifier];if(target===false)return{state:"empty",rule:"metro/package-redirect-disabled"};if(typeof target!=="string")return boundary("dynamic-expression");return resolve(from,target,isImport,next);}
    const name = specifier.startsWith("@") ? specifier.split("/").slice(0, 2).join("/") : specifier.split("/")[0];
    const root = inventory.packageLinks.get(name);
    if (!root) return boundary("external-boundary");
    const matches = packages.filter(p => p.root === root);
    return matches.length === 1 ? packagePath(matches[0], "." + specifier.slice(name.length), isImport) : boundary(matches.length ? "ambiguous-target" : "missing-metadata");
  }
  return {resolve:(from:string,specifier:string,isImport=true)=>resolve(from,specifier,isImport)};
}
