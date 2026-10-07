# Codebase Intelligence Desktop

The product decisions behind this build, with the reasoning attached.

This project began as a fork of Cartograph, but it is no longer a public-repository dependency mapper.

It is becoming a local-first Codebase Intelligence Engine and desktop developer tool.

The reasoning in this document matters more than individual implementation choices. Technologies can change. The product principles should not change accidentally with them.

Read the relevant section before making architectural changes.

---

## What it is

A developer opens a repository that already exists on their machine.

The application analyzes that repository locally and constructs an evidence-backed representation of its structure.

At the simplest level, this includes files and dependencies.

Over time, the representation becomes richer:

```text id="ubv4nc"
Repository
    |
    v
Files
    |
    v
Symbols
    |
    v
Imports / References / Calls
    |
    v
Routes / Services / Data Access
    |
    v
Cross-layer relationships
    |
    v
Code Knowledge Graph
```

The developer can then use that structure to answer questions such as:

- What depends on this?
- What could be affected if I change this?
- How does this feature work?
- Where does this request go?
- What frontend code consumes this endpoint?
- What writes this data?
- Which tests are related to this change?
- How does data move through this feature?
- Where should I start reading this unfamiliar subsystem?

The application should not merely draw a map.

It should help reconstruct how a software system works.

The graph is one interface into the intelligence engine, not the product itself.

---

## The problem

Modern software systems are becoming easier to produce and harder to understand.

Developers increasingly work with:

- code written by other teams;
- legacy systems;
- unfamiliar repositories;
- AI-generated code;
- code generated across many agent sessions;
- frontend and backend systems developed independently;
- multiple services and frameworks;
- systems whose original developers are no longer available.

The bottleneck is often no longer writing code.

It is building an accurate mental model of existing code before changing it.

A developer investigating an unfamiliar feature may repeatedly:

1. search for a component;
2. inspect its imports;
3. find an API call;
4. search for the endpoint;
5. locate the service;
6. inspect interfaces and implementations;
7. locate persistence;
8. inspect related background processing;
9. search for tests;
10. hold all of those relationships in working memory.

The tools already exist to inspect each individual piece.

The missing layer is the system that reconstructs and navigates the relationships between those pieces.

---

## The product bet

Dependency visualization alone is not enough.

A developer does not normally wake up wanting to look at a dependency graph.

They have a question:

> How does this feature work?

or:

> What will I affect if I change this?

or:

> Where does this value eventually get stored?

or:

> Which parts of this unfamiliar system should I inspect?

The graph exists to help answer those questions.

The product succeeds if it reduces the amount of time developers spend reconstructing software architecture manually.

The primary value proposition is therefore not:

> See your codebase as a graph.

It is:

> Understand an unfamiliar codebase faster, using evidence from the code itself.

---

## Who it is for

Initially:

- software developers joining or entering unfamiliar projects;
- small software teams;
- software consultancies maintaining multiple client projects;
- developers working across frontend and backend repositories;
- teams using AI coding agents heavily;
- developers performing change-impact investigation;
- developers onboarding into existing systems.

The first real pilot is expected to involve developers working on real software projects.

The product should therefore optimize for actual engineering work rather than impressive demonstrations.

---

## The core rule

**Structural truth comes from evidence, not from an LLM.**

A relationship presented as verified must be supported by deterministic analysis or explicitly identified runtime evidence.

For example:

```text id="75u6dj"
A imports B
```

requires import-resolution evidence.

```text id="m6h0sz"
Component sends request to endpoint
```

requires recoverable request and route evidence.

```text id="scwtby"
Service writes entity to database
```

requires recoverable data-access evidence.

Semantic similarity is not enough.

An LLM saying two things are related is not enough.

Laya ranking one candidate highly is not enough.

The system must distinguish:

```text id="4xg1mz"
VERIFIED
INFERRED
RUNTIME-OBSERVED
UNRESOLVED
```

where those distinctions become necessary.

Verified structure must never silently become inferred structure.

---

## Why evidence matters

A dependency graph that is confidently wrong is more dangerous than no dependency graph.

