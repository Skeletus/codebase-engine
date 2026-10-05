# Codebase Intelligence Desktop roadmap

## Starting state and authority

The checkout at roadmap creation is the **Original Cartograph Baseline** (HEAD `2c2a7c2`). No new-product phase is complete merely because historical Cartograph commits carry phase numbers. These specifications are newly authored replacements, not restored historical requirements. Historical phase-09 and phase-10 deletions remain intentional.

Read `../../CLAUDE.md`, `../project-doc.md`, and the active phase before implementation. Permanent privacy and structural-integrity rules take precedence over a phase; current product architecture takes precedence over baseline behavior and historical decisions. Implement one phase, verify it, and stop. This roadmap does not authorize package installation, remote migrations, deployment, commits, or source implementation during its creation.

## Architectural audit

The audit below describes the Original Cartograph Baseline, not the current
implementation. The user has accepted Phases 01–03. See
[Phase 03 desktop verification and manual acceptance](../phase-03-desktop.md)
for durable local analysis; its manual acceptance is separate from automated
verification. Historical migrations remain evidence, not active cloud setup.
Phase 04 delivery/verification and its outstanding installed-platform and pilot
gates are tracked in [the pilot guide](../phase-04-pilot.md). The user accepted
Phase 04 implementation and Windows manual acceptance and explicitly authorized
Phase 05 while macOS/Linux qualification and formal pilot trials remain open.
Phase 05 now includes user-authorized OpenAI/Groq BYOK provider support.
Phase 05 boundaries and acceptance are tracked in [the BYOK guide](../phase-05-byok.md).
The user accepted Phase 05 manual acceptance on Windows and authorized Phase 06.
Phase 06 delivery and pending manual acceptance are tracked in
[the static trace guide](../phase-06-traces.md). This does not close the outstanding
macOS/Linux qualification or formal pilot trials.
No pilot-ready
qualification is implied until every Phase 04 completion criterion passes.

The repository is one pnpm application, not a developed package monorepo. Nested package.json files mainly establish ESM for standalone TypeScript scripts. Next.js 16 App Router, React 19, strict TypeScript, Tailwind v4, React Flow, and dagre provide the UI. No Tauri or SQLite implementation exists.

The parser already accepts arbitrary local directories through `parseRepository(directory)`. Selection and parsing are separate stages. It uses ts-morph for syntax, TypeScript module resolution for imports, and a versioned runtime-validated output contract (currently v4). It extracts ESM/CommonJS imports and exports, file hashes, roles, routes, and detailed skip/unresolved coverage. Framework adapters are TS/JS AST consumers, not language adapters. Next.js and NestJS route declarations are supported conservatively; Express route extraction is withheld. There are no resolved symbol calls, request-to-route edges, or general execution flows.

Graph algorithms are already pure: distinct-file fan counts, bidirectional BFS reachability, iterative Tarjan SCCs, shortest cycle witnesses, neighborhood aggregation, directory folding, unique labels, view projection, and highlighting. Reachability includes type-only edges; cycle detection excludes them. The canvas uses folded directory groups and bounded row windows, with deterministic dagre layout. It is a reusable projection, not the canonical intelligence model.

Cloud coupling surrounds this reusable core. Submission requires public GitHub identifiers; the pipeline resolves HEAD, downloads an archive, parses a temporary directory, and writes Supabase rows. Next server actions use Clerk authorization and `after()` orchestration. Supabase stores analyses/files/edges/routes/roles/caches and broadcasts progress. Stored-analysis reconstruction validates output but drops config diagnostics. Writes use an admin client; member reads use Clerk-token organization RLS. The local target must not inherit cloud row identity or organization authorization as graph contracts.

The UI cannot simply be statically exported as it stands: auth middleware, server-rendered queries, runtime analysis routes, server actions, cookies, Clerk providers, and mandatory cloud environment checks require adaptation. Google font acquisition and runtime asset availability also require an offline audit. No application API route handlers were found; route extraction in the parser describes analyzed repositories, not this app's API architecture.

AI tasks explain files/folders and optionally classify roles. Source is fetched from GitHub at the analyzed commit and checked against its hash. Caches are keyed by task, pinned model, prompt version, and input; model labels remain separate from convention facts. LangSmith wraps tasks/client calls. Current prompts overclaim completeness of import evidence. No chat/agent implementation exists in this checkout; `AGENT_URL` is an unused example. Historical branches are evidence, not deliverables.

No tracked CodeRabbit configuration, automated test suite, or GitHub Actions workflow was found. Parser, map-counts, and insights scripts provide useful partial checks. Dependencies were absent during the audit, so installed Next guides, typecheck, lint, and build could not be verified. Packages were not installed. Deployment currently assumes a Node Next server, filesystem/temp-directory access, cloud credentials, and network services; platform packaging is new work.

Security gaps to address include unrestricted TypeScript filesystem/config reads despite walker exclusions, unreadable directory handling, resource bounds, and convention-based classifications that must not be promoted into behavioral proof. Normal indexing must never execute repository configuration or code.

## Reuse and migration classification

