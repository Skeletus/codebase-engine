"use client";

import type { ReactNode } from "react";
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
  state: ExplanationState | undefined;
  onExplain: (target: ExplainTarget) => void;
  isPath: (path: string) => boolean;
  renderPath: (path: string) => ReactNode;
}) {
  const { target, state } = props;
  const what = target.kind === "file" ? "this file" : "this folder";

  if (!state) {
    return (
      <div className="px-3 py-3 text-[11px]">
        <ExplainButton label="Explain" onClick={() => props.onExplain(target)} />
        <p className="mt-1.5 text-fg-muted">
          {target.kind === "file"
            ? "Optional generated interpretation of selected file metadata and partial verified evidence. Inspect the exact payload before sending."
            : "Optional generated interpretation of a bounded folder evidence sample. Truncation and coverage limits are included; inspect before sending."}
        </p>
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
      <p className="mb-2 text-[11px] text-fg-muted">Generated, unverified explanation — not new structural evidence.</p>
      <p className="mb-2 text-[10px] text-fg-muted">Matches the inspected snapshot package. Source hashes were checked when prepared; prepare again to recheck later edits.</p>
      <ExplanationText text={result.body} isPath={props.isPath} onPath={props.renderPath} />
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
    <button type="button" onClick={onClick} className="rounded-[3px] border border-line px-2 py-0.5 text-[11px] hover:bg-raised">
      {label}
    </button>
  );
}
