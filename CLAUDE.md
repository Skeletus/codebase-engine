# Codebase Intelligence Desktop

A local-first desktop application for understanding real software codebases.

The application opens repositories directly from the user's local filesystem, analyzes them locally, builds an evidence-backed Code Knowledge Graph, and helps developers understand architecture, trace feature flows, inspect dependencies, estimate change impact, and navigate unfamiliar systems.

Source code, parsed structures, graph data, indexes, and Laya/System-1 processing stay on the user's machine by default.

The core product must remain useful without an internet connection.

External LLMs are optional and BYOK. They explain and synthesize evidence produced by the local intelligence engine; they are not the source of truth for repository structure.

Everything presented as a verified code relationship must be backed by deterministic analysis or explicitly identified runtime evidence.

Why architectural decisions exist belongs in `docs/project-doc.md`. This file contains the rules that should remain true across phases.

## Product Principles

The application follows five core principles:

1. Local-first.
2. Evidence before inference.
3. Deterministic structure before AI reasoning.
4. System-1 for navigation and decisions; LLM for explanation and synthesis.
5. The Codebase Intelligence Engine must not depend on the UI, cloud services, or a specific programming language.

The product is not a code reviewer.

Its primary purpose is software comprehension.

## Stack

Current frontend foundation:

- Next.js 16 App Router
- React 19
- TypeScript strict
- Tailwind CSS v4
- React Flow (`@xyflow/react`)
- dagre
- pnpm

Desktop target:

- Tauri 2
- Rust for native desktop capabilities and secure OS integration

Current TypeScript / JavaScript analysis:

- ts-morph

Local persistence target:

- SQLite

Authentication and commercial services:

- Clerk may be used for authentication, organizations, trial access, and licensing.
- Authentication must remain separate from repository analysis.
- No source code or Code Knowledge Graph data may be sent to Clerk.

AI:

- Laya / System-1 runs locally.
- External LLM usage is optional.
- External LLM integrations must support BYOK.
- Provider-specific code must live behind a provider abstraction.
- The architecture must not require OpenAI, Anthropic, Gemini, or any single provider to function.
- A repository must remain analyzable and navigable with all external LLM functionality disabled.

Removed from the product architecture:

- LangSmith is not required.
- CodeRabbit is not required.
- Supabase must not be used to store repositories, source code, parsed code, graph structures, or analysis results.

Do not add replacements for these services unless a phase specification explicitly requires one.

## Local-First Boundary

Treat the local/cloud boundary as a security boundary.

The following data is local by default:

- repository contents;
- source code;
- file paths associated with repository contents;
- AST data;
- symbols;
- dependency edges;
- Code Knowledge Graph data;
- parser output;
- analysis indexes;
- Laya inputs and outputs derived from source code;
- feature-flow reconstruction;
- change-impact analysis;
- local caches.

These must not be uploaded to our backend.

Cloud services may eventually receive non-source operational data such as:

- authentication;
- organization identity;
- license state;
- trial state;
- subscription state;
- application version;
- privacy-safe usage telemetry.

Telemetry must never contain source code, prompts containing source code, repository contents, graph contents, secrets, credentials, or raw file contents.

When uncertain whether information derived from a repository is safe to transmit, keep it local.

## External LLM Boundary

External LLM usage is optional.

The user must explicitly configure a provider and credentials.

The application should eventually support provider abstractions such as:

- OpenAI BYOK;
- Anthropic BYOK;
- Gemini BYOK;
- local models.

Do not hard-code product logic around one provider.

Before external LLM functionality sends repository-derived content outside the machine, the application architecture must make that boundary explicit.

The local engine remains the source of structural truth.

An LLM may:

- explain verified structure;
- summarize collected evidence;
- explain reconstructed flows;
- answer questions using evidence collected by the engine;
- translate technical structure into natural language.

An LLM may not:

- invent files;
- invent symbols;
- invent dependencies;
- invent calls;
- invent routes;
- invent database relationships;
- invent runtime flows;
- silently convert uncertainty into fact.

If evidence is incomplete, say that it is incomplete.

## Codebase Intelligence Engine

The core of the product is the Codebase Intelligence Engine.

Conceptually:

```text
Local Repository
      |
      v
Language Adapters
      |
      v
Unified Code Model
      |
      v
Code Knowledge Graph
      |
      +-------------------+
      |                   |
      v                   v
Graph Algorithms      Laya / System-1
      |                   |
      +---------+---------+
                |
                v
        Evidence Retrieval
                |
                v
     Codebase Intelligence
                |
       +--------+--------+
       |                 |
       v                 v
   Desktop UI        Optional LLM
```

The engine should support questions and operations such as:

- What depends on this file or symbol?
- What could be affected if this changes?
- How does this feature work?
- Trace this feature from its entry point through the system.
- What frontend code consumes this API?
- What code writes to this data store?
- What tests are structurally related to this change?
- What components participate in this feature?
- How does data move through this system?

