# Phase 07 — Incremental local refresh

## Objective

Reduce refresh work for supported changes while preserving equivalence to a full analysis of the same repository state.

## Why this phase exists

After the deterministic engine is trustworthy, repeated full parsing can limit everyday use. Optimization must preserve evidence correctness and follow measured cost.

## Starting state

Phases 03 and 06 provide atomic snapshots and richer symbol evidence. Refresh is explicit/full. Phase 05 may add local explanation caches.

## Scope

Selected-root watching, change coalescing, affected evidence/resolution invalidation, safe full-rebuild escalation, atomic publication, and local performance measurement.

## Required behavior

- Watch only authorized repository roots and honor exclusions. Debounce/coalesce events into one coherent refresh generation; never treat an event stream as proof of file contents.
- Reanalyze changed files and all affected import/symbol/framework resolution. Deletions and renames remove obsolete facts and invalidate dependent evidence.
- Escalate package/config/exclusion changes, uncertain resolution, branch-change bursts, watcher overflow/loss, and unsupported event situations to full reanalysis. Surface watcher degradation and permit manual refresh.
- Publish only complete validated snapshots. If files change during refresh, detect instability and schedule/retry rather than advertise a mixed-time snapshot as current. Cancel/supersede safely and preserve the prior complete result.
- Invalidate affected query indexes and explanations using evidence/provenance digests; unchanged valid caches may remain. Optional Phase 05 failures cannot block refresh.
- Keep a manual full-refresh escape hatch and meaningful progress/errors. Start/stop watchers cleanly when selecting/forgetting repositories or exiting.
- Measure initial/refresh latency, query latency, memory, and local storage on stated fixture/repository sizes. Record baseline versus incremental results locally; set limits from measurements rather than inventing thresholds.

## Architectural constraints

Use the existing engine/storage boundaries, no second truth model. Change scheduling and watching live outside pure parsing/graph arithmetic. Incremental invalidation must include global framework effects, not only the changed file's outgoing edges. Full rebuild is the correctness fallback, not a failure to conceal. Git activity may trigger refresh but does not supply structural truth.

## Data/privacy constraints

Watch/read only authorized roots under the established policy. No arbitrary repository execution, cloud workers, source telemetry, or provider call for refresh. Keep performance records free of source/paths when routed through the pilot measurement interface. No credentials in watcher/process errors.

## Explicit non-goals

Git history/diff intelligence, distributed indexing, partial unvalidated graphs, cross-repository scheduling, Laya, runtime tracing, or broad performance rewrites without evidence.

## Dependencies

Phases 03 and 06 (and their prerequisites). Integrate Phase 05 cache invalidation only when that capability exists. Phase 08 is independent. Watcher/package additions require approval.

## Migration/removal work

Retain full analysis and manual refresh. Replace only repeated-work paths whose equivalence is demonstrated. Add no speculative persistent AST cache. Preserve atomic publication, snapshot freshness, and repository forgetting semantics.

## Verification

Run typecheck, lint, build, engine/storage tests, Rust checks/tests, and platform package checks. Compare normalized incremental snapshots with full analysis after edits, aliases/re-exports, config/package changes, additions/deletions/renames, unsupported events, branch-like bursts, cancellation, and watcher overflow. Normalize only nonsemantic IDs/timestamps; do not hide changed evidence. Test concurrent writes during refresh and stale-generation rejection. Record bounded performance comparisons and platform watcher behavior.

## Manual acceptance check

Edit a real repository and inspect updated edges/evidence without restarting. Rename/delete a dependency, change config, and observe correct invalidation/full escalation. Interrupt refresh, simulate watcher loss, recover manually, and confirm previous complete results remain available.

## Completion criteria

Supported incremental updates equal full analysis, uncertain changes safely rebuild, platform watcher failures recover, and required checks pass. Stop before Git intelligence or distributed optimization.
