# Phase 09 — Trained local Laya navigation and desktop delivery

## Objective

Train, evaluate, package and integrate a small local goal-conditioned candidate
ranker using Phase 08, with activation conditional on measured release gates.

## Why this phase exists

Phase 08 is accepted on Windows. The user authorizes this complete implementation
block, including local training. No research-only pause or assumed artifact is needed.

## Starting state

Verified TS/JS file and symbol graphs, deterministic investigations/Impact,
Node/Tauri packaging, optional direct BYOK and Phase 08 ranking/evaluation.
macOS/Linux qualification and formal pilot trials remain outstanding.

## Scope

One reproducible synthetic dataset and training pipeline; a small pairwise neural
ranker; artifact, model card and evaluation report; isolated Node inference;
bounded desktop evidence prioritization, cancellation/fallback and Windows bundles.

## Required behavior

- Synthetic, statically parsed repositories only. No user repositories, external
  corpora or provider-generated examples are collected. Publish generator, seeds,
  provenance and content hashes. Split by repository, topology family, task vocabulary
  and goal phrasing; freeze held-out cases before training. Fit only training pairs;
  select checkpoints using development loss only, never held-out metrics.
- Train a 16-feature → 16 tanh → 1 linear scoring network from seeded initialization
  with pairwise logistic loss. Features are bounded goal/path overlap and current
  candidate-frontier topology; no word-ID lookup, source, credential or cloud input.
  This is an original Laya-inspired System-1 navigation model, not a reproduction
  of unspecified research weights or a pretrained language model.
- Evaluate deterministic, lexical-heuristic and learned traversal at equal budgets
  using Phase 08 Recall@K, RR/MRR, path efficiency and selected nodes. Also report
  steps until target evidence, latency, cold startup, RSS/heap, all fallback/unsupported
  counts, byte-identical snapshots and unchanged exhaustive Impact. Include hard
  opaque-name cases; do not omit failures or infer human Time-to-Understanding.
- Freeze activation gates before training: at the dataset's four-node primary budget, held-out Recall@K and MRR each improve
  by >= 0.10 absolute versus deterministic; path efficiency must not regress;
  learned Recall/MRR must be within 0.02 of or better than lexical control. Structural
  invariance 100%; natural technical fallback <= 1%; 200-candidate warm inference
  p95 <= 50ms, cold initialization <= 1000ms and incremental process RSS <= 128MiB.
  Report outside-domain fallback separately and in overall rates. These are narrow
  synthetic qualification gates, not a claim of human/product benefit.
- Preserve trained artifacts/reports if gates fail. Integrate the adapter with
  activation disabled and visible deterministic fallback; never lower gates.
- Load only a bundled, pinned SHA-256 artifact with strict finite shape validation.
  No executable model files or model downloads. Inference runs in a supervised,
  bounded worker, with actual termination on cancellation/timeout/failure.
- Desktop prioritization takes an exact known file, local goal, depth and inspection
  budget. Laya scores verified outgoing candidates through the Phase 08 controller.
  Show evidence witnesses, omissions, model identity and fallback causes. Allow
  deterministic mode and cancellation without disabling other investigations.
  Reject obsolete UI snapshots; never combine graph generations.
- Optional BYOK remains separate and retains exact preview/one-use approval. Ranking
  must not itself request explanations or export goals/features/datasets.

## Architectural constraints

The parser and graph facts/Impact never depend on the model. Ranker output is
scores only. Use the existing bundled Node runtime and built-ins; no new packages,
Python, training runtime or external service is required by a released user.
Desktop model paths are application-owned, never supplied by a repository or renderer.

## Data/privacy constraints

All training/inference/evaluation stays local. Synthetic corpus consent follows
this explicit user request; ordinary selected repositories are never training data.
Goals and transient ranked results are not telemetry or automatically persisted.
No source copies, secrets or credentials become inference features.

## Explicit non-goals

MCP/IDE/agent integration, new providers/languages, graph-edge creation, runtime
flow claims, pretrained semantic embeddings, automatic learning from customers,
general-language reasoning, cloud analytics or claiming outstanding platform/pilot gates.

## Dependencies

Accepted Windows Phases 01–08. Training/evaluation must produce an artifact-backed
record before production activation; implementation proceeds directly within this block.

Artifact-backed activation record: `laya-nav-1`, SHA-256
`aa499934b8197fb12c36eec2b367c523d5a6da77b439ab58dc4b30bb46ea3513`,
dataset `0d87cb1a41859c869f4cbb0a88275914f3407b40943ba19fa5ff1277e6c400e8`.
The frozen model passed all above synthetic Windows x64 gates. Details and
per-task failures/unsupported cases are in `artifacts/laya-nav-1/report.json`.
This authorizes the pinned adapter only; it does not qualify unseen real-repository
benefit, macOS/Linux packaging or outstanding pilot trials.

## Migration/removal work

Retain deterministic defaults and exact structural operations. Add a separate
ranked evidence workflow; preserve Phase 08 synthetic test adapters and records.

## Verification

Reproduce dataset/model hashes and training trace. Compare untouched held-out data
against both baselines and record all cases. Test gradient correctness, strict artifact
validation/pinning, inference, malformed outputs, actual worker timeout/cancellation,
stale identities, budget/resource limits, missing/corrupt/unqualified model fallback,
denied egress and structural invariance. Run Next typegen, strict typecheck, lint,
all phase tests, parser/engine scripts, build/assets, Rust format/check/tests, staged
and release smoke, Windows MSI/NSIS build and final packaged-artifact hash checks.

## Manual acceptance check

Run the documented Windows fixture and a real repository offline; compare equal-budget
deterministic/Laya ordering, inspect every witness and source freshness, cancel,
switch modes, simulate missing/corrupt artifact with backup/restore, and verify
Impact/graph/routes/static traces/BYOK approval remain independent.

## Completion criteria

Reproducible training and honest held-out report, packaged isolated inference,
guarded desktop adapter and passing automated checks; Windows manual acceptance
may remain with the user. If qualification fails, activation stays disabled with
the exact reasons recorded. No model-success or global release qualification claim
is justified by successful training alone.
