"use client";

import { useEffect, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ExplainResult } from "@/lib/analysis/operations";
import { railLabel } from "@/lib/roles";
import { ExplanationText } from "./explanation-text";

export type ExplainTarget = { kind: "file"; path: string } | { kind: "group"; dir: string };

export function targetKey(target: ExplainTarget): string {
  return target.kind === "file" ? `file:${target.path}` : `group:${target.dir}`;
}

export type ExplanationState =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "done"; result: Extract<ExplainResult, { ok: true }> };

export function ExplanationPanel(props: {
  target: ExplainTarget;
  setup?: { provider: string; onConfigure: () => void };
  state: ExplanationState | undefined;
  onExplain: (target: ExplainTarget) => void;
  isPath: (path: string) => boolean;
  renderPath: (path: string) => ReactNode;
}) {
  const { target, state } = props;
  const what = target.kind === "file" ? "this file" : "this folder";
  const provider = props.setup?.provider;
  const [configuration, setConfiguration] = useState<{ provider: string; ready: boolean; error?: string } | null>(null);
  useEffect(() => {
    if (provider === undefined) return;
    let live = true;
    void invoke<{ configured: boolean; error?: string }>("provider_configuration", { provider: provider || null, model: null, key: null, remove: false })
      .then((result) => { if (live) setConfiguration({ provider, ready: result.configured, error: result.error }); })
      .catch(() => { if (live) setConfiguration({ provider, ready: false, error: "Could not verify the selected provider. Check AI settings and native secure storage." }); });
    return () => { live = false; };
  }, [provider]);
  if (props.setup && (!configuration || configuration.provider !== provider || !configuration.ready)) {
    const checking = !configuration || configuration.provider !== provider;
    return <div className="explanation-prompt flex flex-col items-center justify-center gap-4 px-6 py-12 text-center">
      <h3 className="text-lg font-semibold">{checking ? "Checking AI configuration…" : "Set up AI explanations"}</h3>
      <p className="max-w-sm text-sm leading-relaxed text-fg-muted">{checking ? "Checking the selected provider locally. No evidence is sent." : configuration.error ?? "Choose an available Codex or Claude Code agent, or securely configure an OpenAI or Groq API key."}</p>
      {!checking && <ExplainButton label="Configure AI" onClick={props.setup.onConfigure} />}
      <p className="max-w-sm text-sm text-fg-muted">Local analysis and Laya work without AI configuration.</p>
    </div>;
  }


  if (!state) {
    return (
      <div className="explanation-prompt flex flex-col items-center justify-center gap-4 px-6 py-12 text-center">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-accent" aria-hidden="true"><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z" /></svg>
        <h3 className="text-lg font-semibold">Understand {what} with AI</h3>
        <p className="max-w-sm text-sm leading-relaxed text-fg-muted">Turn selected evidence into an explanation. You’ll review and approve the exact context before sending.</p>
        <ExplainButton label="Explain" onClick={() => props.onExplain(target)} />
        <p className="max-w-sm text-sm text-fg-muted">Optional AI interpretation, not structural evidence.</p>
      </div>
    );
  }
  if (state.status === "loading") {
    return <p className="px-3 py-3 text-[11px] text-fg-muted">Explaining {what}…</p>;
  }
  if (state.status === "error") {
    return (
      <div className="px-3 py-3 text-[11px]">
        <p>Couldn&apos;t explain {what}.</p>
        <p className="mt-0.5 break-words text-fg-muted">{state.error}</p>
        <div className="mt-2">
          <ExplainButton label="Try again" onClick={() => props.onExplain(target)} />
        </div>
      </div>
    );
  }

  const { result } = state;
  return (
    <div className="px-3 py-3">
      <p className="mb-2 text-[11px] text-fg-muted">Generated explanation — not structural evidence</p>
      <p className="mb-2 text-[10px] text-fg-muted">Matches the inspected snapshot package. Source hashes were checked when prepared; prepare again to recheck later edits.</p>
      <AnimatedExplanation key={result.body} text={result.body} isPath={props.isPath} onPath={props.renderPath} />
      {result.citations?.map((c) => <p key={c.id} className="mt-1 text-xs">[{c.id}] {props.renderPath(c.path)}</p>)}
      {result.cacheSaved === false && <p className="text-xs">Local cache unavailable; answer was not saved.</p>}
      <div className="mt-3 space-y-0.5 border-t border-line pt-2 text-[10px] text-fg-muted">
        {result.labelled && (
          <p>
            {result.labelled.role === null
              ? "No convention identified this file, and the model found no role that fits."
              : `No convention identified this file; the model labelled it ${railLabel(result.labelled.role).toLowerCase()}.`}
          </p>
        )}
        {result.labelError && <p>Labelling this file failed: {result.labelError}</p>}
        <p>
          <span className="font-mono">{result.model}</span> · {result.cached ? "from cache, no model call" : "new answer"}
        </p>
      </div>
    </div>
  );
}

function ExplainButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="border border-line px-6 py-2 text-sm font-medium hover:bg-raised">
      {label}
    </button>
  );
}

function AnimatedExplanation(props: { text: string; isPath: (path: string) => boolean; onPath: (path: string) => ReactNode }) {
  const [visible, setVisible] = useState(0);
  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (preference.matches) return;
    const started = performance.now();
    const timer = window.setInterval(() => {
      const count = Math.min(props.text.length, Math.ceil((performance.now() - started) / 1800 * props.text.length));
      setVisible((current) => Math.max(current, count));
      if (count === props.text.length) window.clearInterval(timer);
    }, 30);
    return () => window.clearInterval(timer);
  }, [props.text]);
  // Full text is available to assistive technology throughout the visual reveal.
  return <div><div className="animated-explanation" aria-hidden="true"><ExplanationText {...props} text={props.text.slice(0, visible)} />{visible < props.text.length && <button className="mt-2 text-sm underline" onClick={() => setVisible(props.text.length)}>Show full explanation</button>}</div><div className="reduced-motion-explanation"><ExplanationText {...props} /></div><p className="sr-only motion-reduce:hidden">{props.text}</p></div>;
}
