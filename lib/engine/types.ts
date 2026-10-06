export const SNAPSHOT_VERSION = 3;

export type CodeFile = {
  id: string;
  path: string;
  module: string;
  hash: string;
  lines: number;
  bytes: number;
  fanIn: number;
  fanOut: number;
  role: string | null;
  reachedBy: string | null;
  exports: string[];
};

export type Evidence = {
  file: string;
  line: number;
  fileHash: string;
  extractor: string;
  evidenceKind: "verified";
  /** Deduplication retained only the first occurrence, not all source sites. */
  occurrence: "first";
  description: string;
};

export type Relationship = {
  id: string;
  source: string;
  target: string;
  relation: "imports";
  typeOnly: boolean;
  /** Adapter-specific syntax preserved as provenance, not a generic algorithm switch. */
  syntax: string;
  evidence: Evidence;
};

export type RouteDeclaration = { file: string; method: string; pattern: string; evidence: Evidence };
export type Diagnostic = { path: string; category: string; reason: string; detail: string; line?: number };
export type OutcomeCounts = { seen: number; internal: number; external: number; excluded: number; unresolved: number };

export type CodeSnapshot = {
  version: typeof SNAPSHOT_VERSION;
  origin: { kind: "local"; root: string };
  adapter: { id: string; version: number };
  projects: { path: string; extractor: string }[];
  files: CodeFile[];
  relationships: Relationship[];
  routes: RouteDeclaration[];
  coverage: {
    files: { found: number; parsed: number; skipped: number };
    relationships: OutcomeCounts;
    bySyntax: Record<string, OutcomeCounts>;
    external: Record<string, number>;
    excluded: Record<string, number>;
    unresolved: Record<string, number>;
  };
  diagnostics: Diagnostic[];
  behavior: import("../model/behavior.ts").Behavior;
  /** Shared facts are deliberately outside file/import adjacency. */
  analysis: import("../model/framework.ts").AnalysisContracts;
};

export type LegacySnapshot = Omit<CodeSnapshot, "version" | "analysis"> & { version: 2 };

export type LanguageAdapter = { id: string; analyze: (directory: string, onProgress?: (stage: "parse") => void) => CodeSnapshot };
export type StructuralQuery = { file: string; direction: "dependencies" | "dependents"; depth?: number };
export type StructuralResult = { steps: string[][]; beyond: number };