Not every capability must exist immediately.

Build only what the current phase specification requires.

## Evidence Model

A relationship must carry enough information to explain why it exists.

Prefer structures conceptually equivalent to:

```text
source
target
relation
evidence
location
extractor
confidence/evidence-kind when necessary
```

Deterministically verified relationships should be distinguishable from inferred or runtime-observed relationships.

Examples of relationship types that may eventually exist:

- IMPORTS
- CALLS
- IMPLEMENTS
- INHERITS
- REFERENCES
- SENDS_REQUEST_TO
- HANDLES_ROUTE
- READS_FROM
- WRITES_TO
- EMITS
- CONSUMES
- UPLOADS_TO
- TESTS

Do not implement relationship types merely because they are listed here.

A phase specification decides which ones exist.

## Real Flow Reconstruction

A dependency graph and a feature flow are not the same thing.

A dependency graph answers structural questions such as:

```text
A imports B
B imports C
```

A feature flow attempts to reconstruct evidence-backed behavior such as:

```text
UI action
   ->
HTTP request
   ->
API endpoint
   ->
application service
   ->
database/storage
   ->
background worker
   ->
external service
   ->
persistence
   ->
UI result
```

"Real flow" means the best evidence-backed reconstruction available from deterministic analysis and, where explicitly supported, runtime evidence.

It does not mean guessing runtime behavior.

If part of a flow cannot be established, represent the gap instead of inventing the missing connection.

## Multi-Language Architecture

The engine must not be coupled to ts-morph.

ts-morph is the TypeScript/JavaScript adapter.

The intended architecture is:

```text
TypeScript / JavaScript
        |
    ts-morph adapter
        |
        +------------------+
                           |
Java ----------------> adapter
                           |
Kotlin --------------> adapter
                           |
C# ------------------> adapter
                           |
                           v
                  Unified Code Model
                           |
                           v
                 Code Knowledge Graph
```

Java, Kotlin, C#, and other language adapters are future capabilities unless the active phase explicitly requests them.

Do not build them ahead of their phase.

A language adapter translates language-specific analysis into shared engine contracts.

Language-specific framework knowledge must remain inside adapters or dedicated framework extractors.

The graph and intelligence layers must not contain checks such as:

```text
if language === "typescript"
```

unless a specification explicitly requires an unavoidable exception.

## Laya / System-1

Laya is a local System-1 decision component.

It does not replace deterministic parsing.

It operates over candidates that the engine has already established as possible entities, relationships, actions, or traversal options.

Potential responsibilities include:

- candidate relevance ranking;
- selecting useful graph traversal directions;
- next-node ranking;
- feature membership ranking;
- context selection;
- change-impact prioritization;
- test relevance ranking;
- stop/continue decisions during evidence collection.

Conceptually:

```text
Question
   |
Current Graph State
   |
Candidate Nodes / Actions
   |
   v
Laya
   |
relevance / decision scores
   |
   v
Deterministic Controller
   |
Graph Traversal
```

Laya must never manufacture a graph edge.

A high Laya score means "worth investigating", not "this relationship exists".

The parser and evidence layer determine whether relationships exist.

The architecture must allow the parser, graph, and baseline graph operations to function without Laya when necessary.

## System-1 + System-2

The intended intelligence architecture is hybrid.

```text
Parser / Extractors
        |
        v
Verified Evidence
        |
        v
Code Knowledge Graph
        |
        v
Laya / System-1
ranking, routing, selection
        |
        v
Evidence Package
        |
        v
Optional LLM / System-2
explanation, synthesis
```

Do not send an entire repository to an LLM simply because context size permits it.

Retrieve evidence intentionally.

The LLM should receive the smallest useful evidence package needed to answer the question.

## How We Work

Spec driven.

Nothing gets built without a spec.

- `docs/project-doc.md` — product architecture, goals, constraints, and decisions.
- `docs/specs/phase-NN.md` — one specification per implementation phase.
- This file — rules that remain true across phases.

Before implementing a phase, read this file and that phase's specification.

Build only what the specification asks for and stop.

If dropped into a fresh context and the current project state is unclear:

1. inspect `docs/specs/`;
2. inspect the git log;
3. inspect the current architecture where necessary;
4. determine the last completed phase;
5. explain the conclusion briefly before changing code.

Do not silently assume that the original Cartograph architecture is still correct.

This repository began as a Cartograph fork and is being transformed into a local-first Codebase Intelligence Desktop product.

## Migration Rule

Prefer controlled migration over unnecessary rewrites.

Existing Cartograph functionality may be reused when it respects the new architecture.

Do not rewrite working React, graph visualization, parser, or graph code merely because the product direction changed.

However, old architectural assumptions must not constrain the new product.

In particular, remove or replace dependencies on:

