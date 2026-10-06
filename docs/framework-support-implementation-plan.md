# Framework support implementation plan

Status: proposed implementation roadmap; no development authorized by this document alone.

Prepared: 2026-10-06. Scope: Vite + React, Node.js + Next.js, Python + Django, React Native, and evidence-backed cross-stack request linking.

The existing UI polish is complete and is the presentation baseline. This roadmap extends analysis and makes only the presentation changes necessary to expose new capabilities, evidence, variants, and unresolved boundaries. It does not reopen the UI redesign.

## 1. Purpose and governing constraints

Preserve Codebase Intelligence Desktop's local engine, canonical evidence, SQLite publication, Tauri host, packaged Node runtime, graph operations, deterministic investigations, local Laya ranking, and optional approved explanations. Generalize existing components before introducing replacements.

This is a planning deliverable. It does not authorize production changes, dependency installation, configuration changes, model training, commits, pushes, or publication. Before development, resolve the blocking decisions in FS-00 and write an executable specification for each phase under `docs/specs/`. Use the FS identifiers here to avoid silently renumbering existing Phases 01–09.

Repository instructions remain applicable. In particular, `CLAUDE.md` requires a specification before implementation and explicit approval before installing a new package. A proposed tool in this plan is not an approved dependency. Read installed, version-specific Next.js guides before changing Next code; the installed package is currently 16.3.6.

Permanent requirements:

- Analysis runs locally, without providers, authentication, dependency installation, application startup, or network access.
- Never execute selected-repository configuration, scripts, imports, application factories, build tasks, transforms, native generators, or framework initialization to discover facts.
- Every verified fact has deterministic evidence. Laya and explanations cannot create, repair, or promote graph relationships.
- Preserve existing supported Next.js, NestJS, Express, Docusaurus, React, and generic TS/JS behavior and honest coverage limits. Existing withheld Express routes remain withheld unless separately specified.
- Preserve file import semantics, type-only distinctions, first-occurrence provenance, exact structural Impact, bounded traces, and stale-evidence handling.
- Preserve Windows analysis, refresh, persistence, cancellation, startup, MSI/NSIS packaging, secure key storage, and optional BYOK/local-agent explanations.
- No runtime tracing, cloud repository storage, telemetry, licensing changes, model retraining, or dependency-source indexing is introduced by this roadmap.
- No new compiler ASTs, framework-specific switches, or filesystem authority enter generic graph algorithms.

## 2. Meaning of supported

### 2.1 Capability contract

Support is an intersection of a qualified version, project configuration, language syntax, framework pattern, resolution profile, analysis variant, and read policy. Detection alone is not support.

A capability is **qualified** only when its documented positive and negative fixtures, regression gates, and Windows packaged checks pass. Record these states independently:

| State | Meaning |
| --- | --- |
| Qualified | The version/pattern/profile combination passed the recorded acceptance suite. |
| Partial | Useful facts were extracted, but named capabilities or inputs are unavailable. |
| Unsupported | The syntax, version, plugin, or pattern has no qualified implementation. |
| Blocked | Read policy, missing metadata, parse failure, resource limits, or unavailable packaged resources prevent analysis. |

Project capability summaries must not hide occurrence-level gaps. A qualified framework may still contain an unresolved call or computed route. Unknown versions must never inherit a qualified badge merely because parsing succeeds.

For every capability, publish its supported grammar, binding rules, required inputs, exclusions, version matrix, fixture IDs, extractor version, and qualification record. The exact version matrix is a blocking FS-00 deliverable, not a promise that every historical or future release works.

### 2.2 Evidence and uncertainty

| Record | What it establishes | What it does not establish |
| --- | --- | --- |
| File dependency | A supported import resolves to the recorded source/resource. | Execution, feature membership, or runtime loading. |
| Symbol reference/direct call | A source reference or call has a uniquely established target. | That a branch runs or an interface dispatch selects that implementation. |
| Framework binding | Supported framework syntax registers or references the recorded target. | Invocation frequency, temporal order, or successful execution. |
| Route declaration/registration | A handler is registered with the recorded matching rules and conditions. | Deployment reachability or request success. |
| Candidate | A bounded possible relationship with explicit reasons and missing evidence. | A verified graph edge; candidates do not enter exact Impact. |
| Gap | The analysis encountered a relevant operation it cannot resolve. | Absence of the relationship in the running application. |
| Cross-stack static binding | Given evidenced routing/configuration, a request pattern uniquely maps to an endpoint registration. | An observed request, successful response, or universal deployment routing. |

Use typed reasons such as `dynamic-expression`, `ambiguous-target`, `custom-resolver`, `unknown-origin`, `unsupported-syntax`, `missing-metadata`, `policy-denied`, `generated-code-unavailable`, and `variant-not-selected`. Preserve source witnesses where permitted. Never attach numeric confidence to turn a guess into a fact.

### 2.3 Target support boundaries

