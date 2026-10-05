# Phase 02 desktop operation and acceptance

Phase 01 was accepted before this work. Phase 02 replaces the active Next web
routes with a static desktop frontend. The React Flow/dagre canvas, categories,
folding, route table, detail navigation and deterministic graph utilities are
reused. Supabase/GitHub libraries and historical migrations remain isolated
legacy evidence/scripts pending Phase 03. No cloud route, authentication gate,
external AI operation, SQLite database, durable snapshot or watcher is added
to the desktop path.

## Build and run

Development prerequisites: Node 24+, pnpm, Rust/Cargo, and platform-specific
Tauri prerequisites. On Windows, use MSVC build tools and WebView2. Installed
applications bundle Node and their runtime dependencies; they do not require
Node, pnpm, Rust, repository packages or cloud configuration.

Run all commands from the checkout:

```powershell
Set-Location -LiteralPath 'D:\Repositorios Github\cartograph'
pnpm desktop:dev
```

This prepares the runtime, exports static assets, then runs Tauri. It uses no
Next development server or loopback intelligence server. `pnpm dev` remains
a frontend-only preview; native repository selection requires Tauri.
`pnpm start` is now an alias for the desktop development launcher.

```powershell
pnpm desktop:build
```

Packages are generated beneath `src-tauri/target/release/bundle/` (Windows MSI
and NSIS installers). The release executable and bundled resources also reside
beneath `src-tauri/target/release/`. Use an installer for acceptance rather than
copying the main executable alone. Windows installers include the offline
WebView2 installer. Native installer tools and build assets can require network
access during packaging; ordinary installed analysis does not.

The packaging script copies the host Node executable, its LICENSE, the engine
sources and only ts-morph's runtime dependency closure into generated resources.
Staging uses `src-tauri/resources/generated/engine/`, which the existing read
policy excludes when this checkout itself is analyzed.
It validates the Node/Rust architecture pair. Build natively for each target;
this command does not produce other platforms' packages from Windows. If a
Linux/macOS Node installation lacks a sibling LICENSE file, set the build-only
`CODE_INTELLIGENCE_NODE_LICENSE` to that distribution's LICENSE file. Runtime
packages carry their own included license files.

No `.env.local`, Clerk organization, Supabase project, or AI key is needed.
Existing `.env.local` can remain for legacy scripts; its contents are not copied
into the runtime resources. Static-asset checks reject cloud credential/config
markers. The native launcher clears the environment, then supplies only the
selected root and, on Windows, the OS `SystemRoot` needed by Node cryptography.
It does not inherit PATH, cloud credentials or NODE_OPTIONS.

## Native and engine boundary

The only renderer commands are select repository, start/cancel analysis, read
snapshot evidence and query snapshot structure. Only the local main window is
authorized. It cannot invoke shell/dialog/filesystem plugins, choose executables,
pass process arguments or authorize a root by typing a path. Native selection
creates a transient repository handle. One repository is selected per window;
conflicting analyses and selection while a job is running are refused.

Native code launches the bundled interpreter with a fixed application entry
point, over stdin/stdout NDJSON. Protocol v1 requires request/job IDs and bounds
requests to 16 KiB and events to 32 MiB. Invalid frames/versions fail closed.
The engine validates snapshots; native code checks the selected root and entity
IDs; the renderer validates returned contracts before displaying results. Source
requests are restricted to the current snapshot's file IDs and Phase 01 policy.
Engine stderr is captured in a transient 16 KiB buffer. Crash messages include
the last stage, exit code/signal and recognized runtime causes (including Node
filesystem/module errors, CSPRNG initialization and heap exhaustion). Raw stderr,
source excerpts, arbitrary paths and credential values are not sent to the UI,
logged or persisted; unrecognized content is withheld. Progress from replaced
or cancelled jobs is ignored.

Cancellation kills the interpreter, interrupting synchronous parsing without
blocking the UI. Crash/cancel invalidates its in-memory snapshot and permits a
new analysis. Closing the app kills its child. Native navigation rejects external
origins and new windows; CSP blocks network connections except Tauri IPC. Engine
code has no cloud imports, executes no repository code and rejects fetch.

All analysis data and source evidence are held in memory. Closing or restarting
the application requires selecting and analyzing again. Only theme preference
is saved in the local WebView settings store. No source files are copied by
analysis, and no SQLite or source archive is created.

## Terminal checks

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

Tests include Phase 01 parser/graph checks and Phase 02 invalid protocol/version,
root authorization, bounded frames, stale jobs, non-Git directories, source hash
freshness, process termination/retry, empty directories and capability checks.
The smoke test invokes the bundled runtime with an empty PATH and no cloud
credentials or repository dependencies, validates the resulting graph, and
checks clean pipe shutdown. Static checks verify local font assets and reject
cloud credential/configuration markers. Native tests cover protocol envelopes,
path escapes and state/pending-request invalidation. They do not substitute for
the manual UI/installer checks below.

Native tests also launch the actual shell plugin with a mock Tauri runtime
(no GUI), canonical Windows paths containing spaces and the production launch
helper. They check the restricted environment, clean shutdown, and real Node
bootstrap stderr/exit reporting. Node-only child-process tests cannot establish
this boundary: Node silently restores Windows OS environment variables.

After building, `desktop:smoke --release` tests the interpreter and engine
resources copied into the release directory, rather than only the packaging
staging directory. Neither smoke command opens the UI or performs the manual
acceptance checks.

