/** Half-open UTF-16 source offsets; the hash binds them to one local snapshot. */
export type Site = { file: string; start: number; end: number; line: number; endLine: number; fileHash: string; extractor: string; evidenceKind: "verified" };
export type Declaration = { id: string; name: string; kind: "function" | "method" | "class" | "value" | "parameter"; callable: boolean; site: Site };
export type SymbolRelation = { id: string; source: string | null; target: string; relation: "references" | "calls"; conditional: boolean; site: Site };
export type CallGap = { source: string | null; reason: string; site: Site };
export type HandlerBinding = { route: number; target: string | null; reason: string | null; site: Site };
export type Behavior = { declarations: Declaration[]; relations: SymbolRelation[]; gaps: CallGap[]; handlers: HandlerBinding[] };