| Stack | Required qualified capabilities at roadmap completion | Explicit unresolved/deferred boundaries |
| --- | --- | --- |
| JS/TS | Existing extensions; imports/exports; lexical scopes; declarations; supported aliases/re-exports; uniquely resolved calls; framework-aware resolution variants. | Arbitrary eval, prototype mutation, reflective dispatch, custom loaders, runtime-built imports, unsupported syntax. |
| Vite + React | HTML module roots; supported static Vite configuration; aliases/conditions; literal imports/globs/assets/workers; React composition/events/hooks/effects/context; qualified React Router patterns; browser/SSR variants. | Executed plugin transforms, computed config, virtual-module implementation without evidence, arbitrary state/data libraries. |
| Node + Next.js | Qualified ESM/CommonJS resolution; Node entry registrations; App/Pages Router; route-handler and supported Pages API dispatch; layouts/slots; client/server boundaries; Server Functions/Actions; supported proxy/rewrites/redirects. | Arbitrary HTTP frameworks, native addon implementation, custom server dispatch without an extractor, generated action URLs, dynamic deployment configuration. |
| Python + Django | Python imports/scopes/declarations/resolvable calls; project/app discovery; URLconf; function/class views; supported dispatch/mixins; middleware; model/schema and supported ORM-operation declarations; templates; signals; commands; qualified DRF patterns. | Arbitrary Python metaprogramming, executed settings, dynamic URL generation, unrestricted decorators/managers, SQL execution claims, unsupported template engines/extensions. |
| React Native application layer | JS/TS/qualified Flow syntax; Metro Android/iOS resolution; React relationships; app roots; navigation/Expo routes; static assets/deep links; native specs and integration boundaries. | Custom Metro transforms/resolvers, dynamically generated screens, runtime autolinking, unavailable generated implementations. |
| React Native native layer | Bounded first-party Java/Kotlin/Swift/Objective-C declarations, supported local references/calls, and evidenced spec/registration-to-implementation mappings for qualified native patterns. | General native-language compiler completeness, arbitrary C++/JSI dispatch, reflection, runtime module discovery, third-party native internals. These remain visible gaps. |
| Cross-stack | Supported fetch/Axios request patterns linked to qualified Django/DRF or Next endpoints when method, origin, path, configuration, and variant uniquely permit it. | Unknown deployment origin, arbitrary request wrappers, ambiguous endpoints, unsupported regex/converters, dynamic proxying, WebSocket message flows. |

“Full support” in release language means comprehensive support **within this published contract**. It does not mean complete recovery of arbitrary program execution. Do not call React Native native tracing complete after shipping only JS/TS analysis.

## 3. Existing architecture and incremental changes

Current implementation anchors:

- `lib/engine/types.ts` and `contract.ts`: canonical snapshots; current snapshot version 2; file import relationships plus separate behavior evidence.
- `lib/model/behavior.ts`: declarations, references/calls, handler bindings, gaps, and hash-bound UTF-16 source ranges.
- `lib/engine/adapters/typescript.ts`: reusable TS/JS analysis and adapter-owned syntax reuse.
- `lib/parser/adapters/`: current framework extraction; the interface takes TS ASTs and selection is first-match.
- `lib/repository/read-policy.ts`: bounded canonical-root reads, exclusion and symlink policy.
- `lib/engine/refresh.ts`: reusable selected-root scheduler, audits, and complete-snapshot publication; event heuristics currently favor TS/JS.
- `lib/storage/`: SQLite persistence and atomic publication behind the storage interface.
- `lib/desktop/` and `src-tauri/`: protocol validation, projection, process supervision, local-agent/BYOK boundaries.
- `lib/laya/`: frozen local file-navigation ranker, validated candidate IDs, controller budgets, and deterministic fallback.
- `scripts/package-engine.ts`: packages the current engine and ts-morph dependency closure; new approved analysis assets need explicit inclusion.

Retain the dependency graph as a compatibility projection. Add framework/behavior relations alongside it; do not silently redefine import fan-in/out or exact file Impact. New traces can combine explicitly labelled relation families. New behavioral impact, if requested later, is a distinct query contract.

The generalized analysis pipeline is:

```text
RepositoryReader -> project discovery -> language sessions
                                      -> resolution profiles
                                      -> framework extractors
                                      -> validated canonical snapshot
                                      -> atomic local publication
                                      -> existing projections/queries/evidence
```

The same reader/read observations govern all adapters. A composed repository publishes one complete generation, with explicit capability gaps; it never presents a partially assembled graph as complete. Unexpected adapter failure retains the prior published snapshot. Unsupported input may publish a complete partial-capability snapshot with diagnostics.

## 4. Sequential phases and dependencies

| Phase | Outcome | Dependencies |
| --- | --- | --- |
| FS-00 | Decisions, qualification matrix, baseline, phase specifications | Current accepted product |
| FS-01 | Compatible shared contracts and capability/evidence extensions | FS-00 |
| FS-02 | Composable discovery, protected resolution, static config interpretation | FS-01 |
| FS-03 | React behavioral support and Vite project support | FS-02 |
| FS-04 | Node runtime and expanded Next.js support | FS-03 |
| FS-05 | Python language foundation and packaged parser | FS-04 |
| FS-06 | Django and DRF framework support | FS-05 |
| FS-07 | React Native app/Metro/navigation support | FS-06; reuses FS-03 |
| FS-08 | Bounded React Native native implementation support | FS-07 |
| FS-09 | Refresh, persistence, evidence UX, Laya compatibility, Windows qualification | FS-01–08 |
| FS-10 | Final cross-stack linking and integrated release acceptance | FS-09; endpoints from FS-04/06 |

This is the recommended execution order. Each phase must preserve a working product and run relevant regression/packaged checks; FS-09 is the comprehensive qualification gate, not permission to postpone lifecycle correctness until then.

### FS-00 — Resolve decisions and establish an implementation baseline

**Scope and architecture:** planning, measurement, and specifications only. Do not modify production behavior. Establish the existing feature and Windows acceptance baseline, including the finished UI and frozen Laya artifact.

**Tasks:**

1. Inventory current parser, graph, evidence, storage, protocol, refresh, optional explanation, and installer contracts. Record known gaps without recategorizing them as regressions.
2. Select exact qualification versions. Recommended starting families: React 18/19, Vite 7/8, Node 22/24, Next 15/16, Django 5.2/6.0, and compatible Python versions. Select concrete Metro/React Native/Expo/React Navigation/DRF versions from their actual compatibility constraints; do not test a Cartesian product of incompatible releases.
3. Include the installed Next 16.3.6 and existing Node 24.19.0 package baseline. Language grammar versions are separate from Cartograph's host runtime.
4. Decide the Python parser, Flow parser, native analysis approach, and approved package/license budget. Recommended Python prototype: Tree-sitter WASM versus bundled CPython AST; Pyright enrichment remains optional.
5. Define the route/registration model, source-position convention, candidate separation, snapshot migration, variant defaults, and cross-stack deployment evidence policy.
6. Write phase specifications with fixture manifests and measurable budgets before their implementation begins. Preserve current customer-repository training restrictions.

**Tests/validation:** inventory existing test commands; record a baseline verification ledger. Later parser comparisons use synthetic fixtures in an approved isolated prototype, not production replacement. Resolve package approval before installing candidate tooling.

