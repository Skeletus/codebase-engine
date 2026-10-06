# Phase 08 — local ranking evaluation acceptance

This phase supplies a replaceable local ranker/controller and a CLI evaluation
harness. There is no Laya artifact, model runtime, training, model download,
repository plugin loading, or production ranking switch. Desktop investigations,
impact, static call traces and BYOK remain unchanged. Ranking is disabled in those
workflows; the new bounded runner is a separate consumer of the canonical graph.
No new dependencies are required. The user accepted Phase 08 Windows manual acceptance.
The statements above describe the Phase 08 delivery; trained local desktop
inference is subsequently introduced by [Phase 09](phase-09-laya.md).
macOS/Linux package qualification and formal pilot trials remain outstanding.

## Boundary and limits

`lib/engine/ranking.ts` generates verified outgoing file-dependency candidates,
with exact witness edge IDs, depth and fan counts. Root is not counted through
cycles. The ranker receives goal, full-snapshot SHA-256 identity, decision-context
identity, and at most 200 candidates. Output must contain exactly one finite score
per candidate and matching identities; unknown/duplicate/missing IDs, extra fields,
stale identities and failures cause visible deterministic fallback. Scores never
become confidence, edges, feature membership or impact filtering.

Baseline: depth ascending, then code-point ID ascending. Equal scores use that
same baseline tie order. Candidate discovery retains the first verified witness;
ranked traversal can therefore have a longer witness than shortest reachability.
Budget is 1–200 selected nodes excluding the start; depth is 0–64. Frontier
discovery stops at 1,000 non-root nodes and reports truncation. A deterministic
200-candidate window limits each ranking request; candidates outside the window
remain available. Exhaustive structural queries are independent of these limits.
Timeout is 1–1,000 ms per decision, default harness 50 ms; worst-case adapter wait
is budget × timeout. Abort cancels the controller and signals the adapter.

Adapters are trusted local asynchronous code; these synthetic adapters never
execute repository code. Cooperative abort/timeouts cannot preempt a synchronous
adapter that blocks Node's event loop. A future real inference adapter must use
interruptible isolated execution and measured resource limits under its own spec;
this phase does not introduce arbitrary executable or plugin loading. Inputs are
deep-frozen copies, output cannot mutate facts, and snapshot mutation during an
await rejects the run as stale. No network API is part of the ranker contract.

## Metrics and records

Records use a **separate local SQLite evaluation database**, explicitly selected
by the operator. They are repository-derived, including goal, full canonical
snapshot (with its local root), candidate features/sets, ordered selected steps,
witnesses, judgments, split, budgets, failures and results. They contain no source
copies, ASTs, provider keys or telemetry events. Do not type secrets in goals.
`--consent-local-record` is required to persist each case. Running without `--db`
prints ephemeral results only. This is not automatic collection or dataset upload.
Synthetic fixtures are the default, are statically parsed and then deleted.
SQLite uses secure deletion; this does not promise removal from filesystem/OS
backups. Deletion never changes repositories or the desktop intelligence database.

Relevance judgments are explicit known-positive reachable candidate file IDs.
`--complete-judgments` asserts all candidates within the selected depth have been
judged; other candidates are then negatives. Incomplete judgments produce null
recall/RR/path metrics. Unknown, duplicate, root or unreachable positive IDs are
rejected. Empty relevance sets produce null, not perfect scores.

- **Recall@K**: unique relevant selected nodes / all known relevant reachable
  nodes at the specified depth, only when judgments are complete. K is the same
  requested inspection budget for baseline and test adapter. Exhausted graphs may
  select fewer nodes. Truncation is reported, never hidden.
- **Reciprocal rank**: 1 / one-based first relevant selected position; 0 if none
  selected, null if ground truth is unavailable. **MRR** is the mean RR across
  supported cases within one split. `meanReciprocalRank` reports included and
  unsupported counts; do not mix development and held-out cases or omit failures.
- **Inspected nodes**: number of controller-selected nodes, not a claim that a
  human read them. Candidate lists and selected steps are inspectable.
- **Time to evidence**: optional manually measured milliseconds for the supplied
  run, with explicit `success` assessment. Baseline timing is null unless measured
  in its own baseline case. Controller elapsed time is separate, varies on replay,
  and is not developer Time-to-Understanding.
