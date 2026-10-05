# Phase 03 — Durable local analysis

Phase 01 and Windows Phase 02 acceptance were confirmed by the user. Phase 03
adds local persistence only; investigations, watchers, BYOK and later phases
are not introduced. Its UI acceptance remains a manual user check.

## Storage and lifecycle

The native shell supplies `app_local_data_dir()/intelligence.sqlite` privately
to the fixed bundled Node engine. On Windows the default is
`$env:LOCALAPPDATA\com.codebaseintelligence.desktop\intelligence.sqlite`.
Development and installed builds share this location and repository list.
The renderer cannot choose a database path, executable or arbitrary root.
Only the native directory picker registers a new root. Reopening uses an
existing engine-owned registration; it does not require a live source root.

Node 24.19.0 ships SQLite; no native SQLite package or extra runtime is needed.
The module is experimental in Node 24 and isolated behind `AnalysisStore`.
The packaged runtime, rather than a user's system Node, determines its API.
Only the approved development type package was upgraded to Node 24.

Schema version 1 contains registrations, one last complete canonical snapshot
per repository, job outcomes, global settings (theme), and repository settings
(last-opened time for list ordering). The Phase 02 browser theme is imported
once; existing SQLite preferences win. Snapshot JSON preserves all file hashes,
provenance, routes, coverage and config diagnostics. It is validated on write
and read. No source copies, ASTs, graph projections or traversal results are
stored. Opening a stored analysis does not parse the repository.

Snapshot replacement and successful job completion share one transaction with
full SQLite synchronization. Failed/cancelled/interrupted attempts retain the
last complete snapshot. Job ownership and a partial unique index prevent
concurrent refreshes for the same repository. Cancellation/exit record changes
are scoped to the engine PID that owned the job; dead owners are recovered as
interrupted when storage is reopened. Cancellation stops the engine even when
it arrives before parsing starts. A result committed before cancellation remains
complete; an interrupted transaction is rolled back by SQLite.

Private storage requests have a 30-second deadline and a bounded number of
children. Storage errors are shown to the user. Closing the app stops both
analysis and storage processes; a later launch recovers interrupted jobs.

Ordered schema migrations run transactionally. Failed upgrades roll back;
newer schemas and incompatible/incomplete snapshot payloads are retained and
rejected, never silently replaced with empty facts. Reanalysis can replace an
incompatible snapshot using the registered accessible root. A newer database
schema requires a compatible application, rather than destructive recreation.

Evidence is read from the original repository through the protected reader and
checked against its SHA-256 hash. Changed/deleted files are stale, and policy
denials/unreadable sources are unavailable. Root redirection is rejected.
Missing/moved roots still allow historical graph inspection, with an explicit
notice; restore the original location or register its new location separately.

Forget deletes the registration and its snapshot, repository settings and job
records through foreign-key cascades. It never deletes source or remote data.
SQLite uses secure deletion of freed records; the app does not manage OS backups.
No Supabase/GitHub adapter or secret environment variable remains necessary.
Historical Supabase migrations have not been changed or executed. Reusable
explanation rendering and prompt definitions remain; external AI is disabled.

## Terminal checks

Run all commands from `D:\Repositorios Github\cartograph` in PowerShell:

```powershell
pnpm exec next typegen
pnpm exec tsc --noEmit
pnpm lint
pnpm test
pnpm desktop:prepare
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
pnpm desktop:smoke
pnpm desktop:build
pnpm desktop:smoke --release
git diff --check
```

`desktop:prepare` runs `pnpm build` and static asset/privacy checks. The packaged
smoke now exercises SQLite registration, analysis, restart, reopening after the
root moves, stale evidence and forgetting, using a path with spaces and Windows
extended-length path authority. It uses no PATH, cloud configuration or selected
repository dependencies. No command applies a remote migration.

## Manual Windows acceptance

Use a disposable copy or a small separate repository for edit/delete/rename
tests; Cartograph itself can be analyzed, but do not delete its source for tests.
All launch commands run from the workspace directory above. No `.env.local`,
Clerk, Supabase, internet access or repository dependency installation is needed.

1. Run `pnpm start`. Click **Open repository**, select your test directory, and
   wait for **Published … files locally**. Inspect selection, folding, categories,
   routes, details and coverage as in Phase 02. PASS: existing graph behavior
   remains useful and the stored timestamp/last-refresh state says complete.
