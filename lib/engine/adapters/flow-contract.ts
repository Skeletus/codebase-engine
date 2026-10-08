import { validateBehavior } from "../../model/validate.ts";
import { createHash } from "node:crypto";
import { decodeSource, normalizeRange } from "../../model/positions.ts";
import type { Site } from "../../model/behavior.ts";
import type { FlowSyntax } from "./flow-syntax.ts";

/** Parent-side neutral protocol validation. Recheck all positions, owners,
 * targets and byte hashes; unexpected keys (including ASTs) are rejected.
 */
export function validateFlowSyntax(value: unknown, file: string, bytes: Uint8Array): FlowSyntax {
  const text = decodeSource(bytes), hash = createHash("sha256").update(bytes).digest("hex");
  const object = (value: unknown, keys: readonly string[]) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("invalid-parser-output");
    const record = value as Record<string, unknown>;
    if (Object.keys(record).length !== keys.length || keys.some(k => !Object.hasOwn(record, k))) throw Error("invalid-parser-output");
    return record;
  };
  const array = (value: unknown): unknown[] => { if (!Array.isArray(value) || value.length > 20000) throw Error("invalid-parser-output"); return value; };
  const string = (value: unknown): string => { if (typeof value !== "string" || !value || value.length > 4096 || value.includes("\0")) throw Error("invalid-parser-output"); return value; };
  const site = (value: unknown): Site => {
    const s = object(value, ["file", "start", "end", "line", "endLine", "fileHash", "extractor", "evidenceKind"]);
    if (s.file !== file || s.fileHash !== hash || s.extractor !== "flow/syntax/fs-07/1" || s.evidenceKind !== "verified" || typeof s.start !== "number" || typeof s.end !== "number") throw Error("invalid-parser-output");
    const mapped = normalizeRange(text, s.start, s.end, "utf16"); if (mapped.line !== s.line || mapped.endLine !== s.endLine) throw Error("invalid-parser-output");
    return s as Site;
  };
  const r = object(value, ["behavior", "imports", "exports", "importedCalls", "visited"]);
  const raw = object(r.behavior, ["declarations", "relations", "gaps", "handlers"]);
  if (array(raw.handlers).length) throw Error("invalid-parser-output");
  for (const entries of [raw.declarations, raw.relations, raw.gaps]) for (const entry of array(entries)) { if (!entry || typeof entry !== "object" || !("site" in entry)) throw Error("invalid-parser-output"); site(entry.site); }
  const lines = Math.max(1, text.split("\n").length - (text.endsWith("\n") ? 1 : 0));
  const behavior = validateBehavior(r.behavior, [{path: file, hash, bytes: bytes.length, lines}], []);
  const declarations = new Map(behavior.declarations.map(d => [d.id, d]));
  const imports = array(r.imports).map(value => { const i = object(value, ["module", "name", "alias", "typeOnly", "site"]); if (typeof i.typeOnly !== "boolean") throw Error("invalid-parser-output"); return {module: string(i.module), name: string(i.name), alias: string(i.alias), typeOnly: i.typeOnly, site: site(i.site)}; });
  const exports = array(r.exports).map(value => { const e = object(value, ["name", "id","site"]), id = string(e.id); if (!declarations.has(id)) throw Error("invalid-parser-output"); return {name: string(e.name), id,site:site(e.site)}; });
  const importedCalls = array(r.importedCalls).map(value => {
    const c = object(value, ["module", "name", "bindingStart", "source", "site"]), source = c.source === null ? null : string(c.source), location = site(c.site);
    const owner = source === null ? undefined : declarations.get(source);
    if (source !== null && (!owner?.callable || owner.site.start > location.start || owner.site.end < location.end) || typeof c.bindingStart !== "number" || !imports.some(i => i.site.start === c.bindingStart && i.module === c.module && i.name === c.name && !i.typeOnly)) throw Error("invalid-parser-output");
    return {module: string(c.module), name: string(c.name), bindingStart: c.bindingStart, source, site: location};
  });
  if (typeof r.visited !== "number" || !Number.isSafeInteger(r.visited) || r.visited < 0 || r.visited > 100000 || behavior.declarations.length + behavior.relations.length + behavior.gaps.length + imports.length + exports.length + importedCalls.length > 20000) throw Error("invalid-parser-output");
  return {behavior, imports, exports, importedCalls, visited: r.visited};
}
