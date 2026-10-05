# Phase 04 — Investigation delivery and pilot qualification

Phase 03 automated and manual acceptance was confirmed by the user. Phase 04
adds deterministic investigations and optional local numeric measurements.
**PILOT-READY MVP is not yet qualified.** The user accepted Phase 04 Windows
manual acceptance. macOS/Linux installed-package acceptance and the developer
task trials below remain required.
Do not infer qualification from a passing build or a development window.

## Implemented boundaries

Investigations run in the local engine against a validated complete snapshot,
not canvas nodes, layout or folded groups. Search uses known paths/export names
and adapter convention roles/route declarations. Exact paths win; duplicate
filenames/export names return candidates without silently choosing one.
Dependencies, dependents and traces use deterministic breadth-first traversal.
Each returned shortest witness contains existing relationship IDs, shown with
their original source, target, first source site, hash and extractor. Incoming
impact witnesses read in import direction, from dependent to changed file.
Type-only imports count. Cycles/self-loops terminate and do not count the
starting file again. No calls, runtime ordering, TESTS edges or behavioral flow
relationships have been added. Related-test candidates are not displayed.

Ask Codebase exposes explicit supported intent and target controls. It does not
parse unrestricted natural language. Blank targets list routes/export names;
the other supported operations need a snapshot file. Unsupported questions and
unknown/ambiguous targets produce honest limits. Search never creates edges.
Depth (0–64) and result budgets (1–200) limit returned results; traversal still
scans the complete stored file graph to report exact omission counts. Diagnostics
shown alongside answers include skipped/unresolved/configuration boundaries,
with overflow linked to the complete coverage panel. External imports are
outside the internal graph. Missing relationships do not prove absence.

The renderer checks query results against canonical snapshot evidence before
presenting claims. Inspect buttons reuse graph/details navigation. Source reads
continue to require matching hashes: refreshing a stale file does not silently
change a historical witness. Reopening/refreshing replaces investigation state
with the corresponding snapshot. Queries cannot run during refresh.

SQLite schema version 2 adds only `pilot_measurements`; the existing transactional
migration mechanism preserves version-1 repository data. Records contain exactly:
category (`understanding`, `impact`, `ask`), elapsed milliseconds (1–86,400,000),
usefulness (1–5), discovered/missed counts (0–100,000), and application version
supplied by native code. No timestamps, repository identifiers, free-text notes,
paths, questions, source, graph contents, keys or remote transport are included.
The optional task timer uses a monotonic clock; recording/reset errors remain
within the measurement UI and do not gate intelligence. Reset deletes only
measurement records. The UI shows the latest 1,000 and discloses the total count.

No new dependencies or external providers are needed. No Phase 05+ functionality
is implemented. Historical Supabase SQL remains untouched.

## Commands and build hosts

On Windows run from `D:\Repositorios Github\cartograph`:

```powershell
Set-Location -LiteralPath 'D:\Repositorios Github\cartograph'
pnpm exec next typegen
pnpm exec tsc --noEmit
pnpm lint
pnpm test
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
pnpm desktop:build
pnpm desktop:smoke
pnpm desktop:smoke --release
pnpm pilot:benchmark
git diff --check
```

`desktop:build` runs `desktop:prepare`, including `pnpm build` and offline
asset/privacy checks. Developer prerequisites remain Node 24, pnpm and the
platform Rust/Tauri toolchain. The package uses the host Node runtime and Rust
architecture; it refuses mismatches. If the Node distribution omits its LICENSE,
set `CODE_INTELLIGENCE_NODE_LICENSE` to that distribution's LICENSE file before
packaging. Do not use a different architecture's runtime or a fabricated license.

