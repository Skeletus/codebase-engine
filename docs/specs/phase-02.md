# Phase 02 — Desktop local repository exploration

## Objective

Deliver a working local repository exploration workflow in Tauri 2 using the existing UI and packaged Node engine.

## Why this phase exists

Static frontend reuse plus a Node sidecar preserves React and ts-morph without bundling a Next intelligence server. This is the first desktop vertical slice, not yet the durable pilot.

## Starting state

Phase 01 provides independent engine contracts, protected reads, UI operations, and isolated legacy adapters. Durable local storage and native desktop integration do not exist.

## Scope

Native repository selection, packaged engine supervision, static UI navigation, local job progress/cancellation, graph/route exploration, evidence inspection, and offline assets/settings.

## Required behavior

- Open a selected local directory, including repositories with no Git metadata or GitHub origin; select, parse, and display validated analysis.
- Reuse React Flow, dagre, shell, categories, folding, detail navigation, and dependency algorithms. Display complete skip/unresolved/config/route diagnostics rather than only coverage counts.
- Use typed operations and progress events with job identity. Reject stale events; serialize conflicting jobs for a repository. Cancellation or engine crash must preserve a coherent UI and permit retry.
- Provide locally read source evidence with snapshot hash verification. Show changed/missing evidence explicitly; never use it as if it matched the graph.
- Export static frontend assets with client-side repository/analysis selection rather than server-generated arbitrary analysis routes.
- Bundle runtime, assets, and fonts; installed applications require neither system Node nor repository dependencies. Store theme settings locally without server cookies.
- Remove desktop auth/provider gates and mandatory Clerk/Supabase/OpenAI environment validation. Offline startup must succeed without any account.

## Architectural constraints

Tauri owns native selection, scoped commands, process lifecycle, and OS integration. The TypeScript engine owns analysis and queries. Use a versioned validated request/event protocol over private process pipes with request/job IDs, bounded messages, structured errors, and explicit cancellation. No loopback server. The renderer cannot choose executables, arbitrary arguments, shell commands, or unrestricted filesystem paths. Native selection establishes the authorized root; evidence commands reference validated snapshot entities. Engine logs must not corrupt protocol output. Static UI has no runtime server-action/SSR dependency.

## Data/privacy constraints

Local intelligence uses no network. Apply Phase 01 policy to all reads and render repository/provider text as untrusted content. No repository execution, cloud uploads, unsafe navigation, or broad renderer native permissions. Keep application diagnostics local and exclude source/credential payloads.

## Explicit non-goals

SQLite/durable snapshots, free-form generation, BYOK, actual feature execution flows, Laya, commercial identity/licensing, new languages, or incremental watchers.

## Dependencies

Phase 01. Package additions need separate approval. Read installed Next guides and current Tauri documentation before implementation. Windows, macOS, and Linux are pilot targets; platform limitations must be recorded.

## Migration/removal work

Replace desktop server actions, runtime server routes, cookies, middleware, SSR queries, and Clerk provider gating with local operations/client navigation. Retire obsolete Next orchestration only when its useful desktop behavior is replaced. Preserve reusable UI and Clerk identity choice; do not install a replacement identity provider.

## Verification

Run typecheck, lint, static frontend build, engine tests, `cargo check`, and `cargo test` for the introduced desktop manifest. Add runnable protocol/lifecycle tests for invalid messages, unsupported versions, denied roots, stale progress, crash/restart, cancellation, and bounded input. Build platform packages and smoke-test the bundled runtime without system Node. Test offline operation with denied egress; check no cloud secrets enter static assets. Keep package commands documented and runnable.

## Manual acceptance check

Without internet or credentials, open a real local repository, inspect graph/routes, reveal dependencies, inspect source evidence and coverage, cancel/retry an analysis, change theme, and restart the app. Test empty, inaccessible, and unsupported directories. Verify the app closes its child process cleanly.

## Completion criteria

Packaged desktop exploration works through protected local operations and responds coherently to failures. Required checks pass; untested platforms remain explicit, not implied successes. Stop before durable persistence.
