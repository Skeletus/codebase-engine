/** Normalization is adapter-owned; canonical offsets always address original text. */
export function normalizeRange(source: string, start: number, end: number, units: "utf16" | "utf8"): { start: number; end: number; line: number; endLine: number } {
  if (units !== "utf16" && units !== "utf8") throw new Error("Unsupported source coordinate units");
  if (![start, end].every(Number.isSafeInteger) || start < 0 || end <= start) throw new Error("Invalid source range");
  const boundary = (position: number) => position >= 0 && position <= source.length && !(position > 0 && position < source.length && /[\uD800-\uDBFF]/.test(source[position - 1]) && /[\uDC00-\uDFFF]/.test(source[position]));
  if (units === "utf8") {
    let bytes = 0; const offsets = new Map<number, number>([[0, 0]]);
    for (let offset = 0; offset < source.length;) { const character = String.fromCodePoint(source.codePointAt(offset)!); bytes += new TextEncoder().encode(character).length; offset += character.length; offsets.set(bytes, offset); }
    const a = offsets.get(start), b = offsets.get(end); if (a === undefined || b === undefined) throw new Error("Range splits UTF-8 sequence"); start = a; end = b;
  }
  if (!boundary(start) || !boundary(end)) throw new Error("Range exceeds source or splits surrogate");
  const lineAt = (offset: number) => { let line = 1; for (let i = 0; i < offset; i++) { if (source[i] === "\r") { line++; if (source[i + 1] === "\n") i++; } else if (source[i] === "\n") line++; } return line; };
  return { start, end, line: lineAt(start), endLine: lineAt(end) };
}

/** Added adapters accept only UTF-8/ASCII; no silent replacement characters. */
export function decodeSource(bytes: Uint8Array, python = false): string {
  const source = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  if (python) { const cookie = source.split(/\r\n|\r|\n/).slice(0, 2).map((line) => /^\s*#.*?coding[:=]\s*([-\w.]+)/.exec(line)?.[1]).find(Boolean); if (cookie && !/^(utf[-_]?8|ascii|us-ascii)$/i.test(cookie)) throw new Error("Unsupported Python source encoding"); if (cookie && /ascii/i.test(cookie) && /[^\x00-\x7F]/.test(source)) throw new Error("ASCII cookie disagrees with source"); }
  return source;
}
