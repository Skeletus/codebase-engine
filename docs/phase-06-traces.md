# Phase 06 — Static symbol and handler traces

Phase 05 Windows acceptance was confirmed by the user before this work. macOS/Linux
qualification and formal Phase 04 pilot trials remain outstanding. Phase 06 manual
acceptance is pending; automated results below do not replace it.

## Implemented boundary

Canonical snapshot v2 adds declarations, references, lexical direct calls,
route-handler outcomes and explicit unresolved call sites. Identities are scoped
to the snapshot and derived from relative file, UTF-16 start offset and entity kind.
Every site carries a half-open UTF-16 range, line range, SHA-256 file hash and
extractor. The shared model and trace queries contain no compiler objects.
The TS/JS adapter uses the same in-memory parser and protected resolver; it does
not install dependencies, load compiler libraries, execute code or resolve types
by accessing external files. Parser output v4 and the file graph retain their
existing contracts.

Supported callable targets are named/default functions, immutable const arrow or
function-expression bindings, and supported route methods. Named imports,
aliases, path aliases and explicit named re-exports can bind uniquely. Duplicate
or reassigned targets are withheld. Parameters/dynamic callbacks, const aliases
to values, namespace/member dispatch, star exports, overloads, computed bindings,
constructors, accessors/class initialization, default-parameter ownership,
CommonJS imported callable dispatch, implicit cross-file globals and runtime/reflection/DI behavior are outside
this subset. Import-file evidence is retained for unsupported callable imports. Gaps
carry source witnesses and reasons. Anonymous callback calls have unowned scope;
they are not silently attributed to an enclosing handler.

Next App Router method declarations and explicit exports, and existing Nest
decorator routes, can bind to handlers. Existing route omissions and Express
withholding remain unchanged. Call traces are bounded static reachability,
including conditional possibilities and repeated/recursive targets, never runtime
order. Related-test candidates use verified references or dependency witness
paths, including type-only imports; conventions identify test files but never
establish execution, TESTS semantics or coverage.

SQLite still stores one validated canonical snapshot. Old v1 snapshots are retained
and marked incompatible/reanalysis required rather than supplying empty symbol
results. Refresh publishes v2 atomically; a failed refresh preserves old data.
No SQLite schema migration, watcher, incremental parsing or Phase 07 feature is
introduced. Read/recheck source retains the existing stale/missing/hash boundary.

Optional OpenAI/Groq explanations can receive small symbol, reference/call, handler
and gap summaries in payload v2, with explicit omission counts and file citations.
Every transmitted site/target belongs to the selected, hash-checked files. Context
remains metadata only, at most eight files and 6KB; optional facts are removed with
disclosed omissions when needed. Provider choice, exact HTTP preview, one-use
approval, secure credentials, cancellation and provider/model/payload caches
retain Phase 05 boundaries. Neither source text nor absolute roots are included.

## Windows manual acceptance

Refresh each real test repository once before acceptance, even if it already has a
compatible v2 snapshot from an intermediate development build.

Close previous Codebase Intelligence/Tauri windows first. Run all commands in
PowerShell from the application checkout:

```powershell
Set-Location -LiteralPath 'D:\Repositorios Github\cartograph'
pnpm start
```

The installed developer dependencies/toolchain from Phase 05 suffice. No environment
variables, Clerk/Supabase configuration, provider key or internet are needed for
structural checks. `pnpm start` prepares current assets and opens Tauri. Alternatively,
close development windows and install the rebuilt MSI/NSIS package under
`src-tauri\target\release\bundle`; use that installed app for acceptance.

Cartograph itself can test the original map and ordinary callable selection, but
it has no application API handlers. Use a real Next/Nest repository with an existing
supported handler for the handler acceptance. A controlled fixture is also provided
to make negative cases reproducible. In a second PowerShell window:

```powershell
Set-Location -LiteralPath 'D:\Repositorios Github\cartograph'
node scripts/phase06-fixture.ts 'D:\Repositorios Github\Phase 06 manual fixture'
```

Choose another **new, nonexistent** directory if that path already exists. This
command writes only static fixture files. **Do not install its packages or run its
code.** Its package manifests describe frameworks for static extraction only.

1. **Upgrade and offline opening.** In Tauri choose a previously stored Phase 05
   repository. Expect `reanalysis required` and a visible incompatible snapshot
   message; choose **Refresh**. Then use **Open repository** and select the fixture
   directory. Wait for `Published … files locally`. Disconnect networking for
   structural tests. Restart and **Reopen** the fixture from **Stored repositories**.
   **PASS:** old data requires refresh, the refreshed/fixture snapshot loads offline
   and graph navigation works. **FAIL:** an old snapshot pretends to have empty
   complete symbol facts, data disappears on failure, or structural use requires AI.

2. **Binding and call evidence.** Select **Investigations / Ask**, expand **Static
   call traces**, then choose **GET /api/demo** in **Handler**. Keep depth 8/budget
   100. Expect handler/declaration evidence in `app/api/demo/route.ts` and calls
   `GET → work`, `work → leaf` (conditional), `work → recurse`, `recurse → recurse`
   (conditional), `recurse → leaf`. Inspect the declaration and HANDLES_ROUTE
   witness links, then **each** call-site and target declaration link. A link
   selects the file in Map/Details; select the right-hand **Evidence** tab and
   **Read / recheck source**. Expect `Hash verified · current source`; compare
   the numbered lines with the trace range. Return to **Investigations / Ask**
   after each link; your selection is retained.
   **PASS:** every target/call/binding has the expected matching source, range,
   hash and extractor, and no execution-order claim. **FAIL:** fabricated calls,
   wrong source location, unverifiable hash, or source displayed as current after
   mutation. Repeat this step on a supported **real** Next/Nest handler.