## Windows startup repair and reproduction

The blocked manual run exposed two independent startup faults:

- Rust's completely cleared environment removed `SystemRoot`, causing Node
  24.19.0 to abort with `ncrypto::CSPRNG(nullptr, 0)` and exit 134. Preserving
  only that required OS path fixes initialization without inheriting credentials.
- Tauri's resource directory can use `\\?\` paths. Passing that prefix on the
  entry script makes Node's main-module loader fail with `EISDIR`/`lstat` and
  exit 1 before engine code runs. Only the application-owned entry argument is
  normalized to a standard drive/UNC path. Repository root authorization remains
  canonical; the engine still uses its native realpath verification.

The shared production launcher was verified against
`D:\Repositorios Github\bond-landing-page`: 17 files and 20 verified import
edges, followed by clean shutdown. To repeat that read-only native test:

```powershell
Set-Location -LiteralPath 'D:\Repositorios Github\cartograph'
$env:CODE_INTELLIGENCE_TEST_ROOT = 'D:\Repositorios Github\bond-landing-page'
try {
  cargo test --manifest-path src-tauri/Cargo.toml shell_plugin_launches -- --nocapture
} finally {
  Remove-Item Env:\CODE_INTELLIGENCE_TEST_ROOT
}
```

Without this test-only variable the regression test uses its own tiny fixture.
This does not open a window, execute repository code, modify the selected
repository, add a renderer command, or replace manual UI acceptance. Rebuild
and reinstall the Windows package before retrying the installed app: existing
installations still contain the earlier native launcher.

## Manual acceptance — user performed

Install the generated Windows package, disconnect internet, and launch Codebase
Intelligence from its installed shortcut. End-user startup must not depend on
this checkout or `.env.local`. You may use this Cartograph checkout as your real
repository; also use a small folder containing TS/JS files without `.git` or
`node_modules` to verify those are unnecessary.

1. **Startup/open:** click Open repository and select the folder in the native
   picker. Expect select → parse → validate progress, then the map and file
   counts. PASS: no login, provider prompt or cloud access; the window remains
   responsive. FAIL: startup requires accounts/system Node or analysis hangs.
2. **Graph:** expand/fold groups, select files, select categories, and click
   imports/dependents in Details. Use Dependency chain and Blast radius.
   PASS: selections/highlights and counts remain coherent, navigation reveals
   the chosen file, and layout remains usable. These are dependency relations,
   not claims of execution flow.
3. **Routes:** select Routes, inspect declarations, and click a declaring file.
   PASS: only recovered routes appear; withheld/omitted routes are disclosed.
   A repository with no supported routes can legitimately show none.
4. **Evidence:** select a file → Evidence → Read / recheck source. PASS: matching
   source is shown with line numbers, hash confirmation and import/route
   provenance. Edit that file outside the app, then recheck: it must say changed
   and show no current source. Delete/deny access to it: it must say unavailable.
   Analyze again after restoring/editing to obtain a matching snapshot.
5. **Coverage:** click Coverage & diagnostics. Inspect skip, exclusion,
   unresolved-import, config and omitted/withheld-route entries. Use pagination
   if present. PASS: every entry is accessible, with paths, reasons/details and
   locations where available; counts do not imply complete support.
6. **Cancel/retry:** use a sufficiently large repository, click Analyze again,
   then Cancel during progress. PASS: UI stays responsive, shows cancellation,
   clears unavailable results, and Analyze again succeeds. Only one job runs.
7. **Crash/retry:** during an analysis, terminate only its `code-engine.exe`
   process in Task Manager. PASS: the app reports engine exit, remains usable,
   and Analyze again starts a fresh process. Do not terminate unrelated Node
   processes or run unknown repository binaries.
8. **Theme/restart:** choose light/dark/system, close and reopen the app. PASS:
   theme persists; analysis results do not persist in this phase. Select and
   analyze again offline.
9. **Unusual roots:** open an empty folder and a folder with only unsupported
   language files. PASS: explicit no-supported-files result, not fabricated
   nodes. Try a directory you cannot access: selection or analysis must fail
   clearly and allow another selection/retry.
10. **Shutdown:** while analyzing, close the app. Inspect Task Manager afterward.
    PASS: its `code-engine.exe` child is gone. FAIL: a child remains running.

## Platform status

Implementation supports native packaging on Windows, macOS and Linux. Only the
current Windows x64 host is available for terminal verification here. macOS and
Linux packages and UI acceptance are untested and must not be reported as passed.
They require their native Tauri prerequisites and the same acceptance steps.
The three-platform pilot gate remains Phase 04. Signing/notarization and durable
analysis are outside this phase.

## Verification record — Windows x64

Automated verification on this host passed: `pnpm exec next typegen`,
`pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm test` (24/24, including parser
round-trip/graph scripts), `pnpm desktop:prepare` (static build and 11 bundled
font assets), `cargo check`, `cargo test` (8/8), and `cargo fmt -- --check`
using the manifest commands above. Bundled-runtime smoke checks passed with
the Windows extended-length root format, no PATH, no cloud configuration and
no repository dependencies. `pnpm desktop:build` produced both Windows x64
MSI and NSIS installers with an offline WebView2 installer.

The manual acceptance steps above have **not** been performed by the agent.
Windows UI/installed-app acceptance and all macOS/Linux verification remain
pending. Automated success does not mark those checks as passed.
