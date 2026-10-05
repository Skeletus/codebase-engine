# Phase 07 — Incremental local refresh

Phase 06 Windows manual acceptance was confirmed by the user. Phase 07 Windows
manual acceptance is pending. macOS/Linux qualification and formal pilot trials
remain outstanding; no automated fixture substitutes for those gates.

## Implemented boundary

One private Node engine session watches the selected native-authorized root.
Nonrecursive watches attach only to directories enumerated by the protected reader;
excluded directories and symlinks are not traversed. No watcher package, repository
execution, network service, source archive or persistent AST cache is introduced.
Canonical-root authorization is checked before walking, and readers reject root
inode/device replacement or a root becoming a symlink during a generation.

Events debounce for 600ms. Changed source hashes replace only the affected in-memory
syntax trees. Every generation still inventories/hashes supported sources and
recomputes all import/symbol resolution, convention roles, routes, handler bindings,
coverage, graph counts and diagnostics. This deliberately conservative optimization
avoids retaining stale global framework facts. New/deleted/renamed files, changed
metadata/topology/exclusions, newly changed resolution diagnostics, unknown events
and bursts above 32 events use full analysis. The burst count is a conservative
scheduling limit, not a measured product-capacity claim.

Protected reads, missing resolution probes and directory listings are replayed before
publication. Unstable generations are withheld and retried as full analyses, with two
automatic retries before visible degradation. SQLite job ownership rejects cancelled
or replaced publication. Previous completed snapshots remain available. The filesystem
is not locked: subsequent edits trigger another generation, and source display/provider
preparation still verifies hashes. Every 30 seconds a protected audit checks for missed
notifications, including dependency-resolution metadata outside watched source folders.
No source in excluded dependency directories is indexed.

Successful publication replaces the canonical snapshot, resets renderer queries and
source/explanation views, and invalidates outstanding native approvals. Existing
provider/model/payload digests select only matching cached explanations; older digests
remain bounded historical cache entries, not current answers. No refresh sends a provider
request. Reopening immediately exposes the stored graph, then watching bootstraps a full
generation because ASTs are not persisted. Full refresh always starts a fresh engine.

Pause/Resume watching and Simulate watcher loss are bounded selected-session commands,
with no renderer-supplied filesystem path. Loss closes handles/timers, reports degraded
state and requires Full refresh/Resume to recover. Selecting/forgetting repositories,
cancellation and application exit terminate the prior engine and its watchers. Errors
contain bounded product messages, never raw repository exceptions or credentials.
Cancellation recovery reopens the prior snapshot with watching paused, so it does
not immediately restart the operation the user just cancelled.

## Measurements and limits

Run from the checkout in PowerShell:

```powershell
Set-Location -LiteralPath 'D:\Repositorios Github\cartograph'
node scripts/benchmark-refresh.ts "$env:TEMP\cartograph-phase07-performance.json"
```

The command uses temporary static 50/500-file dependency-chain fixtures, validates
incremental/full snapshots for exact equality, measures protected analysis/publication,
query latency, RSS and SQLite size, and deletes its temporary repositories. The retained
JSON is numeric/platform metadata, with no repository paths or source. No fixture code
is executed. Measurements from Windows x64 / Node 24.19.0 in this checkout:

| Files / imports | Initial full ms | Incremental ms (trees parsed/reused) | Repeated full ms | Incremental query ms | Incremental RSS bytes | SQLite bytes |
| --- | ---: | --- | ---: | ---: | ---: | ---: |
| 50 / 49 | 563 | 345 (1/49) | 379 | 1.79 | 150269952 | 126976 |
| 500 / 499 | 3826 | 2667 (1/499) | 3068 | 12.34 | 218574848 | 700416 |

These are single local runs, not performance guarantees. Syntax work is reduced;
total wall time varied across local runs (an earlier 500-file run measured 2035ms
incremental versus 1966ms repeated full). Inventory, stability checks and global
evidence extraction remain full. Do not infer large-repository speedups or
new supported-size promises. Existing read/AST/message budgets remain unchanged.
Status reports per-generation parse/reuse counts, elapsed time, RSS and snapshot size.
No performance records are transmitted or mixed into source-free pilot questionnaires.

