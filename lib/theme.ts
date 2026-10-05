export const THEMES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

// Browser cache of the engine-owned SQLite setting, not a graph truth store.
export const THEME_STORAGE = "codebase-intelligence-theme";

export function parseTheme(value: string | undefined): Theme {
  return THEMES.find((t) => t === value) ?? "system";
}