The same applies to feature flows and change-impact analysis.

If the product tells a developer:

```text id="nb5u8y"
Change A
  affects
B, C and D
```

the developer must be able to inspect why those relationships exist.

The long-term product advantage should therefore be:

```text id="p4gbdy"
Answer
  +
Evidence
  +
Traceable reasoning path
```

rather than:

```text id="spkm0i"
LLM answer
```

The user should be able to move from a high-level explanation back to the source evidence.

---

## Local-first

Repository intelligence is local by default.

The user opens a repository already present on the machine.

Conceptually:

```text id="9s83lh"
Open Local Codebase

        |
        v

C:\Projects\ClientProject

        |
        v

Local analysis

        |
        v

Local Code Knowledge Graph
```

The application does not require uploading the repository to our infrastructure.

The following stay local:

- repository contents;
- source code;
- AST structures;
- symbols;
- dependency information;
- graph nodes;
- graph edges;
- indexes;
- parser output;
- feature-flow analysis;
- change-impact analysis;
- Laya inputs derived from code;
- Laya outputs derived from code;
- local caches.

The parser, graph, and core local intelligence capabilities must work without an internet connection.

This is both an architectural decision and a product promise.

---

## Why desktop

A local-first code intelligence product needs reliable access to local repositories.

A desktop application provides:

- filesystem access;
- local repository selection;
- incremental file watching;
- local indexing;
- local persistence;
- native credential storage;
- Git integration;
- offline operation;
- a clear privacy boundary.

The intended desktop architecture is Tauri.

The existing React/Next.js interface should be reused during migration where practical.

Tauri is the desktop shell and native boundary.

It is not the intelligence engine.

Conceptually:

```text id="z5h42q"
┌─────────────────────────────────────┐
│           Desktop Application       │
│                                     │
│  React / Next.js UI                 │
│  React Flow                         │
│              |                      │
│              v                      │
│     Codebase Intelligence Engine    │
│              |                      │
│      Local Repository               │
│      Local Storage                  │
│      Laya                           │
│                                     │
└─────────────────────────────────────┘
```

The engine must remain independent from the desktop shell.

---

## Current UI foundation

The existing Cartograph frontend provides a useful starting point:

- Next.js 16;
- React 19;
- TypeScript;
- Tailwind CSS v4;
- React Flow;
- dagre.

We should reuse working UI and visualization code where it fits the new product.

The objective is not to rewrite Cartograph for the sake of rewriting it.

The objective is to replace the assumptions that no longer fit.

In particular, the product must migrate away from assumptions such as:

```text id="qq2fmo"
public GitHub repository
        ->
server-side ingestion
        ->
cloud persistence
        ->
web-only application
```

toward:

```text id="xnj5d3"
local repository
        ->
local analysis
        ->
local persistence
        ->
desktop application
```

This migration should happen phase by phase.

---

## The parser

The parser remains standalone.

At its boundary:

```text id="k4j7dx"
repository / files in
        ->
structured analysis out
```

It must not depend on:

- React;
- Next.js;
- Clerk;
- Tauri UI code;
- cloud databases;
- LLM providers.

The parser discovers facts.

It does not explain them.

It does not make product decisions.

It does not guess missing relationships.

If analysis cannot resolve something, it reports that failure.

---

## Multi-language architecture

The original Cartograph parser focuses on TypeScript and JavaScript through `ts-morph`.

That implementation remains valuable.

But `ts-morph` is now one language adapter rather than the definition of the engine.

Conceptually:

```text id="hpktd4"
               Language Adapter Contract
                         |
       +-----------------+-----------------+
       |                 |                 |
       v                 v                 v
 TypeScript/JS          Java             Kotlin
    ts-morph           adapter           adapter
       |                 |                 |
       +-----------------+-----------------+
                         |
                         v
                Unified Code Model
                         |
                         v
               Code Knowledge Graph
```

Additional adapters may later include:

```text id="7bnpgs"
C#
Python
Go
other languages
```

They are not required until a phase explicitly introduces them.