| Subsystem | Classification | Outcome |
| --- | --- | --- |
| React, Tailwind, dense panels, themes | KEEP WITH MINOR CHANGES | Reuse interactions; adapt navigation/settings for desktop. |
| Next.js | ADAPT | Static frontend; retire server responsibilities after replacement. |
| React Flow and dagre | KEEP | Preserve visualization/layout independent of truth. |
| ts-morph | KEEP WITH MINOR CHANGES | TS/JS adapter; improve safety and diagnostics. |
| Parser contract and framework adapters | ADAPT | Preserve validation/extractors behind language-neutral contracts. |
| File graph and analysis/context assembly | ADAPT | Add provenance and replace database-bound loaders. |
| Graph arithmetic, folding, coverage | KEEP | Preserve semantics and strengthen verification. |
| Descriptive insights | KEEP WITH MINOR CHANGES | No quality grades or inferred execution claims. |
| GitHub ingestion/source/freshness | REPLACE | Selected local roots and hash-checked local evidence. |
| Pipeline and server actions | ADAPT / REPLACE transport | Local jobs/events and typed desktop operations. |
| Supabase repository persistence | REPLACE | SQLite behind local storage boundary. |
| Clerk | ADAPT; desktop commercial integration DEFER | Retain identity choice, outside intelligence. |
| OpenAI SDK and explanation UX | ADAPT | Optional direct BYOK provider and grounded explanation. |
| AI classification | DEFER | Descriptive labels are unnecessary for pilot. |
| AI caches | ADAPT | Local, provider/evidence-aware invalidation. |
| LangSmith | REMOVE | Phase 01; no replacement observability SaaS. |
| CodeRabbit | REMOVE if encountered | Development tooling, not product architecture. |
| Chat/agent | DEFER | No reusable implementation present. |
| Verification scripts | KEEP WITH MINOR CHANGES | Extend with meaningful boundary tests. |

## Ordered roadmap

### MVP phases

| Phase | Purpose | Prerequisite |
| --- | --- | --- |
| [01 — Protected local engine boundary](phase-01.md) | Isolate deterministic analysis and secure local reads without rewriting the parser/UI. | Baseline |
| [02 — Desktop local repository exploration](phase-02.md) | Deliver static UI plus packaged Node engine in Tauri. | 01 |
| [03 — Durable local analysis](phase-03.md) | Reopen atomic SQLite snapshots and retire repository cloud persistence. | 02 |
| [04 — Deterministic investigations and PILOT-READY MVP](phase-04.md) | Deliver trace/impact/structural Ask workflows and accept three-platform pilot packages. | 03 |

**PILOT-READY MVP is achieved by Phase 04**, not by a desktop window alone. Windows, macOS, and Linux acceptance is required. The pilot has dependency traces, not recovered end-to-end execution flows; it needs neither Laya nor external AI.

### Post-pilot phases

| Phase | Purpose | Prerequisite |
| --- | --- | --- |
| [05 — Optional direct BYOK explanations](phase-05.md) | Restore generative explanations with explicit direct-provider consent. | 04 |
| [06 — Evidence-backed symbol and behavioral traces](phase-06.md) | Add resolved symbol relationships and conservative handler call traces. | 04; 05 optional |
| [07 — Incremental local refresh](phase-07.md) | Reduce refresh cost while retaining full-analysis equivalence. | 03, 06; integrate 05 caches when present |
| [08 — Local ranking boundary and Laya evaluation readiness](phase-08.md) | Establish bounded next-node ranking contracts and local evaluation without a model assumption. | 04, 06; 07 optional |

The ordering is a delivery recommendation; explicit prerequisites govern independent post-pilot work. Each phase is complete only when its checks pass, with no deliberately broken build left for a successor.

## Boundaries and persistence decisions

The user selected static React/Next assets plus a packaged Node sidecar and three desktop platforms. Tauri owns native selection, process supervision, scoped commands, and secure credential access. The TypeScript engine owns adapters, normalized evidence, graphs, algorithms, retrieval, and storage orchestration. Private versioned process pipes avoid a loopback intelligence server. End users need no installed Node or repository dependencies.

SQLite persists registrations, complete versioned snapshots, hashes, evidence, full coverage/config diagnostics, settings, and job outcomes. ASTs, adjacency indexes, layout, transient traversals, and hover/selection remain in memory. Source files remain in their repositories; hash checks prevent mixing stale graphs with current source. No premature vectors or source archives.

The first behavioral capability is a dependency witness path; the first richer flow is a bounded resolved static call trace from a supported handler. The first impact capability is reverse reachability with evidence witnesses and coverage limits. Laya's first prospective problem is ordering verified next-node candidates under an investigation budget, evaluated against deterministic traversal and human relevance judgments. It cannot create edges or replace exhaustive structural impact.

Reversible choices include UI projections, layout, provider implementation, and ranking strategy. Expensive lock-in includes ASTs in shared contracts, cloud row IDs as entity identities, scattered database calls, inference presented as verification, and licensing coupled to analysis.

## Verification and deferred decisions

Every phase requires typecheck, lint, build, and relevant automated/script checks; desktop phases also require Rust and packaged-platform checks. Missing tooling or credentials must be reported, never treated as success. Read the installed version-specific Next.js guides before editing Next code; the [Tauri Next guide](https://v2.tauri.app/start/frontend/nextjs/) targets an older Next version. Consult [sidecar packaging](https://v2.tauri.app/develop/sidecar/) for platform requirements.

No further user decision is required to execute this roadmap's specifications. Package additions require separate approval under CLAUDE.md. Future work requiring a new specification includes commercial/offline licensing policy and Clerk desktop authentication, release signing credentials, additional languages/providers/framework flows, consented Laya dataset generation/training/export/inference packaging, and optional remote telemetry. These are not prerequisites for the deterministic pilot and are not silently assigned implementation scope here.