- **Path efficiency**: shortest verified dependency distance to any relevant node
  / selected nodes until the first relevant node. Null without complete ground
  truth or a hit; range 0–1. This measures inspection efficiency, not runtime order.
- **Structural recall**: the harness asserts byte-identical canonical snapshots
  and unchanged deterministic impact before/after ranking (1 for preserved facts).
  It does not measure parser completeness or imply all relevant evidence was
  selected under a budget. Coverage/unresolved facts remain in the saved snapshot.

Assessment defaults to `unsupported`; operators can explicitly record `success`,
`failure` or `unsupported` and time. Synthetic scores are demonstration results,
not model performance claims. Use `--split held-out` for reserved cases; do not
tune rankers on them. No automatic train/test dataset generation exists.
Replay re-evaluates the frozen recorded snapshot; it does not read current files.
Replayed steps, candidates, identities and metric denominators must match, while
elapsed controller time may differ. Treat source witnesses as historical; use the
desktop freshness-aware Evidence view to inspect current source.

## Exact Windows manual acceptance

Use PowerShell. Run every command from:

```powershell
Set-Location 'D:\Repositorios Github\cartograph'
```

No `.env`, provider account, key, cloud access, or repository dependency install
is needed. Disconnect networking for these tests. The harness denies `fetch`.

1. **Baseline and supplied adapter, same case/budget.**

   ```powershell
   pnpm ranking:evaluate synthetic --ranker reverse --budget 1
   pnpm ranking:evaluate synthetic --ranker baseline --budget 1
   ```

   Inspect `baseline.steps`, `supplied.steps`, `decisions.candidates`, `order`,
   `witness`, and both metric summaries. PASS: reverse selects `z.ts`, baseline
   selects `a.ts`; baseline recall/RR are 0, reverse recall/RR/efficiency are 1.
   Witnesses reference actual `entry.ts` imports; `structuralRecall` is 1. Baseline
   adapter yields identical steps on both sides. FAIL: invented edges, hidden
   truncation or unequal budgets. The synthetic fixture is temporary; do not
   try to open its printed root afterward.

2. **Fallback and no model.**

   ```powershell
   pnpm ranking:evaluate synthetic --ranker failure --budget 2 --assessment failure
   pnpm ranking:evaluate synthetic --ranker timeout --budget 2
   pnpm ranking:evaluate synthetic --ranker invalid --budget 2
   ```

   PASS: supplied steps match baseline (`a.ts`, `z.ts`), decisions show respectively
   `ranker_failure`, `timeout`, and `invalid_candidate_count`; all finish locally.
   FAIL: process hangs, provider access, lost structural results or silent fallback.

3. **Consent, inspect, replay, delete.** Choose a new local database filename:

   ```powershell
   $rankingDb = Join-Path $env:LOCALAPPDATA 'cartograph-phase08-manual.sqlite'
   pnpm ranking:evaluate synthetic --ranker reverse --budget 1 --db "$rankingDb"
   ```

   PASS: explicit consent error and no saved record. Then explicitly consent:

   ```powershell
   pnpm ranking:evaluate synthetic --ranker reverse --budget 1 --db "$rankingDb" --consent-local-record
   pnpm ranking:evaluate list --db "$rankingDb"
   $rankingId = 'PASTE-THE-SAVED-UUID-HERE'
   pnpm ranking:evaluate inspect --db "$rankingDb" --id "$rankingId"
  pnpm ranking:evaluate replay --db "$rankingDb" --id "$rankingId"
   pnpm ranking:evaluate summary --db "$rankingDb"
   pnpm ranking:evaluate delete --db "$rankingDb" --id "$rankingId"
   pnpm ranking:evaluate list --db "$rankingDb"
   ```

   PASS: inspect shows consented goals/snapshot/candidates/selected steps/judgments
   and metrics, no raw source; replay matches recorded order/witnesses/identity,
   summary separates development/held-out MRR and includes unsupported/failure
   counts; deletion produces `[]`. FAIL: missing consent gate, source copies, credentials,
   replay changes supported ordering, deleted record remains. This database is
   separate from the application's normal data; delete each saved UUID if reused.