Language-specific behavior belongs in adapters.

Framework-specific behavior belongs in framework extractors or adapters.

The generic graph layer should not need to know whether a node originated from TypeScript, Java, Kotlin, C#, or another language.

---

## Framework knowledge

Programming-language syntax alone is not enough to understand modern applications.

Frameworks encode relationships through conventions.

Examples include:

- Next.js routing;
- React components;
- ASP.NET controllers;
- dependency injection;
- Entity Framework;
- Spring controllers;
- Android architecture components;
- HTTP clients;
- ORM mappings;
- background workers.

This knowledge should be implemented through dedicated extractors/adapters rather than contaminating the generic parser.

Conceptually:

```text id="dw9j8h"
Language Parser
      |
      v
Language Facts
      |
      +--------------------+
      |                    |
      v                    v
Framework Extractors   Generic Analysis
      |                    |
      +---------+----------+
                |
                v
        Unified Evidence
```

The system should know where each fact came from.

---

## Unified Code Model

Different languages and frameworks must eventually produce a common representation.

The Unified Code Model is the boundary between language-specific analysis and generic codebase intelligence.

Potential entity types include:

```text id="3zhbmn"
Repository
File
Folder
Module
Class
Interface
Function
Method
API Endpoint
UI Screen
Component
Database Entity
Database Table
Worker
External Service
Test
```

Potential relationships include:

```text id="ez73w2"
IMPORTS
REFERENCES
CALLS
IMPLEMENTS
INHERITS
SENDS_REQUEST_TO
HANDLES_ROUTE
READS_FROM
WRITES_TO
EMITS
CONSUMES
UPLOADS_TO
TESTS
```

This list is architectural direction, not an instruction to implement every entity and edge immediately.

Each phase defines the subset it needs.

---

## Evidence-backed edges

Every edge should eventually be explainable.

A useful conceptual representation is:

```text id="8jttkr"
{
  source,
  target,
  relation,
  evidence,
  location,
  extractor,
  evidenceKind
}
```

For example:

```text id="x0eg8w"
source:
  MyVisitPage

target:
  POST /api/visits

relation:
  SENDS_REQUEST_TO

evidence:
  fetch("/api/visits", { method: "POST" })

location:
  app/my-visit/page.tsx

extractor:
  nextjs-http

evidenceKind:
  verified
```

The exact schema should be defined by the phase that introduces richer relationships.

The principle is permanent:

**A relationship should be inspectable back to its evidence.**

---

## Code Knowledge Graph

The Code Knowledge Graph is the structured representation used by the intelligence engine.

It is richer than the original dependency map.

The original map approximately represents:

```text id="vpqg43"
File
 |
 IMPORTS
 |
File
```

The long-term graph may represent:

```text id="pxyrtw"
UI Component
      |
SENDS_REQUEST_TO
      |
API Endpoint
      |
HANDLED_BY
      |
Service
      |
WRITES_TO
      |
Database Entity
```

and:

```text id="lzdj0m"
Service
   |
CALLS
   |
External Service
```

and:

```text id="q51l4a"
Test
 |
TESTS
 |
Service
```

The graph must remain evidence-backed.

The graph is stored locally.

---

## Graph algorithms

Graph calculations should remain pure whenever practical.

Operations such as:

- fan-in;
- fan-out;
- reachability;
- dependency chains;
- blast radius;
- neighborhood expansion;

should operate over structured graph data without requiring:

- network access;
- database calls;
- LLM calls;
- UI state.

If deterministic graph arithmetic can answer a question exactly, use it.

Do not ask Laya or an LLM to approximate something an algorithm can calculate.

---

## Dependency graph versus feature flow

A dependency graph answers:

```text id="3c2dru"
What is structurally connected?
```

A feature flow answers:

```text id="i7em6v"
How does this behavior appear to move through the system?
```

These are different products of the same evidence.

For example:

```text id="uqpf9m"
User presses "End Visit"
        |
        v
Frontend handler
        |
        v
HTTP request
        |
        v
Backend endpoint
        |
        v
Application service
        |
        v
Storage / worker
        |
        v
External processing
        |
        v
Persistence
        |
        v
UI result
```

