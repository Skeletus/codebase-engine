import type { Site } from "./behavior.ts";

export const GAP_REASONS = ["dynamic-expression", "ambiguous-target", "custom-resolver", "unknown-origin", "unknown-method", "unsupported-syntax", "unsupported-matcher", "unsupported-encoding", "missing-metadata", "policy-denied", "generated-code-unavailable", "variant-not-selected", "external-boundary", "resource-limit", "parser-unavailable", "parse-error", "candidate-overflow", "config-cycle", "rewrite-cycle", "stale-evidence"] as const;
export type GapReason = typeof GAP_REASONS[number];
export type Resource = { path: string; hash: string; bytes: number; utf16Length: number; lines: number; encoding: "utf8" | "legacy-decoded" | "binary"; purpose: "source" | "metadata" | "framework-input" };
export type Witness = { site: Site; extractorVersion: string; role: "declaration" | "registration" | "reference" | "configuration"; variantId: string } | { role: "framework-rule"; tupleId: string; ruleId: string; extractor: string; extractorVersion: string; variantId: string };
export type Profile = { id: string; projectId: string; resolverId: string; semanticsVersion: string; language: string };
export type Variant = { id: string; projectId: string; profileId: string; resolverId: string; environment: string; platform: string | null; conditions: string[]; configWitnesses: Witness[] };
export type QualificationRecord = { id: string; tupleId: string; capabilityId: string; profileId: string; variantId: string; extractorVersion: string; status: "complete"; fixtureIds: string[]; outputHashes: string[]; gates: { positive: true; negative: true; windows: true } };
export type CapabilityAssessment = { id: string; tupleId: string; capabilityId: string; profileId: string; variantId: string; state: "qualified" | "partial" | "unsupported" | "blocked"; extractorVersion: string; qualificationRecord: string | null; gapIds: string[] };
export type MethodState = { state: "known"; values: string[] } | { state: "unknown" | "all"; values: [] } | { state: "dispatch-dependent"; values: []; gapId: string };
export type Matcher = { state: "supported"; segments: ({ kind: "literal"; value: string } | { kind: "parameter"; name: string; converter: string } | { kind: "catchAll"; name: string; optional: boolean })[]; trailingSlash: "required" | "forbidden" | "optional"; caseSensitive: boolean; decodingPolicy: "raw" | "percent-decode-segments" } | { state: "unsupported"; gapId: string };
export const BINDING_KINDS = ["component-reference", "event-handler", "lifecycle", "context", "navigation", "native-bridge", "registration", "entry-point", "module-dependency", "asset", "worker", "hook", "wrapper", "server-action", "module-boundary", "operation", "module-export"] as const;
export type FrameworkBinding = { id: string; kind: typeof BINDING_KINDS[number]; sourceId: string; targetId: string; variantId: string; occurrence: Site; witnesses: Witness[] };
export type Registration = { id: string; kind: "http" | "page" | "navigation"; handlerId: string | null; variantId: string; occurrence: Site; rawPattern: string; methodState: MethodState | null; matcher: Matcher; precedence: number | null; conditions: string[]; prefixWitnesses: Witness[]; witnesses: Witness[]; legacyRouteIndex: number | null; gapIds: string[] };
export type Candidate = { id: string; relationKind: FrameworkBinding["kind"] | "request-endpoint"; sourceId: string; targetIds: string[]; reasons: GapReason[]; truncated: boolean; variantId: string; occurrence: Site; witnesses: Witness[] };
export type Gap = { id: string; reason: GapReason; occurrence: Site; variantId: string; capabilityId: string | null };
export type Assumption = { id: string; revision: number; variantId: string; service: string; origin: string; provenance: "user" };
export type DevelopmentProxy = { id: string; variantId: string; scope: "development"; prefix: string; targetOrigin: string; targetBasePath: string; rewrite: { state: "identity" } | { state: "prefix"; from: string; to: string } | { state: "unknown"; gapId: string }; occurrence: Site; witnesses: Witness[] };
export type AnalysisContracts = { status: "legacy-observations" | "assessed"; projects: { projectId: string; languages: string[]; profileIds: string[]; extractors: string[] }[]; resources: Resource[]; profiles: Profile[]; variants: Variant[]; qualifications: QualificationRecord[]; capabilities: CapabilityAssessment[]; registrations: Registration[]; bindings: FrameworkBinding[]; candidates: Candidate[]; gaps: Gap[]; assumptions: Assumption[]; developmentProxies?: DevelopmentProxy[] };

/** Source-scoped identities exclude content hashes and timestamps. */
export function factId(kind: string, site: Pick<Site, "file" | "start" | "end">, variantId: string, target = ""): string { return JSON.stringify([kind, site.file, site.start, site.end, variantId, target]); }
/** Source-backed mount chains distinguish repeated instantiations of one leaf.
 * The legacy identity remains unchanged when no registration prefix exists. */
export function contextualRegistrationId(kind: string, site: Site, variant: string, pattern: string, prefixes: readonly Witness[]): string {
  const chain = prefixes.filter((w): w is Extract<Witness, {site: Site}> => w.role === "registration").map(w => [w.site.file, w.site.start, w.site.end]);
  return factId("registration:" + kind, site, variant, chain.length ? JSON.stringify([pattern, chain]) : pattern);
}
/** Distinguish bindings emitted by repeated source-backed registrations. */
export function contextualBindingId(kind: FrameworkBinding["kind"], site: Site, variant: string, source: string, target: string): string { return factId("binding:" + kind, site, variant, JSON.stringify([source, target])); }
export function profileId(projectId: string, resolverId: string, semanticsVersion: string): string { return JSON.stringify(["profile", projectId, resolverId, semanticsVersion]); }
export function variantId(profile: string, environment: string, platform: string | null, conditions: string[]): string { return JSON.stringify(["variant", profile, environment, platform, conditions]); }
export function capabilityId(c: Pick<CapabilityAssessment, "tupleId" | "capabilityId" | "profileId" | "variantId">): string { return JSON.stringify(["capability", c.tupleId, c.capabilityId, c.profileId, c.variantId]); }
