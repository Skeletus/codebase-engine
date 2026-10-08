import type { Selection } from "./index.ts";
import { metroTuple } from "./adapters/metro-profile.ts";

/** Explicit leading Flow pragma only; string literals and later comments do not
 * reclassify ordinary JavaScript. No configuration or typechecker runs.
 */
export function flowPragma(text: string): boolean {
  let offset = text.startsWith("\uFEFF") ? 1 : 0;
  if (text.slice(offset, offset + 2) === "#!") { const end = text.indexOf("\n", offset); if (end < 0) return false; offset = end + 1; }
  while (offset < text.length) {
    while (offset < text.length && /\s/.test(text[offset])) offset++;
    let comment: string;
    if (text.slice(offset, offset + 2) === "//") { const end = text.indexOf("\n", offset); comment = text.slice(offset + 2, end < 0 ? text.length : end); offset = end < 0 ? text.length : end + 1; }
    else if (text.slice(offset, offset + 2) === "/*") { const end = text.indexOf("*/", offset + 2); if (end < 0) return false; comment = text.slice(offset + 2, end); offset = end + 2; }
    else return false;
    if (/@noflow\b/.test(comment)) return false;
    if (/@flow\b/.test(comment)) return true;
  }
  return false;
}
export function flowFiles(selection: Selection): Set<string> {
  const projects = new Set(selection.walk.discovery.projects.filter(p => metroTuple(p.versions)).map(p => p.path));
  const owners = new Map(selection.walk.discovery.inventory.map(f => [f.path, f.owner]));
  return new Set(selection.walk.candidates.filter(c => /\.(?:js|jsx)$/.test(c.path) && projects.has(owners.get(c.path) ?? "") && flowPragma(c.content)).map(c => c.path));
}
