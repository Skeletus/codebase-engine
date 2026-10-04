# Phase 04 — Deterministic investigations and PILOT-READY MVP

## Objective

Deliver trustworthy local understanding/change-impact workflows and qualify the first **PILOT-READY MVP** on Windows, macOS, and Linux.

## Why this phase exists

A persistent graph is not yet a useful investigation product. Existing reachability and dependency evidence can answer practical questions without an LLM or Laya. This is the earliest responsible pilot gate.

## Starting state

Phase 03 provides offline desktop exploration, SQLite snapshots, evidence freshness, explicit refresh, and complete coverage. Relationships are principally file dependencies and route declarations, not recovered calls or runtime flows.

## Scope

Entry-point/path/export search, dependency traces, file change impact with witnesses, supported structural Ask Codebase operations, local pilot measurements, and three-platform release acceptance.

## Required behavior

- Search known paths, export names, and convention-identified entry points. Return real entities and let users disambiguate duplicate names; do not infer relationships from search relevance.
- Trace dependencies from selected files with source evidence for each step. Label these dependency traces, not feature execution flows. Show unresolved/skipped boundaries and depth/budget limits.
- Calculate incoming transitive dependents, including type-only edges, with deterministic shortest witness paths. Distinguish compile-time dependency from runtime call claims. Offer selectable depth; disclose omitted results and coverage limitations.
- Provide an offline Ask Codebase interface for supported questions about dependencies, dependents, routes, exports, and dependency traces. Use explicit supported intents/target selection and deterministic summaries; do not promise unrestricted natural-language comprehension. Ambiguous targets require selection and unsupported questions explain the limitation.
- Reuse the graph/detail UI to navigate answers and inspect witnesses. Every structural claim refers to snapshot evidence; stale current source remains clearly identified.
- Keep related-test candidates, if displayed, limited to convention-identified test files reachable through verified dependencies. Do not call them proven test coverage or invent TESTS edges.
- Add small local measurement records containing task category, elapsed time, usefulness feedback, application version, and manually entered numeric discovered/missed-dependency assessments. No free-text repository payloads. Provide a local reset; no remote analytics transport.
- Document comparable pilot tasks and baseline/product trials for Time-to-Understanding, Time-to-Impact, answer usefulness, and repeated voluntary usage. Missed-dependency ground truth is assessed manually; absence from an incomplete graph is not proof of absence.
- Build and accept installed packages on all three platforms. Record supported CPU architectures, tested OS versions, runtime prerequisites, measured repository sizes/limits, and time to first useful result. Do not claim untested combinations.

## Architectural constraints

Investigations consume engine queries/evidence rather than canvas state. Preserve pure graph algorithms and cycle safety. No language-specific conditionals in generic impact/search traversal. The pilot does not require System-1 or System-2. Failure in measurement recording must not block intelligence. Platform builds must contain the runtime and offline assets rather than rely on developer-installed Node.

## Data/privacy constraints

All intelligence works with denied network egress and no accounts/keys. Pilot measurement contains no source, repository paths/names/identifiers, graph payloads, raw questions, prompts, or credentials. Keep human assessment notes outside product telemetry. Repository analysis remains static and subject to exclusions.

## Explicit non-goals

External providers, BYOK credentials, Laya, actual execution-flow reconstruction, runtime tracing, full Git/diff intelligence, remote telemetry, commercial licensing, embeddings, or new language adapters.

## Dependencies

Phase 03. Cross-platform acceptance requires corresponding test hosts/build environments; report unavailable platforms as incomplete. Signing/notarization credentials, when required by the chosen distribution path, are an explicit release prerequisite and cannot be fabricated.

## Migration/removal work

Replace GitHub/commit-centric UI wording with local snapshot/freshness information. Retain useful deterministic insights without quality scores. Remove stale cloud affordances that could suggest uploading local repositories. No future commercial/auth replacement belongs in this phase.

## Verification

Run typecheck, lint, build, engine tests, Rust checks/tests, and documented platform package commands. Test cyclic/disconnected/empty graphs, self-loops, type-only edges, shortest witnesses, depth/budget disclosure, ambiguous/unknown targets, unsupported questions, skipped evidence, stale files, offline restart, and process recovery. Assert every witness step exists in the snapshot. Validate measurement allowlists with hostile strings/payloads. Record installed-package checks on Windows, macOS, and Linux, not just compilation results.

## Manual acceptance check

A developer opens a real repository offline, finds a subsystem, follows a dependency trace, asks supported structural questions, inspects file impact and every witness, and recognizes analysis gaps. Repeat on all three platforms. Perform baseline/product pilot task trials and record provisional measurements without setting unsupported permanent performance claims.

## Completion criteria

**PILOT-READY MVP** only when the full local workflow, privacy/security checks, normal engineering checks, and all three installed-platform acceptance records pass. Laya/BYOK absence does not block completion. Stop before post-pilot features.
