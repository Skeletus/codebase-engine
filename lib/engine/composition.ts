import { validateSnapshot } from "./contract.ts";
import type { CodeSnapshot } from "./types.ts";
import type { Selection } from "../parser/index.ts";
import { createResolutionProfile, type ProfileName } from "./profiles.ts";
import { capabilityId, factId } from "../model/framework.ts";
import { normalizeRange } from "../model/positions.ts";

/** Coordinator-owned composition after language parsing; never mutate import truth. */
export function coordinateSnapshot(snapshot: CodeSnapshot, selection: Selection, explicit: readonly { project: string; profile: ProfileName; environment?: "development" | "production" }[] = []): CodeSnapshot {
  const discovery = selection.walk.discovery, analysis = snapshot.analysis;
  discovery.boundary.check();
  const present = new Set(analysis.resources.map(r => r.path));
  for (const record of discovery.metadata.all()) if (!present.has(record.resource.path)) { analysis.resources.push(record.resource); present.add(record.resource.path); }
  for (const project of discovery.projects) {
    if (!snapshot.projects.some(p => p.path === project.path)) snapshot.projects.push({ path: project.path, extractor: "discovery-only" });
    let shared = analysis.projects.find(p => p.projectId === project.path);
    if (!shared) { shared = { projectId: project.path, languages: [], profileIds: [], extractors: [] }; analysis.projects.push(shared); }
    shared.languages = [...new Set([...shared.languages, ...project.languages])].sort();
    shared.extractors = [...new Set([...shared.extractors, ...project.composition.frameworks.map(f => `detected/${f}`), ...project.composition.extensions.map(e => `detected/${e}`)])].sort();
    const names = new Set<ProfileName>();
    if (project.languages.includes("typescript-javascript")) { names.add("node-esm"); names.add("node-commonjs"); }
    if (project.composition.frameworks.includes("vite")) names.add("vite-browser");
    if (project.composition.frameworks.includes("react-native") || project.composition.extensions.includes("expo")) names.add("metro-android");
    if (project.languages.includes("python") || project.declarations.some(d => d.endsWith("pyproject.toml"))) names.add("python-package");
    const selected = [...names].map(profile => ({ profile, environment: undefined as "development" | "production" | undefined }));
    for (const e of explicit.filter(e => e.project === project.path)) if (!selected.some(s => s.profile === e.profile && s.environment === e.environment)) selected.push({ profile: e.profile, environment: e.environment });
    for (const s of selected) {
      const context = createResolutionProfile(discovery, project, s.profile, s.environment);
      if (!analysis.profiles.some(p => p.id === context.profile.id)) { analysis.profiles.push(context.profile); shared.profileIds.push(context.profile.id); }
      if (analysis.variants.some(v => v.id === context.variant.id)) continue;
      analysis.variants.push(context.variant);
      const c = { tupleId: "discovery-unqualified", capabilityId: "resolution-infrastructure/" + s.profile, profileId: context.profile.id, variantId: context.variant.id };
      const cap = { ...c, id: capabilityId(c), state: "partial" as const, extractorVersion: "fs-02/1", qualificationRecord: null, gapIds: [] as string[] }; analysis.capabilities.push(cap);
      const dependencyByFramework: Readonly<Record<string, string>> = { "Next.js": "next", "React": "react", "Express": "express", "NestJS": "@nestjs/core", "Docusaurus": "@docusaurus/core", "vite": "vite", "react-native": "react-native", "django": "django", "expo": "expo" };
      for (const detected of [...project.composition.frameworks, ...project.composition.extensions]) {
        if ((s.profile === "python-package") !== (detected === "django")) continue;
        const dependency = dependencyByFramework[detected], version = project.versions[dependency];
        const detection = { tupleId: version && version.length <= 256 ? `declared/${dependency}@${version}` : `missing-version/${detected}`, capabilityId: `detected-only/${detected}`, profileId: context.profile.id, variantId: context.variant.id };
        analysis.capabilities.push({ ...detection, id: capabilityId(detection), state: version && version.length <= 256 ? "partial" : "blocked", extractorVersion: "fs-02/1", qualificationRecord: null, gapIds: [] });
      }
      for (const record of discovery.metadata.all()) {
        if (!context.variant.configWitnesses.some(w => w.role !== "framework-rule" && w.site.file === record.resource.path)) continue;
        const dependencyIssues = discovery.issues.filter(i => i.path === record.resource.path || record.dependencies.includes(i.path));
        const gaps = [...record.config.gaps, ...dependencyIssues.map(i => ({ reason: i.reason, start: 0, end: record.text.length }))];
        for (const gap of gaps) {
          const end = Math.min(gap.end, record.text.length - (/\r\n$/.test(record.text) ? 2 : /[\r\n]$/.test(record.text) ? 1 : 0)), start = Math.min(gap.start, Math.max(0, end - 1));
          if (end <= start) continue;
          const site = { file: record.resource.path, ...normalizeRange(record.text, start, end, "utf16"), fileHash: record.resource.hash, extractor: "discovery/config", evidenceKind: "verified" as const };
          const id = factId("gap", site, context.variant.id, gap.reason);
          if (!analysis.gaps.some(g => g.id === id)) analysis.gaps.push({ id, reason: gap.reason, occurrence: site, variantId: context.variant.id, capabilityId: cap.id });
          if (!cap.gapIds.includes(id)) cap.gapIds.push(id);
        }
      }
    }
  }
  const unsupported = discovery.inventory.filter(f => f.language !== "typescript-javascript");
  snapshot.coverage.files.found += unsupported.length; snapshot.coverage.files.skipped += unsupported.length;
  snapshot.diagnostics.push(...unsupported.map(f => ({ path: f.path, category: "skipped-file", reason: f.state === "excluded" ? "symlink" : "language-not-implemented", detail: `${f.language}: discovered once; analysis not implemented` })), ...discovery.issues.map(i => ({ ...i, category: "discovery" })), ...discovery.metadata.all().flatMap(r => r.config.gaps.map(g => ({ path: r.resource.path, category: "config-discovery", reason: g.reason, detail: g.detail }))));
  for (const request of explicit) if (!discovery.projects.some(p => p.path === request.project)) throw new Error("Unknown explicit variant project");
  analysis.resources.sort((a, b) => a.path.localeCompare(b.path)); snapshot.projects.sort((a, b) => a.path.localeCompare(b.path)); analysis.projects.sort((a, b) => a.projectId.localeCompare(b.projectId));
  return validateSnapshot(snapshot);
}