**Acceptance:** every blocking decision in Section 7 has an owner, selected direction, rationale, and validation gate. Exact version targets and support claims are recorded. Existing unrelated working-tree changes are preserved.

**Deliverables:** decision records, support/version manifest, regression inventory, resource budget table, fixture design, and executable phase specs. No implementation is required to finish this planning gate.

### FS-01 — Extend shared contracts without replacing the evidence model

**Scope:** language-neutral facts, capabilities, registrations, variants, uncertainty, and compatible projections.

**Architecture changes:** generalize project metadata from one extractor to language/profile/extractor sets. Keep TS ASTs adapter-owned. Extend canonical snapshots and validation only for facts needed by this roadmap; retain existing import and behavior projections.

**Tasks:**

1. Add analysis profile/variant identity and capability records to snapshots and their identity digest.
2. Define typed framework bindings and route registrations with stable snapshot-scoped IDs rather than relying on route array indices for new features.
3. Separate page/navigation routes from HTTP endpoints. HTTP methods can be known, unrestricted by registration, unknown, or dispatch-dependent; do not substitute invented GET/ALL values for unknown methods.
4. Preserve raw route syntax plus a typed matcher representation: segments, converters/regex, precedence, conditions, prefix evidence, and variant. Unsupported matching is a gap, not a generic string comparison.
5. Support multi-site evidence for composed facts: registration, declaration, config, and handler can be in different files. Keep old first-occurrence provenance honest.
6. Add snapshot-local resource/config evidence only where needed. Every permitted witness is bound to content hash and canonical-root policy; no durable source archives.
7. Normalize adapter positions into the established source-range convention. Explicitly handle UTF-8 parser offsets, UTF-16 UI offsets, Unicode, line endings, and Python source encodings.
8. Keep candidates outside verified graph adjacency. Version storage/protocol/projection contracts as required; preserve old snapshots as readable limited-capability data or require reanalysis explicitly. Never backfill new facts as empty proven results.

**Tests:** serializer/validator round trips; dangling/duplicate IDs; wrong endpoint types; unsupported variants; multi-file provenance; malformed candidate promotion; UTF-8/UTF-16/CRLF fixtures; compatible and incompatible historical snapshots; unchanged old import/Impact results.

**Acceptance:** all new facts validate and open correct current evidence. Old supported repositories retain equivalent file dependencies and exact Impact. Generic algorithms contain no framework AST logic. Migration behavior is explicit and atomic.

**Deliverables:** contract specification, validators, compatibility projections, snapshot migration/reanalysis policy, capability presentation using current UI components, regression fixtures.

### FS-02 — Compose discovery, resolution profiles, and static configuration

**Scope:** project discovery and shared infrastructure for the subsequent adapters.

**Architecture changes:** introduce an application-owned extractor registry and analysis coordinator. Retain existing framework adapters through wrappers while gradually moving selection from first-match to compatible composition. Preserve existing role/convention precedence where behavior overlaps.

**Tasks:**

1. Discover package/workspace roots and Python project/app roots from permitted metadata and source. Define nested-project ownership, overlapping roots, and deduplication.
2. Separate language selection, resolution context, framework extraction, and optional extension detection. Vite + React and React Native + Expo must coexist correctly.
3. Provide a protected metadata index and profile interface for Node ESM/CommonJS, Vite browser/SSR, Metro Android/iOS, and Python packages. Implement each profile's detailed semantics in its stack phase.
4. Add bounded static interpretation: literals, selected constant references, literal arrays/objects, supported concatenation, and known declarative wrappers. No eval, module loading, arbitrary helper invocation, or plugin execution.
5. Track every metadata dependency and uncertain configuration expression for freshness and invalidation. Unknown config affects only facts depending on it; do not guess defaults when configuration may override them.
6. Maintain exclusions and canonical-root/symlink restrictions. Support first-party workspace packages by validated metadata paths, not by following dependency symlinks. External packages remain external entities/metadata, not indexed dependency source.
7. Update aggregate coverage accounting for multiple languages without double-counting owned files or classifying unsupported language files as analyzed.
8. Establish cancel/resource boundaries for parser sessions and large glob/config evaluations; keep the previous snapshot on failed publication.

**Tests:** mixed roots; nested manifests; aliases escaping the root; duplicate ownership; workspace links; executable config sentinel files; sensitive files; malformed metadata; cyclic config; conflicting extractors; deterministic discovery; bounded traversal/cancellation.

**Acceptance:** one generation can analyze multiple compatible project types without executing repository code. Existing framework selection behavior remains stable through compatibility wrappers. Every resolution outcome is internal, external, excluded, or unresolved with a reason.

**Deliverables:** coordinator, registry, protected metadata service, static config interpreter, project ownership rules, profile contracts, discovery/security fixtures.

### FS-03 — Vite + React behavior and navigation

**Scope:** comprehensive qualified React application structure and Vite resolution. Reuse TS/JS syntax and lexical symbol extraction.

**Architecture changes:** add Vite configuration/resolution and React binding extractors; keep React Router as a separate extractor. Add asset/worker relationships without placing them in code-call adjacency or changing file-import Impact silently.

**Tasks:**

1. Identify HTML module entry points, multiple entry pages, createRoot/hydrateRoot roots, and supported legacy roots where the selected React version permits them.
2. Implement version-aware Vite root/alias/conditions, relevant tsconfig-path behavior, literal dynamic imports, and literal import.meta.glob patterns/options. Preserve eager/lazy distinction and glob configuration provenance.
3. Extract supported asset/CSS-module imports, static URL assets, and worker entry references. Represent transformations/virtual modules as unresolved implementation boundaries when no supported deterministic rule applies.
4. Identify component declarations via bindings and syntax, not uppercase filenames alone. Resolve JSX references, fragments, supported class components, wrappers such as memo/forwardRef where version-qualified, lazy imports, and supported exported aliases.
5. Extract event-handler, custom-hook, effect/cleanup, and context relationships. Resolve imported API aliases and lexical shadowing. Callback props/spreads/HOCs become gaps unless a unique supported binding exists.
6. Add React Router declarative and data-router route objects, nested layouts/index routes, loaders/actions, and literal navigation/link destinations. Keep router modes and versions distinct.
7. Present composition, registration, and direct calls as different steps in existing investigations. Record browser/SSR scope without claiming scheduled effects or rendering actually ran.