## Exact Windows manual acceptance

Close older application windows. In PowerShell:

```powershell
Set-Location -LiteralPath 'D:\Repositorios Github\cartograph'
pnpm start
```

No environment variable, account, provider key or internet is needed. Alternatively,
install the rebuilt MSI/NSIS under `src-tauri\target\release\bundle`, then launch it
with development windows closed. In a second PowerShell window create a **new** fixture:

```powershell
Set-Location -LiteralPath 'D:\Repositorios Github\cartograph'
node scripts/phase06-fixture.ts 'D:\Repositorios Github\Phase 07 manual fixture'
$fixtureRoot = 'D:\Repositorios Github\Phase 07 manual fixture'
```

If the directory already exists, choose another new path in both commands. Do not
install fixture dependencies or run fixture code. In the app Open repository and
select this directory; wait for **Watching selected root**. Disconnect networking.

1. **Automatic edit and evidence.** In the second terminal:

   ```powershell
   Set-Content -LiteralPath "$fixtureRoot\logic\core.ts" -Encoding utf8 -Value 'export function leaf() { return 7; } export function work() { return leaf(); }'
   ```

   Wait for a published refresh and watching status. Inspect Static call traces,
   GET /api/demo → work → leaf, then its witnesses through Evidence / Read / recheck
   source. PASS: updated hashes, declaration ranges and calls without restarting;
   status reports one parsed source and reused trees (an OS rename-style save may
   safely report full instead). FAIL: old calls/recursion advertised as current,
   mismatched source, partial graph or provider/network requirement.

2. **Re-export invalidation.** Write:

   ```powershell
   Set-Content -LiteralPath "$fixtureRoot\logic\barrel.ts" -Encoding utf8 -Value 'export { leaf as process } from "./core";'
   ```

   PASS: GET /api/demo now calls leaf through its alias/re-export, with new binding
   evidence; GET /api/alias still binds work. FAIL: stale symbol targets in unchanged
   importing files. Repeat a harmless reversible edit on a **real** repository and
   inspect its changed evidence; Cartograph itself can be used for this check.

3. **Rename/delete and new directories.** Run one command at a time, waiting for
   watching/publication between them:

   ```powershell
   Rename-Item -LiteralPath "$fixtureRoot\logic\core.ts" -NewName 'moved.ts'
   Rename-Item -LiteralPath "$fixtureRoot\logic\moved.ts" -NewName 'core.ts'
   New-Item -ItemType Directory -Path "$fixtureRoot\added" | Out-Null
   Set-Content -LiteralPath "$fixtureRoot\added\new.ts" -Encoding utf8 -Value 'export const added = 1;'
   Remove-Item -LiteralPath "$fixtureRoot\added\new.ts"
   ```

   PASS: rename removes old facts, dependent imports become unresolved, restoring
   resolves them again, addition/deletion changes the file map, and full fallback
   is disclosed. FAIL: dangling verified targets, deleted files still current or
   a new folder never being analyzed. These commands affect only the fixture.

4. **Config/global effects.** Replace fixture config, then restore its alias:

   ```powershell
   Set-Content -LiteralPath "$fixtureRoot\tsconfig.json" -Encoding utf8 -Value '{"compilerOptions":{"baseUrl":".","paths":{"@logic/*":["absent/*"]}}}'
   # Wait and inspect before the next command.
   Set-Content -LiteralPath "$fixtureRoot\tsconfig.json" -Encoding utf8 -Value '{"compilerOptions":{"baseUrl":".","paths":{"@logic/*":["logic/*"]}}}'
   ```

   PASS: full rebuild; unchanged route import becomes unresolved then resolves;
   coverage explains the gap. FAIL: cached old alias or guessed call relationship.