- public-GitHub-only repository ingestion;
- cloud storage of repository analysis;
- Supabase persistence for source-derived information;
- OpenAI as a mandatory provider;
- LangSmith as mandatory observability;
- browser-only operation.

Migrate these responsibilities phase by phase.

## Acceptance

The phase specification defines acceptance.

Before saying a phase is complete, run everything that can reasonably be verified from the terminal, including as applicable:

- TypeScript type checking;
- lint;
- build;
- unit tests;
- parser scripts;
- engine tests;
- Rust checks;
- Tauri checks.

Do not weaken a check to make it pass.

If something cannot be verified, say so.

If something failed, say so.

Do not silently work around failures.

Manual UI acceptance may remain manual when the phase specification says so.

## How to Talk to Me

Be concise.

Ask specific questions with a recommended answer attached.

Example:

> A or B? I recommend B because it keeps the parser independent from the desktop shell.

Do not silently choose between materially different architectural directions.

When something is required from me — an API key, credential, environment variable, external account, or product decision — state exactly what is required and where, then stop.

Do not produce walls of text when a short status is enough.

When a phase is complete, explain:

- what now works;
- what was verified;
- anything that could not be verified.

Do not list every file touched unless requested.

## Code Architecture Rules

The parsing code cannot import:

- Next.js;
- React;
- Clerk;
- database clients;
- Tauri UI code;
- external LLM clients.

Parser contract:

```text
repository/files in
        ->
structured analysis out
```

It must remain runnable independently of the UI.

Graph calculations must be pure functions over structured graph data whenever practical.

The Codebase Intelligence Engine must not depend on React or Next.js.

The UI consumes the engine.

The engine does not consume the UI.

Language-specific parsing belongs behind adapter contracts.

Framework-specific interpretation belongs in adapters or framework extractors.

Local persistence must be accessed through a storage boundary rather than scattered throughout analysis logic.

External LLM providers must be accessed through one provider abstraction.

Authentication/licensing must remain separate from repository intelligence.

## TypeScript Conventions

Use strict TypeScript.

No `any`.

If a type is genuinely difficult, explain the problem instead of bypassing the type system with unsafe casts.

Comment decisions and non-obvious invariants, not syntax.

Prefer one obvious implementation over unnecessary configurability.

## UI Principles

This is a dense developer tool intended for extended use.

Prefer:

- compact typography;
- tight but readable spacing;
- monospace for paths and code identifiers;
- information-dense panels;
- stable layouts;
- meaningful color;
- explicit interaction;
- minimal decorative motion.

The primary UI should make architecture understandable, not merely visually impressive.

Graph visualization is one representation of intelligence, not the intelligence engine itself.

Future views may include:

- dependency graph;
- feature flow;
- data flow;
- blast radius;
- change impact;
- related tests;
- evidence inspector.

Do not implement them before their phase.

## Privacy Rules

Breaking these rules is a product-level failure.

- Never upload a repository to our backend.
- Never upload local source code to our backend.
- Never upload the local Code Knowledge Graph to our backend.
- Never include source code in telemetry.
- Never include secrets or credentials in telemetry.
- Never silently send repository-derived context to an external LLM.
- Never require an external LLM for basic repository analysis.
- Never require internet access for parser + graph + local intelligence functionality.
- Never log BYOK credentials.
- Never store BYOK credentials in plaintext when secure OS-backed storage is available.

## Structural Integrity Rules

Never decide that two code entities are connected merely because they look semantically related.

A verified relationship requires evidence.

Unresolved relationships must remain unresolved and include a reason when practical.

Skipped files must be reported rather than silently ignored.

Unsupported syntax must be reported rather than approximated.

If a route, call, symbol, database operation, or cross-system connection cannot be established with available evidence, do not fabricate it.

Semantic similarity can identify something worth investigating.

It cannot create structural truth.

## Things Not to Do

Breaking one of these is worse than not finishing.

- Do not invent graph edges.
- Do not invent files, symbols, routes, calls, or dependencies.
- Do not upload repository data to our backend.
- Do not make external LLMs mandatory.
- Do not couple the engine to one AI provider.
- Do not couple the engine to ts-morph.
- Do not put language-specific logic into generic graph algorithms.
- Do not install a package without asking first. Name it, explain why it is needed, and wait.
- Do not build ahead of the current phase.
- Do not turn the product into a code-quality grader unless the product specification explicitly changes.
- Do not add scores such as "code quality", "severity", or arbitrary architecture ratings.
- Do not weaken tests or checks to make them pass.
- Do not hide failures.
- Do not rewrite working subsystems without an architectural reason.
- Do not transmit data merely because doing so is convenient.

## Source of Truth

The priority order for implementation decisions is:

1. active phase specification;
2. this file;
3. `docs/project-doc.md`;
4. existing implementation.

If existing Cartograph code conflicts with the new architecture, the new architecture wins.

If an active phase specification conflicts with a permanent privacy or structural-integrity rule in this file, stop and report the conflict before implementing it.