This is not produced by asking an LLM to imagine the architecture.

It is reconstructed from evidence collected across the codebase.

---

## Real flow reconstruction

"Real flow" means an evidence-backed reconstruction of software behavior.

It does not mean perfect static recovery of every runtime path.

Software can contain:

- reflection;
- dependency injection;
- runtime dispatch;
- queues;
- event buses;
- configuration-driven behavior;
- generated code;
- external systems.

Static analysis may not resolve all of these perfectly.

Therefore the engine must represent uncertainty rather than hide it.

A flow may contain:

```text id="7o4ruy"
VERIFIED STEP
      |
VERIFIED STEP
      |
UNRESOLVED BOUNDARY
      |
VERIFIED STEP
```

An unresolved boundary is preferable to an invented connection.

Future runtime evidence may strengthen static evidence.

For example:

```text id="v7vrr6"
static-analysis
runtime-trace
test-observation
```

may eventually coexist as evidence sources.

Runtime tracing is not required for the initial MVP.

---

## Laya / System-1

Laya is a local decision model used by the intelligence engine.

It does not replace parsing.

It does not create structural truth.

Its purpose is to make decisions over candidates already available to the system.

Suppose the current graph state exposes:

```text id="1yg3mi"
A -> B
A -> C
A -> D
A -> E
```

and the user asks:

> How does authentication work?

The engine may ask Laya to rank:

```text id="s1b3ap"
B
C
D
E
```

by relevance to the current investigation.

Laya can therefore assist with:

- next-node ranking;
- traversal direction;
- candidate relevance;
- context selection;
- feature membership;
- change-impact prioritization;
- related-test prioritization;
- stop/continue decisions.

Conceptually:

```text id="2tdoae"
Question
    |
    v
Current Graph State
    |
    v
Candidate Nodes / Actions
    |
    v
Laya
    |
    v
Scores / Decision
    |
    v
Deterministic Controller
```

The controller validates and executes operations against the actual graph.

Laya never creates an edge because it believes one should exist.

---

## Why Laya is local

The parser, graph, and System-1 intelligence should continue working without internet access.

This provides:

- privacy;
- predictable latency;
- lower operating cost;
- independence from LLM providers;
- offline functionality;
- a clear distinction between structural intelligence and generative explanation.

Laya should eventually be packaged for local inference.

The exact inference technology and model packaging belong to the phase that implements it.

Do not choose them prematurely.

---

## LLM / System-2

An LLM is useful for tasks that are naturally generative.

Examples:

- explaining a reconstructed feature flow;
- summarizing architecture;
- answering a natural-language question from retrieved evidence;
- turning graph structure into understandable prose;
- comparing multiple evidence paths;
- explaining why a change may affect several components.

The LLM receives evidence.

It does not define the evidence.

Conceptually:

```text id="73t9iy"
User Question
      |
      v
Local Intelligence Engine
      |
      v
Evidence Package
      |
      v
Optional LLM
      |
      v
Natural-language explanation
```

The product must still provide structural functionality when the LLM is disabled.

---

## BYOK

External AI uses Bring Your Own Key.

The user chooses and configures the provider.

The architecture should support provider abstraction rather than binding product logic to OpenAI.

Potential providers include:

```text id="st1w48"
OpenAI
Anthropic
Gemini
Local model
```

Not all providers must be implemented immediately.

The active phase decides which provider integrations exist.

Provider credentials must never be logged.

Where supported by the operating system, secrets should use secure native credential storage rather than plaintext files.

---

## External AI privacy

BYOK does not mean repository data automatically becomes safe to transmit.

Before external AI receives repository-derived content, the product must know what is being sent.

The intended model is:

```text id="wz1c5q"
Local repository
       |
Local Intelligence Engine
       |
Selected Evidence
       |
       +---- external LLM only when enabled
```

Do not send an entire repository merely because a provider accepts large context windows.

Retrieve intentionally.

