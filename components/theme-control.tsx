"use client";

import { useEffect, useSyncExternalStore } from "react";
import { parseTheme, THEME_STORAGE, THEMES, type Theme } from "@/lib/theme";

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem(THEME_STORAGE, theme); } catch { /* A denied settings store must not disable analysis. */ }
  window.dispatchEvent(new Event("theme-changed"));
}

function subscribe(listener: () => void) {
  window.addEventListener("theme-changed", listener);
  window.addEventListener("storage", listener);
  return () => { window.removeEventListener("theme-changed", listener); window.removeEventListener("storage", listener); };
}
function savedTheme(): Theme {
  try { return parseTheme(localStorage.getItem(THEME_STORAGE) ?? undefined); } catch { return "system"; }
}

export function ThemeControl({ initial }: { initial: Theme }) {
  const theme = useSyncExternalStore(subscribe, savedTheme, () => initial);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  function choose(next: Theme) {
    applyTheme(next);
  }

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="flex h-6 items-center rounded border border-line text-[0.6875rem]"
    >
      {THEMES.map((t) => (
        <button
          key={t}
          type="button"
          role="radio"
          aria-checked={theme === t}
          onClick={() => choose(t)}
          className={`h-full px-2 first:rounded-l last:rounded-r ${
            theme === t ? "bg-raised text-fg" : "text-fg-muted hover:text-fg"
          }`}
        >
          {t}
        </button>
      ))}
    </div>
  );
}