**Tests:** Vite React JS/TS fixtures; multi-page HTML; alias/config conflicts; glob exclusion and eager/lazy expansion; SSR conditions; computed config/plugins; memo/lazy aliases; shadowed hooks; event props; cleanup callbacks; nested routes/loaders; dynamic navigation; unrelated uppercase helpers.

**Acceptance:** a supported UI entry traces to component references, an event binding, and verified handler calls with source witnesses. Vite dependency results agree with controlled fixture build oracles for qualified profiles. Unsupported transforms remain gaps. Existing React/Next analysis is preserved.

**Deliverables:** Vite profile, React behavior extractor, React Router extractor, support matrix, evidence UI projection, fixture/oracle record, staged Windows smoke coverage.

### FS-04 — Node semantics and expanded Next.js support

**Scope:** qualified Node module/entry behavior and Next App/Pages Router semantics. This does not promise every Node web framework.

**Architecture changes:** strengthen protected Node profiles and extend the existing Next extractor. Reuse React facts from FS-03; add boundary/route/action bindings rather than flattening them into direct calls.

**Tasks:**

1. Qualify package type scope, import versus require resolution, extensions, exports/imports condition order, self-reference, workspace packages, supported CommonJS exports/re-exports, built-ins, and type-only/runtime distinctions. Native Node TS profiles must not apply bundler aliases automatically.
2. Extract supported script/bin entry declarations without executing shell commands; simple first-party Node HTTP listener, EventEmitter, and Worker registrations with uniquely resolved receivers/targets. Unsupported custom dispatch remains a boundary.
3. Extend App Router page/layout/template/default/loading/error/metadata ownership; dynamic/catch-all segments; groups/private folders; parallel slots and intercepting navigation context. Respect static pageExtensions/basePath configuration.
4. Bind HTTP Route Handler exports, supported aliases/re-exports, explicit methods, and framework-derived HEAD/OPTIONS behavior only when version-qualified. Distinguish derived facts from source-written exports.
5. Add Pages Router API handler bindings and bounded method dispatch for supported req.method comparisons/switches. Unhandled or computed dispatch remains unknown; do not invent allowed methods from response status strings.
6. Track use-client module boundaries and server/client composition. A Client Component can participate in server prerendering; avoid presenting the label as exclusive browser execution. Include server-only/client-only markers and runtime variant evidence.
7. Extract module/function-level use-server declarations, form action/formAction bindings, and supported action invocation aliases. Client-mediated invocation is a framework boundary; server-local calls remain direct calls. Do not fabricate public action URLs.
8. Interpret qualified Proxy/Middleware matchers and static rewrites/redirects, preserving before/after/fallback order, conditions, external targets, and unknown transforms. Keep Next 15/16 conventions version-specific.
9. Include supported data-fetching/lifecycle exports and literal navigation/cache-operation declarations without claiming complete cache behavior or successful request execution.

**Tests:** Node ESM/CJS differences; condition order; runtime/type resolution divergence; mutable exports; workers/events; Next App/Pages fixtures; pages API branches; inline actions; client-boundary composition; parallel/intercept routes; pageExtensions/basePath; proxy conditions/order; incomplete configuration; old Next/Nest/Express/Docusaurus regression suites.

**Acceptance:** supported Next UI-to-action and endpoint-to-service investigations carry correct boundary labels. Node profiles resolve like the qualified runtime in controlled fixtures. Existing Next endpoint results remain equivalent unless a documented capability extension adds facts. No config/server process runs during customer analysis.

**Deliverables:** Node profiles/registration extractor, expanded Next capability manifest, routes/actions/boundary facts, fixtures, current-version documentation references, packaged regression record.

### FS-05 — Python language adapter and offline runtime delivery

**Scope:** a reusable Python foundation sufficient for the Django contract. Parser selection is decided in FS-00; do not adopt multiple mandatory runtimes by default.

**Architecture changes:** add a Python adapter behind the shared coordinator; reuse RepositoryReader, snapshot validation, graph operations, storage, and protocol. Tree-sitter/WASM syntax trees or Python AST objects stay inside this adapter.

**Tasks:**

1. Integrate the approved parser with pinned grammar/assets, bounded memory/time, cancellation, and deterministic diagnostics. If CPython is selected, bundle a controlled interpreter; use isolated startup, no repository imports, no site hooks, and no dependency on system Python.
2. Parse qualified Python syntax/encodings and extract functions/async functions, classes, methods, parameters, decorators, references, and literal import declarations.
3. Resolve relative/absolute imports, package roots, namespace packages, supported src layouts, import aliases/re-exports, and bounded literal __all__. External packages and missing stubs remain explicit external/missing boundaries.
4. Implement lexical scope, closures, class/method ownership, supported local inheritance/MRO, and uniquely established direct calls. Attribute dispatch, decorators, monkey patching, descriptors, star imports, or reassignment must not gain guessed targets.
5. Preserve decorators as registrations/wrappers; a decorated name is not automatically the undecorated body's direct-call target.
6. Normalize encoded-source locations into hash-bound UI ranges, retaining a verified mapping back to original bytes.
7. Add Python-specific exclusion and topology handling without relaxing sensitive-name or symlink protections. Do not execute pyproject/setup/settings code.
8. Package approved assets and licenses through the existing engine staging process. Dependency closure must be explicit; no downloads at application startup.

**Tests:** Python grammar versions; non-ASCII encodings; relative/namespace/src imports; local scope and shadowing; decorated functions; inheritance/ambiguous receivers; star/dynamic imports; malformed source; parser failure/cancel; root escape; missing/corrupt grammar/runtime; cleared PATH and denied egress.

**Acceptance:** Python files produce compatible validated snapshots and useful dependency/call investigations without Python installed. Ambiguous targets remain gaps. Existing TS/JS behavior and installer startup remain intact; packaged Python fixtures pass.