Send the smallest useful evidence package.

A future privacy interface may expose:

- provider being used;
- files involved;
- context being sent;
- ability to inspect the payload;
- ability to disable external AI entirely.

---

## Authentication

Authentication is separate from code analysis.

Clerk may remain the initial identity provider because the existing application already integrates it and it can support:

- users;
- organizations;
- authentication;
- commercial account identity.

But Clerk does not participate in repository intelligence.

Conceptually:

```text id="4km7uo"
Clerk
  |
identity
  |
  v
Desktop Application

Repository
  |
  v
Local Intelligence Engine
```

There should be no path:

```text id="8s2sdw"
Repository -> Clerk
```

Authentication should eventually support the commercial product without compromising local-first analysis.

---

## Licensing and trial

The desktop application may communicate with our backend for commercial state.

Examples:

```text id="h0p3fn"
user
organization
plan
trialStart
trialEnd
licenseStatus
seatCount
appVersion
```

The licensing service does not need repository contents.

A typical startup flow may eventually be:

```text id="g9xuyv"
Desktop App
    |
    v
Authenticate
    |
    v
Validate License / Trial
    |
    v
Open Local Codebase
```

Loss of network connectivity should not corrupt or destroy local analysis.

The exact offline licensing policy belongs to a later commercial phase.

---

## Local persistence

Source-derived information should be stored locally.

The target persistence technology is SQLite unless implementation evidence gives us a reason to change it.

Potential local data includes:

```text id="kfsktw"
repositories
files
symbols
nodes
edges
evidence
analysis state
coverage
local caches
settings
```

The graph abstraction must not be designed around Supabase.

Supabase may remain temporarily during migration only where old Cartograph functionality still depends on it.

It is not the target repository-intelligence storage layer.

---

## Supabase

The original Cartograph architecture stores analyses in Supabase/Postgres and associates them with organizations.

That does not fit the new privacy model for source-derived intelligence.

Therefore Supabase should be removed from the repository-analysis path.

Do not perform a destructive rewrite merely to remove it immediately.

Remove dependencies phase by phase as local persistence replaces them.

Supabase must not become the destination for:

- source files;
- parsed code;
- graph nodes;
- graph edges;
- evidence;
- feature flows;
- Laya context;
- repository-derived prompts.

---

## LangSmith

LangSmith is not required by the new product architecture.

The original project uses it for LLM tracing and evaluation.

The local-first product should not depend on a third-party observability SaaS to function.

Remove LangSmith during the appropriate migration phase.

If AI observability becomes necessary later, evaluate a privacy-compatible solution at that time.

Do not replace LangSmith preemptively.

---

## CodeRabbit

CodeRabbit is development tooling, not part of the product runtime.

It is not required.

The repository should rely on normal engineering checks such as:

```text id="q5st9u"
TypeScript
ESLint
build
tests
GitHub Actions when needed
```

AI-assisted code review may still be used by developers independently.

It is not an architectural dependency.

---

## Telemetry

Product telemetry may eventually help determine whether the tool creates value.

Examples of privacy-safe events:

```text id="a56e7v"
feature_flow_started
feature_flow_completed
impact_analysis_started
impact_analysis_completed
graph_opened
answer_feedback
duration_ms
application_version
```

Telemetry must not contain:

- source code;
- raw prompts containing code;
- graph contents;
- repository contents;
- secrets;
- credentials;
- API keys.

Telemetry should measure product usage, not inspect customer code.

When uncertain, keep the data local.

---

## Coverage

Coverage remains important.

A clean-looking graph is dangerous when half the repository failed to parse.

The system should be explicit about:

- files discovered;
- files analyzed;
- files skipped;
- unsupported files;
- unresolved imports;
- unresolved relationships;
- parser failures.

The user should be able to distinguish:

```text id="frvkuw"
Nothing connects here.
```

from:

```text id="rrvh3p"
We could not analyze this.
```

Those are fundamentally different statements.

---

## Change impact

Change impact is one of the core product capabilities.

The simplest version uses deterministic reachability:

