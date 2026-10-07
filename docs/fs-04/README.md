# FS-04 — Node.js and Next.js

Status: **complete — all mandatory acceptance criteria PASS**. FS-03 is the accepted starting point. This phase adds source-backed runtime profiles and framework facts to snapshot v3; it does not replace the existing TS/JS graph or Impact model.

The implementation lives in `node-profile.ts`, `node-next.ts`, `node-commonjs.ts`, `next-config.ts` and `next-behavior.ts` under `lib/parser/adapters/`. The TypeScript driver composes these with existing adapters. Next reuses FS-03 React extraction. No framework runtime is imported by the parser, and no inspected configuration, application or plugin is invoked.

## Qualification scope

| Tuple | Framework | React / React DOM | Resolver oracle runtime | Profiles |
| --- | --- | --- | --- | --- |
| node22 | native Node | — | 22.23.3 | node-development, node-production |
| node24 | native Node | — | 24.19.0 | node-development, node-production |
| next15 | Next 15.5.27 | 19.2.8 | 22.23.3 | node-development, node-production, browser |
| next16-preservation | Next 16.3.6 | 19.2.8 | 24.19.0 | node-development, node-production, browser |
| next16-patch | Next 16.3.8 | 19.2.8 | 24.19.0 | node-development, node-production, browser |

TypeScript tooling is 5.9.3. These are controlled source-resolution/routing qualifications, not evidence of a particular inspected process running. Next browser and server environment facts retain separate variant IDs. Node and Next can compose in the same package without inheriting each other's aliases. The packaged analyzer uses its bundled Node 24.19.0 to analyze all source tuples offline; Node 22 is needed only for the developer oracle.

“Supported” means the named literal pattern yields deterministic facts with original source positions, hashes, metadata witnesses and a version-specific framework rule. A framework binding is an association; it is not a lexical call or proof of request execution. Dynamic or unsupported patterns retain typed gaps. Aggregate capability assessments remain partial; an exact package version alone never grants a universal badge.

## Changes and compatibility

Snapshot version remains 3. Additive binding kinds: `server-action`, `module-boundary`, `operation`, `module-export`. Validators enforce callable action targets and module-boundary ownership. No SQLite migration, legacy import/path/route replacement, Impact change, UI change, external AI integration change or Laya artifact change is introduced.

Native Node qualification covers explicit package type scopes, ESM exact extensions, bounded CJS filename search, exact self exports and package imports, ordered known conditions, type-only exclusions, literal exports/re-exports and stable first-party HTTP/EventEmitter/Worker associations. External and workspace package installations remain boundaries: declaration in a workspace manifest alone does not prove a runtime symlink or deployment identity.

Next adds App/Pages registration and ownership, literal route matchers, source-written versus derived methods, bounded Pages request-method branches, client/server directives and marker boundaries, async server actions and stable aliases, intrinsic form associations, version-specific Middleware/Proxy matcher declarations, ordered literal rewrites/redirects, lifecycle and cache/navigation declarations. Interceptions preserve soft-navigation origin and parallel-slot context. No public action URL or frontend/backend deployment link is invented.

## Explicit boundaries

- Unknown/range tuples; Node syntax detection without an explicit package type; custom loaders; installed dependency implementations; wildcard/array exports; ambiguous aliases or extensions; CJS mutation/escape; synchronous require of ESM without a proved no-TLA graph.
- Next custom webpack/Turbopack, dynamic configuration, i18n transforms and unknown matcher syntax. `react-server` conditional exports require an RSC layer profile; generic environment selection is insufficient.
- Edge implementation execution is unqualified. Next 15 Middleware defaults to Edge; its matcher declaration retains that condition and a gap. Next 16 Proxy uses Node and rejects a runtime override. Middleware is deprecated in 16; Proxy is unsupported in 15.
- Matcher declarations describe supported user paths; generated data routes, image/static rewrites, deployment routing and successful requests are not synthesized. Regex matchers and ambiguous route precedence remain unresolved.
- Computed request dispatch, arbitrary action wrappers, mutated bindings, complete cache behavior and generated action/OPTIONS implementations remain boundaries. Derived OPTIONS has a known method and an unavailable generated handler; HEAD points to GET only under the pinned derivation rule.

## Reproduction

Run `node --test tests/framework-support/fs-04.test.ts` for deterministic acceptance. `node scripts/fs-04-qualification-runner.ts --all` executes every explicit tuple/profile target; unknown filters fail. Oracles are opt-in: `node scripts/fs-04-oracles.mjs --run`, using only the approved isolated packages and framework utilities over literal data/inert sentinels. They never run during normal analysis.

`powershell -NoProfile -File scripts/fs-04-verify.ps1` runs Cartograph-owned regression, build, package, Rust, storage and Windows checks. `scripts/fs-04-resources.ps1` records five fresh-process and twenty warm-session measurements per tuple; `scripts/fs-04-historical.ts` uses the unchanged F02 corpus and accepted historical protocol. Supplementary validation uses pinned read-only App/Pages subtrees of bulletproof-react; their version ranges intentionally remain unqualified.

See [acceptance](acceptance.md), [qualification](qualification.json), [resource budget](resource-budget.md) and retained `evidence/` logs for final outcomes. Earlier failed experiment/check logs are retained and superseded only by an explicit later passing check.
