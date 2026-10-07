import { interpretConfig, type ConfigResult, type StaticValue } from "./static-config.ts";
import { GenerationBoundary } from "./boundary.ts";

/** A specified TOML/requirements subset, never a Python/configuration evaluator. */
export function interpretDeclarativeMetadata(text: string, kind: "pyproject" | "requirements", boundary: GenerationBoundary): ConfigResult {
  const properties: Record<string, StaticValue> = Object.create(null), gaps: ConfigResult["gaps"] = [], sites: ConfigResult["sites"] = [];
  let section = "", offset = 0, visited = 0;
  for (const line of text.split(/(?<=\n)/)) {
    boundary.check();
    if (++visited > 10000) return { value: { kind: "unknown", reason: "resource-limit" }, gaps: [{ reason: "resource-limit", start: 0, end: text.length, detail: "declarative metadata budget" }], visited, sites: [] };
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) { offset += line.length; continue; }
    const addGap = (reason: "unsupported-syntax" | "parse-error", detail: string) => gaps.push({ reason, start: offset, end: offset + line.trimEnd().length, detail });
    if (kind === "requirements") {
      const match = /^([A-Za-z0-9][A-Za-z0-9._-]*)==([\w.+-]+)(?:\s+#.*)?$/.exec(trimmed);
      if (match) { const name = match[1].toLowerCase().replaceAll("_", "-"); if (Object.hasOwn(properties, name)) { properties[name] = { kind: "unknown", reason: "ambiguous-target" }; gaps.push({ reason: "ambiguous-target", start: offset, end: offset + line.trimEnd().length, detail: "duplicate requirement declaration" }); } else properties[name] = { kind: "literal", value: match[2] }; }
      else addGap("unsupported-syntax", "only explicit name==version requirement metadata is supported");
    } else {
      const header = /^\[([\w.-]+)\](?:\s+#.*)?$/.exec(trimmed);
      if (header) { section = header[1]; offset += line.length; continue; }
      const assignment = /^([\w-]+)\s*=\s*(.*)$/.exec(trimmed);
      if (!assignment) addGap("unsupported-syntax", "multiline/advanced TOML declaration is not interpreted");
      else {
        const expression = assignment[2], start = offset + line.indexOf(expression), result = interpretConfig(expression, { expression: true, boundary });
        const key = section + "." + assignment[1];
        if (Object.hasOwn(properties, key)) { properties[key] = { kind: "unknown", reason: "ambiguous-target" }; addGap("parse-error", "duplicate TOML property"); }
        else { properties[key] = result.value; gaps.push(...result.gaps.map(g => ({ ...g, start: start + g.start, end: start + g.end }))); sites.push({ start, end: start + expression.length }); }
      }
    }
    offset += line.length;
  }
  return { value: { kind: "object", properties }, gaps, visited, sites };
}