```text id="dnyfue"
Changed Node
      |
      v
Incoming Dependencies
      |
      v
Transitive Dependents
```

Richer analysis may eventually combine:

```text id="u4eq31"
verified graph relationships
+
symbol relationships
+
framework relationships
+
Laya relevance ranking
+
runtime evidence
```

The system should distinguish:

```text id="6brjv3"
structurally affected
```

from:

```text id="3mg26c"
likely relevant
```

The first can come from deterministic graph analysis.

The second may involve ranking.

Do not collapse the two into one confidence claim.

---

## Related tests

A developer changing code frequently needs to know which tests matter.

Where relationships can be established structurally:

```text id="txdd4o"
Test
 |
TESTS
 |
Code Entity
```

they belong in the graph.

Laya may later rank relevant tests when many candidates exist.

An LLM should not invent tests that cannot be found in the repository.

---

## Ask Codebase

Natural-language codebase questions should use the intelligence engine.

The intended flow is:

```text id="t0a5vq"
Question
   |
   v
Intent / Investigation Goal
   |
   v
Candidate Entry Points
   |
   v
Graph + Search + Laya
   |
   v
Evidence Collection
   |
   v
Evidence Package
   |
   v
Optional LLM
   |
   v
Answer + Evidence
```

The answer should expose what evidence was used.

An answer that cannot identify supporting evidence should not present structural claims as facts.

---

## Intelligence without an LLM

The product must remain useful when:

```text id="g0e5oz"
Internet = unavailable
LLM provider = none
API key = none
```

The user should still be able to use capabilities such as:

- open repository;
- parse repository;
- inspect graph;
- inspect dependencies;
- calculate blast radius;
- inspect evidence;
- navigate structural relationships;
- use locally implemented Laya capabilities;
- run deterministic intelligence operations.

Natural-language generation may degrade or become unavailable.

Codebase intelligence must not disappear.

---

## The interface

The application is a dense developer tool, not a marketing dashboard.

A developer may keep it open for long periods.

Use:

- compact typography;
- tight but readable spacing;
- monospace for paths and symbols;
- stable panel layouts;
- meaningful color;
- minimal decorative animation;
- information-dense views.

Colour should communicate meaning.

Examples include:

- selected entities;
- incoming relationships;
- outgoing relationships;
- entity types;
- evidence types;
- unresolved boundaries.

Avoid decoration that competes with code structure.

---

## Graph visualization

The graph should remain interactive and useful.

The existing React Flow implementation is a valuable asset from Cartograph.

Users should be able to:

- select entities;
- inspect relationships;
- expand/collapse structure;
- highlight dependencies;
- inspect incoming/outgoing relationships;
- navigate evidence.

However:

**the graph canvas is not the intelligence engine.**

The engine should be usable by other interfaces in the future.

Potential consumers include:

```text id="9yfn86"
Desktop UI
CLI
IDE extension
MCP server
API
Agent
```

These are future possibilities, not current implementation requirements.

---

## Views

The product may eventually expose multiple ways of looking at the same evidence:

```text id="5flshp"
Dependency Graph
Feature Flow
Data Flow
Blast Radius
Change Impact
Related Tests
Evidence Inspector
```

Each view should derive from the underlying evidence model.

Do not build separate competing representations of repository truth.

---

## Performance

Local analysis must remain practical for real repositories.

Important measurements may include:

- initial indexing time;
- incremental indexing time;
- graph query latency;
- Laya inference latency;
- memory usage;
- local storage size;
- time to first useful result.

Optimization should follow measurement.

Do not introduce distributed infrastructure merely because a large repository might exist.

State limits honestly before building unnecessary complexity.

---

## Incremental analysis

Desktop operation makes repository changes observable.

Eventually, editing one file should not require rebuilding an entire codebase index when the affected information can be updated incrementally.

Conceptually:

```text id="5ttobv"
File changed
     |
     v
Re-analyze file
     |
     v
Update affected evidence
     |
     v
Update graph
     |
     v
Invalidate affected intelligence/cache
```

This is a future capability unless a phase explicitly introduces it.

