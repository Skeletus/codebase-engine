# FS-02 infrastructure and boundaries

## Generation and composition

`AnalysisCoordinator` selects one protected inventory, compares ownership/topology and prior metadata observations, invokes the application-owned language driver, and composes the validated snapshot. The TS driver retains its in-memory syntax session, clean-parse rule and unresolved/config fallback. Parsing occurs once per owned TS/JS file; framework detection does not spawn another parser. The existing scheduler and SQLite still control stability audits and atomic publication.

The registry separates language, framework and extension registrations, orders prerequisites, and rejects duplicate IDs, conflicting channels, missing dependencies and cycles. Its registrations are application code, not repository-supplied modules. Compatible legacy detections are additive descriptions; the original first-match adapter retains sole authority over existing exclusions, role/convention precedence and route facts. Vite + React and React Native + Expo are detectable together. Detection never grants framework qualification.

## Inventory and ownership

The existing walker notifies discovery as it visits authorized directories. No second walk, dependency-link traversal, compiler filesystem host or source store is introduced. The root is always owned. A readable package manifest, pyproject, or source-local `manage.py`/`apps.py` marker introduces a discovery root. Each discovered file belongs to its nearest enclosing discovery root; nested roots shadow parents. Python markers establish ownership only, never Django semantics. Legacy parser ownership and framework precedence remain separate compatibility facts.

Workspace members are validated lexical roots from permitted manifest globs matched against this same inventory. Package names are tracked independently of membership; duplicate names make profile entry resolution ambiguous. Workspace symlinks/junctions are not followed. External dependency source, generated output, dot-directories, sensitive names, Python environments and caches are excluded. Legacy root-local JSON dependency configuration remains available through its original protected resolution path.

TS/JS files remain the analyzed file/import projection. Python and native-language files are discovered and counted once as skipped, with explicit language-not-implemented diagnostics. They acquire no symbols/import edges or qualified parser badge. Existing skipped declarations/syntax errors are not relabelled as parsed.

## Public metadata

The new first-party metadata path is stricter than legacy dependency JSON access. Public names include package manifests, recognized lockfiles, tsconfig/jsconfig, named Vite/Next/Metro config modules, pyproject/requirements/poetry/uv metadata, and explicit `settings.py`. Arbitrary config names and `.env` are denied. These names grant no traversal exception: canonical-root, symlink, sensitive/dot/dependency/generated restrictions and all existing read limits still apply.

The metadata index holds original UTF-8 bytes/text only during analysis. Snapshots retain resource hashes/dimensions, bounded witnesses and typed gaps, never a configuration/source archive. All successful reads and missing/denied probes participate in the existing stability audit. Config/metadata events force full refresh; ownership changes also force full refresh even without a watcher hint. Failed/cancelled/unstable publication retains the previous complete snapshot.

Only the specified single-line TOML property/section and exact `name==version` requirements subset supplies Python declaration metadata. Multiline/advanced TOML, requirement includes/options/ranges, lock semantics and Python settings interpretation remain explicit unsupported inputs. Settings are read as text only. Version strings in package metadata are declarations, not evidence that a dependency is installed or qualified.

## Static interpretation

The application-owned TypeScript syntax parser interprets strings/numbers/booleans/null, literal arrays/objects, immutable local constants, selected property access, string concatenation and a syntactically import-bound `defineConfig` wrapper. It never calls that wrapper. Unknown environment branches retain separate conditional values; fields containing unknown expressions do not become defaults. Getters, spreads, computed names, helpers, executable statements and initializer mutations remain unknown. Constant and local metadata cycles are explicit gaps.

Limits: recursion 32, evaluated/inspected nodes 10,000, followed metadata dependencies 64, 100 glob patterns and 20,000 authorized inventory matches. Literal growth is additionally contained to 1 MiB/string and 8 MiB cumulative evaluated characters. Glob matching uses bounded segment matching with checkpoints rather than backtracking regexes. A generation boundary checks cancellation/deadlines around discovery/config/glob work; TS parsing uses cooperative cancellation checkpoints and the existing native worker kill boundary. No new-language parser worker is introduced in FS-02.

## Protected profiles and variants

Node ESM/CommonJS, Vite browser/SSR, Metro Android/iOS and Python package profiles use stable FS-01 identities. Defaults are independent node-development, browser-development when Vite is declared, Android-development when RN/Expo is declared, and static-python when Python is present. iOS, production and SSR require explicit selection. Conditions remain empty when not established; OS environment is never consulted for customer semantics.

Profile outcomes are internal, external, excluded or unresolved with a reason and source/config witnesses. An internal infrastructure outcome only recognizes an explicitly named authorized literal file. It performs no extension/index search, exports condition selection, Vite alias/plugin interpretation, Metro suffix priority or Python imports. A source hash and nearest owner must match; incompatible language contexts are unresolved. Declared external packages stay external; first-party package entry semantics and unresolved aliases stay unresolved. No profile outcome is automatically inserted into import adjacency or traversal.

Cache identity contains profile semantics version, variant, source hash, metadata witness hashes and protected metadata observations. Changed metadata requires rediscovery. Relevant metadata witnesses and uncertainty are scoped to the profile family: a dynamic Vite config does not invalidate a Python/Node fact by inventing a shared runtime context. Whole-snapshot hashes still cover all tracked resources.

## Compatibility and scope

Snapshot v3 and its field schema, deterministic IDs, exact Impact, protocol pins, persistence/migration strategy and evidence checks remain unchanged. The approved first-party metadata name allowlist is expanded, using the existing resource/witness/gap contracts. FS-01 v3 snapshots remain readable; retained v2 still requires explicit reanalysis. Older consumers with narrower metadata allowlists can reject newly added metadata values, never reinterpret them as verified framework behavior.

No UI redesign, Laya feature/model change, provider/consent expansion, package installation or new parser/runtime/grammar is included. Framework-specific semantics begin in their authorized stack phases. An arbitrary caller passing a resolver query is not evidence that the specifier occurs in source; the later extractor must supply the actual occurrence before publishing an import/binding. Infrastructure source witnesses prove the selected input and context only.
