# Windows review — desktop UI redesign

This is a presentation update during Phase 09 acceptance, not a new product phase.
The parser, graph, SQLite, watcher, ranking/model, IPC and native BYOK boundaries
are unchanged. Windows UI acceptance remains yours; macOS/Linux qualification and
formal pilot trials remain outstanding.

## Launch

Close any older app instance. In PowerShell:

```powershell
Set-Location -LiteralPath 'D:\Repositorios Github\cartograph'
pnpm start
```

Wait for engine packaging and the static frontend build, then the Tauri window.
No repository packages, credentials or cloud connection are needed. For the rebuilt
release instead, from the same directory:

```powershell
& '.\src-tauri\target\release\codebase-intelligence-desktop.exe'
```

The MSI and NSIS installers are under `src-tauri/target/release/bundle/msi` and
`src-tauri/target/release/bundle/nsis`. Do not run development and release instances
against the same stored repository concurrently.

## Navigation and review

1. **Project:** click Open repository in the sidebar; choose this repository or
   the existing Phase 09 fixture. Recent repositories remain in the selector below.
   Repository actions in the header contains Full refresh, Reopen stored analysis,
   Pause/Resume watching, and Forget (with the existing confirmation).
2. **Map:** pan/zoom, open and close folded groups, select a file, and inspect its
   right-hand details. Open Categories at the top-left of the canvas to filter.
   Clear selection to see the compact repository overview; expand Dependency
   statistics for the detailed lists. Switch away and back: selection, folding
   and viewport should remain. A new snapshot still resets the analysis view.
3. **Investigate:** enter a goal in the prominent textarea. Filter Starting point
   by filename/path, then select the exact analyzed file. Alternatively select a
   file in Map and use Use selected start file. Expand Ranking configuration to
   choose Laya Local or Deterministic, depth and node budget. Run Investigate
   locally. Results show the submitted goal, model, inspected count and timing.
   Every bounded result is identified. Fallback is always visible, including none.
4. Expand each result's Verified structural witness. Each inspected candidate has
   its own path from the starting point; the numbered inspection order does not
   imply edges between consecutive inspected nodes. Open file goes to Map;
   Inspect evidence and Inspect witness source go to Evidence. Use the Evidence
   file selector, return to Investigate and inspect another candidate: it must
   show that new candidate, not the previous selection. Read / recheck source
   retains the existing hash verification and stale/unavailable states.
5. **Structural Ask Codebase** and **Static call traces** are separate disclosures
   below the main Investigate workspace. All existing question types, export/path
   search, disambiguation, traces and explanations remain available. Static call
   traces retains its own expansion and bounded declaration controls.
6. **Impact:** choose a changed file and Inspect change impact. Expand Depth and
   result limits to configure bounds. Inspect verified incoming witness paths and
   omissions. Laya does not change these deterministic structural results.
7. **Routes:** use the existing route table, hover and source/detail navigation.
   **Evidence:** choose an analyzed file, read/recheck source and expand provenance.
   Hashes/extractors are available here rather than the primary navigation.
8. **Laya:** read its role and qualification limits, then Start an investigation.
   It makes no installation-based claim of model availability. Continue the
   valid-model, unsupported-goal, cancellation and missing/corrupt-model tests in
   [the Phase 09 guide](phase-09-laya.md). Their runtime commands are unchanged;
   mode/depth/budget are now inside Ranking configuration. For the fixture use
   the same goal/start/budget/depth and expected ordering recorded in that guide.
9. **AI explanations:** provider/model/native secure credential settings have
   their own page. Request an explanation from file/folder details or structural
   Ask/Impact. The exact provider endpoint and payload approval dialog must appear
   even when that request begins in another workspace. Cancel first, then approve
   a separate request if desired. Credentials, source exclusions, generated-result
   labels and citations retain their previous acceptance rules.
10. **Diagnostics:** inspect raw runtime status, snapshot time, last refresh and
    coverage. Expand Resolution and syntax details for the full report. Developer
    controls contains Simulate watcher loss. Confirm an intentional warning with
    its technical error disclosure; recover using Repository actions. No fake
    current/offline/available indicator should appear.
11. **Settings:** change system/dark/light theme. **Pilot measurements:** start a
    task timer, navigate away, return and finish it. Existing local-only numeric
    records and deletion remain available.
12. Resize to the supported minimum (1000×600) and to 1440×900 or larger. Test both
    themes, Tab focus, Enter/Space buttons/disclosures and keyboard file selection.
    Investigate stacks at narrower sizes; larger windows have separate result
    scrolling. Long paths, evidence and diagnostics must remain accessible without
    forcing the whole application horizontally beyond the window.

**PASS:** every previous acceptance workflow works through the new hierarchy,
results/fallback/gaps are honest and visible, approval cannot be bypassed, and
controls remain usable at supported window sizes. **FAIL:** lost actions, hidden
fallback, fabricated path connections, stale selection, clipped inaccessible
content, lost timers merely from navigation, or any privacy/security regression.

This review does not complete the outstanding platform or pilot qualification.

## Automated verification record

Windows x64, Node 24.19.0:

- `pnpm exec next typegen`, `pnpm exec tsc --noEmit`, `pnpm lint`: PASS.
- `pnpm test`: PASS, 87/87 existing JS tests, including parser/evidence/privacy,
  persistence, watcher, ranking/model and provider boundaries.
- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`,
  `cargo check --locked --manifest-path src-tauri/Cargo.toml`,
  `cargo test --locked --manifest-path src-tauri/Cargo.toml`: PASS, 26/26 tests.
- `pnpm desktop:prepare`: PASS (bundled engine/Node, `pnpm build` static frontend,
  `pnpm desktop:verify-assets`, including 11 bundled fonts).
- `pnpm desktop:smoke`: PASS, actual staged runtime/model and existing local
  storage/evidence/Impact/watcher/BYOK metadata boundaries under cleared environment.
- Browser-only shell review: rendered at 1440×900; at 1000×600 the document width
  remained 1000px with usable workspace bounds. This was an empty static browser
  view, not native repository-loaded UI acceptance.
- No model retraining, new packages or runtime/security changes. Pinned artifact
  SHA-256 remains `aa499934b8197fb12c36eec2b367c523d5a6da77b439ab58dc4b30bb46ea3513`.

One concurrent release-smoke attempt failed at the expected first ranking step
because the returned inspected list was empty. A temporary diagnostic copy (then
deleted) reran the unchanged assertions successfully: `b.ts`, one verified witness,
no fallback, not cancelled. The original failure did not reproduce in that run;
concurrent build load is a possible timing factor, not a confirmed root cause.
No test, engine timeout or fallback contract was weakened to obtain a pass.

Final verification after the latest packaging completed:

- `pnpm desktop:build`: PASS; rebuilt Windows x64 MSI (245.24 MiB) and NSIS
  (234.14 MiB), including offline WebView installer, Node runtime and pinned model.
- `pnpm desktop:smoke --release`: PASS using the original, unmodified smoke script.
- SHA-256 comparisons: all 12 source/staged/release artifact, manifest, inference,
  controller and protocol files match. `git diff --check`: PASS (only normal
  LF-to-CRLF conversion notices).

The intermittent concurrent smoke failure remains documented; these passing
reruns do not establish its cause or claim a runtime repair.