---

## Git

The local repository may contain useful Git information.

Potential future capabilities include:

- changed files;
- branch comparison;
- commit context;
- recently modified areas;
- impact analysis over a diff.

Git metadata should supplement code evidence.

It should not redefine structural truth.

Do not build Git intelligence before its phase.

---

## Security

Opening a repository must be treated as reading untrusted input.

Analysis should not require executing project code.

Avoid running:

```text id="h7z0pq"
npm install
npm scripts
Gradle tasks
Maven tasks
dotnet build
arbitrary project binaries
```

merely to understand a repository unless the user explicitly requests an operation that requires execution and the product has an appropriate security design.

Prefer static inspection.

Do not execute repository code during normal indexing.

---

## Secrets

Repositories may contain sensitive files.

The application should avoid unnecessary ingestion of:

```text id="7oznnr"
.env
private keys
credentials
generated secrets
build outputs
dependency directories
```

Exact exclusion rules belong to parser/indexing specifications.

Secrets must never be included in telemetry.

External LLM evidence collection should also respect exclusion rules.

---

## What this product is not

It is not primarily:

- a code reviewer;
- a linter;
- a vulnerability scanner;
- a quality scoring system;
- an autonomous coding agent;
- a generic repository chatbot;
- a prettier dependency graph.

Those may overlap with information the engine knows, but they are not the current product objective.

The objective is:

**software comprehension and change understanding.**

---

## Out of scope until explicitly introduced

Do not implement these merely because they appear useful:

- autonomous code modification;
- automatic pull requests;
- arbitrary repository execution;
- cloud repository indexing;
- cloud storage of source-derived graphs;
- source-code telemetry;
- mandatory external LLMs;
- architecture quality scores;
- code-quality grades;
- vulnerability scoring;
- distributed workers;
- collaborative cloud graph storage;
- IDE extensions;
- MCP server;
- runtime tracing;
- every programming language at once.

Each requires its own product decision and phase.

---

## Where this is likely to go wrong

### Import and symbol resolution

Path aliases, barrel exports, generated files, dynamic imports, interfaces, dependency injection, and framework conventions can produce silent gaps.

Silent failure is worse than visible incompleteness.

Report unresolved analysis loudly.

### Cross-language normalization

Different languages express similar concepts differently.

The Unified Code Model must not become a lowest-common-denominator abstraction that loses useful evidence.

Adapters should preserve language-specific evidence while exposing common relationships.

### Framework relationships

An HTTP call and its backend route may live in separate repositories and languages.

Matching them requires explicit evidence and careful normalization.

Do not guess because two strings look similar unless the relationship is explicitly marked as inferred rather than verified.

### Feature-flow reconstruction

A structurally valid dependency path is not automatically a real execution flow.

The system must preserve the distinction.

### Laya evaluation

A ranking model can look useful while repeatedly choosing plausible but inefficient paths.

Laya should eventually be evaluated on measurable tasks such as:

```text id="47yw30"
Next-node Accuracy
Recall@K
MRR
Path Efficiency
Nodes Inspected
Time to Evidence
```

Do not evaluate it only by reading a few examples.

### LLM grounding

A fluent explanation can hide unsupported claims.

Answers must remain tied to collected evidence.

### Privacy

One accidental upload of repository content undermines the product's local-first claim.

Treat data boundaries as architecture, not policy text.

---

## Measuring whether the product works

The product should eventually be evaluated against developer outcomes.

The main candidate metric is:

**Time-to-Understanding.**

For example:

```text id="xjpk3f"
Without product:

Understand feature
18 minutes

With product:

Understand comparable feature
6 minutes
```

Other useful measurements may include:

```text id="3d44xd"
Time to Impact
Files inspected
Dependencies discovered
Missed dependencies
Answer usefulness
Developer confidence
Repeated voluntary usage
```

These metrics are product-validation metrics.

They are not code-quality scores.

The first pilot should establish realistic baselines before turning provisional thresholds into permanent product claims.

---

## What has to be true before the first real pilot