4. **Real repository and unchanged desktop.** Cartograph itself is a valid test
   repository; no install or source execution is performed. Ephemeral example:

   ```powershell
   pnpm ranking:evaluate local --root 'D:\Repositorios Github\cartograph' --start 'lib/engine/index.ts' --goal 'Inspect local analysis dependencies' --budget 3 --ranker reverse
   pnpm ranking:evaluate local --root 'D:\Repositorios Github\cartograph' --start 'lib/engine/index.ts' --goal 'Inspect local analysis dependencies' --budget 3 --ranker baseline
   pnpm start
   ```

   Without relevance judgments, quality metrics are null. Inspect witness IDs
   against the actual imports (not a recovered execution flow). In desktop, open
   this root, check Map selection/folding, Routes, Details/Evidence, impact and
   static traces offline. PASS: independent of test ranker settings, all previously
   accepted structural workflows work; no model/key is required. FAIL: ranking
   changes impact, any graph relationship, source freshness or offline behavior.
   Close the window when finished. No UI ranking toggle is added in this phase.

For an explicitly consented real case, append `--relevant 'exact/path.ts'`
(comma-separated positives), `--complete-judgments` only after judging all reachable
candidates, `--assessment success --time-ms 1234` using your measured time, and
`--db "$rankingDb" --consent-local-record`. Inspect and delete it as in step 3.

## Future model prerequisites (not implemented)

1. Explicit dataset consent, exclusion and revocation/deletion protocol; diverse
   representative goals with positive/negative judgments and failures; keep all
   repository-derived records local unless separately authorized by a new policy.
2. Establish deterministic baselines and repository/task-separated held-out sets;
   count failure/unsupported cases, equivalent budgets and coverage limits.
3. Specify training objective and leakage controls separately. No training now.
4. Verify artifact provenance, license, checksums, supported features, validation
   results and measured usefulness before authorizing integration.
5. Specify export format/inference technology, interruptible isolation, resource
   budgets, offline packaging, native process supervision and fallback behavior.
6. Measure Recall@K/MRR, nodes/time/path efficiency alongside structural invariance,
   latency/RSS on Windows/macOS/Linux and model-free startup. Require an artifact-
   backed subsequent specification; no implied pretrained weights or auto-download.

## Automated verification

Windows x64 verification:

- `pnpm exec next typegen`, `pnpm exec tsc --noEmit`, `pnpm lint` — PASS.
- `pnpm test` — PASS, 77/77 including 11 Phase 08 tests: ranking validation,
  timeout/cancellation, replay/consent/deletion, held-out MRR/failure separation,
  and byte-identical structural snapshots/impact under denied fetch egress.
- `pnpm desktop:prepare` — PASS: bundled Node 24.19.0, `pnpm build` static
  frontend and `pnpm desktop:verify-assets` (11 offline fonts, no cloud markers).
- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`,
  `cargo check --manifest-path src-tauri/Cargo.toml --locked`,
  `cargo test --manifest-path src-tauri/Cargo.toml --locked` — PASS, 25 Rust tests.
- `pnpm desktop:smoke`, `pnpm desktop:smoke --release` — PASS, including packaged
  synthetic ranking/failure fallback without PATH/cloud configuration, alongside
  existing watcher, persistence, evidence, impact and explanation boundaries.
- `node scripts/parse.ts . --out <temporary-output>`, `node scripts/map-counts.ts
  <temporary-output>`, `node scripts/insights.ts <temporary-output> lib/parser/index.ts`,
  `node scripts/engine.ts . --out <temporary-output>` — PASS, 99 parsed files,
  260 verified import relationships, no dangling folded/open endpoints.
- Synthetic reverse evaluation and a real checkout baseline investigation — PASS.
  Repository-derived temporary verification output was deleted.
- `git diff --check` — PASS.
- `pnpm desktop:build`, followed by final `pnpm desktop:prepare` and
  `pnpm exec tauri bundle` after the engine-only metric optimization — PASS.
  Windows x64 MSI/NSIS were rebuilt; Phase 08 source/staged/release engine hashes
  match. Native/frontend behavior is unchanged.

Manual UI acceptance belongs to the user. No macOS/Linux or formal pilot
qualification is claimed by these Windows checks. No model or new dependency was
installed; no commits/pushes or functionality beyond Phase 08 were introduced.
