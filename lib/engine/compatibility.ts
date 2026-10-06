import { capabilityId, factId, profileId, variantId, type AnalysisContracts, type Resource, type Witness } from "../model/framework.ts";
import type { LegacySnapshot } from "./types.ts";

/** Describe existing observations; never certify upcoming framework capabilities. */
export function legacyObservations(snapshot: LegacySnapshot, resources: Resource[]): AnalysisContracts {
  const profiles = snapshot.projects.map(p => ({ id: profileId(p.path, "legacy-typescript", String(snapshot.adapter.version)), projectId: p.path, resolverId: "legacy-typescript", semanticsVersion: String(snapshot.adapter.version), language: "typescript-javascript" }));
  const variants = profiles.map(p => ({ id: variantId(p.id, "legacy-static", null, []), projectId: p.projectId, profileId: p.id, resolverId: p.resolverId, environment: "legacy-static", platform: null, conditions: [], configWitnesses: [] }));
  const analysis: AnalysisContracts = { status: "legacy-observations", projects: snapshot.projects.map(p => ({ projectId: p.path, languages: ["typescript-javascript"], profileIds: profiles.filter(x => x.projectId === p.path).map(x => x.id), extractors: [p.extractor] })), resources, profiles, variants, qualifications: [], capabilities: [], registrations: [], bindings: [], candidates: [], gaps: [], assumptions: [] };
  for (const v of variants) { const c = { tupleId: "legacy-unqualified", capabilityId: "existing-ts-js-observations", profileId: v.profileId, variantId: v.id }; analysis.capabilities.push({ ...c, id: capabilityId(c), state: "partial", extractorVersion: String(snapshot.adapter.version), qualificationRecord: null, gapIds: [] }); }
  for (const [index, route] of snapshot.routes.entries()) {
    const handler = snapshot.behavior.handlers.find(h => h.route === index)!;
    const project = [...snapshot.projects].filter(p => p.path === "." || route.file.startsWith(p.path + "/")).sort((a, b) => b.path.length - a.path.length)[0];
    const variant = variants.find(v => v.projectId === project.path)!;
    const capability = analysis.capabilities.find(c => c.variantId === variant.id)!;
    const gapIds: string[] = [];
    const gap = (reason: "unsupported-matcher" | "unknown-method" | "ambiguous-target") => { const id = factId("gap", handler.site, variant.id, reason); if (!analysis.gaps.some(g => g.id === id)) analysis.gaps.push({ id, reason, occurrence: handler.site, variantId: variant.id, capabilityId: capability.id }); if (!capability.gapIds.includes(id)) capability.gapIds.push(id); gapIds.push(id); return id; };
    const matcher = { state: "unsupported" as const, gapId: gap("unsupported-matcher") };
    const methodState = route.method === "ALL" ? { state: "unknown" as const, values: [] as [], } : { state: "known" as const, values: [route.method] };
    if (route.method === "ALL") gap("unknown-method");
    if (!handler.target) gap("ambiguous-target");
    const witnesses: Witness[] = [{ site: handler.site, role: "registration", extractorVersion: String(snapshot.adapter.version), variantId: variant.id }];
    if (handler.target) witnesses.push({ site: snapshot.behavior.declarations.find(d => d.id === handler.target)!.site, role: "declaration", extractorVersion: String(snapshot.adapter.version), variantId: variant.id });
    analysis.registrations.push({ id: factId("registration:http", handler.site, variant.id, JSON.stringify([route.pattern, route.method])), kind: "http", handlerId: handler.target, variantId: variant.id, occurrence: handler.site, rawPattern: route.pattern, methodState, matcher, precedence: null, conditions: [], prefixWitnesses: [], witnesses, legacyRouteIndex: index, gapIds });
  }
  return analysis;
}