The first pilot does not require the complete long-term vision.

It requires a trustworthy core.

At minimum:

- a developer can open a local repository;
- source code is not uploaded to our backend;
- repository analysis works locally;
- supported files are parsed deterministically;
- coverage reports what was skipped and why;
- verified edges can be traced to evidence;
- dependency graph operations work locally;
- blast-radius/change-impact basics work locally;
- the product remains structurally useful without an external LLM;
- external AI is optional;
- external AI credentials belong to the user;
- no BYOK credential is logged;
- telemetry contains no source code;
- analysis does not execute arbitrary repository code;
- unsupported relationships remain unresolved instead of being invented.

The exact feature set for the pilot belongs to the implementation phases.

---

## Long-term architecture

The intended direction is:

```text id="fr1e8t"
                    LOCAL MACHINE

┌────────────────────────────────────────────────────┐
│                                                    │
│                 Desktop Application                │
│                     Tauri                          │
│                                                    │
│  ┌──────────────────────────────────────────────┐  │
│  │                    UI                        │  │
│  │ React / Next.js / Tailwind / React Flow     │  │
│  └──────────────────────┬───────────────────────┘  │
│                         │                          │
│                         v                          │
│  ┌──────────────────────────────────────────────┐  │
│  │       Codebase Intelligence Engine           │  │
│  │                                              │  │
│  │ Language Adapters                            │  │
│  │ Framework Extractors                         │  │
│  │ Unified Code Model                           │  │
│  │ Code Knowledge Graph                         │  │
│  │ Graph Algorithms                             │  │
│  │ Laya / System-1                              │  │
│  │ Evidence Retrieval                           │  │
│  └──────────────────────┬───────────────────────┘  │
│                         │                          │
│                         v                          │
│                   Local SQLite                    │
│                                                    │
└──────────────────────────┬─────────────────────────┘
                           │
                    optional network
                           │
          ┌────────────────┼─────────────────┐
          │                │                 │
          v                v                 v
       Clerk         Licensing API      BYOK LLM
     identity          / Trial           Provider
```

The critical boundary is:

```text id="j1t0n8"
SOURCE CODE
AST
GRAPH
EVIDENCE
LAYA CODE CONTEXT

        stay local
```

unless the user explicitly enables an external AI operation that requires selected evidence.

---

## Architectural priority

When making a design decision, prefer the option that preserves, in this order:

1. structural correctness;
2. evidence traceability;
3. source-code privacy;
4. local/offline capability;
5. engine independence;
6. language extensibility;
7. developer usefulness;
8. performance;
9. implementation convenience.

Convenience does not justify violating the first five.

---

## The test every feature must pass

When a new feature is proposed, ask:

> Does this help a developer understand an unfamiliar codebase or understand the consequences of changing it?

If not, it probably does not belong in the product yet.

When an AI feature is proposed, additionally ask:

> Can deterministic analysis provide this answer exactly?

If yes, use deterministic analysis.

When a structural relationship is proposed, ask:

> What evidence proves this relationship exists?

If there is no answer, it is not a verified edge.

When a cloud feature is proposed, ask:

> Does repository-derived information actually need to leave the machine?

If the answer is no, keep it local.

That is the product.
### FS-04: source-backed Node and Next profiles

Node runtime resolution and Next bundler resolution use separate composable profiles. Native Node never inherits TypeScript path aliases, and a Next package can also own a native custom server. Resolution reads the protected source inventory and literal metadata; it does not inspect installed dependency implementations or invoke configuration, plugins or application code.

Next route ownership, action references, client/server boundaries and generated-method rules are framework bindings and registrations in snapshot v3. They remain distinct from lexical calls and raw structural Impact. A Client Component label permits server prerendering; an action reference does not supply a generated public URL. Version-specific Middleware/Proxy declarations retain their runtime conditions, while unqualified Edge implementation behavior remains a boundary. Existing TS/JS projections and the frozen Laya artifact are preserved. The bounded qualifications and retained verification are documented in `docs/fs-04/README.md` and `docs/fs-04/acceptance.md`.