**Deliverables:** Python adapter/resolver, parser decision evidence, qualified syntax manifest, coverage/diagnostics, package assets/license inventory, offline fixture suite.

### FS-06 — Django, templates, ORM declarations, and DRF

**Scope:** qualified Django and Django REST Framework structure, registrations, and conservative behavior. No application initialization or database access.

**Architecture changes:** compose Python analysis with Django/DRF extractors. Add template/model/config facts as scoped evidence; keep them out of generic import adjacency unless a separately defined projection requires them.

**Tasks:**

1. Detect Django apps and entry modules, supported settings inheritance/literal INSTALLED_APPS/ROOT_URLCONF/MIDDLEWARE, and explicit selected settings variant. Dynamic settings remain unknown. Do not read .env values or import settings.
2. Resolve urlpatterns, path/re_path, include, names/namespaces, literal converters, mounted prefixes, duplicate registrations, and ordering. Preserve regex source; only the qualified matcher subset participates in definitive linking.
3. Bind function views and supported as_view registrations. Model class-based dispatch, method overrides, and mixins only where the supported MRO and framework semantics establish a unique target.
4. Extract middleware sequence and hook declarations with conditions; registrations do not imply that every middleware/view executes for a request.
5. Extract models, fields/relationships, supported managers/QuerySets, and identifiable ORM-operation declarations. Lazy evaluation and custom manager dispatch remain boundaries; do not claim SQL tables were accessed merely because a QuerySet was constructed.
6. Extract literal render/template names, inheritance/includes, blocks, and named URL references for the Django template engine. Dynamic names, custom tags, and unsupported engines remain gaps.
7. Extract signal receiver/connect registrations, AppConfig ready declarations, management command ownership, and supported admin registrations. Do not equate signal registration with emitted/observed behavior.
8. Add DRF APIView/generic views, router registrations, qualified viewset action/method mappings, serializers/model references, literal custom actions, basename/prefix/slash behavior, and supported format suffixes. Custom routers and computed get_queryset/get_serializer_class paths retain uncertainty.

**Tests:** nested includes/namespaces/order; converters/regex boundaries; decorated/async views; multiple/missing settings; CBV overrides/mixins; middleware short-circuit; lazy QuerySets/custom managers; duplicate signal receivers; template lookup conflicts; DRF viewsets/actions/slashes; similarly named non-Django APIs; no django.setup/import sentinel execution.

**Acceptance:** a supported URL registration traces to its view/dispatch and verified downstream calls. Templates, models, middleware, and signals expose their declared relationships with witnesses. HTTP methods come from supported view/DRF semantics, not URLconf guesses. Packaged offline Django analysis passes.

**Deliverables:** Django/DRF extractors, template support, endpoint matcher metadata, framework binding facts, support manifest and representative repository/fixture records.

### FS-07 — React Native application, Metro, and navigation

**Scope:** Android/iOS application-layer analysis, qualified Flow syntax, Expo Router and React Navigation, and native integration boundaries.

**Architecture changes:** reuse React bindings; add Metro profiles and platform-scoped registrations. Do not combine mutually exclusive platform targets into an unlabelled graph. Platform selection belongs to analysis settings/profile identity, not filesystem mutation.

**Tasks:**

1. Implement Metro package exports/conditions, import/require context, package redirects, source extension ordering, platform/native fallback, assets, and statically readable configuration. A matched exports path must follow Metro's qualified semantics rather than unconditional platform expansion.
2. Qualify Android/iOS variants and supported Platform.select/OS branches; represent unresolved branches when values/configuration are unknown. Desktop Windows host support does not imply React Native Windows application support.
3. Bind AppRegistry and supported Expo entry registrations. Detect supported TS/JS/Flow dialect explicitly, with an approved parser path; do not run Babel/Metro transforms.
4. Extract React Navigation qualified static/dynamic navigator declarations, screens, nested navigators, and literal navigation targets. Callback/conditional registration remains conditioned or unresolved.
5. Extract Expo Router file routes/layouts/groups/dynamic segments, qualified platform route conventions, and literal linking/deep-link settings. Static app config is readable; executable app config is never loaded.
6. Extract native module/component specs, registry lookups, codegen metadata, and legacy/native integration declarations. Missing generated artifacts remain visible boundaries.
7. Maintain platform-specific evidence and variant selection in existing explorer/investigation components. Include qualified Flow file dependencies and conservative lexical behavior; unqualified Flow type-based dispatch remains a gap.

**Tests:** Metro platform priority and exports precedence; assets/density; workspace restrictions; custom resolveRequest gaps; Flow/TS parsing and aliases; AppRegistry; navigation nesting/conditional screens; Expo groups/deep links; Platform branches; native registry ambiguity; Android/iOS evidence isolation.

**Acceptance:** each supported app variant has the correct entry, dependencies, screens, event bindings, and native specification boundaries. An iOS import never silently points at an Android implementation. No Metro/Babel/Expo repository code executes. Windows packaged analysis passes for both app variants.

**Deliverables:** Metro profiles, React Native/Expo/React Navigation extractors, Flow parsing capability, platform projection, native boundary inventory, qualification fixtures.

### FS-08 — Bounded first-party React Native native implementation tracing

**Scope:** the native-layer contract in Section 2.3, required before claiming the roadmap's React Native support complete. Broad Java/Kotlin/Swift/Objective-C compiler support is not implied.

**Architecture changes:** add narrowly scoped native language adapters and native bridge extractors behind existing contracts. Decide syntax/semantic tooling in FS-00. Prefer reusable packaged syntax parsers plus conservative source-local resolution where it meets the contract; introduce semantic workers only if qualification proves they are necessary and packaging/privacy requirements remain satisfied.

**Tasks:**