3. **Alias, Nest, recursion and bounds.** Choose **GET /api/alias**; expect its
   export binding to `work` in `logic/core.ts`. Choose **GET /demo/leaf**; expect
   Nest decorator binding to `read`, then `read → leaf`. Return to GET /api/demo:
   set depth **0**, then depth **8**/budget **1**, then restore **8 / 100**.
   **PASS:** depth/budget omissions are explicit, full traversal terminates, and
   repeated targets are identified as recursion or convergence. **FAIL:** an
   infinite traversal, no omission disclosure, or aliases targeting another symbol.

4. **Negative evidence.** Choose **POST /api/demo**; expect no verified calls
   from POST and a receiver/member-dispatch gap with its source witness. The
   `GET /api/gap` declaration must appear as an **unbound route**, with a reason.
   Under **Find callable** search `shadow`, select `shadow · logic/shadow.ts`,
   then search/select `invoke · logic/mutable.ts`, `invoke · logic/duplicate.ts`
   and `invoke · logic/missing.ts`. Expect gaps rather than resolved calls.
   Inspect **Coverage & diagnostics** for missing `logic/absent` and skipped
   `logic/hidden.d.ts`. Select `nested · logic/shadow.ts`: its call targets the
   local arrow `leaf` in that file, never `logic/core.ts`'s `leaf`.
   **PASS:** unsupported/ambiguous dispatch stays unresolved and shadowing is exact.
   **FAIL:** a guessed receiver, parameter, duplicate, reassigned or skipped target.

5. **Related tests and existing UI.** GET /api/demo should list
   `logic/route.test.ts` via a verified dependency/reference witness and
   `logic/core.test.ts` via references to a reached declaration.
   `logic/unrelated.test.ts` must not appear. Inspect candidate witness links.
   Switch to **Map**, select files, fold/unfold groups, use categories, and
   inspect **Routes**, Details, existing dependency traces and change impact.
   **PASS:** candidate provenance is inspectable without claims of executed test
   coverage, and all original navigation works. **FAIL:** naming-only associations,
   TESTS/coverage claims, missing file edges or broken original controls.

6. **Stale evidence.** Using your editor, add a harmless comment to the fixture's
   `app/api/demo/route.ts` and save. Do not execute it. Click its witness, select
   Evidence and **Read / recheck source** before refreshing. Expect stale evidence
   and no current source. **Refresh**, repeat the trace and recheck.
   **PASS:** old facts stay historical until a new complete snapshot, then hashes
   and ranges match again. **FAIL:** new source silently combines with old facts.

7. **Optional explanation regression.** Reconnect networking only for this step.
   With your accepted Groq configuration, select `app/api/demo/route.ts` and use
   its existing **Explanation** action. Inspect the preview: provider/endpoint,
   exact request, `behavior` facts/omissions, selected relative paths and hashes,
   no source contents/absolute root. Approve this one request; check file evidence
   citations and that prose describes static possibilities/gaps. Cancel another
   preview; local traces must remain available. This step costs a provider request
   only if you explicitly approve it; never share keys in logs.
   **PASS:** richer metadata follows the same per-request approval/privacy boundary
   and provider failures/cancellation do not affect the local engine.
   **FAIL:** preapproval transmission, missing destination, source/root leakage,
   invented structural truth or AI-dependent analysis.

## Automated verification record

Verification on Windows:

- `pnpm exec next typegen`, `pnpm exec tsc --noEmit`, `pnpm lint` — PASS.
- `pnpm test` — PASS, 57/57, including 11 Phase 06 tests.
- `pnpm build`, `pnpm desktop:verify-assets` — PASS; static assets and bundled fonts.
- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`,
  `cargo check --manifest-path src-tauri/Cargo.toml --locked` — PASS.
- `cargo test --manifest-path src-tauri/Cargo.toml --locked` — PASS, 25/25.
- `pnpm desktop:build` and final `pnpm exec tauri bundle` — PASS, MSI and NSIS.
  Final installer rebundling uses `pnpm exec tauri bundle`
  after staging the final engine with `node scripts/package-engine.ts`.
- Packaged-engine smoke checks against staged and release resources — PASS,
  including symbol calls, handler binding, approved-payload metadata, SQLite reopen,
  stale evidence, impact, cache and repository forgetting. Source/staged/release
  engine module hashes match.
- Standalone parser, map-counts, insights and local engine checks — PASS on this
  checkout: 91 files, 231 file relationships, no dangling displayed graph endpoints.
- `pnpm pilot:benchmark` — PASS as an automated measurement only, not a pilot trial.
- `git diff --check` — PASS.

Manual desktop acceptance is deliberately not automated. macOS/Linux host checks
and formal pilot trials remain outstanding. No dependencies were added, no Phase
07+ work was implemented, and no commit or push was made.
