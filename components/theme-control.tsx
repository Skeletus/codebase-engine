"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
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
  const [pending, setPending] = useState(false), [error, setError] = useState("");
  const choice = useRef(0);
  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    const initialChoice = choice.current;
    void invoke<{ theme: Theme }>("local_settings", { initialTheme: savedTheme() }).then((saved) => { if (!disposed && choice.current === initialChoice) applyTheme(parseTheme(saved.theme)); }).catch(() => { if (!disposed && choice.current === initialChoice) setError("Stored theme unavailable"); });
    return () => { disposed = true; };
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  async function choose(next: Theme) {
    if (!isTauri()) { applyTheme(next); return; }
    choice.current++;
    setPending(true); setError("");
    try { await invoke("local_settings", { theme: next }); applyTheme(next); }
    catch { setError("Theme could not be saved"); }
    finally { setPending(false); }
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
          disabled={pending}
          onClick={() => void choose(t)}
          className={`h-full px-2 first:rounded-l last:rounded-r ${
            theme === t ? "bg-raised text-fg" : "text-fg-muted hover:text-fg"
          }`}
        >
          {t}
        </button>
      ))}
      {error && <span role="alert" className="ml-2">{error}</span>}
    </div>
  );
}