5. **Pause, loss and recovery.** Click Pause watching. Append a comment in the fixture
   editor; wait two seconds. PASS: no automatic publication while paused and source
   recheck reports stale. Click Full refresh and wait, then Simulate watcher loss.
   Expect degraded status with the completed graph still navigable. Edit again:
   no automatic refresh. Click Full refresh, then Resume watching if needed, and
   edit again. PASS: hash-verified new evidence and restored automatic updates.
   FAIL: lost prior graph, silent degradation, uncontrolled writes or no recovery.

6. **Cancel and bursts.** Pause watching, then add a bounded bulk fixture:

   ```powershell
   $bulkRoot = Join-Path $fixtureRoot 'bulk'
   New-Item -ItemType Directory -Path $bulkRoot | Out-Null
   1..1500 | ForEach-Object { Set-Content -LiteralPath (Join-Path $bulkRoot "f$_.ts") -Encoding utf8 -Value "export const value = $_;" }
   ```

   Click Full refresh and Cancel while progress is active. If it finishes before
   you click, repeat; a completed job is not a cancellation test. PASS: cancelled
   job preserves/reopens previous complete graph; later Full refresh succeeds.
   With watching active, edit several bulk files in quick succession; PASS: a
   coalesced consistent snapshot/full fallback, no accumulating partial graphs.
   FAIL: cancelled generation publishes afterward or refresh blocks future jobs.

7. **Persistence, lifecycle and existing features.** Restart offline and Reopen.
   Inspect Map folding/categories, Routes, Details, impact and static traces. Switch
   to another repository, edit the first fixture, then reopen it. Forget the fixture
   through the UI, edit its source, and verify it is not recreated in Stored repositories.
   PASS: complete persisted graph, only selected root updates, original navigation
   intact and forgetting leaves source untouched. FAIL: background cross-root jobs,
   deleted local records returning or source deletion.

8. **Optional BYOK regression.** Only if desired, reconnect networking. Prepare a
   Groq/OpenAI explanation preview, edit its selected evidence and wait for refresh.
   PASS: old approval disappears/requires preparation again, and refresh makes no
   provider request. Prepare/approve a new exact payload to check grounded citations;
   unchanged evidence can reuse its digest cache, changed evidence cannot reuse the
   old answer. Provider failures must leave deterministic operations functional.
   FAIL: old approval is transmitted after evidence changes or refresh calls AI.

## Automated verification

Verification on Windows x64:

- `pnpm exec next typegen`, `pnpm exec tsc --noEmit`, `pnpm lint` — PASS.
- `pnpm test` — PASS, 66/66, including nine Phase 07 tests. Comparisons retain
  every canonical field, hash, range, ID and diagnostic; nothing semantic is normalized away.
- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`,
  `cargo check --manifest-path src-tauri/Cargo.toml --locked` — PASS.
- `cargo test --manifest-path src-tauri/Cargo.toml --locked` — PASS, 25/25.
- Static Next build and `pnpm desktop:verify-assets` — PASS; 11 bundled fonts.
- `pnpm desktop:smoke` and `pnpm desktop:smoke --release` — PASS. Both launch the
  bundled Node runtime on a Windows root with spaces, exercise actual watching,
  incremental updates, degraded status and shutdown alongside existing persistence,
  evidence, impact, explanation-digest/cache and forgetting checks. Engine source,
  staged and release hashes match.
- `node scripts/parse.ts . --out <temporary-output>`, `node scripts/map-counts.ts
  <temporary-output>`, `node scripts/insights.ts <temporary-output> lib/parser/index.ts`,
  `node scripts/engine.ts . --out <temporary-output>` — PASS: 94 files, 245 import
  relationships and no dangling folded/open map endpoints.
- `node scripts/benchmark-refresh.ts <temporary-output>` — PASS; measurements above.
- `git diff --check` — PASS.

- `pnpm desktop:build` and final `pnpm exec tauri bundle` — PASS: Windows x64 MSI
  and NSIS installers. Final engine-only reader updates were restaged and smoke-tested
  before rebundling the already-built native application.

Manual desktop acceptance remains the user's task. macOS/Linux watcher/package qualification and
formal pilot trials are outstanding. No Phase 08+, new dependencies, commits or
pushes were made.
