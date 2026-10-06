# Phase 09 — watcher and ranking acceptance repair

## Confirmed causes and fixes

`control_watching`, `rank_snapshot` and `cancel_ranking` were registered in the
Rust invoke handler but absent from both the application command manifest and the
main-window capability. Tauri denied these requests before executing the handlers.
The repair declares and permits only those three existing app-owned commands;
no renderer shell/filesystem permissions are added.

Separately, snapshot identity hashed raw `JSON.stringify` output. Rust's
`serde_json::Value` transport sorts object keys; the UI hashed a different byte
sequence from the engine despite identical snapshot values. Both now hash the
same shared canonical JSON serialization. Only object-key order is normalized.
Every value and array order remain included. Changed snapshots and invalid
witnesses remain rejected. SQLite snapshots need no migration or deletion.

Watching is not a ranking prerequisite. A paused/unavailable watcher leaves the
current valid snapshot usable. Starting watching after reopening still performs
the protected full bootstrap; actual snapshot changes invalidate old requests.
No model training, artifact modification, new package or qualification claim.

A worker-start timeout also cleaned up before setting its failure reason. Cleanup
could reject initialization as `cancelled`, which told the controller to stop
without inspecting candidates. The repair records `inference_failure` before
cleanup, so genuine initialization failure uses deterministic candidates. Explicit
user cancellation still stops. The 1000ms startup and 200ms scoring limits are
unchanged; a forced startup-timeout test covers this distinction.

## Windows retest

1. Close all old development/release instances. From PowerShell:

   ```powershell
   Set-Location -LiteralPath 'D:\Repositorios Github\cartograph'
   pnpm start
   ```

   This rebuilds packaged frontend/engine assets and the native development app.
   Alternatively launch the rebuilt release:

   ```powershell
   & '.\src-tauri\target\release\codebase-intelligence-desktop.exe'
   ```

   Do not launch an older installed copy. Updated installers are under
   `src-tauri/target/release/bundle/msi` and `bundle/nsis`.
2. Open/reopen the fixture from [the Phase 09 guide](phase-09-laya.md). Wait for any
   bootstrap refresh to finish. Confirm **6 files / 6 relationships**. Diagnostics
   should report Watching; no `Command not found`/`not allowed` error.
3. In Investigate, enter **Locate authentication implementation**, filter/select
   Starting point **entry.ts**, expand Ranking configuration, set **depth 8** and
   **node budget 2**. Choose **Deterministic** and Investigate locally.
   PASS: `a-noise.ts`, then `z-authentication/index.ts`.
4. Choose **Laya Local** without changing the goal/start/limits and run again.
   PASS: `z-authentication/index.ts`, then `z-authentication/service.ts`;
   model **laya-nav-1**, **Fallback: none**. Expand both verified witnesses and
   inspect source. Inspection order alone does not establish an edge.
5. Repository actions → **Pause watching**. Repeat step 4. The same result must
   work without refreshing or enabling watching.
6. Diagnostics → Developer controls → **Simulate watcher loss**. A watcher warning
   is expected. Return to Investigate and repeat step 4. The same valid snapshot
   must still rank normally; the watcher warning must not become a ranking error.
7. Repository actions → **Resume watching**; wait for Watching. Edit/save a fixture
   file locally (for example add a comment), wait for publication, inspect its
   updated source hash, then rerun with the current snapshot. Restore the comment
   and allow the refresh to finish. Do not expect an in-flight request using an
   older snapshot to succeed: rejecting it preserves freshness.
8. Disconnect internet, restart/reopen the fixture, repeat steps 3–6. No provider
   configuration is required. Continue the existing cancellation and
   missing/corrupt-model backup/restore tests in the Phase 09 guide.

FAIL: command denial, ranking depends on watcher availability, wrong ordering,
hidden fallback, changed model pin, or obsolete snapshot results accepted.
Windows manual acceptance remains yours. macOS/Linux and formal pilot gaps stay open.

## Regression checks

The full JS suite checks every invoke-handler command against the explicit build
manifest and capability. The fixture test exercises native-like key ordering,
browser Web Crypto/engine identity equality, stale-value rejection and ranking
without a watcher. Staged/release smoke runs use the bundled runtime and real
private IPC, SQLite reopen, six-file fixture, actual watcher start/pause/loss and
both ranking modes. The smoke client correlates replies to requests and does not
mistake bootstrap publication/progress events for command replies.

## Final automated results

- Next type generation, strict TypeScript and lint: PASS.
- `pnpm test`: 89/89 PASS; `pnpm exec node --test tests/phase-09.test.ts`: 12/12 PASS.
- Rust format/check/locked tests: PASS, 26/26 tests.
- `pnpm desktop:prepare` / static build / offline assets: PASS, 11 bundled fonts.
- Final `pnpm desktop:smoke` and `pnpm desktop:smoke --release`: PASS, including
  the exact six-file/six-relationship fixture and real watch start/pause/loss.
- `pnpm desktop:build`: PASS; rebuilt Windows x64 MSI (245.24 MiB) and NSIS
  (234.15 MiB), bundled runtime/model and offline WebView installer.
- All 13 source/staged/release inference, identity, controller and protocol hashes
  match. Model SHA-256 is unchanged:
  `aa499934b8197fb12c36eec2b367c523d5a6da77b439ab58dc4b30bb46ea3513`.
- `git diff --check`: PASS.

During development the strict capability expectation was updated to include the
three explicit permissions, and the new smoke watch-response correlation was
corrected. A release-smoke attempt concurrent with installer compression returned
the bounded `timeout` fallback instead of the expected missing-model reason.
Final staged/release runs were executed sequentially after packaging and passed
without increasing deadlines, weakening assertions or changing the pinned model.
