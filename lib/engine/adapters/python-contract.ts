import { validateBehavior } from "../../model/validate.ts";
import type { Site } from "../../model/behavior.ts";
import type { PythonSyntax } from "./python-syntax.ts";
import { pythonSource } from "./python-source.ts";

/** Parent-side validation rejects syntax-tree leakage and rechecks every
 * worker position against the exact protected original bytes. */
export function validatePythonSyntax(value: unknown, file: string, bytes: Uint8Array): PythonSyntax {
  const input = pythonSource(bytes);
  const object = (value: unknown, keys: readonly string[]) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid-parser-output");
    const record = value as Record<string, unknown>;
    if (Object.keys(record).length !== keys.length || keys.some(k => !(k in record))) throw new Error("invalid-parser-output");
    return record;
  };
  const array = (value: unknown): unknown[] => { if (!Array.isArray(value) || value.length > 20000) throw new Error("invalid-parser-output"); return value; };
  const string = (value: unknown): string => { if (typeof value !== "string" || !value || value.length > 4096 || value.includes("\0")) throw new Error("invalid-parser-output"); return value; };
  const site = (value: unknown): Site => {
    const s = object(value, ["file", "start", "end", "line", "endLine", "fileHash", "extractor", "evidenceKind"]);
    if (s.file !== file || s.fileHash !== input.hash || s.extractor !== "python/syntax/fs-05/1" || s.evidenceKind !== "verified" || typeof s.start !== "number" || typeof s.end !== "number") throw new Error("invalid-parser-output");
    const mapped = input.range(s.start, s.end); if (mapped.line !== s.line || mapped.endLine !== s.endLine) throw new Error("invalid-parser-output");
    return s as Site;
  };
  const r = object(value, ["behavior", "imports", "exports", "importedCalls", "decorated", "inheritance", "all", "visited"]);
  const lines = Math.max(1, input.text.split("\n").length - (input.text.endsWith("\n") ? 1 : 0));
  const rawBehavior = object(r.behavior, ["declarations", "relations", "gaps", "handlers"]);
  for (const values of [rawBehavior.declarations, rawBehavior.relations, rawBehavior.gaps]) for (const entry of array(values)) { if (!entry || typeof entry !== "object" || !("site" in entry)) throw new Error("invalid-parser-output"); site(entry.site); }
  const behavior = validateBehavior(r.behavior, [{ path: file, hash: input.hash, bytes: bytes.length, lines }], []);
  const declarations = new Map(behavior.declarations.map(d => [d.id, d]));
  const imports = array(r.imports).map(value => { const i = object(value, ["module", "name", "alias", "site", "star", "topLevel", "reexportable"]); if (typeof i.star !== "boolean" || typeof i.topLevel !== "boolean" || typeof i.reexportable !== "boolean" || typeof i.module !== "string" || i.module.length > 4096 || /[\0\\/:]/.test(i.module)) throw new Error("invalid-parser-output"); return { module: i.module, name: i.name === null ? null : string(i.name), alias: string(i.alias), site: site(i.site), star: i.star, topLevel: i.topLevel, reexportable: i.reexportable }; });
  const exports = array(r.exports).map(value => { const e = object(value, ["name", "id"]), name = string(e.name), id = string(e.id); if (!declarations.has(id)) throw new Error("invalid-parser-output"); return { name, id }; });
  const importedCalls = array(r.importedCalls).map(value => {
    const c = object(value, ["alias", "name", "bindingStart", "source", "site"]), source = c.source === null ? null : string(c.source), location = site(c.site), owner = source === null ? undefined : declarations.get(source);
    if (source !== null && (!owner?.callable || owner.site.start > location.start || owner.site.end < location.end)) throw new Error("invalid-parser-output");
    if (typeof c.bindingStart !== "number" || !imports.some(i => i.site.start === c.bindingStart && i.alias === c.alias && i.name === c.name)) throw new Error("invalid-parser-output");
    return { alias: string(c.alias), name: c.name === null ? null : string(c.name), bindingStart: c.bindingStart, source, site: location };
  });
  const decorated = array(r.decorated).map(value => { const d = object(value, ["id", "site"]), id = string(d.id); if (!declarations.has(id)) throw new Error("invalid-parser-output"); return { id, site: site(d.site) }; });
  const inheritance = array(r.inheritance).map(value => { const c = object(value, ["classId", "baseIds", "mro", "site"]), classId = string(c.classId), baseIds = array(c.baseIds).map(string), mro = c.mro === null ? null : array(c.mro).map(string); if (declarations.get(classId)?.kind !== "class" || baseIds.some(id => declarations.get(id)?.kind !== "class") || mro && (mro.length > 64 || mro[0] !== classId || new Set(mro).size !== mro.length || mro.some(id => declarations.get(id)?.kind !== "class"))) throw new Error("invalid-parser-output"); return { classId, baseIds, mro, site: site(c.site) }; });
  if (typeof r.visited !== "number" || !Number.isSafeInteger(r.visited) || r.visited < 0 || r.visited > 100000) throw new Error("invalid-parser-output");
  const all = r.all === null ? null : array(r.all).map(value => { const e = object(value, ["name", "site"]); return { name: string(e.name), site: site(e.site) }; }); if (all && all.length > 200) throw new Error("invalid-parser-output");
  if (behavior.declarations.length + behavior.relations.length + behavior.gaps.length + imports.length + importedCalls.length + decorated.length + inheritance.length + (all?.length ?? 0) > 20000) throw new Error("invalid-parser-output");
  return { behavior, imports, exports, importedCalls, decorated, inheritance, all, visited: r.visited };
}
