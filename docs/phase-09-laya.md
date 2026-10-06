# Phase 09 — local Laya delivery and Windows acceptance

For the watcher/command-permission and snapshot-identity acceptance repair,
follow [the runtime repair and Windows retest guide](phase-09-runtime-repair.md).

The presentation has been redesigned during acceptance. Use the
[UI review guide](ui-redesign-review.md) for the new navigation and control
locations; the runtime/model tests below are unchanged.

Phase 08 is accepted on Windows. Phase 09 supplies a trained artifact, local
worker and desktop ranking workflow. Windows manual acceptance of this phase is
pending; macOS/Linux qualification and formal pilot trials remain outstanding.
No package additions, commits, pushes, repository uploads or new providers.

## What is delivered

The existing deterministic engine creates verified outgoing file candidates.
`laya-nav-1` scores those candidates using sixteen lexical/topology features in
a trained 16→16 tanh→1 network. The Phase 08 controller chooses a bounded order,
validates IDs/scores/identities and retains canonical evidence witnesses. This is
a small original Laya-inspired local decision model, not a general language model.
The graph, routes, symbol traces and exhaustive Impact are never model outputs.

The model is bundled with the existing Node runtime. No Python, keys, backend,
model download or installed Node is needed by a released user. Its artifact is
6,115 bytes with SHA-256
`aa499934b8197fb12c36eec2b367c523d5a6da77b439ab58dc4b30bb46ea3513`.
One supervised worker per investigation uses no inherited environment/credentials,
32MiB old/8MiB young heap limits and 4MiB stack. Decisions have a 200ms timeout;
initialization has a one-second watchdog. The worker is terminated on cancellation,
timeout or inference failure. The trusted host alone selects the model path.

Inputs/results stay in memory. No selected repository becomes a training dataset.
No external explanation request is triggered by ranking. OpenAI/Groq still require
the existing inspectable payload and one-use explicit approval.

## Dataset, results and reproducibility

[Model card](../artifacts/laya-nav-1/MODEL-CARD.md),
[epoch trace/configuration](../artifacts/laya-nav-1/training.json),
[all held-out results](../artifacts/laya-nav-1/report.json).
Generator and trainer are local `scripts/laya-dataset.ts` and
`scripts/laya-training.ts`. Only generated, statically parsed synthetic TS sources
are used; source trees are deleted after parsing. 100 repositories / 200 tasks:
60/120 train, 20/40 development, 20/40 held-out, with separate repository IDs,
tasks, topic vocabularies and named topology variants. Shared synthetic motifs
are disclosed; this does not establish real-repository product benefit.
Four opaque held-out tasks stay in metric denominators and use fallback.
The checkpoint is selected by development loss, never held-out results.

| Ranker | Recall@4 | MRR | Path efficiency, misses zero | Nodes inspected |
| --- | --- | --- | --- | --- |
| Deterministic | 0 | 0 | 0 | 4 |
| Lexical control | 0.775 | 0.26875 | 0.5375 | 4 |
| Laya | 0.775 | 0.38125 | 0.7625 | 4 |

Laya reaches 31/40 targets; six supported tasks fail within budget and four opaque
goals are marked unsupported (one happens to reach its target). These cases remain
in all reported denominators. The narrow four-node budget favors prioritization over breadth-first inspection.
At K=64 all three reach every labeled target: MRR is approximately 0.05893 baseline,
0.29598 lexical, 0.40835 Laya. These larger-budget values are in the report; they
do not imply all real dependencies are parsed. At K=4 technical fallback was 0%
and outside-domain/overall fallback was 15/160 decisions (9.375%). At larger
budgets outside-domain fallback increases after matching branches are exhausted;
the report includes it rather than dropping those decisions.

Warm 200-candidate inference: p95 8.13ms round-trip, 5.66ms compute, cold 103.53ms;
about 25.1MiB incremental RSS and 14.0MiB peak worker heap. Hardware/runtime-specific
measurements, not universal limits. Graph/Impact byte invariance was 100%.
Synthetic activation gates passed; real developer value remains a pilot question.

Run these from PowerShell in the checkout to reproduce or inspect the evidence:

```powershell
Set-Location -LiteralPath 'D:\Repositorios Github\cartograph'
pnpm laya:reproduce
Get-Content -LiteralPath '.\artifacts\laya-nav-1\training.json'
Get-Content -LiteralPath '.\artifacts\laya-nav-1\report.json'
pnpm laya:benchmark '.\lib\laya\laya-nav-1.json'
```

`laya:reproduce` rebuilds the synthetic corpus in temporary directories, retrains
with frozen seeds/configuration and verifies the dataset, weight and training-trace
hashes. It changes neither production weights nor qualification. Node 24.19.0
Windows x64 is the currently verified bitwise environment. Development commands
`pnpm laya:train` and `pnpm laya:qualify` regenerate ignored research outputs and
then export a pinned artifact/report after applying the fixed gates; ordinary
users and app startup never run them. Do not tune against the frozen held-out set.

## Manual acceptance — setup and offline launch

