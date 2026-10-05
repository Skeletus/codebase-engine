export const THEMES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

// Retained for the isolated legacy adapter; desktop settings use THEME_STORAGE.
export const THEME_COOKIE = "theme";
export const THEME_STORAGE = "codebase-intelligence-theme";

export function parseTheme(value: string | undefined): Theme {
  return THEMES.find((t) => t === value) ?? "system";
}