1. Parse qualified first-party Java/Kotlin/Swift/Objective-C source for native module/component implementations, ownership, declarations, and supported local references/calls.
2. Resolve qualified bridge/spec/registration mappings using names, signatures, declared types, explicit registration, and source evidence together. Name similarity alone cannot establish a mapping.
3. Distinguish generated interface declarations, implementation overrides, explicit native registrations, and platform dispatch. Do not run Codegen, Gradle, CocoaPods, annotation processors, macros, or native builds.
4. Identify unavailable generated code, Swift/Objective-C interoperability ambiguity, dynamic module lookup, reflection, and C++/JSI boundaries as gaps.
5. Read existing generated metadata/source only through a narrowly specified metadata capability if required. Current generated/bin/obj exclusions remain the default; no blanket exception or dependency-source indexing.
6. Bundle every required parser/resource/runtime and license. System Xcode, Java, Android SDK, Python, and native compiler installations must not be required for the qualified Windows analysis subset.

**Tests:** paired JS spec/native implementations; supported legacy/new architecture registrations; overload/name collisions; missing generated interfaces; Android/iOS/native ownership; Kotlin/Swift syntax versions; ObjC selectors; reflective/C++ boundaries; compile-time versus actual dispatch; non-Windows tooling absent; bounded failure/cancel and packaged resources.

**Acceptance:** qualified JS-to-native bindings and supported native-local calls have source witnesses in the selected root. Unsupported native behavior stops at an explicit boundary. If tool feasibility cannot meet the agreed contract, mark this phase blocked/incomplete and narrow the release claim explicitly; do not silently certify full native tracing.

**Deliverables:** scoped native adapters/bridge extractors, supported-pattern matrix, resource/license inventory, native boundary diagnostics, paired-platform offline qualification record.

### FS-09 — Integrated lifecycle, Laya compatibility, and Windows qualification

**Scope:** comprehensive operational acceptance across FS-01–08. Reuse and generalize current lifecycle services; do not replace storage, host, or UI architecture.

**Architecture changes:** generalize refresh invalidation and evidence packaging across languages/variants. Keep current local ranker artifact, model input contract, controller, and baseline semantics.

**Tasks:**

1. Replace TS-only refresh event assumptions with coordinator-owned input classification. Reuse syntax sessions per language; full rebuilds remain the safe fallback for uncertain topology/config/framework changes.
2. Include all source/config/template/glob/native-spec inputs in read stability audits, snapshot identity, atomic publication, and evidence cache invalidation. New or deleted files that change glob/package membership must invalidate results.
3. Preserve last-complete-snapshot recovery, cancel/restart, watcher loss, root disappearance, repository forgetting, and historical evidence behavior.
4. Fit new facts/diagnostics into current explorer, detail, trace, Impact, and coverage UI. Add only necessary variant/capability controls. Preserve navigation/folding/themes and completed polish.
5. Extend approved explanation payload selection/digests to supported new evidence types without expanding transmission consent. Source bytes, config secrets, absolute roots, or extra files are never added implicitly.
6. Preserve Laya's file-path candidate contract. Symbol/route/native/candidate records do not become model inputs automatically. Keep import-based fanIn/fanOut definitions and exact Impact unchanged.
7. Record qualification domain separately: new Python/native/binding graphs default to deterministic traversal where the frozen model is unqualified. Existing qualified TS/JS behavior continues. Offline compatibility tests are not a new model-success claim.
8. Verify model identity/hash, malformed/missing artifact fallback, timeout/cancellation, stable ties, replay, and graph byte-equivalence with ranking enabled/disabled. Any retraining or input/schema expansion requires a separate spec and authorization.
9. Extend engine packaging explicitly for approved dependency closures, WASM grammars/workers, runtime manifests, hashes, and licenses; enforce no startup downloads or system-runtime dependencies.
10. Rebuild Windows MSI/NSIS and qualify installed startup, analyze, reopen, refresh, evidence, forget, and uninstall. Record signature status honestly; this roadmap does not provide signing credentials.

**Tests:** incremental/full snapshot equivalence per stack; metadata/glob/template/variant changes; watcher overflow/loss; cancellation/restart; old snapshots; SQLite atomicity; memory/snapshot/protocol budgets; stale multi-site evidence; provider consent/cache isolation; Laya fallback/domain/replay; clean Windows PATH, denied egress, and missing development tools.

**Acceptance:** all stack capabilities operate in the installed Windows application and retain current product workflows. Model artifact is unchanged; unsupported ranking domains remain baseline-capable. No out-of-root reads, source uploads, repository execution, or hidden runtime prerequisites occur. macOS/Linux claims remain separate and require their own test hosts.

**Deliverables:** lifecycle integration, refreshed capability UX, evidence payload tests, Laya compatibility ledger, asset/license manifests, MSI/NSIS hashes and installed Windows acceptance ledger. This is a qualified framework-analysis candidate, before cross-stack certification.

### FS-10 — Final cross-stack request linking and release acceptance

**Scope:** supported frontend/server request declarations connected to Next or Django/DRF endpoint registrations when complete static evidence permits it. Cover Vite React, Next client/server code, and React Native callers. Do not claim observed execution or general request/dataflow reconstruction.

**Architecture changes:** add a local endpoint index, supported request extractor, bounded request-value interpreter, and static linker. Store request-to-endpoint bindings separately from import adjacency and candidates. Reuse existing evidence retrieval, traces, identity, and presentation.

**Tasks:**