On macOS/Linux change to the checkout root with `cd`, then run the same commands
above without the Windows `Set-Location` line. Use native hosts with their
[Tauri build prerequisites](https://v2.tauri.app/start/prerequisites/).
Packaging/distribution details are in the
[Tauri distribution guide](https://v2.tauri.app/distribute/).
Do not substitute a Windows cross-compile for installed macOS/Linux acceptance.

Generated packages are under `src-tauri/target/release/bundle/`:

- Windows: `msi/` and `nsis/` installers.
- macOS: native `.app` and `.dmg` outputs, when successfully built on that host.
- Linux: distro packages/AppImage outputs available on the build host.

Installed apps contain Node, parser dependencies, frontend assets and fonts;
they require no developer Node/pnpm/Rust installation, repository package install,
account, provider key or `.env.local`. Windows packages include the offline
WebView2 installer. macOS uses the system WebView; Linux still needs compatible
OS WebKit/GTK/system libraries. Record actual runtime/library prerequisites from
the accepted package/distro rather than claiming all distributions work.
Signing/notarization and OS distribution restrictions must be recorded honestly;
credentials are a release prerequisite where the chosen delivery path requires
them. No credentials or release approval are fabricated here.

## Installed-app manual acceptance

Perform every step on **each installed platform**, not only `pnpm start`.
For development troubleshooting only, `pnpm start` launches the current app.
Close development windows before checking the installed version to avoid
confusing processes. Install the built package using the platform's installer,
launch from its installed shortcut/app, and record artifact/version/architecture.
Keep the test repository already present locally. Disconnect network access for
the whole intelligence test; do not install its dependencies or run its scripts.

Cartograph itself is a valid real TS/JS test repository. Use a disposable copy
for edits/deletes/process-interruption tests; never delete the original code.

1. **Startup/open:** launch the installed app, open a local repository and wait
   for publication. PASS: header, graph, coverage and details work without
   credentials/network/developer Node. FAIL: blank window, cloud prompt or
   missing bundled engine. Record elapsed time from directory confirmation until
   the first inspectable graph/answer; this is installed time to first useful
   result, unlike the engine-only timing below.
2. **Search/selection:** click **Investigations / Ask** beside Map/Routes. Search
   `DesktopExplorer` with **Export names**, then choose the exact returned path.
   Click a returned file to reveal it on the graph and in Details. Return to the
   investigation tab; its answer remains available. Search with **Convention
   entry points** and an empty search to see adapter-reported entries. PASS:
   only known snapshot files appear and no behavioral relationship is implied.
3. **Ambiguity/unknown:** choose **Dependency trace**, enter a duplicate filename
   or export name (e.g. `default` if this snapshot reports several), and click
   **Answer from evidence**. PASS: explicit candidates, no automatic target.
   Choose an exact target and ask again. An absent name such as
   `not-a-real-snapshot-file.ts` must return unknown, not fabricated files.
   If the chosen real repository has no duplicates, use another local TS/JS
   test repository with two files exporting the same name.
4. **Trace:** use `components/desktop-explorer.tsx` as target, depth 4, budget 50.
   Expand result rows. Follow each import step and inspect its source/hash via
   Details → **Evidence** → **Read / recheck source**. PASS: every displayed source/target/line
   exists in snapshot evidence, and the UI labels dependency structure rather
   than runtime execution. Graph folding/categories must not alter answers.
5. **Impact:** choose **Change impact / dependents** with `lib/engine/types.ts`.
   Compare depth 1 and 4; use a large enough graph and budget 10 to exercise
   omission disclosure. Inspect shortest witnesses from affected files back to
   the target, including type-only imports. PASS: deterministic shortest paths,
   explicit depth/budget omissions, compile-time wording and cycle termination.
   Zero dependents in a disconnected component is allowed; incomplete coverage
   must not be advertised as proof of no impact.
6. **Other structural answers:** ask **dependencies**, **routes** and **exports**.
   Routes/exports with a blank target list snapshot declarations/names. Select
   **Other question (unsupported)**. PASS: unsupported behavior explains the
   supported scope, without an LLM or guessed execution flow. Inspect coverage
   diagnostics and verify skipped/unresolved limitations remain visible.
7. **Freshness/restart/recovery:** edit/delete a disposable parsed source after
   a completed snapshot. A witness remains historical; its source recheck must
   be stale/unavailable. Close/reopen offline, select the stored repository,
   repeat an investigation, then explicitly refresh. Interrupt a subsequent
   refresh as described in Phase 03 and reopen the previous complete snapshot.
   PASS: no mixed old graph/current source claims, no partial published result,
   and reopened investigations remain available after engine recovery.
8. **Measurements:** click **Pilot measurements**. Pick a category, **Start task
   timer**, finish an investigation, reopen the panel, then **Finish task**.
   Select usefulness and manually enter numeric discovered/missed counts before
   **Save numeric feedback**. **View local records** after restart must show
   only the six permitted fields. **Reset local records** after confirmation
   must leave repository snapshots, settings and source untouched. PASS:
   recording is optional/local and intelligence remains usable if it fails.
9. **Empty input:** open an empty directory. PASS: honest empty snapshot,
   unknown targets, empty route/export answers, useful limits and no crash.

FAIL qualification if any witness is invented, a stale source is presented as
current, intelligence sends data over the network, measurement admits source
payloads, or any required platform/installed test is missing.

## Pilot trial protocol

Use real repositories and matched tasks. Keep task assignment and human ground
truth in a local worksheet outside product measurements. Do not upload source
or repository-derived notes. The application does not collect this worksheet.

- Understanding task: locate a subsystem's entry point, identify its dependency
  chain and explain which relationships are verified versus unresolved.
- Impact task: identify incoming transitive file dependents for a chosen change,
  show witness paths, and state type-only/coverage limits.
- Ask task: answer a supported dependency, route or export question with evidence.

Before trials, a human reviewer establishes expected verified relationships and
known analysis gaps by inspecting source. A missing dependency is counted only
against that manual ground truth. Distinguish unsupported analysis from wrong
answers; do not treat an empty incomplete graph as ground truth.

Time a baseline using the developer's usual editor/search workflow and a matched
product trial. Counterbalance task/order across participants or repositories so
the product does not benefit solely from the baseline's learning. Stop timing
when the participant reaches a usable evidence-backed answer, or record an
incomplete trial separately. Use the optional product timer and 1–5 usefulness
rating; enter discovered/missed numeric assessments after review. Track baseline
durations, task pairing and trial order in the external local worksheet, not by
adding free-text fields to product measurements.

Measure Time-to-Understanding, Time-to-Impact, answer usefulness and assessed
discovered/missed dependencies. Observe repeated voluntary use over subsequent
sessions: record whether participants choose to return without prompting in the
local trial worksheet. This is not inferred from startup counts or analytics.
Report provisional distributions/sample size and incomplete trials; do not
declare permanent speedup thresholds from these initial observations.

## Qualification ledger

| Platform | Build/CPU/OS evidence | Installed offline workflow | Pilot task trials |
| --- | --- | --- | --- |
| Windows | Windows 10 Pro 10.0.19045 / x64; Rust target x86_64-pc-windows-msvc; Node 24.19.0; WebView2 154.0.4258.53; package outcome recorded below | Phase 04 manual acceptance accepted by user | Pending |
| macOS | Unavailable in this Windows session; unqualified | Not run | Not run |
| Linux | Unavailable in this Windows session; unqualified | Not run | Not run |

For each accepted platform record: actual OS version/build, CPU/Rust target,
package format/hash, application/bundled Node version, installation location,
signing/notarization status, runtime prerequisites, tested repository file/byte/
edge counts, first-useful-result latency and manual step outcomes. A native
x64/arm64 packaging path is not evidence that both CPU variants are qualified.

### Automated Windows verification — 2026-10-05

Passed: `pnpm exec next typegen`, `pnpm exec tsc --noEmit`, `pnpm lint`,
`pnpm test` (41/41), `cargo check --manifest-path src-tauri/Cargo.toml`,
`cargo test --manifest-path src-tauri/Cargo.toml` (12/12),
`cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`,
`pnpm desktop:build` (including `pnpm build` and offline asset checks),
`pnpm desktop:smoke`, `pnpm desktop:smoke --release`, `pnpm pilot:benchmark`,
and `git diff --check`. Git emitted line-ending warnings, not whitespace errors.

The staged and release engine smoke tests exercised persisted analysis/restart,
historical reopening, stale evidence, verified impact witnesses, numeric
measurement recording/reset, and repository forgetting without PATH, cloud
configuration or repository-installed dependencies. These are automated engine
checks, not installed GUI acceptance or human pilot trials.

Historical Phase 04 Windows x64 build artifacts (application 0.1.0, bundled
Node 24.19.0; later builds replace these output paths):

| Artifact under `src-tauri/target/release/bundle/` | Bytes | SHA-256 |
| --- | --- | --- |
| `msi/Codebase Intelligence_0.1.0_x64_en-US.msi` | 255,003,982 | `BE94A2B17E7C2B4D250970341C7B01215E37A96198512C2802E28BFC4ED3017F` |
| `nsis/Codebase Intelligence_0.1.0_x64-setup.exe` | 243,885,085 | `022BF482D9F26297FB3F38D7513F8E8C7A74E0EE0089B1A1B6D23633FC6BBE90` |

The user subsequently accepted Windows manual acceptance. Detailed platform
qualification records and human pilot task outcomes remain required; that
acceptance does not qualify macOS/Linux or formal pilot trials.

Initial Windows terminal benchmark (single local run, no pilot participant):

| Input | Parsed files / bytes / edges | Analyze / query / first engine answer |
| --- | --- | --- |
| Current checkout | 80 / 396,916 / 192 | 1,668 / 1 / 1,669 ms |
| Generated chain | 500 / 24,149 / 499 | 1,065 / 2 / 1,066 ms |

Enforced read ceilings remain 1 MiB per file, 128 MiB aggregate reads, 20,000
code files, 200,000 directory entries and nesting depth 64. Desktop snapshots
remain capped at 31 MiB, protocol events at 32 MiB. These are safety limits,
not measured supported repository sizes. The 500-file chain's depth-64 answer
correctly disclosed 435 further reachable files. Re-run `pnpm pilot:benchmark`
on each host and keep new timings provisional; these values exclude installed
startup, selection, persistence and graph rendering.

**Phase 04 status: NOT PILOT-READY until every required ledger entry passes.**
