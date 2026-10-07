import { compatibleAdapters, selectAdapter } from "../parser/adapters/index.ts";
import type { ProjectInfo, FrameworkAdapter } from "../parser/adapters/types.ts";

export type ExtractorRegistration = { id: string; version: string; stage: "language" | "framework" | "extension"; requires: readonly string[]; appliesTo?: readonly string[]; channel: string; priority: number; detect: (project: ProjectInfo) => boolean };
export type Composition = { legacy: FrameworkAdapter; languages: string[]; frameworks: string[]; extensions: string[]; registrations: ExtractorRegistration[] };

/** Only application-owned registrations are accepted; repository metadata is data. */
export class ExtractorRegistry {
  private readonly entries = new Map<string, ExtractorRegistration>();
  register(entry: ExtractorRegistration): void {
    if (!entry.id || !entry.version || !entry.channel || !Number.isSafeInteger(entry.priority) || this.entries.has(entry.id)) throw new Error("Conflicting extractor registration");
    this.entries.set(entry.id, Object.freeze({ ...entry, requires: Object.freeze([...entry.requires]) }));
  }
  compose(project: ProjectInfo, languages: readonly string[]): Composition {
    const selected = [...this.entries.values()].filter(e => (!e.appliesTo || e.appliesTo.some(language => languages.includes(language))) && e.detect(project)).sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
    const available = new Set(languages), channels = new Set<string>();
    for (const e of selected) {
      if (e.requires.some(id => !available.has(id) && !selected.some(other => other.id === id))) throw new Error("Missing extractor dependency");
      const key = `${e.stage}:${e.channel}:${e.priority}`;
      if (channels.has(key)) throw new Error("Conflicting extractor channel");
      channels.add(key); available.add(e.id);
    }
    const pending = new Map(selected.map(e => [e.id, e])), ordered: ExtractorRegistration[] = [], done = new Set(languages);
    while (pending.size) {
      const ready = [...pending.values()].filter(e => e.requires.every(id => done.has(id)));
      if (!ready.length) throw new Error("Cyclic extractor dependency");
      for (const e of ready) { ordered.push(e); done.add(e.id); pending.delete(e.id); }
    }
    return { legacy: selectAdapter(project), languages: [...new Set(languages)].sort(), frameworks: [...new Set([...compatibleAdapters(project).map(a => a.name), ...ordered.filter(e => e.stage === "framework").map(e => e.id)])].sort(), extensions: ordered.filter(e => e.stage === "extension").map(e => e.id), registrations: ordered };
  }
}

export function defaultRegistry(): ExtractorRegistry {
  const registry = new ExtractorRegistry();
  registry.register({ id: "typescript-javascript", version: "legacy/2", stage: "language", requires: [], appliesTo: ["typescript-javascript"], channel: "syntax", priority: 0, detect: () => true });
  for (const [id, dependency, stage] of [["vite", "vite", "framework"], ["react-native", "react-native", "framework"], ["expo", "expo", "extension"], ["django", "django", "framework"]] as const) registry.register({ id, version: "fs-02/1", stage, requires: [], channel: id, priority: 0, detect: p => id === "django" ? p.languageDependencies?.python?.has(dependency) ?? false : p.languageDependencies?.["typescript-javascript"]?.has(dependency) ?? p.dependencies.has(dependency) });
  return registry;
}