1. Extract global/import-bound fetch and Axios APIs with lexical shadowing checks. Start with literal URLs/methods, fetch's supported default GET behavior, supported Axios instance baseURL/method calls, constant aliases, and bounded string/template patterns.
2. Support wrappers only through specified interprocedural summaries with unique call targets, bounded depth, explicit argument propagation, and all witness sites. Unsupported wrapper options/interceptors/spreads become gaps.
3. Represent request method, origin, path pattern, parameters, variant, conditions, and relevant configuration. Preserve unknown components instead of filling them with localhost/default deployment assumptions.
4. Establish deployment/application routing evidence from permitted project-local declarations or an explicit local analysis mapping. A user-supplied mapping is visibly an assumption/input, not discovered source truth; include it in identity and evidence and label derived links accordingly.
5. Apply qualified Vite proxy, Next basePath/rewrites/proxy, backend mount prefixes, Django ordering/converters, and DRF slash/action semantics. Vite development routing does not establish production routing.
6. Use typed route matching and precedence. Compare compatible parameter/converter domains conservatively. Unknown regex, authentication-dependent routing, competing endpoints, unresolved origins, or transforms prevent definitive linkage.
7. Emit a static binding only when a unique endpoint is established in the selected deployment/variant. Otherwise retain bounded candidates/gaps with reasons and competing witnesses. Do not merge backend instances by identical path.
8. Construct labelled investigations: component/event binding -> verified request-producing calls -> request declaration -> evidenced routing transformations -> endpoint registration -> handler -> verified backend calls. Include every boundary and branch; this is a possible static flow, not a chronological execution log.
9. Keep link candidates out of exact Impact and Laya truth. New reverse API-consumer queries are explicit typed operations; do not redefine existing file dependents. Ranking may prioritize valid investigation choices within its existing qualified scope.
10. Invalidate links on any participating source, configuration, mapping, endpoint, method, or variant change. A missing backend root inside the selected repository yields a gap; do not open another root implicitly.
11. Run the complete regression/packaged acceptance suite and publish the final support manifest and limitations. Imported OpenAPI may later enrich contracts, but cannot replace source-to-handler evidence or become an assumed endpoint implementation in this phase.

**Tests:** Vite React -> Django/DRF; React Native -> Django/Next; Next server/client -> Next/Django; method mismatches; duplicate hosts/routes; nested rewrites/prefixes; router order/slashes; parameter domains; static versus development proxy; relative URLs with unknown mobile origin; bounded wrappers; shadowed fetch; Axios interceptor gaps; dynamic secrets/env; stale/deleted witnesses; user mapping provenance; variant/config changes.

**Acceptance:** every definitive link explains its method/origin/path/profile/precedence and opens all required source/config witnesses. Ambiguity and unknown deployment inputs produce candidates or gaps, never verified edges. Multi-stack analysis and linking work offline in installed Windows packages. Existing dependency/Impact/ranking/explanation behavior remains intact.

**Deliverables:** request/endpoint/link extractors, API-consumer query, linked flow projection, cross-stack fixtures, final supported-version/pattern manifest, limitations guide, final MSI/NSIS qualification ledger and artifact hashes.

## 5. Verification strategy and release gates

### Every implementation phase

- Run relevant existing tests and new behavior/security fixtures; no mirror-only tests for incidental implementation details.
- Run type generation/typecheck, lint, static build, and desktop asset checks when affected. Run Rust fmt/check/tests when native host/protocol/packaging behavior changes.
- Check standalone parser/engine scripts, evidence/snapshot validation, and `git diff --check` as applicable.
- Run staged/release engine smoke when packaged analysis behavior changes. Keep these checks serial after packaging; existing records include load-sensitive concurrent smoke failures.
- Do not weaken a failing assertion, timeout, root policy, candidate validator, or ranker contract to obtain a pass.
- Treat unavailable tooling/credentials/manual checks as unverified, not passed. Preserve unrelated local modifications; no automatic commit or push.

### Fixture and oracle design

Use small hand-labelled positive and negative fixtures plus representative licensed/pinned public repositories and approved synthetic examples. Record expected facts and expected gaps. No customer repositories become training data or are uploaded.

In controlled test fixtures only, builds/framework runtime inspection can provide an oracle: Vite's module graph, Node resolution, Next route behavior, Django URL resolution/DRF registrations, and Metro platform resolution. Execute these in isolated test environments with fixed dependencies and no secrets. The installed analyzer still never executes an inspected application. Native builds requiring unavailable hosts are not claimed passed.

Measure extracted-fact precision separately from supported-pattern recall and parser coverage. Release gates:

1. All declared positive fixtures yield the expected normalized facts and witnesses.
2. All negative fixtures withhold unsupported/ambiguous edges and explain the reason.
3. No false verified edge exists in the qualification corpus; investigate any mismatch before release.
4. Existing supported import graphs/Impact answers retain equivalent semantics; additive behavior does not change old query contracts.
5. Incremental and full reanalysis yield equivalent canonical facts/coverage for each fixture and variant, excluding explicitly transient metrics.
6. Evidence sites remain correct under Unicode, CRLF, deletion, changed config, and snapshot reopening.
7. No application/config execution, out-of-root/sensitive read, network request, or implicit provider invocation occurs in analyzer tests.
8. Existing input/snapshot/protocol/trace/model limits remain enforced. Establish additional parser/glob/native/link budgets in FS-00 using representative measurements; do not invent performance claims without data.
9. Model-enabled versus disabled runs preserve structural graph contents; exact Impact remains exhaustive within its declared graph.
10. Windows installed acceptance passes with bundled resources, empty development PATH, no system Python/Java/Android/Xcode dependency for qualified analysis, and denied egress.

### Required qualification ledger

Record application/engine/extractor versions; exact language/framework/package versions; OS/architecture; selected variants; dataset/fixture revision; supported and unsupported capabilities; parsed/skipped/unresolved counts; analysis/refresh timing and peak memory; snapshot size; evidence mismatch count; Laya domain/fallback/artifact hash; package/resource hashes; signature status; installed manual acceptance; and unresolved issues. Do not equate one successful parser run with ecosystem qualification.

## 6. Preservation and rollout rules

- Use additive adapter/profile registrations and compatibility projections. Do not introduce a second canonical graph or duplicate source store.
- Activate capabilities only after their phase gates pass; unqualified versions/patterns retain explicit partial status. Feature flags, if needed, must not hide broken baseline functionality.
- Keep the existing frozen Laya model and file candidates. Retain baseline navigation everywhere; model-domain expansion is separate work.
- Extend optional explanation evidence only through the existing exact preview/consent/cache boundary. Existing BYOK and installed-agent functionality remain independent of parsing.
- Snapshot/protocol changes require explicit compatibility tests and recoverable local migration/reanalysis. Never publish half-migrated snapshots or silently reinterpret old facts.
- Preserve current read bounds and exclusions. Any new metadata access or generated-source exception is narrow, tested, and specified; parser libraries do not receive unrestricted filesystem authority.
- Preserve existing graph/folding/layout/UI state and Windows native controls. New routes, variants, gaps, and capability controls use the existing polished UI.
- Recovery always prefers a known complete snapshot and deterministic traversal. New adapter resource failure cannot disable existing supported TS/JS repositories.
- Qualify each stack's analysis on Windows; a Windows analyzer can inspect iOS source without claiming iOS native build/runtime acceptance.
- No website deployment, release publication, signing credential setup, commits, or pushes are included. Installer rebuilding is a future implementation-phase verification task, not an action in this planning request.

