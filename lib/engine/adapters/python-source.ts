import { createHash } from "node:crypto";

/** Parser text preserves original UTF-16 offsets, including BOM and CRLF.
 * The BOM is replaced by one space only in the syntax input. */
export function pythonSource(bytes: Uint8Array) {
  const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  const bom = text.startsWith("\uFEFF");
  const first = (bom ? text.slice(1) : text).split(/\r\n|\r|\n/, 2);
  const cookie = (line: string) => /^[\t\f ]*#.*?coding[:=][\t ]*([-\w.]+)/.exec(line)?.[1];
  const encoding = cookie(first[0] ?? "") ?? (/^[\t\f ]*(?:#.*)?$/.test(first[0] ?? "") ? cookie(first[1] ?? "") : undefined);
  if (encoding && !/^(utf[-_]?8|ascii|us-ascii)$/i.test(encoding)) throw new Error("unsupported-encoding");
  if (encoding && /ascii/i.test(encoding) && (bom || /[^\x00-\x7f]/.test(text))) throw new Error("unsupported-encoding");
  const offsets = new Uint32Array(text.length + 1); offsets.fill(0xffffffff); offsets[0] = 0;
  const lineStarts = [0];
  let byte = 0;
  for (let offset = 0; offset < text.length;) {
    const character = String.fromCodePoint(text.codePointAt(offset)!);
    if (character === "\r" || character === "\n" && text[offset - 1] !== "\r") lineStarts.push(offset + 1);
    byte += Buffer.byteLength(character); offset += character.length; offsets[offset] = byte;
  }
  if (byte !== bytes.length) throw new Error("unsupported-encoding");
  return {
    text, parserText: bom ? " " + text.slice(1) : text,
    hash: createHash("sha256").update(bytes).digest("hex"),
    range(start: number, end: number) {
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end <= start || end > text.length) throw new Error("invalid-source-position");
      const byteStart = offsets[start], byteEnd = offsets[end];
      if (byteStart === 0xffffffff || byteEnd === 0xffffffff || Buffer.from(bytes.subarray(byteStart, byteEnd)).toString("utf8") !== text.slice(start, end)) throw new Error("invalid-source-position");
      const lineAt = (position: number) => { let low = 0, high = lineStarts.length; while (low < high) { const middle = (low + high) >>> 1; if (lineStarts[middle] <= position) low = middle + 1; else high = middle; } return low; };
      return { start, end, line: lineAt(start), endLine: lineAt(end), byteStart, byteEnd };
    },
  };
}
