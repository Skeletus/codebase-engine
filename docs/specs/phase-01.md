# Phase 01 — Protected local engine boundary

## Objective

Expose reusable deterministic analysis behind a protected local engine boundary while preserving compatible Cartograph functionality.

## Why this phase exists

The parser already reads local paths and graph functions are pure. Cloud/UI orchestration and unrestricted resolver reads, rather than a missing parser, prevent safe desktop reuse. Extract boundaries before replacement.

## Starting state

Original Cartograph Baseline: parser schema v4, TS/JS file/import evidence, framework route extractors, pure graph calculations, Next server actions, GitHub ingestion, and Supabase persistence. No new-product phase is complete.

## Scope

Introduce minimal language-neutral engine contracts for analysis, evidence, coverage, snapshots, and existing structural queries. Adapt current parser output and separate UI operations from server-action imports. Secure all analysis reads. Remove LangSmith without replacing it.

## Required behavior

- Run local analysis independently of React, Next, Clerk, cloud storage, and providers. Preserve current imports, exports, routes, coverage, and graph semantics.
- Keep TS/JS ASTs and framework interpretation behind adapters. The current framework-adapter interface is not the future language-adapter contract.
- Carry source/target, relation, source location, extractor identity, evidence kind, and file hash where needed. Retain first-occurrence import evidence honestly; do not imply every occurrence was preserved by existing deduplication.
- Validate serialized contracts and version incompatibility explicitly. Retain diagnostics, skipped files, unresolved imports, and withheld routes.
- Establish one read policy for walker, resolver, config inheritance, evidence access, symlinks, generated/dependency output, and sensitive content. Define and test exact exclusions during this phase; do not rely on extension filtering alone.
- Bound file/aggregate input and report resource limits and unreadable directories explicitly. Config parsing must remain static; no config-module execution, dependency installation, or repository scripts.
- Preserve old public-GitHub behavior through an isolated compatibility adapter. Selected local roots must never reach that adapter or cloud persistence.
- Remove LangSmith wrappers, task tracing, displayed tracing status, and related environment examples. Keep compatible explanations working without tracing. Correct prompts that call import evidence the only connections that exist.

## Architectural constraints

Engine contracts contain no ts-morph, React, Next, Tauri UI, Clerk, Supabase, or provider client types. Graph operations stay pure. UI consumes operations through a replaceable interface. Language/framework checks stay in adapters. Preserve parser scripts and canvas projections rather than rewrite them.

## Data/privacy constraints

No local source, paths, ASTs, graphs, evidence, diagnostics, or derived prompts leave the machine. Deny unexpected reads outside the selected root and policy-authorized application resources, including indirect TypeScript config/module-resolution reads. Never execute repository code. Existing legacy compatibility must not weaken the local boundary.

## Explicit non-goals

Tauri, SQLite, symbol/call extraction, external BYOK, Laya, new languages, telemetry, cloud schema changes, or a new intelligence server.

## Dependencies

Original Cartograph Baseline plus the permanent product rules. Read installed version-specific Next docs before Next changes. Package changes require approval; this specification does not grant it.

## Migration/removal work

Extract engine/UI boundaries first, verify parity, then remove tracing code/dependency. Retain Supabase/GitHub adapters only for legacy use pending Phases 02–03. Do not restore original phase specs or alter remote data.

## Verification

Run `pnpm exec tsc --noEmit`, `pnpm lint`, and `pnpm build`. Add runnable automated fixtures covering contract round trips, aliases/configs, CommonJS, dynamic imports, syntax failures, skipped targets, type-only impact, cycles, and unsupported routes. Check forbidden imports and denied network egress for local operations. Test config extends, symlink escapes, unreadable directories, exclusions, and resource limits. Run existing parser/map-counts/insights checks against fixture outputs. Report missing tooling/configuration as unverified.

## Manual acceptance check

Verify existing graph selection, folding, categories, routes, and details remain coherent. Run standalone local analysis with cloud adapters disabled and inspect coverage. Confirm no local root can be submitted through the legacy operation interface.

## Completion criteria

Local contracts and read policy are exercised, deterministic behavior is preserved, LangSmith is absent, and all required checks pass without weakened rules. Stop before desktop implementation.