## 7. Highest-risk decisions before implementation

| Decision | Recommended direction | Risk and blocking gate |
| --- | --- | --- |
| Python parser and runtime | Compare pinned Tree-sitter WASM with controlled CPython AST; prefer WASM if grammar/locations/limits meet the Django contract. | Syntax recovery is not semantics; encoding, cancellation, memory, packaging, and version coverage must pass prototype fixtures. Dependency approval first. |
| Native React Native scope/tooling | Separate app-layer and bounded native-layer qualification; reuse parser tooling and source-local proofs before adding compiler workers. | Swift/ObjC interop, Kotlin dispatch, generated code, and C++ cannot be covered honestly by name matching. Resolve achievable patterns and Windows packaging before FS-01. |
| Flow support | Approved Flow-capable parser behind existing language contracts; conservative scope resolution. | Babel syntax acceptance does not supply Flow semantics. Pin grammar/version and qualify required patterns. |
| Shared evidence/route migration | Extend existing snapshot and separate import projection; explicit route registration IDs and method/matcher states. | Old validators assume file-only import edges and method-bearing routes. Prevent invented facts, broken historical data, and Impact semantic changes. |
| Resolution/config authority | Profile-specific resolution and bounded interpretation through RepositoryReader. | TypeScript aliases, Vite runtime imports, Node exports, Metro platform priority, and Python environments differ. No executable config fallback. |
| Dependency metadata/generated code | Narrow approved metadata assets; keep dependency sources and generated directories excluded by default. | Compiler/tool libraries may discover outside-root files or require generated inputs. Define required metadata access and failure behavior first. |
| Cross-stack origin/deployment identity | Unknown origin blocks definitive links; explicit local mappings retain assumption provenance. | Same method/path can identify multiple services or differ across dev/production. Decide what evidence qualifies a source-derived versus assumed binding. |
| Laya compatibility/domain | Freeze artifact/input/feature semantics; deterministic fallback in unqualified domains. | New symbol IDs and relation-derived degrees violate existing candidate/model assumptions. Establish qualification labels without retraining. |
| Qualification versions and performance budgets | Exact compatible version manifests and measured resource limits. | “All React Native/Next/Django versions” is untestable; complex route/glob/native extraction can exceed current desktop budgets. Select families and fixtures before implementation. |

Record these as concrete architecture decisions, not questions left to be answered opportunistically in production code. Approval of a phase specification does not substitute for separately required package approval.

## 8. Primary sources and local references

These sources informed the design. At implementation time, pin the relevant versions and recheck APIs rather than applying rolling documentation to older repositories.

- [Repository product rules](../CLAUDE.md), [existing roadmap](specs/README.md), [engine boundary](../lib/engine/README.md), [symbol/call specification](specs/phase-06.md), [refresh specification](specs/phase-07.md), [Laya specification](specs/phase-09.md), [local-agent explanation specification](specs/local-agent-explanations.md).
- [Installed Next server/client guide](../node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md), [Server Actions](../node_modules/next/dist/docs/01-app/02-guides/server-actions.md), [Proxy](../node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md), [intercepting routes](../node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/intercepting-routes.md).
- [Vite features](https://vite.dev/guide/features), [shared configuration](https://vite.dev/config/shared-options), [plugin API](https://vite.dev/guide/api-plugin): runtime resolution/globs/configuration and plugin boundaries.
- [React effects](https://react.dev/reference/react/useEffect), [lazy](https://react.dev/reference/react/lazy), [memo](https://react.dev/reference/react/memo), [React Router data routing](https://reactrouter.com/start/data/routing): composition/lifecycle and library-specific routing.
- [Node packages](https://nodejs.org/api/packages.html), [Node TypeScript](https://nodejs.org/api/typescript.html): module mode, package conditions, and runtime/type configuration differences.
- [Next server/client components](https://nextjs.org/docs/app/getting-started/server-and-client-components), [Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers), [Proxy](https://nextjs.org/docs/app/getting-started/proxy): version-aware framework boundaries.
- [Python AST](https://docs.python.org/3/library/ast.html), [Tree-sitter](https://tree-sitter.github.io/tree-sitter/), [WASM bindings](https://github.com/tree-sitter/tree-sitter/blob/master/lib/binding_web/README.md), [Pyright import resolution](https://github.com/microsoft/pyright/blob/main/docs/import-resolution.md): syntax, positions, packaging candidates, and semantic enrichment options.
- [Django URL dispatcher](https://docs.djangoproject.com/en/6.0/topics/http/urls/), [class-based views](https://docs.djangoproject.com/en/6.0/topics/class-based-views/intro/), [middleware](https://docs.djangoproject.com/en/6.0/topics/http/middleware/), [models](https://docs.djangoproject.com/en/6.0/topics/db/models/), [signals](https://docs.djangoproject.com/en/6.0/topics/signals/), [templates](https://docs.djangoproject.com/en/6.0/topics/templates/), [DRF routers](https://www.django-rest-framework.org/api-guide/routers/): registrations, dispatch, and ORM/template boundaries.
- [Metro resolution](https://metrobundler.dev/docs/resolution/), [package exports](https://metrobundler.dev/docs/package-exports/), [React Native language support](https://reactnative.dev/docs/typescript), [native modules/Codegen](https://reactnative.dev/docs/turbo-native-modules-introduction), [React Navigation](https://reactnavigation.org/docs/static-configuration/), [Expo Router](https://docs.expo.dev/router/basics/notation/), [Babel parser](https://babeljs.io/docs/babel-parser): platform resolution, navigation, Flow, and native boundary requirements.
