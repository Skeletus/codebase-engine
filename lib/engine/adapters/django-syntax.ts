import type { Node, Parser } from "web-tree-sitter";
import type { Site } from "../../model/behavior.ts";
import { pythonSource } from "./python-source.ts";

/** Private, bounded source observations; no syntax tree enters IPC or snapshots. */
export type DjangoInput = { kind: "assignment" | "call" | "class" | "decorator" | "import" | "function"; name: string; value: string; arguments: { name: string | null; text: string; start: number; end: number }[]; ownerStart: number | null; conditional: boolean; site: Site };
export type DjangoSyntax = { inputs: DjangoInput[]; malformed: boolean; visited: number };

export function extractDjango(parser: Parser, file: string, bytes: Uint8Array): DjangoSyntax {
  const source = pythonSource(bytes), deadline = performance.now() + 2000;
  const tree = parser.parse(source.parserText, null, { progressCallback: () => performance.now() >= deadline });
  if (!tree) { parser.reset(); throw Error("resource-limit"); }
  const result: DjangoSyntax = { inputs: [], malformed: tree.rootNode.hasError, visited: 0 };
  const text = (node: Node | null) => node && node.text.length <= 4096 ? node.text : "";
  const location = (node: Node): Site => {
    const end = node.endIndex === source.text.length ? node.endIndex - (source.text.endsWith("\r\n") ? 2 : /[\r\n]$/.test(source.text) ? 1 : 0) : node.endIndex;
    const range = source.range(node.startIndex, end);
    return { file, start: range.start, end: range.end, line: range.line, endLine: range.endLine, fileHash: source.hash, extractor: "django/syntax/fs-06/1", evidenceKind: "verified" };
  };
  try {
    const pending: { node: Node; owner: number | null; conditional: boolean }[] = [{ node: tree.rootNode, owner: null, conditional: false }];
    while (pending.length) {
      if (++result.visited > 100000 || performance.now() >= deadline) throw Error("resource-limit");
      const { node, owner, conditional } = pending.pop()!;
      const isOwner = ["class_definition", "function_definition"].includes(node.type);
      const controlled = conditional || ["if_statement", "for_statement", "while_statement", "try_statement", "with_statement", "match_statement", "lambda", "list_comprehension", "dictionary_comprehension", "generator_expression"].includes(node.type);
      if (!result.malformed && ["import_statement", "import_from_statement"].includes(node.type)) {
        const from = node.type === "import_from_statement", moduleNode = node.childForFieldName("module_name");
        for (const child of node.namedChildren) if (child && child.id !== moduleNode?.id) {
          const name = child.type === "aliased_import" ? child.childForFieldName("name") : child;
          if (!name) continue;
          const alias = child.childForFieldName("alias");
          result.inputs.push({ kind: "import", name: text(alias) || (from ? text(name) : text(name).split(".")[0]), value: from ? text(moduleNode) + (text(moduleNode).endsWith(".") ? "" : ".") + text(name) : text(name), arguments: [], ownerStart: owner, conditional: controlled || child.type === "wildcard_import", site: location(child) });
          if (result.inputs.length > 20000) throw Error("resource-limit");
        }
      }
      if (!result.malformed && ["assignment", "augmented_assignment", "call", "class_definition", "function_definition", "decorator"].includes(node.type)) {
        const kind = node.type === "function_definition" ? "function" : node.type === "class_definition" ? "class" : node.type === "call" ? "call" : node.type === "decorator" ? "decorator" : "assignment";
        const right = kind === "assignment" ? node.childForFieldName("right") : null;
        const list = right && ["list", "tuple"].includes(right.type) ? right : node.childForFieldName(kind === "class" ? "superclasses" : "arguments");
        const args = (list?.namedChildren ?? []).filter((n): n is Node => n !== null && n.type !== "comment").map(n => ({ name: n.type === "keyword_argument" ? text(n.childForFieldName("name")) : null, text: text(n.type === "keyword_argument" ? n.childForFieldName("value") : n), start: (n.type === "keyword_argument" ? n.childForFieldName("value") : n)?.startIndex ?? n.startIndex, end: (n.type === "keyword_argument" ? n.childForFieldName("value") : n)?.endIndex ?? n.endIndex }));
        if (args.length > 200 || result.inputs.length >= 20000) throw Error("resource-limit");
        const definition = kind === "decorator" ? node.parent?.namedChildren.find(n => n && ["function_definition", "class_definition"].includes(n.type)) : null;
        result.inputs.push({ kind, name: text(node.childForFieldName(kind === "assignment" ? "left" : kind === "class" || kind === "function" ? "name" : "function")) || (kind === "decorator" ? node.text.slice(1, 4097) : ""), value: kind === "assignment" ? text(node.childForFieldName("right")) : "", arguments: args, ownerStart: definition?.startIndex ?? owner, conditional: controlled || node.type === "augmented_assignment", site: location(node) });
      }
      for (const child of [...node.namedChildren].reverse()) if (child) pending.push({ node: child, owner: isOwner && child.type === "block" ? node.startIndex : owner, conditional: controlled });
    }
    return result;
  } finally { tree.delete(); }
}