These are user-run checks, not completed by the automated tests. You may also use
this Cartograph checkout as the real-repository test. No cloud configuration,
Clerk/Supabase account or BYOK provider is required.

1. Close other Codebase Intelligence windows. From PowerShell:

   ```powershell
   Set-Location -LiteralPath 'D:\Repositorios Github\cartograph'
   $pilotRoot = Join-Path $env:TEMP ('laya-manual-' + [guid]::NewGuid().ToString('N'))
   New-Item -ItemType Directory -Path $pilotRoot | Out-Null
   New-Item -ItemType Directory -Path (Join-Path $pilotRoot 'z-authentication') | Out-Null
   Set-Content -LiteralPath (Join-Path $pilotRoot 'entry.ts') -Value 'import "./a-noise"; import "./z-authentication/index";'
   Set-Content -LiteralPath (Join-Path $pilotRoot 'a-noise.ts') -Value 'import "./noise"; export const noiseEntry = 1;'
   Set-Content -LiteralPath (Join-Path $pilotRoot 'noise.ts') -Value 'export const noise = 1;'
   Set-Content -LiteralPath (Join-Path $pilotRoot 'z-authentication/index.ts') -Value 'import "./service"; import "./service.test";'
   Set-Content -LiteralPath (Join-Path $pilotRoot 'z-authentication/service.ts') -Value 'export function authenticate() { return true; }'
   Set-Content -LiteralPath (Join-Path $pilotRoot 'z-authentication/service.test.ts') -Value 'import "./service"; export const testMarker = 1;'
   $pilotRoot
   ```

   Copy the printed directory for the native folder picker. The application only
   statically parses these fixtures; no test/source code should be executed.

2. For an installed-package test, run the freshly rebuilt MSI or NSIS installer
   from `src-tauri\target\release\bundle\msi` / `bundle\nsis`, launch from Start,
   then disable networking. For a checkout test, run `pnpm start`, wait for its
   build/native window, then disable networking. Build tools may require network
   during development preparation; inference/repository operation must not.
   Do not install both MSI and NSIS simultaneously; either installer is enough
   for the workflow test. Installer execution belongs to the user.
3. Select the printed fixture directory, analyze and wait for the graph and
   watcher-ready state. **PASS:** six files and six import relationships, no
   remote account/provider/model prompt. **FAIL:** network-required analysis,
   model-download request, blank/crashed window or missing verified fixture facts.

## Manual acceptance — ranking, witnesses and controls

1. Open **Investigations / Ask**. In **Local Laya · prioritize verified dependencies**,
   enter goal `Locate authentication implementation`, start `entry.ts`, depth 8,
   node budget 2, ranker **Deterministic baseline**. Click **Investigate locally**.
   **PASS:** `a-noise.ts`, then `z-authentication/index.ts`; fallback `none`.
   The service is beyond this tiny inspection budget, not absent from the graph.
2. Switch only the ranker to **Laya local** and rerun. **PASS:**
   `z-authentication/index.ts`, then `z-authentication/service.ts`; model
   `laya-nav-1`, synthetic qualification passed, fallback `none`. **FAIL:** unknown
   nodes/edges, no visible mode/fallback status, or a provider request.
3. Expand both result rows. Follow each witness and **Inspect witness source**.
   Selecting a file switches back to the map, so reopen **Investigations / Ask**
   afterward. **PASS:** all arrows correspond to imports at line 1 in the source,
   with existing extractor evidence; selecting a row navigates to the actual file.
   Current source appears only through the existing hash check. **FAIL:** invented
   calls/relationships, missing endpoints or current code silently labeled as
   evidence for a different stored version.
4. Change goal to `quuxword`, rerun Laya. **PASS:** `outside_domain` visibly listed
   and the same deterministic order as step 1. Change budget to 1: exactly one
   node; depth 0: zero nodes. Bounds/remaining frontier must be disclosed.
5. Test cancellation on this checkout or a larger supported repository: choose
   an exact file with outgoing dependencies, budget 50, depth 16; start Laya and
   immediately click **Cancel local ranking** while the pending state is visible.
   Very small runs may finish before you click. **PASS:** cancelled status/partial
   bounded result, or completed result if it already finished; rerun/baseline/
   deterministic Ask still work. No application shutdown or provider cancellation.
   Automated tests separately enforce timeout and actual worker termination.

## Manual acceptance — freshness and structural independence

1. Record **Change impact / dependents** for `z-authentication/service.ts` with
   depth 64 / budget 200 in the existing deterministic Ask controls. Expected
   dependents: `z-authentication/index.ts`, `z-authentication/service.test.ts`,
   `entry.ts`. Compare this answer, graph/category/folding counts and routes before
   and after several Laya/baseline runs. **PASS:** identical structural facts and
   witness validity. The fixture has no routes; use this checkout for route/static
   symbol navigation regression. **FAIL:** ranking removes/adds facts or globally
   reorders/truncates exhaustive Impact according to model scores.