2. Close the app, disconnect network access, run `pnpm start` again, and select
   the repository from **Stored repositories**. PASS: **Reopened stored analysis**,
   identical graph/diagnostics, no parsing progress. **Reopen** reloads without
   parsing; **Refresh** explicitly parses. Check theme survives restart too.
3. Select a parsed file in the graph and click **Read / recheck source** in its
   details. PASS: **Hash verified · current source**. Change that file externally
   and recheck. PASS: stale warning and no current source shown; graph remains
   the saved historical snapshot. Delete a different parsed test file and
   recheck it. PASS: stale warning, not an invented disappearance of the edge.
4. Click **Refresh**. PASS: the previous graph stays visible while parsing;
   evidence reads are disabled during refresh. Only successful publication
   switches to the updated graph. Coverage and hashes reflect the new snapshot.
5. Refresh a sufficiently large test repository; press **Cancel** during parsing.
   PASS: cancellation is shown, previous complete graph is reopened, last refresh
   shows cancelled or interrupted, and a later refresh succeeds. If publication
   finished before cancellation, that complete result is valid instead.
6. During another refresh, use Task Manager to end only this app's analyzing
   `code-engine.exe` process. Do not terminate unrelated processes. PASS: useful
   engine-exit error, previous complete graph remains recoverable, and retry
   works. Close/reopen the app and choose the stored repository: the partial
   refresh must never appear as complete. If your small test finishes too fast,
   use a larger repository and wait for parsing progress before terminating it.
   Repeat by closing the application during refresh instead. PASS: restarting
   reopens the last complete snapshot and permits another refresh.
7. Close the app, rename the disposable repository directory externally, restart
   offline, and choose its stored registration. PASS: historical graph remains
   inspectable; root-unavailable notice and stale evidence appear. Restore the
   original directory and press **Reopen**, then **Refresh**; both should work.
8. Click **Forget**, review the confirmation, and confirm deletion. PASS: the
   repository disappears from the stored list after restart, while its directory
   and remaining source files still exist unchanged. Global theme stays intact.

FAIL any check if a partial snapshot is shown as complete, a source hash mismatch
is presented as current, source files are deleted by Forget, cloud configuration
is required, or existing graph interactions stop working.

## Verification record

On this Windows checkout, Next type generation, TypeScript, lint, the static
production build and asset/privacy checks passed. The JavaScript suite passed
33/33 tests; Cargo check, all 11 native tests, and Rust formatting passed.
Both staged and release bundled-engine smoke checks passed. Release copies of
the storage implementation, private protocol and engine entrypoints match the
current source by SHA-256. Historical Supabase migrations are unchanged.
The final `pnpm desktop:build` passed and produced both Windows x64 MSI and NSIS
installers. `git diff --check` passed.

Graphical acceptance above remains for the user to perform. macOS/Linux package
and manual acceptance require their native hosts and are not claimed as passed
here; the three-platform pilot gate belongs to Phase 04.

## Startup repair

The blank development window was reproduced with `pnpm start`. WebView2 stayed
at `about:blank`, without frontend assets or the Tauri bridge. Native diagnostics
identified rejected navigation to `http://127.0.0.1:1430/`: the Tauri CLI supplies
a development asset server when `frontendDist` is used without `devUrl`, while
the old guard accepted packaged Tauri origins only. SQLite had not been reached.

Debug builds now accept the exact configured loopback development origin,
including its port. Release builds retain the packaged-origin restriction.
Unrelated loopback servers, remote origins and credential-bearing URLs remain
denied. No CSP or native capability permissions were widened. No database reset
or migration repair is required for this startup failure.

The native shell also injects a 15-second frontend initialization watchdog with
a visible Reload recovery screen. Rendering errors have local error boundaries;
native event initialization has a 10-second deadline, and storage initialization
errors offer Reload while retaining stored data. Restart with `pnpm start` to
rebuild the fixed app, then repeat the manual checks above.

The repaired `pnpm start` path was checked in the real Windows WebView: the
header, repository control, theme controls, Tauri bridge and SQLite list loaded
with no recorded runtime exceptions. A temporarily missing generated storage
entrypoint produced a visible initialization error with Reload; restoring it
recovered without resetting SQLite. Blocking hydration scripts produced the
15-second native fallback; unblocking/reloading restored startup. These startup
diagnostics do not replace the repository manual acceptance checks above.