/** Recheck neutral records and all positions against the protected original bytes. */
export function validateDjangoSyntax(value: unknown, file: string, bytes: Uint8Array): DjangoSyntax {
  const source = pythonSource(bytes);
  const object = (v: unknown, keys: string[]) => { if (!v || typeof v !== "object" || Array.isArray(v)) throw Error("invalid-parser-output"); const r = v as Record<string, unknown>; if (Object.keys(r).length !== keys.length || keys.some(k => !(k in r))) throw Error("invalid-parser-output"); return r; };
  const bounded = (v: unknown): string => { if (typeof v !== "string" || v.length > 4096 || v.includes("\0")) throw Error("invalid-parser-output"); return v; };
  const r = object(value, ["inputs", "malformed", "visited"]);
  if (typeof r.malformed !== "boolean" || typeof r.visited !== "number" || !Number.isSafeInteger(r.visited) || r.visited < 0 || r.visited > 100000 || !Array.isArray(r.inputs) || r.inputs.length > 20000 || r.malformed && r.inputs.length) throw Error("invalid-parser-output");
  const inputs: DjangoInput[] = r.inputs.map(v => {
    const i = object(v, ["kind", "name", "value", "arguments", "ownerStart", "conditional", "site"]), s = object(i.site, ["file", "start", "end", "line", "endLine", "fileHash", "extractor", "evidenceKind"]);
    if (!["assignment", "call", "class", "decorator", "import", "function"].includes(String(i.kind)) || typeof i.conditional !== "boolean" || i.ownerStart !== null && (typeof i.ownerStart !== "number" || !Number.isSafeInteger(i.ownerStart) || i.ownerStart < 0 || i.ownerStart > source.text.length) || s.file !== file || s.fileHash !== source.hash || s.extractor !== "django/syntax/fs-06/1" || s.evidenceKind !== "verified" || typeof s.start !== "number" || typeof s.end !== "number" || !Array.isArray(i.arguments) || i.arguments.length > 200) throw Error("invalid-parser-output");
    const range = source.range(s.start, s.end); if (range.line !== s.line || range.endLine !== s.endLine || s.end <= s.start) throw Error("invalid-parser-output");
    const args = i.arguments.map(v => { const a = object(v, ["name", "text", "start", "end"]); if (typeof a.start !== "number" || typeof a.end !== "number" || a.start < range.start || a.end > range.end || a.end <= a.start) throw Error("invalid-parser-output"); source.range(a.start, a.end); const text = bounded(a.text); if (text && text !== source.parserText.slice(a.start, a.end)) throw Error("invalid-parser-output"); return { name: a.name === null ? null : bounded(a.name), text, start: a.start, end: a.end }; });
    return { kind: i.kind as DjangoInput["kind"], name: bounded(i.name), value: bounded(i.value), arguments: args, ownerStart: i.ownerStart as number | null, conditional: i.conditional, site: s as Site };
  });
  return { inputs, malformed: r.malformed, visited: r.visited };
}