2. Pause watching. Edit the fixture's `service.ts` in your editor. Inspect its
   source without refresh. **PASS:** stale/unavailable evidence, not new source
   represented as old graph evidence. Resume/full refresh; the new snapshot must
   reset old ranking results. **FAIL:** results mix generations or stale source
   is silently current. With watching enabled, try refreshing while ranking:
   obsolete results must clear or give bounded retry/recovery, never attach to the
   new graph. Timing races may be too fast manually; automated checks cover them.
3. With networking disabled, close/reopen a stored real repository and run Laya
   and deterministic investigations. **PASS:** no key/internet/model-download
   requirement, source freshness and coverage limits remain visible.
4. If testing optional Groq/OpenAI too, re-enable network only for that separate
   test. Use the existing file/structural explanation action. **PASS:** payload
   preview/provider endpoint/explicit approval remain mandatory. Laya itself
   creates no provider request and works again after credentials are removed.

## Manual acceptance — missing/corrupt bundled model and recovery

Use the standalone release executable for this fault test so `pnpm start` does
not automatically repair the staged files before the test. Close the app first.
Run from the repository root; these commands target only the copied release model,
not the source artifact or your repositories:

```powershell
$releaseModel = Join-Path (Get-Location).Path 'src-tauri\target\release\engine\lib\laya\laya-nav-1.json'
$modelBackup = Join-Path $env:TEMP ('laya-model-backup-' + [guid]::NewGuid().ToString('N') + '.json')
Copy-Item -LiteralPath $releaseModel -Destination $modelBackup
Remove-Item -LiteralPath $releaseModel
& '.\src-tauri\target\release\codebase-intelligence-desktop.exe'
```

Reopen a repository and use Laya. **PASS:** `model_unavailable` and deterministic
results; the graph/Impact still work. Close the app. For corruption:

```powershell
Set-Content -LiteralPath $releaseModel -Value '{"corrupt":true}'
& '.\src-tauri\target\release\codebase-intelligence-desktop.exe'
```

**PASS:** `model_corrupt` and deterministic results, no uncaught error or download.
Close the app and always restore before finishing:

```powershell
Copy-Item -LiteralPath $modelBackup -Destination $releaseModel -Force
Get-FileHash -LiteralPath $releaseModel -Algorithm SHA256
Remove-Item -LiteralPath $modelBackup
& '.\src-tauri\target\release\codebase-intelligence-desktop.exe'
```

**PASS:** hash matches the pinned value above and Laya works without restarting
analysis. A new investigation creates a fresh worker. **FAIL:** no visible reason,
structural features disabled, or restored valid artifact cannot recover.

## Automated verification record

Windows x64 / Node 24.19.0:

- `pnpm exec next typegen`, `pnpm exec tsc --noEmit`, `pnpm lint` — PASS.
- `pnpm test` — PASS, 87/87: existing phases and 10 Phase 09 tests. Analytic
  gradient/finite differences, reproducible small training, held-out exclusion,
  actual worker inference/termination, strict shape/pinning, model failure and
  malformed candidate protection, current snapshot identity, witnesses and
  graph/Impact byte invariance. The documented fixture's expected order is tested
  at the engine level; this does not complete UI acceptance.
- `node scripts/train-laya.ts`, `node scripts/qualify-laya.ts`,
  `node scripts/reproduce-laya.ts`, `node scripts/benchmark-laya.ts` — PASS.
  Frozen synthetic gates all passed; full regeneration reproduced dataset,
  weights and trace hashes exactly, with no held-out fitting or external requests.
- `pnpm desktop:prepare` — PASS: bundled engine/Node and `pnpm build` static
  frontend, `pnpm desktop:verify-assets` (11 fonts, no cloud credential markers).
- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`,
  `cargo check --manifest-path src-tauri/Cargo.toml --locked`,
  `cargo test --manifest-path src-tauri/Cargo.toml --locked` — PASS, 26/26 Rust
  tests, including native ranking allowlists and existing credential/provider gates.
- `node scripts/parse.ts . --out <temporary-output>`, `node scripts/map-counts.ts
  <temporary-output>`, `node scripts/insights.ts <temporary-output> lib/parser/index.ts`,
  `node scripts/engine.ts . --out <temporary-output>` — PASS, 114 parsed files,
  317 verified imports, no dangling folded/open endpoints or false cycle witnesses.
  Temporary repository-derived output/logs were deleted.
- `pnpm desktop:smoke`, `pnpm desktop:smoke --release` — PASS: actual packaged
  worker/model, pin checks, baseline/outside-domain/cancel protocol, missing/corrupt
  artifact fallback under cleared environment/no PATH, existing watcher/SQLite/
  static calls/Impact/evidence/cache boundaries. Training corpus is not bundled.
- Source/staged/release hashes match for artifact, manifest, all inference files,
  controller, protocol and sidecar. `git diff --check` — PASS.

- `pnpm desktop:build` — PASS: rebuilt Windows x64 MSI (245.23MiB) and NSIS
  (234.13MiB), including the runtime/model and offline WebView installer.

No manual acceptance,
macOS/Linux qualification or pilot trial is implied by these automated checks.
