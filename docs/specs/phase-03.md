# Phase 03 — Durable local analysis

## Objective

Persist complete local analyses in SQLite and reopen them safely without cloud access or mandatory reparsing.

## Why this phase exists

The desktop vertical slice needs durable evidence and settings. Cloud row storage and GitHub source/freshness assumptions must be retired after their responsibilities have local replacements.

## Starting state

Phase 02 runs a packaged local engine and static desktop UI, with analyses primarily in memory. Legacy persistence adapters may remain isolated; no selected-root analysis uses them.

## Scope

SQLite storage boundary, atomic snapshots, local repository list/settings/job outcomes, restart recovery, explicit refresh, freshness checks, and local deletion.

## Required behavior

- Persist repository registrations, validated complete versioned snapshots, file hashes, edge/route provenance, full coverage and config diagnostics, settings, and job outcomes in application-owned local storage.
- Publish a completed snapshot atomically. Failed/cancelled/interrupted refreshes leave the previous complete snapshot available and visibly distinguish the failed attempt.
- Recover unfinished jobs after process/app restart; never present partial data as complete.
- Reopen and explicitly refresh repositories. Missing/moved/inaccessible roots show actionable local state; retained snapshots remain inspectable as historical analysis.
- Reject incompatible snapshot versions or offer safe reanalysis. Never reinterpret absent old fields as verified empty findings. Storage upgrades preserve recoverable data on failure.
- Check source hashes before evidence inspection; classify changed/deleted evidence as stale. A refresh replaces the active snapshot only after successful validation/publication.
- Forget a repository and delete its local snapshots, settings tied to it, job records, and later caches through the same storage boundary.

## Architectural constraints

The local engine owns storage orchestration behind one interface; parser/graph algorithms never issue SQL. SQLite identity is local and independent of Clerk organizations/cloud UUIDs. Persist canonical snapshots and evidence, not competing UI truth. ASTs, derived adjacency indexes, layouts, hover/selection, traversal frontiers, and temporary investigations remain in memory. Source remains in the repository; no source archive or vector store. Define the minimal local schema and migration mechanism as part of implementation, with runnable storage tests.

## Data/privacy constraints

All persisted source-derived information is local. No Supabase, Clerk, backend, GitHub, or provider call is needed to store/load/refresh. Deletion affects application-owned records only, never the repository itself or remote databases. Exclusions and root containment continue to apply to freshness reads.

## Explicit non-goals

Watchers, incremental parsing, Git history analysis, source backups, cloud-analysis import, graph database, remote schema migration/deletion, BYOK, or commercial account integration.

## Dependencies

Phase 02. SQLite/runtime packages need approval before installation. Phase 01 contracts and Phase 02 native authorization remain authoritative boundaries.

## Migration/removal work

Replace database-bound analysis/context loading and cloud progress/persistence with local queries/events. Remove remaining Supabase runtime adapters, environment requirements, dependency, and GitHub-only submission/archive/source/freshness behavior once local replacements pass. Remove obsolete `AGENT_URL` example when confirming no consumer. Preserve historical Supabase migration files as engineering evidence; do not execute them or delete remote data. Do not remove reusable provider-independent explanation UX.

## Verification

Run typecheck, lint, build, engine/storage tests, Rust checks/tests, and desktop package smoke checks. Cover snapshot round trips, complete diagnostics, crash/interruption at publication, cancellation, concurrent refresh ownership, schema upgrade failure, incompatible versions, missing roots, changed/deleted evidence, deletion, and reopening without cloud environment variables. Verify no active intelligence imports or credentials depend on Supabase/GitHub services.

## Manual acceptance check

Analyze a repository, close/reopen offline, inspect the stored graph, modify/delete evidence, observe stale state, refresh, interrupt a refresh, and reopen the last complete result. Forget the repository and confirm its source files remain untouched.

## Completion criteria

Durable local snapshots are recoverable and evidence-consistent; source-derived cloud persistence is retired; required checks pass. Stop before investigation/pilot features.
